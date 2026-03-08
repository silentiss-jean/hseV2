/*
HSE_DOC: custom_components/home_suivi_elec/docs/config_ui.md
HSE_MAINTENANCE: If you change UI semantics here, update the doc above.
*/

(function () {
  const { el, clear } = window.hse_dom;

  function _current_reference_entity_id(catalogue) {
    const items = catalogue?.items || {};
    for (const it of Object.values(items)) {
      if (!it || typeof it !== "object") continue;
      const enr = it.enrichment || {};
      if (enr.is_reference_total === true) {
        const src = it.source || {};
        return src.entity_id || null;
      }
    }
    return null;
  }

  function _reference_status_from_catalogue(catalogue, entity_id) {
    const items = catalogue?.items || {};
    let fallback = null;

    for (const it of Object.values(items)) {
      if (!it || typeof it !== "object") continue;
      const src = it.source || {};
      const wf = it.workflow?.reference_enrichment;
      if (!wf || typeof wf !== "object") continue;

      const snapshot = {
        item_id: it.id || null,
        entity_id: src.entity_id || null,
        ...wf,
      };

      if (entity_id && snapshot.entity_id === entity_id) return snapshot;
      if (it.enrichment?.is_reference_total === true) fallback = snapshot;
      else if (!fallback) fallback = snapshot;
    }

    return fallback;
  }

  function _power_candidates(scan_result) {
    const out = [];
    for (const c of scan_result?.candidates || []) {
      if (!c) continue;
      if (c.kind !== "power") continue;
      const status = String(c.status || "").toLowerCase();
      if (status && status !== "ok") continue;
      const st = String(c.ha_state || "").toLowerCase();
      if (st === "unavailable" || st === "unknown") continue;
      out.push(c);
    }

    out.sort((a, b) => {
      const ai = String(a.integration_domain || "");
      const bi = String(b.integration_domain || "");
      if (ai !== bi) return ai.localeCompare(bi);
      const an = String(a.name || a.entity_id || "");
      const bn = String(b.name || b.entity_id || "");
      return an.localeCompare(bn);
    });

    return out;
  }

  function _get(obj, path, fallback) {
    const parts = String(path || "").split(".").filter(Boolean);
    let cur = obj;
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return fallback;
      cur = cur[p];
    }
    return cur == null ? fallback : cur;
  }

  function _mk_select(options, value, on_change) {
    const sel = document.createElement("select");
    sel.className = "hse_input";
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    sel.value = value || "";
    sel.addEventListener("change", () => on_change(sel.value));
    return sel;
  }

  function _mk_number(value, step, on_input) {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = step || "0.0001";
    inp.className = "hse_input";
    inp.value = value == null ? "" : String(value);
    inp.addEventListener("input", () => on_input(inp.value));
    return inp;
  }

  function _mk_time(value, on_input) {
    const inp = document.createElement("input");
    inp.type = "time";
    inp.className = "hse_input";
    inp.value = value || "";
    inp.addEventListener("input", () => on_input(inp.value));
    return inp;
  }

  function _mk_button(label, on_click) {
    const b = el("button", "hse_button", label);
    b.addEventListener("click", on_click);
    return b;
  }

  function _status_badge_class(status) {
    const s = String(status || "idle").toLowerCase();
    if (s === "ready") return "hse_badge_status_ok";
    if (s === "failed") return "hse_badge_warn";
    if (s === "running" || s === "pending_background") return "hse_badge_status_warn";
    return "";
  }

  function _status_label(status) {
    const s = String(status || "idle").toLowerCase();
    if (s === "ready") return "prêt";
    if (s === "running") return "en cours";
    if (s === "pending_background") return "arrière-plan";
    if (s === "failed") return "échec";
    return "idle";
  }

  function _status_bg(status) {
    const s = String(status || "idle").toLowerCase();
    if (s === "ready") return "var(--success-color, rgba(46,125,50,.14))";
    if (s === "failed") return "var(--error-color, rgba(211,47,47,.12))";
    if (s === "running" || s === "pending_background") return "var(--warning-color, rgba(249,168,37,.12))";
    return "var(--ha-card-background, rgba(255,255,255,.04))";
  }

  function render_config(container, model, on_action) {
    clear(container);

    const headerCard = el("div", "hse_card");
    headerCard.appendChild(el("div", null, "Configuration"));
    headerCard.appendChild(el("div", "hse_subtitle", "Ordre recommandé : 1) Contrat/Tarifs. 2) Capteur de référence. 3) Capteurs de calcul."));
    container.appendChild(headerCard);

    const draft = model.pricing_draft || model.pricing || model.pricing_defaults || {};
    const candidates = _power_candidates(model.scan_result);
    const effectiveRef = model.selected_reference_entity_id || model.current_reference_entity_id || null;
    const refStatus = model.reference_status || _reference_status_from_catalogue(model.catalogue, effectiveRef);

    const pricingCard = el("div", "hse_card");
    pricingCard.appendChild(el("div", null, "Contrat / Tarifs"));
    pricingCard.appendChild(el("div", "hse_subtitle", "Renseigne HT et TTC. Les heures creuses restent configurables."));

    const rowType = el("div", "hse_toolbar");
    rowType.appendChild(el("div", "hse_subtitle", "Type de contrat"));
    rowType.appendChild(_mk_select([{ value: "fixed", label: "Prix fixe" }, { value: "hphc", label: "HP / HC" }], _get(draft, "contract_type", "fixed"), (v) => on_action("pricing_patch", { path: "contract_type", value: v })));
    pricingCard.appendChild(rowType);
    container.appendChild(pricingCard);

    const refCard = el("div", "hse_card");
    refCard.appendChild(el("div", null, "Capteur de référence (compteur total)"));
    refCard.appendChild(el("div", "hse_subtitle", "Le capteur de référence reste exclu des capteurs utilisés pour le calcul."));

    const refToolbar = el("div", "hse_toolbar");
    refToolbar.appendChild(_mk_button(model.loading ? "Chargement…" : "Rafraîchir", () => on_action("refresh")));
    refToolbar.appendChild(_mk_button(model.saving ? "Sauvegarde…" : "Sauvegarder", () => on_action("save_reference")));
    refToolbar.appendChild(_mk_button("Supprimer la référence", () => on_action("clear_reference")));
    refCard.appendChild(refToolbar);

    refCard.appendChild(el("div", "hse_subtitle", `Référence actuelle: ${model.current_reference_entity_id || "(Aucune référence sélectionnée)"}`));

    if (refStatus) {
      const statusBox = el("div", "hse_card hse_card_inner");
      statusBox.style.background = _status_bg(refStatus.status);
      statusBox.appendChild(el("div", null, "Progression du workflow"));

      const badges = el("div", "hse_badges");
      badges.appendChild(el("span", `hse_badge ${_status_badge_class(refStatus.status)}`.trim(), `statut: ${_status_label(refStatus.status)}`));
      if (refStatus.progress_phase) badges.appendChild(el("span", "hse_badge", `phase: ${refStatus.progress_phase}`));
      if (refStatus.retry_scheduled || refStatus.will_retry) badges.appendChild(el("span", "hse_badge hse_badge_warn", "retry planifié"));
      if (refStatus.done) badges.appendChild(el("span", "hse_badge hse_badge_status_ok", "terminé"));
      statusBox.appendChild(badges);

      statusBox.appendChild(el("div", "hse_subtitle", refStatus.progress_label || "Aucun traitement actif."));
      if (refStatus.attempt || refStatus.attempts_total) {
        statusBox.appendChild(el("div", "hse_subtitle", `Tentative: ${refStatus.attempt || 0}/${refStatus.attempts_total || "?"}`));
      }
      if (refStatus.mapping && typeof refStatus.mapping === "object") {
        const lines = Object.entries(refStatus.mapping)
          .filter(([, v]) => !!v)
          .map(([k, v]) => `${k}: ${v}`);
        if (lines.length) statusBox.appendChild(el("pre", "hse_code", lines.join("\n")));
      }
      if (refStatus.last_error) statusBox.appendChild(el("pre", "hse_code", String(refStatus.last_error)));
      refCard.appendChild(statusBox);
    }

    const selectRef = document.createElement("select");
    selectRef.className = "hse_input";
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "(Aucune)";
    selectRef.appendChild(optNone);
    for (const c of candidates) {
      const opt = document.createElement("option");
      opt.value = c.entity_id;
      opt.textContent = `${c.name || c.entity_id} (${c.entity_id})`;
      selectRef.appendChild(opt);
    }
    selectRef.value = model.selected_reference_entity_id || "";
    selectRef.addEventListener("change", () => on_action("select_reference", selectRef.value || null));
    refCard.appendChild(selectRef);

    if (model.message) refCard.appendChild(el("div", "hse_subtitle", model.message));
    if (model.reference_status_error) refCard.appendChild(el("pre", "hse_code", String(model.reference_status_error)));
    if (model.error) refCard.appendChild(el("pre", "hse_code", String(model.error)));
    container.appendChild(refCard);
  }

  window.hse_config_view = { render_config, _current_reference_entity_id, _reference_status_from_catalogue };
})();
