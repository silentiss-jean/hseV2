# Feature view — custom — `custom.view.js`

Target file:

- `custom_components/home_suivi_elec/web_static/panel/features/custom/custom.view.js`

AI-first: what it renders and which actions/state it expects.
Human layer: usage.

---

## Purpose

Renders the "custom" feature section of the HSE panel.

Document here:

- the UI blocks,
- the expected backend calls (if any),
- the state/actions contract.

---

## Human checklist

If the view doesn't render:

1) Check imports/loader order.
2) Check the shell routing points to the correct module.
