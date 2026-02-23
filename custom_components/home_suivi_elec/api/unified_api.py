"""
HSE_DOC: custom_components/home_suivi_elec/docs/unified_api.md
HSE_MAINTENANCE: If you add/remove/rename views here, update the doc above.
"""

from __future__ import annotations

from .views.entities_scan import EntitiesScanView
from .views.frontend_manifest import FrontendManifestView
from .views.ping import PingView


def async_register_unified_api(hass) -> None:
    hass.http.register_view(PingView())
    hass.http.register_view(FrontendManifestView())
    hass.http.register_view(EntitiesScanView())
