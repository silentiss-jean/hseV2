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


async def _try_create_helper_via_flow(*, hass, domain: str, data_variants: list[dict]) -> dict:
    """Best-effort helper creation via config flows.

    Returns a dict with keys:
      ok: bool
      result: flow result (dict) if any
      used_data: dict (the data that succeeded)
      error: str
    """

    flow_mgr = getattr(getattr(hass, "config_entries", None), "flow", None)
    if flow_mgr is None:
        return {"ok": False, "error": "config_entries_flow_not_available"}

    last_err = None

    # Built-in helper config flows (integration, utility_meter) are meant to be created
    # via the UI (source=user). Some of them do NOT support source=import, which triggers
    # UnknownStep("... doesn't support step import").
    sources = ("user",)

    for data in data_variants:
        for src in sources:
            try:
                res = await flow_mgr.async_init(domain, context={"source": src}, data=data)

                # Some flows return a form; try to auto-configure if possible.
                if isinstance(res, dict) and res.get("type") == "form" and res.get("flow_id"):
                    try:
                        res = await flow_mgr.async_configure(res["flow_id"], user_input=data)
                    except Exception as exc:  # noqa: BLE001
                        last_err = f"flow_configure_failed:{src}:{type(exc).__name__}:{exc}"
                        continue

                if isinstance(res, dict) and res.get("type") in ("create_entry", "abort"):
                    return {"ok": True, "result": res, "used_data": data}

                # If still a form, keep trying other variants.
                last_err = f"flow_not_completed:{src}:{(res or {}).get('type') if isinstance(res, dict) else type(res).__name__}"
            except Exception as exc:  # noqa: BLE001
                last_err = f"flow_init_failed:{src}:{type(exc).__name__}:{exc}"

    return {"ok": False, "error": last_err or "unknown"}


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

        mode = body.get("mode")
        if mode not in ("create_helpers", "export_yaml"):
            mode = "create_helpers"

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

        # Build exports (kept for transparency + fallback)
        integration_sensors = []
        utility_meter_block = {}

        for base, info in sorted(bases.items()):
            power_eid = info.get("power_entity_id")
            energy_total_eid = f"sensor.{base}_kwh_total"

            if power_eid:
                integration_sensors.append(_mk_integration_sensor_yaml(power_eid, energy_total_eid))
                utility_meter_block.update(_mk_utility_meter_yaml(energy_total_eid, base))

        exports = {
            "option2_templates_riemann_yaml": _safe_yaml({"sensor": integration_sensors}) if integration_sensors else "# Rien à générer\n",
            "option1_utility_meter_yaml": _safe_yaml({"utility_meter": utility_meter_block}) if utility_meter_block else "# Rien à générer\n",
        }

        # CREATE MODE: create HA helpers via config flows (best effort).
        if mode == "create_helpers":
            for base, info in sorted(bases.items()):
                power_eid = info.get("power_entity_id")
                if not power_eid:
                    skipped.append({"entity_id": base, "reason": "missing_power_entity"})
                    continue

                total_name = f"{base}_kwh_total"
                total_eid = f"sensor.{total_name}"

                # 1) Integration helper (power -> kWh total)
                if hass.states.get(total_eid) is None:
                    data_variants = [
                        {"source": power_eid, "name": total_name, "unit_prefix": "k", "round": 3, "method": "left"},
                        {"source_entity_id": power_eid, "name": total_name, "unit_prefix": "k", "round": 3, "method": "left"},
                        {"source_sensor": power_eid, "name": total_name, "unit_prefix": "k", "round": 3, "method": "left"},
                    ]

                    res = await _try_create_helper_via_flow(hass=hass, domain="integration", data_variants=data_variants)
                    if res.get("ok"):
                        created.append({"entity_id": total_eid, "kind": "integration", "base": base, "flow": res.get("result")})
                        try:
                            await hass.async_block_till_done()
                        except Exception:  # noqa: BLE001
                            pass
                    else:
                        errors.append({"entity_id": total_eid, "kind": "integration", "base": base, "error": res.get("error")})
                        # If we cannot create the total sensor, utility meters likely can't be created either.
                        continue
                else:
                    skipped.append({"entity_id": total_eid, "reason": "already_exists"})

                # 2) Utility meter helpers (day/week/month/year)
                cycles = [
                    ("day", "daily"),
                    ("week", "weekly"),
                    ("month", "monthly"),
                    ("year", "yearly"),
                ]

                for suf, cycle in cycles:
                    meter_name = f"{base}_kwh_{suf}"
                    meter_eid = f"sensor.{meter_name}"
                    if hass.states.get(meter_eid) is not None:
                        skipped.append({"entity_id": meter_eid, "reason": "already_exists"})
                        continue

                    data_variants = [
                        {"source": total_eid, "name": meter_name, "cycle": cycle},
                        {"source_sensor": total_eid, "name": meter_name, "cycle": cycle},
                        {"source_entity_id": total_eid, "name": meter_name, "cycle": cycle},
                        {"meter_id": meter_name, "source": total_eid, "name": meter_name, "cycle": cycle},
                    ]

                    res = await _try_create_helper_via_flow(hass=hass, domain="utility_meter", data_variants=data_variants)
                    if res.get("ok"):
                        created.append({"entity_id": meter_eid, "kind": "utility_meter", "base": base, "cycle": cycle, "flow": res.get("result")})
                        try:
                            await hass.async_block_till_done()
                        except Exception:  # noqa: BLE001
                            pass
                    else:
                        errors.append({"entity_id": meter_eid, "kind": "utility_meter", "base": base, "cycle": cycle, "error": res.get("error")})

        else:
            # export-only mode: keep behavior visible in skipped list
            for base in sorted(bases.keys()):
                skipped.append({"entity_id": f"sensor.{base}_kwh_total", "reason": "export_ready"})

        return self.json(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "mode": mode,
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
