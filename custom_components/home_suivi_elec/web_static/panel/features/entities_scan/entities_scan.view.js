(function () {
  function clear_node(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function render_integrations_list(container, integrations) {
    const title = document.createElement("div");
    title.className = "hse_title";
    title.textContent = "Intégrations (power/energy)";

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(integrations, null, 2);

    container.appendChild(title);
    container.appendChild(pre);
  }

  function render_candidates_table(container, candidates) {
    const title = document.createElement("div");
    title.className = "hse_title";
    title.textContent = `Entités candidates (${candidates.length})`;

    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(
      candidates.slice(0, 200),
      null,
      2
    );

    const note = document.createElement("div");
    note.className = "hse_muted";
    note.textContent = "Aperçu limité aux 200 premières (v1).";

    container.appendChild(title);
    container.appendChild(note);
    container.appendChild(pre);
  }

  function render_entities_scan(container, scan_result) {
    clear_node(container);

    const wrapper = document.createElement("div");
    wrapper.className = "hse_card";

    const meta = document.createElement("div");
    meta.className = "hse_muted";
    meta.textContent = `generated_at: ${scan_result?.generated_at || "—"}`;

    wrapper.appendChild(meta);

    render_integrations_list(wrapper, scan_result.integrations || []);
    render_candidates_table(wrapper, scan_result.candidates || []);

    container.appendChild(wrapper);
  }

  window.hse_entities_scan_view = {
    render_entities_scan,
  };
})();
