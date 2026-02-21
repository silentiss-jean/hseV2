(function () {
  const { el, clear } = window.hse_dom;

  const THEMES = [
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

  function render_customisation(container, state, on_action) {
    clear(container);

    const card = el("div", "hse_card");
    card.appendChild(el("div", null, "Apparence & Thème"));
    card.appendChild(el("div", "hse_subtitle", "Le thème s’applique à tous les onglets du panel (stocké dans ce navigateur)."));

    const row = el("div", "hse_toolbar");

    const select = document.createElement("select");
    select.className = "hse_input";
    for (const t of THEMES) {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = t.label;
      select.appendChild(opt);
    }
    select.value = state.theme || "dark";
    select.addEventListener("change", (ev) => on_action("set_theme", ev.target.value));

    row.appendChild(select);
    card.appendChild(row);

    // Toggles simples (optionnels)
    const toggles = el("div", "hse_badges");

    const btn_bg = el("button", "hse_button", state.dynamic_bg ? "Fond: ON" : "Fond: OFF");
    btn_bg.addEventListener("click", () => on_action("toggle_dynamic_bg"));
    toggles.appendChild(btn_bg);

    const btn_glass = el("button", "hse_button", state.glass ? "Glass: ON" : "Glass: OFF");
    btn_glass.addEventListener("click", () => on_action("toggle_glass"));
    toggles.appendChild(btn_glass);

    card.appendChild(toggles);

    container.appendChild(card);
  }

  window.hse_custom_view = { render_customisation };
})();
