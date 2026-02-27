(function () {
  async function fetch_overview(hass) {
    const dashboard = await hass.callApi("GET", "home_suivi_elec/unified/dashboard");

    return {
      fetched_at: new Date().toISOString(),
      dashboard,
    };
  }

  // Backward-compatible name used by hse_panel.js (overview refresh button)
  async function fetch_manifest_and_ping(hass) {
    return fetch_overview(hass);
  }

  window.hse_overview_api = { fetch_overview, fetch_manifest_and_ping };
})();
