(function () {
  const { el, clear } = window.hse_dom;

  // ─── LocalStorage helpers ────────────────────────────────────────────────────
  function _ls_get(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }
  function _ls_set(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  // ─── Formatters ──────────────────────────────────────────────────────────────
  function _num(x) {
    const v = Number.parseFloat(String(x));
    return Number.isFinite(v) ? v : null;
  }
  function _fmt_kwh(x)       { const v = _num(x); return v == null ? "—" : `${v.toFixed(3)} kWh`; }
  function _fmt_eur(x)       { const v = _num(x); return v == null ? "—" : `${v.toFixed(2)} €`; }
  function _fmt_pct(x)       { const v = _num(x); if (v == null) return "—"; return `${v > 0 ? "+" : ""}${v.toFixed(1)} %`; }
  function _fmt_delta_kwh(x) { const v = _num(x); if (v == null) return "—"; return `${v > 0 ? "+" : ""}${v.toFixed(3)} kWh`; }
  function _fmt_delta_eur(x) { const v = _num(x); if (v == null) return "—"; return `${v > 0 ? "+" : ""}${v.toFixed(2)} €`; }

  // ─── Preferences ─────────────────────────────────────────────────────────────
  function _display_mode(pricing) {
    const saved = String(_ls_get("hse_costs_tax_mode") || "").toLowerCase();
    if (saved === "ht" || saved === "ttc") return saved;
    return String(pricing?.display_mode || "ttc").toLowerCase() === "ht" ? "ht" : "ttc";
  }
  function _set_display_mode(mode) { _ls_set("hse_costs_tax_mode", mode === "ht" ? "ht" : "ttc"); }

  function _subtab() {
    const v = String(_ls_get("hse_costs_subtab") || "period").toLowerCase();
    return v === "compare" ? "compare" : "period";
  }
  function _set_subtab(v) { _ls_set("hse_costs_subtab", v === "compare" ? "compare" : "period"); }

  // ── Period preset (for "Période" tab) ────────────────────────────────────────
  function _period_preset() {
    const v = String(_ls_get("hse_costs_period_preset") || "today").toLowerCase();
    return ["today","yesterday","7days","30days","this_month","last_month","custom"].includes(v) ? v : "today";
  }
  function _set_period_preset(v) { _ls_set("hse_costs_period_preset", v); }

  // ── Compare preset ───────────────────────────────────────────────────────────
  function _compare_preset() {
    const v = String(_ls_get("hse_costs_compare_preset") || "today_vs_yesterday").toLowerCase();
    return ["today_vs_yesterday","this_week_vs_last_week","this_weekend_vs_last_weekend","custom"].includes(v) ? v : "today_vs_yesterday";
  }
  function _set_compare_preset(v) { _ls_set("hse_costs_compare_preset", v); }

  function _week_mode()          { return String(_ls_get("hse_costs_week_mode") || "classic") === "custom" ? "custom" : "classic"; }
  function _set_week_mode(v)     { _ls_set("hse_costs_week_mode", v === "custom" ? "custom" : "classic"); }
  function _custom_week_start()  { const r = Number.parseInt(String(_ls_get("hse_costs_custom_week_start") || "1"), 10); return Number.isFinite(r) && r >= 0 && r <= 6 ? r : 1; }
  function _set_custom_week_start(v) { _ls_set("hse_costs_custom_week_start", String(v)); }

  function _get_custom_period() {
    const now = new Date();
    return {
      start: _ls_get("hse_costs_custom_period_start") || _datetime_local_value(_start_of_day(now)),
      end:   _ls_get("hse_costs_custom_period_end")   || _datetime_local_value(now),
    };
  }
  function _get_custom_compare_ranges() {
    const now = new Date();
    const dre = now; const drs = _shift_days(now, -7);
    const dce = drs; const dcs = _shift_days(dce, -7);
    return {
      refStart: _ls_get("hse_costs_custom_ref_start")  || _datetime_local_value(drs),
      refEnd:   _ls_get("hse_costs_custom_ref_end")    || _datetime_local_value(dre),
      cmpStart: _ls_get("hse_costs_custom_cmp_start")  || _datetime_local_value(dcs),
      cmpEnd:   _ls_get("hse_costs_custom_cmp_end")    || _datetime_local_value(dce),
    };
  }

  // ─── Date utilities ───────────────────────────────────────────────────────────
  function _start_of_day(d)   { const r = new Date(d); r.setHours(0,0,0,0); return r; }
  function _end_of_day(d)     { const r = new Date(d); r.setHours(23,59,59,999); return r; }
  function _shift_days(d,n)   { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
  function _start_of_month(d) { const r = new Date(d); r.setDate(1); r.setHours(0,0,0,0); return r; }
  function _start_of_week(d, sd) {
    const r = _start_of_day(d);
    const diff = (r.getDay() - sd + 7) % 7;
    return _shift_days(r, -diff);
  }
  function _datetime_local_value(d) {
    const r = new Date(d); const p = (n) => String(n).padStart(2,"0");
    return `${r.getFullYear()}-${p(r.getMonth()+1)}-${p(r.getDate())}T${p(r.getHours())}:${p(r.getMinutes())}`;
  }
  function _datetime_from_local(v) {
    if (!v) return null; const d = new Date(v); return Number.isFinite(d.getTime()) ? d : null;
  }
  function _fmt_range(s, e) {
    const opts = { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" };
    const fmt = (d) => new Intl.DateTimeFormat("fr-FR", opts).format(d);
    return s && e ? `${fmt(s)} → ${fmt(e)}` : "—";
  }

  // Resolve [start, end] for period preset
  function _period_range(preset, now) {
    if (preset === "today")      return [_start_of_day(now), new Date(now)];
    if (preset === "yesterday")  { const s = _start_of_day(_shift_days(now,-1)); return [s, _end_of_day(_shift_days(now,-1))]; }
    if (preset === "7days")      return [_start_of_day(_shift_days(now,-6)), new Date(now)];
    if (preset === "30days")     return [_start_of_day(_shift_days(now,-29)), new Date(now)];
    if (preset === "this_month") return [_start_of_month(now), new Date(now)];
    if (preset === "last_month") {
      const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
      return [lm, _end_of_day(_shift_days(_start_of_month(now), -1))];
    }
    if (preset === "custom") {
      const c = _get_custom_period();
      return [_datetime_from_local(c.start), _datetime_from_local(c.end)];
    }
    return [_start_of_day(now), new Date(now)];
  }

  // Resolve [ref, cmp] for compare preset
  function _compare_ranges(preset, weekMode, customWeekStart, now) {
    const sd = weekMode === "custom" ? customWeekStart : 1;
    if (preset === "this_week_vs_last_week") {
      const rs = _start_of_week(now, sd); const re = new Date(now);
      const cs = _shift_days(rs, -7); const ce = new Date(cs.getTime() + (re - rs));
      return { ref:[rs,re], cmp:[cs,ce] };
    }
    if (preset === "this_weekend_vs_last_weekend") {
      const jsDay = now.getDay(); const satOff = (jsDay - 6 + 7) % 7;
      const rs = _start_of_day(_shift_days(now, -satOff));
      if (jsDay === 6 || jsDay === 0) {
        const re = new Date(now); const cs = _shift_days(rs,-7); const ce = new Date(cs.getTime() + (re - rs));
        return { ref:[rs,re], cmp:[cs,ce] };
      }
      const re = _end_of_day(_shift_days(rs,1)); const cs = _shift_days(rs,-7); const ce = _end_of_day(_shift_days(cs,1));
      return { ref:[rs,re], cmp:[cs,ce] };
    }
    if (preset === "custom") {
      const c = _get_custom_compare_ranges();
      return { ref:[_datetime_from_local(c.refStart), _datetime_from_local(c.refEnd)], cmp:[_datetime_from_local(c.cmpStart), _datetime_from_local(c.cmpEnd)] };
    }
    // today_vs_yesterday
    const rs = _start_of_day(now); const re = new Date(now);
    const cs = _shift_days(rs,-1); const ce = new Date(cs.getTime() + (re - rs));
    return { ref:[rs,re], cmp:[cs,ce] };
  }

  // ─── UI atoms ─────────────────────────────────────────────────────────────────
  function _pill_title(text) { return el("div", "hse_pill_title", text); }
  function _mk_kv(label, value) {
    const row = el("div", "hse_toolbar");
    row.appendChild(el("div", "hse_subtitle", label));
    row.appendChild(el("div", "hse_kpi_value", value == null || value === "" ? "—" : String(value)));
    return row;
  }
  function _mk_toggle_button(label, active, onClick) {
    const btn = el("button", "hse_button", label);
    btn.disabled = !!active;
    btn.addEventListener("click", onClick);
    return btn;
  }
  function _row_cost(row, mode)  { return mode === "ht" ? row?.cost_ht  : row?.cost_ttc; }
  function _row_total(row, mode) { return mode === "ht" ? row?.total_ht : row?.total_ttc; }

  /**
   * Delta badge — couleur selon amplitude.
   * < 5% → neutre (gris), < 15% → orange doux, >= 15% → rouge/vert selon direction.
   * On évite l'alarme : même une hausse forte reste sobre.
   */
  function _mk_delta_badge(pct) {
    const v = _num(pct);
    if (v == null) return null;
    const abs = Math.abs(v);
    let bg, fg, icon;
    if (abs < 5) {
      bg = "rgba(128,128,128,0.12)"; fg = "var(--secondary-text-color,#888)"; icon = "≈";
    } else if (abs < 15) {
      bg = "rgba(230,126,34,0.15)"; fg = "#e67e22"; icon = v > 0 ? "▲" : "▼";
    } else {
      const up = v > 0;
      bg = up ? "rgba(231,76,60,0.15)" : "rgba(39,174,96,0.15)";
      fg = up ? "#e74c3c" : "#27ae60";
      icon = up ? "▲" : "▼";
    }
    const badge = el("span", null);
    badge.style.cssText = `display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:20px;background:${bg};color:${fg};font-weight:600;font-size:0.82em;`;
    badge.textContent = `${icon} ${_fmt_pct(v)}`;
    return badge;
  }

  // ─── Inline sensor row (used in both tabs) ────────────────────────────────────
  // curKwh, curCost: current period
  // prevKwh, prevCost: previous period (compare tab) or null (period tab)
  // maxCost: used for relative bar width
  function _mk_sensor_row(name, entityId, curKwh, curCost, prevKwh, prevCost, maxCost, mode) {
    const row = el("div", null);
    row.style.cssText = "display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:8px;padding:7px 4px;border-bottom:1px solid rgba(128,128,128,0.1);";

    // left: name + mini bar
    const left = el("div", null);
    const nameEl = el("div", null);
    nameEl.style.cssText = "font-size:0.9em;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    nameEl.textContent = name || entityId || "—";
    left.appendChild(nameEl);

    const curCostV = _num(curCost);
    const maxCostV = _num(maxCost);
    if (curCostV != null && maxCostV && maxCostV > 0) {
      const pct = Math.min(100, (curCostV / maxCostV) * 100);
      const barTrack = el("div", null);
      barTrack.style.cssText = "height:3px;background:rgba(128,128,128,0.15);border-radius:2px;margin-top:3px;";
      const barFill = el("div", null);
      barFill.style.cssText = `height:100%;width:${pct}%;background:var(--primary-color,#4caf50);border-radius:2px;`;
      barTrack.appendChild(barFill);
      left.appendChild(barTrack);
    }
    row.appendChild(left);

    // center: cost value
    const costEl = el("div", null);
    costEl.style.cssText = "font-size:0.9em;text-align:right;white-space:nowrap;";
    costEl.textContent = _fmt_eur(curCost);
    row.appendChild(costEl);

    // right: delta badge (compare tab) or empty
    const badgeWrap = el("div", null);
    badgeWrap.style.cssText = "min-width:72px;text-align:right;";
    if (prevCost != null) {
      const prevV = _num(prevCost);
      const curV  = _num(curCost);
      if (prevV != null && curV != null && prevV !== 0) {
        const pct = ((curV - prevV) / Math.abs(prevV)) * 100;
        const b = _mk_delta_badge(pct);
        if (b) badgeWrap.appendChild(b);
      } else if (prevV === 0 && curV != null && curV > 0) {
        const b = _mk_delta_badge(100);
        if (b) badgeWrap.appendChild(b);
      } else {
        badgeWrap.appendChild(el("span", null, "≈"));
        badgeWrap.lastChild.style.cssText = "color:var(--secondary-text-color,#888);font-size:0.82em;";
      }
    }
    row.appendChild(badgeWrap);
    return row;
  }

  // ─── Coverage indicator (référence vs interne) ────────────────────────────────
  // Shows the gap between the meter (reference) and internal sensors.
  // Subtle visual signal when the gap varies between two periods.
  function _mk_coverage_block(refKwh1, intKwh1, refKwh2, intKwh2) {
    const r1 = _num(refKwh1); const i1 = _num(intKwh1);
    const r2 = _num(refKwh2); const i2 = _num(intKwh2);
    if (r1 == null && r2 == null) return null; // no reference sensor at all

    const wrap = el("div", null);
    wrap.style.cssText = "margin-top:8px;";

    // helper: compute coverage pct
    const cov = (ref, int_) => (ref && ref > 0 && int_ != null) ? Math.min(100, (int_ / ref) * 100) : null;
    const cov1 = cov(r1, i1);
    const cov2 = cov(r2, i2);

    // detect drift between periods
    const drift = (cov1 != null && cov2 != null) ? Math.abs(cov1 - cov2) : null;
    // drift > 10 pts → show subtle orange tint (not an alarm, just a signal)
    const hasDrift = drift != null && drift > 10;

    const block = el("div", null);
    const borderColor = hasDrift ? "#e67e22" : "rgba(128,128,128,0.3)";
    const bgColor     = hasDrift ? "rgba(230,126,34,0.08)" : "rgba(128,128,128,0.05)";
    block.style.cssText = `padding:8px 14px;border-left:3px solid ${borderColor};background:${bgColor};border-radius:0 8px 8px 0;font-size:0.85em;`;

    const title = el("div", null);
    title.style.cssText = "font-weight:600;margin-bottom:4px;color:var(--secondary-text-color,#888);";
    title.textContent = "ℹ️ Couverture capteurs";
    block.appendChild(title);

    const mkLine = (label, cov_, refV, intV) => {
      if (cov_ == null) return;
      const line = el("div", null);
      line.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:2px;";
      const labelEl = el("span", null, label + " : ");
      labelEl.style.cssText = "opacity:0.7;min-width:90px;";
      line.appendChild(labelEl);

      const barTrack = el("div", null);
      barTrack.style.cssText = "flex:1;height:4px;background:rgba(128,128,128,0.2);border-radius:2px;overflow:hidden;";
      const barFill = el("div", null);
      const fillColor = cov_ > 90 ? "#27ae60" : cov_ > 65 ? "#e67e22" : "rgba(128,128,128,0.5)";
      barFill.style.cssText = `height:100%;width:${cov_}%;background:${fillColor};border-radius:2px;`;
      barTrack.appendChild(barFill);
      line.appendChild(barTrack);

      const pctEl = el("span", null, `${cov_.toFixed(0)} %`);
      pctEl.style.cssText = "font-weight:600;min-width:36px;text-align:right;";
      line.appendChild(pctEl);

      const detail = el("span", null, `(${_fmt_kwh(intV)} / ${_fmt_kwh(refV)})`);
      detail.style.cssText = "opacity:0.55;font-size:0.9em;";
      line.appendChild(detail);
      block.appendChild(line);
    };

    if (cov1 != null) mkLine(r2 != null ? "Période 1" : "Couverture", cov1, r1, i1);
    if (cov2 != null) mkLine("Période 2", cov2, r2, i2);

    if (hasDrift) {
      const note = el("div", null);
      note.style.cssText = "margin-top:6px;font-size:0.82em;color:#e67e22;";
      note.textContent = `⚡ L'écart entre capteurs varie de ${drift.toFixed(0)} point(s) — un appareil non mesuré a peut-être changé de comportement.`;
      block.appendChild(note);
    } else if (cov1 != null) {
      const note = el("div", null);
      note.style.cssText = "margin-top:6px;font-size:0.82em;opacity:0.6;";
      note.textContent = cov1 < 65
        ? "Plusieurs appareils ne sont pas encore mesurés — c'est normal."
        : "Couverture stable entre les deux périodes.";
      block.appendChild(note);
    }

    wrap.appendChild(block);
    return wrap;
  }

  // ─── Render: page header ──────────────────────────────────────────────────────
  function _render_header(container, mode, onModeChange, subtab, onSubtabChange) {
    const card = el("div", "hse_card");
    card.appendChild(el("div", "hse_kpi_title", "📊 Analyse de coûts"));
    const top = el("div", "hse_card_header");
    const left = el("div", "hse_card_actions");
    left.appendChild(_mk_toggle_button("Période",     subtab === "period",  () => onSubtabChange("period")));
    left.appendChild(_mk_toggle_button("Comparaison", subtab === "compare", () => onSubtabChange("compare")));
    top.appendChild(left);
    const right = el("div", "hse_card_actions");
    right.appendChild(_mk_toggle_button("Vue HT",  mode === "ht",  () => onModeChange("ht")));
    right.appendChild(_mk_toggle_button("Vue TTC", mode === "ttc", () => onModeChange("ttc")));
    top.appendChild(right);
    card.appendChild(top);
    container.appendChild(card);
  }

  // ─── Render: period tab ───────────────────────────────────────────────────────
  // Shows consumption for a single chosen period.
  // Reference (meter) is implicit — shown if it exists, never requires user input.
  async function _render_period(container, dash, mode, rerender, hass) {
    const preset = _period_preset();
    const now    = new Date();
    const [rangeStart, rangeEnd] = _period_range(preset, now);

    // ── Period selector ───────────────────────────────────────────────────────
    const ctrl = el("div", "hse_card");
    const presetRow = el("div", "hse_card_actions");
    presetRow.style.cssText = "flex-wrap:wrap;";
    const presets = [
      ["today",       "Aujourd'hui"],
      ["yesterday",   "Hier"],
      ["7days",       "7 derniers jours"],
      ["30days",      "30 derniers jours"],
      ["this_month",  "Ce mois"],
      ["last_month",  "Mois précédent"],
      ["custom",      "Personnalisé"],
    ];
    for (const [val, label] of presets) {
      presetRow.appendChild(_mk_toggle_button(label, preset === val, () => { _set_period_preset(val); rerender(); }));
    }
    ctrl.appendChild(presetRow);

    // Custom period inputs
    if (preset === "custom") {
      const cust = _get_custom_period();
      const pCard = el("div", "hse_card hse_card_compact");
      pCard.style.cssText = "margin-top:8px;";
      const mkDateInput = (label, key, value) => {
        const row = el("div", "hse_toolbar");
        row.appendChild(el("div", "hse_subtitle", label));
        const input = document.createElement("input");
        input.type = "datetime-local"; input.className = "hse_input"; input.value = value || "";
        input.addEventListener("change", () => { _ls_set(key, input.value || ""); });
        row.appendChild(input);
        pCard.appendChild(row);
      };
      mkDateInput("Début", "hse_costs_custom_period_start", cust.start);
      mkDateInput("Fin",   "hse_costs_custom_period_end",   cust.end);
      const applyBtn = el("button", "hse_button hse_button_primary", "🔍 Afficher cette période");
      applyBtn.style.cssText = "margin-top:8px;";
      applyBtn.addEventListener("click", () => rerender());
      pCard.appendChild(applyBtn);
      ctrl.appendChild(pCard);
    }

    // Period label
    if (rangeStart && rangeEnd) {
      const lbl = el("div", "hse_subtitle");
      lbl.style.cssText = "margin-top:6px;font-size:0.82em;opacity:0.7;";
      lbl.textContent = `📅 ${_fmt_range(rangeStart, rangeEnd)}`;
      ctrl.appendChild(lbl);
    }
    container.appendChild(ctrl);

    // ── Fetch period data ─────────────────────────────────────────────────────
    // We use the compare endpoint with a custom range where ref = cmp = selected period
    // so we get per_sensor breakdown. If no pricing / endpoint fails, fall back to dash data.
    let resp = null;
    try {
      if (hass?.callApi && rangeStart && rangeEnd) {
        const rs = _datetime_local_value(rangeStart);
        const re = _datetime_local_value(rangeEnd);
        resp = await hass.callApi("POST", "home_suivi_elec/unified/costs/compare", {
          preset: "custom_periods",
          tax_mode: mode,
          reference_range: { start: rs, end: re },
          compare_range:   { start: rs, end: re },
        });
      }
    } catch (_) { resp = null; }

    const hasPeriodResp = resp?.ok === true && resp?.supported !== false;

    // ── Reference (meter) block — implicit, no user input ─────────────────────
    const hasRef = !!(dash?.reference?.entity_id);
    if (hasRef) {
      const refCard = el("div", "hse_card");
      const refHead = el("div", "hse_card_header");
      const refTitle = el("div", null);
      refTitle.appendChild(el("strong", null, "🏠 " + (dash.reference.name || dash.reference.entity_id)));
      const refSub = el("div", "hse_subtitle");
      refSub.style.cssText = "font-size:0.78em;opacity:0.65;";
      refSub.textContent = "Compteur — valeur réelle totale du foyer";
      refTitle.appendChild(refSub);
      refHead.appendChild(refTitle);
      refCard.appendChild(refHead);

      // Use period data if available, otherwise fall back to dashboard "day" row
      const refKwh  = hasPeriodResp ? _num(resp?.reference_period?.reference?.kwh) : _num(_find_period_row(dash?.reference_table, "day")?.kwh);
      const refCost = hasPeriodResp ? _num(_row_total(resp?.reference_period?.reference, mode)) : _num(_row_total(_find_period_row(dash?.reference_table, "day"), mode));

      const refVals = el("div", "hse_toolbar");
      const kvEnergy = el("div", null);
      kvEnergy.style.cssText = "display:flex;gap:6px;align-items:baseline;";
      const bigKwh = el("span", null, _fmt_kwh(refKwh));
      bigKwh.style.cssText = "font-size:1.3em;font-weight:700;";
      kvEnergy.appendChild(bigKwh);
      const costSpan = el("span", null, `· ${_fmt_eur(refCost)}`);
      costSpan.style.cssText = "font-size:1.05em;opacity:0.8;";
      kvEnergy.appendChild(costSpan);
      refVals.appendChild(kvEnergy);
      refCard.appendChild(refVals);
      container.appendChild(refCard);
    }

    // ── Internal sensors block ────────────────────────────────────────────────
    const perSensor = hasPeriodResp
      ? (Array.isArray(resp?.per_sensor) ? resp.per_sensor : [])
      : (Array.isArray(dash?.per_sensor_costs) ? dash.per_sensor_costs : []);

    const getSensorCost = (r) => {
      if (hasPeriodResp) return _num(_row_total(r?.reference, mode));
      const costMap = mode === "ht" ? r.cost_ht : r.cost_ttc;
      return costMap && typeof costMap === "object" ? _num(costMap.day) : _num(costMap);
    };

    const getSensorKwh = (r) => {
      if (hasPeriodResp) return _num(r?.reference?.kwh);
      return _num(r?.kwh?.day ?? r?.kwh);
    };

    const sorted = perSensor.slice().sort((a,b) => (getSensorCost(b) || -1e9) - (getSensorCost(a) || -1e9));
    const maxCost = getSensorCost(sorted[0]);

    const totalIntKwh  = sorted.reduce((s,r) => s + (getSensorKwh(r)  || 0), 0);
    const totalIntCost = sorted.reduce((s,r) => s + (getSensorCost(r) || 0), 0);

    if (sorted.length) {
      const intCard = el("div", "hse_card");
      const intHead = el("div", "hse_card_header");
      intHead.appendChild(el("div", "hse_kpi_title", "🔌 Capteurs internes"));
      const intTotBadge = el("span", null, `${_fmt_kwh(totalIntKwh)}  ${_fmt_eur(totalIntCost)}`);
      intTotBadge.style.cssText = "font-size:0.9em;opacity:0.75;";
      intHead.appendChild(intTotBadge);
      intCard.appendChild(intHead);

      const list = el("div", null);
      for (const r of sorted) {
        list.appendChild(_mk_sensor_row(
          r.name, r.entity_id,
          getSensorKwh(r), getSensorCost(r),
          null, null,
          maxCost, mode
        ));
      }
      // Total row
      const totalRow = el("div", null);
      totalRow.style.cssText = "display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:7px 4px;font-weight:600;font-size:0.9em;";
      totalRow.appendChild(el("div", null, "Total mesuré"));
      totalRow.appendChild(el("div", null, _fmt_eur(totalIntCost)));
      totalRow.appendChild(el("div", null, ""));
      list.appendChild(totalRow);
      intCard.appendChild(list);

      // Coverage block (single period)
      const refKwh1 = hasRef
        ? (hasPeriodResp ? _num(resp?.reference_period?.reference?.kwh) : _num(_find_period_row(dash?.reference_table,"day")?.kwh))
        : null;
      const covBlock = _mk_coverage_block(refKwh1, totalIntKwh, null, null);
      if (covBlock) intCard.appendChild(covBlock);

      container.appendChild(intCard);
    } else if (!hasRef) {
      const empty = el("div", "hse_card");
      empty.appendChild(el("div", "hse_subtitle", "Aucune donnée disponible pour cette période."));
      container.appendChild(empty);
    }
  }

  // ─── Render: compare tab ──────────────────────────────────────────────────────
  async function _render_compare(container, dash, mode, rerender, hass) {
    const preset          = _compare_preset();
    const weekMode        = _week_mode();
    const customWeekStart = _custom_week_start();
    const now             = new Date();
    const { ref, cmp }    = _compare_ranges(preset, weekMode, customWeekStart, now);

    // ── Controls ──────────────────────────────────────────────────────────────
    const ctrl = el("div", "hse_card");
    const presetRow = el("div", "hse_card_actions");
    presetRow.style.cssText = "flex-wrap:wrap;";
    const presetsMap = [
      ["today_vs_yesterday",          "Auj. vs Hier"],
      ["this_week_vs_last_week",       "Cette semaine vs Dernière"],
      ["this_weekend_vs_last_weekend", "Ce weekend vs Dernier"],
      ["custom",                       "Personnalisé"],
    ];
    for (const [val, label] of presetsMap) {
      presetRow.appendChild(_mk_toggle_button(label, preset === val, () => { _set_compare_preset(val); rerender(); }));
    }
    ctrl.appendChild(presetRow);

    // Week mode
    if (preset === "this_week_vs_last_week") {
      const wr = el("div", "hse_card_actions");
      wr.appendChild(_mk_toggle_button("Lundi–Dimanche", weekMode === "classic", () => { _set_week_mode("classic"); rerender(); }));
      wr.appendChild(_mk_toggle_button("Début custom",   weekMode === "custom",  () => { _set_week_mode("custom");  rerender(); }));
      ctrl.appendChild(wr);
      if (weekMode === "custom") {
        const wrap = el("div", "hse_toolbar");
        wrap.appendChild(el("div", "hse_subtitle", "Début de semaine"));
        const select = document.createElement("select"); select.className = "hse_input";
        ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"].forEach((n,i) => {
          const o = document.createElement("option"); o.value = String(i); o.textContent = n; o.selected = i === customWeekStart; select.appendChild(o);
        });
        select.addEventListener("change", () => { _set_custom_week_start(Number.parseInt(select.value,10)); Promise.resolve().then(() => rerender()); });
        wrap.appendChild(select); ctrl.appendChild(wrap);
      }
    }

    // Custom date inputs
    if (preset === "custom") {
      const c = _get_custom_compare_ranges();
      const pCard = el("div", "hse_card hse_card_compact"); pCard.style.cssText = "margin-top:8px;";
      const mkInput = (label, key, value) => {
        const row = el("div", "hse_toolbar"); row.appendChild(el("div", "hse_subtitle", label));
        const input = document.createElement("input"); input.type = "datetime-local"; input.className = "hse_input"; input.value = value || "";
        input.addEventListener("change", () => { _ls_set(key, input.value || ""); });
        row.appendChild(input); pCard.appendChild(row);
      };
      mkInput("Période 1 — début", "hse_costs_custom_ref_start", c.refStart);
      mkInput("Période 1 — fin",   "hse_costs_custom_ref_end",   c.refEnd);
      mkInput("Période 2 — début", "hse_costs_custom_cmp_start", c.cmpStart);
      mkInput("Période 2 — fin",   "hse_costs_custom_cmp_end",   c.cmpEnd);
      const applyBtn = el("button", "hse_button hse_button_primary", "🔍 Comparer");
      applyBtn.style.cssText = "margin-top:8px;";
      applyBtn.addEventListener("click", () => rerender());
      pCard.appendChild(applyBtn); ctrl.appendChild(pCard);
    }

    // Period labels
    const lbl1 = el("div", "hse_subtitle"); lbl1.style.cssText = "margin-top:6px;font-size:0.82em;opacity:0.7;";
    lbl1.textContent = `Période 1 : ${_fmt_range(ref[0], ref[1])}`;
    ctrl.appendChild(lbl1);
    const lbl2 = el("div", "hse_subtitle"); lbl2.style.cssText = "font-size:0.82em;opacity:0.7;";
    lbl2.textContent = `Période 2 : ${_fmt_range(cmp[0], cmp[1])}`;
    ctrl.appendChild(lbl2);
    container.appendChild(ctrl);

    // ── Fetch ─────────────────────────────────────────────────────────────────
    const loadingCard = el("div", "hse_card hse_card_compact");
    loadingCard.appendChild(el("div", "hse_subtitle", "Calcul en cours…"));
    container.appendChild(loadingCard);

    let resp = null;
    try {
      resp = await hass.callApi("POST", "home_suivi_elec/unified/costs/compare", {
        preset: preset === "custom" ? "custom_periods" : preset,
        tax_mode: mode,
        week_mode: weekMode,
        custom_week_start: customWeekStart,
        ...(preset === "custom" ? (() => {
          const c = _get_custom_compare_ranges();
          return { reference_range: { start: c.refStart, end: c.refEnd }, compare_range: { start: c.cmpStart, end: c.cmpEnd } };
        })() : {}),
      });
    } catch (err) {
      clear(loadingCard);
      loadingCard.appendChild(el("div", "hse_kpi_title", "Erreur"));
      loadingCard.appendChild(el("div", "hse_subtitle", String(err?.message || err || "compare_failed")));
      return;
    }

    clear(loadingCard);

    if (!resp || resp.ok !== true || resp.supported === false) {
      loadingCard.appendChild(el("div", "hse_kpi_title", "Comparaison indisponible"));
      loadingCard.appendChild(el("div", "hse_subtitle", "Le backend n'a pas pu résoudre cette comparaison."));
      const warns = Array.isArray(resp?.warnings) ? resp.warnings : [];
      if (warns.length) loadingCard.appendChild(el("pre", "hse_code", warns.join("\n")));
      return;
    }

    const refPeriod = resp.reference_period || {};
    const cmpPeriod = resp.compare_period   || {};
    const summary   = resp.summary          || {};
    const pctKey    = mode === "ht" ? "pct_total_ht" : "pct_total_ttc";
    const totKey    = mode === "ht" ? "total_ht" : "total_ttc";

    // ── Reference (meter) block ───────────────────────────────────────────────
    const hasRef = !!(dash?.reference?.entity_id);
    if (hasRef) {
      const refCard = el("div", "hse_card");
      const refHead = el("div", "hse_card_header");
      const refTitle = el("div", null);
      refTitle.appendChild(el("strong", null, "🏠 " + (dash.reference.name || dash.reference.entity_id)));
      const refSub = el("div", "hse_subtitle"); refSub.style.cssText = "font-size:0.78em;opacity:0.65;";
      refSub.textContent = "Compteur — valeur réelle totale du foyer";
      refTitle.appendChild(refSub);
      refHead.appendChild(refTitle);

      const refPct = _num(summary?.reference?.[pctKey]);
      const refBadge = _mk_delta_badge(refPct);
      if (refBadge) refHead.appendChild(refBadge);
      refCard.appendChild(refHead);

      // Two-column: period1 vs period2
      const refGrid = el("div", "hse_grid_2col");
      const mkRefBox = (label, data_) => {
        const box = el("div", null);
        box.style.cssText = "padding:6px 0;";
        box.appendChild(el("div", "hse_subtitle", label));
        const row = el("div", null); row.style.cssText = "display:flex;gap:8px;align-items:baseline;margin-top:2px;";
        const kwh = el("span", null, _fmt_kwh(data_?.kwh)); kwh.style.cssText = "font-weight:600;";
        const eur = el("span", null, `· ${_fmt_eur(_row_total(data_, mode))}`); eur.style.cssText = "opacity:0.75;";
        row.appendChild(kwh); row.appendChild(eur); box.appendChild(row);
        return box;
      };
      refGrid.appendChild(mkRefBox("Période 1", refPeriod.reference));
      refGrid.appendChild(mkRefBox("Période 2", cmpPeriod.reference));
      refCard.appendChild(refGrid);

      // Delta line
      const dKwh  = _num(summary?.reference?.delta_kwh);
      const dCost = _num(summary?.reference?.[mode === "ht" ? "delta_total_ht" : "delta_total_ttc"]);
      if (dKwh != null || dCost != null) {
        const dLine = el("div", null); dLine.style.cssText = "font-size:0.88em;margin-top:4px;opacity:0.8;";
        const parts = [];
        if (dKwh  != null) parts.push(_fmt_delta_kwh(dKwh));
        if (dCost != null) parts.push(_fmt_delta_eur(dCost));
        dLine.textContent = `Écart : ${parts.join("  ")} entre les deux périodes`;
        refCard.appendChild(dLine);
      }

      container.appendChild(refCard);
    }

    // ── Internal sensors block ────────────────────────────────────────────────
    const perSensor = Array.isArray(resp.per_sensor) ? resp.per_sensor : [];
    const getSensorVal = (r, periodKey) => _num(_row_total(r?.[periodKey], mode));
    const getSensorKwhP = (r, periodKey) => _num(r?.[periodKey]?.kwh);

    const sorted = perSensor.slice().sort((a,b) => (getSensorVal(b,"reference") || -1e9) - (getSensorVal(a,"reference") || -1e9));
    const maxCostP1 = getSensorVal(sorted[0], "reference");

    const totalInt1Kwh  = sorted.reduce((s,r) => s + (getSensorKwhP(r,"reference") || 0), 0);
    const totalInt1Cost = sorted.reduce((s,r) => s + (getSensorVal(r,"reference")  || 0), 0);
    const totalInt2Kwh  = sorted.reduce((s,r) => s + (getSensorKwhP(r,"compare")   || 0), 0);
    const totalInt2Cost = sorted.reduce((s,r) => s + (getSensorVal(r,"compare")    || 0), 0);

    if (sorted.length) {
      const intCard = el("div", "hse_card");
      const intHead = el("div", "hse_card_header");
      intHead.appendChild(el("div", "hse_kpi_title", "🔌 Capteurs internes"));
      const intPct = _num(summary?.internal?.[pctKey]);
      const intBadge = _mk_delta_badge(intPct);
      if (intBadge) intHead.appendChild(intBadge);
      intCard.appendChild(intHead);

      // Column headers
      const colHead = el("div", null);
      colHead.style.cssText = "display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:4px 4px;font-size:0.78em;opacity:0.6;";
      colHead.appendChild(el("div", null, "Capteur"));
      colHead.appendChild(el("div", null, "Période 1"));
      colHead.appendChild(el("div", null, "Écart"));
      intCard.appendChild(colHead);

      const list = el("div", null);
      for (const r of sorted) {
        list.appendChild(_mk_sensor_row(
          r.name, r.entity_id,
          getSensorKwhP(r,"reference"), getSensorVal(r,"reference"),
          getSensorKwhP(r,"compare"),   getSensorVal(r,"compare"),
          maxCostP1, mode
        ));
      }

      // Totals row
      const totalRow = el("div", null);
      totalRow.style.cssText = "display:grid;grid-template-columns:1fr auto auto;gap:8px;padding:8px 4px 2px;font-weight:600;font-size:0.88em;border-top:1px solid rgba(128,128,128,0.2);";
      totalRow.appendChild(el("div", null, "Total mesuré"));
      totalRow.appendChild(el("div", null, _fmt_eur(totalInt1Cost)));
      // delta on totals
      const totDeltaWrap = el("div", null); totDeltaWrap.style.cssText = "text-align:right;";
      if (totalInt2Cost > 0) {
        const tp = ((totalInt1Cost - totalInt2Cost) / Math.abs(totalInt2Cost)) * 100;
        const b = _mk_delta_badge(tp);
        if (b) totDeltaWrap.appendChild(b);
      }
      totalRow.appendChild(totDeltaWrap);
      list.appendChild(totalRow);
      intCard.appendChild(list);

      // Coverage block comparing both periods
      const refKwh1 = hasRef ? _num(refPeriod?.reference?.kwh) : null;
      const refKwh2 = hasRef ? _num(cmpPeriod?.reference?.kwh) : null;
      const covBlock = _mk_coverage_block(refKwh1, totalInt1Kwh, refKwh2, totalInt2Kwh);
      if (covBlock) intCard.appendChild(covBlock);

      container.appendChild(intCard);
    }

    // Warnings
    const warns = Array.isArray(resp?.warnings) ? resp.warnings : [];
    if (warns.length) {
      const note = el("div", "hse_card hse_card_compact");
      note.appendChild(el("div", "hse_kpi_title", "Notes techniques"));
      note.appendChild(el("pre", "hse_code", warns.join("\n")));
      container.appendChild(note);
    }
  }

  // ─── Helper (shared) ─────────────────────────────────────────────────────────
  function _find_period_row(rows, period) {
    const arr = Array.isArray(rows) ? rows : [];
    return arr.find((r) => r?.period === period) || null;
  }

  // ─── Main entry point ─────────────────────────────────────────────────────────
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
      container, mode,
      (m) => { _set_display_mode(m); rerender(); },
      subtab,
      (s) => { _set_subtab(s); rerender(); }
    );

    if (subtab === "compare") {
      _render_compare(container, dash, mode, rerender, hass);
    } else {
      _render_period(container, dash, mode, rerender, hass);
    }
  }

  window.hse_costs_view = { render_costs };
})();
