(function () {
  const { el, clear } = window.hse_dom;

  const THEMES = [
    { key: "ha", label: "Home Assistant (thème HA)" },
    { key: "dark", label: "Dark (sobre)" },
    { key: "light", label: "Light" },
    { key: "ocean", label: "Ocean" },
    { key: "forest", label: "Forest" },
    { key: "sunset", label: "Sunset" },
    { key: "minimal", label: "Minimal" },
    { key: "neon", label: "Neon" },
    { key: "aurora", label: "Aurora (glass)" },
    { key: "neuro", label: "Neuro (soft light)" },
  ];

  function _as_list(v) {
    return Array.isArray(v) ? v : [];
  }

  function _fmt_ts(ts) {
    if (!ts) return null;
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return String(ts);
      return d.toLocaleString();
    } catch (_) {
      return String(ts);
    }
  }

  function _render_sync_tables(card, pending) {
    const rooms = pending?.rooms || {};
    const assignments = pending?.assignments || {};

    const create_rooms = _as_list(rooms.create);
    const rename_rooms = _as_list(rooms.rename);
    const suggest_room = _as_list(assignments.suggest_room);

    const add_table = (title, headers, rows) => {
      card.appendChild(el("div", "hse_subtitle", title));

      if (!rows.length) {
        card.appendChild(el("div", "hse_subtitle", "—"));
        return;
      }

      const wrap = el("div", "hse_scroll_area");
      const table = el("table", "hse_table");
      const thead = el("thead");
      const trh = el("tr");
      for (const h of headers) trh.appendChild(el("th", null, h));
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = el("tbody");
      for (const r of rows) {
        const tr = el("tr");
        for (const c of r) tr.appendChild(el("td", null, c == null ? "" : String(c)));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      card.appendChild(wrap);
    };

    add_table(
      "Créations de pièces",
      ["Nom", "room_id", "ha_area_id"],
      create_rooms.map((x) => [x?.name, x?.room_id, x?.ha_area_id])
    );

    add_table(
      "Renommages de pièces",
      ["room_id", "De", "Vers", "Eligible (auto)"],
      rename_rooms.map((x) => [x?.room_id, x?.from, x?.to, x?.eligible ? "oui" : "non"])
    );

    add_table(
      "Suggestions d’affectation (pièce)",
      ["entity_id", "De", "Vers", "Raison"],
      suggest_room.map((x) => [x?.entity_id, x?.from_room_id || "—", x?.to_room_id, x?.reason || "—"])
    );
  }

  function render_customisation(container, state, org_state, on_action) {
    clear(container);

    // --- Appearance
    const card = el("div", "hse_card");
    card.appendChild(el("div", null, "Apparence & Thème"));
    card.appendChild(el("div", "hse_subtitle", "Le thème s’applique à tous les onglets du panel (stocké dans ce navigateur)."));

    const row = el("div", "hse_toolbar");

    const select = document.createElement("select");
    select.className = "hse_input";
    select.style.display = "inline-block";
    select.style.visibility = "visible";
    select.style.pointerEvents = "auto";
    select.style.minWidth = "220px";

    for (const t of THEMES) {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.label;
      select.appendChild(opt);
    }

    select.value = state?.theme || "ha";
    select.addEventListener("change", (ev) => on_action("set_theme", ev.target.value));

    row.appendChild(select);
    card.appendChild(row);

    const toggles = el("div", "hse_badges");

    const btn_bg = el("button", "hse_button", state?.dynamic_bg ? "Fond: ON" : "Fond: OFF");
    btn_bg.addEventListener("click", () => on_action("toggle_dynamic_bg"));
    toggles.appendChild(btn_bg);

    const btn_glass = el("button", "hse_button", state?.glass ? "Glass: ON" : "Glass: OFF");
    btn_glass.addEventListener("click", () => on_action("toggle_glass"));
    toggles.appendChild(btn_glass);

    card.appendChild(toggles);
    container.appendChild(card);

    // --- Organisation / Sync
    const org = el("div", "hse_card");
    org.appendChild(el("div", null, "Organisation & Sync HA"));
    org.appendChild(
      el(
        "div",
        "hse_subtitle",
        "Prévisualise puis applique des propositions (pièces/affectations) à partir des zones Home Assistant."
      )
    );

    const meta_store = org_state?.meta_store || null;
    const sync = meta_store?.sync || null;
    const pending = sync?.pending_diff || null;
    const stats = pending?.stats || null;
    const has_pending = !!(pending && pending.has_changes);

    if (sync?.last_error) {
      org.appendChild(el("pre", "hse_code", String(sync.last_error)));
    }

    const summary = [];
    if (has_pending) {
      const c_rooms = stats?.create_rooms ?? 0;
      const r_rooms = stats?.rename_rooms ?? 0;
      const s_room = stats?.suggest_room ?? 0;
      summary.push(`Pièces: +${c_rooms}`);
      summary.push(`renommages: ${r_rooms}`);
      summary.push(`suggestions: ${s_room}`);
    } else {
      summary.push("Aucune proposition en attente.");
    }

    if (sync?.pending_generated_at) {
      const ts = _fmt_ts(sync.pending_generated_at);
      if (ts) summary.push(`Généré: ${ts}`);
    }

    org.appendChild(el("div", "hse_subtitle", summary.join(", ")));

    const tb = el("div", "hse_toolbar");

    const btn_refresh = el("button", "hse_button", org_state?.loading ? "Chargement…" : "Rafraîchir" );
    btn_refresh.disabled = !!org_state?.loading;
    btn_refresh.addEventListener("click", () => on_action("org_refresh"));
    tb.appendChild(btn_refresh);

    const btn_preview = el("button", "hse_button hse_button_primary", org_state?.preview_running ? "Prévisualisation…" : "Prévisualiser" );
    btn_preview.disabled = !!org_state?.preview_running || !!org_state?.loading || !!org_state?.apply_running;
    btn_preview.addEventListener("click", () => on_action("org_preview"));
    tb.appendChild(btn_preview);

    const btn_apply_auto = el("button", "hse_button", "Appliquer (auto)");
    btn_apply_auto.disabled = !has_pending || !!org_state?.apply_running || !!org_state?.loading || !!org_state?.preview_running;
    btn_apply_auto.addEventListener("click", () => on_action("org_apply", { apply_mode: "auto" }));
    tb.appendChild(btn_apply_auto);

    const btn_apply_all = el("button", "hse_button", "Appliquer (all)");
    btn_apply_all.disabled = !has_pending || !!org_state?.apply_running || !!org_state?.loading || !!org_state?.preview_running;
    btn_apply_all.addEventListener("click", () => on_action("org_apply", { apply_mode: "all" }));
    tb.appendChild(btn_apply_all);

    const btn_raw = el("button", "hse_button", org_state?.show_raw ? "Mode debug: ON" : "Mode debug: OFF");
    btn_raw.addEventListener("click", () => on_action("org_toggle_raw"));
    tb.appendChild(btn_raw);

    org.appendChild(tb);

    if (org_state?.message) {
      org.appendChild(el("div", "hse_subtitle", String(org_state.message)));
    }

    if (org_state?.error) {
      org.appendChild(el("pre", "hse_code", String(org_state.error)));
    }

    if (has_pending) {
      _render_sync_tables(org, pending);
    }

    if (org_state?.show_raw) {
      const raw = {
        meta_store,
      };
      org.appendChild(el("div", "hse_subtitle", "Données brutes"));
      org.appendChild(el("pre", "hse_code", JSON.stringify(raw, null, 2)));
    }

    container.appendChild(org);
  }

  window.hse_custom_view = { render_customisation };
})();
