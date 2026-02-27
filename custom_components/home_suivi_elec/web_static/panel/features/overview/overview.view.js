(function () {
  const { el } = window.hse_dom;

  function _get_hass_from_dom() {
    // HA UI root
    const ha = document.querySelector("home-assistant");
    if (ha?.hass) return ha.hass;

    // sometimes hass sits on nested elements
    const main = document.querySelector("home-assistant-main");
    if (main?.hass) return main.hass;

    const root = document.querySelector("home-assistant\u2011main") || document.querySelector("home-assistant-main");
    if (root?.hass) return root.hass;

    return null;
  }

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

  function _num(x) {
    const v = Number.parseFloat(String(x));
    return Number.isFinite(v) ? v : null;
  }

  function _power_w_from_state(st) {
    if (!st) return null;
    const v = _num(st.state);
    if (v == null) return null;
    const unit = st.attributes?.unit_of_measurement || "";

    // Basic unit conversion
    if (unit === "W" || unit === "w") return v;
    if (unit === "kW" || unit === "kw") return v * 1000.0;

    // If unit missing, assume W when it's a power sensor
    return v;
  }

  function _fmt_w(w) {
    if (w == null) return "—";
    if (Math.abs(w) >= 1000) return `${(w / 1000).toFixed(2)} kW`;
    return `${Math.round(w)} W`;
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

  function render_overview(container, data) {
    // IMPORTANT: do NOT clear(container) here.
    // hse_panel.js already created the "Rafraîchir" UI card at the top.

    const hass = _get_hass_from_dom();

    const catalogue = data?.catalogue || null;
    const pricing = data?.pricing || null;
    const defaults = data?.defaults || null;
    const scan = data?.scan || { candidates: [] };

    const ref_eid = _current_reference_entity_id(catalogue);
    const cost_ids = Array.isArray(pricing?.cost_entity_ids) ? pricing.cost_entity_ids : [];

    const cand_map = new Map();
    for (const c of scan?.candidates || []) {
      if (!c?.entity_id) continue;
      cand_map.set(c.entity_id, c);
    }

    const selected_rows = cost_ids.map((eid) => {
      const c = cand_map.get(eid);
      const st = hass?.states?.[eid] || null;
      const w = _power_w_from_state(st);

      return {
        name: c?.name || eid,
        entity_id: eid,
        state: st?.state ?? "—",
        unit: st?.attributes?.unit_of_measurement ?? "",
        power_w: w,
        last_updated: st?.last_updated || st?.last_changed || "",
      };
    });

    const total_w = selected_rows.reduce((acc, r) => acc + (r.power_w || 0), 0);

    const ref_st = ref_eid ? hass?.states?.[ref_eid] : null;
    const ref_w = _power_w_from_state(ref_st);

    const delta_w = ref_w == null ? null : ref_w - total_w;

    // ===== Top summary (2 columns)
    const grid = el("div", "hse_grid_2col");

    const left = el("div", "hse_card");
    left.appendChild(el("div", null, "Résumé conso (temps réel)"));
    left.appendChild(el("div", "hse_subtitle", "Valeurs issues des états Home Assistant."));

    left.appendChild(_mk_kv("Total calculé (capteurs sélectionnés)", _fmt_w(total_w), false));
    left.appendChild(_mk_kv("Référence (compteur total)", ref_eid ? `${_fmt_w(ref_w)} (${ref_eid})` : "(Aucune)", true));
    left.appendChild(_mk_kv("Écart (réf - calcul)", _fmt_w(delta_w), false));

    if (!hass) {
      left.appendChild(
        el(
          "div",
          "hse_subtitle",
          "Note: hass non accessible depuis le DOM, clique sur Rafraîchir ou recharge la page."
        )
      );
    }

    const right = el("div", "hse_card");
    right.appendChild(el("div", null, "Contrat / Tarifs"));

    const eff = pricing || defaults || {};
    const ct = eff.contract_type || "fixed";
    const dm = eff.display_mode || "ttc";

    right.appendChild(_mk_kv("Type de contrat", ct === "hphc" ? "HP / HC" : "Prix fixe", false));
    right.appendChild(_mk_kv("Affichage", dm.toUpperCase(), false));

    const sub = eff.subscription_monthly || {};
    right.appendChild(_mk_kv("Abonnement mensuel", `${sub.ht ?? "—"} HT / ${sub.ttc ?? "—"} TTC`, false));

    if (ct === "fixed") {
      const p = eff.fixed_energy_per_kwh || {};
      right.appendChild(_mk_kv("Prix énergie (€/kWh)", `${p.ht ?? "—"} HT / ${p.ttc ?? "—"} TTC`, false));
    } else {
      const hp = eff.hp_energy_per_kwh || {};
      const hc = eff.hc_energy_per_kwh || {};
      const sch = eff.hc_schedule || {};
      right.appendChild(_mk_kv("Prix HP (€/kWh)", `${hp.ht ?? "—"} HT / ${hp.ttc ?? "—"} TTC`, false));
      right.appendChild(_mk_kv("Prix HC (€/kWh)", `${hc.ht ?? "—"} HT / ${hc.ttc ?? "—"} TTC`, false));
      right.appendChild(_mk_kv("Plage HC", `${sch.start ?? "—"} → ${sch.end ?? "—"}`, false));
    }

    if (pricing?.updated_at) {
      right.appendChild(_mk_kv("Tarifs enregistrés", pricing.updated_at, true));
    }

    if (data?.fetched_at) {
      right.appendChild(_mk_kv("Dernier actualiser", data.fetched_at, true));
    }

    grid.appendChild(left);
    grid.appendChild(right);
    container.appendChild(grid);

    // ===== Selected sensors table
    const cardSel = el("div", "hse_card");
    cardSel.appendChild(el("div", null, `Capteurs sélectionnés (calcul) (${selected_rows.length})`));

    if (!selected_rows.length) {
      cardSel.appendChild(el("div", "hse_subtitle", "Aucun capteur sélectionné pour le calcul."));
    } else {
      cardSel.appendChild(
        _mk_table(
          selected_rows,
          [
            { label: "Nom", value: (r) => r.name },
            { label: "Entity", value: (r) => el("span", "hse_mono", r.entity_id) },
            { label: "Puissance", value: (r) => _fmt_w(r.power_w) },
            { label: "État", value: (r) => `${r.state} ${r.unit || ""}`.trim() },
            { label: "Updated", value: (r) => el("span", "hse_mono", r.last_updated || "") },
          ]
        )
      );
    }

    container.appendChild(cardSel);

    // ===== Reference details
    const cardRef = el("div", "hse_card");
    cardRef.appendChild(el("div", null, "Référence (compteur total)"));

    if (!ref_eid) {
      cardRef.appendChild(el("div", "hse_subtitle", "Aucune référence configurée."));
    } else {
      cardRef.appendChild(_mk_kv("Entity", ref_eid, true));
      cardRef.appendChild(_mk_kv("Puissance", _fmt_w(ref_w), false));
      if (ref_st) {
        cardRef.appendChild(_mk_kv("État brut", `${ref_st.state} ${(ref_st.attributes?.unit_of_measurement || "").trim()}`.trim(), false));
      }
    }

    container.appendChild(cardRef);
  }

  window.hse_overview_view = { render_overview };
})();
