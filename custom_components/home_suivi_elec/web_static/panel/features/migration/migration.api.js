/* migration.api.js */
(function () {
  const BASE = "home_suivi_elec/unified/migration";

  async function export_yaml(hass, payload) {
    return hass.callApi("post", `${BASE}/export`, payload || {});
  }

  window.hse_migration_api = { export_yaml };
})();
