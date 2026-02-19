(function () {
  const { el, clear } = window.hse_dom;
  const { render_table } = window.hse_table;

  function _filter_candidates(candidates, q) {
    if (!q) return candidates;
    const needle = q.toLowerCase();
    return candidates.filter((c) => {
      const hay = `${c.entity_id} ${c.name} ${c.integration_domain} ${c.kind} ${c.unit} ${c.state_class}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  function render_scan(container, scan_result, state, on_action) {
    clear(container);

    const card = el("div", "hse_card");
    const toolbar = el("div", "hse_toolbar");

    const btn = el("button", "hse_button hse_button_primary", state.scan_running ? "Scan…" : "Scanner");
    btn.disabled = !!state.scan_running;
    btn.addEventListener("click", () => on_action("scan"));

    const input = document.createElement("input");
    input.className = "hse_input";
    input.placeholder = "Filtrer (entity_id, nom, intégration, kind…)";
    input.value = state.filter_q || "";
    input.addEventListener("input", (ev) => on_action("filter", ev.target.value));

    toolbar.appendChild(btn);
    toolbar.appendChild(input);
    card.appendChild(toolbar);

    // Integrations summary
    const integ_title = el("div", null, `Intégrations (${(scan_result.integrations || []).length})`);
    card.appendChild(integ_title);

    const integ_box = el("div");
    render_table(
      integ_box,
      [
        { label: "integration", get_value: (r) => r.integration_domain },
        { label: "power", get_value: (r) => r.power_count },
        { label: "energy", get_value: (r) => r.energy_count },
        { label: "total", get_value: (r) => r.total },
      ],
      scan_result.integrations || []
    );
    card.appendChild(integ_box);

    // Candidates
    const candidates = scan_result.candidates || [];
    const filtered = _filter_candidates(candidates, state.filter_q);
    const cand_title = el("div", null, `Candidats (${filtered.length}/${candidates.length})`);
    card.appendChild(cand_title);

    const cand_box = el("div");
    render_table(
      cand_box,
      [
        { label: "entity_id", get_value: (r) => r.entity_id },
        { label: "kind", get_value: (r) => r.kind },
        { label: "integration", get_value: (r) => r.integration_domain },
        { label: "unit", get_value: (r) => r.unit },
        { label: "state_class", get_value: (r) => r.state_class },
        { label: "disabled_by", get_value: (r) => r.disabled_by },
      ],
      filtered.slice(0, 300)
    );
    card.appendChild(cand_box);

    const note = el("div", "hse_subtitle", "Aperçu limité à 300 lignes (v0).");
    card.appendChild(note);

    container.appendChild(card);
  }

  window.hse_scan_view = { render_scan };
})();
