/* enrich.view.js */
(function () {
  const { el, clear } = window.hse_dom;

  function render_enrich(container, state, on_action) {
    clear(container);

    const card = el("div", "hse_card");
    card.appendChild(el("div", null, "Enrichissement"));
    card.appendChild(el("div", "hse_subtitle", "Rendre HSE ready (admin only)."));

    const toolbar = el("div", "hse_toolbar");
    const btn = el("button", "hse_button hse_button_primary", state.running ? "En cours…" : "Rendre HSE ready");
    btn.disabled = !!state.running;
    btn.addEventListener("click", () => on_action("run"));
    toolbar.appendChild(btn);
    card.appendChild(toolbar);

    if (state.error) {
      card.appendChild(el("div", "hse_subtitle", `Erreur: ${state.error}`));
    }

    if (state.last_result) {
      const pre = el("pre", "hse_code");
      pre.textContent = JSON.stringify(state.last_result, null, 2);
      card.appendChild(pre);
    }

    container.appendChild(card);
  }

  window.hse_enrich_view = { render_enrich };
})();
