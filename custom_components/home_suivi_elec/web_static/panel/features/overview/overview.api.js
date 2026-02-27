(function () {
  async function fetch_overview(hass) {
    const catalogue_p = hass.callApi("GET", "home_suivi_elec/unified/catalogue");
    const pricing_p = hass.callApi("GET", "home_suivi_elec/unified/settings/pricing");

    // Keep scan light: only enabled, exclude HSE.
    const scan_p = hass.callApi(
      "GET",
      "home_suivi_elec/unified/entities/scan?include_disabled=false&exclude_hse=true"
    ).catch(() => ({ integrations: [], candidates: [] }));

    const [catalogue, pricingResp, scan] = await Promise.all([catalogue_p, pricing_p, scan_p]);

    return {
      fetched_at: new Date().toISOString(),
      catalogue,
      pricing: pricingResp?.pricing ?? null,
      defaults: pricingResp?.defaults ?? null,
      scan,
    };
  }

  // Backward-compatible name used by hse_panel.js (overview refresh button)
  async function fetch_manifest_and_ping(hass) {
    return fetch_overview(hass);
  }

  window.hse_overview_api = { fetch_overview, fetch_manifest_and_ping };
})();
