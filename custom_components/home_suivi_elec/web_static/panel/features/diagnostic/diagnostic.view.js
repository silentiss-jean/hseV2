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
    ]
      .filter(Boolean)
      .map((x) => String(x).toLowerCase());

    return parts.some((p) => p.includes(q));
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

    const btn_mute7 = el("button", "hse_button", "Mute 7j (sélection)");
    btn_mute7.addEventListener("click", () => on_action("bulk_mute", { days: 7 }));
    toolbar.appendChild(btn_mute7);

    const btn_mute30 = el("button", "hse_button", "Mute 30j (sélection)");
    btn_mute30.addEventListener("click", () => on_action("bulk_mute", { days: 30 }));
    toolbar.appendChild(btn_mute30);

    const btn_removed = el("button", "hse_button", "Mark removed (sélection)");
    btn_removed.addEventListener("click", () => on_action("bulk_removed"));
    toolbar.appendChild(btn_removed);

    header.appendChild(toolbar);
    container.appendChild(header);

    const items = Object.entries((catalogue && catalogue.items) || {}).map(([id, v]) => ({ id, v }));

    const escalated = items
      .filter((x) => x.v.health && x.v.health.escalation && x.v.health.escalation !== "none")
      .filter((x) => _matches_q(x.v, state.filter_q));

    escalated.sort((a, b) => {
      const ea = _esc_rank(a.v.health.escalation);
      const eb = _esc_rank(b.v.health.escalation);
      if (ea !== eb) return eb - ea;
      const ta = String(a.v.health.first_unavailable_at || "");
      const tb = String(b.v.health.first_unavailable_at || "");
      return ta.localeCompare(tb);
    });

    if (!escalated.length) {
      container.appendChild(el("div", "hse_card", "Aucune alerte (avec ce filtre)."));
      return;
    }

    const summary = el(
      "div",
      "hse_card",
      `Alertes: ${escalated.length} | sélection: ${Object.keys(state.selected || {}).filter((k) => state.selected[k]).length}`
    );
    container.appendChild(summary);

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
          `${_esc_label(esc)}; since: ${_fmt_dt(item.health.first_unavailable_at)}; status: ${(item.source && item.source.status) || "?"}; state: ${(item.source && item.source.last_seen_state) || "?"}; integration: ${(item.source && item.source.integration_domain) || "?"}`
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

  window.hse_diag_view = { render_diagnostic };
})();
