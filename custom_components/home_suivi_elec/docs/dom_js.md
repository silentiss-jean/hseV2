# Shared DOM helpers — `dom.js`

Target file:

- `custom_components/home_suivi_elec/web_static/shared/ui/dom.js`

AI-first: exported functions and their contracts.
Human layer: usage tips.

---

## Purpose

Provides small DOM utilities used across views.

Document:

- exported symbols on `window.hse_dom`,
- argument contracts,
- escaping / textContent behavior.

---

## Human checklist

If a view breaks:

1) Confirm `window.hse_dom` is loaded before the view.
2) Search for renamed helper functions.
