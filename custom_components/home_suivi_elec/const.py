DOMAIN = "home_suivi_elec"

API_PREFIX = "/api/home_suivi_elec/unified"
STATIC_URL = "/api/home_suivi_elec/static"

PANEL_URL_PATH = "home_suivi_elec"
PANEL_TITLE = "Home Suivi Elec"
PANEL_ICON = "mdi:flash"

PANEL_JS_URL = f"{STATIC_URL}/panel/hse_panel.js?v=0.1.8"
PANEL_ELEMENT_NAME = "hse-panel"

# Catalogue refresh default interval
CATALOGUE_REFRESH_INTERVAL_S = 600  # 10 minutes

# Consider an entity degraded if it stays unavailable/unknown this long.
CATALOGUE_OFFLINE_GRACE_S = 900  # 15 minutes
