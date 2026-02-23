(function () {
  function _fmt_dt(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleString();
    } catch (_) {
      return ts;
    }
  }

  // Return local time ISO with offset, e.g. 2026-02-23T19:35:00+01:00
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

    // getTimezoneOffset: minutes behind UTC (e.g. Paris winter = -60)
    const tzMin = -d.getTimezoneOffset();
    const sign = tzMin >= 0 ? "+" : "-";
    const tzAbs = Math.abs(tzMin);
    const tzh = pad(Math.floor(tzAbs / 60));
    const tzm = pad(tzAbs % 60);

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${tzh}:${tzm}`;
  }

  function render_diagnostic(container, catalogue, on_action) {
    const { el, clear } = window.hse_dom;
    clear(container);

    const header = el("div", "hse_card");
    header.appendChild(el("div", null, "Diagnostic"));
    header.appendChild(el("div", "hse_subtitle", "Erreurs 24h / Action requise 48h (catalogue persistant)."));

    const toolbar = el("div", "hse_toolbar");
    const btn_refresh = el("button", "hse_button hse_button_primary", "Refresh catalogue");
    btn_refresh.addEventListener("click", () => on_action("refresh"));
    toolbar.appendChild(btn_refresh);
    header.appendChild(toolbar);
    container.appendChild(header);

    const items = Object.entries((catalogue && catalogue.items) || {}).map(([id, v]) => ({ id, v }));

    const escalated = items.filter((x) => (x.v.health && x.v.health.escalation && x.v.health.escalation !== "none"));

    if (!escalated.length) {
      container.appendChild(el("div", "hse_card", "Aucune alerte pour le moment."));
      return;
    }

    for (const it of escalated) {
      const item = it.v;
      const card = el("div", "hse_card");
      const title = (item.source && item.source.entity_id) || it.id;
      const esc = item.health && item.health.escalation;

      card.appendChild(el("div", null, `${title}`));
      card.appendChild(el("div", "hse_subtitle", `Escalation: ${esc}, since: ${_fmt_dt(item.health.first_unavailable_at)}`));

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
