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
      const an = String(a.name || a.entity_id || "");
      const bn = String(b.name || b.entity_id || "");
      return an.localeCompare(bn);
    });

    return out;
  }

  function render_config(container, model, on_action) {
    clear(container);

    const card = el("div", "hse_card");
    const header = el("div", null);
    header.appendChild(el("div", null, "Configuration"));
    header.appendChild(
      el(
        "div",
        "hse_subtitle",
        "Sélectionne le capteur de référence (compteur total) et sauvegarde. Si aucune référence n'est sélectionnée, HSE n'affiche pas les blocs qui en dépendent."
      )
    );

    const toolbar = el("div", "hse_toolbar");

    const btnRefresh = el("button", "hse_button", model.loading ? "Chargement…" : "Rafraîchir");
    btnRefresh.disabled = !!model.loading || !!model.saving;
    btnRefresh.addEventListener("click", () => on_action("refresh"));

    const btnSave = el("button", "hse_button hse_button_primary", model.saving ? "Sauvegarde…" : "Sauvegarder");
    btnSave.disabled = !!model.loading || !!model.saving;
    btnSave.addEventListener("click", () => on_action("save_reference"));

    const btnClear = el("button", "hse_button", "Supprimer la référence");
    btnClear.disabled = !!model.loading || !!model.saving;
    btnClear.addEventListener("click", () => on_action("clear_reference"));

    toolbar.appendChild(btnRefresh);
    toolbar.appendChild(btnSave);
    toolbar.appendChild(btnClear);

    const refCard = el("div", "hse_card");
    refCard.appendChild(el("div", null, "Capteur de référence (compteur total)"));

    const refLine = el("div", "hse_subtitle");
    const currentRef = model.current_reference_entity_id || "(Aucune référence sélectionnée)";
    refLine.textContent = `Référence actuelle: ${currentRef}`;
    refCard.appendChild(refLine);

    const row = el("div", "hse_toolbar");

    const select = document.createElement("select");
    // Use existing tokens so the widget stays consistent across themes.
    select.className = "hse_input";

    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "(Aucune)";
    select.appendChild(optNone);

    const candidates = _power_candidates(model.scan_result);
    for (const c of candidates) {
      const opt = document.createElement("option");
      opt.value = c.entity_id;
      const label = `${c.name || c.entity_id} (${c.entity_id})`;
      opt.textContent = label;
      select.appendChild(opt);
    }

    const selected = model.selected_reference_entity_id || "";
    select.value = selected;

    select.addEventListener("change", () => on_action("select_reference", select.value || null));

    row.appendChild(select);
    refCard.appendChild(row);

    if (model.message) {
      refCard.appendChild(el("div", "hse_subtitle", model.message));
    }

    if (model.error) {
      const pre = el("pre", "hse_code", String(model.error));
      refCard.appendChild(pre);
    }

    card.appendChild(header);
    card.appendChild(toolbar);

    container.appendChild(card);
    container.appendChild(refCard);
  }

  window.hse_config_view = { render_config, _current_reference_entity_id };
})();
