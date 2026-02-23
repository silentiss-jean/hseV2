# Shared UI tokens and styles — `tokens.css`

This document describes the shared CSS tokens and common UI primitives used by the HSE panel.

Target file:

- `custom_components/home_suivi_elec/web_static/shared/styles/tokens.css`

This is formatted **AI-first** (what tokens/classes exist and what they mean), plus a human layer (how to extend safely).

---

## Purpose

Provide a consistent visual system for the HSE web component panel:

- Theme-aware colors (prefer HSE theme tokens, fallback to HA tokens).
- Shared layout tokens (gap/radius).
- Common primitives: cards, toolbar, buttons, inputs, tables, code blocks.
- Badge system used heavily by the scan UI.

---

## Token model

All tokens are defined on `:host` to scope them to the web component.

### Layout tokens

- `--hse_gap`: default spacing (12px)
- `--hse_radius`: default border radius (12px)

### Core colors

These use HSE theme tokens if present, otherwise fallback to HA theme tokens:

- `--hse_fg`: text color
- `--hse_muted`: secondary text color
- `--hse_border`: border/divider color
- `--hse_card_bg`: surface/card background
- `--hse_accent`: primary/accent color
- `--hse_danger`: error/danger color

### Dynamic background

- `--hse-bg-dynamic-opacity`: overlay opacity for `--hse-bg-dynamic` background image

The background is rendered using `.hse_page::before` as an absolute overlay with `pointer-events:none`.

---

## Key component classes

### Page & layout

- `.hse_page`: full-viewport container, sets base background.
- `.hse_shell`: max width container.
- `.hse_header`, `.hse_title`, `.hse_subtitle`: header layout.

### Tabs, cards, toolbar

- `.hse_tabs`, `.hse_tab` (+ `[data-active="true"]`)
- `.hse_card`
- `.hse_toolbar`

### Buttons & inputs

- `.hse_button`, `.hse_button_primary`, `.hse_button:disabled`
- `.hse_input`

### Tables & code

- `.hse_table`
- `.hse_code`

---

## Badge system

Badges are small pill UI elements used to display metadata.

Base classes:

- `.hse_badges`: flex container
- `.hse_badge`: base badge
- `.hse_badge_warn`: generic warning border

Status variants (used by scan UI):

- `.hse_badge_status_ok`: accent-tinted border/text
- `.hse_badge_status_warn`: danger-tinted border/text

Important:

- These classes are designed to be theme-aware using `color-mix()` with `--hse_accent`/`--hse_danger`.

---

## Usage scenarios

### Scan UI

- Registry status uses `.hse_badge_status_ok` / `.hse_badge_status_warn`.
- Runtime health badge often uses `.hse_badge_status_warn`.

### Adding a new severity

If you add a new status level (e.g. `info`), prefer:

- Create a new CSS class `.hse_badge_status_info` using a theme token.
- Keep badge sizing consistent with `.hse_badge`.

---

## Human checklist

When UI colors look wrong:

1) Verify HSE theme tokens exist (or HA fallback tokens are present).
2) Check `color-mix()` browser support in your target environment.
3) Ensure the class is applied in the relevant view.

