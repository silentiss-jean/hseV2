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

  function _fmt_eur(x) {
    const v = _num(x);
    if (v == null) return "—";
    return `${v.toFixed(2)} €`;
  }

  function _mk_kv(label, value, mono) {
    const row = el("div", "hse_toolbar");
    row.appendChild(el("div", "hse_subtitle", label));
    row.appendChild(el("div", mono ? "hse_mono" : null, value == null || value === "" ? "—" : String(value)));
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

  function _mk_top_table(rows) {
    return _mk_table(rows, [
      { label: "Nom", value: (r) => r.name || r.entity_id },
      { label: "Puissance", value: (r) => _fmt_w(r.power_w) },
      { label: "Entity", value: (r) => el("span", "hse_mono", r.entity_id) },
    ]);
  }

  function render_overview(container, data, hass) {
    clear(container);

    const dash = data?.dashboard || null;
    if (!dash || dash.ok !== true) {
      const card = el("div", "hse_card");
      card.appendChild(el("div", null, "Accueil"));
      card.appendChild(el("div", "hse_subtitle", "Impossible de charger le dashboard."));
      container.appendChild(card);
      return;
    }

    const pricing = dash.pricing || dash.defaults || {};

    const grid = el("div", "hse_grid_2col");

    const left = el("div", "hse_card");
    left.appendChild(el("div", null, "Top consommateurs (live)"));
    left.appendChild(el("div", "hse_subtitle", "Valeurs issues des états Home Assistant."));

    const b1 = Array.isArray(dash?.top_live?.bucket_100_500) ? dash.top_live.bucket_100_500 : [];
    const b2 = Array.isArray(dash?.top_live?.bucket_gt_500) ? dash.top_live.bucket_gt_500 : [];

    left.appendChild(el("div", "hse_subtitle", "100 → 500 W"));
    left.appendChild(b1.length ? _mk_top_table(b1) : el("div", "hse_subtitle", "—"));
    left.appendChild(el("div", "hse_subtitle", "> 500 W"));
    left.appendChild(b2.length ? _mk_top_table(b2) : el("div", "hse_subtitle", "—"));

    const total_w = dash?.computed?.total_power_w ?? null;
    left.appendChild(_mk_kv("Total calculé (capteurs sélectionnés)", _fmt_w(total_w), false));

    const right = el("div", "hse_card");
    right.appendChild(el("div", null, "Contrat / Tarifs"));

    const ct = pricing.contract_type || "fixed";
    const dm = pricing.display_mode || "ttc";

    right.appendChild(_mk_kv("Type de contrat", ct === "hphc" ? "HP / HC" : "Prix fixe", false));
    right.appendChild(_mk_kv("Affichage", String(dm).toUpperCase(), false));

    const sub = pricing.subscription_monthly || {};
    if (sub && (sub.ht != null || sub.ttc != null)) {
      right.appendChild(_mk_kv("Abonnement mensuel", `${sub.ht ?? "—"} HT / ${sub.ttc ?? "—"} TTC`, false));
    }

    if (pricing.updated_at) {
      right.appendChild(_mk_kv("Tarifs enregistrés", pricing.updated_at, true));
    }

    if (data?.fetched_at) {
      right.appendChild(_mk_kv("Dernier actualiser", data.fetched_at, true));
    }

    grid.appendChild(left);
    grid.appendChild(right);
    container.appendChild(grid);

    const cardTotals = el("div", "hse_card");
    cardTotals.appendChild(el("div", null, "Coûts globaux"));
    const totals = dash.totals || {};

    const mk_tot = (label, it) => {
      if (!it) {
        cardTotals.appendChild(_mk_kv(label, "—", false));
        return;
      }
      const ttc = it.total_ttc != null ? _fmt_eur(it.total_ttc) : "—";
      const kwh = it.energy_kwh != null ? `${_num(it.energy_kwh)?.toFixed(3) ?? "—"} kWh` : "—";
      cardTotals.appendChild(_mk_kv(label, `${ttc} (${kwh})`, false));
    };

    mk_tot("Semaine", totals.week);
    mk_tot("Mois", totals.month);
    mk_tot("Année", totals.year);

    if (Array.isArray(dash.warnings) && dash.warnings.length) {
      cardTotals.appendChild(_mk_kv("Warnings", dash.warnings.join(", "), true));
    }

    container.appendChild(cardTotals);

    const cardCum = el("div", "hse_card");
    cardCum.appendChild(el("div", null, "Capteurs détectés – Puissance cumulée"));

    const rows = Array.isArray(dash.cumulative_table) ? dash.cumulative_table : [];
    if (!rows.length) {
      cardCum.appendChild(el("div", "hse_subtitle", "—"));
    } else {
      cardCum.appendChild(
        _mk_table(rows, [
          { label: "Période", value: (r) => r.period },
          { label: "kWh", value: (r) => (r.kwh == null ? "—" : `${_num(r.kwh)?.toFixed(3) ?? "—"}`) },
          { label: "Coût TTC", value: (r) => _fmt_eur(r.total_ttc ?? r.cost_ttc) },
        ])
      );
    }

    container.appendChild(cardCum);

    const cardSel = el("div", "hse_card");
    const selected = Array.isArray(dash.selected) ? dash.selected : [];
    cardSel.appendChild(el("div", null, `Capteurs sélectionnés (${selected.length})`));

    if (!selected.length) {
      cardSel.appendChild(el("div", "hse_subtitle", "Aucun capteur sélectionné."));
    } else {
      cardSel.appendChild(
        _mk_table(selected, [
          { label: "Nom", value: (r) => r.name || r.entity_id },
          { label: "Entity", value: (r) => el("span", "hse_mono", r.entity_id) },
          { label: "Puissance", value: (r) => _fmt_w(r.power_w) },
          { label: "État", value: (r) => `${r.state ?? "—"} ${(r.unit || "").trim()}`.trim() },
          { label: "Updated", value: (r) => el("span", "hse_mono", r.last_updated || "") },
        ])
      );
    }

    container.appendChild(cardSel);

    if (dash.reference) {
      const cardRef = el("div", "hse_card");
      cardRef.appendChild(el("div", null, "Capteur externe de référence"));
      cardRef.appendChild(_mk_kv("Entity", dash.reference.entity_id, true));
      cardRef.appendChild(_mk_kv("Puissance", _fmt_w(dash.reference.power_w), false));

      if (dash.delta && dash.delta.power_w != null) {
        const cardDelta = el("div", "hse_card");
        cardDelta.appendChild(el("div", null, "Delta (réf - calcul)"));
        cardDelta.appendChild(_mk_kv("Écart", _fmt_w(dash.delta.power_w), false));
        container.appendChild(cardDelta);
      }

      container.appendChild(cardRef);
    }
  }

  window.hse_overview_view = { render_overview };
})();
