from __future__ import annotations

from datetime import datetime, timezone

from homeassistant.components.http import HomeAssistantView

from ...const import API_PREFIX
from .enrich_preview import derive_base_slug


def _admin_only(request) -> bool:
    user = request.get("hass_user")
    return bool(user and getattr(user, "is_admin", False))


class EnrichApplyView(HomeAssistantView):
    url = f"{API_PREFIX}/enrich/apply"
    name = "home_suivi_elec:unified:enrich_apply"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        _ = hass

        if not _admin_only(request):
            return self.json({"error": "admin_required"}, status_code=403)

        body = await request.json() if request.can_read_body else {}
        power_entity_id = (body or {}).get("power_entity_id") or "sensor.chambre_alex_pc_consommation_actuelle"

        created: list[dict] = []
        skipped: list[dict] = []
        errors: list[dict] = []
        decisions_required: list[dict] = []

        try:
            base = derive_base_slug(power_entity_id)
        except Exception as exc:  # noqa: BLE001
            decisions_required.append({"code": "base_slug", "reason": str(exc), "power_entity_id": power_entity_id})
            return self.json(
                {
                    "generated_at": datetime.now(timezone.utc).isoformat(),
                    "input": {"power_entity_id": power_entity_id},
                    "summary": {
                        "created_count": 0,
                        "skipped_count": 0,
                        "errors_count": 0,
                        "decisions_required_count": len(decisions_required),
                    },
                    "created": created,
                    "skipped": skipped,
                    "errors": errors,
                    "decisions_required": decisions_required,
                },
                status_code=409,
            )

        # V1 stub: helper creation is implemented in next commit (config entry flow).
        entity_ids = [
            f"sensor.{base}_kwh_total",
            f"sensor.{base}_kwh_day",
            f"sensor.{base}_kwh_week",
            f"sensor.{base}_kwh_month",
            f"sensor.{base}_kwh_year",
        ]
        for eid in entity_ids:
            skipped.append({"entity_id": eid, "reason": "not_implemented_yet"})

        return self.json(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "input": {"power_entity_id": power_entity_id},
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
            }
        )
