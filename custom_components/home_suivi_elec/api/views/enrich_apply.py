from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers import entity_registry as er

from ...const import API_PREFIX, DOMAIN
from ...scan_engine import detect_kind
from .enrich_preview import derive_base_slug
from .migration_export import _mk_integration_sensor_yaml, _mk_utility_meter_yaml, _safe_yaml


def _admin_only(request) -> bool:
    user = request.get("hass_user")
    return bool(user and getattr(user, "is_admin", False))


def _as_float_state(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if not isinstance(v, str):
        return None
    s = v.strip().lower()
    if not s or s in ("unknown", "unavailable", "none", "nan"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _has_config_entry_named(hass, *, domain: str, name: str) -> bool:
    try:
        entries = hass.config_entries.async_entries(domain)
    except Exception:  # noqa: BLE001
        return False

    for e in entries or []:
        try:
            if (e.title or "") == name:
                return True
            opts = getattr(e, "options", None) or {}
            if isinstance(opts, dict) and opts.get("name") == name:
                return True
        except Exception:  # noqa: BLE001
            continue

    return False


def _find_config_entry_by_name(hass, *, domain: str, name: str):
    try:
        entries = hass.config_entries.async_entries(domain)
    except Exception:  # noqa: BLE001
        return None

    for e in entries or []:
        try:
            if (e.title or "") == name:
                return e
            opts = getattr(e, "options", None) or {}
            if isinstance(opts, dict) and opts.get("name") == name:
                return e
        except Exception:  # noqa: BLE001
            continue

    return None


async def _remove_config_entry_if_present(hass, *, domain: str, name: str) -> bool:
    entry = _find_config_entry_by_name(hass, domain=domain, name=name)
    if entry is None:
        return False
    try:
        await hass.config_entries.async_remove(entry.entry_id)
        await hass.async_block_till_done()
        return True
    except Exception:  # noqa: BLE001
        return False


async def _wait_for_entity_or_registry(*, hass, ent_reg, entity_id: str, timeout_s: float = 5.0) -> bool:
    end = hass.loop.time() + timeout_s
    while hass.loop.time() < end:
        if hass.states.get(entity_id) is not None:
            return True
        if ent_reg.async_get(entity_id) is not None:
            return True
        await hass.async_block_till_done()
        await asyncio.sleep(0.2)
    return False


async def _try_create_helper_via_flow(*, hass, domain: str, data_variants: list[dict]) -> dict:
    """Best-effort helper creation via config flows."""

    flow_mgr = getattr(getattr(hass, "config_entries", None), "flow", None)
    if flow_mgr is None:
        return {"ok": False, "error": "config_entries_flow_not_available"}

    last_err = None

    # Built-in helper config flows (integration, utility_meter) are meant to be created
    # via the UI (source=user). Some of them do NOT support source=import.
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

                if isinstance(res, dict) and res.get("type") == "create_entry":
                    return {"ok": True, "result": res, "used_data": data, "already_configured": False}

                if isinstance(res, dict) and res.get("type") == "abort":
                    reason = res.get("reason") or "unknown"
                    # Treat already_configured as a non-error outcome.
                    if reason in ("already_configured", "single_instance_allowed"):
                        return {"ok": True, "result": res, "used_data": data, "already_configured": True}
                    last_err = f"flow_abort:{src}:{reason}"
                    continue

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

        safe_mode = body.get("safe", True)
        self_heal = body.get("self_heal", True)

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

        ent_reg = er.async_get(hass)

        bases = {}
        for eid in entity_ids:
            st = hass.states.get(eid)
            attrs = st.attributes if st else {}
            unit = (attrs or {}).get("unit_of_measurement")
            device_class = (attrs or {}).get("device_class")
            kind = detect_kind(device_class, unit)
            if kind != "power":
                skipped.append({"entity_id": eid, "reason": f"skip_kind:{kind}", "hint": "Sélectionne un capteur de puissance (W/kW)."})
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

        if mode == "create_helpers":
            for base, info in sorted(bases.items()):
                power_eid = info.get("power_entity_id")
                if not power_eid:
                    skipped.append({"entity_id": base, "reason": "missing_power_entity"})
                    continue

                total_name = f"{base}_kwh_total"
                total_eid = f"sensor.{total_name}"

                # 0) Preflight power (optional but improves UX)
                power_state = hass.states.get(power_eid)
                power_value = _as_float_state(power_state.state if power_state else None)
                if safe_mode and power_value is None:
                    skipped.append(
                        {
                            "entity_id": power_eid,
                            "base": base,
                            "reason": "power_not_ready",
                            "hint": "Le capteur de puissance est unknown/unavailable. Attends une première mesure (allume une charge) puis relance.",
                        }
                    )

                # 1) Integration helper (power -> kWh total)
                reg_entry = ent_reg.async_get(total_eid)
                if hass.states.get(total_eid) is None and reg_entry is None:
                    # If a stale config entry exists, attempt self-heal.
                    if _has_config_entry_named(hass, domain="integration", name=total_name):
                        if self_heal:
                            removed = await _remove_config_entry_if_present(hass, domain="integration", name=total_name)
                            if removed:
                                skipped.append({"entity_id": total_eid, "reason": "self_heal_removed_stale_entry", "kind": "integration"})
                            else:
                                errors.append(
                                    {
                                        "entity_id": total_eid,
                                        "kind": "integration",
                                        "base": base,
                                        "error": "config_entry_exists_but_entity_missing",
                                        "hint": "Une config entry existe mais l'entité est absente. Va dans Settings → Devices & services → Helpers et supprime l'entrée, ou utilise enrich/cleanup.",
                                    }
                                )
                                continue
                        else:
                            errors.append(
                                {
                                    "entity_id": total_eid,
                                    "kind": "integration",
                                    "base": base,
                                    "error": "config_entry_exists_but_entity_missing",
                                }
                            )
                            continue

                    # Integral helper needs unit_time to build unit (kWh from W) on many HA versions.
                    data_variants = [
                        {"source": power_eid, "name": total_name, "unit_prefix": "k", "unit_time": "h", "round": 3, "method": "left"},
                        {"source_entity_id": power_eid, "name": total_name, "unit_prefix": "k", "unit_time": "h", "round": 3, "method": "left"},
                        {"source_sensor": power_eid, "name": total_name, "unit_prefix": "k", "unit_time": "h", "round": 3, "method": "left"},
                    ]

                    res = await _try_create_helper_via_flow(hass=hass, domain="integration", data_variants=data_variants)
                    if res.get("ok"):
                        if res.get("already_configured"):
                            skipped.append({"entity_id": total_eid, "reason": "already_configured", "flow": res.get("result")})
                        else:
                            created.append({"entity_id": total_eid, "kind": "integration", "base": base, "flow": res.get("result")})

                        ok = await _wait_for_entity_or_registry(hass=hass, ent_reg=ent_reg, entity_id=total_eid, timeout_s=6.0)
                        if not ok:
                            # Rollback: never leave a red helper behind.
                            if self_heal:
                                await _remove_config_entry_if_present(hass, domain="integration", name=total_name)
                            errors.append(
                                {
                                    "entity_id": total_eid,
                                    "kind": "integration",
                                    "base": base,
                                    "error": "entity_not_created_after_flow",
                                    "rolled_back": bool(self_heal),
                                    "hint": "L'entité n'a pas été créée après le flow. Vérifie Settings → System → Logs (filtre 'integration').",
                                }
                            )
                            continue
                    else:
                        errors.append(
                            {
                                "entity_id": total_eid,
                                "kind": "integration",
                                "base": base,
                                "error": res.get("error"),
                                "hint": "Échec du config flow. Vérifie Settings → System → Logs.",
                            }
                        )
                        continue
                else:
                    skipped.append({"entity_id": total_eid, "reason": "already_exists_or_registered", "registry": bool(reg_entry)})

                # 2) Utility meter helpers (day/week/month/year)
                total_state = hass.states.get(total_eid)
                total_value = _as_float_state(total_state.state if total_state else None)
                if safe_mode and total_value is None:
                    skipped.append(
                        {
                            "entity_id": total_eid,
                            "base": base,
                            "reason": "total_not_ready",
                            "hint": "Le compteur kWh total est encore unknown. Attends une première mesure de puissance, puis relance la création des compteurs (day/week/month/year).",
                        }
                    )
                    continue

                cycles = [
                    ("day", "daily"),
                    ("week", "weekly"),
                    ("month", "monthly"),
                    ("year", "yearly"),
                ]

                for suf, cycle in cycles:
                    meter_name = f"{base}_kwh_{suf}"
                    meter_eid = f"sensor.{meter_name}"
                    reg_meter = ent_reg.async_get(meter_eid)

                    if hass.states.get(meter_eid) is not None or reg_meter is not None:
                        skipped.append({"entity_id": meter_eid, "reason": "already_exists_or_registered", "registry": bool(reg_meter)})
                        continue

                    # If stale config entry exists, attempt self-heal.
                    if _has_config_entry_named(hass, domain="utility_meter", name=meter_name):
                        if self_heal:
                            removed = await _remove_config_entry_if_present(hass, domain="utility_meter", name=meter_name)
                            if removed:
                                skipped.append({"entity_id": meter_eid, "reason": "self_heal_removed_stale_entry", "kind": "utility_meter"})
                            else:
                                errors.append(
                                    {
                                        "entity_id": meter_eid,
                                        "kind": "utility_meter",
                                        "base": base,
                                        "cycle": cycle,
                                        "error": "config_entry_exists_but_entity_missing",
                                        "hint": "Une config entry existe mais l'entité est absente. Supprime l'entrée dans Helpers, ou utilise enrich/cleanup.",
                                    }
                                )
                                continue
                        else:
                            skipped.append({"entity_id": meter_eid, "reason": "config_entry_exists"})
                            continue

                    # Home Assistant expects multiple keys to exist in config_entry.options
                    # (missing keys can crash setup).
                    base_payload = {
                        "source": total_eid,
                        "name": meter_name,
                        "cycle": cycle,
                        "offset": 0.0,
                        "tariffs": [],
                        "delta_values": False,
                        "net_consumption": False,
                        "periodically_resetting": False,
                        "always_available": False,
                    }
                    data_variants = [
                        base_payload,
                        {**base_payload, "source_sensor": total_eid},
                        {**base_payload, "source_entity_id": total_eid},
                        {**base_payload, "meter_id": meter_name},
                    ]

                    res = await _try_create_helper_via_flow(hass=hass, domain="utility_meter", data_variants=data_variants)
                    if res.get("ok"):
                        if res.get("already_configured"):
                            skipped.append({"entity_id": meter_eid, "reason": "already_configured", "flow": res.get("result")})
                        else:
                            created.append({"entity_id": meter_eid, "kind": "utility_meter", "base": base, "cycle": cycle, "flow": res.get("result")})

                        ok = await _wait_for_entity_or_registry(hass=hass, ent_reg=ent_reg, entity_id=meter_eid, timeout_s=6.0)
                        if not ok:
                            if self_heal:
                                await _remove_config_entry_if_present(hass, domain="utility_meter", name=meter_name)
                            errors.append(
                                {
                                    "entity_id": meter_eid,
                                    "kind": "utility_meter",
                                    "base": base,
                                    "cycle": cycle,
                                    "error": "entity_not_created_after_flow",
                                    "rolled_back": bool(self_heal),
                                    "hint": "L'entité n'a pas été créée après le flow. Vérifie Settings → System → Logs (filtre 'utility_meter').",
                                }
                            )
                            continue

                        await hass.async_block_till_done()
                    else:
                        errors.append({"entity_id": meter_eid, "kind": "utility_meter", "base": base, "cycle": cycle, "error": res.get("error")})

        else:
            for base in sorted(bases.keys()):
                skipped.append({"entity_id": f"sensor.{base}_kwh_total", "reason": "export_ready"})

        return self.json(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "mode": mode,
                "input": {"entity_ids": entity_ids, "safe": safe_mode, "self_heal": self_heal},
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
