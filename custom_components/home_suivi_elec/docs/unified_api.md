"""
HSE_DOC: custom_components/home_suivi_elec/docs/unified_api.md
HSE_MAINTENANCE: Central registration point for unified HTTP API views.

AI-first:
- Entry point and contracts.
- List of registered views.
- Rules for adding a new view.

Human layer:
- Common failure modes.
- Debug checklist.
"""

---

## Purpose

`unified_api.py` is the single place where Home Assistant HTTP views for this integration are registered.

It should be called once during integration setup (typically from `__init__.py` / `async_setup_entry`).

---

## Entry point

- `async_register_unified_api(hass) -> None`

Behavior:

- Registers these views (order is not important, but keep it stable):
  - `PingView()`
  - `FrontendManifestView()`
  - `EntitiesScanView()`

Each view is registered using:

- `hass.http.register_view(ViewInstance)`

---

## Contract: adding a view

When adding a new API view:

1) Implement a `HomeAssistantView` subclass in `custom_components/home_suivi_elec/api/views/...`.
2) Ensure:
   - `url` is under the integration prefix (see `const.API_PREFIX`).
   - `requires_auth` is correct.
   - Responses are JSON and stable (avoid breaking changes to keys).
3) Import the view class here and register it.
4) Add/update the corresponding doc in `custom_components/home_suivi_elec/docs/`.

---

## Human checklist

If an endpoint returns 404:

1) Confirm the integration is loaded.
2) Confirm `async_register_unified_api()` is called during setup.
3) Check HA logs for startup exceptions.

If an endpoint returns 401:

1) Confirm `requires_auth = True` is intended.
2) Confirm frontend/API caller includes a valid HA token.
