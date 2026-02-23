# Panel loader — `loader.js`

Target file:

- `custom_components/home_suivi_elec/web_static/panel/core/loader.js`

AI-first: what it loads, in which order.
Human layer: troubleshooting.

---

## Purpose

Bootstraps the HSE panel frontend:

- loads required JS/CSS assets,
- ensures shared helpers are available,
- initializes the panel shell.

---

## Maintenance notes

Document when editing:

- asset URLs / cache-busting,
- global namespaces exported to `window.*`,
- init sequence.

---

## Human checklist

If the panel is blank:

1) Check browser console for load errors.
2) Confirm URLs in `FrontendManifestView` (if used).
3) Confirm loader order still matches dependencies.
