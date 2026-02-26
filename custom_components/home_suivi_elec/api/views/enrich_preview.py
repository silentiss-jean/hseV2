from __future__ import annotations

import re
from datetime import datetime, timezone

from homeassistant.components.http import HomeAssistantView

from ...const import API_PREFIX


_SUFFIX_STRIP = (
    "_consommation_actuelle",
    "_puissance",
    "_power",
    "_w",
    "_watts",
)


def derive_base_slug(power_entity_id: str) -> str:
    """Derive base sensor slug from a power sensor entity_id.

    Example:
      sensor.chambre_alex_pc_consommation_actuelle -> chambre_alex_pc

    Raises ValueError if entity_id invalid or base cannot be derived.
    """
    if not isinstance(power_entity_id, str) or "." not in power_entity_id:
        raise ValueError("invalid_entity_id")

    domain, obj = power_entity_id.split(".", 1)
    if domain != "sensor" or not obj:
        raise ValueError("invalid_entity_id")

    base = obj
    for suf in _SUFFIX_STRIP:
        if base.endswith(suf):
            base = base[: -len(suf)]
            break

    base = re.sub(r"_+$", "", base)
    if not base:
        raise ValueError("cannot_derive_base")

    return base


class EnrichPreviewView(HomeAssistantView):
    url = f"{API_PREFIX}/enrich/preview"
    name = "home_suivi_elec:unified:enrich_preview"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]

        user = request.get("hass_user")
        if not user or not getattr(user, "is_admin", False):
            return self.json({"error": "admin_required"}, status_code=403)

        body = await request.json() if request.can_read_body else {}
        power_entity_id = (body or {}).get("power_entity_id") or "sensor.chambre_alex_pc_consommation_actuelle"

        decisions_required: list[dict] = []
        errors: list[dict] = []

        try:
            base = derive_base_slug(power_entity_id)
        except Exception as exc:  # noqa: BLE001
            base = None
            decisions_required.append(
                {
                    "code": "base_slug",
                    "reason": str(exc),
                    "power_entity_id": power_entity_id,
                }
            )

        to_create = []
        if base:
            to_create = [
                f"sensor.{base}_kwh_total",
                f"sensor.{base}_kwh_day",
                f"sensor.{base}_kwh_week",
                f"sensor.{base}_kwh_month",
                f"sensor.{base}_kwh_year",
            ]

        return self.json(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "input": {"power_entity_id": power_entity_id},
                "summary": {
                    "to_create_count": len(to_create),
                    "already_ok_count": 0,
                    "errors_count": len(errors),
                    "decisions_required_count": len(decisions_required),
                },
                "to_create": to_create,
                "decisions_required": decisions_required,
                "errors": errors,
            }
        )
