(function () {
  const { el, clear } = window.hse_dom;

  // ─── LocalStorage helpers ───────────────────────────────────────────────────
  function _ls_get(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function _ls_set(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  // ─── Formatters ─────────────────────────────────────────────────────────────
  function _num(x) {
    const v = Number.parseFloat(String(x));
    return Number.isFinite(v) ? v : null;
  }
  function _fmt_kwh(x) {
    const v = _num(x);
    return v == null ? "—" : `${v.toFixed(3)} kWh`;
  }
  function _fmt_eur(x) {
    const v = _num(x);
    return v == null ? "—" : `${v.toFixed(2)} €`;
  }
  function _fmt_pct(x) {
    const v = _num(x);
    if (v == null) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)} %`;
  }
  function _fmt_delta_kwh(x) {
    const v = _num(x);
    if (v == null) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(3)} kWh`;
  }
  function _fmt_delta_eur(x) {
    const v = _num(x);
    if (v == null) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)} €`;
  }

  // ─── Preferences (read-only helpers — never trigger re-render) ───────────────
  function _display_mode(pricing) {
    const saved = String(_ls_get("hse_costs_tax_mode") || "").toLowerCase();
    if (saved === "ht" || saved === "ttc") return saved;
    const mode = String(pricing?.display_mode || "ttc").toLowerCase();
    return mode === "ht" ? "ht" : "ttc";
  }
  function _set_display_mode(mode) { _ls_set("hse_costs_tax_mode", mode === "ht" ? "ht" : "ttc"); }

  function _subtab() {
    const v = String(_ls_get("hse_costs_subtab") || "today").toLowerCase();
    return v === "comparisons" ? "comparisons" : "today";
  }
  function _set_subtab(v) { _ls_set("hse_costs_subtab", v === "comparisons" ? "comparisons" : "today"); }

  function _preset() {
    const v = String(_ls_get("hse_costs_compare_preset") || "today_vs_yesterday").toLowerCase();
    return ["today_vs_yesterday","this_week_vs_last_week","this_weekend_vs_last_weekend","custom_periods"].includes(v) ? v : "today_vs_yesterday";
  }
  function _set_preset(v) { _ls_set("hse_costs_compare_preset", v); }

  function _week_mode() {
    const v = String(_ls_get("hse_costs_week_mode") || "classic").toLowerCase();
    return v === "custom" ? "custom" : "classic";
  }
  function _set_week_mode(v) { _ls_set("hse_costs_week_mode", v === "custom" ? "custom" : "classic"); }

  function _custom_week_start() {
    const raw = Number.parseInt(String(_ls_get("hse_costs_custom_week_start") || "1"), 10);
    return Number.isFinite(raw) && raw >= 0 && raw <= 6 ? raw : 1;
  }
  function _set_custom_week_start(v) { _ls_set("hse_costs_custom_week_start", String(v)); }

  function _get_custom_ranges() {
    const now = new Date();
    const defaultRefEnd = now;
    const defaultRefStart = _shift_days(now, -7);
    const defaultCmpEnd = defaultRefStart;
    const defaultCmpStart = _shift_days(defaultCmpEnd, -7);
    const refStart = _ls_get("hse_costs_custom_ref_start") || _datetime_local_value(defaultRefStart);
    const refEnd   = _ls_get("hse_costs_custom_ref_end")   || _datetime_local_value(defaultRefEnd);
    const cmpStart = _ls_get("hse_costs_custom_cmp_start") || _datetime_local_value(defaultCmpStart);
    const cmpEnd   = _ls_get("hse_costs_custom_cmp_end")   || _datetime_local_value(defaultCmpEnd);
    return { refStart, refEnd, cmpStart, cmpEnd };
  }
  function _set_custom_range(key, value) { _ls_set(key, value || ""); }

  // ─── Date utilities ─────────────────────────────────────────────────────────
  function _format_date(date, withTime) {
    const opts = withTime
      ? { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }
      : { day:"numeric", month:"short" };
    return new Intl.DateTimeFormat("fr-FR", opts).format(date);
  }
  function _start_of_day(date) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
  function _end_of_day(date)   { const d = new Date(date); d.setHours(23,59,59,999); return d; }
  function _shift_days(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
  function _start_of_week(date, startDay) {
    const d = _start_of_day(date);
    const diff = (d.getDay() - startDay + 7) % 7;
    return _shift_days(d, -diff);
  }
  function _datetime_local_value(date) {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function _datetime_from_local_value(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function _range_label(start, end) {
    return `${_format_date(start, true)} → ${_format_date(end, true)}`;
  }
  function _current_ranges(now, preset, weekMode, customWeekStart) {
    const activeStart = weekMode === "custom" ? customWeekStart : 1;
    if (preset === "this_week_vs_last_week") {
      const refStart = _start_of_week(now, activeStart);
      const refEnd   = new Date(now);
      const elapsed  = refEnd - refStart;
      const cmpStart = _shift_days(refStart, -7);
      const cmpEnd   = new Date(cmpStart.getTime() + elapsed);
      return { reference:[refStart,refEnd], compare:[cmpStart,cmpEnd] };
    }
    if (preset === "this_weekend_vs_last_weekend") {
      const jsDay = now.getDay();
      const satOff = (jsDay - 6 + 7) % 7;
      const refStart = _start_of_day(_shift_days(now, -satOff));
      if (jsDay === 6 || jsDay === 0) {
        const refEnd   = new Date(now);
        const elapsed  = refEnd - refStart;
        const cmpStart = _shift_days(refStart, -7);
        const cmpEnd   = new Date(cmpStart.getTime() + elapsed);
        return { reference:[refStart,refEnd], compare:[cmpStart,cmpEnd] };
      }
      const refEnd   = _end_of_day(_shift_days(refStart, 1));
      const cmpStart = _shift_days(refStart, -7);
      const cmpEnd   = _end_of_day(_shift_days(cmpStart, 1));
      return { reference:[refStart,refEnd], compare:[cmpStart,cmpEnd] };
    }
    if (preset === "custom_periods") {
      const c = _get_custom_ranges();
      return {
        reference: [_datetime_from_local_value(c.refStart), _datetime_from_local_value(c.refEnd)],
        compare:   [_datetime_from_local_value(c.cmpStart), _datetime_from_local_value(c.cmpEnd)],
      };
    }
    const todayStart     = _start_of_day(now);
    const todayEnd       = new Date(now);
    const elapsed        = todayEnd - todayStart;
    const yesterdayStart = _shift_days(todayStart, -1);
    const yesterdayEnd   = new Date(yesterdayStart.getTime() + elapsed);
    return { reference:[todayStart,todayEnd], compare:[yesterdayStart,yesterdayEnd] };
  }

  // ─── UI helpers ─────────────────────────────────────────────────────────────
  function _pill_title(text) { return el("div", "hse_pill_title", text); }

  function _mk_kv(label, value) {
    const row = el("div", "hse_toolbar");
    row.appendChild(el("div", "hse_subtitle", label));
    row.appendChild(el("div", "hse_kpi_value", value == null || value === "" ? "—" : String(value)));
    return row;
  }

  function _row_cost(row, mode)  { return mode === "ht" ? row?.cost_ht  : row?.cost_ttc; }
  function _row_total(row, mode) { return mode === "ht" ? row?.total_ht : row?.total_ttc; }
  function _find_period_row(rows, period) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.find((r) => r?.period === period) || null;
  }

  // Toggle button — disabled = active state (visually depressed)
  function _mk_toggle_button(label, active, onClick) {
    const btn = el("button", "hse_button", label);
    btn.disabled = !!active;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /**
   * Badge vert / orange / rouge selon la valeur du delta %.
   * seuils : |pct| < 5 → vert, < 20 → orange, sinon rouge
   * sens    : baisse = bien (vert si négatif), hausse = attention (orange/rouge si positif)
   */
  function _mk_badge(pct, invertGood) {
    const v = _num(pct);
    if (v == null) return null;
    const abs = Math.abs(v);
    let color, icon;
    if (abs < 5) {
      color = "#27ae60"; icon = "✅";
    } else if (abs < 20) {
      color = "#e67e22"; icon = "⚠️";
    } else {
      color = v > 0 ? (invertGood ? "#27ae60" : "#e74c3c") : (invertGood ? "#e74c3c" : "#27ae60");
      icon = abs >= 20 ? (v > 0 ? (invertGood ? "✅" : "🔴") : (invertGood ? "🔴" : "✅")) : "⚠️";
    }
    const badge = el("span", null);
    badge.style.cssText = `display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;background:${color}22;color:${color};font-weight:600;font-size:0.82em;border:1px solid ${color}66;`;
    badge.textContent = `${icon} ${_fmt_pct(v)}`;
    return badge;
  }

  // ─── Render: header with subtab + HT/TTC toggles ────────────────────────────
  function _render_header(container, mode, onModeChange, subtab, onSubtabChange) {
    const card = el("div", "hse_card");
    card.appendChild(el("div", "hse_kpi_title", "📊 Analyse de coûts"));
    const top = el("div", "hse_card_header");
    const left = el("div", "hse_card_actions");
    left.appendChild(_mk_toggle_button("Aujourd'hui",   subtab === "today",        () => onSubtabChange("today")));
    left.appendChild(_mk_toggle_button("Comparaisons",  subtab === "comparisons",  () => onSubtabChange("comparisons")));
    top.appendChild(left);
    const right = el("div", "hse_card_actions");
    right.appendChild(_mk_toggle_button("Vue HT",  mode === "ht",  () => onModeChange("ht")));
    right.appendChild(_mk_toggle_button("Vue TTC", mode === "ttc", () => onModeChange("ttc")));
    top.appendChild(right);
    card.appendChild(top);
    container.appendChild(card);
  }

  // ─── Render: today tab ───────────────────────────────────────────────────────
  function _render_today(container, dash, mode) {
    const internalDay  = _find_period_row(dash?.cumulative_table,  "day");
    const referenceDay = _find_period_row(dash?.reference_table,   "day");
    const deltaDay     = _find_period_row(dash?.delta_table,       "day");

    // ── Synthesis banner ──────────────────────────────────────────────────────
    const refKwh      = _num(referenceDay?.kwh);
    const intKwh      = _num(internalDay?.kwh);
    const refTtc      = _num(_row_total(referenceDay, mode));
    const intTtc      = _num(_row_total(internalDay,  mode));
    const deltaTtc    = _num(_row_total(deltaDay,     mode));
    const gapPct      = refKwh && intKwh ? ((refKwh - intKwh) / refKwh) * 100 : null;

    const banner = el("div", "hse_card");
    const bannerTop = el("div", "hse_card_header");
    bannerTop.appendChild(el("div", "hse_kpi_title", "🏠 Bilan du jour"));
    if (refTtc != null) {
      const priceBadge = el("span", null);
      priceBadge.style.cssText = "font-size:1.4em;font-weight:700;color:var(--primary-color,#4caf50);";
      priceBadge.textContent = _fmt_eur(refTtc);
      bannerTop.appendChild(priceBadge);
    }
    banner.appendChild(bannerTop);

    // Gap sentence
    if (gapPct != null) {
      const gapAbs = Math.abs(gapPct);
      let gapMsg, gapColor;
      if (gapAbs < 5)  { gapMsg = "Les capteurs internes couvrent la quasi-totalité de la consommation."; gapColor = "#27ae60"; }
      else if (gapAbs < 20) { gapMsg = `Écart compteur/interne de ${gapAbs.toFixed(1)} % — consommation partiellement non tracée.`; gapColor = "#e67e22"; }
      else { gapMsg = `Écart important de ${gapAbs.toFixed(1)} % — vérifier les capteurs non couverts.`; gapColor = "#e74c3c"; }
      const gapEl = el("div", null);
      gapEl.style.cssText = `margin:6px 0;padding:8px 14px;border-left:4px solid ${gapColor};background:${gapColor}18;border-radius:0 8px 8px 0;font-size:0.9em;`;
      gapEl.textContent = gapMsg;
      banner.appendChild(gapEl);
    }

    // Progress bar: interne vs référence
    if (refKwh && intKwh && refKwh > 0) {
      const pct = Math.min(100, (intKwh / refKwh) * 100);
      const barWrap = el("div", null);
      barWrap.style.cssText = "margin:8px 0 4px;";
      const barLabel = el("div", "hse_subtitle");
      barLabel.textContent = `Couverture capteurs internes : ${pct.toFixed(1)} % (${_fmt_kwh(intKwh)} / ${_fmt_kwh(refKwh)})`;
      barWrap.appendChild(barLabel);
      const barTrack = el("div", null);
      barTrack.style.cssText = "height:8px;background:rgba(128,128,128,0.2);border-radius:4px;overflow:hidden;margin-top:4px;";
      const barFill = el("div", null);
      const fillColor = pct > 90 ? "#27ae60" : pct > 70 ? "#e67e22" : "#e74c3c";
      barFill.style.cssText = `height:100%;width:${pct}%;background:${fillColor};border-radius:4px;transition:width 0.4s ease;`;
      barTrack.appendChild(barFill);
      barWrap.appendChild(barTrack);
      banner.appendChild(barWrap);
    }

    container.appendChild(banner);

    // ── Reference + Internal + Delta grid ─────────────────────────────────────
    const card = el("div", "hse_card");
    card.appendChild(_pill_title("Coûts d'aujourd'hui"));
    card.appendChild(el("div", "hse_subtitle", `Vue ${mode.toUpperCase()} · synthèse journalière.`));
    const grid = el("div", "hse_grid_2col");

    const mkSummary = (title, row, badge) => {
      const box = el("div", "hse_card hse_card_compact");
      if (badge) box.appendChild(el("div", "hse_subtitle", badge));
      box.appendChild(el("div", "hse_kpi_title", title));
      box.appendChild(_mk_kv("Énergie",           _fmt_kwh(_num(row?.kwh))));
      box.appendChild(_mk_kv("Coût consommation", _fmt_eur(_row_cost(row, mode))));
      box.appendChild(_mk_kv("Total",             _fmt_eur(_row_total(row, mode))));
      return box;
    };

    if (dash?.reference?.entity_id) {
      grid.appendChild(mkSummary(dash.reference.name || dash.reference.entity_id, referenceDay, "🏠 Référence"));
    }
    grid.appendChild(mkSummary("Capteurs internes", internalDay, "🧾 Interne"));
    grid.appendChild(mkSummary("Écart compteur - interne", deltaDay, "ℹ️ Delta"));
    card.appendChild(grid);
    container.appendChild(card);

    // ── Top 10 coûteux ────────────────────────────────────────────────────────
    const perSensor = Array.isArray(dash?.per_sensor_costs) ? dash.per_sensor_costs.slice() : [];
    const getDayCost = (r) => {
      const costMap = mode === "ht" ? r.cost_ht : r.cost_ttc;
      return costMap && typeof costMap === "object" ? costMap.day : null;
    };
    perSensor.sort((a, b) => (_num(getDayCost(b)) || -1e9) - (_num(getDayCost(a)) || -1e9));
    const top10 = perSensor.slice(0, 10);

    const list = el("div", "hse_card");
    list.appendChild(_pill_title("Top 10 des capteurs les plus coûteux"));
    list.appendChild(el("div", "hse_subtitle", `Classement journalier en ${mode.toUpperCase()}.`));
    if (!top10.length) {
      list.appendChild(el("div", "hse_subtitle", "Aucune donnée disponible."));
    } else {
      const grid2 = el("div", "hse_kpi_grid");
      for (const r of top10) {
        const cost = getDayCost(r);
        const costV = _num(cost);
        const maxCost = _num(getDayCost(top10[0]));
        const box = el("div", "hse_kpi_card");
        box.appendChild(el("div", "hse_kpi_title", r.name || r.entity_id));
        box.appendChild(el("div", "hse_subtitle",  r.entity_id || ""));
        box.appendChild(_mk_kv("Jour", _fmt_eur(cost)));
        // mini progress bar relative to top sensor
        if (costV != null && maxCost && maxCost > 0) {
          const pct = Math.min(100, (costV / maxCost) * 100);
          const barTrack = el("div", null);
          barTrack.style.cssText = "height:4px;background:rgba(128,128,128,0.2);border-radius:2px;overflow:hidden;margin-top:4px;";
          const barFill = el("div", null);
          barFill.style.cssText = `height:100%;width:${pct}%;background:var(--primary-color,#4caf50);border-radius:2px;`;
          barTrack.appendChild(barFill);
          box.appendChild(barTrack);
        }
        grid2.appendChild(box);
      }
      list.appendChild(grid2);
    }
    container.appendChild(list);
  }

  // ─── Compare API ─────────────────────────────────────────────────────────────
  async function _fetch_compare(hass, payload) {
    if (!hass?.callApi) throw new Error("hass_unavailable");
    return hass.callApi("POST", "home_suivi_elec/unified/costs/compare", payload || {});
  }

  function _compare_payload(mode, preset, weekMode, customWeekStart) {
    const payload = { preset, tax_mode: mode, week_mode: weekMode, custom_week_start: customWeekStart };
    if (preset === "custom_periods") {
      const c = _get_custom_ranges();
      payload.reference_range = { start: c.refStart, end: c.refEnd };
      payload.compare_range   = { start: c.cmpStart, end: c.cmpEnd };
    }
    return payload;
  }

  // ─── Render: comparison synthesis card ───────────────────────────────────────
  function _render_compare_synthesis(container, resp, mode) {
    const key = mode === "ht" ? "total_ht" : "total_ttc";
    const pctKey = mode === "ht" ? "pct_total_ht" : "pct_total_ttc";
    const deltaKey = mode === "ht" ? "delta_total_ht" : "delta_total_ttc";

    // reference section (compteur)
    const refCur  = resp?.reference_period?.reference || {};
    const refPrev = resp?.compare_period?.reference   || {};
    const refSum  = resp?.summary?.reference           || {};
    // internal section
    const intCur  = resp?.reference_period?.internal  || {};
    const intPrev = resp?.compare_period?.internal    || {};
    const intSum  = resp?.summary?.internal            || {};

    const refPct  = _num(refSum[pctKey]);
    const intPct  = _num(intSum[pctKey]);

    // ── Global synthesis banner ───────────────────────────────────────────────
    const banner = el("div", "hse_card");
    const bannerHead = el("div", "hse_card_header");
    bannerHead.appendChild(el("div", "hse_kpi_title", "📋 Synthèse comparative"));
    const badgeRef = _mk_badge(refPct, false); // baisse = bien pour conso
    if (badgeRef) bannerHead.appendChild(badgeRef);
    banner.appendChild(bannerHead);

    // Phrase de synthèse
    const phrase = el("div", null);
    phrase.style.cssText = "margin:8px 0;font-size:0.95em;line-height:1.5;";
    if (refPct != null) {
      const absRef = Math.abs(refPct);
      const dirRef = refPct < 0 ? "baissé" : "augmenté";
      const colorRef = refPct < 0 ? "#27ae60" : "#e74c3c";
      const spanDir = el("strong", null, `${dirRef} de ${absRef.toFixed(1)} %`);
      spanDir.style.color = colorRef;
      phrase.appendChild(document.createTextNode("La consommation au compteur a "));
      phrase.appendChild(spanDir);
      phrase.appendChild(document.createTextNode(" par rapport à la période de référence."));
    } else {
      phrase.textContent = "Données de comparaison insuffisantes.";
    }
    banner.appendChild(phrase);

    // Résumé en deux colonnes
    const meta = resp?.meta || {};
    const metaGrid = el("div", "hse_grid_2col");

    const mkPeriodBox = (title, dateStr, kwh, totalVal, label) => {
      const box = el("div", "hse_card hse_card_compact");
      box.appendChild(el("div", "hse_subtitle", label));
      box.appendChild(el("div", "hse_kpi_title", title));
      if (dateStr) {
        const d = el("div", "hse_subtitle");
        d.style.cssText = "font-size:0.78em;opacity:0.7;margin-bottom:4px;";
        d.textContent = dateStr;
        box.appendChild(d);
      }
      box.appendChild(_mk_kv("Énergie",  _fmt_kwh(kwh)));
      box.appendChild(_mk_kv("Coût TTC", _fmt_eur(totalVal)));
      return box;
    };

    const refDateStr = meta?.resolved_reference_range
      ? `${meta.resolved_reference_range.start} → ${meta.resolved_reference_range.end}` : null;
    const cmpDateStr = meta?.resolved_compare_range
      ? `${meta.resolved_compare_range.start} → ${meta.resolved_compare_range.end}` : null;

    metaGrid.appendChild(mkPeriodBox("Période de référence", refDateStr, refCur?.kwh, _row_total(refCur, mode), "🏠 Référence"));
    metaGrid.appendChild(mkPeriodBox("Période à comparer",   cmpDateStr, refPrev?.kwh, _row_total(refPrev, mode), "📅 Comparée"));
    banner.appendChild(metaGrid);

    // Delta card
    const deltaBox = el("div", null);
    deltaBox.style.cssText = "margin-top:10px;";
    const dKwh  = _num(refSum?.delta_kwh);
    const dCost = _num(refSum?.[deltaKey]);
    if (dKwh != null || dCost != null) {
      const absColor = refPct != null ? (refPct < 0 ? "#27ae60" : refPct < 20 ? "#e67e22" : "#e74c3c") : "#666";
      const deltaInner = el("div", null);
      deltaInner.style.cssText = `display:flex;align-items:center;gap:12px;padding:10px 16px;border-left:4px solid ${absColor};background:${absColor}18;border-radius:0 8px 8px 0;`;
      const dKwhEl = el("span", null, `Δ Énergie ${_fmt_delta_kwh(dKwh)}`);
      dKwhEl.style.cssText = `color:${absColor};font-weight:600;`;
      deltaInner.appendChild(dKwhEl);
      if (dCost != null) {
        const dCostEl = el("span", null, `Δ Coût ${_fmt_delta_eur(dCost)}`);
        dCostEl.style.cssText = `color:${absColor};font-weight:600;`;
        deltaInner.appendChild(dCostEl);
      }
      if (refPct != null) {
        const b = _mk_badge(refPct, false);
        if (b) deltaInner.appendChild(b);
      }
      deltaBox.appendChild(deltaInner);
    }
    banner.appendChild(deltaBox);
    container.appendChild(banner);

    // ── Internal detail ───────────────────────────────────────────────────────
    const intCard = el("div", "hse_card");
    const intHead = el("div", "hse_card_header");
    intHead.appendChild(el("div", "hse_kpi_title", "🧾 Capteurs internes"));
    const badgeInt = _mk_badge(intPct, false);
    if (badgeInt) intHead.appendChild(badgeInt);
    intCard.appendChild(intHead);
    const intGrid = el("div", "hse_grid_2col");
    intGrid.appendChild(mkPeriodBox("Référence", null, intCur?.kwh,  _row_total(intCur,  mode), "📅 Période 1"));
    intGrid.appendChild(mkPeriodBox("Comparée",  null, intPrev?.kwh, _row_total(intPrev, mode), "📅 Période 2"));
    intCard.appendChild(intGrid);
    container.appendChild(intCard);
  }

  // ─── Render: per-sensor variations ───────────────────────────────────────────
  function _render_compare_variations(container, rows, mode) {
    const key = mode === "ht" ? "total_ht" : "total_ttc";
    const arr = Array.isArray(rows) ? rows : [];
    const withDelta = arr.filter((r) => _num(r?.delta?.[key]) != null);
    if (!withDelta.length) return;

    const sorted = withDelta.slice().sort((a,b) => (_num(b?.delta?.[key]) || 0) - (_num(a?.delta?.[key]) || 0));
    // top 5 hausses + top 5 baisses
    const up   = sorted.slice(0, 5);
    const down = sorted.slice(-5).reverse();

    const card = el("div", "hse_card");
    card.appendChild(_pill_title("🔝 Top 10 des plus grandes variations"));

    const mkVariRow = (row, rank) => {
      const dVal = _num(row?.delta?.[key]);
      const dKwh = _num(row?.delta?.kwh);
      const curVal  = _num(row?.reference?.[key]);
      const prevVal = _num(row?.compare?.[key]);
      const pct = prevVal && prevVal !== 0 ? ((dVal / Math.abs(prevVal)) * 100) : null;

      const item = el("div", null);
      item.style.cssText = "margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(128,128,128,0.15);";

      const topLine = el("div", "hse_card_header");
      const nameEl = el("div", null);
      nameEl.appendChild(el("span", "hse_subtitle", `#${rank} `));
      const nameStrong = el("strong", null, row?.name || row?.entity_id || "—");
      nameEl.appendChild(nameStrong);
      topLine.appendChild(nameEl);
      if (pct != null) {
        const b = _mk_badge(pct, false);
        if (b) topLine.appendChild(b);
      }
      item.appendChild(topLine);

      // direction phrase
      if (dVal != null) {
        const dir   = dVal < 0 ? "diminué" : "augmenté";
        const color = dVal < 0 ? "#27ae60" : "#e74c3c";
        const ph = el("div", null);
        ph.style.cssText = `font-size:0.88em;margin:4px 0;`;
        ph.innerHTML = `Le capteur <strong>${row?.name || row?.entity_id || "—"}</strong> a <strong style="color:${color}">${dir} de ${pct != null ? Math.abs(pct).toFixed(1) + " %" : "—"}</strong>. Il coûte <strong>${_fmt_delta_eur(dVal)}</strong> ${dVal < 0 ? "de moins" : "de plus"} par rapport à la période de référence.`;
        item.appendChild(ph);
      }

      // KV grid
      const kv = el("div", null);
      kv.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:0.85em;margin-top:6px;";
      const mkCell = (label, val) => {
        const c = el("div", null);
        c.style.cssText = "background:rgba(128,128,128,0.07);border-radius:6px;padding:5px 8px;";
        c.appendChild(el("div", "hse_subtitle", label));
        c.appendChild(el("div", "hse_kpi_value", val));
        return c;
      };
      kv.appendChild(mkCell("Baseline:", `${_fmt_kwh(row?.reference?.kwh)} → ${_fmt_eur(row?.reference?.[key])}`));
      kv.appendChild(mkCell("Event:",    `${_fmt_kwh(row?.compare?.kwh)}   → ${_fmt_eur(row?.compare?.[key])}`));
      kv.appendChild(mkCell("Delta:",    `${_fmt_delta_kwh(dKwh)} → ${_fmt_delta_eur(dVal)}`));
      item.appendChild(kv);

      if (row?.entity_id) {
        const focusBtn = el("button", "hse_button", "🎯 Focus sur ce capteur");
        focusBtn.style.cssText = "margin-top:6px;font-size:0.8em;";
        item.appendChild(focusBtn);
      }

      return item;
    };

    // merge up + down deduplicated
    const seen = new Set();
    const merged = [];
    for (const r of [...up, ...down]) {
      const id = r?.entity_id || r?.name;
      if (!seen.has(id)) { seen.add(id); merged.push(r); }
    }

    let rank = 1;
    for (const r of merged) {
      card.appendChild(mkVariRow(r, rank++));
    }

    container.appendChild(card);
  }

  // ─── Render: comparisons tab
  // KEY FIX: inputs (datetime-local, select) are attached with event listeners
  // that only write to localStorage then call rerender — they do NOT cause
  // in-flight DOM teardown because rerender() is deferred via requestAnimationFrame
  // and inputs are never recreated while the user is typing/selecting.
  // ─────────────────────────────────────────────────────────────────────────────
  async function _render_comparisons(container, dash, mode, rerender, hass) {
    const preset          = _preset();
    const weekMode        = _week_mode();
    const customWeekStart = _custom_week_start();
    const now             = new Date();
    const ranges          = _current_ranges(now, preset, weekMode, customWeekStart);

    // ── Controls card (preset buttons, week mode, custom inputs) ──────────────
    const ctrl = el("div", "hse_card");
    ctrl.appendChild(_pill_title("Analyse comparative"));

    // preset buttons
    const presetRow = el("div", "hse_card_actions");
    const presetsMap = [
      ["today_vs_yesterday",         "Aujourd'hui vs Hier"],
      ["this_week_vs_last_week",      "Cette semaine vs Dernière"],
      ["this_weekend_vs_last_weekend","Ce weekend vs Weekend dernier"],
      ["custom_periods",              "Périodes personnalisées"],
    ];
    for (const [val, label] of presetsMap) {
      presetRow.appendChild(_mk_toggle_button(label, preset === val, () => { _set_preset(val); rerender(); }));
    }
    ctrl.appendChild(presetRow);

    // week mode buttons (only show for week preset)
    if (preset === "this_week_vs_last_week") {
      const weekRow = el("div", "hse_card_actions");
      weekRow.appendChild(_mk_toggle_button("Semaine classique", weekMode === "classic", () => { _set_week_mode("classic"); rerender(); }));
      weekRow.appendChild(_mk_toggle_button("Semaine custom",    weekMode === "custom",  () => { _set_week_mode("custom");  rerender(); }));
      ctrl.appendChild(weekRow);

      if (weekMode === "custom") {
        const wrap = el("div", "hse_toolbar");
        wrap.appendChild(el("div", "hse_subtitle", "Début de semaine"));
        const select = document.createElement("select");
        select.className = "hse_input";
        ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"].forEach((name, idx) => {
          const opt = document.createElement("option");
          opt.value = String(idx);
          opt.textContent = name;
          opt.selected = idx === customWeekStart;
          select.appendChild(opt);
        });
        // IMPORTANT: no rerender() inside change — write only, rerender deferred
        select.addEventListener("change", () => {
          _set_custom_week_start(Number.parseInt(select.value, 10));
          // rerender after a microtask so the select keeps focus
          Promise.resolve().then(() => rerender());
        });
        wrap.appendChild(select);
        ctrl.appendChild(wrap);
      }
    }

    // custom period inputs — CRITICAL: no rerender on every keystroke, only on blur/change
    if (preset === "custom_periods") {
      const pCard = el("div", "hse_card hse_card_compact");
      pCard.appendChild(el("div", "hse_kpi_title", "Périodes personnalisées"));
      const custom = _get_custom_ranges();
      const fields = [
        ["Référence début", "hse_costs_custom_ref_start", custom.refStart],
        ["Référence fin",   "hse_costs_custom_ref_end",   custom.refEnd],
        ["Comparée début",  "hse_costs_custom_cmp_start", custom.cmpStart],
        ["Comparée fin",    "hse_costs_custom_cmp_end",   custom.cmpEnd],
      ];
      for (const [label, key, value] of fields) {
        const row = el("div", "hse_toolbar");
        row.appendChild(el("div", "hse_subtitle", label));
        const input = document.createElement("input");
        input.type = "datetime-local";
        input.className = "hse_input";
        input.value = value || "";
        // Only write to storage on change (user picks via picker) — NO rerender here.
        // A separate "Comparer" button triggers the rerender to avoid tearing the inputs.
        input.addEventListener("change", () => {
          _set_custom_range(key, input.value || "");
        });
        row.appendChild(input);
        pCard.appendChild(row);
      }
      // Explicit apply button — user decides when to trigger the comparison fetch
      const applyBtn = el("button", "hse_button hse_button_primary", "🔍 Comparer ces périodes");
      applyBtn.style.cssText = "margin-top:8px;";
      applyBtn.addEventListener("click", () => rerender());
      pCard.appendChild(applyBtn);
      ctrl.appendChild(pCard);
    }

    // Date range summary
    ctrl.appendChild(el("div", "hse_subtitle",
      `Période de référence : ${ranges.reference[0] ? _range_label(ranges.reference[0], ranges.reference[1]) : "—"}`));
    ctrl.appendChild(el("div", "hse_subtitle",
      `Période à comparer : ${ranges.compare[0] ? _range_label(ranges.compare[0], ranges.compare[1]) : "à définir"}`));

    container.appendChild(ctrl);

    // ── Results area ──────────────────────────────────────────────────────────
    const body = el("div", "hse_card hse_card_compact");
    body.appendChild(el("div", "hse_subtitle", "Chargement des comparaisons…"));
    container.appendChild(body);

    try {
      const resp = await _fetch_compare(hass, _compare_payload(mode, preset, weekMode, customWeekStart));
      clear(body);

      if (!resp || resp.ok !== true) {
        body.appendChild(el("div", "hse_kpi_title", "Erreur"));
        body.appendChild(el("div", "hse_subtitle", "La comparaison de coûts a échoué."));
        return;
      }

      if (resp.supported === false) {
        body.appendChild(el("div", "hse_kpi_title", "Comparaison indisponible"));
        body.appendChild(el("div", "hse_subtitle", "Le backend n'a pas pu résoudre cette comparaison."));
        const warns = Array.isArray(resp.warnings) ? resp.warnings : [];
        if (warns.length) body.appendChild(el("pre", "hse_code", warns.join("\n")));
        return;
      }

      _render_compare_synthesis(body, resp, mode);
      _render_compare_variations(body, Array.isArray(resp?.per_sensor) ? resp.per_sensor : [], mode);

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

  // ─── Main entry point ────────────────────────────────────────────────────────
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
    const mode    = _display_mode(pricing);
    const subtab  = _subtab();

    // rerender via rAF to avoid re-entrancy and to let the browser finish the current paint
    // before tearing down and rebuilding the DOM — this prevents inputs from losing focus.
    let _raf_pending = false;
    const rerender = () => {
      if (_raf_pending) return;
      _raf_pending = true;
      window.requestAnimationFrame(() => {
        _raf_pending = false;
        render_costs(container, data, hass);
      });
    };

    _render_header(
      container,
      mode,
      (nextMode) => { _set_display_mode(nextMode); rerender(); },
      subtab,
      (nextSubtab) => { _set_subtab(nextSubtab); rerender(); }
    );

    if (subtab === "comparisons") {
      _render_comparisons(container, dash, mode, rerender, hass);
      return;
    }

    _render_today(container, dash, mode);
  }

  window.hse_costs_view = { render_costs };
})();
