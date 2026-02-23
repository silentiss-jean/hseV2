from __future__ import annotations

from datetime import datetime, timezone

from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers import entity_registry as er

from ...const import API_PREFIX, DOMAIN
from ...scan_engine import detect_kind, status_from_registry


def _q_bool(request, key: str, default: bool) -> bool:
    raw = request.query.get(key)
    if raw is None:
        return default
    raw = str(raw).strip().lower()
    return raw in ("1", "true", "yes", "y", "on")


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

            kind = detect_kind(device_class, unit)
            if kind is None:
                continue

            reg_entry = reg_by_entity_id.get(entity_id)
            platform = reg_entry.platform if reg_entry else None
            disabled_by = reg_entry.disabled_by if reg_entry else None

            ha_state = st.state
            ha_restored = bool(attrs.get("restored", False))

            status, status_reason = status_from_registry(reg_entry, ha_state=ha_state, ha_restored=ha_restored)

            if not include_disabled and disabled_by is not None:
                continue

            is_hse = (platform == DOMAIN) or entity_id.startswith("sensor.hse_")
            if exclude_hse and is_hse:
                continue

            disabled_by_value = None
            if disabled_by is not None:
                disabled_by_value = getattr(disabled_by, "value", str(disabled_by))

            integration_domain = platform or "unknown"

            candidates.append(
                {
                    "entity_id": entity_id,
                    "kind": kind,
                    "unit": unit,
                    "device_class": device_class,
                    "state_class": state_class,
                    "integration_domain": integration_domain,
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
