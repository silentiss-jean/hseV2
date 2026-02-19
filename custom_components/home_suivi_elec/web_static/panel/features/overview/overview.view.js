(function () {
  const { el, clear } = window.hse_dom;

  function render_overview(container, data) {
    clear(container);

    const card = el("div", "hse_card");
    card.appendChild(el("div", null, "API (manifest / ping)"));

    const pre = el("pre", "hse_code");
    pre.textContent = JSON.stringify(data, null, 2);

    card.appendChild(pre);
    container.appendChild(card);
  }

  window.hse_overview_view = { render_overview };
})();
