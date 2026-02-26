/* enrich.api.js */
(function () {
  const BASE = "/api/home_suivi_elec/unified/enrich";

  async function preview(hass, payload) {
    return hass.callApi("post", `${BASE}/preview`, payload || {});
  }

  async function apply(hass, payload) {
    return hass.callApi("post", `${BASE}/apply`, payload || {});
  }

  window.hse_enrich_api = { preview, apply };
})();
