// GENERATED from src/ui/toolkit.css by scripts/sync-toolkit.mjs — do not edit.
// Inline fallback copy of the toolkit sheet (the <link> copy is
// src/public/ui/toolkit.css). Regenerate with `npm run ui:sync`.
export const TOOLKIT_CSS = `/* ============================================================================
   One UI toolkit for every injected component — THE single sheet.

   TOKEN CONTRACT (read before editing):
   - Layer 1 \`--mhx-pg-*\`: PAGE-ADAPTIVE chrome. These describe the page the
     widget sits on (the Magento admin), never our own app. Ink, lines and
     fills derive from \`currentColor\` + \`color-mix\` with a flat \`rgba()\`
     fallback declared FIRST, so the same rules work on a light or a dark
     admin and engines without color-mix get a sane grey.
   - Layer 2 \`--mhx-*\`: extension-owned surfaces (side panel, dashboard,
     theme preview), published by src/ui/theme.ts. NEVER use them here: the
     admin page is not our surface — that mistake caused the dark-admin
     contrast bug. \`--mhx-surface\` is the panel's white (or dark) card, not
     the page, and it only lands once storage resolves, so
     \`var(--mhx-surface, #fff)\` paints light-theme chrome onto a dark admin
     for the first frames. The ONE exception is \`--mhx-pg-accent\`, which
     deliberately bridges to the operator's \`--mhx-accent\` (below).
   - The three coloured tokens \`--mhx-pg-accent\`, \`--mhx-pg-danger\`,
     \`--mhx-pg-ok\` are operator-overridable (Settings → Toolkit colours).
     Overrides are written as inline custom properties on <html>, which
     outrank this block, so removing one restores the default here.
     \`--mhx-pg-accent\` reads \`--mhx-accent\` so the page follows the theme
     accent; \`--mhx-pg-on-accent\` reads its contrast-derived foreground, so a
     light accent gets dark text without asking.
   - Being theme-aware is allowed in exactly TWO places, both below and both
     keyed off state the page states about itself, never off the palette: the
     \`currentColor\`-derived layer 1 (works on any admin, before any JS), and
     the measured page-surface blocks (\`data-mhx-page\` + \`--mhx-pg-page-ink\`,
     published by src/page/theme/magentoTheme.ts). Note \`data-theme\` is deliberately NOT
     the signal: it records the theme the operator asked for, and a Magento
     admin with its own dark theme is dark while \`data-theme\` still says
     "light" and the palette is still the light one.
   - Features never style themselves: they pass a modifier (\`data-variant\`,
     \`data-tone\`, \`--active\`, or a named state such as \`--high\`), and nothing
     else. No colour, radius, padding or font lives outside this file (plus
     src/ui/theme.ts for extension-owned surfaces); content.ts no longer injects
     a stylesheet of its own, and its controls are the "Magento page features"
     section at the bottom of this file.

   DELIVERY (do not edit those, they are generated):
     src/ui/toolkit.css  -- this file, the ONLY source
       -> src/public/ui/toolkit.css   (loaded as a <link>, cached across pages;
                                   exposed via web_accessible_resources)
       -> src/ui/toolkitCss.ts    (inline <style id="mhx-ui"> fallback for
                                   setups where extension URLs are blocked)
   Regenerate with \`npm run ui:sync\`; \`npm run check:ui\` fails on drift.
   ============================================================================ */

/* ---- layer 1: page-adaptive tokens -------------------------------------- */
:root,
:host {
  --mhx-pg-ink: currentColor;
  --mhx-pg-muted: rgba(128, 128, 128, 0.82);
  --mhx-pg-muted: color-mix(in srgb, currentColor 72%, transparent);

  --mhx-pg-line: rgba(128, 128, 128, 0.45);
  --mhx-pg-line: color-mix(in srgb, currentColor 22%, transparent);
  --mhx-pg-line-soft: rgba(128, 128, 128, 0.32);
  --mhx-pg-line-soft: color-mix(in srgb, currentColor 14%, transparent);
  --mhx-pg-fill: rgba(128, 128, 128, 0.07);
  --mhx-pg-fill: color-mix(in srgb, currentColor 7%, transparent);
  --mhx-pg-fill-hover: rgba(128, 128, 128, 0.16);
  --mhx-pg-fill-hover: color-mix(in srgb, currentColor 13%, transparent);

  --mhx-pg-accent: var(--mhx-accent, #007bdb);
  --mhx-pg-on-accent: var(--mhx-on-accent, #ffffff);
  /* The hover shade of a solid accent fill. "Stronger = darker" only holds on a
     LIGHT surface, so this is the light-page value: the measured dark block
     below flips the mix towards white, or hovering an accent button on a dark
     admin would sink it into the page instead of responding to it. */
  --mhx-pg-accent-strong: color-mix(in srgb, var(--mhx-pg-accent) 84%, #000000);
  --mhx-pg-danger: #e5484d;
  --mhx-pg-danger-wash: color-mix(in srgb, var(--mhx-pg-danger) 14%, transparent);
  --mhx-pg-ok: #16a34a;
  --mhx-pg-ok-wash: color-mix(in srgb, var(--mhx-pg-ok) 14%, transparent);

  /* The semantic set above is danger + ok. The page features (priority
     indicators, "Open All", product-type badges) need the two that were
     missing, plus an informational hue. Mid tones, because the base palette
     light and dark are both in use; the dark-admin block below lifts them. */
  --mhx-pg-warn: #e65100;
  --mhx-pg-warn-strong: color-mix(in srgb, var(--mhx-pg-warn) 84%, #000000);
  --mhx-pg-warn-wash: rgba(230, 81, 0, 0.14);
  --mhx-pg-warn-wash: color-mix(in srgb, var(--mhx-pg-warn) 14%, transparent);
  --mhx-pg-caution: #f57f17;
  --mhx-pg-caution-wash: rgba(245, 127, 23, 0.14);
  --mhx-pg-caution-wash: color-mix(in srgb, var(--mhx-pg-caution) 14%, transparent);
  --mhx-pg-info: #0369a1;
  --mhx-pg-info-wash: rgba(3, 105, 161, 0.12);
  --mhx-pg-info-wash: color-mix(in srgb, var(--mhx-pg-info) 12%, transparent);

  /* Foreground for a SOLID semantic fill (the green "copied" flash, the amber
     "Open All"). Fixed white, not a palette value: the fill is ours and
     opaque, so it reads the same on either admin. */
  --mhx-pg-on-solid: #ffffff;

  /* Tooltip chip. An opaque surface whose job is to contrast with the PAGE,
     which currentColor cannot give us (it would invert to the page's own
     ink), so it is a fixed pair, flipped by the dark-admin block below. */
  --mhx-pg-tip-bg: rgba(51, 51, 51, 0.96);
  --mhx-pg-tip-ink: rgba(255, 255, 255, 0.98);

  --mhx-pg-radius: 4px;
  --mhx-pg-gap: 6px;
  --mhx-pg-font: 13px/1.4 system-ui, "Segoe UI", Arial, sans-serif;
}

/* ---- measured page surface -------------------------------------------------
   src/page/theme/magentoTheme.ts measures the page it has just painted and publishes two
   facts on <html>: \`data-mhx-page="light|dark"\`, and the page's own text
   colour as \`--mhx-pg-page-ink\`.

   Why measure, when everything else here is derived? Two things CSS cannot
   see, and both bite the injected controls:
   1. \`data-theme\` says which theme the operator ASKED for, not what the page
      is. \`--mhx-*\` is published as the light palette unless OUR dark admin is
      enabled, so on an admin with its own dark theme the page is dark while the
      palette is light (README, massactions).
   2. Inside Magento's own widgets \`currentColor\` is the WIDGET's colour, not
      the page's ink. The grid pager's "per page" strip hands us \`#6a6a6a\`
      (muted), so 7% of it for a fill and 22% of it for a line are both nothing,
      and its labels land at 3:1 — a percentage of an unknown colour cannot be
      made visible, which is what the measured ink is for.

   Both blocks are additive. Before the measurement lands (or without it) every
   token keeps its \`currentColor\` default from the layer-1 block above, so this
   degrades to exactly the pre-measurement appearance rather than to nothing. */
[data-mhx-page="light"] {
  /* Chrome floors. On a light page a dark ink gives 7%/22% a visible grey, but
     the muted widget colour does not, so the page states which it is. */
  --mhx-pg-fill: rgba(0, 0, 0, 0.05);
  --mhx-pg-fill-hover: rgba(0, 0, 0, 0.11);
  --mhx-pg-line: rgba(0, 0, 0, 0.2);
  --mhx-pg-line-soft: rgba(0, 0, 0, 0.12);
}

[data-mhx-page="dark"] {
  /* The same floors, lifting instead of darkening: on a dark page a
     translucent white reads as "raised" whatever the inherited colour is. */
  --mhx-pg-fill: rgba(255, 255, 255, 0.07);
  --mhx-pg-fill-hover: rgba(255, 255, 255, 0.15);
  --mhx-pg-line: rgba(255, 255, 255, 0.26);
  --mhx-pg-line-soft: rgba(255, 255, 255, 0.16);

  /* Hover on a solid fill must LIGHTEN on a dark page, so the -strong shade
     flips direction (the same rule theme.ts applies when it derives a palette)
     — otherwise the active segment and "Open All" dim into the page instead of
     responding. The mid-tone semantics are lifted off the background too. */
  --mhx-pg-accent-strong: color-mix(in srgb, var(--mhx-pg-accent) 84%, #ffffff);
  --mhx-pg-warn: #ff9a52;
  --mhx-pg-warn-strong: color-mix(in srgb, var(--mhx-pg-warn) 84%, #ffffff);
  --mhx-pg-caution: #ffc961;
  --mhx-pg-info: #6cb6e8;

  /* The tooltip chip contrasts with the page, so it inverts. */
  --mhx-pg-tip-bg: rgba(242, 242, 242, 0.98);
  --mhx-pg-tip-ink: rgba(17, 17, 17, 0.98);
}

/* ---- base ----------------------------------------------------------------
   Magento styles bare \`button\`/\`input\` with \`:not(...)\` selectors, so every
   primitive sets font, line-height, colour, background, border, radius and
   box-shadow explicitly instead of inheriting. */

/* ---- icon ------------------------------------------------------------------
   The SVG glyph a factory puts inside a control (components.ts
   \`createIconElement\`).
   Both properties used to be written as inline styles on the element; they
   belong here with the rest of the presentation. A class rule also needs no
   inline write on every icon, and it still beats Magento's own bare \`svg\`
   rules on source order, because this sheet is injected after the page's. If a
   more specific Magento rule ever wins, scope this to the primitive carrying
   the icon rather than going back to an inline style. */
.mhx-icon {
  display: inline-block;
  flex-shrink: 0;
}

/* ---- button --------------------------------------------------------------- */
.mhx-btn {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  margin: 0;
  padding: 6px 12px;
  font: var(--mhx-pg-font);
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--mhx-pg-radius);
  background: rgba(128, 128, 128, 0.07);
  background: color-mix(in srgb, currentColor 7%, transparent);
  color: inherit;
  cursor: pointer;
  box-shadow: none;
}

.mhx-btn:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 13%, transparent);
}

.mhx-btn:focus-visible {
  outline: 2px solid var(--mhx-pg-accent);
  outline-offset: 1px;
}

.mhx-btn[disabled],
.mhx-btn[aria-disabled="true"] {
  opacity: 0.55;
  cursor: default;
}

.mhx-btn[data-variant="danger"] {
  color: var(--mhx-pg-danger);
  font-weight: 600;
  background: transparent;
}

.mhx-btn[data-variant="danger"]:hover {
  background: rgba(229, 72, 77, 0.14);
  background: var(--mhx-pg-danger-wash);
}

.mhx-btn[data-variant="accent"] {
  background: var(--mhx-pg-accent);
  border-color: var(--mhx-pg-accent);
  color: var(--mhx-pg-on-accent);
  font-weight: 600;
}

.mhx-btn[data-variant="accent"]:hover {
  background: var(--mhx-pg-accent);
  background: var(--mhx-pg-accent-strong);
  border-color: var(--mhx-pg-accent-strong);
  color: var(--mhx-pg-on-accent);
}

.mhx-btn[data-variant="ghost"] {
  background: transparent;
}

.mhx-btn[data-variant="icon"] {
  padding: 3px 6px;
  background: transparent;
  border-color: transparent;
}

.mhx-btn[data-variant="icon"]:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 13%, transparent);
}

.mhx-btn[data-variant="icon"][data-tone="ok"] {
  color: var(--mhx-pg-ok);
}

/* Compact icon button: the controls that sit INSIDE a chip (pin, pencil, ✓, ✕).
   The default icon padding would make a one-line pill taller than its text. */
.mhx-btn--compact {
  width: 18px;
  height: 18px;
  min-width: 18px;
  padding: 0;
}

/* Toggle state (pin on/off) — \`aria-pressed\` is the source of truth, so the
   state is announced to assistive tech as well as painted. */
.mhx-btn[data-variant="icon"][aria-pressed="true"] {
  color: var(--mhx-pg-accent);
  background: rgba(128, 128, 128, 0.07);
  background: color-mix(in srgb, var(--mhx-pg-accent) 14%, transparent);
}

.mhx-btn[data-variant="icon"][aria-pressed="true"]:hover {
  background: color-mix(in srgb, var(--mhx-pg-accent) 22%, transparent);
}

.mhx-btn[data-variant="ok"] {
  color: var(--mhx-pg-ok);
  font-weight: 600;
  background: transparent;
}

.mhx-btn[data-variant="ok"]:hover {
  background: rgba(22, 163, 74, 0.14);
  background: var(--mhx-pg-ok-wash);
}

/* ---- button group (row actions, header actions) --------------------------- */
.mhx-group {
  box-sizing: border-box;
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  font: var(--mhx-pg-font);
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  overflow: hidden;
  background: rgba(128, 128, 128, 0.07);
  background: var(--mhx-pg-fill);
  vertical-align: middle;
}

.mhx-group--wrap {
  flex-wrap: wrap;
}

.mhx-group > .mhx-btn {
  padding: 5px 10px;
  font-weight: 400;
  border: 0;
  border-right: 1px solid rgba(128, 128, 128, 0.32);
  border-right: 1px solid var(--mhx-pg-line-soft);
  border-radius: 0;
  background: transparent;
  color: inherit;
}

.mhx-group > .mhx-btn:last-child {
  border-right: 0;
}

.mhx-group > .mhx-btn:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 13%, transparent);
}

.mhx-group > .mhx-btn[data-variant="danger"] {
  color: var(--mhx-pg-danger);
}

.mhx-group > .mhx-btn[data-variant="danger"]:hover {
  background: rgba(229, 72, 77, 0.14);
  background: var(--mhx-pg-danger-wash);
}

/* ---- bar (full-width strip: bulk actions, toolbars) ----------------------- */
.mhx-bar {
  box-sizing: border-box;
  display: inline-flex;
  align-items: stretch;
  flex-wrap: wrap;
  max-width: 100%;
  clear: both;
  margin: 8px 0;
  font: var(--mhx-pg-font);
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  overflow: hidden;
  background: rgba(128, 128, 128, 0.07);
  background: var(--mhx-pg-fill);
  vertical-align: middle;
}

.mhx-bar > .mhx-btn {
  font-weight: 400;
  border: 0;
  border-right: 1px solid rgba(128, 128, 128, 0.32);
  border-right: 1px solid var(--mhx-pg-line-soft);
  border-radius: 0;
  background: transparent;
  color: inherit;
}

.mhx-bar > .mhx-btn:last-child {
  border-right: 0;
}

.mhx-bar > .mhx-btn:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 13%, transparent);
}

.mhx-bar > .mhx-btn[data-variant="danger"] {
  color: var(--mhx-pg-danger);
  font-weight: 600;
}

.mhx-bar > .mhx-btn[data-variant="danger"]:hover {
  background: rgba(229, 72, 77, 0.14);
  background: var(--mhx-pg-danger-wash);
}

/* ---- segmented control ---------------------------------------------------- */
.mhx-seg {
  box-sizing: border-box;
  display: inline-flex;
  align-items: stretch;
  font: var(--mhx-pg-font);
  /* The control's ink is the page's, never inherited from a Magento widget it
     happens to sit in: a pager hands us its own muted colour. */
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  overflow: hidden;
  background: rgba(128, 128, 128, 0.07);
  background: var(--mhx-pg-fill);
}

.mhx-seg-btn {
  box-sizing: border-box;
  margin: 0;
  padding: 5px 12px;
  font: var(--mhx-pg-font);
  line-height: 1.4;
  border: 0;
  border-right: 1px solid rgba(128, 128, 128, 0.32);
  border-right: 1px solid var(--mhx-pg-line-soft);
  border-radius: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.mhx-seg-btn:last-child {
  border-right: 0;
}

.mhx-seg-btn:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 13%, transparent);
}

.mhx-seg-btn:focus-visible {
  outline: 2px solid var(--mhx-pg-accent);
  outline-offset: -2px;
}

.mhx-seg-btn--active,
.mhx-seg-btn[aria-pressed="true"] {
  background: var(--mhx-pg-accent);
  color: var(--mhx-pg-on-accent);
  font-weight: 600;
  /* The accent is the operator's and can sit as close to the page as they
     like — a dark brand colour on a dark admin, a pale one on a light admin —
     so the selected shape also carries a ring in the fill's own foreground.
     That foreground is contrast-derived from the accent (theme.ts
     \`readableForeground\`, ui/tokens.ts for an override), so the ring always
     separates the shape even when the fill itself does not. */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--mhx-pg-on-accent) 45%, transparent);
}

.mhx-seg-btn--active:hover,
.mhx-seg-btn[aria-pressed="true"]:hover {
  background: var(--mhx-pg-accent);
  background: var(--mhx-pg-accent-strong);
}

/* ---- chip (removable filter / pill) ---------------------------------------
   One shell for every filter chip: applied filters, pinned filters and the
   panel pills. The remove control is \`.mhx-chip-remove\`; chips that reuse
   Magento's own markup keep Magento's \`.action-remove\` instead, so a pinned
   chip reads exactly like the applied ones beside it. */
/* \`inline-block\`, not flex: a chip is a run of text ("Label: value") with a few
   controls. Flex would turn the colon into an anonymous flex item, and its
   leading/trailing spaces are trimmed there — "Status:Disabled". */
.mhx-chip {
  box-sizing: border-box;
  display: inline-block;
  max-width: 100%;
  padding: 3px 8px;
  font: var(--mhx-pg-font);
  line-height: 1.4;
  vertical-align: middle;
  white-space: nowrap;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.07);
  background: var(--mhx-pg-fill);
  color: inherit;
}

/* Space the CONTROLS, never the text: a chip reads "Label: value", so a flex
   \`gap\` would push the colon away from its label (Magento's own chips keep the
   colon in a bare text node). */
.mhx-chip > .mhx-btn,
.mhx-chip > .mhx-chip-remove,
.mhx-chip > .action-remove {
  margin-left: 4px;
}

/* Keep icons on the text's centre line now that the chip is inline. */
.mhx-chip > * {
  vertical-align: middle;
}

.mhx-chip > .mhx-btn:first-child {
  margin-left: 0;
}

.mhx-chip-remove {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  width: 16px;
  height: 16px;
  font: inherit;
  line-height: 1;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.mhx-chip-remove:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 13%, transparent);
}

/* ---- badge (count / code / status dot) ------------------------------------- */
.mhx-badge {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 18px;
  padding: 1px 7px;
  font: 11px/1.5 system-ui, "Segoe UI", Arial, sans-serif;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.07);
  background: var(--mhx-pg-fill);
  color: inherit;
  white-space: nowrap;
}

.mhx-badge[data-tone="ok"] {
  color: var(--mhx-pg-ok);
  border-color: rgba(22, 163, 74, 0.45);
  border-color: color-mix(in srgb, var(--mhx-pg-ok) 45%, transparent);
  background: rgba(22, 163, 74, 0.12);
  background: var(--mhx-pg-ok-wash);
}

.mhx-badge[data-tone="accent"] {
  color: var(--mhx-pg-accent);
  border-color: var(--mhx-pg-line);
  background: var(--mhx-pg-fill);
}

.mhx-badge[data-tone="danger"] {
  color: var(--mhx-pg-danger);
  border-color: rgba(229, 72, 77, 0.45);
  border-color: color-mix(in srgb, var(--mhx-pg-danger) 45%, transparent);
  background: rgba(229, 72, 77, 0.12);
  background: var(--mhx-pg-danger-wash);
}

/* ---- field --------------------------------------------------------------- */
.mhx-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--mhx-pg-ink);
  font: var(--mhx-pg-font);
}

.mhx-field-label {
  font-size: 12px;
  font-weight: 600;
}

.mhx-field input,
.mhx-field select,
.mhx-field textarea {
  box-sizing: border-box;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  background: var(--mhx-pg-fill);
  color: var(--mhx-pg-ink);
  font: inherit;
}

.mhx-field input:focus-visible,
.mhx-field select:focus-visible,
.mhx-field textarea:focus-visible {
  outline: 2px solid var(--mhx-pg-accent);
  outline-offset: 1px;
}

.mhx-field[data-status="ok"] input {
  border-color: var(--mhx-pg-ok);
}

.mhx-field[data-status="bad"] input {
  border-color: var(--mhx-pg-danger);
}

.mhx-field-hint {
  color: var(--mhx-pg-muted);
  font-size: 11px;
}

/* ---- messages ------------------------------------------------------------ */
.mhx-error {
  padding: 8px;
  border: 1px solid var(--mhx-pg-danger);
  border-radius: var(--mhx-pg-radius);
  background: var(--mhx-pg-danger-wash);
  color: var(--mhx-pg-danger);
}

.mhx-saved {
  color: var(--mhx-pg-ok);
  font-size: 12px;
}

.mhx-note {
  margin: 4px 0;
  color: var(--mhx-pg-muted);
}

/* An empty-state is the note treatment in italic — one rule per class instead
   of a shared block plus a follow-up override for the same selector. */
.mhx-empty {
  margin: 4px 0;
  color: var(--mhx-pg-muted);
  font-style: italic;
}

/* ---- inline field (chip editor, custom page size) --------------------------- */
.mhx-inline-field {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: var(--mhx-pg-font);
  /* Same reasoning as .mhx-seg: the page's ink, not the surrounding widget's. */
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-inline-field input,
.mhx-inline-field select {
  box-sizing: border-box;
  width: 76px;
  max-width: 100%;
  margin: 0;
  padding: 4px 7px;
  font: var(--mhx-pg-font);
  color: inherit;
  background: rgba(128, 128, 128, 0.07);
  background: color-mix(in srgb, currentColor 6%, transparent);
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
}

/* A filter value needs room to read (SKUs, names); the page-size control
   does not, so width stays a per-use modifier. */
.mhx-inline-field[data-size="wide"] input,
.mhx-inline-field[data-size="wide"] select {
  width: 150px;
}

.mhx-inline-field input:focus-visible,
.mhx-inline-field select:focus-visible {
  outline: none;
  border-color: var(--mhx-pg-accent);
  box-shadow: 0 0 0 1px var(--mhx-pg-accent);
}

.mhx-inline-field--ok input {
  border-color: rgba(22, 163, 74, 0.45);
  border-color: color-mix(in srgb, var(--mhx-pg-ok) 45%, transparent);
}

/* ---- popover surface -------------------------------------------------------- */
/* Translucent + blurred rather than a solid fill: the page background colour
   is unknown from inside a content script (a light admin and a dark admin
   both exist), and a derived-from-currentColor solid would invert. Phase 5
   (enhanceSelect port) re-checks this against the real picker. */
.mhx-pop {
  box-sizing: border-box;
  font: var(--mhx-pg-font);
  color: inherit;
  background: rgba(128, 128, 128, 0.1);
  background: color-mix(in srgb, currentColor 8%, transparent);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  max-height: 280px;
  overflow-y: auto;
}

.mhx-pop-item {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 6px 10px;
  font: var(--mhx-pg-font);
  text-align: left;
  border: 0;
  border-radius: calc(var(--mhx-pg-radius) - 1px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.mhx-pop-item:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 13%, transparent);
}

.mhx-pop-item--active {
  color: var(--mhx-pg-accent);
  font-weight: 600;
}

/* Popover as a menu anchored to its own button (bulk-action submenus):
   \`top\`/\`left\` are written inline by the caller from the trigger's rect, the
   rest is presentation and lives here. */
.mhx-pop--menu {
  position: fixed;
  z-index: 10050;
  box-sizing: border-box;
  min-width: 180px;
  max-width: 320px;
  max-height: 60vh;
  overflow-y: auto;
  margin: 0;
  padding: 4px;
}

.mhx-pop--menu[hidden] {
  display: none !important;
}

.mhx-pop--menu .mhx-pop-item[data-variant="danger"] {
  color: var(--mhx-pg-danger);
  font-weight: 600;
}

/* ---- toggle (fixed chevron on the admin nav edge) ---------------------------- */
/* Position (\`left\`) is written by adminNavToggle.ts against the measured nav;
   everything visual lives here. */
.mhx-toggle {
  position: fixed;
  top: 10px;
  transform: translateY(0);
  z-index: 10000;
  box-sizing: border-box;
  width: 16px;
  height: 76px;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font: var(--mhx-pg-font);
  line-height: 1;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border: 1px solid var(--mhx-pg-line);
  border-radius: 0 var(--mhx-pg-radius) var(--mhx-pg-radius) 0;
  background: rgba(128, 128, 128, 0.1);
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: inherit;
  cursor: pointer;
}

.mhx-toggle:hover {
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, currentColor 16%, transparent);
}

.mhx-toggle:focus-visible {
  outline: 2px solid var(--mhx-pg-accent);
  outline-offset: 1px;
}

/* Horizontal variant: a short tab on the page edge.
   Position (left/right/top) is written by the feature using it —
   adminNavToggle (left, tall) and messagesToggle (right, short). */
.mhx-toggle--h {
  left: auto;
  right: 0;
  top: 0;
  height: 40px;
  width: 16px;
  border-radius: var(--mhx-pg-radius) 0 0 var(--mhx-pg-radius);
}

/* Left-edge horizontal variant: paired with the messages toggle
   when the band lives on the left side of the content column. */
.mhx-toggle--h--left {
  right: auto;
  left: 0;
  border-radius: 0 var(--mhx-pg-radius) var(--mhx-pg-radius) 0;
}

/* Top-edge horizontal variant: paired with the messages toggle
   when the band lives above the content column. */
.mhx-toggle--h--top {
  right: auto;
  left: 0;
  top: 0;
  height: 16px;
  width: 40px;
  border-radius: 0 0 var(--mhx-pg-radius) var(--mhx-pg-radius);
}

/* ---- toast (bottom-right notification) ---------------------------------------- */
/* Extension-owned overlay surface, like src/ui/theme.ts: it floats above the page
   and must be readable on both admins, so it carries its own colours. */
.mhx-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 340px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #1f2933;
  color: #fff;
  font: 13px/1.4 system-ui, "Segoe UI", Arial, sans-serif;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.mhx-toast--success {
  background: #0b6b3a;
}

.mhx-toast--error {
  background: #9b1c1c;
}

.mhx-toast button {
  margin-left: 4px;
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
}
/* Page header actions moved into header (pageHeader) */
header.page-header > .mhx-header-actions {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 16px 0 0 !important;
  padding: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  width: auto !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  float: none !important;
  position: static !important;
  flex: 0 0 auto !important;
}
header.page-header > .mhx-header-actions .page-actions,
header.page-header > .mhx-header-actions .page-actions-buttons {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  float: none !important;
}
header.page-header > .mhx-header-actions .action-primary,
header.page-header > .mhx-header-actions .action-default {
  margin: 0 !important;
  white-space: nowrap !important;
}

/* ============================================================================
   Magento page features
   ============================================================================
   The controls the content script injects INTO Magento's own markup. They are
   not primitives: each one sits inside a Magento table cell, field label or
   page title and inherits that box model (its width, margins and
   vertical-align are load-bearing), which is why they stay named features
   instead of becoming \`.mhx-btn\` variants.

   They are also why layer 2 must stay out of the page. The same sheet is on a
   light and a dark admin, and the palette only lands after storage resolves —
   so \`var(--mhx-surface, #fff)\` is not "the page" and not "our panel" either:
   it is the LIGHT palette's surface applied to whatever admin is open. Every
   value below is layer 1 or an opaque surface we own (toast, tooltip), so the
   worst case before the palette arrives is neutral chrome, never a white
   control painted onto a dark page.

   The feature keeps the class names and passes state as a modifier
   (\`--high/--medium/--low\`, \`--all\`, \`--open\`, \`--feedback\`), exactly as the
   simple primitives take \`data-variant\`. Nothing here is written from
   content.ts any more.
   ---------------------------------------------------------------------------- */

/* --- companion chrome for the custom-options editors -----------------------
   This is optional layout wrapped AROUND Magento's own Knockout editors. It
   does not replace the editor's inputs/selects/templates: those remain Magento's
   source of truth (Knockout, validation, Save). The companion only adds:
   - a clear panel separator between the Options table and the Options Items
     table, because both editors render as similar repeat rows and the page
     otherwise blends them;
   - readable labels lifted from the editor row (option name, parent name,
     selected item name) so the row can be scanned without opening every
     dropdown;
   - a compact store chip set per option row when the same store(s) repeat,
     so store assignment stops being one tiny dropdown per row;
   - a search control for long selects (item name, parent) without rewiring
     Magento's own select.

   Everything here is layer 1 (\`--mhx-pg-*\`) plus the one opaque surface we own
   for tooltips/chips that float over the page. No \`--mhx-*\` page chrome.
   ---------------------------------------------------------------------------- */

.mhx-opt-shell {
  box-sizing: border-box;
  margin: 12px 0 16px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  background: var(--mhx-pg-fill);

  /* Design A: the shell gains a contained look and a scroll cap so the whole
     options editor stays glued to the page instead of drifting to the bottom
     of a long form. */
}

.mhx-opt-shell--scroll {
  max-height: 70vh;
  overflow-y: auto;
}

.mhx-opt-panel {
  box-sizing: border-box;
  padding: 10px 12px;
}

.mhx-opt-panel--items {
  border-top: 1px solid var(--mhx-pg-line-soft);
}

.mhx-opt-head-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.mhx-opt-head-tab {
  box-sizing: border-box;
  padding: 4px 10px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  background: transparent;
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  font: var(--mhx-pg-font);
  font-size: 12px;
  cursor: pointer;
}

.mhx-opt-head-tab[data-active="true"] {
  background: var(--mhx-pg-accent);
  color: var(--mhx-pg-on-accent);
  border-color: var(--mhx-pg-accent);
}

.mhx-opt-head-tab[data-active="false"] {
  opacity: 0.7;
}

.mhx-opt-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  font: var(--mhx-pg-font);

  /* Design A: stacked editor bands with a compact tab strip in one band.
     This panel is not the app shell — the extension has its own real UI for
     that — but long custom-options editors still benefit from a contained
     header so the page does not read as a loose list of rows. */
}

.mhx-opt-head strong {
  font-weight: 600;
}

.mhx-opt-head .mhx-opt-count {
  margin-left: auto;
  color: var(--mhx-pg-muted);
  font-size: 12px;
}

.mhx-opt-band {
  box-sizing: border-box;
  margin: 10px 0 12px;
}

/* Row chips: store set + parent link, kept compact so the editor table still
   breathes. */
.mhx-opt-row-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font: var(--mhx-pg-font);
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-opt-store {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: 3px;
  background: var(--mhx-pg-fill);
  color: var(--mhx-pg-muted);
  font-size: 11px;
  line-height: 1.3;
}

.mhx-opt-store strong {
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  font-weight: 600;
}

.mhx-opt-parent {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: 10px;
  background: var(--mhx-pg-fill);
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  font-size: 11px;
  line-height: 1.3;
}

.mhx-opt-parent strong {
  color: var(--mhx-pg-accent);
  font-weight: 600;
}

/* Readable name label lifted from the editor row. */
.mhx-opt-name,
.mhx-opt-item-name {
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  font: var(--mhx-pg-font);
  line-height: 1.35;
}

.mhx-opt-name {
  font-weight: 600;
}

.mhx-opt-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--mhx-pg-line);
  border-radius: 3px;
  background: transparent;
  color: var(--mhx-pg-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.mhx-opt-del:hover {
  color: var(--mhx-pg-danger);
  border-color: var(--mhx-pg-danger);
  background: var(--mhx-pg-danger-wash);
}

/* Search control for long selects (item name / parent). It sits adjacent to
   the row, not on top of Magento's markup. */
.mhx-opt-search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: var(--mhx-pg-font);
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-opt-search {
  grid-column: 1 / -1;
  justify-self: start;
  padding: 0 0 4px;
}

.mhx-opt-search input {
  box-sizing: border-box;
  width: 160px;
  max-width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  background: color-mix(in srgb, currentColor 6%, transparent);
  color: inherit;
}

.mhx-opt-search input:focus-visible {
  outline: none;
  border-color: var(--mhx-pg-accent);
  box-shadow: 0 0 0 1px var(--mhx-pg-accent);
}

.mhx-opt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font: var(--mhx-pg-font);
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  background: var(--mhx-pg-fill);
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
}

.mhx-opt-chip strong {
  font-weight: 600;
  color: var(--mhx-pg-accent);
}

.mhx-opt-chip em {
  color: var(--mhx-pg-muted);
  font-style: normal;
}

.mhx-opt-chip .mhx-opt-chip-close {
  margin-left: 2px;
  padding: 0;
  width: 16px;
  height: 16px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 3px;
}

.mhx-opt-chip .mhx-opt-chip-close:hover {
  background: var(--mhx-pg-fill-hover);
  color: var(--mhx-pg-danger);
}

/* Visibility toggle for the companion row. Kept subtle so Magento's own
   row actions stay the primary delete affordance; this is just a fast
   companion control. */
.mhx-opt-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px dashed var(--mhx-pg-line-soft);
}

.mhx-opt-row:first-child {
  border-top: 0;
}

.mhx-opt-row[data-hidden="true"] {
  display: none;
}

.mhx-opt-row > :last-child {
  justify-self: end;
}

/* A small badge that says which Option an item row belongs to.
   This is a read-only reference line, not a control; it exists only because
   the page already requires a per-row store dropdown to identify the current
   option, and a companion row would otherwise show items with no visible
   context. */
.mhx-opt-belongs {
  color: var(--mhx-pg-muted);
  font-size: 11px;
}

/* --- copy-SKU button (product fields, grid cells) -------------------------- */
.mhx-sku-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 8px;
  padding: 0 6px;
  width: 28px;
  height: 24px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: 2px;
  background: var(--mhx-pg-fill);
  color: inherit;
  cursor: pointer;
  vertical-align: middle;
}

.mhx-sku-copy-btn:hover {
  background: var(--mhx-pg-fill-hover);
  border-color: var(--mhx-pg-line);
}

.mhx-sku-copy-btn:active {
  background: var(--mhx-pg-fill-hover);
}

/* "Copied" flash — the toolkit's ok tone, so it stays legible either way. */
.mhx-sku-copy-btn--feedback {
  color: var(--mhx-pg-ok) !important;
  border-color: var(--mhx-pg-ok) !important;
}

/* The paired control that opens the product: accent outline at rest. */
.mhx-sku-copy-btn--open {
  color: var(--mhx-pg-accent);
  border-color: var(--mhx-pg-accent);
}

.mhx-sku-copy-btn--open:hover {
  background: var(--mhx-pg-accent);
  border-color: var(--mhx-pg-accent);
  color: var(--mhx-pg-on-accent);
}

/* --- store-view quick buttons (EN / ES / FR + Open All) -------------------- */
.mhx-store-buttons {
  display: inline-flex;
  gap: 4px;
  margin-left: 32px;
  align-items: center;
}

/* Outline at rest, filled on hover. The rest state is \`transparent\`, not a
   surface colour: an outline button needs no background of its own, and any
   background we picked here would be wrong on one of the two admins. */
.mhx-store-btn {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--mhx-pg-accent);
  border-radius: 3px;
  background: transparent;
  color: var(--mhx-pg-accent);
  cursor: pointer;
  font-weight: 600;
}

.mhx-store-btn:hover {
  background: var(--mhx-pg-accent);
  color: var(--mhx-pg-on-accent);
}

/* "Open All": solid, and deliberately NOT the accent — it is the one button
   here that acts on every store, so it reads as attention, not as selection. */
.mhx-store-btn--all {
  border-color: var(--mhx-pg-warn);
  background: var(--mhx-pg-warn);
  color: var(--mhx-pg-on-solid);
}

.mhx-store-btn--all:hover {
  background: var(--mhx-pg-warn-strong);
  border-color: var(--mhx-pg-warn-strong);
}

/* --- open every size of one colour ----------------------------------------- */
.mhx-open-sizes-btn {
  margin-left: 4px;
  padding: 2px 6px;
  font-size: 11px;
  border: 1px solid var(--mhx-pg-accent);
  border-radius: 3px;
  background: var(--mhx-pg-accent);
  color: var(--mhx-pg-on-accent);
  cursor: pointer;
  font-weight: 600;
}

.mhx-open-sizes-btn:hover {
  background: var(--mhx-pg-accent-strong);
  border-color: var(--mhx-pg-accent-strong);
}

/* --- error indicator (priority dot beside a field label) --------------------
   Priority is carried by the ring and the glyph; the background is only a
   wash over whatever the page is, so the indicator keeps its meaning on a
   light and a dark admin without a pastel chip that only works on one. */
.mhx-error-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  margin-left: 6px;
  cursor: help;
  position: relative;
  vertical-align: middle;
  flex-shrink: 0;
}

.mhx-error-indicator svg {
  width: 14px;
  height: 14px;
}

.mhx-error-indicator--high {
  background: var(--mhx-pg-danger-wash);
  color: var(--mhx-pg-danger);
  border: 1px solid var(--mhx-pg-danger);
}

.mhx-error-indicator--medium {
  background: var(--mhx-pg-warn-wash);
  color: var(--mhx-pg-warn);
  border: 1px solid var(--mhx-pg-warn);
}

.mhx-error-indicator--low {
  background: var(--mhx-pg-caution-wash);
  color: var(--mhx-pg-caution);
  border: 1px solid var(--mhx-pg-caution);
}

/* Tooltip: opaque, because it floats over the page (same reasoning as the
   toast) and nothing about the page tells us what would contrast with it. */
.mhx-error-indicator:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 10px;
  background: var(--mhx-pg-tip-bg);
  color: var(--mhx-pg-tip-ink);
  font-size: 11px;
  font-weight: 400;
  white-space: normal;
  max-width: 300px;
  text-align: left;
  line-height: 1.4;
  border-radius: 3px;
  z-index: 10000;
  margin-bottom: 4px;
}

/* D2: host class drives display — reversible on indicator clear (no inline
   styles on Magento's own labels). */
.mhx-error-label-host {
  display: inline-flex;
  align-items: center;
}

.mhx-error-label--high label,
.mhx-error-label--high .admin__field-label,
.mhx-error-label--high .admin_field-label {
  color: var(--mhx-pg-danger) !important;
  font-weight: 700 !important;
}

.mhx-error-label--medium label,
.mhx-error-label--medium .admin__field-label,
.mhx-error-label--medium .admin_field-label {
  color: var(--mhx-pg-warn) !important;
  font-weight: 700 !important;
}

.mhx-error-label--low label,
.mhx-error-label--low .admin__field-label,
.mhx-error-label--low .admin_field-label {
  color: var(--mhx-pg-caution) !important;
  font-weight: 700 !important;
}

/* --- "copy all SKUs" button in a grid toolbar ------------------------------ */
.mhx-grid-copy-wrap {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin-left: 8px;
  vertical-align: middle;
}

.mhx-grid-copy-all {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--mhx-pg-accent);
  border-radius: 3px;
  background: var(--mhx-pg-accent);
  color: var(--mhx-pg-on-accent);
  cursor: pointer;
  vertical-align: middle;
  white-space: nowrap;
}

.mhx-grid-copy-all:hover {
  background: var(--mhx-pg-accent-strong);
  border-color: var(--mhx-pg-accent-strong);
}

.mhx-grid-copy-all svg {
  width: 14px;
  height: 14px;
  display: block;
}

.mhx-grid-copy-all.mhx-sku-copy-btn--feedback {
  background: var(--mhx-pg-ok) !important;
  border-color: var(--mhx-pg-ok) !important;
  color: var(--mhx-pg-on-solid) !important;
}

/* --- product-type badge (page title + SKU label) --------------------------- */
/* The type is the point, so the hue sits in the wash and the ring while the
   text stays the page's own ink. A filled pastel chip would only be legible on
   the admin it was picked for. */
.mhx-product-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 12px;
  line-height: 1.2;
  vertical-align: middle;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: inherit;
}

.mhx-product-type-badge--title {
  margin-left: 12px;
  font-size: 12px;
  padding: 3px 10px;
}

.mhx-product-type-badge--sku {
  margin-left: 8px;
  font-size: 10px;
  padding: 1px 6px;
}

.mhx-product-type-badge--configurable {
  background: var(--mhx-pg-info-wash);
  border: 1px solid rgba(3, 105, 161, 0.45);
  border: 1px solid color-mix(in srgb, var(--mhx-pg-info) 45%, transparent);
}

.mhx-product-type-badge--simple {
  background: var(--mhx-pg-ok-wash);
  border: 1px solid rgba(22, 163, 74, 0.45);
  border: 1px solid color-mix(in srgb, var(--mhx-pg-ok) 45%, transparent);
}

/* ----------------------------------------------------------------------------
   Options editor: per-language companion row + option-item groups
   (src/page/features/options-companion, src/page/features/options-items)

   These replace the inline styles the features used to write with
   \`style.cssText\`. Nothing here hardcodes a surface or an ink colour: the row
   inherits the admin's own colour and only tints with layer-1 tokens, so it
   reads on a light and on a dark Magento admin alike.
   -------------------------------------------------------------------------- */

.mhx-opt-lang-row > .mhx-opt-lang-cell {
  padding: 4px 12px 8px;
  border-bottom: 2px solid var(--mhx-pg-line-soft);
  background: var(--mhx-pg-fill);
}

.mhx-opt-lang-wrap {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.mhx-opt-lang-grid {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  align-items: flex-end;
  gap: 8px;
  overflow: visible;
}

.mhx-opt-lang-field {
  display: flex;
  flex: 1;
  min-width: 100px;
  flex-direction: column;
  gap: 2px;
}

.mhx-opt-lang-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: currentColor;
  opacity: 0.55;
}

.mhx-opt-lang-input {
  box-sizing: border-box;
  width: 100%;
  padding: 4px 7px;
  font: inherit;
  font-size: 12px;
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  background: var(--mhx-pg-fill);
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
}

.mhx-opt-lang-input:focus-visible {
  outline: none;
  border-color: var(--mhx-pg-accent);
  box-shadow: 0 0 0 1px var(--mhx-pg-accent);
}

.mhx-opt-lang-input--off {
  opacity: 0.3;
}

.mhx-opt-lang-input--sort {
  width: 60px;
  text-align: center;
}

.mhx-opt-lang-sortcell {
  display: flex;
  width: 60px;
  flex-shrink: 0;
  flex-direction: column;
  gap: 2px;
}

.mhx-opt-lang-del {
  margin-left: 4px;
  align-self: flex-end;
  flex-shrink: 0;
}

/* The Original / Lang-fields switch above the options table. */
.mhx-opt-mode-btn {
  margin: 6px 0 4px;
  padding: 4px 12px;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
  background: var(--mhx-pg-fill);
  border: 1px solid var(--mhx-pg-line-strong, var(--mhx-pg-line));
  border-radius: var(--mhx-pg-radius);
  cursor: pointer;
}

.mhx-opt-mode-btn:hover {
  background: var(--mhx-pg-fill-hover);
}

.mhx-opt-group-head {
  cursor: pointer;
  user-select: none;
  background: var(--mhx-pg-fill);
}

.mhx-opt-group-head:hover {
  background: var(--mhx-pg-fill-hover);
}

.mhx-opt-group-title {
  padding: 6px 12px;
  font-weight: 700;
  font-size: 13px;
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-opt-group-arrow {
  margin-right: 6px;
  font-size: 11px;
}

.mhx-opt-group-count {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.55;
}

/* Group header: left label + right action buttons */
.mhx-opt-group-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
}

.mhx-opt-group-left {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-size: 13px;
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-opt-group-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.mhx-opt-group-head:hover .mhx-opt-group-actions {
  opacity: 1;
}

.mhx-opt-group-add,
.mhx-opt-group-del {
  padding: 2px 8px;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  border-radius: var(--mhx-pg-radius);
  cursor: pointer;
  border: 1px solid var(--mhx-pg-line-strong, var(--mhx-pg-line));
  background: var(--mhx-pg-fill);
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-opt-group-add:hover {
  background: var(--mhx-pg-fill-hover);
  border-color: var(--mhx-pg-accent);
  color: var(--mhx-pg-accent);
}

.mhx-opt-group-del:hover {
  background: var(--mhx-pg-fill-hover);
  border-color: #c00;
  color: #c00;
}

/* Options Items parallel panel */
.mhx-items-panel {
  width: 100%;
  box-sizing: border-box;
}

.mhx-items-group {
  margin-bottom: 4px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  overflow: hidden;
}

.mhx-items-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--mhx-pg-fill);
  cursor: pointer;
  user-select: none;
}

.mhx-items-group-head:hover {
  background: var(--mhx-pg-fill-hover);
}

.mhx-items-group-head:hover .mhx-opt-group-actions {
  opacity: 1;
}

.mhx-items-rows {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.mhx-items-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--mhx-pg-line-soft, var(--mhx-pg-line));
}

.mhx-items-row:hover {
  background: var(--mhx-pg-fill);
}

.mhx-items-name-sel {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 13px;
  padding: 3px 6px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  background: var(--mhx-pg-fill);
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-items-sv-sel {
  width: 60px;
  flex-shrink: 0;
  font: inherit;
  font-size: 12px;
  padding: 3px 4px;
  border: 1px solid var(--mhx-pg-line);
  border-radius: var(--mhx-pg-radius);
  background: var(--mhx-pg-fill);
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-items-del-row {
  flex-shrink: 0;
  padding: 3px 6px;
  font-size: 13px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--mhx-pg-radius);
  cursor: pointer;
  opacity: 0.4;
  color: var(--mhx-pg-page-ink, var(--mhx-pg-ink));
}

.mhx-items-row:hover .mhx-items-del-row {
  opacity: 1;
  border-color: var(--mhx-pg-line);
}

.mhx-items-del-row:hover {
  color: #c00;
  border-color: #c00 !important;
}
`;
