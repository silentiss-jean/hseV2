/* entrypoint - hse_panel.js */
const build_signature = "2026-02-21_1316_full_custom_theme";

(function () {
  const PANEL_BASE = "/api/home_suivi_elec/static/panel";
  const SHARED_BASE = "/api/home_suivi_elec/static/shared";

  // Bump pour casser le cache des assets chargés par le loader
  const ASSET_V = "0.1.2";

  const NAV_ITEMS_FALLBACK = [
    { id: "overview", label: "Accueil" },
    { id: "diagnostic", label: "Diagnostic" },
    { id: "scan", label: "Détection" },
    { id: "config", label: "Configuration" },
    { id: "custom", label: "Customisation" },
    { id: "cards", label: "Génération cartes" },
    { id: "migration", label: "Migration capteurs" },
    { id: "costs", label: "Analyse de coûts" },
  ];

  class hse_panel extends HTMLElement {
    constructor() {
      super();

      this._hass = null;
      this._root = null;
      this._ui = null;

      this._active_tab = "overview";
      this._overview_data = null;

      this._scan_result = { integrations: [], candidates: [] };
      this._scan_state = { scan_running: false, filter_q: "" };

      this._boot_done = false;
      this._boot_error = null;

      this._theme = "dark";
      this._custom_state = {
        theme: "dark",
        dynamic_bg: true,
        glass: false,
      };
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    connectedCallback() {
      if (this._root) return;

      console.info(`[HSE] entry loaded (${build_signature})`);
      window.__hse_panel_loaded = build_signature;

      // Theme (host attribute => CSS :host([data-theme="..."]) )
      this._theme = this._storage_get("hse_theme") || "dark";
      this.setAttribute("data-theme", this._theme);

      // Restore custom toggles (optional)
      this._custom_state.theme = this._theme;
      this._custom_state.dynamic_bg = (this._storage_get("hse_custom_dynamic_bg") || "1") === "1";
      this._custom_state.glass = (this._storage_get("hse_custom_glass") || "0") === "1";

      // Apply overrides for toggles (host-level overrides; "" => revert to theme default)
      this._apply_dynamic_bg_override();
      this._apply_glass_override();

      this._root = this.attachShadow({ mode: "open" });

      // Restore last tab
      const saved_tab = this._storage_get("hse_active_tab");
      if (saved_tab) this._active_tab = saved_tab;

      this._boot();
    }

    _storage_get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (_) {
        return null;
      }
    }

    _storage_set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (_) {}
    }

    async _boot() {
      if (this._boot_done) return;

      // Loader minimal inline fallback
      if (!window.hse_loader) {
        window.hse_loader = {
          load_script_once: (url) =>
            new Promise((resolve, reject) => {
              const s = document.createElement("script");
              s.src = url;
              s.async = true;
              s.onload = resolve;
              s.onerror = () => reject(new Error(`script_load_failed: ${url}`));
              document.head.appendChild(s);
            }),
          load_css_text: async (url) => {
            const resp = await fetch(url, { cache: "no-store" });
            if (!resp.ok) throw new Error(`css_load_failed: ${url} (${resp.status})`);
            return resp.text();
          },
        };
      }

      try {
        // shared libs
        await window.hse_loader.load_script_once(`${SHARED_BASE}/ui/dom.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${SHARED_BASE}/ui/table.js?v=${ASSET_V}`);

        // core
        await window.hse_loader.load_script_once(`${PANEL_BASE}/core/shell.js?v=${ASSET_V}`);

        // features
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/overview/overview.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/overview/overview.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/custom/custom.view.js?v=${ASSET_V}`);

        // CSS (shadow-ready)
        const css_tokens = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/hse_tokens.shadow.css?v=${ASSET_V}`);
        const css_themes = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/hse_themes.shadow.css?v=${ASSET_V}`);
        const css_alias = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/hse_alias.v2.css?v=${ASSET_V}`);
        const css_panel = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/tokens.css?v=${ASSET_V}`);

        // IMPORTANT: injecter le CSS + root container
        this._root.innerHTML = `<style>
${css_tokens}

${css_themes}

${css_alias}

${css_panel}
</style><div id="root"></div>`;

        this._boot_done = true;
        this._boot_error = null;
      } catch (err) {
        this._boot_error = err?.message || String(err);
        console.error("[HSE] boot error", err);

        this._root.innerHTML = `<style>
:host{display:block;padding:16px;font-family:system-ui;color:var(--primary-text-color);}
pre{white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.2);padding:12px;border-radius:10px;}
</style>
<div>
  <div style="font-size:18px">Home Suivi Elec</div>
  <div style="opacity:.8">Boot error</div>
  <pre>${this._escape_html(this._boot_error)}</pre>
</div>`;
      } finally {
        this._render();
      }
    }

    _escape_html(s) {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    _get_nav_items() {
      const from_shell = window.hse_shell?.get_nav_items?.();
      if (Array.isArray(from_shell) && from_shell.length) return from_shell;
      return NAV_ITEMS_FALLBACK;
    }

    _ensure_valid_tab() {
      const items = this._get_nav_items();
      if (!items.some((x) => x.id === this._active_tab)) {
        this._active_tab = items[0]?.id || "overview";
      }
    }

    _set_active_tab(tab_id) {
      this._active_tab = tab_id;
      this._storage_set("hse_active_tab", tab_id);
      this._render();
    }

    _set_theme(theme_key) {
      this._theme = theme_key || "dark";
      this._custom_state.theme = this._theme;

      this.setAttribute("data-theme", this._theme);
      this._storage_set("hse_theme", this._theme);

      this._render();
    }

    _apply_dynamic_bg_override() {
      // "" => revert theme value, "0" => disable dynamic background
      this.style.setProperty("--hse-bg-dynamic-opacity", this._custom_state.dynamic_bg ? "" : "0");
    }

    _apply_glass_override() {
      // "" => revert theme value, otherwise force a glass filter
      this.style.setProperty("--hse-backdrop-filter", this._custom_state.glass ? "blur(18px) saturate(160%)" : "");
    }

    _render() {
      if (!this._root) return;

      const root = this._root.querySelector("#root");
      if (!root) return; // boot KO -> fallback affiché

      if (!window.hse_shell || !window.hse_dom) return;

      const user_name = this._hass?.user?.name || "—";

      if (!this._ui) {
        this._ui = window.hse_shell.create_shell(root, { user_name });
      }

      this._ui.header_right.textContent = `user: ${user_name}`;

      this._ensure_valid_tab();
      this._render_nav_tabs();

      window.hse_dom.clear(this._ui.content);

      if (!this._hass) {
        this._ui.content.appendChild(window.hse_dom.el("div", "hse_card", "En attente de hass…"));
        return;
      }

      switch (this._active_tab) {
        case "overview":
          this._render_overview();
          return;

        case "scan":
          this._render_scan();
          return;

        case "custom":
          this._render_custom();
          return;

        case "diagnostic":
          this._render_placeholder("Diagnostic", "À venir.");
          return;

        case "config":
          this._render_placeholder("Configuration", "À venir.");
          return;

        case "cards":
          this._render_placeholder("Génération cartes", "À venir.");
          return;

        case "migration":
          this._render_placeholder("Migration capteurs", "À venir.");
          return;

        case "costs":
          this._render_placeholder("Analyse de coûts", "À venir.");
          return;

        default:
          this._render_placeholder("Page", `Route inconnue: ${this._active_tab}`);
      }
    }

    _render_nav_tabs() {
      const { el, clear } = window.hse_dom;
      clear(this._ui.tabs);

      for (const it of this._get_nav_items()) {
        const b = el("button", "hse_tab", it.label);
        b.dataset.active = it.id === this._active_tab ? "true" : "false";
        b.addEventListener("click", () => this._set_active_tab(it.id));
        this._ui.tabs.appendChild(b);
      }
    }

    _render_placeholder(title, subtitle) {
      const { el } = window.hse_dom;

      const card = el("div", "hse_card");
      card.appendChild(el("div", null, title));
      card.appendChild(el("div", "hse_subtitle", subtitle || "À venir."));
      this._ui.content.appendChild(card);
    }

    _render_custom() {
      const container = this._ui.content;

      if (!window.hse_custom_view?.render_customisation) {
        this._render_placeholder("Customisation", "custom.view.js non chargé.");
        return;
      }

      window.hse_custom_view.render_customisation(container, this._custom_state, (action, value) => {
        if (action === "set_theme") {
          const theme = value || "dark";
          this._set_theme(theme);
          return;
        }

        if (action === "toggle_dynamic_bg") {
          this._custom_state.dynamic_bg = !this._custom_state.dynamic_bg;
          this._storage_set("hse_custom_dynamic_bg", this._custom_state.dynamic_bg ? "1" : "0");
          this._apply_dynamic_bg_override();
          this._render();
          return;
        }

        if (action === "toggle_glass") {
          this._custom_state.glass = !this._custom_state.glass;
          this._storage_set("hse_custom_glass", this._custom_state.glass ? "1" : "0");
          this._apply_glass_override();
          this._render();
          return;
        }
      });
    }

    async _render_overview() {
      const { el } = window.hse_dom;
      const container = this._ui.content;

      const card = el("div", "hse_card");
      const toolbar = el("div", "hse_toolbar");

      const btn = el("button", "hse_button hse_button_primary", "Rafraîchir");
      btn.addEventListener("click", async () => {
        this._overview_data = null;
        this._render();

        try {
          this._overview_data = await window.hse_overview_api.fetch_manifest_and_ping(this._hass);
        } catch (err) {
          this._overview_data = { error: err?.message || String(err) };
        }

        this._render();
      });

      toolbar.appendChild(btn);
      card.appendChild(toolbar);
      container.appendChild(card);

      if (!this._overview_data) {
        container.appendChild(el("div", "hse_subtitle", "Clique sur Rafraîchir."));
        return;
      }

      window.hse_overview_view.render_overview(container, this._overview_data);
    }

    _render_scan() {
      const container = this._ui.content;

      window.hse_scan_view.render_scan(container, this._scan_result, this._scan_state, async (action, value) => {
        if (action === "filter") {
          this._scan_state.filter_q = value || "";
          this._render();
          return;
        }

        if (action === "scan") {
          this._scan_state.scan_running = true;
          this._render();

          try {
            this._scan_result = await window.hse_scan_api.fetch_scan(this._hass, {
              include_disabled: false,
              exclude_hse: true,
            });
          } catch (err) {
            this._scan_result = { error: err?.message || String(err), integrations: [], candidates: [] };
          } finally {
            this._scan_state.scan_running = false;
            this._render();
          }
        }
      });
    }
  }

  customElements.define("hse-panel", hse_panel);
})();
