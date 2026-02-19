/* hse_panel.js - Home Suivi Elec v2 (JS-only panel) */
/* build_signature: 2026-02-19_1356 */

const build_signature = "2026-02-19_1356";

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
  }
`;

class hse_panel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._panel = null;
    this._root = null;

    this._last_render_key = "";
    this._cached_manifest = null;
    this._cached_ping = null;
    this._cached_error = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  set panel(panel) {
    this._panel = panel;
    this._render();
  }

  connectedCallback() {
    if (this._root) return;

    // Signature utile pour vérifier que le bon fichier est chargé
    try {
      // eslint-disable-next-line no-console
      console.info(`[HSE] panel loaded (${build_signature})`);
    } catch (_) {}

    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `<style>${css_text}</style><div class="hse_card"></div>`;
    this._render();
  }

  _render() {
    if (!this._root) return;
    const container = this._root.querySelector(".hse_card");
    if (!container) return;

    const hass_ready = !!this._hass;
    const user_name = this._hass?.user?.name || null;

    const render_key = JSON.stringify({
      hass_ready,
      user_name,
      has_manifest: !!this._cached_manifest,
      has_ping: !!this._cached_ping,
      has_error: !!this._cached_error,
    });

    if (render_key === this._last_render_key) return;
    this._last_render_key = render_key;

    const title = this._cached_manifest?.panel?.title || "Home Suivi Elec";

    container.innerHTML = `
      <div class="hse_title">${title}</div>
      <div class="hse_row">
        <span class="hse_badge">build: ${build_signature}</span>
        <span class="hse_badge">hass: ${hass_ready ? "ok" : "en attente"}</span>
        <span class="hse_badge">user: ${user_name ? user_name : "—"}</span>
      </div>

      <div class="hse_row">
        <button class="hse_button" id="hse_btn_refresh">Rafraîchir</button>
        <div class="hse_muted" id="hse_status">${this._status_text()}</div>
      </div>

      ${this._details_block()}
    `;

    const btn = container.querySelector("#hse_btn_refresh");
    if (btn) btn.addEventListener("click", () => this._refresh());
  }

  _status_text() {
    if (this._cached_error) return "Erreur API (voir détails).";
    if (!this._hass) return "En attente de hass (auth).";
    if (!this._cached_manifest && !this._cached_ping) return "Prêt. Clique sur Rafraîchir.";
    return "OK.";
  }

  _details_block() {
    if (this._cached_error) {
      return `<pre>${this._safe_json({ error: String(this._cached_error) })}</pre>`;
    }

    if (this._cached_manifest || this._cached_ping) {
      return `<pre>${this._safe_json({ manifest: this._cached_manifest, ping: this._cached_ping })}</pre>`;
    }

    return `<pre>${this._safe_json({ hint: "Clique sur Rafraîchir pour appeler l'API." })}</pre>`;
  }

  _safe_json(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (err) {
      return String(err);
    }
  }

  async _refresh() {
    this._cached_error = null;
    this._cached_manifest = null;
    this._cached_ping = null;
    this._last_render_key = "";
    this._render();

    if (!this._hass) {
      this._cached_error = "hass non disponible (panel non initialisé par HA).";
      this._last_render_key = "";
      this._render();
      return;
    }

    try {
      // callApi prend un path sans /api/ (ex: 'hassio/backups') [page:2]
      this._cached_manifest = await this._hass.callApi("GET", "home_suivi_elec/unified/frontend_manifest");
      this._cached_ping = await this._hass.callApi("GET", "home_suivi_elec/unified/ping");
    } catch (err) {
      this._cached_error = err?.message || String(err);
    } finally {
      this._last_render_key = "";
      this._render();
    }
  }
}

customElements.define("hse-panel", hse_panel);
