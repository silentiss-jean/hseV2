# Panel shell — `shell.js`

Target file:

- `custom_components/home_suivi_elec/web_static/panel/core/shell.js`

AI-first: responsibilities and public API.
Human layer: debugging.

---

## Purpose

Implements the panel shell (top-level layout + navigation), typically:

- header/title,
- tabs,
- routing between feature views,
- mounting/unmounting feature views.

---

## Maintenance notes

Keep in sync when editing:

- tab IDs and routing logic,
- state management shape,
- contracts expected by feature views.

---

## Human checklist

If navigation is broken:

1) Verify tab IDs match feature modules.
2) Verify state is passed correctly to views.
3) Check for JS errors on tab switch.
