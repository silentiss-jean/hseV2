"""HSE_DOC: custom_components/home_suivi_elec/docs/persistent_catalogue.md
HSE_MAINTENANCE: If you change repair issue IDs or severity mapping, update the doc above.
"""

from __future__ import annotations

from homeassistant.components.repairs import async_create_issue, async_delete_issue

from .const import DOMAIN


def _issue_id(item_id: str) -> str:
    # item_id contains ':' which is not always friendly; normalize.
    return f"catalogue_offline_{item_id.replace(':', '_')}"


async def async_sync_repairs(hass) -> None:
    """Create/delete repairs issues based on catalogue health/escalation."""

    cat = hass.data.get(DOMAIN, {}).get("catalogue") or {}
    items = cat.get("items") or {}

    for item_id, item in items.items():
        if not isinstance(item, dict):
            continue

        triage = item.get("triage") or {}
        if triage.get("policy") == "removed":
            await async_delete_issue(hass, DOMAIN, _issue_id(item_id))
            continue

        health = item.get("health") or {}
        esc = health.get("escalation") or "none"

        # mute_until is handled in escalation computation; if esc is none, we delete.
        if esc == "none":
            await async_delete_issue(hass, DOMAIN, _issue_id(item_id))
            continue

        entity_id = (item.get("source") or {}).get("entity_id") or item_id
        first_unavail = health.get("first_unavailable_at")

        severity = "error" if esc == "error_24h" else "critical"

        async_create_issue(
            hass,
            DOMAIN,
            _issue_id(item_id),
            is_fixable=False,
            is_persistent=True,
            severity=severity,
            translation_key="catalogue_offline",
            translation_placeholders={
                "entity_id": entity_id,
                "since": str(first_unavail or "?")
            },
        )
