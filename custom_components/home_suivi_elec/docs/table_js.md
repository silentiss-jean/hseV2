# Shared table helper — `table.js`

Target file:

- `custom_components/home_suivi_elec/web_static/shared/ui/table.js`

AI-first: table rendering API.
Human layer: usage.

---

## Purpose

Provides a small table renderer used by views (e.g. scan integration summary).

Document:

- exported symbol on `window.hse_table`,
- expected column descriptors,
- rendering behavior for missing values.

---

## Human checklist

If tables render empty:

1) Confirm rows are passed as arrays.
2) Confirm columns have correct `get_value`.
3) Check CSS `.hse_table` styling.
