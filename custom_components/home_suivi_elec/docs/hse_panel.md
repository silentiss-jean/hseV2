# Panel entrypoint — `hse_panel.js`

Target file:

- `custom_components/home_suivi_elec/web_static/panel/hse_panel.js`

AI-first: what global is exported, boot sequence.
Human layer: debug steps.

---

## Purpose

Main entry for the HSE panel web component.

Typically responsible for:

- creating the web component,
- wiring shell + loader + feature modules,
- providing shared services (auth, base URL, config) to feature APIs.

---

## Maintenance notes

Document when editing:

- public globals exported on `window.*`,
- how base URL + token are obtained,
- how CSS is attached.

---

## Human checklist

If panel fails to authenticate:

1) Inspect network calls for missing `Authorization` header.
2) Ensure HA base URL is correct.
3) Check if token retrieval changed.
