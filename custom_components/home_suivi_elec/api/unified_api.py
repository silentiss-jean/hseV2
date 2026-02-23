from __future__ import annotations

from .views.entities_scan import EntitiesScanView
from .views.frontend_manifest import FrontendManifestView
from .views.ping import PingView


def async_register_unified_api(hass) -> None:
    hass.http.register_view(PingView())
    hass.http.register_view(FrontendManifestView())
    hass.http.register_view(EntitiesScanView())