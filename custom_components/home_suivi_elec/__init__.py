from __future__ import annotations

from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .api.unified_api import async_register_unified_api
from .const import (
    DOMAIN,
    PANEL_ICON,
    PANEL_MODULE_URL,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STATIC_URL,
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # 1) API
    async_register_unified_api(hass)

    # 2) Static files (async-safe)
    static_dir = Path(__file__).parent / "web_static"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(static_dir), False)]
    )

    # 3) Panel sidebar (custom element)
    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL_PATH,
        config={
            "title": PANEL_TITLE,
            "module_url": PANEL_MODULE_URL,
        },
        require_admin=True,
    )

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = {"panel": PANEL_URL_PATH}
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_remove_panel(hass, PANEL_URL_PATH)
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return True

