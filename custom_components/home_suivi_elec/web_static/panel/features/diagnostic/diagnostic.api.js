(function () {
  async function fetch_catalogue(hass) {
    return hass.callApi("GET", "home_suivi_elec/unified/catalogue");
  }

  async function refresh_catalogue(hass) {
    return hass.callApi("POST", "home_suivi_elec/unified/catalogue/refresh", {});
  }

  async function set_item_triage(hass, item_id, triage) {
    const path = `home_suivi_elec/unified/catalogue/item/${encodeURIComponent(item_id)}/triage`;
    return hass.callApi("POST", path, { triage });
  }

  async function bulk_triage(hass, item_ids, triage) {
    return hass.callApi("POST", "home_suivi_elec/unified/catalogue/triage/bulk", { item_ids, triage });
  }

  window.hse_diag_api = { fetch_catalogue, refresh_catalogue, set_item_triage, bulk_triage };
})();
