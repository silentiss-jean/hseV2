/* entrypoint - hse_panel.js */
const build_signature = "2026-02-27_1633_pricing_defaults_fill_missing";

(function () {
  const PANEL_BASE = "/api/home_suivi_elec/static/panel";
  const SHARED_BASE = "/api/home_suivi_elec/static/shared";

  // IMPORTANT: must match const.py PANEL_JS_URL
  const ASSET_V = "0.1.12";

  const NAV_ITEMS_FALLBACK = [
    { id: "overview", label: "Accueil" },
    { id: "diagnostic", label: "Diagnostic" },
    { id: "scan", label: "Détection" },
    { id: "enrich", label: "Enrichissement" },
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
      this._scan_state = {
        scan_running: false,
        filter_q: "",
        groups_open: {},
        open_all: false,
      };

      this._diag_state = {
        loading: false,
        data: null,
        error: null,
        filter_q: "",
        selected: {},
        advanced: false,
        last_request: null,
        last_response: null,
        last_action: null,
      };

      this._enrich_state = {
        running: false,
        error: null,
        last_result: null,
      };

      this._config_state = {
        loading: false,
        saving: false,
        error: null,
        message: null,
        pricing_saving: false,
        pricing_error: null,
        pricing_message: null,
        scan_result: { integrations: [], candidates: [] },
        catalogue: null,
        current_reference_entity_id: null,
        selected_reference_entity_id: null,
        pricing: null,
        pricing_defaults: null,
        pricing_draft: null,
      };

      this._boot_done = false;
      this._boot_error = null;

      this._theme = "dark";
      this._custom_state = {
        theme: "dark",
        dynamic_bg: true,
        glass: false,
      };

      this._render_raf_scheduled = false;
    }

    set hass(hass) {
      this._hass = hass;

      // IMPORTANT: avoid tearing down interactive UI controls on frequent hass updates.
      // Otherwise <select> and other inputs close/reset while the user interacts.
      if (this._active_tab === "custom") return;
      if (this._active_tab === "config") return;
      if (this._active_tab === "enrich") return;

      this._render();
    }

    connectedCallback() {
      if (this._root) return;

      console.info(`[HSE] entry loaded (${build_signature})`);
      window.__hse_panel_loaded = build_signature;

      this._theme = this._storage_get("hse_theme") || "dark";
      this._custom_state.theme = this._theme;

      this._custom_state.dynamic_bg = (this._storage_get("hse_custom_dynamic_bg") || "1") === "1";
      this._custom_state.glass = (this._storage_get("hse_custom_glass") || "0") === "1";

      this.setAttribute("data-theme", this._theme);
      this._apply_dynamic_bg_override();
      this._apply_glass_override();

      const saved_tab = this._storage_get("hse_active_tab");
      if (saved_tab) this._active_tab = saved_tab;

      try {
        const raw = this._storage_get("hse_scan_groups_open");
        if (raw) this._scan_state.groups_open = JSON.parse(raw) || {};
      } catch (_) {}
      this._scan_state.open_all = (this._storage_get("hse_scan_open_all") || "0") === "1";

      this._diag_state.filter_q = this._storage_get("hse_diag_filter_q") || "";
      this._diag_state.advanced = (this._storage_get("hse_diag_advanced") || "0") === "1";
      try {
        const rawSel = this._storage_get("hse_diag_selected");
        if (rawSel) this._diag_state.selected = JSON.parse(rawSel) || {};
      } catch (_) {}

      this._root = this.attachShadow({ mode: "open" });
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

    _err_msg(err) {
      if (!err) return "?";
      if (typeof err === "string") return err;
      if (err.message) return String(err.message);
      try {
        return JSON.stringify(err);
      } catch (_) {
        return String(err);
      }
    }

    _deep_fill_missing(dst, src) {
      if (!dst || typeof dst !== "object") return;
      if (!src || typeof src !== "object") return;

      for (const k of Object.keys(src)) {
        const v = src[k];
        const cur = dst[k];

        if (cur == null) {
          // clone value so we never keep references to defaults
          try {
            dst[k] = JSON.parse(JSON.stringify(v));
          } catch (_) {
            dst[k] = v;
          }
          continue;
        }

        // only deep-fill plain objects (not arrays)
        if (
          typeof cur === "object" &&
          typeof v === "object" &&
          cur &&
          v &&
          !Array.isArray(cur) &&
          !Array.isArray(v)
        ) {
          this._deep_fill_missing(cur, v);
        }
      }
    }

    async _boot() {
      if (this._boot_done) return;

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
        await window.hse_loader.load_script_once(`${SHARED_BASE}/ui/dom.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${SHARED_BASE}/ui/table.js?v=${ASSET_V}`);

        await window.hse_loader.load_script_once(`${PANEL_BASE}/core/shell.js?v=${ASSET_V}`);

        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/overview/overview.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/overview/overview.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/custom/custom.view.js?v=${ASSET_V}`);

        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/diagnostic/diagnostic.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/diagnostic/diagnostic.view.js?v=${ASSET_V}`);

        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/enrich/enrich.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/enrich/enrich.view.js?v=${ASSET_V}`);

        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/config/config.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/config/config.view.js?v=${ASSET_V}`);

        const css_tokens = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/hse_tokens.shadow.css?v=${ASSET_V}`);
        const css_themes = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/hse_themes.shadow.css?v=${ASSET_V}`);
        const css_alias = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/hse_alias.v2.css?v=${ASSET_V}`);
        const css_panel = await window.hse_loader.load_css_text(`${SHARED_BASE}/styles/tokens.css?v=${ASSET_V}`);

        this._root.innerHTML = `<style>\n${css_tokens}\n\n${css_themes}\n\n${css_alias}\n\n${css_panel}\n</style><div id=\"root\"></div>`;

        this._boot_done = true;
        this._boot_error = null;
      } catch (err) {
        this._boot_error = err?.message || String(err);
        console.error("[HSE] boot error", err);

        this._root.innerHTML = `<style>\n:host{display:block;padding:16px;font-family:system-ui;color:var(--primary-text-color);}\npre{white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.2);padding:12px;border-radius:10px;}\n</style>\n<div>\n  <div style=\"font-size:18px\">Home Suivi Elec</div>\n  <div style=\"opacity:.8\">Boot error</div>\n  <pre>${this._escape_html(this._boot_error)}</pre>\n</div>`;
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
      this.style.setProperty("--hse-bg-dynamic-opacity", this._custom_state.dynamic_bg ? "" : "0");
    }

    _apply_glass_override() {
      this.style.setProperty("--hse-backdrop-filter", this._custom_state.glass ? "blur(18px) saturate(160%)" : "");
    }

    _render() {
      if (!this._root) return;

      const root = this._root.querySelector("#root");
      if (!root) return;

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
        case "diagnostic":
          this._render_diagnostic();
          return;
        case "scan":
          this._render_scan();
          return;
        case "enrich":
          this._render_enrich();
          return;
        case "config":
          this._render_config();
          return;
        case "custom":
          this._render_custom();
          return;
        default:
          this._render_placeholder("Page", "À venir.");
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

    async _render_config() {
      const container = this._ui.content;

      if (!window.hse_config_view || !window.hse_config_api || !window.hse_scan_api) {
        this._render_placeholder("Configuration", "config.view.js non chargé.");
        return;
      }

      const _effective_ref = () => this._config_state.selected_reference_entity_id || this._config_state.current_reference_entity_id || null;

      const _ensure_pricing_draft = () => {
        if (!this._config_state.pricing_draft) {
          // IMPORTANT: create the draft from defaults then overlay saved pricing.
          // This ensures when switching contract_type, missing fields are still pre-filled.
          const base = JSON.parse(JSON.stringify(this._config_state.pricing_defaults || {}));
          const pr = JSON.parse(JSON.stringify(this._config_state.pricing || {}));
          this._deep_fill_missing(pr, base);
          // pr now contains defaults for missing fields
          this._config_state.pricing_draft = pr;
        } else {
          // Ensure new defaults added later are visible (without overriding user values)
          this._deep_fill_missing(this._config_state.pricing_draft, this._config_state.pricing_defaults || {});
        }
      };

      const _cost_ids = () => {
        _ensure_pricing_draft();
        const arr = this._config_state.pricing_draft?.cost_entity_ids;
        return Array.isArray(arr) ? arr : [];
      };

      const _remove_ref_from_cost = () => {
        const ref = _effective_ref();
        if (!ref) return false;
        const ids = _cost_ids();
        if (!ids.includes(ref)) return false;
        this._config_state.pricing_draft.cost_entity_ids = ids.filter((x) => x !== ref);
        return true;
      };

      const _update_from_catalogue = (cat) => {
        this._config_state.catalogue = cat;
        const cur = window.hse_config_view._current_reference_entity_id(cat);
        this._config_state.current_reference_entity_id = cur;
        if (this._config_state.selected_reference_entity_id == null) {
          this._config_state.selected_reference_entity_id = cur;
        }

        // Guardrail: reference cannot be part of cost sensors
        if (_remove_ref_from_cost()) {
          this._config_state.pricing_message = "Garde-fou: le capteur de référence a été retiré des capteurs de calcul.";
        }
      };

      const _update_from_pricing = (resp) => {
        const pr = resp?.pricing || null;
        const defs = resp?.defaults || null;
        this._config_state.pricing = pr;
        this._config_state.pricing_defaults = defs;

        if (this._config_state.pricing_draft == null) {
          // Build a draft that always contains defaults.
          const base = JSON.parse(JSON.stringify(defs || {}));
          const cur = JSON.parse(JSON.stringify(pr || {}));
          this._deep_fill_missing(cur, base);
          this._config_state.pricing_draft = cur;
        } else {
          // Keep existing draft, but fill missing keys with latest defaults.
          this._deep_fill_missing(this._config_state.pricing_draft, defs || {});
        }

        // Guardrail: reference cannot be part of cost sensors
        if (_remove_ref_from_cost()) {
          this._config_state.pricing_message = "Garde-fou: le capteur de référence a été retiré des capteurs de calcul.";
        }
      };

      if (!this._config_state.catalogue && !this._config_state.loading) {
        this._config_state.loading = true;
        this._config_state.error = null;
        this._config_state.message = null;
        this._config_state.pricing_error = null;
        this._config_state.pricing_message = null;
        this._render();

        try {
          this._config_state.scan_result = await window.hse_scan_api.fetch_scan(this._hass, {
            include_disabled: false,
            exclude_hse: true,
          });

          const cat = await window.hse_config_api.fetch_catalogue(this._hass);
          _update_from_catalogue(cat);

          const pricingResp = await window.hse_config_api.fetch_pricing(this._hass);
          _update_from_pricing(pricingResp);
        } catch (err) {
          this._config_state.error = this._err_msg(err);
        } finally {
          this._config_state.loading = false;
          this._render();
        }
        return;
      }

      window.hse_config_view.render_config(container, this._config_state, async (action, value) => {
        const _deep_set = (obj, path, v) => {
          if (!obj || typeof obj !== "object") return;
          const parts = String(path || "").split(".").filter(Boolean);
          if (!parts.length) return;
          let cur = obj;
          for (let i = 0; i < parts.length - 1; i++) {
            const k = parts[i];
            if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
            cur = cur[k];
          }
          cur[parts[parts.length - 1]] = v;
        };

        if (action === "select_reference") {
          this._config_state.selected_reference_entity_id = value;
          this._config_state.message = null;
          return;
        }

        if (action === "pricing_patch") {
          const path = value?.path;
          const v = value?.value;
          const no_render = value?.no_render === true;

          _ensure_pricing_draft();
          _deep_set(this._config_state.pricing_draft, path, v);

          // If user switched contract type, ensure the newly visible fields are pre-filled
          if (path === "contract_type") {
            this._deep_fill_missing(this._config_state.pricing_draft, this._config_state.pricing_defaults || {});
          }

          this._config_state.pricing_message = null;
          this._config_state.pricing_error = null;

          if (!no_render) this._render();
          return;
        }

        if (action === "pricing_list_add") {
          const eid = value?.entity_id;
          if (!eid) return;

          const ref = _effective_ref();
          if (ref && eid === ref) {
            this._config_state.pricing_message = "Impossible: le capteur de référence ne peut pas être inclus dans les capteurs de calcul.";
            this._config_state.pricing_error = null;
            this._render();
            return;
          }

          const ids = _cost_ids();
          if (!ids.includes(eid)) ids.push(eid);
          this._config_state.pricing_draft.cost_entity_ids = ids;
          this._config_state.pricing_message = null;
          this._config_state.pricing_error = null;
          this._render();
          return;
        }

        if (action === "pricing_list_remove") {
          const eid = value?.entity_id;
          if (!eid) return;
          const ids = _cost_ids().filter((x) => x !== eid);
          this._config_state.pricing_draft.cost_entity_ids = ids;
          this._config_state.pricing_message = null;
          this._config_state.pricing_error = null;
          this._render();
          return;
        }

        if (action === "pricing_clear") {
          const ok = window.confirm("Effacer les tarifs enregistrés ?");
          if (!ok) return;

          this._config_state.pricing_saving = true;
          this._config_state.pricing_error = null;
          this._config_state.pricing_message = null;
          this._render();

          try {
            await window.hse_config_api.clear_pricing(this._hass);
            const pricingResp = await window.hse_config_api.fetch_pricing(this._hass);
            this._config_state.pricing_draft = null;
            _update_from_pricing(pricingResp);
            this._config_state.pricing_message = "Tarifs effacés.";
          } catch (err) {
            this._config_state.pricing_error = this._err_msg(err);
          } finally {
            this._config_state.pricing_saving = false;
            this._render();
          }
          return;
        }

        if (action === "pricing_save") {
          _ensure_pricing_draft();

          // Ensure missing fields are filled before validation on backend
          this._deep_fill_missing(this._config_state.pricing_draft, this._config_state.pricing_defaults || {});

          // Guardrail before saving
          if (_remove_ref_from_cost()) {
            this._config_state.pricing_message = "Garde-fou: le capteur de référence a été retiré des capteurs de calcul.";
          }

          const ok = window.confirm("Sauvegarder ces tarifs (et la sélection de capteurs) ?");
          if (!ok) return;

          this._config_state.pricing_saving = true;
          this._config_state.pricing_error = null;
          this._config_state.pricing_message = null;
          this._render();

          try {
            await window.hse_config_api.set_pricing(this._hass, this._config_state.pricing_draft);
            const pricingResp = await window.hse_config_api.fetch_pricing(this._hass);
            this._config_state.pricing_draft = null;
            _update_from_pricing(pricingResp);
            this._config_state.pricing_message = "Tarifs sauvegardés.";
          } catch (err) {
            this._config_state.pricing_error = this._err_msg(err);
          } finally {
            this._config_state.pricing_saving = false;
            this._render();
          }
          return;
        }

        if (action === "refresh") {
          this._config_state.loading = true;
          this._config_state.error = null;
          this._config_state.message = null;
          this._config_state.pricing_error = null;
          this._config_state.pricing_message = null;
          this._render();

          try {
            await window.hse_config_api.refresh_catalogue(this._hass);

            this._config_state.scan_result = await window.hse_scan_api.fetch_scan(this._hass, {
              include_disabled: false,
              exclude_hse: true,
            });

            const cat = await window.hse_config_api.fetch_catalogue(this._hass);
            _update_from_catalogue(cat);

            const pricingResp = await window.hse_config_api.fetch_pricing(this._hass);
            _update_from_pricing(pricingResp);
          } catch (err) {
            this._config_state.error = this._err_msg(err);
          } finally {
            this._config_state.loading = false;
            this._render();
          }
          return;
        }

        if (action === "clear_reference") {
          const ok = window.confirm("Supprimer la référence compteur ?");
          if (!ok) return;

          this._config_state.saving = true;
          this._config_state.error = null;
          this._config_state.message = null;
          this._render();

          try {
            await window.hse_config_api.set_reference_total(this._hass, null);
            const cat = await window.hse_config_api.fetch_catalogue(this._hass);
            _update_from_catalogue(cat);
            this._config_state.selected_reference_entity_id = null;
            this._config_state.message = "Référence supprimée.";
          } catch (err) {
            this._config_state.error = this._err_msg(err);
          } finally {
            this._config_state.saving = false;
            this._render();
          }
          return;
        }

        if (action === "save_reference") {
          const entity_id = this._config_state.selected_reference_entity_id;
          if (!entity_id) {
            this._config_state.message = "Aucune référence sélectionnée (rien à sauvegarder).";
            this._render();
            return;
          }

          _ensure_pricing_draft();
          const ids = _cost_ids();
          if (ids.includes(entity_id)) {
            this._config_state.pricing_draft.cost_entity_ids = ids.filter((x) => x !== entity_id);
            this._config_state.pricing_message = "Garde-fou: la référence a été retirée des capteurs de calcul.";
          }

          const ok = window.confirm(`Définir la référence compteur sur ${entity_id} ?\n(Elle sera exclue des totaux mesurés)`);
          if (!ok) return;

          this._config_state.saving = true;
          this._config_state.error = null;
          this._config_state.message = null;
          this._render();

          try {
            try {
              await window.hse_config_api.set_reference_total(this._hass, entity_id);
            } catch (err) {
              await window.hse_config_api.refresh_catalogue(this._hass);
              await window.hse_config_api.set_reference_total(this._hass, entity_id);
            }

            const cat = await window.hse_config_api.fetch_catalogue(this._hass);
            _update_from_catalogue(cat);
            this._config_state.message = "Référence sauvegardée.";
          } catch (err) {
            this._config_state.error = this._err_msg(err);
          } finally {
            this._config_state.saving = false;
            this._render();
          }
          return;
        }
      });
    }

    // (rest of file unchanged)

    async _render_enrich() {
      const container = this._ui.content;

      if (!window.hse_enrich_view || !window.hse_enrich_api) {
        this._render_placeholder("Enrichissement", "enrich.view.js non chargé.");
        return;
      }

      const api = {
        preview: (payload) => window.hse_enrich_api.preview(this._hass, payload),
        apply: (payload) => window.hse_enrich_api.apply(this._hass, payload),
      };

      window.hse_enrich_view.render_enrich(container, this._enrich_state, async (action) => {
        if (action !== "run") return;

        this._enrich_state.running = true;
        this._enrich_state.error = null;
        this._enrich_state.last_result = null;
        this._render();

        try {
          const preview = await api.preview({});
          if (preview?.summary?.decisions_required_count > 0 || preview?.summary?.errors_count > 0) {
            const ok = window.confirm(
              `Décisions requises: ${preview?.summary?.decisions_required_count || 0} / Erreurs: ${preview?.summary?.errors_count || 0}. Ouvrir le détail ?`
            );
            this._enrich_state.last_result = preview;
            if (!ok) return;
            return;
          }

          const applied = await api.apply({});
          this._enrich_state.last_result = { preview, applied };
        } catch (err) {
          this._enrich_state.error = this._err_msg(err);
        } finally {
          this._enrich_state.running = false;
          this._render();
        }
      });
    }

    // (rest of file unchanged)

    async _render_diagnostic() {
      // unchanged
      const { el } = window.hse_dom;
      const container = this._ui.content;

      if (!window.hse_diag_view || !window.hse_diag_api) {
        this._render_placeholder("Diagnostic", "diagnostic.view.js non chargé.");
        return;
      }

      // ... unchanged ...
    }

    _render_custom() {
      // unchanged
    }

    async _render_overview() {
      // unchanged
    }

    _render_scan() {
      // unchanged
    }
  }

  customElements.define("hse-panel", hse_panel);
})();
