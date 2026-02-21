/* entrypoint - hse_panel.js */
const build_signature = "2026-02-21_1136_router_multipage";

(function () {
  const PANEL_BASE = "/api/home_suivi_elec/static/panel";
  const SHARED_BASE = "/api/home_suivi_elec/static/shared";

  // Bump ici si tu veux casser le cache de tous les assets chargés par le loader
  const ASSET_V = "0.1.0";

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
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    connectedCallback() {
      if (this._root) return;

      console.info(`[HSE] entry loaded (${build_signature})`);
      window.__hse_panel_loaded = build_signature;

      this._root = this.attachShadow({ mode: "open" });

      // restore last tab (best effort)
      try {
        const saved = window.localStorage.getItem("hse_active_tab");
        if (saved) this._active_tab = saved;
      } catch (_) {}

      this._boot();
    }

    async _boot() {
      if (this._boot_done) return;

      // Fallback loader (si core/loader.js n'est pas utilisé)
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

        // features (existantes)
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/overview/overview.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/overview/overview.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.view.js?v=${ASSET_V}`);

        // css
        const css = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/tokens.css?v=${ASSET_V}`);

        // IMPORTANT: inject CSS + root container (sinon _render() ne trouve jamais #root)
        this._root.innerHTML = `<style>${css}</style><div id="root"></div>`;

        this._boot_done = true;
        this._boot_error = null;
      } catch (err) {
        this._boot_error = err?.message || String(err);
        console.error("[HSE] boot error", err);

        // UI de fallback (au cas où dom.js n'a pas chargé)
        this._root.innerHTML = `
          <style>
            :host{display:block;padding:16px;font-family:system-ui;color:var(--primary-text-color);}
            pre{white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.2);padding:12px;border-radius:10px;}
          </style>
          <div>
            <div style="font-size:18px">Home Suivi Elec</div>
            <div style="opacity:.8">Boot error</div>
            <pre>${this._escape_html(this._boot_error)}</pre>
          </div>
        `;
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
      // Si tu updates core/shell.js pour exposer get_nav_items(), on l’utilise
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
      try {
        window.localStorage.setItem("hse_active_tab", tab_id);
      } catch (_) {}
      this._render();
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

      // RENDER TABS:
      // - si shell.js est encore old (2 tabs), on override ici pour forcer le multi-pages
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

        case "diagnostic":
          this._render_placeholder("Diagnostic", "À venir : logs, cohérence, health-check, cache.");
          return;

        case "config":
          this._render_placeholder("Configuration", "À venir : tarifs, options, capteurs runtime.");
          return;

        case "custom":
          this._render_placeholder("Customisation", "À venir : thème, regroupements, règles.");
          return;

        case "cards":
          this._render_placeholder("Génération cartes", "À venir : génération Lovelace + preview/copy.");
          return;

        case "migration":
          this._render_placeholder("Migration capteurs", "À venir : utility_meter/template export + création auto.");
          return;

        case "costs":
          this._render_placeholder("Analyse de coûts", "À venir : vues jour/semaine/mois + comparaisons.");
          return;

        default:
          this._render_placeholder("Page", `Route inconnue: ${this._active_tab}`);
      }
    }

    _render_nav_tabs() {
      // Force un rendu multi-pages sans dépendre d’une version spécifique de core/shell.js
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
