from __future__ import annotations

from homeassistant.components.http import HomeAssistantView

from ..const import API_PREFIX, PANEL_MODULE_URL, PANEL_TITLE, STATIC_URL

VERSION = "0.1.0"


class PingView(HomeAssistantView):
    url = f"{API_PREFIX}/ping"
    name = "home_suivi_elec:unified:ping"
    requires_auth = True

    async def get(self, request):
        return self.json({"ok": True, "api": "unified", "version": VERSION})


class FrontendManifestView(HomeAssistantView):
    url = f"{API_PREFIX}/frontend_manifest"
    name = "home_suivi_elec:unified:frontend_manifest"
    requires_auth = True

    async def get(self, request):
        return self.json(
            {
                "ok": True,
                "version": VERSION,
                "panel": {
                    "title": PANEL_TITLE,
                    "module_url": PANEL_MODULE_URL,
                },
                "static": {
                    "url": STATIC_URL
                },
                "features": {
                    "scan": False,
                    "auto_select": False,
                    "cost_preview": False
                },
            }
        )


def async_register_unified_api(hass) -> None:
    hass.http.register_view(PingView())
    hass.http.register_view(FrontendManifestView())

