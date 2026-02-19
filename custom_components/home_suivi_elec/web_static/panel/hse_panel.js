/* hse_panel.js - Home Suivi Elec v2 (JS-only panel) */
const build_signature = "2026-02-19_1400";

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
    max-width: 980px;
    margin: 0 auto;
  }

  .hse_title {
    font-size: 20px;
    margin: 0 0 8px 0;
    line-height: 1.2;
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

    const row = document.createElement("div");
    row.className = "hse_row";

    const badge_build = document.createElement("span");
    badge_build.className = "hse_badge";
    badge_build.textContent = `build: ${build_signature}`;

    const badge_hass = document.createElement("span");
    badge_hass.className = "hse_badge";
    badge_hass.textContent = "hass: en attente";

    const badge_user = document.createElement("span");
    badge_user.className = "hse_badge";
    badge_user.textContent = "user: —";

    row.appendChild(badge_build);
    row.appendChild(badge_hass);
    row.appendChild(badge_user);

    const row_actions = document.createElement("div");
    row_actions.className = "hse_row";

    const btn = document.createElement("button");
    btn.className = "hse_button";
    btn.textContent = "Rafraîchir";
    btn.addEventListener("click", () => this._refresh());

    const status = document.createElement("div");
    status.className = "hse_muted";
    status.textContent = "Prêt.";

    row_actions.appendChild(btn);
    row_actions.appendChild(status);

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify({ hint: "Clique sur Rafraîchir pour appeler l'API." }, null, 2);

    card.appendChild(title);
    card.appendChild(row);
    card.appendChild(row_actions);
    card.appendChild(pre);

    this._root.appendChild(style);
    this._root.appendChild(card);

    this._els = { title, badge_hass, badge_user, status, pre };
    this._update_view();
  }

  _update_view() {
    if (!this._els) return;

    const hass_ok = !!this._hass;
    const user_name = this._hass?.user?.name || "—";

    this._els.badge_hass.textContent = `hass: ${hass_ok ? "ok" : "en attente"}`;
    this._els.badge_user.textContent = `user: ${user_name}`;

    if (this._error) {
      this._els.status.textContent = "Erreur API.";
      this._els.pre.textContent = JSON.stringify({ error: String(this._error) }, null, 2);
      return;
    }

    if (this._manifest || this._ping) {
      const title = this._manifest?.panel?.title || "Home Suivi Elec";
      this._els.title.textContent = title;
      this._els.status.textContent = "OK.";
      this._els.pre.textContent = JSON.stringify({ manifest: this._manifest, ping: this._ping }, null, 2);
      return;
    }

    if (!hass_ok) {
      this._els.status.textContent = "En attente de hass (auth).";
      return;
    }

    this._els.status.textContent = "Prêt. Clique sur Rafraîchir.";
  }

  async _refresh() {
    this._error = null;
    this._manifest = null;
    this._ping = null;
    this._update_view();

    if (!this._hass) {
      this._error = "hass non disponible.";
      this._update_view();
      return;
    }

    try {
      this._manifest = await this._hass.callApi("GET", "home_suivi_elec/unified/frontend_manifest");
      this._ping = await this._hass.callApi("GET", "home_suivi_elec/unified/ping");
    } catch (err) {
      this._error = err?.message || String(err);
    } finally {
      this._update_view();
    }
  }
}

customElements.define("hse-panel", hse_panel);
