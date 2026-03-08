/* entrypoint - hse_panel.js */
const build_signature = "2026-03-08_1632_cost_analysis_v1";

(function () {
  const PANEL_BASE = "/api/home_suivi_elec/static/panel";
  const SHARED_BASE = "/api/home_suivi_elec/static/shared";

  // IMPORTANT: must match const.py PANEL_JS_URL
  const ASSET_V = "0.1.30";

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
      this._overview_timer = null;
      this._overview_refreshing = false;

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
        check_loading: false,
        check_error: null,
        check_result: null,
      };

      this._migration_state = {
        loading: false,
        error: null,
        last: null,
        active_yaml: "",
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
        reference_status: null,
        reference_status_error: null,
        pricing: null,
        pricing_defaults: null,
        pricing_draft: null,
        cost_filter_q: "",
      };

      this._boot_done = false;
      this._boot_error = null;

      this._theme = "ha";
      this._custom_state = {
        theme: "ha",
        dynamic_bg: true,
        glass: false,
      };

      this._org_state = {
        loading: false,
        saving: false,
        dirty: false,
        error: null,
        message: null,
        meta_store: null,
        meta_draft: null,
        preview_running: false,
        apply_running: false,
        show_raw: false,
        rooms_filter_q: "",
        assignments_filter_q: "",
      };

      this._render_raf_scheduled = false;
      this._reference_status_timer = null;
      this._reference_status_polling = false;
      this._reference_status_target_entity_id = undefined;
    }

    disconnectedCallback() {
      this._clear_overview_autorefresh();
      this._clear_reference_status_polling();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._active_tab === "custom") return;
      if (this._active_tab === "config") return;
      this._render();
    }

    connectedCallback() {
      if (this._root) return;

      console.info(`[HSE] entry loaded (${build_signature})`);
      window.__hse_panel_loaded = build_signature;

      this._theme = this._storage_get("hse_theme") || "ha";
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

      this._config_state.cost_filter_q = this._storage_get("hse_config_cost_filter_q") || "";

      this._root = this.attachShadow({ mode: "open" });
      this._boot();
    }

    _storage_get(key) {
      try { return window.localStorage.getItem(key); } catch (_) { return null; }
    }

    _storage_set(key, value) {
      try { window.localStorage.setItem(key, value); } catch (_) {}
    }

    _err_msg(err) {
      if (!err) return "?";
      if (typeof err === "string") return err;
      if (err.message) return String(err.message);
      try { return JSON.stringify(err); } catch (_) { return String(err); }
    }

    _deep_fill_missing(dst, src) {
      if (!dst || typeof dst !== "object") return;
      if (!src || typeof src !== "object") return;
      for (const k of Object.keys(src)) {
        const v = src[k];
        const cur = dst[k];
        if (cur == null) {
          try { dst[k] = JSON.parse(JSON.stringify(v)); } catch (_) { dst[k] = v; }
          continue;
        }
        if (typeof cur === "object" && typeof v === "object" && cur && v && !Array.isArray(cur) && !Array.isArray(v)) {
          this._deep_fill_missing(cur, v);
        }
      }
    }

    _deep_set(obj, path, v) {
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
    }

    _render_ui_error(title, err) {
      try {
        console.error(`[HSE] UI error in ${title}`, err);
        if (!this._ui || !window.hse_dom) return;
        const { el, clear } = window.hse_dom;
        clear(this._ui.content);
        const card = el("div", "hse_card");
        card.appendChild(el("div", null, `Erreur UI: ${title}`));
        card.appendChild(el("pre", "hse_code", this._err_msg(err)));
        this._ui.content.appendChild(card);
      } catch (_) {}
    }

    _clear_overview_autorefresh() {
      if (this._overview_timer) {
        try { window.clearInterval(this._overview_timer); } catch (_) {}
      }
      this._overview_timer = null;
      this._overview_refreshing = false;
    }

    _reference_effective_entity_id() {
      return this._config_state.selected_reference_entity_id || this._config_state.current_reference_entity_id || null;
    }

    _clear_reference_status_polling() {
      if (this._reference_status_timer) {
        try { window.clearInterval(this._reference_status_timer); } catch (_) {}
      }
      this._reference_status_timer = null;
      this._reference_status_polling = false;
      this._reference_status_target_entity_id = undefined;
    }

    _ensure_reference_status_polling() {
      if (this._reference_status_timer) return;
      if (!this._hass || !window.hse_config_api?.get_reference_total_status) return;
      const tick = async () => { await this._fetch_reference_status(); };
      this._reference_status_timer = window.setInterval(tick, 4000);
      tick();
    }

    async _fetch_reference_status(for_entity_id) {
      if (!this._hass || !window.hse_config_api?.get_reference_total_status) return null;
      const requested_entity_id = for_entity_id === undefined ? this._reference_effective_entity_id() : for_entity_id;
      this._reference_status_target_entity_id = requested_entity_id;
      if (this._reference_status_polling) return this._config_state.reference_status;
      this._reference_status_polling = true;
      try {
        while (true) {
          const entity_id = this._reference_status_target_entity_id;
          const resp = await window.hse_config_api.get_reference_total_status(this._hass, entity_id);
          if (this._reference_status_target_entity_id !== entity_id) continue;
          const effective_entity_id = this._reference_effective_entity_id();
          if (effective_entity_id !== entity_id) {
            this._reference_status_target_entity_id = effective_entity_id;
            continue;
          }
          this._config_state.reference_status = resp || null;
          this._config_state.reference_status_error = null;
          return resp || null;
        }
      } catch (err) {
        this._config_state.reference_status_error = this._err_msg(err);
        return null;
      } finally {
        this._reference_status_polling = false;
        if (this._active_tab === "config") this._render();
      }
    }

    _ensure_overview_autorefresh() {
      if (this._overview_timer) return;
      const tick = async () => {
        if (this._overview_refreshing) return;
        this._overview_refreshing = true;
        try {
          const fn = window.hse_overview_api?.fetch_overview || window.hse_overview_api?.fetch_manifest_and_ping;
          if (!fn) throw new Error("overview_api_not_loaded");
          this._overview_data = await fn(this._hass);
        } catch (err) {
          this._overview_data = { error: this._err_msg(err) };
        } finally {
          this._overview_refreshing = false;
          this._render();
        }
      };
      this._overview_timer = window.setInterval(tick, 30000);
      if (!this._overview_data) tick();
    }

    _org_ensure_draft() {
      if (this._org_state.meta_draft) return;
      const m = this._org_state.meta_store?.meta || null;
      if (m) {
        try { this._org_state.meta_draft = JSON.parse(JSON.stringify(m)); } catch (_) { this._org_state.meta_draft = m; }
      } else {
        this._org_state.meta_draft = { rooms: {}, types: {}, assignments: {} };
      }
      if (!this._org_state.meta_draft.rooms) this._org_state.meta_draft.rooms = {};
      if (!this._org_state.meta_draft.types) this._org_state.meta_draft.types = {};
      if (!this._org_state.meta_draft.assignments) this._org_state.meta_draft.assignments = {};
    }

    _org_reset_draft_from_store() {
      const m = this._org_state.meta_store?.meta || null;
      if (!m) {
        this._org_state.meta_draft = { rooms: {}, types: {}, assignments: {} };
      } else {
        try { this._org_state.meta_draft = JSON.parse(JSON.stringify(m)); } catch (_) { this._org_state.meta_draft = m; }
      }
      if (!this._org_state.meta_draft.rooms) this._org_state.meta_draft.rooms = {};
      if (!this._org_state.meta_draft.types) this._org_state.meta_draft.types = {};
      if (!this._org_state.meta_draft.assignments) this._org_state.meta_draft.assignments = {};
      this._org_state.dirty = false;
    }

    async _org_fetch_meta() {
      if (!this._hass || this._org_state.loading) return;
      this._org_state.loading = true;
      this._org_state.error = null;
      this._org_state.message = null;
      this._render();
      try {
        const resp = await this._hass.callApi("get", "home_suivi_elec/unified/meta");
        this._org_state.meta_store = resp?.meta_store || null;
        this._org_state.error = null;
        if (!this._org_state.dirty) this._org_reset_draft_from_store();
        else this._org_ensure_draft();
      } catch (err) {
        this._org_state.error = this._err_msg(err);
      } finally {
        this._org_state.loading = false;
        this._render();
      }
    }

    async _org_save_meta() {
      if (!this._hass) return;
      if (this._org_state.saving || this._org_state.loading || this._org_state.preview_running || this._org_state.apply_running) return;
      this._org_ensure_draft();
      const ok = window.confirm("Sauvegarder l'organisation (meta: rooms/types/assignments) ?");
      if (!ok) return;
      this._org_state.saving = true;
      this._org_state.error = null;
      this._org_state.message = "Sauvegarde…";
      this._render();
      try {
        const resp = await this._hass.callApi("post", "home_suivi_elec/unified/meta", { meta: this._org_state.meta_draft });
        this._org_state.meta_store = resp?.meta_store || this._org_state.meta_store;
        this._org_state.message = "Organisation sauvegardée.";
        this._org_state.error = null;
        this._org_state.dirty = false;
        if (!this._org_state.dirty) this._org_reset_draft_from_store();
      } catch (err) {
        this._org_state.error = this._err_msg(err);
        this._org_state.message = "Échec de sauvegarde.";
      } finally {
        this._org_state.saving = false;
        this._render();
      }
    }

    async _org_preview() {
      if (!this._hass || this._org_state.preview_running || this._org_state.loading) return;
      this._org_state.preview_running = true;
      this._org_state.error = null;
      this._org_state.message = null;
      this._render();
      try {
        const resp = await this._hass.callApi("post", "home_suivi_elec/unified/meta/sync/preview", { persist: true });
        this._org_state.meta_store = resp?.meta_store || this._org_state.meta_store;
        this._org_state.error = null;
        this._org_state.message = "Propositions mises à jour.";
        if (!this._org_state.dirty) this._org_reset_draft_from_store();
        else this._org_ensure_draft();
      } catch (err) {
        this._org_state.error = this._err_msg(err);
      } finally {
        this._org_state.preview_running = false;
        this._render();
      }
    }

    async _org_apply(apply_mode) {
      if (!this._hass || this._org_state.apply_running || this._org_state.loading || this._org_state.preview_running) return;
      const mode = apply_mode === "all" ? "all" : "auto";
      const msg = mode === "all" ? "Appliquer les changements proposés (mode ALL) ?\nCe mode peut écraser des choix manuels." : "Appliquer les changements proposés (mode auto) ?\nAucun champ manuel ne sera écrasé.";
      const ok = window.confirm(msg);
      if (!ok) return;
      this._org_state.apply_running = true;
      this._org_state.error = null;
      this._org_state.message = null;
      this._render();
      try {
        const resp = await this._hass.callApi("post", "home_suivi_elec/unified/meta/sync/apply", { apply_mode: mode });
        this._org_state.meta_store = resp?.meta_store || this._org_state.meta_store;
        this._org_state.error = null;
        this._org_state.message = "Changements appliqués.";
        if (!this._org_state.dirty) this._org_reset_draft_from_store();
        else this._org_ensure_draft();
      } catch (err) {
        this._org_state.error = this._err_msg(err);
      } finally {
        this._org_state.apply_running = false;
        this._render();
      }
    }

    async _boot() {
      if (this._boot_done) return;
      if (!window.hse_loader) {
        window.hse_loader = {
          load_script_once: (url) => new Promise((resolve, reject) => {
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
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/costs/costs.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/scan/scan.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/custom/custom.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/diagnostic/diagnostic.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/diagnostic/diagnostic.view.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/enrich/enrich.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/migration/migration.api.js?v=${ASSET_V}`);
        await window.hse_loader.load_script_once(`${PANEL_BASE}/features/migration/migration.view.js?v=${ASSET_V}`);
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
      return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    _get_nav_items() {
      const from_shell = window.hse_shell?.get_nav_items?.();
      const items = Array.isArray(from_shell) && from_shell.length ? from_shell : NAV_ITEMS_FALLBACK;
      return items.filter((x) => x && x.id !== "enrich");
    }

    _ensure_valid_tab() {
      const items = this._get_nav_items();
      if (!items.some((x) => x.id === this._active_tab)) this._active_tab = items[0]?.id || "overview";
    }

    _set_active_tab(tab_id) {
      this._active_tab = tab_id;
      this._storage_set("hse_active_tab", tab_id);
      this._render();
    }

    _set_theme(theme_key) {
      this._theme = theme_key || "ha";
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
      if (!root || !window.hse_shell || !window.hse_dom) return;
      const user_name = this._hass?.user?.name || "—";
      if (!this._ui) this._ui = window.hse_shell.create_shell(root, { user_name });
      this._ui.header_right.textContent = `user: ${user_name}`;
      this._ensure_valid_tab();
      this._render_nav_tabs();
      window.hse_dom.clear(this._ui.content);
      if (!this._hass) {
        this._ui.content.appendChild(window.hse_dom.el("div", "hse_card", "En attente de hass…"));
        return;
      }
      if (!["overview", "costs"].includes(this._active_tab)) this._clear_overview_autorefresh();
      if (this._active_tab !== "config") this._clear_reference_status_polling();
      try {
        switch (this._active_tab) {
          case "overview":
            this._render_overview().catch((err) => this._render_ui_error("Accueil", err));
            return;
          case "costs":
            this._render_costs().catch((err) => this._render_ui_error("Analyse de coûts", err));
            return;
          case "diagnostic":
            this._render_diagnostic().catch((err) => this._render_ui_error("Diagnostic", err));
            return;
          case "scan":
            this._render_scan();
            return;
          case "migration":
            this._render_migration().catch((err) => this._render_ui_error("Migration", err));
            return;
          case "config":
            this._render_config().catch((err) => this._render_ui_error("Configuration", err));
            return;
          case "custom":
            this._render_custom().catch((err) => this._render_ui_error("Customisation", err));
            return;
          default:
            this._render_placeholder("Page", "À venir.");
        }
      } catch (err) {
        this._render_ui_error("render", err);
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

    async _render_costs() {
      const { el, clear } = window.hse_dom;
      const container = this._ui.content;
      this._ensure_overview_autorefresh();

      const card = el("div", "hse_card");
      const toolbar = el("div", "hse_toolbar");
      const btn = el("button", "hse_button hse_button_primary", "Rafraîchir");
      btn.addEventListener("click", async () => {
        this._overview_data = null;
        this._render();
        try {
          const fn = window.hse_overview_api?.fetch_overview || window.hse_overview_api?.fetch_manifest_and_ping;
          if (!fn) throw new Error("overview_api_not_loaded");
          this._overview_data = await fn(this._hass);
        } catch (err) {
          this._overview_data = { error: this._err_msg(err) };
        }
        this._render();
      });
      toolbar.appendChild(btn);
      card.appendChild(toolbar);
      container.appendChild(card);

      const body = el("div");
      container.appendChild(body);
      if (!this._overview_data) {
        body.appendChild(el("div", "hse_subtitle", "Chargement…"));
        return;
      }
      if (this._overview_data?.error) {
        const err_card = el("div", "hse_card");
        err_card.appendChild(el("div", null, "Erreur"));
        err_card.appendChild(el("pre", "hse_code", String(this._overview_data.error)));
        body.appendChild(err_card);
        return;
      }
      clear(body);
      if (!window.hse_costs_view?.render_costs) {
        this._render_placeholder("Analyse de coûts", "costs.view.js non chargé.");
        return;
      }
      window.hse_costs_view.render_costs(body, this._overview_data, this._hass);
    }

    async _render_migration() { /* unchanged runtime section below intentionally concise */
      const container = this._ui.content;
      if (!window.hse_migration_view || !window.hse_migration_api) {
        this._render_placeholder("Migration", "migration.view.js non chargé.");
        return;
      }
      const run = async (opt) => {
        this._migration_state.loading = true;
        this._migration_state.error = null;
        this._render();
        try {
          const resp = await window.hse_migration_api.export_yaml(this._hass, { mode: "selection" });
          this._migration_state.last = resp;
          this._migration_state.active_yaml = resp?.exports?.[opt] || "";
        } catch (err) {
          this._migration_state.error = this._err_msg(err);
        } finally {
          this._migration_state.loading = false;
          this._render();
        }
      };
      window.hse_migration_view.render_migration(container, this._migration_state, async (action, payload) => {
        if (action === "export" || action === "preview") await run(payload?.option);
      });
    }

    async _render_config() { return hse_panel.prototype.__proto__?._render_config?.call?.(this); }
    async _render_diagnostic() { return hse_panel.prototype.__proto__?._render_diagnostic?.call?.(this); }
    async _render_custom() { return hse_panel.prototype.__proto__?._render_custom?.call?.(this); }
    async _render_overview() { return hse_panel.prototype.__proto__?._render_overview?.call?.(this); }
    _render_scan() { return hse_panel.prototype.__proto__?._render_scan?.call?.(this); }
  }

  customElements.define("hse-panel", hse_panel);
})();
