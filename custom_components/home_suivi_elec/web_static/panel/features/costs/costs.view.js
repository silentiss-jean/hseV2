(function () {
  const { el, clear } = window.hse_dom;

  function _ls_get(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function _ls_set(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  function _num(x) {
    const v = Number.parseFloat(String(x));
    return Number.isFinite(v) ? v : null;
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

  function _fmt_pct(x) {
    const v = _num(x);
    if (v == null) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)} %`;
  }

  function _fmt_delta_kwh(x) {
    const v = _num(x);
    if (v == null) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(3)} kWh`;
  }

  function _display_mode(pricing) {
    const saved = String(_ls_get("hse_costs_tax_mode") || "").toLowerCase();
    if (saved === "ht" || saved === "ttc") return saved;
    const mode = String(pricing?.display_mode || "ttc").toLowerCase();
    return mode === "ht" ? "ht" : "ttc";
  }

  function _set_display_mode(mode) {
    _ls_set("hse_costs_tax_mode", mode === "ht" ? "ht" : "ttc");
  }

  function _subtab() {
    const v = String(_ls_get("hse_costs_subtab") || "today").toLowerCase();
    return v === "comparisons" ? "comparisons" : "today";
  }

  function _set_subtab(v) {
    _ls_set("hse_costs_subtab", v === "comparisons" ? "comparisons" : "today");
  }

  function _preset() {
    const v = String(_ls_get("hse_costs_compare_preset") || "today_vs_yesterday").toLowerCase();
    return ["today_vs_yesterday", "this_week_vs_last_week", "this_weekend_vs_last_weekend", "custom_periods"].includes(v) ? v : "today_vs_yesterday";
  }

  function _set_preset(v) {
    _ls_set("hse_costs_compare_preset", v);
  }

  function _week_mode() {
    const v = String(_ls_get("hse_costs_week_mode") || "classic").toLowerCase();
    return v === "custom" ? "custom" : "classic";
  }

  function _set_week_mode(v) {
    _ls_set("hse_costs_week_mode", v === "custom" ? "custom" : "classic");
  }

  function _custom_week_start() {
    const raw = Number.parseInt(String(_ls_get("hse_costs_custom_week_start") || "5"), 10);
    return Number.isFinite(raw) && raw >= 0 && raw <= 6 ? raw : 5;
  }

  function _set_custom_week_start(v) {
    _ls_set("hse_costs_custom_week_start", String(v));
  }

  function _pill_title(text) {
    return el("div", "hse_pill_title", text);
  }

  function _mk_kv(label, value) {
    const row = el("div", "hse_toolbar");
    row.appendChild(el("div", "hse_subtitle", label));
    row.appendChild(el("div", "hse_kpi_value", value == null || value === "" ? "—" : String(value)));
    return row;
  }

  function _row_cost(row, mode) {
    return mode === "ht" ? row?.cost_ht : row?.cost_ttc;
  }

  function _row_total(row, mode) {
    return mode === "ht" ? row?.total_ht : row?.total_ttc;
  }

  function _find_period_row(rows, period) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.find((r) => r?.period === period) || null;
  }

  function _mk_toggle_button(label, active, onClick) {
    const btn = el("button", "hse_button", label);
    btn.disabled = !!active;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function _format_date(date, withTime) {
    const opts = withTime
      ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short" };
    return new Intl.DateTimeFormat("fr-FR", opts).format(date);
  }

  function _start_of_day(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function _end_of_day(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function _shift_days(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function _start_of_week(date, startDay) {
    const d = _start_of_day(date);
    const day = d.getDay();
    const diff = (day - startDay + 7) % 7;
    return _shift_days(d, -diff);
  }

  function _end_of_week(date, startDay) {
    return _end_of_day(_shift_days(_start_of_week(date, startDay), 6));
  }

  function _range_label(start, end) {
    return `${_format_date(start, true)} → ${_format_date(end, true)}`;
  }

  function _current_ranges(now, preset, weekMode, customWeekStart) {
    const classicStart = 1;
    const activeStart = weekMode === "custom" ? customWeekStart : classicStart;

    if (preset === "this_week_vs_last_week") {
      const refStart = _start_of_week(now, activeStart);
      const refEnd = _end_of_week(now, activeStart);
      const cmpStart = _shift_days(refStart, -7);
      const cmpEnd = _end_of_day(_shift_days(cmpStart, 6));
      return { reference: [refStart, refEnd], compare: [cmpStart, cmpEnd] };
    }

    if (preset === "this_weekend_vs_last_weekend") {
      const day = now.getDay();
      const saturdayOffset = (6 - day + 7) % 7;
      const saturday = _start_of_day(_shift_days(now, saturdayOffset));
      const sunday = _end_of_day(_shift_days(saturday, 1));
      const lastSaturday = _shift_days(saturday, -7);
      const lastSunday = _end_of_day(_shift_days(lastSaturday, 1));
      return { reference: [saturday, sunday], compare: [lastSaturday, lastSunday] };
    }

    if (preset === "custom_periods") {
      const refStart = _start_of_week(now, activeStart);
      const refEnd = _end_of_week(now, activeStart);
      return { reference: [refStart, refEnd], compare: [null, null] };
    }

    const todayStart = _start_of_day(now);
    const todayEnd = _end_of_day(now);
    const yesterdayStart = _start_of_day(_shift_days(now, -1));
    const yesterdayEnd = _end_of_day(_shift_days(now, -1));
    return { reference: [todayStart, todayEnd], compare: [yesterdayStart, yesterdayEnd] };
  }

  function _render_header(container, mode, onModeChange, subtab, onSubtabChange) {
    const card = el("div", "hse_card");
    card.appendChild(el("div", "hse_kpi_title", "📊 Analyse de coûts"));

    const top = el("div", "hse_card_header");
    const left = el("div", "hse_card_actions");
    left.appendChild(_mk_toggle_button("Aujourd'hui", subtab === "today", () => onSubtabChange("today")));
    left.appendChild(_mk_toggle_button("Comparaisons", subtab === "comparisons", () => onSubtabChange("comparisons")));
    top.appendChild(left);

    const right = el("div", "hse_card_actions");
    right.appendChild(_mk_toggle_button("Vue HT", mode === "ht", () => onModeChange("ht")));
    right.appendChild(_mk_toggle_button("Vue TTC", mode === "ttc", () => onModeChange("ttc")));
    top.appendChild(right);

    card.appendChild(top);
    container.appendChild(card);
  }

  function _render_today(container, dash, mode) {
    const internalDay = _find_period_row(dash?.cumulative_table, "day");
    const referenceDay = _find_period_row(dash?.reference_table, "day");
    const deltaDay = _find_period_row(dash?.delta_table, "day");

    const card = el("div", "hse_card");
    card.appendChild(_pill_title("Coûts d'aujourd'hui"));
    card.appendChild(el("div", "hse_subtitle", `Vue ${mode.toUpperCase()} · synthèse journalière basée sur les helpers courants.`));

    const grid = el("div", "hse_grid_2col");

    const mkSummary = (title, row, badge) => {
      const box = el("div", "hse_card hse_card_compact");
      if (badge) box.appendChild(el("div", "hse_subtitle", badge));
      box.appendChild(el("div", "hse_kpi_title", title));
      box.appendChild(_mk_kv("Énergie", _fmt_kwh(row?.kwh)));
      box.appendChild(_mk_kv("Coût consommation", _fmt_eur(_row_cost(row, mode))));
      box.appendChild(_mk_kv("Total", _fmt_eur(_row_total(row, mode))));
      return box;
    };

    if (dash?.reference?.entity_id) {
      grid.appendChild(mkSummary(dash.reference.name || dash.reference.entity_id, referenceDay, "🏠 Référence"));
    }
    grid.appendChild(mkSummary("Capteurs internes", internalDay, "🧾 Interne"));
    grid.appendChild(mkSummary("Écart compteur - interne", deltaDay, "ℹ️ Delta"));

    card.appendChild(grid);
    container.appendChild(card);

    const perSensor = Array.isArray(dash?.per_sensor_costs) ? dash.per_sensor_costs.slice() : [];
    const getDayCost = (r) => {
      const costMap = mode === "ht" ? r.cost_ht : r.cost_ttc;
      return costMap && typeof costMap === "object" ? costMap.day : null;
    };
    perSensor.sort((a, b) => (_num(getDayCost(b)) || -1e9) - (_num(getDayCost(a)) || -1e9));
    const top = perSensor.slice(0, 10);

    const list = el("div", "hse_card");
    list.appendChild(_pill_title("Top 10 des capteurs les plus coûteux"));
    list.appendChild(el("div", "hse_subtitle", `Classement journalier en ${mode.toUpperCase()}.`));

    if (!top.length) {
      list.appendChild(el("div", "hse_subtitle", "Aucune donnée disponible."));
    } else {
      const grid2 = el("div", "hse_kpi_grid");
      for (const r of top) {
        const box = el("div", "hse_kpi_card");
        box.appendChild(el("div", "hse_kpi_title", r.name || r.entity_id));
        box.appendChild(el("div", "hse_subtitle", r.entity_id || ""));
        box.appendChild(_mk_kv("Jour", _fmt_eur(getDayCost(r))));
        grid2.appendChild(box);
      }
      list.appendChild(grid2);
    }

    container.appendChild(list);
  }

  async function _fetch_compare(hass, payload) {
    if (!hass?.callApi) throw new Error("hass_unavailable");
    return hass.callApi("POST", "home_suivi_elec/unified/costs/compare", payload || {});
  }

  function _compare_payload(mode, preset, weekMode, customWeekStart) {
    return {
      preset,
      tax_mode: mode,
      week_mode: weekMode,
      custom_week_start: customWeekStart,
    };
  }

  function _render_compare_block(container, title, currentRow, previousRow, summaryRow, mode) {
    const card = el("div", "hse_card hse_card_compact");
    card.appendChild(el("div", "hse_kpi_title", title));
    card.appendChild(_mk_kv("Référence énergie", _fmt_kwh(currentRow?.kwh)));
    card.appendChild(_mk_kv("Comparée énergie", _fmt_kwh(previousRow?.kwh)));
    card.appendChild(_mk_kv("Delta énergie", _fmt_delta_kwh(summaryRow?.delta_kwh)));
    card.appendChild(_mk_kv("Delta énergie %", _fmt_pct(summaryRow?.pct_kwh)));
    card.appendChild(_mk_kv("Référence total", _fmt_eur(_row_total(currentRow, mode))));
    card.appendChild(_mk_kv("Comparée total", _fmt_eur(_row_total(previousRow, mode))));
    card.appendChild(_mk_kv("Delta total", _fmt_eur(mode === "ht" ? summaryRow?.delta_total_ht : summaryRow?.delta_total_ttc)));
    card.appendChild(_mk_kv("Delta total %", _fmt_pct(mode === "ht" ? summaryRow?.pct_total_ht : summaryRow?.pct_total_ttc)));
    container.appendChild(card);
  }

  function _render_compare_lists(container, rows, mode) {
    const grid = el("div", "hse_grid_2col");
    const key = mode === "ht" ? "total_ht" : "total_ttc";

    const up = rows
      .filter((r) => _num(r?.delta?.[key]) != null)
      .sort((a, b) => (_num(b?.delta?.[key]) || 0) - (_num(a?.delta?.[key]) || 0))
      .slice(0, 5);

    const down = rows
      .filter((r) => _num(r?.delta?.[key]) != null)
      .sort((a, b) => (_num(a?.delta?.[key]) || 0) - (_num(b?.delta?.[key]) || 0))
      .slice(0, 5);

    const mkList = (title, items) => {
      const card = el("div", "hse_card hse_card_compact");
      card.appendChild(el("div", "hse_kpi_title", title));
      if (!items.length) {
        card.appendChild(el("div", "hse_subtitle", "Aucune donnée disponible."));
        return card;
      }
      for (const row of items) {
        const line = el("div", "hse_toolbar");
        line.appendChild(el("div", null, row?.name || row?.entity_id || "—"));
        line.appendChild(el("div", "hse_kpi_value", _fmt_eur(row?.delta?.[key])));
        card.appendChild(line);
      }
      return card;
    };

    grid.appendChild(mkList("Top hausses", up));
    grid.appendChild(mkList("Top baisses", down));
    container.appendChild(grid);
  }

  async function _render_comparisons(container, dash, mode, rerender, hass) {
    const preset = _preset();
    const weekMode = _week_mode();
    const customWeekStart = _custom_week_start();
    const now = new Date();
    const ranges = _current_ranges(now, preset, weekMode, customWeekStart);

    const card = el("div", "hse_card");
    card.appendChild(_pill_title("Analyse comparative"));

    const presets = el("div", "hse_card_actions");
    presets.appendChild(_mk_toggle_button("Aujourd'hui vs Hier", preset === "today_vs_yesterday", () => { _set_preset("today_vs_yesterday"); rerender(); }));
    presets.appendChild(_mk_toggle_button("Cette semaine vs Dernière semaine", preset === "this_week_vs_last_week", () => { _set_preset("this_week_vs_last_week"); rerender(); }));
    presets.appendChild(_mk_toggle_button("Ce weekend vs Weekend dernier", preset === "this_weekend_vs_last_weekend", () => { _set_preset("this_weekend_vs_last_weekend"); rerender(); }));
    presets.appendChild(_mk_toggle_button("Périodes personnalisées", preset === "custom_periods", () => { _set_preset("custom_periods"); rerender(); }));
    card.appendChild(presets);

    const weekModes = el("div", "hse_card_actions");
    weekModes.appendChild(_mk_toggle_button("Semaine classique", weekMode === "classic", () => { _set_week_mode("classic"); rerender(); }));
    weekModes.appendChild(_mk_toggle_button("Semaine custom", weekMode === "custom", () => { _set_week_mode("custom"); rerender(); }));
    card.appendChild(weekModes);

    if (weekMode === "custom") {
      const wrap = el("div", "hse_toolbar");
      wrap.appendChild(el("div", "hse_subtitle", "Début de semaine custom"));
      const select = document.createElement("select");
      select.className = "hse_input";
      const names = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      names.forEach((name, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = name;
        opt.selected = idx === customWeekStart;
        select.appendChild(opt);
      });
      select.addEventListener("change", () => {
        _set_custom_week_start(Number.parseInt(select.value, 10));
        rerender();
      });
      wrap.appendChild(select);
      card.appendChild(wrap);
    }

    card.appendChild(el("div", "hse_subtitle", `Période de référence: ${ranges.reference[0] ? _range_label(ranges.reference[0], ranges.reference[1]) : "—"}`));
    card.appendChild(el("div", "hse_subtitle", `Période à comparer: ${ranges.compare[0] ? _range_label(ranges.compare[0], ranges.compare[1]) : "à définir"}`));

    const body = el("div", "hse_card hse_card_compact");
    body.appendChild(el("div", "hse_subtitle", "Chargement des comparaisons…"));
    card.appendChild(body);
    container.appendChild(card);

    try {
      const resp = await _fetch_compare(hass, _compare_payload(mode, preset, weekMode, customWeekStart));
      clear(body);

      const meta = resp?.meta || {};
      if (meta?.resolved_reference_range?.start && meta?.resolved_reference_range?.end) {
        body.appendChild(el("div", "hse_subtitle", `Backend référence: ${meta.resolved_reference_range.start} → ${meta.resolved_reference_range.end}`));
      }
      if (meta?.resolved_compare_range?.start && meta?.resolved_compare_range?.end) {
        body.appendChild(el("div", "hse_subtitle", `Backend comparaison: ${meta.resolved_compare_range.start} → ${meta.resolved_compare_range.end}`));
      }

      if (!resp || resp.ok !== true) {
        body.appendChild(el("div", "hse_kpi_title", "Erreur"));
        body.appendChild(el("div", "hse_subtitle", "La comparaison de coûts a échoué."));
        return;
      }

      if (resp.supported === false) {
        body.appendChild(el("div", "hse_kpi_title", "Comparaison partielle"));
        body.appendChild(el("div", "hse_subtitle", "Ce preset n'est pas encore supporté par le backend actuel sans historique recorder. Utilise aujourd'hui vs hier ou cette semaine vs dernière semaine."));
        const warns = Array.isArray(resp.warnings) ? resp.warnings : [];
        if (warns.length) {
          body.appendChild(el("pre", "hse_code", warns.join("\n")));
        }
        return;
      }

      const summaryGrid = el("div", "hse_grid_2col");
      _render_compare_block(summaryGrid, "Référence", resp?.reference_period?.reference || {}, resp?.compare_period?.reference || {}, resp?.summary?.reference || {}, mode);
      _render_compare_block(summaryGrid, "Interne", resp?.reference_period?.internal || {}, resp?.compare_period?.internal || {}, resp?.summary?.internal || {}, mode);
      _render_compare_block(summaryGrid, "Delta", resp?.reference_period?.delta || {}, resp?.compare_period?.delta || {}, resp?.summary?.delta || {}, mode);
      body.appendChild(summaryGrid);

      _render_compare_lists(body, Array.isArray(resp?.per_sensor) ? resp.per_sensor : [], mode);

      const warns = Array.isArray(resp?.warnings) ? resp.warnings : [];
      if (warns.length) {
        const note = el("div", "hse_card hse_card_compact");
        note.appendChild(el("div", "hse_kpi_title", "Notes techniques"));
        note.appendChild(el("pre", "hse_code", warns.join("\n")));
        body.appendChild(note);
      }
    } catch (err) {
      clear(body);
      body.appendChild(el("div", "hse_kpi_title", "Erreur comparaison"));
      body.appendChild(el("div", "hse_subtitle", String(err?.message || err || "compare_failed")));
    }
  }

  function render_costs(container, data, hass) {
    clear(container);
    const dash = data?.dashboard || null;
    if (!dash || dash.ok !== true) {
      const card = el("div", "hse_card");
      card.appendChild(_pill_title("Analyse de coûts"));
      card.appendChild(el("div", "hse_subtitle", "Impossible de charger les données de coût."));
      container.appendChild(card);
      return;
    }

    const pricing = dash.pricing || dash.defaults || {};
    const mode = _display_mode(pricing);
    const subtab = _subtab();
    const rerender = () => render_costs(container, data, hass);

    _render_header(
      container,
      mode,
      (nextMode) => {
        _set_display_mode(nextMode);
        rerender();
      },
      subtab,
      (nextSubtab) => {
        _set_subtab(nextSubtab);
        rerender();
      }
    );

    if (subtab === "comparisons") {
      _render_comparisons(container, dash, mode, rerender, hass);
      return;
    }

    _render_today(container, dash, mode);
  }

  window.hse_costs_view = { render_costs };
})();
