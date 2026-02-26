"""
HSE_DOC: custom_components/home_suivi_elec/docs/unified_api.md
HSE_MAINTENANCE: If you add/remove/rename views here, update the doc above.
"""

from __future__ import annotations

from .views.catalogue_get import CatalogueGetView
from .views.catalogue_item_triage import CatalogueItemTriageView
from .views.catalogue_refresh import CatalogueRefreshView
from .views.catalogue_triage_bulk import CatalogueTriageBulkView
from .views.enrich_apply import EnrichApplyView
from .views.enrich_preview import EnrichPreviewView
from .views.entities_scan import EntitiesScanView
from .views.frontend_manifest import FrontendManifestView
from .views.ping import PingView


def async_register_unified_api(hass) -> None:
    hass.http.register_view(PingView())
    hass.http.register_view(FrontendManifestView())
    hass.http.register_view(EntitiesScanView())
    hass.http.register_view(CatalogueGetView())
    hass.http.register_view(CatalogueRefreshView())
    hass.http.register_view(CatalogueItemTriageView())
    hass.http.register_view(CatalogueTriageBulkView())
    hass.http.register_view(EnrichPreviewView())
    hass.http.register_view(EnrichApplyView())
