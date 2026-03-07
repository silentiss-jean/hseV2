"""HSE_DOC: custom_components/home_suivi_elec/docs/persistent_catalogue.md
HSE_MAINTENANCE: If you change reference_total semantics, update the doc above.
"""

from __future__ import annotations

from homeassistant.components.http import HomeAssistantView
from homeassistant.helpers import entity_registry as er

from ...const import API_PREFIX, DOMAIN
from ...scan_engine import detect_kind
from ...time_utils import utc_now_iso
from .enrich_apply import (
    _as_float_state,
    _build_energy_helper_mapping,
    _energy_helper_entity_ids,
    _has_config_entry_named,
    _persist_energy_helper_mapping,
    _remove_config_entry_if_present,
    _try_create_helper_via_flow,
    _wait_for_entity_or_registry,
)
from .enrich_preview import derive_base_slug


async def _ensure_reference_energy_helpers(*, hass, catalogue: dict, power_entity_id: str) -> dict:
    ent_reg = er.async_get(hass)

    st = hass.states.get(power_entity_id)
    attrs = st.attributes if st else {}
    unit = (attrs or {}).get("unit_of_measurement")
    device_class = (attrs or {}).get("device_class")
    kind = detect_kind(device_class, unit)
    if kind != "power":
        return {"ok": False, "error": f"skip_kind:{kind}", "entity_id": power_entity_id}

    try:
        base = derive_base_slug(power_entity_id)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"base_slug:{exc}", "entity_id": power_entity_id}

    helper_entity_ids = _energy_helper_entity_ids(base)
    total_eid = helper_entity_ids["total"]
    total_name = f"{base}_kwh_total"
    created: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []

    power_value = _as_float_state(st.state if st else None)
    if power_value is None:
        mapping = _build_energy_helper_mapping(
            hass=hass,
            ent_reg=ent_reg,
            power_entity_id=power_entity_id,
            helper_entity_ids=helper_entity_ids,
        )
        _persist_energy_helper_mapping(catalogue=catalogue, power_entity_id=power_entity_id, mapping=mapping)
        return {
            "ok": False,
            "error": "power_not_ready",
            "entity_id": power_entity_id,
            "mapping": mapping,
        }

    reg_entry = ent_reg.async_get(total_eid)
    if hass.states.get(total_eid) is None and reg_entry is None:
        if _has_config_entry_named(hass, domain="integration", name=total_name):
            removed = await _remove_config_entry_if_present(hass, domain="integration", name=total_name)
            if removed:
                skipped.append(f"self_heal_removed:{total_eid}")
            else:
                mapping = _build_energy_helper_mapping(
                    hass=hass,
                    ent_reg=ent_reg,
                    power_entity_id=power_entity_id,
                    helper_entity_ids=helper_entity_ids,
                )
                _persist_energy_helper_mapping(catalogue=catalogue, power_entity_id=power_entity_id, mapping=mapping)
                return {
                    "ok": False,
                    "error": "integration_config_entry_exists_but_entity_missing",
                    "entity_id": power_entity_id,
                    "mapping": mapping,
                }

        data_variants = [
            {"source": power_entity_id, "name": total_name, "unit_prefix": "k", "unit_time": "h", "round": 3, "method": "left"},
            {"source_entity_id": power_entity_id, "name": total_name, "unit_prefix": "k", "unit_time": "h", "round": 3, "method": "left"},
            {"source_sensor": power_entity_id, "name": total_name, "unit_prefix": "k", "unit_time": "h", "round": 3, "method": "left"},
        ]
        res = await _try_create_helper_via_flow(hass=hass, domain="integration", data_variants=data_variants)
        if not res.get("ok"):
            mapping = _build_energy_helper_mapping(
                hass=hass,
                ent_reg=ent_reg,
                power_entity_id=power_entity_id,
                helper_entity_ids=helper_entity_ids,
            )
            _persist_energy_helper_mapping(catalogue=catalogue, power_entity_id=power_entity_id, mapping=mapping)
            return {
                "ok": False,
                "error": res.get("error"),
                "entity_id": power_entity_id,
                "mapping": mapping,
            }
        created.append(total_eid)
        ok = await _wait_for_entity_or_registry(hass=hass, ent_reg=ent_reg, entity_id=total_eid, timeout_s=6.0)
        if not ok:
            await _remove_config_entry_if_present(hass, domain="integration", name=total_name)
            mapping = _build_energy_helper_mapping(
                hass=hass,
                ent_reg=ent_reg,
                power_entity_id=power_entity_id,
                helper_entity_ids=helper_entity_ids,
            )
            _persist_energy_helper_mapping(catalogue=catalogue, power_entity_id=power_entity_id, mapping=mapping)
            return {
                "ok": False,
                "error": "integration_entity_not_created_after_flow",
                "entity_id": power_entity_id,
                "mapping": mapping,
            }
    else:
        skipped.append(f"already_exists:{total_eid}")

    total_state = hass.states.get(total_eid)
    total_value = _as_float_state(total_state.state if total_state else None)
    if total_value is None:
        mapping = _build_energy_helper_mapping(
            hass=hass,
            ent_reg=ent_reg,
            power_entity_id=power_entity_id,
            helper_entity_ids=helper_entity_ids,
        )
        _persist_energy_helper_mapping(catalogue=catalogue, power_entity_id=power_entity_id, mapping=mapping)
        return {
            "ok": False,
            "error": "total_not_ready",
            "entity_id": power_entity_id,
            "mapping": mapping,
        }

    for suf, cycle in (("day", "daily"), ("week", "weekly"), ("month", "monthly"), ("year", "yearly")):
        meter_name = f"{base}_kwh_{suf}"
        meter_eid = helper_entity_ids[suf]
        reg_meter = ent_reg.async_get(meter_eid)

        if hass.states.get(meter_eid) is not None or reg_meter is not None:
            skipped.append(f"already_exists:{meter_eid}")
            continue

        if _has_config_entry_named(hass, domain="utility_meter", name=meter_name):
            removed = await _remove_config_entry_if_present(hass, domain="utility_meter", name=meter_name)
            if removed:
                skipped.append(f"self_heal_removed:{meter_eid}")
            else:
                errors.append(f"config_entry_exists_but_entity_missing:{meter_eid}")
                continue

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
        if not res.get("ok"):
            errors.append(f"flow_error:{meter_eid}:{res.get('error')}")
            continue

        created.append(meter_eid)
        ok = await _wait_for_entity_or_registry(hass=hass, ent_reg=ent_reg, entity_id=meter_eid, timeout_s=6.0)
        if not ok:
            await _remove_config_entry_if_present(hass, domain="utility_meter", name=meter_name)
            errors.append(f"entity_not_created_after_flow:{meter_eid}")
            continue

        await hass.async_block_till_done()

    mapping = _build_energy_helper_mapping(
        hass=hass,
        ent_reg=ent_reg,
        power_entity_id=power_entity_id,
        helper_entity_ids=helper_entity_ids,
    )
    _persist_energy_helper_mapping(catalogue=catalogue, power_entity_id=power_entity_id, mapping=mapping)

    return {
        "ok": mapping.get("status") in ("ready", "partial"),
        "entity_id": power_entity_id,
        "base": base,
        "created": created,
        "skipped": skipped,
        "errors": errors,
        "mapping": mapping,
    }


class CatalogueReferenceTotalView(HomeAssistantView):
    """Set or clear the \"reference total\" (main meter) item in the persistent catalogue."""

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

        enrich_reference = None
        if target_item is not None:
            enr = target_item.setdefault("enrichment", {})
            enr["is_reference_total"] = True
            enr["include"] = False
            enrich_reference = await _ensure_reference_energy_helpers(
                hass=hass,
                catalogue=cat,
                power_entity_id=entity_id,
            )

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
                "enrich_reference": enrich_reference,
            }
        )
