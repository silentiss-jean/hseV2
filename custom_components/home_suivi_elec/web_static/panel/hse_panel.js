/* entrypoint - hse_panel.js */
const build_signature = "2026-02-26_1735_config_renderfix";

(function () {
  const PANEL_BASE = "/api/home_suivi_elec/static/panel";
  const SHARED_BASE = "/api/home_suivi_elec/static/shared";

  // IMPORTANT: must match const.py PANEL_JS_URL
  const ASSET_V = "0.1.8";

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
        scan_result: { integrations: [], candidates: [] },
        catalogue: null,
        current_reference_entity_id: null,
        selected_reference_entity_id: null,
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

      const _update_from_catalogue = (cat) => {
        this._config_state.catalogue = cat;
        const cur = window.hse_config_view._current_reference_entity_id(cat);
        this._config_state.current_reference_entity_id = cur;
        if (this._config_state.selected_reference_entity_id == null) {
          this._config_state.selected_reference_entity_id = cur;
        }
      };

      if (!this._config_state.catalogue && !this._config_state.loading) {
        this._config_state.loading = true;
        this._config_state.error = null;
        this._config_state.message = null;
        this._render();

        try {
          this._config_state.scan_result = await window.hse_scan_api.fetch_scan(this._hass, {
            include_disabled: false,
            exclude_hse: true,
          });

          const cat = await window.hse_config_api.fetch_catalogue(this._hass);
          _update_from_catalogue(cat);
        } catch (err) {
          this._config_state.error = this._err_msg(err);
        } finally {
          this._config_state.loading = false;
          this._render();
        }
        return;
      }

      window.hse_config_view.render_config(container, this._config_state, async (action, value) => {
        if (action === "select_reference") {
          // IMPORTANT: do not re-render on each selection change.
          // Rendering clears the container, which recreates the <select> and closes it.
          this._config_state.selected_reference_entity_id = value;
          this._config_state.message = null;
          return;
        }

        if (action === "refresh") {
          this._config_state.loading = true;
          this._config_state.error = null;
          this._config_state.message = null;
          this._render();

          try {
            // refresh catalogue first so reference_total endpoint can resolve entity_id
            await window.hse_config_api.refresh_catalogue(this._hass);

            this._config_state.scan_result = await window.hse_scan_api.fetch_scan(this._hass, {
              include_disabled: false,
              exclude_hse: true,
            });

            const cat = await window.hse_config_api.fetch_catalogue(this._hass);
            _update_from_catalogue(cat);
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
              // common case: catalogue not yet containing the entity_id
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
      const { el } = window.hse_dom;
      const container = this._ui.content;

      if (!window.hse_diag_view || !window.hse_diag_api) {
        this._render_placeholder("Diagnostic", "diagnostic.view.js non chargé.");
        return;
      }

      const diag_api = {
        fetch_catalogue: () => window.hse_diag_api.fetch_catalogue(this._hass),
        refresh_catalogue: () => window.hse_diag_api.refresh_catalogue(this._hass),
        set_item_triage: (item_id, triage) => window.hse_diag_api.set_item_triage(this._hass, item_id, triage),
        bulk_triage: (item_ids, triage) => window.hse_diag_api.bulk_triage(this._hass, item_ids, triage),
      };

      const _wrap_last = async (label, fn) => {
        try {
          this._diag_state.last_action = label;
          this._diag_state.last_request = null;
          const resp = await fn();
          this._diag_state.last_response = resp;
          return resp;
        } catch (err) {
          this._diag_state.last_response = { error: this._err_msg(err) };
          throw err;
        }
      };

      if (!this._diag_state.data && !this._diag_state.loading) {
        this._diag_state.loading = true;
        try {
          this._diag_state.data = await _wrap_last("fetch_catalogue", () => diag_api.fetch_catalogue());
          this._diag_state.error = null;
        } catch (err) {
          this._diag_state.error = this._err_msg(err);
        } finally {
          this._diag_state.loading = false;
        }
      }

      if (this._diag_state.error) {
        container.appendChild(el("div", "hse_card", `Erreur: ${this._diag_state.error}`));
        return;
      }

      if (!this._diag_state.data) {
        container.appendChild(el("div", "hse_card", "Chargement…"));
        return;
      }

      const _selected_ids = () => Object.keys(this._diag_state.selected || {}).filter((k) => this._diag_state.selected[k]);

      const _mute_until_days = (days) => {
        const fn = window.hse_diag_view?._local_iso_days_from_now;
        if (fn) return fn(days);

        const dd = new Date();
        dd.setDate(dd.getDate() + days);
        const pad = (n) => String(n).padStart(2, "0");
        const yyyy = dd.getFullYear(), mm = pad(dd.getMonth() + 1), da = pad(dd.getDate());
        const hh = pad(dd.getHours()), mi = pad(dd.getMinutes()), ss = pad(dd.getSeconds());
        const tzMin = -dd.getTimezoneOffset();
        const sign = tzMin >= 0 ? "+" : "-";
        const tzAbs = Math.abs(tzMin);
        const tzh = pad(Math.floor(tzAbs / 60)), tzm = pad(tzAbs % 60);
        return `${yyyy}-${mm}-${da}T${hh}:${mi}:${ss}${sign}${tzh}:${tzm}`;
      };

      const _filtered_ids = () => {
        const fn = window.hse_diag_view?._filtered_escalated_items;
        if (!fn) return [];
        return fn(this._diag_state.data, this._diag_state.filter_q).map((x) => x.id);
      };

      window.hse_diag_view.render_diagnostic(container, this._diag_state.data, this._diag_state, async (action, payload) => {
        if (action === "toggle_advanced") {
          this._diag_state.advanced = !this._diag_state.advanced;
          this._storage_set("hse_diag_advanced", this._diag_state.advanced ? "1" : "0");
          this._render();
          return;
        }

        if (action === "filter") {
          this._diag_state.filter_q = payload || "";
          this._storage_set("hse_diag_filter_q", this._diag_state.filter_q);
          this._diag_state.selected = {};
          this._storage_set("hse_diag_selected", "{}");
          this._render();
          return;
        }

        if (action === "select") {
          if (payload && payload.item_id) {
            this._diag_state.selected[payload.item_id] = !!payload.checked;
            this._storage_set("hse_diag_selected", JSON.stringify(this._diag_state.selected));
          }
          this._render();
          return;
        }

        if (action === "select_none") {
          this._diag_state.selected = {};
          this._storage_set("hse_diag_selected", "{}");
          this._render();
          return;
        }

        if (action === "select_all_filtered") {
          const ids = _filtered_ids();
          for (const id of ids) this._diag_state.selected[id] = true;
          this._storage_set("hse_diag_selected", JSON.stringify(this._diag_state.selected));
          this._render();
          return;
        }

        if (action === "bulk_mute") {
          const mode = payload?.mode || "selection";
          const ids = mode === "filtered" ? _filtered_ids() : _selected_ids();
          if (!ids.length) return;

          const days = payload?.days || 7;
          const mute_until = _mute_until_days(days);

          const ok = window.confirm(`Appliquer MUTE ${days}j sur ${ids.length} item(s) (${mode}) ?`);
          if (!ok) return;

          await _wrap_last("bulk_triage/mute", () => diag_api.bulk_triage(ids, { mute_until }));
          this._diag_state.data = await _wrap_last("fetch_catalogue", () => diag_api.fetch_catalogue());
          this._render();
          return;
        }

        if (action === "bulk_removed") {
          const mode = payload?.mode || "selection";
          const ids = mode === "filtered" ? _filtered_ids() : _selected_ids();
          if (!ids.length) return;

          const ok = window.confirm(`Appliquer REMOVED sur ${ids.length} item(s) (${mode}) ?`);
          if (!ok) return;

          await _wrap_last("bulk_triage/removed", () => diag_api.bulk_triage(ids, { policy: "removed" }));
          this._diag_state.data = await _wrap_last("fetch_catalogue", () => diag_api.fetch_catalogue());
          this._render();
          return;
        }

        if (action === "refresh") {
          await _wrap_last("refresh_catalogue", () => diag_api.refresh_catalogue());
          this._diag_state.data = await _wrap_last("fetch_catalogue", () => diag_api.fetch_catalogue());
          this._render();
          return;
        }

        if (action === "mute") {
          await _wrap_last("set_item_triage/mute", () => diag_api.set_item_triage(payload.item_id, { mute_until: payload.mute_until }));
          this._diag_state.data = await _wrap_last("fetch_catalogue", () => diag_api.fetch_catalogue());
          this._render();
          return;
        }

        if (action === "removed") {
          await _wrap_last("set_item_triage/removed", () => diag_api.set_item_triage(payload.item_id, { policy: "removed" }));
          this._diag_state.data = await _wrap_last("fetch_catalogue", () => diag_api.fetch_catalogue());
          this._render();
          return;
        }
      });
    }

    _render_custom() {
      const container = this._ui.content;

      if (!window.hse_custom_view?.render_customisation) {
        this._render_placeholder("Customisation", "custom.view.js non chargé.");
        return;
      }

      window.hse_custom_view.render_customisation(container, this._custom_state, (action, value) => {
        if (action === "set_theme") {
          this._set_theme(value || "dark");
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
          this._overview_data = { error: this._err_msg(err) };
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

        if (action === "set_group_open") {
          const { id, open, no_render } = value || {};
          if (id) {
            this._scan_state.groups_open[id] = !!open;
            this._storage_set("hse_scan_groups_open", JSON.stringify(this._scan_state.groups_open));
          }
          if (!no_render) this._render();
          return;
        }

        if (action === "open_all") {
          this._scan_state.open_all = true;
          this._storage_set("hse_scan_open_all", "1");
          this._render();
          return;
        }

        if (action === "close_all") {
          this._scan_state.open_all = false;
          this._scan_state.groups_open = {};
          this._storage_set("hse_scan_open_all", "0");
          this._storage_set("hse_scan_groups_open", "{}");
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
            this._scan_result = { error: this._err_msg(err), integrations: [], candidates: [] };
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
