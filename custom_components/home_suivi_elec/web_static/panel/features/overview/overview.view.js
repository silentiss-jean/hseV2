(function () {
  const { el, clear } = window.hse_dom;

  function _num(x) {
    const v = Number.parseFloat(String(x));
    return Number.isFinite(v) ? v : null;
  }

  function _fmt_w(w) {
    if (w == null) return "—";
    if (Math.abs(w) >= 1000) return `${(w / 1000).toFixed(2)} kW`;
    return `${Math.round(w)} W`;
  }

  function _fmt_kwh(x) {
    const v = _num(x);
    if (v == null) return "—";
    return `${v.toFixed(3)} kWh`;
  }

  function _fmt_eur(x) {
    const v = _num(x);
    if (v == null) return "—";
    return `${v.toFixed(2)} €`;
  }

  function _mk_kv(label, value, mono) {
    const row = el("div", "hse_toolbar");
    row.appendChild(el("div", "hse_subtitle", label));
    row.appendChild(el("div", mono ? "hse_mono" : "hse_kpi_value", value == null || value === "" ? "—" : String(value)));
    return row;
  }

  function _mk_table(rows, cols) {
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
    for (const r of rows) {
      const tr = document.createElement("tr");
      for (const c of cols) {
        const td = document.createElement("td");
        const v = c.value(r);
        if (v instanceof Node) td.appendChild(v);
        else td.textContent = v == null ? "" : String(v);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return table;
  }

  function _pill_title(text) {
    return el("div", "hse_pill_title", text);
  }

  function _render_totals_card(container, title, totals) {
    const card = el("div", "hse_kpi_card");
    card.appendChild(el("div", "hse_kpi_title", title));

    card.appendChild(_mk_kv("Énergie", _fmt_kwh(totals?.energy_kwh), false));
    card.appendChild(_mk_kv("Conso TTC", _fmt_eur(totals?.conso_ttc), false));
    card.appendChild(_mk_kv("Abonnement TTC", _fmt_eur(totals?.subscription_ttc), false));

    const total_ttc = totals?.total_ttc;
    const total = el("div", "hse_kpi_total");
    total.appendChild(el("div", "hse_subtitle", "Total TTC"));
    total.appendChild(el("div", "hse_kpi_total_value", _fmt_eur(total_ttc)));
    card.appendChild(total);

    container.appendChild(card);
  }

  function _render_live_top(container, dash) {
    const card = el("div", "hse_card");
    card.appendChild(_pill_title("Top consommateurs (live)"));
    card.appendChild(el("div", "hse_subtitle", "Capteurs inclus dans Summary, triés par puissance instantanée."));

    const grid = el("div", "hse_grid_2col hse_grid_tight");

    const mk_box = (title, rows) => {
      const box = el("div", "hse_list_box");
      box.appendChild(el("div", "hse_list_title", title));
      if (!rows.length) {
        box.appendChild(el("div", "hse_subtitle", "—"));
        return box;
      }

      for (const r of rows) {
        const row = el("div", "hse_list_row");
        const left = el("div", "hse_list_left");
        left.appendChild(el("div", null, r.name || r.entity_id));
        if (r.integration) left.appendChild(el("div", "hse_subtitle", r.integration));
        row.appendChild(left);
        row.appendChild(el("div", "hse_list_right", _fmt_w(r.power_w)));
        box.appendChild(row);
      }
      return box;
    };

    const b1 = Array.isArray(dash?.top_live?.bucket_100_500) ? dash.top_live.bucket_100_500 : [];
    const b2 = Array.isArray(dash?.top_live?.bucket_gt_500) ? dash.top_live.bucket_gt_500 : [];

    grid.appendChild(mk_box("Appareils (100–500 W)", b1));
    grid.appendChild(mk_box("Appareils (> 500 W)", b2));

    card.appendChild(grid);
    container.appendChild(card);
  }

  function _render_table_periods(container, title, rows) {
    const card = el("div", "hse_card");
    card.appendChild(_pill_title(title));

    if (!rows.length) {
      card.appendChild(el("div", "hse_subtitle", "—"));
      container.appendChild(card);
      return;
    }

    card.appendChild(
      _mk_table(rows, [
        { label: "Période", value: (r) => r.period },
        { label: "kWh", value: (r) => (r.kwh == null ? "—" : String(_num(r.kwh)?.toFixed(3) ?? "—")) },
        { label: "Coût consommation HT (€)", value: (r) => _fmt_eur(r.cost_ht) },
        { label: "Coût consommation TTC (€)", value: (r) => _fmt_eur(r.cost_ttc) },
        { label: "Total HT (€)", value: (r) => _fmt_eur(r.total_ht) },
        { label: "Total TTC (€)", value: (r) => _fmt_eur(r.total_ttc) },
      ])
    );

    container.appendChild(card);
  }

  function _render_costs_per_sensor(container, dash) {
    const card = el("div", "hse_card");
    card.appendChild(_pill_title("Coûts par capteur"));

    const all = Array.isArray(dash?.per_sensor_costs) ? dash.per_sensor_costs : [];

    const state = { q: "" };

    const subtitle = el(
      "div",
      "hse_subtitle",
      `${all.length} capteurs · Triés par coût journalier décroissant`
    );
    card.appendChild(subtitle);

    const input = document.createElement("input");
    input.className = "hse_input";
    input.placeholder = "Rechercher un capteur…";
    input.addEventListener("input", () => {
      state.q = String(input.value || "");
      render();
    });
    card.appendChild(input);

    const host = el("div");
    card.appendChild(host);

    const render = () => {
      clear(host);

      const q = state.q.trim().toLowerCase();
      const filtered = q
        ? all.filter((r) => String(r.name || r.entity_id || "").toLowerCase().includes(q))
        : all.slice();

      filtered.sort((a, b) => (_num(b.day) || -1e9) - (_num(a.day) || -1e9));

      if (!filtered.length) {
        host.appendChild(el("div", "hse_subtitle", "Aucun résultat."));
        return;
      }

      host.appendChild(
        _mk_table(filtered, [
          {
            label: "Capteur",
            value: (r) => {
              const wrap = el("div");
              wrap.appendChild(el("div", null, r.name || r.entity_id));
              wrap.appendChild(el("div", "hse_subtitle", el("span", "hse_mono", r.entity_id || "")));
              return wrap;
            },
          },
          { label: "Jour (€)", value: (r) => _fmt_eur(r.day) },
          { label: "Semaine (€)", value: (r) => _fmt_eur(r.week) },
          { label: "Mois (€)", value: (r) => _fmt_eur(r.month) },
          { label: "Année (€)", value: (r) => _fmt_eur(r.year) },
        ])
      );
    };

    render();
    container.appendChild(card);
  }

  function render_overview(container, data, hass) {
    clear(container);

    const dash = data?.dashboard || null;
    if (!dash || dash.ok !== true) {
      const card = el("div", "hse_card");
      card.appendChild(_pill_title("Accueil"));
      card.appendChild(el("div", "hse_subtitle", "Impossible de charger le dashboard."));
      container.appendChild(card);
      return;
    }

    const pricing = dash.pricing || dash.defaults || {};

    const cardSummary = el("div", "hse_card");
    cardSummary.appendChild(_pill_title("Résumé général"));

    const grid = el("div", "hse_grid_2col");

    const cardSensors = el("div", "hse_card hse_card_compact");
    cardSensors.appendChild(el("div", "hse_kpi_title", "Capteurs"));
    cardSensors.appendChild(_mk_kv("Capteurs sélectionnés", `${Array.isArray(dash.selected) ? dash.selected.length : 0}`, false));
    cardSensors.appendChild(_mk_kv("Capteurs sélectionnés (tous actifs)", _fmt_w(dash?.computed?.total_power_w), false));

    if (dash.reference?.entity_id) {
      const ref_name = dash.reference.name || dash.reference.entity_id;
      cardSensors.appendChild(_mk_kv("Capteur externe de référence", ref_name, false));
      cardSensors.appendChild(_mk_kv("Conso actuelle non mesurée (Delta)", _fmt_w(dash?.delta?.power_w), false));
    }

    const cardContract = el("div", "hse_card hse_card_compact");
    cardContract.appendChild(el("div", "hse_kpi_title", "Résumé général"));

    const ct = pricing.contract_type || "fixed";
    cardContract.appendChild(_mk_kv("Type contrat", ct === "hphc" ? "HP / HC" : "Fixe", false));

    const sub = pricing.subscription_monthly || {};
    if (sub && (sub.ht != null || sub.ttc != null)) {
      cardContract.appendChild(_mk_kv("Abonnement HT", _fmt_eur(sub.ht), false));
      cardContract.appendChild(_mk_kv("Abonnement TTC", _fmt_eur(sub.ttc), false));
    }

    const fixed = pricing.fixed_energy_per_kwh || {};
    if (ct === "fixed") {
      cardContract.appendChild(_mk_kv("Prix du kWh HT", fixed.ht != null ? `${String(fixed.ht)} €` : "—", false));
      cardContract.appendChild(_mk_kv("Prix du kWh TTC", fixed.ttc != null ? `${String(fixed.ttc)} €` : "—", false));
    }

    if (data?.fetched_at) {
      cardContract.appendChild(_mk_kv("Dernier refresh", data.fetched_at, true));
    }

    grid.appendChild(cardSensors);
    grid.appendChild(cardContract);

    cardSummary.appendChild(grid);
    container.appendChild(cardSummary);

    _render_live_top(container, dash);

    const cardTotals = el("div", "hse_card");
    cardTotals.appendChild(_pill_title("Coûts globaux"));
    cardTotals.appendChild(el("div", "hse_subtitle", "Consommation + Abonnement (tous capteurs sélectionnés)"));

    const totals_grid = el("div", "hse_kpi_grid");
    const totals = dash.totals || {};
    _render_totals_card(totals_grid, "Semaine", totals.week);
    _render_totals_card(totals_grid, "Mois", totals.month);
    _render_totals_card(totals_grid, "Année", totals.year);
    cardTotals.appendChild(totals_grid);
    container.appendChild(cardTotals);

    const cum = Array.isArray(dash.cumulative_table) ? dash.cumulative_table : [];
    _render_table_periods(container, "Capteurs détectés – Puissance cumulée", cum);

    if (Array.isArray(dash.reference_table) && dash.reference_table.length) {
      _render_table_periods(container, "Capteur externe de référence", dash.reference_table);
    }

    if (Array.isArray(dash.delta_table) && dash.delta_table.length) {
      const card = el("div", "hse_card");
      card.appendChild(_pill_title("Delta (externe - interne)"));
      card.appendChild(
        _mk_table(dash.delta_table, [
          { label: "Période", value: (r) => r.period },
          { label: "kWh", value: (r) => (r.kwh == null ? "—" : String(_num(r.kwh)?.toFixed(3) ?? "—")) },
          { label: "Coût consommation HT (€)", value: (r) => _fmt_eur(r.cost_ht) },
          { label: "Coût consommation TTC (€)", value: (r) => _fmt_eur(r.cost_ttc) },
          { label: "Total HT (€)", value: (r) => _fmt_eur(r.total_ht) },
          { label: "Total TTC (€)", value: (r) => _fmt_eur(r.total_ttc) },
        ])
      );
      card.appendChild(
        el("div", "hse_subtitle", "Les totaux incluent l'abonnement mensuel proratisé sur chaque période.")
      );
      container.appendChild(card);
    }

    _render_costs_per_sensor(container, dash);

    if (Array.isArray(dash.warnings) && dash.warnings.length) {
      const card = el("div", "hse_card");
      card.appendChild(_pill_title("Warnings"));
      card.appendChild(el("pre", "hse_code", dash.warnings.join("\n")));
      container.appendChild(card);
    }

    if (!hass) {
      const card = el("div", "hse_card");
      card.appendChild(_pill_title("Debug"));
      card.appendChild(el("div", "hse_subtitle", "hass non disponible: valeurs temps réel indisponibles."));
      container.appendChild(card);
    }
  }

  window.hse_overview_view = { render_overview };
})();
