(function () {
  function build_entities_scan_path(options) {
    const include_disabled = options?.include_disabled ? "true" : "false";
    const exclude_hse = options?.exclude_hse === false ? "false" : "true";
    return `home_suivi_elec/unified/entities/scan?include_disabled=${include_disabled}&exclude_hse=${exclude_hse}`;
  }

  async function fetch_entities_scan(hass, options) {
    const path = build_entities_scan_path(options);
    return hass.callApi("GET", path);
  }

  window.hse_entities_scan_api = {
    fetch_entities_scan,
  };
})();
