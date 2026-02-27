"""HSE_DOC: custom_components/home_suivi_elec/docs/unified_api.md

Dashboard endpoint used by the frontend Accueil (overview).

Design goals:
- One endpoint for the overview to avoid duplicating business logic in JS.
- Never hard-fail if some sensors/fields are missing; return nulls + warnings.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.http import HomeAssistantView

from ...const import API_PREFIX, DOMAIN


def _num(x: Any) -> float | None:
    try:
        v = float(x)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def _power_w_from_state(st) -> float | None:
    if not st:
        return None
    v = _num(st.state)
    if v is None:
        return None
    unit = (st.attributes or {}).get("unit_of_measurement") or ""
    if unit in ("kW", "kw"):
        return v * 1000.0
    return v


def _current_reference_entity_id(catalogue: dict) -> str | None:
    items = (catalogue or {}).get("items") or {}
    if not isinstance(items, dict):
        return None
    for it in items.values():
        if not isinstance(it, dict):
            continue
        enr = it.get("enrichment") or {}
        if isinstance(enr, dict) and enr.get("is_reference_total") is True:
            src = it.get("source") or {}
            if isinstance(src, dict):
                eid = src.get("entity_id")
                if isinstance(eid, str) and eid:
                    return eid
    return None


def _mk_period_row(period: str) -> dict:
    return {
        "period": period,
        "kwh": None,
        "cost_ht": None,
        "cost_ttc": None,
        "total_ht": None,
        "total_ttc": None,
    }


class DashboardOverviewView(HomeAssistantView):
    url = f"{API_PREFIX}/dashboard"
    name = "home_suivi_elec:unified:dashboard_overview"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]

        catalogue = hass.data.get(DOMAIN, {}).get("catalogue")
        if not catalogue:
            catalogue = {"schema_version": 1, "generated_at": None, "items": {}, "settings": {}}

        settings = catalogue.get("settings") or {}
        pricing = settings.get("pricing") if isinstance(settings, dict) else None
        defaults = settings.get("pricing_defaults") if isinstance(settings, dict) else None

        cost_ids: list[str] = []
        if isinstance(pricing, dict):
            cids = pricing.get("cost_entity_ids")
            if isinstance(cids, list):
                cost_ids = [x for x in cids if isinstance(x, str) and x]

        warnings: list[str] = []

        selected: list[dict] = []
        for eid in cost_ids:
            st = hass.states.get(eid)
            w = _power_w_from_state(st)
            name = None
            if st:
                name = (st.attributes or {}).get("friendly_name")
            selected.append(
                {
                    "entity_id": eid,
                    "name": name or eid,
                    "power_w": w,
                    "state": None if not st else st.state,
                    "unit": None if not st else (st.attributes or {}).get("unit_of_measurement"),
                    "last_updated": None if not st else (st.last_updated or st.last_changed),
                }
            )

        top_src = [r for r in selected if isinstance(r.get("power_w"), (int, float))]
        top_src.sort(key=lambda r: float(r["power_w"]), reverse=True)

        bucket_100_500 = [r for r in top_src if 100.0 <= float(r["power_w"]) <= 500.0][:8]
        bucket_gt_500 = [r for r in top_src if float(r["power_w"]) > 500.0][:8]

        total_w = sum(float(r.get("power_w") or 0.0) for r in selected)

        ref_eid = _current_reference_entity_id(catalogue)
        reference = None
        delta = None

        if ref_eid:
            ref_st = hass.states.get(ref_eid)
            ref_w = _power_w_from_state(ref_st)
            reference = {
                "entity_id": ref_eid,
                "name": None if not ref_st else (ref_st.attributes or {}).get("friendly_name"),
                "power_w": ref_w,
                "state": None if not ref_st else ref_st.state,
                "unit": None if not ref_st else (ref_st.attributes or {}).get("unit_of_measurement"),
                "last_updated": None if not ref_st else (ref_st.last_updated or ref_st.last_changed),
            }
            if ref_w is not None:
                delta = {"power_w": float(ref_w) - float(total_w)}
        else:
            warnings.append("no_reference_configured")

        totals = {
            "week": {"energy_kwh": None, "conso_ht": None, "conso_ttc": None, "subscription_ht": None, "subscription_ttc": None, "total_ht": None, "total_ttc": None},
            "month": {"energy_kwh": None, "conso_ht": None, "conso_ttc": None, "subscription_ht": None, "subscription_ttc": None, "total_ht": None, "total_ttc": None},
            "year": {"energy_kwh": None, "conso_ht": None, "conso_ttc": None, "subscription_ht": None, "subscription_ttc": None, "total_ht": None, "total_ttc": None},
        }

        cumulative_table = [_mk_period_row(p) for p in ("hour", "day", "week", "month", "year")]
        per_sensor_costs = [
            {
                "entity_id": r["entity_id"],
                "name": r.get("name") or r["entity_id"],
                "hour": None,
                "day": None,
                "week": None,
                "month": None,
                "year": None,
            }
            for r in selected
        ]

        if selected and all((r.get("power_w") is None) for r in selected):
            warnings.append("selected_sensors_have_no_numeric_state")

        return self.json(
            {
                "ok": True,
                "generated_at": catalogue.get("generated_at"),
                "pricing": pricing,
                "defaults": defaults,
                "selected": selected,
                "top_live": {"bucket_100_500": bucket_100_500, "bucket_gt_500": bucket_gt_500},
                "computed": {"total_power_w": total_w},
                "reference": reference,
                "delta": delta,
                "totals": totals,
                "cumulative_table": cumulative_table,
                "per_sensor_costs": per_sensor_costs,
                "warnings": warnings,
            }
        )
