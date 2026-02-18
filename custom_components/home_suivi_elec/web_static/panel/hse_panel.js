const css_text = `
  :host { display: block; padding: 16px; }
  .hse_card {
    background: var(--card-background-color, rgba(0,0,0,0.2));
    border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
    border-radius: 12px;
    padding: 16px;
    max-width: 900px;
    margin: 0 auto;
    color: var(--primary-text-color, #fff);
  }
  .hse_title { font-size: 20px; margin: 0 0 8px 0; }
  .hse_muted { opacity: 0.8; font-size: 13px; }
  pre { margin: 12px 0 0 0; padding: 12px; border-radius: 10px; background: rgba(0,0,0,0.25); overflow: auto; }
`;

class hse_panel extends HTMLElement {
  set hass(hass) { this._hass = hass; this._render(); }
  set panel(panel) { this._panel = panel; this._render(); }

  connectedCallback() {
    if (this._root) return;
    this._root = this.attachShadow({ mode: "open" });
    this._root.innerHTML = `<style>${css_text}</style><div class="hse_card"></div>`;
    this._render();
  }

  async _render() {
    if (!this._root) return;
    const container = this._root.querySelector(".hse_card");
    if (!container) return;

    container.innerHTML = `
      <div class="hse_title">Home Suivi Elec</div>
      <div class="hse_muted">Chargement…</div>
    `;

    if (!this._hass) return;

    try {
      const manifest = await this._hass.callApi("GET", "home_suivi_elec/unified/frontend_manifest");
      const ping = await this._hass.callApi("GET", "home_suivi_elec/unified/ping");

      container.innerHTML = `
        <div class="hse_title">${manifest?.panel?.title || "Home Suivi Elec"}</div>
        <div class="hse_muted">Auth HA OK (hass injecté dans le panel). Version: ${manifest.version}</div>
        <pre>${JSON.stringify({ manifest, ping }, null, 2)}</pre>
      `;
    } catch (err) {
      container.innerHTML = `
        <div class="hse_title">Home Suivi Elec</div>
        <div class="hse_muted">Erreur API</div>
        <pre>${String(err && err.message ? err.message : err)}</pre>
      `;
    }
  }
}

customElements.define("hse-panel", hse_panel);

