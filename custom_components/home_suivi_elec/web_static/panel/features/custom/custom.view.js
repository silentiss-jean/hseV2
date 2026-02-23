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

  /**
   * Incremental renderer for the customisation tab.
   * Goal: avoid re-creating the <select> (and closing its dropdown) on periodic panel rerenders.
   */
  function render_customisation(container, state, on_action) {
    const key = "hse_customisation_root";
    let root = container.querySelector(`[data-hse-key="${key}"]`);

    // Build once
    if (!root) {
      clear(container);

      root = el("div", null);
      root.dataset.hseKey = key;

      const card = el("div", "hse_card");
      card.appendChild(el("div", null, "Apparence & Thème"));
      card.appendChild(el("div", "hse_subtitle", "Le thème s’applique à tous les onglets du panel (stocké dans ce navigateur)."));

      const row = el("div", "hse_toolbar");

      const select = document.createElement("select");
      select.dataset.hseKey = "theme_select";

      // IMPORTANT: les styles définissent .hse_input sur des <input>,
      // mais on l'utilise aussi ici pour un <select>.
      // Certains navigateurs / resets (ou CSS existant) peuvent masquer un select stylé.
      // On force un minimum de rendu natif fiable.
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

      select.addEventListener("change", (ev) => on_action("set_theme", ev.target.value));

      row.appendChild(select);
      card.appendChild(row);

      // Toggles
      const toggles = el("div", "hse_badges");

      const btn_bg = el("button", "hse_button");
      btn_bg.dataset.hseKey = "toggle_dynamic_bg";
      btn_bg.addEventListener("click", () => on_action("toggle_dynamic_bg"));
      toggles.appendChild(btn_bg);

      const btn_glass = el("button", "hse_button");
      btn_glass.dataset.hseKey = "toggle_glass";
      btn_glass.addEventListener("click", () => on_action("toggle_glass"));
      toggles.appendChild(btn_glass);

      card.appendChild(toggles);
      root.appendChild(card);
      container.appendChild(root);
    }

    // Incremental updates
    const select = root.querySelector('[data-hse-key="theme_select"]');
    if (select) {
      const desired = state?.theme || "dark";
      if (select.value !== desired) select.value = desired;
    }

    const btn_bg = root.querySelector('[data-hse-key="toggle_dynamic_bg"]');
    if (btn_bg) btn_bg.textContent = state?.dynamic_bg ? "Fond: ON" : "Fond: OFF";

    const btn_glass = root.querySelector('[data-hse-key="toggle_glass"]');
    if (btn_glass) btn_glass.textContent = state?.glass ? "Glass: ON" : "Glass: OFF";
  }

  window.hse_custom_view = { render_customisation };
})();
