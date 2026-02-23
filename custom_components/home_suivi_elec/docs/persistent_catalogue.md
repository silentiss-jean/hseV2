# Persistent catalogue & enrichment (V1)

Target concept:

HSE should **scan** existing HA entities, then persist a **catalogue** in backend storage (ConfigEntry scope) and allow users to **enrich** each source once (room/type/reference rules, cost rules, etc.).

This document defines the first schema iteration.

---

## Goals

- Stop requiring manual re-scan on every panel open.
- Persist user enrichment across restarts.
- Avoid entity duplication where possible, but allow HSE to publish derived entities when needed.
- Keep naming user-friendly: derived entities should keep the source prefix when possible.

---

## Terminology

- **Source entity**: an existing HA sensor (usually `sensor.*`) that provides either power or energy.
- **HSE item**: a stable internal record representing one logical equipment/measure, backed by one or more HA entities.
- **Derived entity**: an entity created by HSE (platform `home_suivi_elec`) for standardized metrics (energy_day, cost_month, etc.).

---

## Canonical units

Internal canonical units for computation:

- Power: **W**
- Energy: **Wh**
- Cost: integer **cents** (to avoid float drift)

UI may display kW/kWh/EUR with formatting.

---

## Period model

HSE supports two week definitions:

- ISO week: `week` (fixed Monday 00:00 → Sunday 23:59 local)
- Custom week: `week_custom` (configurable start day + time, persisted)

Derived entities naming:

- `*_energy_week` / `*_cost_week` → ISO week
- `*_energy_week_custom` / `*_cost_week_custom` → custom week

---

## Storage layout

Storage should be scoped per config entry.

Suggested store key:

- `home_suivi_elec.<entry_id>.catalogue`

Top-level JSON structure:

```json
{
  "schema_version": 1,
  "generated_at": "2026-02-23T00:00:00Z",
  "settings": {
    "custom_week_enabled": false,
    "custom_week_start_day": "fri",
    "custom_week_start_time": "00:00"
  },
  "items": {
    "<item_id>": {
      "item_id": "<item_id>",
      "source": {
        "entity_id": "sensor.xxx",
        "kind": "power|energy",
        "unit": "W|kW|Wh|kWh",
        "device_class": "power|energy|null",
        "state_class": "measurement|total_increasing|null",
        "unique_id": "...",
        "device_id": "...",
        "area_id": "...",
        "integration_domain": "...",
        "status": "ok|disabled|not_provided|unknown",
        "status_reason": "...",
        "last_seen_state": "...",
        "last_seen_at": "2026-02-23T00:00:00Z"
      },
      "enrichment": {
        "include": true,
        "is_reference_total": false,
        "room": "salon",
        "type": "tv",
        "tags": ["..."],
        "note": "...",
        "naming": {
          "base_entity_id": "sensor.clim_appart_2_puissance"
        },
        "calculation": {
          "energy_method": "native|integrate_power",
          "power_to_energy_interval_s": 60
        }
      },
      "derived": {
        "enabled": {
          "energy_day": true,
          "energy_week": true,
          "energy_week_custom": false,
          "energy_month": true,
          "energy_year": true,
          "cost_day": true,
          "cost_week": true,
          "cost_week_custom": false,
          "cost_month": true,
          "cost_year": true
        }
      }
    }
  }
}
```

Notes:

- `item_id` should be stable and not depend on entity_id text; use registry `unique_id` when possible.
- `enrichment.naming.base_entity_id` is the prefix used to generate derived entity_ids.
- `derived.enabled` gates entity creation, and can be used to reduce clutter.

---

## Scan → catalogue merge rules

Inputs:

- Scan output from `EntitiesScanView` (see `docs/entities_scan.md`).

Merge strategy:

- New source discovered → create a new item with default enrichment.
- Existing item → update `source.*` fields (status, last_seen_state, etc.) but preserve `enrichment.*`.
- Source missing for a long time → mark stale (do not delete automatically), create a diagnostic.

---

## Diagnostics expectations

Diagnostics should flag:

- Source stuck `unknown/unavailable` longer than a threshold.
- Unit/device_class mismatch (e.g. `kind=energy` but unit missing).
- Energy method mismatch (trying to integrate power but state_class not measurement).
- Double-count risk: `is_reference_total=true` and also included in aggregates.

---
