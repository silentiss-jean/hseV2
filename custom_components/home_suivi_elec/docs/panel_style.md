# Panel stylesheet — `style.hse.panel.css`

Target file:

- `custom_components/home_suivi_elec/web_static/panel/style.hse.panel.css`

AI-first: what it styles and how it is loaded.
Human layer: extension guidance.

---

## Purpose

Panel-specific stylesheet (layout and feature-specific rules) for the HSE panel.

Keep this file for panel-specific overrides; shared primitives belong in `shared/styles/tokens.css`.

---

## Human checklist

If styles don't apply:

1) Confirm the CSS file is loaded by the panel loader/manifest.
2) Check shadow DOM scoping.
