# Unified API registration — `unified_api.py`

This document describes how the unified HTTP API views are registered for this integration.

Target file:

- `custom_components/home_suivi_elec/api/unified_api.py`

This is written **AI-first** (explicit list of views and their intent), with a human layer (usage notes / checklist).

---

## Purpose

Central place to register HTTP views (endpoints) exposed by the integration.

This file is expected to be called once during integration setup to attach routes to `hass.http`.

---

## Entry point

- `async_register_unified_api(hass) -> None`

Behavior:

- Registers the following views:
  - `PingView()` — connectivity check / health ping.
  - `FrontendManifestView()` — frontend assets/manifest support.
  - `EntitiesScanView()` — "Détection" scan endpoint returning power/energy sensor candidates.

Implementation note:

- Registration uses `hass.http.register_view(ViewClass())`.

---

## Design notes

- This file should remain small and declarative.
- When adding/removing endpoints, update both:
  - this document
  - any user-facing docs that reference the endpoint URLs

---

## Human checklist

When an endpoint "disappears":

1) Confirm `async_register_unified_api()` is called by the integration setup.
2) Confirm the view class is imported and registered here.
3) Check HA logs for errors during integration setup.

