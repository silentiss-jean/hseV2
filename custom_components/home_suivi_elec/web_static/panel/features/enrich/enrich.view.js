/* enrich.view.js */
(function () {
  const { el, clear } = window.hse_dom;

  function _as_json_pre(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (_) {
      return String(obj);
    }
  }

  function _badge(text, cls) {
    const b = el("span", `hse_badge ${cls || ""}`.trim(), text);
    return b;
  }

  function _safe_num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function _preview_from_last(last) {
    if (!last) return null;
    if (last.preview) return last.preview;
    return last;
  }

  function _applied_from_last(last) {
    if (!last) return null;
    return last.applied || null;
  }

  function _extract_counts(preview) {
    const s = preview?.summary || {};

    const to_create = _safe_num(s.to_create_count);
    const already_ok = _safe_num(s.already_ok_count);
    const errors = _safe_num(s.errors_count);
    const decisions = _safe_num(s.decisions_required_count);

    return {
      to_create,
      already_ok,
      errors,
      decisions,
    };
  }

  function _render_summary(card, last_result) {
    const preview = _preview_from_last(last_result);
    if (!preview) return;

    const { to_create, already_ok, errors, decisions } = _extract_counts(preview);

    const wrap = el("div", "hse_summary");
    wrap.appendChild(el("div", "hse_section_title", "Résumé"));

    const badges = el("div", "hse_badges");

    if (to_create != null) badges.appendChild(_badge(`À créer: ${to_create}`, to_create > 0 ? "hse_badge_status_warn" : "hse_badge_status_ok"));
    if (already_ok != null) badges.appendChild(_badge(`Déjà OK: ${already_ok}`, "hse_badge_status_ok"));

    if (decisions != null) {
      badges.appendChild(
        _badge(`Décisions: ${decisions}`, decisions > 0 ? "hse_badge_status_warn" : "hse_badge_status_ok")
      );
    }

    if (errors != null) {
      badges.appendChild(_badge(`Erreurs: ${errors}`, errors > 0 ? "hse_badge_status_warn" : "hse_badge_status_ok"));
    }

    wrap.appendChild(badges);

    // Small hint: show selected entity id if present
    const power_entity_id = preview?.input?.power_entity_id;
    if (power_entity_id) {
      wrap.appendChild(el("div", "hse_subtitle", `Capteur power: ${power_entity_id}`));
    }

    card.appendChild(wrap);
  }

  function _fold(title, obj, *, open = false) {
    const details = document.createElement("details");
    details.className = "hse_fold";
    if (open) details.open = true;

    const summary = document.createElement("summary");
    summary.className = "hse_fold_summary";

    const left = el("div", "hse_fold_title", title);
    const right = el("div", "hse_subtitle", "JSON");

    summary.appendChild(left);
    summary.appendChild(right);

    const body = el("div", "hse_fold_body");
    const pre = el("pre", "hse_code hse_mono");
    pre.textContent = _as_json_pre(obj);
    body.appendChild(pre);

    details.appendChild(summary);
    details.appendChild(body);
    return details;
  }

  function render_enrich(container, state, on_action) {
    clear(container);

    const card = el("div", "hse_card");
    card.appendChild(el("div", null, "Enrichissement"));
    card.appendChild(el("div", "hse_subtitle", "Rendre HSE ready (admin only)."));

    const toolbar = el("div", "hse_toolbar");

    const btn = el("button", "hse_button hse_button_primary", state.running ? "En cours…" : "Rendre HSE ready");
    btn.disabled = !!state.running;
    btn.addEventListener("click", () => on_action("run"));

    const btnCopy = el("button", "hse_button", "Copier JSON");
    btnCopy.disabled = !state.last_result;
    btnCopy.addEventListener("click", async () => {
      if (!state.last_result) return;
      const txt = _as_json_pre(state.last_result);
      try {
        await navigator.clipboard.writeText(txt);
      } catch (_) {
        // ignore (clipboard can be blocked)
      }
    });

    toolbar.appendChild(btn);
    toolbar.appendChild(btnCopy);
    card.appendChild(toolbar);

    if (state.error) {
      card.appendChild(el("div", "hse_subtitle", `Erreur: ${state.error}`));
    }

    if (state.last_result) {
      _render_summary(card, state.last_result);

      const preview = _preview_from_last(state.last_result);
      const applied = _applied_from_last(state.last_result);

      const folds = el("div", null);
      if (preview) folds.appendChild(_fold("Preview", preview, { open: false }));
      if (applied) folds.appendChild(_fold("Apply", applied, { open: false }));
      folds.appendChild(_fold("Résultat brut", state.last_result, { open: false }));
      card.appendChild(folds);
    }

    container.appendChild(card);
  }

  window.hse_enrich_view = { render_enrich };
})();
