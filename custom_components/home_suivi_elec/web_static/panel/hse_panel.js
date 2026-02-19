/* hse_panel.js - Home Suivi Elec v2 (JS-only panel) */
const build_signature = "2026-02-19_1421_scan";

const css_text = `
  :host {
    display: block;
    padding: 16px;
    box-sizing: border-box;
    color: var(--primary-text-color, #fff);
    font-family: var(--paper-font-body1_-_font-family, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif);
  }

  .hse_card {
    background: var(--card-background-color, rgba(0,0,0,0.2));
    border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
    border-radius: 12px;
    padding: 16px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .hse_title {
    font-size: 20px;
    margin: 0 0 8px 0;
    line-height: 1.2;
  }

  .hse_section_title {
    margin: 16px 0 8px 0;
    font-size: 14px;
    opacity: 0.9;
    letter-spacing: 0.2px;
    text-transform: uppercase;
  }

  .hse_row {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    margin: 8px 0 0 0;
  }

  .hse_badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
    background: rgba(0,0,0,0.18);
    font-size: 12px;
    opacity: 0.95;
  }

  .hse_muted {
    opacity: 0.78;
    font-size: 13px;
  }

  .hse_button {
    border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
    background: rgba(0,0,0,0.18);
    color: inherit;
    border-radius: 10px;
    padding: 8px 10px;
    cursor: pointer;
    font-size: 13px;
  }

  .hse_button:hover {
    background: rgba(0,0,0,0.28);
  }

  .hse_button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  pre {
    margin: 12px 0 0 0;
    padding: 12px;
    border-radius: 10px;
    background: rgba(0,0,0,0.25);
    overflow: auto;
    max-height: 420px;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

class hse_panel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._panel = null;

    this._root = null;
    this._els = null;

    this._manifest = null;
    this._ping = null;
    this._error = null;

    this._scan = null;
    this._scan_error = null;
    this._scan_running = false;
  }

  set hass(hass) {
    this._hass = hass;
    this._update_view();
  }

  set panel(panel) {
    this._panel = panel;
    this._update_view();
  }

  connectedCallback() {
    if (this._root) return;

    console.info(`[HSE] panel loaded (${build_signature})`);
    window.__hse_panel_loaded = build_signature;

    this._root = this.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = css_text;

    const card = document.createElement("div");
    card.className = "hse_card";

    const title = document.createElement("div");
    title.className = "hse_title";
    title.textContent = "Home Suivi Elec";

    const row_badges = document.createElement("div");
    row_badges.className = "hse_row";

    const badge_build = document.createElement("span");
    badge_build.className = "hse_badge";
    badge_build.textContent = `build: ${build_signature}`;

    const badge_hass = document.createElement("span");
    badge_hass.className = "hse_badge";
    badge_hass.textContent = "hass: en attente";

    const badge_user = document.createElement("span");
    badge_user.className = "hse_badge";
    badge_user.textContent = "user: —";

    row_badges.appendChild(badge_build);
    row_badges.appendChild(badge_hass);
    row_badges.appendChild(badge_user);

    const row_actions = document.createElement("div");
    row_actions.className = "hse_row";

    const btn_refresh = document.createElement("button");
    btn_refresh.className = "hse_button";
    btn_refresh.textContent = "Rafraîchir (manifest/ping)";
    btn_refresh.addEventListener("click", () => this._refresh());

    const btn_scan = document.createElement("button");
    btn_scan.className = "hse_button";
    btn_scan.textContent = "Scanner";
    btn_scan.addEventListener("click", () => this._scan_entities());

    const status = document.createElement("div");
    status.className = "hse_muted";
    status.textContent = "Prêt.";

    row_actions.appendChild(btn_refresh);
    row_actions.appendChild(btn_scan);
    row_actions.appendChild(status);

    const section_api = document.createElement("div");
    section_api.className = "hse_section_title";
    section_api.textContent = "API (manifest / ping)";

    const pre_api = document.createElement("pre");
    pre_api.textContent = JSON.stringify(
      { hint: "Clique sur Rafraîchir pour appeler l'API." },
      null,
      2
    );

    const section_scan = document.createElement("div");
    section_scan.className = "hse_section_title";
    section_scan.textContent = "Scan";

    const pre_scan = document.createElement("pre");
    pre_scan.textContent = JSON.stringify(
      { hint: "Clique sur Scanner pour lister les entités power/energy." },
      null,
      2
    );

    card.appendChild(title);
    card.appendChild(row_badges);
    card.appendChild(row_actions);
    card.appendChild(section_api);
    card.appendChild(pre_api);
    card.appendChild(section_scan);
    card.appendChild(pre_scan);

    this._root.appendChild(style);
    this._root.appendChild(card);

    this._els = {
      title,
      badge_hass,
      badge_user,
      status,
      btn_refresh,
      btn_scan,
      pre_api,
      pre_scan,
    };

    this._update_view();
  }

  _update_view() {
    if (!this._els) return;

    const hass_ok = !!this._hass;
    const user_name = this._hass?.user?.name || "—";

    this._els.badge_hass.textContent = `hass: ${hass_ok ? "ok" : "en attente"}`;
    this._els.badge_user.textContent = `user: ${user_name}`;

    this._els.btn_refresh.disabled = !hass_ok;
    this._els.btn_scan.disabled = !hass_ok || this._scan_running;

    if (!hass_ok) {
      this._els.status.textContent = "En attente de hass (auth).";
      return;
    }

    if (this._error) {
      this._els.status.textContent = "Erreur API (manifest/ping).";
      this._els.pre_api.textContent = JSON.stringify({ error: String(this._error) }, null, 2);
    } else if (this._manifest || this._ping) {
      const title = this._manifest?.panel?.title || "Home Suivi Elec";
      this._els.title.textContent = title;
      this._els.status.textContent = this._scan_running ? "Scan en cours…" : "OK.";
      this._els.pre_api.textContent = JSON.stringify({ manifest: this._manifest, ping: this._ping }, null, 2);
    } else {
      this._els.status.textContent = this._scan_running ? "Scan en cours…" : "Prêt.";
    }

    if (this._scan_error) {
      this._els.pre_scan.textContent = JSON.stringify({ error: String(this._scan_error) }, null, 2);
    } else if (this._scan) {
      this._els.pre_scan.textContent = JSON.stringify(this._scan, null, 2);
    }
  }

  async _refresh() {
    this._error = null;
    this._manifest = null;
    this._ping = null;
    this._update_view();

    try {
      // callApi attend un path sans "/api/" (il ajoute et gère l'auth) [page:1]
      this._manifest = await this._hass.callApi("GET", "home_suivi_elec/unified/frontend_manifest");
      this._ping = await this._hass.callApi("GET", "home_suivi_elec/unified/ping");
    } catch (err) {
      this._error = err?.message || String(err);
      console.error("[HSE] refresh error", err);
    } finally {
      this._update_view();
    }
  }

  async _scan_entities() {
    this._scan_error = null;
    this._scan = null;
    this._scan_running = true;
    this._update_view();

    try {
      const path = "home_suivi_elec/unified/entities/scan?include_disabled=false&exclude_hse=true";
      this._scan = await this._hass.callApi("GET", path); // [page:1]
    } catch (err) {
      this._scan_error = err?.message || String(err);
      console.error("[HSE] scan error", err);
    } finally {
      this._scan_running = false;
      this._update_view();
    }
  }
}

customElements.define("hse-panel", hse_panel);
