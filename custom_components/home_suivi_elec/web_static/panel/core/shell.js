(function () {
  const { el, clear } = window.hse_dom;

  function create_shell(root, ctx) {
    clear(root);

    const page = el("div", "hse_page");
    const shell = el("div", "hse_shell");

    const header = el("div", "hse_header");
    const left = el("div");
    left.appendChild(el("h1", "hse_title", "Home Suivi Elec"));
    left.appendChild(el("div", "hse_subtitle", "Panel v2 (modulaire)"));

    const right = el("div", "hse_subtitle", `user: ${ctx.user_name || "—"}`);
    header.appendChild(left);
    header.appendChild(right);

    const tabs = el("div", "hse_tabs");
    const content = el("div");

    shell.appendChild(header);
    shell.appendChild(tabs);
    shell.appendChild(content);
    page.appendChild(shell);
    root.appendChild(page);

    return { tabs, content, header_right: right };
  }

  function render_tabs(tabs_node, active_tab, on_tab) {
    clear(tabs_node);

    const items = [
      { id: "overview", label: "Aperçu" },
      { id: "scan", label: "Scan" },
    ];

    for (const it of items) {
      const b = el("button", "hse_tab", it.label);
      b.dataset.active = it.id === active_tab ? "true" : "false";
      b.addEventListener("click", () => on_tab(it.id));
      tabs_node.appendChild(b);
    }
  }

  window.hse_shell = { create_shell, render_tabs };
})();
