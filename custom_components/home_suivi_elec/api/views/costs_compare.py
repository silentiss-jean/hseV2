"""HSE_DOC: custom_components/home_suivi_elec/docs/unified_api.md

Backend compare endpoint for Analyse de coûts.

Current implementation intentionally reuses existing helper-based cost data:
- today_vs_yesterday uses the utility_meter day helper current state vs `last_period`
- this_week_vs_last_week uses the utility_meter week helper current state vs `last_period`

Weekend/custom arbitrary historical ranges still require recorder-backed history and are
returned as unsupported (with graceful warnings) instead of failing hard.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.http import HomeAssistantView

from ...const import API_PREFIX, DOMAIN
from ...shared_cost_engine import build_sensor_cost_snapshot

_SUPPORTED_PRESETS = {"today_vs_yesterday": "day", "this_week_vs_last_week": "week"}


def _num(value: Any) -> float | None:
    try:
        out = float(value)
        return out if out == out else None
    except (TypeError, ValueError):
        return None


def _energy_kwh_from_attr(st, attr_name: str) -> float | None:
    if not st:
        return None
    value = _num((st.attributes or {}).get(attr_name))
    if value is None:
        return None
    unit = ((st.attributes or {}).get("unit_of_measurement") or "").lower()
    if unit == "wh":
        return value / 1000.0
    return value


def _subscription_for_period(pricing: dict[str, Any] | None, period: str) -> tuple[float | None, float | None]:
    if not isinstance(pricing, dict):
        return None, None
    monthly = pricing.get("subscription_monthly")
    if not isinstance(monthly, dict):
        return None, None

    ht = _num(monthly.get("ht"))
    ttc = _num(monthly.get("ttc"))
    if ht is None or ttc is None:
        return None, None

    if period == "month":
        return ht, ttc
    if period == "year":
        return ht * 12.0, ttc * 12.0
    if period == "week":
        return (ht * 12.0) / 52.0, (ttc * 12.0) / 52.0
    return None, None


def _energy_price_pair(pricing: dict[str, Any] | None, period: str) -> tuple[float | None, float | None]:
    if not isinstance(pricing, dict):
        return None, None
    contract_type = pricing.get("contract_type")
    if contract_type != "fixed":
        return None, None
    pair = pricing.get("fixed_energy_per_kwh")
    if not isinstance(pair, dict):
        return None, None
    return _num(pair.get("ht")), _num(pair.get("ttc"))


def _row_from_kwh(period: str, kwh: float | None, pricing: dict[str, Any] | None, *, include_subscription: bool) -> dict[str, float | None]:
    ht_per_kwh, ttc_per_kwh = _energy_price_pair(pricing, period)
    cost_ht = None if kwh is None or ht_per_kwh is None else kwh * ht_per_kwh
    cost_ttc = None if kwh is None or ttc_per_kwh is None else kwh * ttc_per_kwh

    subscription_ht = 0.0 if include_subscription else 0.0
    subscription_ttc = 0.0 if include_subscription else 0.0
    if include_subscription:
        sub_ht, sub_ttc = _subscription_for_period(pricing, period)
        subscription_ht = 0.0 if sub_ht is None else float(sub_ht)
        subscription_ttc = 0.0 if sub_ttc is None else float(sub_ttc)

    total_ht = None if cost_ht is None else float(cost_ht) + float(subscription_ht or 0.0)
    total_ttc = None if cost_ttc is None else float(cost_ttc) + float(subscription_ttc or 0.0)

    return {
        "kwh": None if kwh is None else float(kwh),
        "cost_ht": None if cost_ht is None else float(cost_ht),
        "cost_ttc": None if cost_ttc is None else float(cost_ttc),
        "subscription_ht": None if not include_subscription and cost_ht is None else float(subscription_ht or 0.0),
        "subscription_ttc": None if not include_subscription and cost_ttc is None else float(subscription_ttc or 0.0),
        "total_ht": total_ht,
        "total_ttc": total_ttc,
    }


def _sub_opt(a: float | None, b: float | None) -> float | None:
    if a is None or b is None:
        return None
    return float(a) - float(b)


def _delta_row(a: dict[str, float | None], b: dict[str, float | None]) -> dict[str, float | None]:
    cost_ht = _sub_opt(a.get("cost_ht"), b.get("cost_ht"))
    cost_ttc = _sub_opt(a.get("cost_ttc"), b.get("cost_ttc"))
    kwh = _sub_opt(a.get("kwh"), b.get("kwh"))
    return {
        "kwh": kwh,
        "cost_ht": cost_ht,
        "cost_ttc": cost_ttc,
        "subscription_ht": 0.0 if any(v is not None for v in (kwh, cost_ht, cost_ttc)) else None,
        "subscription_ttc": 0.0 if any(v is not None for v in (kwh, cost_ht, cost_ttc)) else None,
        "total_ht": cost_ht,
        "total_ttc": cost_ttc,
    }


def _pct(cur: float | None, prev: float | None) -> float | None:
    if cur is None or prev in (None, 0):
        return None
    return round(((float(cur) - float(prev)) / float(prev)) * 100.0, 2)


def _summary_delta(cur: dict[str, float | None], prev: dict[str, float | None]) -> dict[str, float | None]:
    return {
        "delta_kwh": _sub_opt(cur.get("kwh"), prev.get("kwh")),
        "pct_kwh": _pct(cur.get("kwh"), prev.get("kwh")),
        "delta_cost_ht": _sub_opt(cur.get("cost_ht"), prev.get("cost_ht")),
        "pct_cost_ht": _pct(cur.get("cost_ht"), prev.get("cost_ht")),
        "delta_cost_ttc": _sub_opt(cur.get("cost_ttc"), prev.get("cost_ttc")),
        "pct_cost_ttc": _pct(cur.get("cost_ttc"), prev.get("cost_ttc")),
        "delta_total_ht": _sub_opt(cur.get("total_ht"), prev.get("total_ht")),
        "pct_total_ht": _pct(cur.get("total_ht"), prev.get("total_ht")),
        "delta_total_ttc": _sub_opt(cur.get("total_ttc"), prev.get("total_ttc")),
        "pct_total_ttc": _pct(cur.get("total_ttc"), prev.get("total_ttc")),
    }


def _catalogue_item_by_source_entity_id(catalogue: dict, entity_id: str) -> dict | None:
    items = (catalogue or {}).get("items") or {}
    if not isinstance(items, dict):
        return None
    for item in items.values():
        if not isinstance(item, dict):
            continue
        src = item.get("source") or {}
        current_entity_id = src.get("entity_id") if isinstance(src, dict) else None
        if current_entity_id == entity_id:
            return item
    return None


def _current_reference_item(catalogue: dict) -> dict | None:
    items = (catalogue or {}).get("items") or {}
    if not isinstance(items, dict):
        return None
    for item in items.values():
        if not isinstance(item, dict):
            continue
        enr = item.get("enrichment") or {}
        if isinstance(enr, dict) and enr.get("is_reference_total") is True:
            return item
    return None


def _current_reference_entity_id(catalogue: dict) -> str | None:
    item = _current_reference_item(catalogue)
    if not isinstance(item, dict):
        return None
    src = item.get("source") or {}
    if isinstance(src, dict):
        eid = src.get("entity_id")
        if isinstance(eid, str) and eid:
            return eid
    return None


def _empty_period_row() -> dict[str, float | None]:
    return {
        "kwh": None,
        "cost_ht": None,
        "cost_ttc": None,
        "subscription_ht": None,
        "subscription_ttc": None,
        "total_ht": None,
        "total_ttc": None,
    }


def _build_compare_sensor_row(hass, pricing: dict[str, Any] | None, sensor_ref: str | dict[str, Any], period: str) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    current = build_sensor_cost_snapshot(hass, pricing, sensor_ref)
    helper_entity_id = None
    helpers = current.get("helpers")
    if isinstance(helpers, dict):
        helper_entity_id = helpers.get(period)
    helper_st = hass.states.get(helper_entity_id) if helper_entity_id else None
    previous_kwh = _energy_kwh_from_attr(helper_st, "last_period")
    if helper_entity_id and previous_kwh is None:
        warnings.append(f"missing_last_period:{helper_entity_id}")
    if not helper_entity_id:
        warnings.append(f"missing_helper_mapping:{period}")

    current_row = _row_from_kwh(period, (current.get("energy_kwh") or {}).get(period), pricing, include_subscription=False)
    previous_row = _row_from_kwh(period, previous_kwh, pricing, include_subscription=False)
    delta_row = _summary_delta(current_row, previous_row)

    return (
        {
            "entity_id": current.get("entity_id"),
            "name": current.get("name") or current.get("entity_id"),
            "reference_period": current_row,
            "compare_period": previous_row,
            "delta": {
                "kwh": delta_row.get("delta_kwh"),
                "cost_ht": delta_row.get("delta_cost_ht"),
                "cost_ttc": delta_row.get("delta_cost_ttc"),
                "total_ht": delta_row.get("delta_total_ht"),
                "total_ttc": delta_row.get("delta_total_ttc"),
                "pct_total_ht": delta_row.get("pct_total_ht"),
                "pct_total_ttc": delta_row.get("pct_total_ttc"),
            },
        },
        sorted(set((current.get("warnings") or []) + warnings)),
    )


def _sum_sensor_rows(rows: list[dict[str, Any]], key: str, period: str, pricing: dict[str, Any] | None, *, include_subscription: bool) -> dict[str, float | None]:
    kwh_values = [row.get(key, {}).get("kwh") for row in rows if isinstance(row, dict)]
    kwh_sum = sum(float(v) for v in kwh_values if isinstance(v, (int, float))) if any(isinstance(v, (int, float)) for v in kwh_values) else None
    return _row_from_kwh(period, kwh_sum, pricing, include_subscription=include_subscription)


def _resolve_ranges(preset: str, week_mode: str, custom_week_start: int) -> tuple[dict[str, str] | None, dict[str, str] | None]:
    now = datetime.now().astimezone()
    if preset == "today_vs_yesterday":
        ref_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        ref_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        cmp_dt = now - timedelta(days=1)
        cmp_start = cmp_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        cmp_end = cmp_dt.replace(hour=23, minute=59, second=59, microsecond=999999)
        return ({"start": ref_start.isoformat(), "end": ref_end.isoformat()}, {"start": cmp_start.isoformat(), "end": cmp_end.isoformat()})

    if preset == "this_week_vs_last_week":
        active_start = custom_week_start if week_mode == "custom" else 1
        js_day = (now.weekday() + 1) % 7
        diff = (js_day - active_start + 7) % 7
        ref_start = (now - timedelta(days=diff)).replace(hour=0, minute=0, second=0, microsecond=0)
        ref_end = (ref_start + timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=999999)
        cmp_start = (ref_start - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        cmp_end = (cmp_start + timedelta(days=6)).replace(hour=23, minute=59, second=59, microsecond=999999)
        return ({"start": ref_start.isoformat(), "end": ref_end.isoformat()}, {"start": cmp_start.isoformat(), "end": cmp_end.isoformat()})

    return None, None


class CostsCompareView(HomeAssistantView):
    url = f"{API_PREFIX}/costs/compare"
    name = "home_suivi_elec:unified:costs_compare"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]
        payload = await request.json() if request.can_read_body else {}

        preset = payload.get("preset") or "today_vs_yesterday"
        tax_mode = payload.get("tax_mode") or "ttc"
        week_mode = payload.get("week_mode") or "classic"
        custom_week_start = payload.get("custom_week_start")
        try:
            custom_week_start = int(custom_week_start if custom_week_start is not None else 5)
        except (TypeError, ValueError):
            custom_week_start = 5
        if custom_week_start < 0 or custom_week_start > 6:
            custom_week_start = 5
        if tax_mode not in ("ht", "ttc"):
            tax_mode = "ttc"
        if week_mode not in ("classic", "custom"):
            week_mode = "classic"

        domain_data = hass.data.get(DOMAIN, {})
        catalogue = domain_data.get("catalogue") or {"items": {}, "settings": {}}
        settings = catalogue.get("settings") or {}
        pricing = settings.get("pricing") if isinstance(settings, dict) else None
        defaults = settings.get("pricing_defaults") if isinstance(settings, dict) else None

        warnings: list[str] = []
        cost_ids: list[str] = []
        if isinstance(pricing, dict):
            raw_ids = pricing.get("cost_entity_ids")
            if isinstance(raw_ids, list):
                cost_ids = [x for x in raw_ids if isinstance(x, str) and x]

        if not pricing:
            warnings.append("pricing_not_configured")
        if not cost_ids:
            warnings.append("pricing_has_no_cost_entity_ids")

        resolved_reference_range, resolved_compare_range = _resolve_ranges(preset, week_mode, custom_week_start)
        if preset not in _SUPPORTED_PRESETS:
            warnings.append("preset_requires_recorder_history")
            return self.json(
                {
                    "ok": True,
                    "supported": False,
                    "meta": {
                        "preset_used": preset,
                        "tax_mode": tax_mode,
                        "week_mode": week_mode,
                        "custom_week_start": custom_week_start,
                        "resolved_reference_range": resolved_reference_range,
                        "resolved_compare_range": resolved_compare_range,
                        "generated_at": datetime.now().astimezone().isoformat(),
                    },
                    "reference_period": {"reference": _empty_period_row(), "internal": _empty_period_row(), "delta": _empty_period_row()},
                    "compare_period": {"reference": _empty_period_row(), "internal": _empty_period_row(), "delta": _empty_period_row()},
                    "summary": {"reference": _summary_delta(_empty_period_row(), _empty_period_row()), "internal": _summary_delta(_empty_period_row(), _empty_period_row()), "delta": _summary_delta(_empty_period_row(), _empty_period_row())},
                    "per_sensor": [],
                    "pricing": pricing,
                    "defaults": defaults,
                    "warnings": sorted(set(warnings)),
                }
            )

        period = _SUPPORTED_PRESETS[preset]
        sensor_rows: list[dict[str, Any]] = []
        for eid in cost_ids:
            sensor_ref = _catalogue_item_by_source_entity_id(catalogue, eid) or eid
            row, row_warnings = _build_compare_sensor_row(hass, pricing, sensor_ref, period)
            sensor_rows.append(row)
            warnings.extend([f"{eid}:{w}" for w in row_warnings])

        internal_current = _sum_sensor_rows(sensor_rows, "reference_period", period, pricing, include_subscription=True)
        internal_previous = _sum_sensor_rows(sensor_rows, "compare_period", period, pricing, include_subscription=True)

        ref_eid = _current_reference_entity_id(catalogue)
        reference_current = _empty_period_row()
        reference_previous = _empty_period_row()
        if ref_eid:
            ref_sensor_ref = _current_reference_item(catalogue) or ref_eid
            ref_row, ref_warnings = _build_compare_sensor_row(hass, pricing, ref_sensor_ref, period)
            reference_current = _row_from_kwh(period, (ref_row.get("reference_period") or {}).get("kwh"), pricing, include_subscription=True)
            reference_previous = _row_from_kwh(period, (ref_row.get("compare_period") or {}).get("kwh"), pricing, include_subscription=True)
            warnings.extend([f"reference:{ref_eid}:{w}" for w in ref_warnings])
        else:
            warnings.append("no_reference_configured")

        delta_current = _delta_row(reference_current, internal_current)
        delta_previous = _delta_row(reference_previous, internal_previous)

        sort_key = "total_ht" if tax_mode == "ht" else "total_ttc"
        sensor_rows.sort(key=lambda row: float((((row.get("delta") or {}).get(sort_key)) or 0.0)), reverse=True)

        return self.json(
            {
                "ok": True,
                "supported": True,
                "meta": {
                    "preset_used": preset,
                    "tax_mode": tax_mode,
                    "week_mode": week_mode,
                    "custom_week_start": custom_week_start,
                    "resolved_reference_range": resolved_reference_range,
                    "resolved_compare_range": resolved_compare_range,
                    "generated_at": datetime.now().astimezone().isoformat(),
                    "compare_source": "utility_meter_last_period",
                },
                "reference_period": {
                    "reference": reference_current,
                    "internal": internal_current,
                    "delta": delta_current,
                },
                "compare_period": {
                    "reference": reference_previous,
                    "internal": internal_previous,
                    "delta": delta_previous,
                },
                "summary": {
                    "reference": _summary_delta(reference_current, reference_previous),
                    "internal": _summary_delta(internal_current, internal_previous),
                    "delta": _summary_delta(delta_current, delta_previous),
                },
                "per_sensor": sensor_rows,
                "pricing": pricing,
                "defaults": defaults,
                "warnings": sorted(set(warnings)),
            }
        )
