from __future__ import annotations

from typing import Any

from .time_utils import utc_now_iso


def ensure_item_defaults(existing: dict[str, Any], *, base_entity_id: str | None) -> dict[str, Any]:
    """Ensure new item structure exists (schema v1 + health/triage additions)."""

    existing.setdefault("item_id", None)
    existing.setdefault("source", {})

    existing.setdefault(
        "enrichment",
        {
            "include": True,
            "is_reference_total": False,
            "room": None,
            "type": None,
            "tags": [],
            "note": None,
            "naming": {
                "mode": "auto",
                "base_entity_id": base_entity_id,
            },
            "calculation": {
                "energy_method": "native",  # native|integrate_power
                "power_to_energy_interval_s": 60,
            },
        },
    )

    existing.setdefault(
        "derived",
        {
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
    )

    existing.setdefault(
        "health",
        {
            "first_unavailable_at": None,
            "last_ok_at": None,
            "escalation": "none",  # none|error_24h|action_48h
        },
    )

    existing.setdefault(
        "triage",
        {
            "policy": "normal",  # normal|removed
            "mute_until": None,
            "note": None,
            "updated_at": utc_now_iso(),
        },
    )

    return existing
