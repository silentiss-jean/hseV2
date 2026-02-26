"""HSE_DOC: custom_components/home_suivi_elec/docs/persistent_catalogue.md
HSE_MAINTENANCE: If you change reference_total semantics, update the doc above.
"""

from __future__ import annotations

from homeassistant.components.http import HomeAssistantView

from ...const import API_PREFIX, DOMAIN
from ...time_utils import utc_now_iso


class CatalogueReferenceTotalView(HomeAssistantView):
    """Set or clear the "reference total" (main meter) item in the persistent catalogue."""

    url = f"{API_PREFIX}/catalogue/reference_total"
    name = "home_suivi_elec:unified:catalogue_reference_total"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        domain_data = hass.data.get(DOMAIN, {})
        cat = domain_data.get("catalogue")
        if not cat:
            return self.json({"ok": False, "error": "catalogue:not_ready"}, status_code=503)

        body = await request.json() if request.can_read_body else {}
        entity_id = (body or {}).get("entity_id")
        if entity_id == "":
            entity_id = None

        items = cat.get("items") or {}

        # Resolve target first to avoid clearing existing reference on invalid input.
        target_item_id = None
        target_item = None
        if entity_id is not None:
            for item_id, item in (items.items() or []):
                if not isinstance(item, dict):
                    continue
                src = item.get("source") or {}
                if src.get("entity_id") == entity_id:
                    target_item_id = item_id
                    target_item = item
                    break
            if not target_item_id:
                return self.json(
                    {"ok": False, "error": "entity:not_in_catalogue", "entity_id": entity_id},
                    status_code=404,
                )

        cleared = 0
        for item_id, item in (items.items() or []):
            if not isinstance(item, dict):
                continue
            enr = item.get("enrichment")
            if not isinstance(enr, dict):
                continue
            if enr.get("is_reference_total") is True and item_id != target_item_id:
                enr["is_reference_total"] = False
                cleared += 1

        if target_item is not None:
            enr = target_item.setdefault("enrichment", {})
            enr["is_reference_total"] = True
            # Invariant: a reference_total must never be part of measured totals.
            enr["include"] = False

        cat["generated_at"] = utc_now_iso()

        saver = domain_data.get("catalogue_save")
        if saver:
            await saver()

        return self.json(
            {
                "ok": True,
                "reference_entity_id": entity_id,
                "reference_item_id": target_item_id,
                "cleared_others": cleared,
            }
        )
