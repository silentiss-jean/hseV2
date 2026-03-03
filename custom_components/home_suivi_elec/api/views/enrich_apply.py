from __future__ import annotations

from datetime import datetime, timezone

from homeassistant.components.http import HomeAssistantView

from ...const import API_PREFIX, DOMAIN
from ...scan_engine import detect_kind
from .enrich_preview import derive_base_slug
from .migration_export import _mk_integration_sensor_yaml, _mk_utility_meter_yaml, _safe_yaml


def _admin_only(request) -> bool:
    user = request.get("hass_user")
    return bool(user and getattr(user, "is_admin", False))


class EnrichApplyView(HomeAssistantView):
    url = f"{API_PREFIX}/enrich/apply"
    name = "home_suivi_elec:unified:enrich_apply"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]

        if not _admin_only(request):
            return self.json({"error": "admin_required"}, status_code=403)

        body = await request.json() if request.can_read_body else {}
        body = body or {}

        entity_ids = body.get("entity_ids")
        if not isinstance(entity_ids, list) or not entity_ids:
            cat = hass.data.get(DOMAIN, {}).get("catalogue") or {}
            settings = cat.get("settings") if isinstance(cat, dict) else {}
            pricing = settings.get("pricing") if isinstance(settings, dict) else {}
            cids = pricing.get("cost_entity_ids") if isinstance(pricing, dict) else []
            entity_ids = [x for x in cids if isinstance(x, str) and x]

        created: list[dict] = []
        skipped: list[dict] = []
        errors: list[dict] = []
        decisions_required: list[dict] = []

        bases = {}
        for eid in entity_ids:
            st = hass.states.get(eid)
            attrs = st.attributes if st else {}
            unit = (attrs or {}).get("unit_of_measurement")
            device_class = (attrs or {}).get("device_class")
            kind = detect_kind(device_class, unit)
            if kind != "power":
                skipped.append({"entity_id": eid, "reason": f"skip_kind:{kind}"})
                continue

            try:
                base = derive_base_slug(eid)
            except Exception as exc:  # noqa: BLE001
                decisions_required.append({"code": "base_slug", "reason": str(exc), "power_entity_id": eid})
                continue

            info = bases.setdefault(base, {"base": base, "power_entity_id": eid})
            info["power_entity_id"] = eid

        # Export-first "apply": we don't create helpers directly.
        integration_sensors = []
        utility_meter_block = {}

        for base, info in sorted(bases.items()):
            power_eid = info.get("power_entity_id")
            energy_total_eid = f"sensor.{base}_kwh_total"

            if power_eid:
                integration_sensors.append(_mk_integration_sensor_yaml(power_eid, energy_total_eid))
                utility_meter_block.update(_mk_utility_meter_yaml(energy_total_eid, base))
                skipped.append({"entity_id": energy_total_eid, "reason": "export_ready"})

        exports = {
            "option2_templates_riemann_yaml": _safe_yaml({"sensor": integration_sensors}) if integration_sensors else "# Rien à générer\n",
            "option1_utility_meter_yaml": _safe_yaml({"utility_meter": utility_meter_block}) if utility_meter_block else "# Rien à générer\n",
        }

        return self.json(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "input": {"entity_ids": entity_ids},
                "summary": {
                    "created_count": len(created),
                    "skipped_count": len(skipped),
                    "errors_count": len(errors),
                    "decisions_required_count": len(decisions_required),
                },
                "created": created,
                "skipped": skipped,
                "errors": errors,
                "decisions_required": decisions_required,
                "exports": exports,
            }
        )
