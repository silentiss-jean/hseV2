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

  function _mk_table(items, cols) {
    const table = document.createElement("table");
    table.className = "hse_table";

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    for (const c of cols) {
      const th = document.createElement("th");
      th.textContent = c.label;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const it of items) {
      const tr = document.createElement("tr");
      for (const c of cols) {
        const td = document.createElement("td");
        const v = c.value(it);
        if (v instanceof Node) td.appendChild(v);
        else td.textContent = v == null ? "" : String(v);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return table;
  }

  function render_config(container, model, on_action) {
    clear(container);

    const headerCard = el("div", "hse_card");
    const header = el("div", null);
    header.appendChild(el("div", null, "Configuration"));
    header.appendChild(
      el(
        "div",
        "hse_subtitle",
        "Ordre recommandé : 1) Contrat/Tarifs. 2) Capteur de référence (compteur total). 3) Capteurs utilisés pour le calcul."
      )
    );
    headerCard.appendChild(header);

    // Shared data
    const savedPricing = model.pricing || null;
    const draft = model.pricing_draft || model.pricing || model.pricing_defaults || {};
    const candidates = _power_candidates(model.scan_result);

    const effectiveRef = model.selected_reference_entity_id || model.current_reference_entity_id || null;

    const selectedIdsRaw = Array.isArray(_get(draft, "cost_entity_ids", [])) ? _get(draft, "cost_entity_ids", []) : [];
    const selectedIds = effectiveRef ? selectedIdsRaw.filter((x) => x !== effectiveRef) : selectedIdsRaw.slice();
    const selectedSet = new Set(selectedIds);
    const hadRefConflict = !!(effectiveRef && selectedIdsRaw.includes(effectiveRef));

    const candidatesForCost = effectiveRef ? candidates.filter((c) => c.entity_id !== effectiveRef) : candidates;

    // 1) Pricing panel
    const pricingCard = el("div", "hse_card");
    pricingCard.appendChild(el("div", null, "Contrat / Tarifs"));
    pricingCard.appendChild(
      el(
        "div",
        "hse_subtitle",
        "Renseigne HT et TTC (on ne déduit jamais la TVA). Les heures creuses sont configurables (défaut 22:00 → 06:00)."
      )
    );

    const savedLine = el("div", "hse_subtitle");
    if (savedPricing?.updated_at) {
      savedLine.textContent = `Tarifs enregistrés (updated_at): ${savedPricing.updated_at}`;
    } else {
      savedLine.textContent = "Tarifs enregistrés: (aucun)";
    }
    pricingCard.appendChild(savedLine);

    const contractType = _get(draft, "contract_type", "fixed");
    const displayMode = _get(draft, "display_mode", "ttc");

    const rowType = el("div", "hse_toolbar");
    rowType.appendChild(el("div", "hse_subtitle", "Type de contrat"));
    const selType = _mk_select(
      [
        { value: "fixed", label: "Prix fixe" },
        { value: "hphc", label: "HP / HC" },
      ],
      contractType,
      (v) => on_action("pricing_patch", { path: "contract_type", value: v })
    );
    rowType.appendChild(selType);

    rowType.appendChild(el("div", "hse_subtitle", "Mode d'affichage"));
    const selMode = _mk_select(
      [
        { value: "ttc", label: "TTC" },
        { value: "ht", label: "HT" },
      ],
      displayMode,
      (v) => on_action("pricing_patch", { path: "display_mode", value: v })
    );
    rowType.appendChild(selMode);

    pricingCard.appendChild(rowType);

    const rowSub = el("div", "hse_toolbar");
    rowSub.appendChild(el("div", "hse_subtitle", "Abonnement mensuel HT"));
    rowSub.appendChild(
      _mk_number(_get(draft, "subscription_monthly.ht", ""), "0.01", (v) =>
        on_action("pricing_patch", { path: "subscription_monthly.ht", value: v, no_render: true })
      )
    );
    rowSub.appendChild(el("div", "hse_subtitle", "Abonnement mensuel TTC"));
    rowSub.appendChild(
      _mk_number(_get(draft, "subscription_monthly.ttc", ""), "0.01", (v) =>
        on_action("pricing_patch", { path: "subscription_monthly.ttc", value: v, no_render: true })
      )
    );
    pricingCard.appendChild(rowSub);

    if (contractType === "fixed") {
      const rowFixed = el("div", "hse_toolbar");
      rowFixed.appendChild(el("div", "hse_subtitle", "Prix énergie (€/kWh) HT"));
      rowFixed.appendChild(
        _mk_number(_get(draft, "fixed_energy_per_kwh.ht", ""), "0.0001", (v) =>
          on_action("pricing_patch", { path: "fixed_energy_per_kwh.ht", value: v, no_render: true })
        )
      );
      rowFixed.appendChild(el("div", "hse_subtitle", "Prix énergie (€/kWh) TTC"));
      rowFixed.appendChild(
        _mk_number(_get(draft, "fixed_energy_per_kwh.ttc", ""), "0.0001", (v) =>
          on_action("pricing_patch", { path: "fixed_energy_per_kwh.ttc", value: v, no_render: true })
        )
      );
      pricingCard.appendChild(rowFixed);
    } else {
      const rowHP = el("div", "hse_toolbar");
      rowHP.appendChild(el("div", "hse_subtitle", "Prix HP (€/kWh) HT"));
      rowHP.appendChild(
        _mk_number(_get(draft, "hp_energy_per_kwh.ht", ""), "0.0001", (v) =>
          on_action("pricing_patch", { path: "hp_energy_per_kwh.ht", value: v, no_render: true })
        )
      );
      rowHP.appendChild(el("div", "hse_subtitle", "Prix HP (€/kWh) TTC"));
      rowHP.appendChild(
        _mk_number(_get(draft, "hp_energy_per_kwh.ttc", ""), "0.0001", (v) =>
          on_action("pricing_patch", { path: "hp_energy_per_kwh.ttc", value: v, no_render: true })
        )
      );
      pricingCard.appendChild(rowHP);

      const rowHC = el("div", "hse_toolbar");
      rowHC.appendChild(el("div", "hse_subtitle", "Prix HC (€/kWh) HT"));
      rowHC.appendChild(
        _mk_number(_get(draft, "hc_energy_per_kwh.ht", ""), "0.0001", (v) =>
          on_action("pricing_patch", { path: "hc_energy_per_kwh.ht", value: v, no_render: true })
        )
      );
      rowHC.appendChild(el("div", "hse_subtitle", "Prix HC (€/kWh) TTC"));
      rowHC.appendChild(
        _mk_number(_get(draft, "hc_energy_per_kwh.ttc", ""), "0.0001", (v) =>
          on_action("pricing_patch", { path: "hc_energy_per_kwh.ttc", value: v, no_render: true })
        )
      );
      pricingCard.appendChild(rowHC);

      const rowSched = el("div", "hse_toolbar");
      rowSched.appendChild(el("div", "hse_subtitle", "Heures creuses start"));
      rowSched.appendChild(
        _mk_time(_get(draft, "hc_schedule.start", "22:00"), (v) =>
          on_action("pricing_patch", { path: "hc_schedule.start", value: v, no_render: true })
        )
      );
      rowSched.appendChild(el("div", "hse_subtitle", "Heures creuses end"));
      rowSched.appendChild(
        _mk_time(_get(draft, "hc_schedule.end", "06:00"), (v) =>
          on_action("pricing_patch", { path: "hc_schedule.end", value: v, no_render: true })
        )
      );
      pricingCard.appendChild(rowSched);
    }

    // Pricing buttons at the end (as requested)
    const pricingToolbar = el("div", "hse_toolbar");

    const btnPricingSave = el(
      "button",
      "hse_button hse_button_primary",
      model.pricing_saving ? "Sauvegarde…" : "Sauvegarder tarifs (incl. capteurs)"
    );
    btnPricingSave.disabled = !!model.loading || !!model.saving || !!model.pricing_saving;
    btnPricingSave.addEventListener("click", () => on_action("pricing_save"));

    const btnPricingClear = el("button", "hse_button", "Effacer tarifs");
    btnPricingClear.disabled = !!model.loading || !!model.saving || !!model.pricing_saving;
    btnPricingClear.addEventListener("click", () => on_action("pricing_clear"));

    pricingToolbar.appendChild(btnPricingSave);
    pricingToolbar.appendChild(btnPricingClear);
    pricingCard.appendChild(pricingToolbar);

    if (model.pricing_message) {
      pricingCard.appendChild(el("div", "hse_subtitle", model.pricing_message));
    }

    if (model.pricing_error) {
      pricingCard.appendChild(el("pre", "hse_code", String(model.pricing_error)));
    }

    // 2) Reference panel (independent)
    const refCard = el("div", "hse_card");
    refCard.appendChild(el("div", null, "Capteur de référence (compteur total)"));
    refCard.appendChild(
      el(
        "div",
        "hse_subtitle",
        "Le capteur de référence est indépendant: il sert de vérité terrain des coûts (comparaison), et ne peut pas être inclus dans les capteurs de calcul."
      )
    );

    const refToolbar = el("div", "hse_toolbar");

    const btnRefresh = el("button", "hse_button", model.loading ? "Chargement…" : "Rafraîchir");
    btnRefresh.disabled = !!model.loading || !!model.saving || !!model.pricing_saving;
    btnRefresh.addEventListener("click", () => on_action("refresh"));

    const btnSave = el("button", "hse_button hse_button_primary", model.saving ? "Sauvegarde…" : "Sauvegarder");
    btnSave.disabled = !!model.loading || !!model.saving || !!model.pricing_saving;
    btnSave.addEventListener("click", () => on_action("save_reference"));

    const btnClear = el("button", "hse_button", "Supprimer la référence");
    btnClear.disabled = !!model.loading || !!model.saving || !!model.pricing_saving;
    btnClear.addEventListener("click", () => on_action("clear_reference"));

    refToolbar.appendChild(btnRefresh);
    refToolbar.appendChild(btnSave);
    refToolbar.appendChild(btnClear);
    refCard.appendChild(refToolbar);

    const refLine = el("div", "hse_subtitle");
    const currentRef = model.current_reference_entity_id || "(Aucune référence sélectionnée)";
    refLine.textContent = `Référence actuelle: ${currentRef}`;
    refCard.appendChild(refLine);

    const rowRef = el("div", "hse_toolbar");

    const selectRef = document.createElement("select");
    selectRef.className = "hse_input";

    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = "(Aucune)";
    selectRef.appendChild(optNone);

    for (const c of candidates) {
      const opt = document.createElement("option");
      opt.value = c.entity_id;
      const label = `${c.name || c.entity_id} (${c.entity_id})`;
      opt.textContent = label;
      selectRef.appendChild(opt);
    }

    const selectedRef = model.selected_reference_entity_id || "";
    selectRef.value = selectedRef;
    selectRef.addEventListener("change", () => on_action("select_reference", selectRef.value || null));

    rowRef.appendChild(selectRef);
    refCard.appendChild(rowRef);

    if (model.message) {
      refCard.appendChild(el("div", "hse_subtitle", model.message));
    }

    if (model.error) {
      refCard.appendChild(el("pre", "hse_code", String(model.error)));
    }

    // 3) Cost entities panel
    const costCard = el("div", "hse_card");
    costCard.appendChild(el("div", null, "Capteurs utilisés pour le calcul"));
    costCard.appendChild(
      el(
        "div",
        "hse_subtitle",
        "Sélectionne les capteurs dont la consommation sera agrégée pour estimer les coûts."
      )
    );

    if (effectiveRef) {
      costCard.appendChild(el("div", "hse_subtitle", `Capteur de référence exclu: ${effectiveRef}`));
    }

    if (hadRefConflict) {
      const badges = el("div", "hse_badges");
      badges.appendChild(el("span", "hse_badge hse_badge_warn", "Garde-fou: la référence est exclue des calculs"));
      costCard.appendChild(badges);
    }

    const grid = el("div", "hse_grid_2col");

    const left = el("div", "hse_card hse_card_inner");
    const avail = candidatesForCost.filter((c) => !selectedSet.has(c.entity_id));
    left.appendChild(el("div", null, `Disponibles (${avail.length})`));
    left.appendChild(
      _mk_table(avail, [
        { label: "Nom", value: (c) => c.name || "" },
        { label: "Entity", value: (c) => el("span", "hse_mono", c.entity_id || "") },
        {
          label: "",
          value: (c) => _mk_button("Ajouter", () => on_action("pricing_list_add", { entity_id: c.entity_id })),
        },
      ])
    );

    const right = el("div", "hse_card hse_card_inner");
    const selectedRows = candidatesForCost
      .filter((c) => selectedSet.has(c.entity_id))
      .sort((a, b) => String(a.name || a.entity_id || "").localeCompare(String(b.name || b.entity_id || "")));

    right.appendChild(el("div", null, `Sélectionnés (${selectedIds.length})`));
    right.appendChild(
      _mk_table(selectedRows, [
        { label: "Nom", value: (c) => c.name || "" },
        { label: "Entity", value: (c) => el("span", "hse_mono", c.entity_id || "") },
        {
          label: "",
          value: (c) => _mk_button("Retirer", () => on_action("pricing_list_remove", { entity_id: c.entity_id })),
        },
      ])
    );

    grid.appendChild(left);
    grid.appendChild(right);
    costCard.appendChild(grid);

    // Optional shortcut: save pricing+capteurs from this panel too
    const costToolbar = el("div", "hse_toolbar");
    const btnSave2 = el(
      "button",
      "hse_button hse_button_primary",
      model.pricing_saving ? "Sauvegarde…" : "Sauvegarder (tarifs + capteurs)"
    );
    btnSave2.disabled = !!model.loading || !!model.saving || !!model.pricing_saving;
    btnSave2.addEventListener("click", () => on_action("pricing_save"));
    costToolbar.appendChild(btnSave2);
    costCard.appendChild(costToolbar);

    container.appendChild(headerCard);
    container.appendChild(pricingCard);
    container.appendChild(refCard);
    container.appendChild(costCard);
  }

  window.hse_config_view = { render_config, _current_reference_entity_id };
})();
