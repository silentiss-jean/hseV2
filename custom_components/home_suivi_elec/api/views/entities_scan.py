from __future__ import annotations

from datetime import datetime, timezone

from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers import entity_registry as er

from ...const import API_PREFIX, DOMAIN


def _q_bool(request, key: str, default: bool) -> bool:
    raw = request.query.get(key)
    if raw is None:
        return default
    raw = str(raw).strip().lower()
    return raw in ("1", "true", "yes", "y", "on")


def _detect_kind(device_class: str | None, unit: str | None) -> str | None:
    if device_class == "energy" or unit in ("kWh", "Wh"):
        return "energy"
    if device_class == "power" or unit in ("W", "kW"):
        return "power"
    return None


def _status_from_registry(reg_entry: er.RegistryEntry | None) -> tuple[str, str | None]:
    """Return (status, status_reason) for UI.

    status:
      - ok
      - disabled
      - not_provided
      - unknown

    status_reason is a short machine-ish string.
    """

    if reg_entry is None:
        return ("unknown", "entity_registry:missing")

    # Disabled (user/integration/device/etc.)
    if reg_entry.disabled_by is not None:
        disabled_by_value = getattr(reg_entry.disabled_by, "value", str(reg_entry.disabled_by))
        return ("disabled", f"entity_registry:disabled_by:{disabled_by_value}")

    # "Not provided" happens when entity remains in registry but the integration no longer provides it.
    ent_status = getattr(reg_entry, "entity_status", None)
    if ent_status is not None:
        ent_status_value = getattr(ent_status, "value", str(ent_status))
        if ent_status_value == "not_provided":
            return ("not_provided", "entity_registry:not_provided")

    return ("ok", None)


class EntitiesScanView(HomeAssistantView):
    url = f"{API_PREFIX}/entities/scan"
    name = "home_suivi_elec:unified:entities_scan"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]

        include_disabled = _q_bool(request, "include_disabled", False)
        exclude_hse = _q_bool(request, "exclude_hse", True)

        ent_reg = er.async_get(hass)
        reg_by_entity_id = ent_reg.entities  # map entity_id -> registry entry

        candidates: list[dict] = []
        integration_counts: dict[str, dict[str, int]] = {}

        for st in hass.states.async_all():
            entity_id = st.entity_id
            domain = entity_id.split(".", 1)[0]
            if domain != "sensor":
                continue

            attrs = st.attributes or {}
            unit = attrs.get("unit_of_measurement")
            device_class = attrs.get("device_class")
            state_class = attrs.get("state_class")
            friendly_name = attrs.get("friendly_name") or entity_id

            kind = _detect_kind(device_class, unit)
            if kind is None:
                continue

            reg_entry = reg_by_entity_id.get(entity_id)
            platform = reg_entry.platform if reg_entry else None
            disabled_by = reg_entry.disabled_by if reg_entry else None

            status, status_reason = _status_from_registry(reg_entry)

            if not include_disabled and disabled_by is not None:
                continue

            is_hse = (platform == DOMAIN) or entity_id.startswith("sensor.hse_")
            if exclude_hse and is_hse:
                continue

            disabled_by_value = None
            if disabled_by is not None:
                disabled_by_value = getattr(disabled_by, "value", str(disabled_by))

            integration_domain = platform or "unknown"

            ha_state = st.state
            ha_restored = bool(attrs.get("restored", False))

            candidates.append(
                {
                    "entity_id": entity_id,
                    "kind": kind,
                    "unit": unit,
                    "device_class": device_class,
                    "state_class": state_class,
                    "integration_domain": integration_domain,  # = registry_entry.platform
                    "platform": platform,
                    "config_entry_id": reg_entry.config_entry_id if reg_entry else None,
                    "device_id": reg_entry.device_id if reg_entry else None,
                    "area_id": reg_entry.area_id if reg_entry else None,
                    "name": friendly_name,
                    "unique_id": reg_entry.unique_id if reg_entry else None,
                    "disabled_by": disabled_by_value,
                    "status": status,
                    "status_reason": status_reason,
                    "ha_state": ha_state,
                    "ha_restored": ha_restored,
                    "source": {"is_hse": is_hse},
                }
            )

            integration_counts.setdefault(integration_domain, {"power": 0, "energy": 0})
            integration_counts[integration_domain][kind] += 1

        integrations = [
            {
                "integration_domain": integ,
                "power_count": counts["power"],
                "energy_count": counts["energy"],
                "total": counts["power"] + counts["energy"],
            }
            for integ, counts in integration_counts.items()
        ]
        integrations.sort(key=lambda x: x["total"], reverse=True)

        return self.json(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "rules": {
                    "include_disabled": include_disabled,
                    "exclude_hse": exclude_hse,
                },
                "integrations": integrations,
                "candidates": candidates,
            }
        )
