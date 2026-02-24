(function () {
  function _fmt_dt(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch (_) {
      return ts;
    }
  }

  function _local_iso_days_from_now(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);

    const pad = (n) => String(n).padStart(2, "0");

    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const ss = pad(d.getSeconds());

    const tzMin = -d.getTimezoneOffset();
    const sign = tzMin >= 0 ? "+" : "-";
    const tzAbs = Math.abs(tzMin);
    const tzh = pad(Math.floor(tzAbs / 60));
    const tzm = pad(tzAbs % 60);

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${tzh}:${tzm}`;
  }

  function _esc_label(esc) {
    if (esc === "warning_15m") return "Warning (>=15 min ou not_provided)";
    if (esc === "error_24h") return "Erreur (>=24h)";
    if (esc === "action_48h") return "Action requise (>=48h)";
    return String(esc || "none");
  }

  function _esc_rank(esc) {
    if (esc === "action_48h") return 3;
    if (esc === "error_24h") return 2;
    if (esc === "warning_15m") return 1;
    return 0;
  }

  function _matches_q(item, q) {
    if (!q) return true;
    q = String(q).trim().toLowerCase();
    if (!q) return true;

    const src = item.source || {};
    const parts = [
      src.entity_id,
      src.integration_domain,
      src.platform,
      src.status,
      src.status_reason,
      src.last_seen_state,
      item.item_id,
    ]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase());

    return parts.some((p) => p.includes(q));
  }

  function _filtered_escalated_items(catalogue, filter_q) {
    const items = Object.entries((catalogue && catalogue.items) || {}).map(([id, v]) => ({ id, v }));

    const escalated = items
      .filter((x) => x.v.health && x.v.health.escalation && x.v.health.escalation !== "none")
      .filter((x) => {
        if (x.v && typeof x.v === "object") x.v.item_id = x.id;
        return _matches_q(x.v, filter_q);
      });

    escalated.sort((a, b) => {
      const ea = _esc_rank(a.v.health.escalation);
      const eb = _esc_rank(b.v.health.escalation);
      if (ea !== eb) return eb - ea;
      const ta = String(a.v.health.first_unavailable_at || "");
      const tb = String(b.v.health.first_unavailable_at || "");
      return ta.localeCompare(tb);
    });

    return escalated;
  }

  function render_diagnostic(container, catalogue, state, on_action) {
    const { el, clear } = window.hse_dom;
    clear(container);

    const header = el("div", "hse_card");
    header.appendChild(el("div", null, "Diagnostic"));
    header.appendChild(el("div", "hse_subtitle", "Warnings >=15min (ou not_provided) / Erreurs 24h / Action requise 48h."));

    const toolbar = el("div", "hse_toolbar");

    const btn_refresh = el("button", "hse_button hse_button_primary", "Refresh catalogue");
    btn_refresh.addEventListener("click", () => on_action("refresh"));
    toolbar.appendChild(btn_refresh);

    const q = el("input", "hse_input");
    q.type = "text";
    q.placeholder = "Filtrer (entity_id, integration, status, reason, state)…";
    q.value = state.filter_q || "";
    q.addEventListener("input", (ev) => on_action("filter", ev.target.value));
    toolbar.appendChild(q);

    const btn_adv = el("button", "hse_button", state.advanced ? "Advanced: ON" : "Advanced: OFF");
    btn_adv.addEventListener("click", () => on_action("toggle_advanced"));
    toolbar.appendChild(btn_adv);

    const btn_sel_all = el("button", "hse_button", "Select all (filtré)");
    btn_sel_all.addEventListener("click", () => on_action("select_all_filtered"));
    toolbar.appendChild(btn_sel_all);

    const btn_sel_none = el("button", "hse_button", "Select none");
    btn_sel_none.addEventListener("click", () => on_action("select_none"));
    toolbar.appendChild(btn_sel_none);

    const btn_mute7 = el("button", "hse_button", "Mute 7j (sélection)");
    btn_mute7.addEventListener("click", () => on_action("bulk_mute", { days: 7, mode: "selection" }));
    toolbar.appendChild(btn_mute7);

    const btn_mute30 = el("button", "hse_button", "Mute 30j (sélection)");
    btn_mute30.addEventListener("click", () => on_action("bulk_mute", { days: 30, mode: "selection" }));
    toolbar.appendChild(btn_mute30);

    const btn_removed = el("button", "hse_button", "Mark removed (sélection)");
    btn_removed.addEventListener("click", () => on_action("bulk_removed", { mode: "selection" }));
    toolbar.appendChild(btn_removed);

    const btn_mute7f = el("button", "hse_button", "Mute 7j (filtré)");
    btn_mute7f.addEventListener("click", () => on_action("bulk_mute", { days: 7, mode: "filtered" }));
    toolbar.appendChild(btn_mute7f);

    const btn_removedf = el("button", "hse_button", "Mark removed (filtré)");
    btn_removedf.addEventListener("click", () => on_action("bulk_removed", { mode: "filtered" }));
    toolbar.appendChild(btn_removedf);

    header.appendChild(toolbar);
    container.appendChild(header);

    const escalated = _filtered_escalated_items(catalogue, state.filter_q);

    const selected_count = Object.keys(state.selected || {}).filter((k) => state.selected[k]).length;
    const summary = el("div", "hse_card", `Alertes: ${escalated.length} | sélection: ${selected_count}`);
    container.appendChild(summary);

    if (!escalated.length) {
      container.appendChild(el("div", "hse_card", "Aucune alerte (avec ce filtre)."));
    } else {
      for (const it of escalated) {
        const item = it.v;
        const card = el("div", "hse_card");

        const row = el("div", "hse_toolbar");
        const cb = el("input");
        cb.type = "checkbox";
        cb.checked = !!(state.selected && state.selected[it.id]);
        cb.addEventListener("change", (ev) => on_action("select", { item_id: it.id, checked: ev.target.checked }));
        row.appendChild(cb);

        const title = el("div", null, (item.source && item.source.entity_id) || it.id);
        title.style.flex = "1";
        row.appendChild(title);
        card.appendChild(row);

        const esc = item.health && item.health.escalation;
        card.appendChild(
          el(
            "div",
            "hse_subtitle",
            `${_esc_label(esc)}; since: ${_fmt_dt(item.health.first_unavailable_at)}; status: ${(item.source && item.source.status) || "?"}; state: ${(item.source && item.source.last_seen_state) || "?"}; integration: ${(item.source && item.source.integration_domain) || (item.source && item.source.platform) || "?"}`
          )
        );

        const actions = el("div", "hse_toolbar");

        const b7 = el("button", "hse_button", "Mute 7j");
        b7.addEventListener("click", () => on_action("mute", { item_id: it.id, mute_until: _local_iso_days_from_now(7) }));

        const b30 = el("button", "hse_button", "Mute 30j");
        b30.addEventListener("click", () => on_action("mute", { item_id: it.id, mute_until: _local_iso_days_from_now(30) }));

        const b90 = el("button", "hse_button", "Mute 90j");
        b90.addEventListener("click", () => on_action("mute", { item_id: it.id, mute_until: _local_iso_days_from_now(90) }));

        const brm = el("button", "hse_button", "Mark removed");
        brm.addEventListener("click", () => on_action("removed", { item_id: it.id }));

        actions.appendChild(b7);
        actions.appendChild(b30);
        actions.appendChild(b90);
        actions.appendChild(brm);

        card.appendChild(actions);
        container.appendChild(card);
      }
    }

    if (state.advanced) {
      const adv = el("div", "hse_card");
      adv.appendChild(el("div", null, "Advanced"));
      adv.appendChild(el("div", "hse_subtitle", "Dernière requête API (method/path/body) et réponse brute."));
      const pre = el("pre");
      pre.style.whiteSpace = "pre-wrap";
      pre.style.wordBreak = "break-word";
      const payload = {
        last_action: state.last_action,
        last_request: state.last_request,
        last_response: state.last_response
      };
      pre.textContent = JSON.stringify(payload, null, 2);
      adv.appendChild(pre);
      container.appendChild(adv);

      const adv2 = el("div", "hse_card");
      adv2.appendChild(el("div", null, "Commandes utiles (curl)"));
      const pre2 = el("pre");
      pre2.style.whiteSpace = "pre-wrap";
      pre2.style.wordBreak = "break-word";
      pre2.textContent = [
        "# 1) Voir toutes les alertes (escalation != none)",
        "curl -sS -H \"Authorization: Bearer $TOKEN\" http://127.0.0.1:8123/api/home_suivi_elec/unified/catalogue | jq '.items | to_entries[] | select(.value.health.escalation!="none") | {item_id:.key, entity_id:.value.source.entity_id, esc:.value.health.escalation, status:.value.source.status, integration:.value.source.integration_domain}'",
        "",
        "# 2) Voir les items removed",
        "curl -sS -H \"Authorization: Bearer $TOKEN\" http://127.0.0.1:8123/api/home_suivi_elec/unified/catalogue | jq '.items | to_entries[] | select(.value.triage.policy=="removed") | {item_id:.key, entity_id:.value.source.entity_id, policy:.value.triage.policy}'",
        "",
        "# 3) Voir les items muted (actifs)",
        "curl -sS -H \"Authorization: Bearer $TOKEN\" http://127.0.0.1:8123/api/home_suivi_elec/unified/catalogue | jq '.items | to_entries[] | select(.value.triage.mute_until!=null) | {item_id:.key, entity_id:.value.source.entity_id, mute_until:.value.triage.mute_until}'"
      ].join("\n");
      adv2.appendChild(pre2);
      container.appendChild(adv2);
    }

    window.hse_diag_view._local_iso_days_from_now = _local_iso_days_from_now;
    window.hse_diag_view._filtered_escalated_items = _filtered_escalated_items;
  }

  window.hse_diag_view = { render_diagnostic };
})();
