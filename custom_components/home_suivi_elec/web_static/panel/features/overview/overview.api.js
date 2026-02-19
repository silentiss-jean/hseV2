(function () {
  async function fetch_manifest_and_ping(hass) {
    const manifest = await hass.callApi("GET", "home_suivi_elec/unified/frontend_manifest");
    const ping = await hass.callApi("GET", "home_suivi_elec/unified/ping");
    return { manifest, ping };
  }

  window.hse_overview_api = { fetch_manifest_and_ping };
})();
