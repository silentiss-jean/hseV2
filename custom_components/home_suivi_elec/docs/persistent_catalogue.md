# Persistent catalogue & enrichment (V1)

HSE should scan existing HA entities, persist a catalogue in backend storage, and allow user enrichment per source.

This document defines the first schema iteration (v1).

---

## Canonical units

Internal canonical units for computation:

- Power: W
- Energy: Wh
- Cost: integer cents

---

## Period model

Two week definitions:

- ISO week: `week` (Monday 00:00 → Sunday 23:59 local)
- Custom week: `week_custom` (configurable start day + time, persisted)

Derived entities naming:

- `*_energy_week` / `*_cost_week` → ISO
- `*_energy_week_custom` / `*_cost_week_custom` → custom

---

## Item schema (v1)

Each item keeps:

- `source.*`: current snapshot from HA + last seen state
- `enrichment.*`: user choices (include/reference/room/type/naming)
- `derived.enabled.*`: gates which derived entities are allowed
- `health.*`: offline tracking and escalation state
- `triage.*`: user triage (mute / removed)

### health

- `first_unavailable_at`: first time we observed `unknown/unavailable` (or `not_provided`)
- `last_ok_at`: last time we observed a non-unavailable state
- `escalation`: `none|error_24h|action_48h`

### triage

- `policy`: `normal|removed`
- `mute_until`: ISO timestamp; while now < mute_until, no escalation should be raised

Important: `triage.policy=removed` is lifecycle/archival, not the same as `enrichment.include=false`.

---
