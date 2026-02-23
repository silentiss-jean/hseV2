from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _item_id_from_source(source: dict[str, Any]) -> str:
    # Prefer stable registry unique_id when available (platform + unique_id).
    platform = source.get("platform") or source.get("integration_domain") or "unknown"
    unique_id = source.get("unique_id")
    if unique_id:
        return f"reg:{platform}:{unique_id}"

    # Fallback: entity_id (less stable).
    entity_id = source.get("entity_id") or "unknown"
    return f"ent:{entity_id}"


def merge_scan_into_catalogue(catalogue: dict[str, Any], scan: dict[str, Any]) -> dict[str, Any]:
    """Merge EntitiesScanView output into persistent catalogue.

    - Updates source.* fields and last_seen
    - Preserves enrichment.* and derived.enabled
    - Adds new items when discovered
    """

    items: dict[str, Any] = catalogue.setdefault("items", {})
    now_iso = _utc_now_iso()

    for c in scan.get("candidates", []) or []:
        item_id = _item_id_from_source(c)

        existing = items.get(item_id)
        if not isinstance(existing, dict):
            existing = {
                "item_id": item_id,
                "source": {},
                "enrichment": {
                    "include": True,
                    "is_reference_total": False,
                    "room": None,
                    "type": None,
                    "tags": [],
                    "note": None,
                    "naming": {
                        "mode": "auto",
                        "base_entity_id": c.get("entity_id"),
                    },
                    "calculation": {
                        "energy_method": "native",  # native|integrate_power
                        "power_to_energy_interval_s": 60,
                    },
                },
                "derived": {
                    "enabled": {
                        "energy_day": True,
                        "energy_week": True,
                        "energy_week_custom": False,
                        "energy_month": True,
                        "energy_year": True,
                        "cost_day": True,
                        "cost_week": True,
                        "cost_week_custom": False,
                        "cost_month": True,
                        "cost_year": True,
                    }
                },
            }

        # Update source snapshot
        src = existing.setdefault("source", {})
        for k in (
            "entity_id",
            "kind",
            "unit",
            "device_class",
            "state_class",
            "unique_id",
            "device_id",
            "area_id",
            "integration_domain",
            "platform",
            "config_entry_id",
            "disabled_by",
            "status",
            "status_reason",
        ):
            if k in c:
                src[k] = c.get(k)

        src["last_seen_state"] = c.get("ha_state")
        src["last_seen_at"] = now_iso

        # Naming auto-follow entity_id rename
        naming = existing.get("enrichment", {}).get("naming", {})
        if isinstance(naming, dict) and naming.get("mode") != "locked":
            naming["base_entity_id"] = c.get("entity_id")

        items[item_id] = existing

    catalogue["generated_at"] = now_iso
    return catalogue
