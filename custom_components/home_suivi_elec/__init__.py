from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .api.unified_api import async_register_unified_api
from .const import (
    DOMAIN,
    STATIC_URL,
    PANEL_URL_PATH,
    PANEL_TITLE,
    PANEL_ICON,
    PANEL_ELEMENT_NAME,
    PANEL_HTML_URL,
)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_register_unified_api(hass)

    static_dir = Path(__file__).parent / "web_static"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(static_dir), False)]
    )

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL_PATH,
        require_admin=True,
        config={
            "_panel_custom": {
                "name": PANEL_ELEMENT_NAME,
                "html_url": PANEL_HTML_URL,
            }
        },
    )

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {}
    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_remove_panel(hass, PANEL_URL_PATH)
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True
