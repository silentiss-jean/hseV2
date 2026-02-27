/*
HSE_DOC: custom_components/home_suivi_elec/docs/config_ui.md
HSE_MAINTENANCE: If you change endpoints here, update config_api.md.
*/

(function () {
  async function fetch_catalogue(hass) {
    return hass.callApi("GET", "home_suivi_elec/unified/catalogue");
  }

  async function refresh_catalogue(hass) {
    return hass.callApi("POST", "home_suivi_elec/unified/catalogue/refresh", {});
  }

  async function set_reference_total(hass, entity_id) {
    return hass.callApi("POST", "home_suivi_elec/unified/catalogue/reference_total", {
      entity_id: entity_id ?? null,
    });
  }

  async function fetch_pricing(hass) {
    return hass.callApi("GET", "home_suivi_elec/unified/settings/pricing");
  }

  async function set_pricing(hass, pricing) {
    return hass.callApi("POST", "home_suivi_elec/unified/settings/pricing", { pricing });
  }

  async function clear_pricing(hass) {
    return hass.callApi("POST", "home_suivi_elec/unified/settings/pricing", { clear: true });
  }

  window.hse_config_api = {
    fetch_catalogue,
    refresh_catalogue,
    set_reference_total,
    fetch_pricing,
    set_pricing,
    clear_pricing,
  };
})();
