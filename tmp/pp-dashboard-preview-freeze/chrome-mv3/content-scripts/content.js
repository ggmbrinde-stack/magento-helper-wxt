var content=(function(){"use strict";var jm=Object.defineProperty;var Zm=(ke,fe,Z)=>fe in ke?jm(ke,fe,{enumerable:!0,configurable:!0,writable:!0,value:Z}):ke[fe]=Z;var q=(ke,fe,Z)=>Zm(ke,typeof fe!="symbol"?fe+"":fe,Z);var ki,Li,Ni,Ri;const ke=`/* ============================================================================
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
`,fe={close:"M4 4 12 12 M12 4 4 12",check:"M2 8.5 6 12.5 14 4.5 12.5 3 6 9.5 3.5 7z",copy:"M8 5h7v10H8z M5 8H3V2h9v3",externalLink:"M10 2h4v4 M14 2 7 9 M12 8v6H2V4h6",chevronDown:"M3 6.5h10L10 11 4 6.5V3h2V6.5z",chevronRight:"M7 3l5 5-5 5V3z"};function Z(t){const e=document.createElement("button");e.type="button",e.className=t.className?`mhx-btn ${t.className}`:"mhx-btn";const n=t.variant??"default";return n!=="default"&&(e.dataset.variant=n),e.textContent=t.label,t.title&&(e.title=t.title),n==="icon"&&!t.label&&e.setAttribute("aria-label",t.title??"Action"),t.disabled&&(e.disabled=!0),t.onClick&&e.addEventListener("click",t.onClick),t.icon&&n==="icon"&&e.prepend(Pi(t.icon)),e}function Pi(t){const e="http://www.w3.org/2000/svg",n=document.createElementNS(e,"svg");n.setAttribute("width","16"),n.setAttribute("height","16"),n.setAttribute("viewBox","0 0 16 16"),n.setAttribute("fill","currentColor"),n.setAttribute("class","mhx-icon");const r=document.createElementNS(e,"path");return r.setAttribute("d",fe[t]),(t==="close"||t==="copy"||t==="externalLink")&&(r.setAttribute("fill","none"),r.setAttribute("stroke","currentColor"),r.setAttribute("stroke-width","1.8"),r.setAttribute("stroke-linecap","round")),n.appendChild(r),n}function Mi(t,e={}){const n=document.createElement("div");return n.className=e.wrap?"mhx-group mhx-group--wrap":"mhx-group",e.label&&(n.setAttribute("role","group"),n.setAttribute("aria-label",e.label)),n.append(...t),n}function Di(t,e){const n=document.createElement("div");return n.className="mhx-bar",n.setAttribute("role","group"),n.setAttribute("aria-label",e),n.append(...t),n}function Dr(t,e={}){const n=document.createElement("span");return n.className="mhx-badge",e.tone&&(n.dataset.tone=e.tone),n.textContent=t,e.title&&(n.title=e.title),n}function Ui(t){const e=document.createElement("div");e.className="mhx-seg",e.setAttribute("role","group"),e.setAttribute("aria-label",t.label);for(const n of t.options){const r=document.createElement("button");r.type="button",r.className="mhx-seg-btn",r.dataset.value=n.value;const a=n.value===t.active;a&&r.classList.add("mhx-seg-btn--active"),r.setAttribute("aria-pressed",a?"true":"false"),r.textContent=n.label,n.title&&(r.title=n.title),r.addEventListener("click",()=>t.onPick(n.value)),e.append(r)}return e}function Bi(t,e={}){const n=document.createElement("div");return n.className="mhx-pop",e.label&&n.setAttribute("aria-label",e.label),n.append(...t),n}const qi="mhx-ui-link",un="mhx-ui";let vt=null;function $i(){var t;try{const e=(t=globalThis.chrome)==null?void 0:t.runtime;return e!=null&&e.getURL?e.getURL("ui/toolkit.css"):null}catch{return null}}function Ur(){if(document.getElementById(un))return;const t=document.createElement("style");t.id=un,t.textContent=ke,(document.head??document.documentElement).appendChild(t)}function Le(){if(typeof document>"u"||document.getElementById(un))return Promise.resolve();if(vt)return vt;const t=$i();return t?(vt=new Promise(e=>{const n=document.createElement("link");n.id=qi,n.rel="stylesheet",n.href=t;let r=!1;const a=o=>{r||(r=!0,o&&(n.remove(),Ur()),e())};n.addEventListener("error",()=>a(!0),{once:!0}),n.addEventListener("load",()=>a(!n.sheet),{once:!0}),(document.head??document.documentElement).appendChild(n)}),vt):(Ur(),Promise.resolve())}var U;(function(t){t.assertEqual=a=>{};function e(a){}t.assertIs=e;function n(a){throw new Error}t.assertNever=n,t.arrayToEnum=a=>{const o={};for(const i of a)o[i]=i;return o},t.getValidEnumValues=a=>{const o=t.objectKeys(a).filter(s=>typeof a[a[s]]!="number"),i={};for(const s of o)i[s]=a[s];return t.objectValues(i)},t.objectValues=a=>t.objectKeys(a).map(function(o){return a[o]}),t.objectKeys=typeof Object.keys=="function"?a=>Object.keys(a):a=>{const o=[];for(const i in a)Object.prototype.hasOwnProperty.call(a,i)&&o.push(i);return o},t.find=(a,o)=>{for(const i of a)if(o(i))return i},t.isInteger=typeof Number.isInteger=="function"?a=>Number.isInteger(a):a=>typeof a=="number"&&Number.isFinite(a)&&Math.floor(a)===a;function r(a,o=" | "){return a.map(i=>typeof i=="string"?`'${i}'`:i).join(o)}t.joinValues=r,t.jsonStringifyReplacer=(a,o)=>typeof o=="bigint"?o.toString():o})(U||(U={}));var Br;(function(t){t.mergeShapes=(e,n)=>({...e,...n})})(Br||(Br={}));const y=U.arrayToEnum(["string","nan","number","integer","float","boolean","date","bigint","symbol","function","undefined","null","array","object","unknown","promise","void","never","map","set"]),Se=t=>{switch(typeof t){case"undefined":return y.undefined;case"string":return y.string;case"number":return Number.isNaN(t)?y.nan:y.number;case"boolean":return y.boolean;case"function":return y.function;case"bigint":return y.bigint;case"symbol":return y.symbol;case"object":return Array.isArray(t)?y.array:t===null?y.null:t.then&&typeof t.then=="function"&&t.catch&&typeof t.catch=="function"?y.promise:typeof Map<"u"&&t instanceof Map?y.map:typeof Set<"u"&&t instanceof Set?y.set:typeof Date<"u"&&t instanceof Date?y.date:y.object;default:return y.unknown}},S=U.arrayToEnum(["invalid_type","invalid_literal","custom","invalid_union","invalid_union_discriminator","invalid_enum_value","unrecognized_keys","invalid_arguments","invalid_return_type","invalid_date","invalid_string","too_small","too_big","invalid_intersection_types","not_multiple_of","not_finite"]);class ge extends Error{get errors(){return this.issues}constructor(e){super(),this.issues=[],this.addIssue=r=>{this.issues=[...this.issues,r]},this.addIssues=(r=[])=>{this.issues=[...this.issues,...r]};const n=new.target.prototype;Object.setPrototypeOf?Object.setPrototypeOf(this,n):this.__proto__=n,this.name="ZodError",this.issues=e}format(e){const n=e||function(o){return o.message},r={_errors:[]},a=o=>{for(const i of o.issues)if(i.code==="invalid_union")i.unionErrors.map(a);else if(i.code==="invalid_return_type")a(i.returnTypeError);else if(i.code==="invalid_arguments")a(i.argumentsError);else if(i.path.length===0)r._errors.push(n(i));else{let s=r,c=0;for(;c<i.path.length;){const l=i.path[c];c===i.path.length-1?(s[l]=s[l]||{_errors:[]},s[l]._errors.push(n(i))):s[l]=s[l]||{_errors:[]},s=s[l],c++}}};return a(this),r}static assert(e){if(!(e instanceof ge))throw new Error(`Not a ZodError: ${e}`)}toString(){return this.message}get message(){return JSON.stringify(this.issues,U.jsonStringifyReplacer,2)}get isEmpty(){return this.issues.length===0}flatten(e=n=>n.message){const n={},r=[];for(const a of this.issues)if(a.path.length>0){const o=a.path[0];n[o]=n[o]||[],n[o].push(e(a))}else r.push(e(a));return{formErrors:r,fieldErrors:n}}get formErrors(){return this.flatten()}}ge.create=t=>new ge(t);const mn=(t,e)=>{let n;switch(t.code){case S.invalid_type:t.received===y.undefined?n="Required":n=`Expected ${t.expected}, received ${t.received}`;break;case S.invalid_literal:n=`Invalid literal value, expected ${JSON.stringify(t.expected,U.jsonStringifyReplacer)}`;break;case S.unrecognized_keys:n=`Unrecognized key(s) in object: ${U.joinValues(t.keys,", ")}`;break;case S.invalid_union:n="Invalid input";break;case S.invalid_union_discriminator:n=`Invalid discriminator value. Expected ${U.joinValues(t.options)}`;break;case S.invalid_enum_value:n=`Invalid enum value. Expected ${U.joinValues(t.options)}, received '${t.received}'`;break;case S.invalid_arguments:n="Invalid function arguments";break;case S.invalid_return_type:n="Invalid function return type";break;case S.invalid_date:n="Invalid date";break;case S.invalid_string:typeof t.validation=="object"?"includes"in t.validation?(n=`Invalid input: must include "${t.validation.includes}"`,typeof t.validation.position=="number"&&(n=`${n} at one or more positions greater than or equal to ${t.validation.position}`)):"startsWith"in t.validation?n=`Invalid input: must start with "${t.validation.startsWith}"`:"endsWith"in t.validation?n=`Invalid input: must end with "${t.validation.endsWith}"`:U.assertNever(t.validation):t.validation!=="regex"?n=`Invalid ${t.validation}`:n="Invalid";break;case S.too_small:t.type==="array"?n=`Array must contain ${t.exact?"exactly":t.inclusive?"at least":"more than"} ${t.minimum} element(s)`:t.type==="string"?n=`String must contain ${t.exact?"exactly":t.inclusive?"at least":"over"} ${t.minimum} character(s)`:t.type==="number"?n=`Number must be ${t.exact?"exactly equal to ":t.inclusive?"greater than or equal to ":"greater than "}${t.minimum}`:t.type==="bigint"?n=`Number must be ${t.exact?"exactly equal to ":t.inclusive?"greater than or equal to ":"greater than "}${t.minimum}`:t.type==="date"?n=`Date must be ${t.exact?"exactly equal to ":t.inclusive?"greater than or equal to ":"greater than "}${new Date(Number(t.minimum))}`:n="Invalid input";break;case S.too_big:t.type==="array"?n=`Array must contain ${t.exact?"exactly":t.inclusive?"at most":"less than"} ${t.maximum} element(s)`:t.type==="string"?n=`String must contain ${t.exact?"exactly":t.inclusive?"at most":"under"} ${t.maximum} character(s)`:t.type==="number"?n=`Number must be ${t.exact?"exactly":t.inclusive?"less than or equal to":"less than"} ${t.maximum}`:t.type==="bigint"?n=`BigInt must be ${t.exact?"exactly":t.inclusive?"less than or equal to":"less than"} ${t.maximum}`:t.type==="date"?n=`Date must be ${t.exact?"exactly":t.inclusive?"smaller than or equal to":"smaller than"} ${new Date(Number(t.maximum))}`:n="Invalid input";break;case S.custom:n="Invalid input";break;case S.invalid_intersection_types:n="Intersection results could not be merged";break;case S.not_multiple_of:n=`Number must be a multiple of ${t.multipleOf}`;break;case S.not_finite:n="Number must be finite";break;default:n=e.defaultError,U.assertNever(t)}return{message:n}};let Hi=mn;function Vi(){return Hi}const Fi=t=>{const{data:e,path:n,errorMaps:r,issueData:a}=t,o=[...n,...a.path||[]],i={...a,path:o};if(a.message!==void 0)return{...a,path:o,message:a.message};let s="";const c=r.filter(l=>!!l).slice().reverse();for(const l of c)s=l(i,{data:e,defaultError:s}).message;return{...a,path:o,message:s}};function E(t,e){const n=Vi(),r=Fi({issueData:e,data:t.data,path:t.path,errorMaps:[t.common.contextualErrorMap,t.schemaErrorMap,n,n===mn?void 0:mn].filter(a=>!!a)});t.common.issues.push(r)}class J{constructor(){this.value="valid"}dirty(){this.value==="valid"&&(this.value="dirty")}abort(){this.value!=="aborted"&&(this.value="aborted")}static mergeArray(e,n){const r=[];for(const a of n){if(a.status==="aborted")return k;a.status==="dirty"&&e.dirty(),r.push(a.value)}return{status:e.value,value:r}}static async mergeObjectAsync(e,n){const r=[];for(const a of n){const o=await a.key,i=await a.value;r.push({key:o,value:i})}return J.mergeObjectSync(e,r)}static mergeObjectSync(e,n){const r={};for(const a of n){const{key:o,value:i}=a;if(o.status==="aborted"||i.status==="aborted")return k;o.status==="dirty"&&e.dirty(),i.status==="dirty"&&e.dirty(),o.value!=="__proto__"&&(typeof i.value<"u"||a.alwaysSet)&&(r[o.value]=i.value)}return{status:e.value,value:r}}}const k=Object.freeze({status:"aborted"}),Qe=t=>({status:"dirty",value:t}),ie=t=>({status:"valid",value:t}),qr=t=>t.status==="aborted",$r=t=>t.status==="dirty",qe=t=>t.status==="valid",Ct=t=>typeof Promise<"u"&&t instanceof Promise;var v;(function(t){t.errToObj=e=>typeof e=="string"?{message:e}:e||{},t.toString=e=>typeof e=="string"?e:e==null?void 0:e.message})(v||(v={}));class Ee{constructor(e,n,r,a){this._cachedPath=[],this.parent=e,this.data=n,this._path=r,this._key=a}get path(){return this._cachedPath.length||(Array.isArray(this._key)?this._cachedPath.push(...this._path,...this._key):this._cachedPath.push(...this._path,this._key)),this._cachedPath}}const Hr=(t,e)=>{if(qe(e))return{success:!0,data:e.value};if(!t.common.issues.length)throw new Error("Validation failed but no issues detected.");return{success:!1,get error(){if(this._error)return this._error;const n=new ge(t.common.issues);return this._error=n,this._error}}};function P(t){if(!t)return{};const{errorMap:e,invalid_type_error:n,required_error:r,description:a}=t;if(e&&(n||r))throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);return e?{errorMap:e,description:a}:{errorMap:(i,s)=>{const{message:c}=t;return i.code==="invalid_enum_value"?{message:c??s.defaultError}:typeof s.data>"u"?{message:c??r??s.defaultError}:i.code!=="invalid_type"?{message:s.defaultError}:{message:c??n??s.defaultError}},description:a}}class D{get description(){return this._def.description}_getType(e){return Se(e.data)}_getOrReturnCtx(e,n){return n||{common:e.parent.common,data:e.data,parsedType:Se(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}_processInputParams(e){return{status:new J,ctx:{common:e.parent.common,data:e.data,parsedType:Se(e.data),schemaErrorMap:this._def.errorMap,path:e.path,parent:e.parent}}}_parseSync(e){const n=this._parse(e);if(Ct(n))throw new Error("Synchronous parse encountered promise.");return n}_parseAsync(e){const n=this._parse(e);return Promise.resolve(n)}parse(e,n){const r=this.safeParse(e,n);if(r.success)return r.data;throw r.error}safeParse(e,n){const r={common:{issues:[],async:(n==null?void 0:n.async)??!1,contextualErrorMap:n==null?void 0:n.errorMap},path:(n==null?void 0:n.path)||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:Se(e)},a=this._parseSync({data:e,path:r.path,parent:r});return Hr(r,a)}"~validate"(e){var r,a;const n={common:{issues:[],async:!!this["~standard"].async},path:[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:Se(e)};if(!this["~standard"].async)try{const o=this._parseSync({data:e,path:[],parent:n});return qe(o)?{value:o.value}:{issues:n.common.issues}}catch(o){(a=(r=o==null?void 0:o.message)==null?void 0:r.toLowerCase())!=null&&a.includes("encountered")&&(this["~standard"].async=!0),n.common={issues:[],async:!0}}return this._parseAsync({data:e,path:[],parent:n}).then(o=>qe(o)?{value:o.value}:{issues:n.common.issues})}async parseAsync(e,n){const r=await this.safeParseAsync(e,n);if(r.success)return r.data;throw r.error}async safeParseAsync(e,n){const r={common:{issues:[],contextualErrorMap:n==null?void 0:n.errorMap,async:!0},path:(n==null?void 0:n.path)||[],schemaErrorMap:this._def.errorMap,parent:null,data:e,parsedType:Se(e)},a=this._parse({data:e,path:r.path,parent:r}),o=await(Ct(a)?a:Promise.resolve(a));return Hr(r,o)}refine(e,n){const r=a=>typeof n=="string"||typeof n>"u"?{message:n}:typeof n=="function"?n(a):n;return this._refinement((a,o)=>{const i=e(a),s=()=>o.addIssue({code:S.custom,...r(a)});return typeof Promise<"u"&&i instanceof Promise?i.then(c=>c?!0:(s(),!1)):i?!0:(s(),!1)})}refinement(e,n){return this._refinement((r,a)=>e(r)?!0:(a.addIssue(typeof n=="function"?n(r,a):n),!1))}_refinement(e){return new Fe({schema:this,typeName:L.ZodEffects,effect:{type:"refinement",refinement:e}})}superRefine(e){return this._refinement(e)}constructor(e){this.spa=this.safeParseAsync,this._def=e,this.parse=this.parse.bind(this),this.safeParse=this.safeParse.bind(this),this.parseAsync=this.parseAsync.bind(this),this.safeParseAsync=this.safeParseAsync.bind(this),this.spa=this.spa.bind(this),this.refine=this.refine.bind(this),this.refinement=this.refinement.bind(this),this.superRefine=this.superRefine.bind(this),this.optional=this.optional.bind(this),this.nullable=this.nullable.bind(this),this.nullish=this.nullish.bind(this),this.array=this.array.bind(this),this.promise=this.promise.bind(this),this.or=this.or.bind(this),this.and=this.and.bind(this),this.transform=this.transform.bind(this),this.brand=this.brand.bind(this),this.default=this.default.bind(this),this.catch=this.catch.bind(this),this.describe=this.describe.bind(this),this.pipe=this.pipe.bind(this),this.readonly=this.readonly.bind(this),this.isNullable=this.isNullable.bind(this),this.isOptional=this.isOptional.bind(this),this["~standard"]={version:1,vendor:"zod",validate:n=>this["~validate"](n)}}optional(){return Ce.create(this,this._def)}nullable(){return ze.create(this,this._def)}nullish(){return this.nullable().optional()}array(){return le.create(this)}promise(){return Ot.create(this,this._def)}or(e){return wt.create([this,e],this._def)}and(e){return _t.create(this,e,this._def)}transform(e){return new Fe({...P(this._def),schema:this,typeName:L.ZodEffects,effect:{type:"transform",transform:e}})}default(e){const n=typeof e=="function"?e:()=>e;return new fn({...P(this._def),innerType:this,defaultValue:n,typeName:L.ZodDefault})}brand(){return new ms({typeName:L.ZodBranded,type:this,...P(this._def)})}catch(e){const n=typeof e=="function"?e:()=>e;return new gn({...P(this._def),innerType:this,catchValue:n,typeName:L.ZodCatch})}describe(e){const n=this.constructor;return new n({...this._def,description:e})}pipe(e){return xn.create(this,e)}readonly(){return bn.create(this)}isOptional(){return this.safeParse(void 0).success}isNullable(){return this.safeParse(null).success}}const zi=/^c[^\s-]{8,}$/i,Gi=/^[0-9a-z]+$/,ji=/^[0-9A-HJKMNP-TV-Z]{26}$/i,Zi=/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i,Ki=/^[a-z0-9_-]{21}$/i,Wi=/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,Yi=/^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/,Xi=/^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i,Ji="^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";let pn;const Qi=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,es=/^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,ts=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/,ns=/^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,rs=/^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,as=/^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,Vr="((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))",os=new RegExp(`^${Vr}$`);function Fr(t){let e="[0-5]\\d";t.precision?e=`${e}\\.\\d{${t.precision}}`:t.precision==null&&(e=`${e}(\\.\\d+)?`);const n=t.precision?"+":"?";return`([01]\\d|2[0-3]):[0-5]\\d(:${e})${n}`}function is(t){return new RegExp(`^${Fr(t)}$`)}function ss(t){let e=`${Vr}T${Fr(t)}`;const n=[];return n.push(t.local?"Z?":"Z"),t.offset&&n.push("([+-]\\d{2}:?\\d{2})"),e=`${e}(${n.join("|")})`,new RegExp(`^${e}$`)}function cs(t,e){return!!((e==="v4"||!e)&&Qi.test(t)||(e==="v6"||!e)&&ts.test(t))}function ls(t,e){if(!Wi.test(t))return!1;try{const[n]=t.split(".");if(!n)return!1;const r=n.replace(/-/g,"+").replace(/_/g,"/").padEnd(n.length+(4-n.length%4)%4,"="),a=JSON.parse(atob(r));return!(typeof a!="object"||a===null||"typ"in a&&(a==null?void 0:a.typ)!=="JWT"||!a.alg||e&&a.alg!==e)}catch{return!1}}function ds(t,e){return!!((e==="v4"||!e)&&es.test(t)||(e==="v6"||!e)&&ns.test(t))}class ye extends D{_parse(e){if(this._def.coerce&&(e.data=String(e.data)),this._getType(e)!==y.string){const o=this._getOrReturnCtx(e);return E(o,{code:S.invalid_type,expected:y.string,received:o.parsedType}),k}const r=new J;let a;for(const o of this._def.checks)if(o.kind==="min")e.data.length<o.value&&(a=this._getOrReturnCtx(e,a),E(a,{code:S.too_small,minimum:o.value,type:"string",inclusive:!0,exact:!1,message:o.message}),r.dirty());else if(o.kind==="max")e.data.length>o.value&&(a=this._getOrReturnCtx(e,a),E(a,{code:S.too_big,maximum:o.value,type:"string",inclusive:!0,exact:!1,message:o.message}),r.dirty());else if(o.kind==="length"){const i=e.data.length>o.value,s=e.data.length<o.value;(i||s)&&(a=this._getOrReturnCtx(e,a),i?E(a,{code:S.too_big,maximum:o.value,type:"string",inclusive:!0,exact:!0,message:o.message}):s&&E(a,{code:S.too_small,minimum:o.value,type:"string",inclusive:!0,exact:!0,message:o.message}),r.dirty())}else if(o.kind==="email")Xi.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"email",code:S.invalid_string,message:o.message}),r.dirty());else if(o.kind==="emoji")pn||(pn=new RegExp(Ji,"u")),pn.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"emoji",code:S.invalid_string,message:o.message}),r.dirty());else if(o.kind==="uuid")Zi.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"uuid",code:S.invalid_string,message:o.message}),r.dirty());else if(o.kind==="nanoid")Ki.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"nanoid",code:S.invalid_string,message:o.message}),r.dirty());else if(o.kind==="cuid")zi.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"cuid",code:S.invalid_string,message:o.message}),r.dirty());else if(o.kind==="cuid2")Gi.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"cuid2",code:S.invalid_string,message:o.message}),r.dirty());else if(o.kind==="ulid")ji.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"ulid",code:S.invalid_string,message:o.message}),r.dirty());else if(o.kind==="url")try{new URL(e.data)}catch{a=this._getOrReturnCtx(e,a),E(a,{validation:"url",code:S.invalid_string,message:o.message}),r.dirty()}else o.kind==="regex"?(o.regex.lastIndex=0,o.regex.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"regex",code:S.invalid_string,message:o.message}),r.dirty())):o.kind==="trim"?e.data=e.data.trim():o.kind==="includes"?e.data.includes(o.value,o.position)||(a=this._getOrReturnCtx(e,a),E(a,{code:S.invalid_string,validation:{includes:o.value,position:o.position},message:o.message}),r.dirty()):o.kind==="toLowerCase"?e.data=e.data.toLowerCase():o.kind==="toUpperCase"?e.data=e.data.toUpperCase():o.kind==="startsWith"?e.data.startsWith(o.value)||(a=this._getOrReturnCtx(e,a),E(a,{code:S.invalid_string,validation:{startsWith:o.value},message:o.message}),r.dirty()):o.kind==="endsWith"?e.data.endsWith(o.value)||(a=this._getOrReturnCtx(e,a),E(a,{code:S.invalid_string,validation:{endsWith:o.value},message:o.message}),r.dirty()):o.kind==="datetime"?ss(o).test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{code:S.invalid_string,validation:"datetime",message:o.message}),r.dirty()):o.kind==="date"?os.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{code:S.invalid_string,validation:"date",message:o.message}),r.dirty()):o.kind==="time"?is(o).test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{code:S.invalid_string,validation:"time",message:o.message}),r.dirty()):o.kind==="duration"?Yi.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"duration",code:S.invalid_string,message:o.message}),r.dirty()):o.kind==="ip"?cs(e.data,o.version)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"ip",code:S.invalid_string,message:o.message}),r.dirty()):o.kind==="jwt"?ls(e.data,o.alg)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"jwt",code:S.invalid_string,message:o.message}),r.dirty()):o.kind==="cidr"?ds(e.data,o.version)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"cidr",code:S.invalid_string,message:o.message}),r.dirty()):o.kind==="base64"?rs.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"base64",code:S.invalid_string,message:o.message}),r.dirty()):o.kind==="base64url"?as.test(e.data)||(a=this._getOrReturnCtx(e,a),E(a,{validation:"base64url",code:S.invalid_string,message:o.message}),r.dirty()):U.assertNever(o);return{status:r.value,value:e.data}}_regex(e,n,r){return this.refinement(a=>e.test(a),{validation:n,code:S.invalid_string,...v.errToObj(r)})}_addCheck(e){return new ye({...this._def,checks:[...this._def.checks,e]})}email(e){return this._addCheck({kind:"email",...v.errToObj(e)})}url(e){return this._addCheck({kind:"url",...v.errToObj(e)})}emoji(e){return this._addCheck({kind:"emoji",...v.errToObj(e)})}uuid(e){return this._addCheck({kind:"uuid",...v.errToObj(e)})}nanoid(e){return this._addCheck({kind:"nanoid",...v.errToObj(e)})}cuid(e){return this._addCheck({kind:"cuid",...v.errToObj(e)})}cuid2(e){return this._addCheck({kind:"cuid2",...v.errToObj(e)})}ulid(e){return this._addCheck({kind:"ulid",...v.errToObj(e)})}base64(e){return this._addCheck({kind:"base64",...v.errToObj(e)})}base64url(e){return this._addCheck({kind:"base64url",...v.errToObj(e)})}jwt(e){return this._addCheck({kind:"jwt",...v.errToObj(e)})}ip(e){return this._addCheck({kind:"ip",...v.errToObj(e)})}cidr(e){return this._addCheck({kind:"cidr",...v.errToObj(e)})}datetime(e){return typeof e=="string"?this._addCheck({kind:"datetime",precision:null,offset:!1,local:!1,message:e}):this._addCheck({kind:"datetime",precision:typeof(e==null?void 0:e.precision)>"u"?null:e==null?void 0:e.precision,offset:(e==null?void 0:e.offset)??!1,local:(e==null?void 0:e.local)??!1,...v.errToObj(e==null?void 0:e.message)})}date(e){return this._addCheck({kind:"date",message:e})}time(e){return typeof e=="string"?this._addCheck({kind:"time",precision:null,message:e}):this._addCheck({kind:"time",precision:typeof(e==null?void 0:e.precision)>"u"?null:e==null?void 0:e.precision,...v.errToObj(e==null?void 0:e.message)})}duration(e){return this._addCheck({kind:"duration",...v.errToObj(e)})}regex(e,n){return this._addCheck({kind:"regex",regex:e,...v.errToObj(n)})}includes(e,n){return this._addCheck({kind:"includes",value:e,position:n==null?void 0:n.position,...v.errToObj(n==null?void 0:n.message)})}startsWith(e,n){return this._addCheck({kind:"startsWith",value:e,...v.errToObj(n)})}endsWith(e,n){return this._addCheck({kind:"endsWith",value:e,...v.errToObj(n)})}min(e,n){return this._addCheck({kind:"min",value:e,...v.errToObj(n)})}max(e,n){return this._addCheck({kind:"max",value:e,...v.errToObj(n)})}length(e,n){return this._addCheck({kind:"length",value:e,...v.errToObj(n)})}nonempty(e){return this.min(1,v.errToObj(e))}trim(){return new ye({...this._def,checks:[...this._def.checks,{kind:"trim"}]})}toLowerCase(){return new ye({...this._def,checks:[...this._def.checks,{kind:"toLowerCase"}]})}toUpperCase(){return new ye({...this._def,checks:[...this._def.checks,{kind:"toUpperCase"}]})}get isDatetime(){return!!this._def.checks.find(e=>e.kind==="datetime")}get isDate(){return!!this._def.checks.find(e=>e.kind==="date")}get isTime(){return!!this._def.checks.find(e=>e.kind==="time")}get isDuration(){return!!this._def.checks.find(e=>e.kind==="duration")}get isEmail(){return!!this._def.checks.find(e=>e.kind==="email")}get isURL(){return!!this._def.checks.find(e=>e.kind==="url")}get isEmoji(){return!!this._def.checks.find(e=>e.kind==="emoji")}get isUUID(){return!!this._def.checks.find(e=>e.kind==="uuid")}get isNANOID(){return!!this._def.checks.find(e=>e.kind==="nanoid")}get isCUID(){return!!this._def.checks.find(e=>e.kind==="cuid")}get isCUID2(){return!!this._def.checks.find(e=>e.kind==="cuid2")}get isULID(){return!!this._def.checks.find(e=>e.kind==="ulid")}get isIP(){return!!this._def.checks.find(e=>e.kind==="ip")}get isCIDR(){return!!this._def.checks.find(e=>e.kind==="cidr")}get isBase64(){return!!this._def.checks.find(e=>e.kind==="base64")}get isBase64url(){return!!this._def.checks.find(e=>e.kind==="base64url")}get minLength(){let e=null;for(const n of this._def.checks)n.kind==="min"&&(e===null||n.value>e)&&(e=n.value);return e}get maxLength(){let e=null;for(const n of this._def.checks)n.kind==="max"&&(e===null||n.value<e)&&(e=n.value);return e}}ye.create=t=>new ye({checks:[],typeName:L.ZodString,coerce:(t==null?void 0:t.coerce)??!1,...P(t)});function us(t,e){const n=(t.toString().split(".")[1]||"").length,r=(e.toString().split(".")[1]||"").length,a=n>r?n:r,o=Number.parseInt(t.toFixed(a).replace(".","")),i=Number.parseInt(e.toFixed(a).replace(".",""));return o%i/10**a}class $e extends D{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte,this.step=this.multipleOf}_parse(e){if(this._def.coerce&&(e.data=Number(e.data)),this._getType(e)!==y.number){const o=this._getOrReturnCtx(e);return E(o,{code:S.invalid_type,expected:y.number,received:o.parsedType}),k}let r;const a=new J;for(const o of this._def.checks)o.kind==="int"?U.isInteger(e.data)||(r=this._getOrReturnCtx(e,r),E(r,{code:S.invalid_type,expected:"integer",received:"float",message:o.message}),a.dirty()):o.kind==="min"?(o.inclusive?e.data<o.value:e.data<=o.value)&&(r=this._getOrReturnCtx(e,r),E(r,{code:S.too_small,minimum:o.value,type:"number",inclusive:o.inclusive,exact:!1,message:o.message}),a.dirty()):o.kind==="max"?(o.inclusive?e.data>o.value:e.data>=o.value)&&(r=this._getOrReturnCtx(e,r),E(r,{code:S.too_big,maximum:o.value,type:"number",inclusive:o.inclusive,exact:!1,message:o.message}),a.dirty()):o.kind==="multipleOf"?us(e.data,o.value)!==0&&(r=this._getOrReturnCtx(e,r),E(r,{code:S.not_multiple_of,multipleOf:o.value,message:o.message}),a.dirty()):o.kind==="finite"?Number.isFinite(e.data)||(r=this._getOrReturnCtx(e,r),E(r,{code:S.not_finite,message:o.message}),a.dirty()):U.assertNever(o);return{status:a.value,value:e.data}}gte(e,n){return this.setLimit("min",e,!0,v.toString(n))}gt(e,n){return this.setLimit("min",e,!1,v.toString(n))}lte(e,n){return this.setLimit("max",e,!0,v.toString(n))}lt(e,n){return this.setLimit("max",e,!1,v.toString(n))}setLimit(e,n,r,a){return new $e({...this._def,checks:[...this._def.checks,{kind:e,value:n,inclusive:r,message:v.toString(a)}]})}_addCheck(e){return new $e({...this._def,checks:[...this._def.checks,e]})}int(e){return this._addCheck({kind:"int",message:v.toString(e)})}positive(e){return this._addCheck({kind:"min",value:0,inclusive:!1,message:v.toString(e)})}negative(e){return this._addCheck({kind:"max",value:0,inclusive:!1,message:v.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:0,inclusive:!0,message:v.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:0,inclusive:!0,message:v.toString(e)})}multipleOf(e,n){return this._addCheck({kind:"multipleOf",value:e,message:v.toString(n)})}finite(e){return this._addCheck({kind:"finite",message:v.toString(e)})}safe(e){return this._addCheck({kind:"min",inclusive:!0,value:Number.MIN_SAFE_INTEGER,message:v.toString(e)})._addCheck({kind:"max",inclusive:!0,value:Number.MAX_SAFE_INTEGER,message:v.toString(e)})}get minValue(){let e=null;for(const n of this._def.checks)n.kind==="min"&&(e===null||n.value>e)&&(e=n.value);return e}get maxValue(){let e=null;for(const n of this._def.checks)n.kind==="max"&&(e===null||n.value<e)&&(e=n.value);return e}get isInt(){return!!this._def.checks.find(e=>e.kind==="int"||e.kind==="multipleOf"&&U.isInteger(e.value))}get isFinite(){let e=null,n=null;for(const r of this._def.checks){if(r.kind==="finite"||r.kind==="int"||r.kind==="multipleOf")return!0;r.kind==="min"?(n===null||r.value>n)&&(n=r.value):r.kind==="max"&&(e===null||r.value<e)&&(e=r.value)}return Number.isFinite(n)&&Number.isFinite(e)}}$e.create=t=>new $e({checks:[],typeName:L.ZodNumber,coerce:(t==null?void 0:t.coerce)||!1,...P(t)});class et extends D{constructor(){super(...arguments),this.min=this.gte,this.max=this.lte}_parse(e){if(this._def.coerce)try{e.data=BigInt(e.data)}catch{return this._getInvalidInput(e)}if(this._getType(e)!==y.bigint)return this._getInvalidInput(e);let r;const a=new J;for(const o of this._def.checks)o.kind==="min"?(o.inclusive?e.data<o.value:e.data<=o.value)&&(r=this._getOrReturnCtx(e,r),E(r,{code:S.too_small,type:"bigint",minimum:o.value,inclusive:o.inclusive,message:o.message}),a.dirty()):o.kind==="max"?(o.inclusive?e.data>o.value:e.data>=o.value)&&(r=this._getOrReturnCtx(e,r),E(r,{code:S.too_big,type:"bigint",maximum:o.value,inclusive:o.inclusive,message:o.message}),a.dirty()):o.kind==="multipleOf"?e.data%o.value!==BigInt(0)&&(r=this._getOrReturnCtx(e,r),E(r,{code:S.not_multiple_of,multipleOf:o.value,message:o.message}),a.dirty()):U.assertNever(o);return{status:a.value,value:e.data}}_getInvalidInput(e){const n=this._getOrReturnCtx(e);return E(n,{code:S.invalid_type,expected:y.bigint,received:n.parsedType}),k}gte(e,n){return this.setLimit("min",e,!0,v.toString(n))}gt(e,n){return this.setLimit("min",e,!1,v.toString(n))}lte(e,n){return this.setLimit("max",e,!0,v.toString(n))}lt(e,n){return this.setLimit("max",e,!1,v.toString(n))}setLimit(e,n,r,a){return new et({...this._def,checks:[...this._def.checks,{kind:e,value:n,inclusive:r,message:v.toString(a)}]})}_addCheck(e){return new et({...this._def,checks:[...this._def.checks,e]})}positive(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!1,message:v.toString(e)})}negative(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!1,message:v.toString(e)})}nonpositive(e){return this._addCheck({kind:"max",value:BigInt(0),inclusive:!0,message:v.toString(e)})}nonnegative(e){return this._addCheck({kind:"min",value:BigInt(0),inclusive:!0,message:v.toString(e)})}multipleOf(e,n){return this._addCheck({kind:"multipleOf",value:e,message:v.toString(n)})}get minValue(){let e=null;for(const n of this._def.checks)n.kind==="min"&&(e===null||n.value>e)&&(e=n.value);return e}get maxValue(){let e=null;for(const n of this._def.checks)n.kind==="max"&&(e===null||n.value<e)&&(e=n.value);return e}}et.create=t=>new et({checks:[],typeName:L.ZodBigInt,coerce:(t==null?void 0:t.coerce)??!1,...P(t)});class zr extends D{_parse(e){if(this._def.coerce&&(e.data=!!e.data),this._getType(e)!==y.boolean){const r=this._getOrReturnCtx(e);return E(r,{code:S.invalid_type,expected:y.boolean,received:r.parsedType}),k}return ie(e.data)}}zr.create=t=>new zr({typeName:L.ZodBoolean,coerce:(t==null?void 0:t.coerce)||!1,...P(t)});class Tt extends D{_parse(e){if(this._def.coerce&&(e.data=new Date(e.data)),this._getType(e)!==y.date){const o=this._getOrReturnCtx(e);return E(o,{code:S.invalid_type,expected:y.date,received:o.parsedType}),k}if(Number.isNaN(e.data.getTime())){const o=this._getOrReturnCtx(e);return E(o,{code:S.invalid_date}),k}const r=new J;let a;for(const o of this._def.checks)o.kind==="min"?e.data.getTime()<o.value&&(a=this._getOrReturnCtx(e,a),E(a,{code:S.too_small,message:o.message,inclusive:!0,exact:!1,minimum:o.value,type:"date"}),r.dirty()):o.kind==="max"?e.data.getTime()>o.value&&(a=this._getOrReturnCtx(e,a),E(a,{code:S.too_big,message:o.message,inclusive:!0,exact:!1,maximum:o.value,type:"date"}),r.dirty()):U.assertNever(o);return{status:r.value,value:new Date(e.data.getTime())}}_addCheck(e){return new Tt({...this._def,checks:[...this._def.checks,e]})}min(e,n){return this._addCheck({kind:"min",value:e.getTime(),message:v.toString(n)})}max(e,n){return this._addCheck({kind:"max",value:e.getTime(),message:v.toString(n)})}get minDate(){let e=null;for(const n of this._def.checks)n.kind==="min"&&(e===null||n.value>e)&&(e=n.value);return e!=null?new Date(e):null}get maxDate(){let e=null;for(const n of this._def.checks)n.kind==="max"&&(e===null||n.value<e)&&(e=n.value);return e!=null?new Date(e):null}}Tt.create=t=>new Tt({checks:[],coerce:(t==null?void 0:t.coerce)||!1,typeName:L.ZodDate,...P(t)});class Gr extends D{_parse(e){if(this._getType(e)!==y.symbol){const r=this._getOrReturnCtx(e);return E(r,{code:S.invalid_type,expected:y.symbol,received:r.parsedType}),k}return ie(e.data)}}Gr.create=t=>new Gr({typeName:L.ZodSymbol,...P(t)});class jr extends D{_parse(e){if(this._getType(e)!==y.undefined){const r=this._getOrReturnCtx(e);return E(r,{code:S.invalid_type,expected:y.undefined,received:r.parsedType}),k}return ie(e.data)}}jr.create=t=>new jr({typeName:L.ZodUndefined,...P(t)});class Zr extends D{_parse(e){if(this._getType(e)!==y.null){const r=this._getOrReturnCtx(e);return E(r,{code:S.invalid_type,expected:y.null,received:r.parsedType}),k}return ie(e.data)}}Zr.create=t=>new Zr({typeName:L.ZodNull,...P(t)});class Kr extends D{constructor(){super(...arguments),this._any=!0}_parse(e){return ie(e.data)}}Kr.create=t=>new Kr({typeName:L.ZodAny,...P(t)});class Wr extends D{constructor(){super(...arguments),this._unknown=!0}_parse(e){return ie(e.data)}}Wr.create=t=>new Wr({typeName:L.ZodUnknown,...P(t)});class ve extends D{_parse(e){const n=this._getOrReturnCtx(e);return E(n,{code:S.invalid_type,expected:y.never,received:n.parsedType}),k}}ve.create=t=>new ve({typeName:L.ZodNever,...P(t)});class Yr extends D{_parse(e){if(this._getType(e)!==y.undefined){const r=this._getOrReturnCtx(e);return E(r,{code:S.invalid_type,expected:y.void,received:r.parsedType}),k}return ie(e.data)}}Yr.create=t=>new Yr({typeName:L.ZodVoid,...P(t)});class le extends D{_parse(e){const{ctx:n,status:r}=this._processInputParams(e),a=this._def;if(n.parsedType!==y.array)return E(n,{code:S.invalid_type,expected:y.array,received:n.parsedType}),k;if(a.exactLength!==null){const i=n.data.length>a.exactLength.value,s=n.data.length<a.exactLength.value;(i||s)&&(E(n,{code:i?S.too_big:S.too_small,minimum:s?a.exactLength.value:void 0,maximum:i?a.exactLength.value:void 0,type:"array",inclusive:!0,exact:!0,message:a.exactLength.message}),r.dirty())}if(a.minLength!==null&&n.data.length<a.minLength.value&&(E(n,{code:S.too_small,minimum:a.minLength.value,type:"array",inclusive:!0,exact:!1,message:a.minLength.message}),r.dirty()),a.maxLength!==null&&n.data.length>a.maxLength.value&&(E(n,{code:S.too_big,maximum:a.maxLength.value,type:"array",inclusive:!0,exact:!1,message:a.maxLength.message}),r.dirty()),n.common.async)return Promise.all([...n.data].map((i,s)=>a.type._parseAsync(new Ee(n,i,n.path,s)))).then(i=>J.mergeArray(r,i));const o=[...n.data].map((i,s)=>a.type._parseSync(new Ee(n,i,n.path,s)));return J.mergeArray(r,o)}get element(){return this._def.type}min(e,n){return new le({...this._def,minLength:{value:e,message:v.toString(n)}})}max(e,n){return new le({...this._def,maxLength:{value:e,message:v.toString(n)}})}length(e,n){return new le({...this._def,exactLength:{value:e,message:v.toString(n)}})}nonempty(e){return this.min(1,e)}}le.create=(t,e)=>new le({type:t,minLength:null,maxLength:null,exactLength:null,typeName:L.ZodArray,...P(e)});function He(t){if(t instanceof G){const e={};for(const n in t.shape){const r=t.shape[n];e[n]=Ce.create(He(r))}return new G({...t._def,shape:()=>e})}else return t instanceof le?new le({...t._def,type:He(t.element)}):t instanceof Ce?Ce.create(He(t.unwrap())):t instanceof ze?ze.create(He(t.unwrap())):t instanceof Ne?Ne.create(t.items.map(e=>He(e))):t}class G extends D{constructor(){super(...arguments),this._cached=null,this.nonstrict=this.passthrough,this.augment=this.extend}_getCached(){if(this._cached!==null)return this._cached;const e=this._def.shape(),n=U.objectKeys(e);return this._cached={shape:e,keys:n},this._cached}_parse(e){if(this._getType(e)!==y.object){const l=this._getOrReturnCtx(e);return E(l,{code:S.invalid_type,expected:y.object,received:l.parsedType}),k}const{status:r,ctx:a}=this._processInputParams(e),{shape:o,keys:i}=this._getCached(),s=[];if(!(this._def.catchall instanceof ve&&this._def.unknownKeys==="strip"))for(const l in a.data)i.includes(l)||s.push(l);const c=[];for(const l of i){const d=o[l],u=a.data[l];c.push({key:{status:"valid",value:l},value:d._parse(new Ee(a,u,a.path,l)),alwaysSet:l in a.data})}if(this._def.catchall instanceof ve){const l=this._def.unknownKeys;if(l==="passthrough")for(const d of s)c.push({key:{status:"valid",value:d},value:{status:"valid",value:a.data[d]}});else if(l==="strict")s.length>0&&(E(a,{code:S.unrecognized_keys,keys:s}),r.dirty());else if(l!=="strip")throw new Error("Internal ZodObject error: invalid unknownKeys value.")}else{const l=this._def.catchall;for(const d of s){const u=a.data[d];c.push({key:{status:"valid",value:d},value:l._parse(new Ee(a,u,a.path,d)),alwaysSet:d in a.data})}}return a.common.async?Promise.resolve().then(async()=>{const l=[];for(const d of c){const u=await d.key,m=await d.value;l.push({key:u,value:m,alwaysSet:d.alwaysSet})}return l}).then(l=>J.mergeObjectSync(r,l)):J.mergeObjectSync(r,c)}get shape(){return this._def.shape()}strict(e){return v.errToObj,new G({...this._def,unknownKeys:"strict",...e!==void 0?{errorMap:(n,r)=>{var o,i;const a=((i=(o=this._def).errorMap)==null?void 0:i.call(o,n,r).message)??r.defaultError;return n.code==="unrecognized_keys"?{message:v.errToObj(e).message??a}:{message:a}}}:{}})}strip(){return new G({...this._def,unknownKeys:"strip"})}passthrough(){return new G({...this._def,unknownKeys:"passthrough"})}extend(e){return new G({...this._def,shape:()=>({...this._def.shape(),...e})})}merge(e){return new G({unknownKeys:e._def.unknownKeys,catchall:e._def.catchall,shape:()=>({...this._def.shape(),...e._def.shape()}),typeName:L.ZodObject})}setKey(e,n){return this.augment({[e]:n})}catchall(e){return new G({...this._def,catchall:e})}pick(e){const n={};for(const r of U.objectKeys(e))e[r]&&this.shape[r]&&(n[r]=this.shape[r]);return new G({...this._def,shape:()=>n})}omit(e){const n={};for(const r of U.objectKeys(this.shape))e[r]||(n[r]=this.shape[r]);return new G({...this._def,shape:()=>n})}deepPartial(){return He(this)}partial(e){const n={};for(const r of U.objectKeys(this.shape)){const a=this.shape[r];e&&!e[r]?n[r]=a:n[r]=a.optional()}return new G({...this._def,shape:()=>n})}required(e){const n={};for(const r of U.objectKeys(this.shape))if(e&&!e[r])n[r]=this.shape[r];else{let o=this.shape[r];for(;o instanceof Ce;)o=o._def.innerType;n[r]=o}return new G({...this._def,shape:()=>n})}keyof(){return ea(U.objectKeys(this.shape))}}G.create=(t,e)=>new G({shape:()=>t,unknownKeys:"strip",catchall:ve.create(),typeName:L.ZodObject,...P(e)}),G.strictCreate=(t,e)=>new G({shape:()=>t,unknownKeys:"strict",catchall:ve.create(),typeName:L.ZodObject,...P(e)}),G.lazycreate=(t,e)=>new G({shape:t,unknownKeys:"strip",catchall:ve.create(),typeName:L.ZodObject,...P(e)});class wt extends D{_parse(e){const{ctx:n}=this._processInputParams(e),r=this._def.options;function a(o){for(const s of o)if(s.result.status==="valid")return s.result;for(const s of o)if(s.result.status==="dirty")return n.common.issues.push(...s.ctx.common.issues),s.result;const i=o.map(s=>new ge(s.ctx.common.issues));return E(n,{code:S.invalid_union,unionErrors:i}),k}if(n.common.async)return Promise.all(r.map(async o=>{const i={...n,common:{...n.common,issues:[]},parent:null};return{result:await o._parseAsync({data:n.data,path:n.path,parent:i}),ctx:i}})).then(a);{let o;const i=[];for(const c of r){const l={...n,common:{...n.common,issues:[]},parent:null},d=c._parseSync({data:n.data,path:n.path,parent:l});if(d.status==="valid")return d;d.status==="dirty"&&!o&&(o={result:d,ctx:l}),l.common.issues.length&&i.push(l.common.issues)}if(o)return n.common.issues.push(...o.ctx.common.issues),o.result;const s=i.map(c=>new ge(c));return E(n,{code:S.invalid_union,unionErrors:s}),k}}get options(){return this._def.options}}wt.create=(t,e)=>new wt({options:t,typeName:L.ZodUnion,...P(e)});function hn(t,e){const n=Se(t),r=Se(e);if(t===e)return{valid:!0,data:t};if(n===y.object&&r===y.object){const a=U.objectKeys(e),o=U.objectKeys(t).filter(s=>a.indexOf(s)!==-1),i={...t,...e};for(const s of o){const c=hn(t[s],e[s]);if(!c.valid)return{valid:!1};i[s]=c.data}return{valid:!0,data:i}}else if(n===y.array&&r===y.array){if(t.length!==e.length)return{valid:!1};const a=[];for(let o=0;o<t.length;o++){const i=t[o],s=e[o],c=hn(i,s);if(!c.valid)return{valid:!1};a.push(c.data)}return{valid:!0,data:a}}else return n===y.date&&r===y.date&&+t==+e?{valid:!0,data:t}:{valid:!1}}class _t extends D{_parse(e){const{status:n,ctx:r}=this._processInputParams(e),a=(o,i)=>{if(qr(o)||qr(i))return k;const s=hn(o.value,i.value);return s.valid?(($r(o)||$r(i))&&n.dirty(),{status:n.value,value:s.data}):(E(r,{code:S.invalid_intersection_types}),k)};return r.common.async?Promise.all([this._def.left._parseAsync({data:r.data,path:r.path,parent:r}),this._def.right._parseAsync({data:r.data,path:r.path,parent:r})]).then(([o,i])=>a(o,i)):a(this._def.left._parseSync({data:r.data,path:r.path,parent:r}),this._def.right._parseSync({data:r.data,path:r.path,parent:r}))}}_t.create=(t,e,n)=>new _t({left:t,right:e,typeName:L.ZodIntersection,...P(n)});class Ne extends D{_parse(e){const{status:n,ctx:r}=this._processInputParams(e);if(r.parsedType!==y.array)return E(r,{code:S.invalid_type,expected:y.array,received:r.parsedType}),k;if(r.data.length<this._def.items.length)return E(r,{code:S.too_small,minimum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),k;!this._def.rest&&r.data.length>this._def.items.length&&(E(r,{code:S.too_big,maximum:this._def.items.length,inclusive:!0,exact:!1,type:"array"}),n.dirty());const o=[...r.data].map((i,s)=>{const c=this._def.items[s]||this._def.rest;return c?c._parse(new Ee(r,i,r.path,s)):null}).filter(i=>!!i);return r.common.async?Promise.all(o).then(i=>J.mergeArray(n,i)):J.mergeArray(n,o)}get items(){return this._def.items}rest(e){return new Ne({...this._def,rest:e})}}Ne.create=(t,e)=>{if(!Array.isArray(t))throw new Error("You must pass an array of schemas to z.tuple([ ... ])");return new Ne({items:t,typeName:L.ZodTuple,rest:null,...P(e)})};class Xr extends D{get keySchema(){return this._def.keyType}get valueSchema(){return this._def.valueType}_parse(e){const{status:n,ctx:r}=this._processInputParams(e);if(r.parsedType!==y.map)return E(r,{code:S.invalid_type,expected:y.map,received:r.parsedType}),k;const a=this._def.keyType,o=this._def.valueType,i=[...r.data.entries()].map(([s,c],l)=>({key:a._parse(new Ee(r,s,r.path,[l,"key"])),value:o._parse(new Ee(r,c,r.path,[l,"value"]))}));if(r.common.async){const s=new Map;return Promise.resolve().then(async()=>{for(const c of i){const l=await c.key,d=await c.value;if(l.status==="aborted"||d.status==="aborted")return k;(l.status==="dirty"||d.status==="dirty")&&n.dirty(),s.set(l.value,d.value)}return{status:n.value,value:s}})}else{const s=new Map;for(const c of i){const l=c.key,d=c.value;if(l.status==="aborted"||d.status==="aborted")return k;(l.status==="dirty"||d.status==="dirty")&&n.dirty(),s.set(l.value,d.value)}return{status:n.value,value:s}}}}Xr.create=(t,e,n)=>new Xr({valueType:e,keyType:t,typeName:L.ZodMap,...P(n)});class tt extends D{_parse(e){const{status:n,ctx:r}=this._processInputParams(e);if(r.parsedType!==y.set)return E(r,{code:S.invalid_type,expected:y.set,received:r.parsedType}),k;const a=this._def;a.minSize!==null&&r.data.size<a.minSize.value&&(E(r,{code:S.too_small,minimum:a.minSize.value,type:"set",inclusive:!0,exact:!1,message:a.minSize.message}),n.dirty()),a.maxSize!==null&&r.data.size>a.maxSize.value&&(E(r,{code:S.too_big,maximum:a.maxSize.value,type:"set",inclusive:!0,exact:!1,message:a.maxSize.message}),n.dirty());const o=this._def.valueType;function i(c){const l=new Set;for(const d of c){if(d.status==="aborted")return k;d.status==="dirty"&&n.dirty(),l.add(d.value)}return{status:n.value,value:l}}const s=[...r.data.values()].map((c,l)=>o._parse(new Ee(r,c,r.path,l)));return r.common.async?Promise.all(s).then(c=>i(c)):i(s)}min(e,n){return new tt({...this._def,minSize:{value:e,message:v.toString(n)}})}max(e,n){return new tt({...this._def,maxSize:{value:e,message:v.toString(n)}})}size(e,n){return this.min(e,n).max(e,n)}nonempty(e){return this.min(1,e)}}tt.create=(t,e)=>new tt({valueType:t,minSize:null,maxSize:null,typeName:L.ZodSet,...P(e)});class Jr extends D{get schema(){return this._def.getter()}_parse(e){const{ctx:n}=this._processInputParams(e);return this._def.getter()._parse({data:n.data,path:n.path,parent:n})}}Jr.create=(t,e)=>new Jr({getter:t,typeName:L.ZodLazy,...P(e)});class Qr extends D{_parse(e){if(e.data!==this._def.value){const n=this._getOrReturnCtx(e);return E(n,{received:n.data,code:S.invalid_literal,expected:this._def.value}),k}return{status:"valid",value:e.data}}get value(){return this._def.value}}Qr.create=(t,e)=>new Qr({value:t,typeName:L.ZodLiteral,...P(e)});function ea(t,e){return new Ve({values:t,typeName:L.ZodEnum,...P(e)})}class Ve extends D{_parse(e){if(typeof e.data!="string"){const n=this._getOrReturnCtx(e),r=this._def.values;return E(n,{expected:U.joinValues(r),received:n.parsedType,code:S.invalid_type}),k}if(this._cache||(this._cache=new Set(this._def.values)),!this._cache.has(e.data)){const n=this._getOrReturnCtx(e),r=this._def.values;return E(n,{received:n.data,code:S.invalid_enum_value,options:r}),k}return ie(e.data)}get options(){return this._def.values}get enum(){const e={};for(const n of this._def.values)e[n]=n;return e}get Values(){const e={};for(const n of this._def.values)e[n]=n;return e}get Enum(){const e={};for(const n of this._def.values)e[n]=n;return e}extract(e,n=this._def){return Ve.create(e,{...this._def,...n})}exclude(e,n=this._def){return Ve.create(this.options.filter(r=>!e.includes(r)),{...this._def,...n})}}Ve.create=ea;class ta extends D{_parse(e){const n=U.getValidEnumValues(this._def.values),r=this._getOrReturnCtx(e);if(r.parsedType!==y.string&&r.parsedType!==y.number){const a=U.objectValues(n);return E(r,{expected:U.joinValues(a),received:r.parsedType,code:S.invalid_type}),k}if(this._cache||(this._cache=new Set(U.getValidEnumValues(this._def.values))),!this._cache.has(e.data)){const a=U.objectValues(n);return E(r,{received:r.data,code:S.invalid_enum_value,options:a}),k}return ie(e.data)}get enum(){return this._def.values}}ta.create=(t,e)=>new ta({values:t,typeName:L.ZodNativeEnum,...P(e)});class Ot extends D{unwrap(){return this._def.type}_parse(e){const{ctx:n}=this._processInputParams(e);if(n.parsedType!==y.promise&&n.common.async===!1)return E(n,{code:S.invalid_type,expected:y.promise,received:n.parsedType}),k;const r=n.parsedType===y.promise?n.data:Promise.resolve(n.data);return ie(r.then(a=>this._def.type.parseAsync(a,{path:n.path,errorMap:n.common.contextualErrorMap})))}}Ot.create=(t,e)=>new Ot({type:t,typeName:L.ZodPromise,...P(e)});class Fe extends D{innerType(){return this._def.schema}sourceType(){return this._def.schema._def.typeName===L.ZodEffects?this._def.schema.sourceType():this._def.schema}_parse(e){const{status:n,ctx:r}=this._processInputParams(e),a=this._def.effect||null,o={addIssue:i=>{E(r,i),i.fatal?n.abort():n.dirty()},get path(){return r.path}};if(o.addIssue=o.addIssue.bind(o),a.type==="preprocess"){const i=a.transform(r.data,o);if(r.common.async)return Promise.resolve(i).then(async s=>{if(n.value==="aborted")return k;const c=await this._def.schema._parseAsync({data:s,path:r.path,parent:r});return c.status==="aborted"?k:c.status==="dirty"||n.value==="dirty"?Qe(c.value):c});{if(n.value==="aborted")return k;const s=this._def.schema._parseSync({data:i,path:r.path,parent:r});return s.status==="aborted"?k:s.status==="dirty"||n.value==="dirty"?Qe(s.value):s}}if(a.type==="refinement"){const i=s=>{const c=a.refinement(s,o);if(r.common.async)return Promise.resolve(c);if(c instanceof Promise)throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");return s};if(r.common.async===!1){const s=this._def.schema._parseSync({data:r.data,path:r.path,parent:r});return s.status==="aborted"?k:(s.status==="dirty"&&n.dirty(),i(s.value),{status:n.value,value:s.value})}else return this._def.schema._parseAsync({data:r.data,path:r.path,parent:r}).then(s=>s.status==="aborted"?k:(s.status==="dirty"&&n.dirty(),i(s.value).then(()=>({status:n.value,value:s.value}))))}if(a.type==="transform")if(r.common.async===!1){const i=this._def.schema._parseSync({data:r.data,path:r.path,parent:r});if(!qe(i))return k;const s=a.transform(i.value,o);if(s instanceof Promise)throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");return{status:n.value,value:s}}else return this._def.schema._parseAsync({data:r.data,path:r.path,parent:r}).then(i=>qe(i)?Promise.resolve(a.transform(i.value,o)).then(s=>({status:n.value,value:s})):k);U.assertNever(a)}}Fe.create=(t,e,n)=>new Fe({schema:t,typeName:L.ZodEffects,effect:e,...P(n)}),Fe.createWithPreprocess=(t,e,n)=>new Fe({schema:e,effect:{type:"preprocess",transform:t},typeName:L.ZodEffects,...P(n)});class Ce extends D{_parse(e){return this._getType(e)===y.undefined?ie(void 0):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}}Ce.create=(t,e)=>new Ce({innerType:t,typeName:L.ZodOptional,...P(e)});class ze extends D{_parse(e){return this._getType(e)===y.null?ie(null):this._def.innerType._parse(e)}unwrap(){return this._def.innerType}}ze.create=(t,e)=>new ze({innerType:t,typeName:L.ZodNullable,...P(e)});class fn extends D{_parse(e){const{ctx:n}=this._processInputParams(e);let r=n.data;return n.parsedType===y.undefined&&(r=this._def.defaultValue()),this._def.innerType._parse({data:r,path:n.path,parent:n})}removeDefault(){return this._def.innerType}}fn.create=(t,e)=>new fn({innerType:t,typeName:L.ZodDefault,defaultValue:typeof e.default=="function"?e.default:()=>e.default,...P(e)});class gn extends D{_parse(e){const{ctx:n}=this._processInputParams(e),r={...n,common:{...n.common,issues:[]}},a=this._def.innerType._parse({data:r.data,path:r.path,parent:{...r}});return Ct(a)?a.then(o=>({status:"valid",value:o.status==="valid"?o.value:this._def.catchValue({get error(){return new ge(r.common.issues)},input:r.data})})):{status:"valid",value:a.status==="valid"?a.value:this._def.catchValue({get error(){return new ge(r.common.issues)},input:r.data})}}removeCatch(){return this._def.innerType}}gn.create=(t,e)=>new gn({innerType:t,typeName:L.ZodCatch,catchValue:typeof e.catch=="function"?e.catch:()=>e.catch,...P(e)});class na extends D{_parse(e){if(this._getType(e)!==y.nan){const r=this._getOrReturnCtx(e);return E(r,{code:S.invalid_type,expected:y.nan,received:r.parsedType}),k}return{status:"valid",value:e.data}}}na.create=t=>new na({typeName:L.ZodNaN,...P(t)});class ms extends D{_parse(e){const{ctx:n}=this._processInputParams(e),r=n.data;return this._def.type._parse({data:r,path:n.path,parent:n})}unwrap(){return this._def.type}}class xn extends D{_parse(e){const{status:n,ctx:r}=this._processInputParams(e);if(r.common.async)return(async()=>{const o=await this._def.in._parseAsync({data:r.data,path:r.path,parent:r});return o.status==="aborted"?k:o.status==="dirty"?(n.dirty(),Qe(o.value)):this._def.out._parseAsync({data:o.value,path:r.path,parent:r})})();{const a=this._def.in._parseSync({data:r.data,path:r.path,parent:r});return a.status==="aborted"?k:a.status==="dirty"?(n.dirty(),{status:"dirty",value:a.value}):this._def.out._parseSync({data:a.value,path:r.path,parent:r})}}static create(e,n){return new xn({in:e,out:n,typeName:L.ZodPipeline})}}class bn extends D{_parse(e){const n=this._def.innerType._parse(e),r=a=>(qe(a)&&(a.value=Object.freeze(a.value)),a);return Ct(n)?n.then(a=>r(a)):r(n)}unwrap(){return this._def.innerType}}bn.create=(t,e)=>new bn({innerType:t,typeName:L.ZodReadonly,...P(e)});var L;(function(t){t.ZodString="ZodString",t.ZodNumber="ZodNumber",t.ZodNaN="ZodNaN",t.ZodBigInt="ZodBigInt",t.ZodBoolean="ZodBoolean",t.ZodDate="ZodDate",t.ZodSymbol="ZodSymbol",t.ZodUndefined="ZodUndefined",t.ZodNull="ZodNull",t.ZodAny="ZodAny",t.ZodUnknown="ZodUnknown",t.ZodNever="ZodNever",t.ZodVoid="ZodVoid",t.ZodArray="ZodArray",t.ZodObject="ZodObject",t.ZodUnion="ZodUnion",t.ZodDiscriminatedUnion="ZodDiscriminatedUnion",t.ZodIntersection="ZodIntersection",t.ZodTuple="ZodTuple",t.ZodRecord="ZodRecord",t.ZodMap="ZodMap",t.ZodSet="ZodSet",t.ZodFunction="ZodFunction",t.ZodLazy="ZodLazy",t.ZodLiteral="ZodLiteral",t.ZodEnum="ZodEnum",t.ZodEffects="ZodEffects",t.ZodNativeEnum="ZodNativeEnum",t.ZodOptional="ZodOptional",t.ZodNullable="ZodNullable",t.ZodDefault="ZodDefault",t.ZodCatch="ZodCatch",t.ZodPromise="ZodPromise",t.ZodBranded="ZodBranded",t.ZodPipeline="ZodPipeline",t.ZodReadonly="ZodReadonly"})(L||(L={}));const Q=ye.create,ra=$e.create;ve.create;const nt=le.create,aa=G.create;wt.create,_t.create,Ne.create;const ps=Ve.create;Ot.create,Ce.create,ze.create;const hs=aa({pageId:Q().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),code:Q(),name:Q(),reviewStatus:Q().nullable(),faces:nt(Q()).nullable(),options:nt(Q()).nullable(),techniques:nt(Q()).nullable(),faceCount:ra().nullable(),locationCount:ra().nullable(),body:nt(Q()),warnings:nt(Q()),lastEditedAt:Q().nullable()}),fs=aa({status:ps(["found","not-found","multiple","auth","access","network","partial","unavailable","invalid"]),code:Q(),checkedAt:Q(),reason:Q(),definition:hs.optional()}).refine(t=>t.status!=="found"||t.definition!==void 0);function It(t){var e;try{const n=new URL(t);return/^https:\/\/(bestofgifts\.(pt|eu|es|fr)|bestofgifts-pt-qa\.toogas\.net)$/.test(n.origin)?((e=n.pathname.match(/\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/(\d+)(?:\/|$)/))==null?void 0:e[1])??null:null}catch{return null}}let se;function oa(){se==null||se.destroy(),se=void 0}function gs(){const t=It(location.href),e=document.querySelector('[data-bind*="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"]');if(se&&(!se.panel.isConnected||se.entity!==t||se.native!==e||se.panel.nextElementSibling!==e)&&oa(),!t||!(e!=null&&e.parentElement)||se)return;Le();const n=document.createElement("section");n.id="mhx-pp-catalog",n.setAttribute("aria-label","Notion PP reference");const r=document.createElement("h2");r.textContent="Notion PP reference (read-only)";const a=document.createElement("p");a.textContent=`Magento entity ${t}. A manually selected reference does not establish this page’s PP code or Attribute Set association. No comparison with saved data is made.`;const o=document.createElement("label");o.textContent="Exact business PP text ";const i=document.createElement("input");i.type="text",i.maxLength=128,i.autocomplete="off",i.spellcheck=!1,o.appendChild(i);const s=document.createElement("div");s.setAttribute("role","status"),s.setAttribute("aria-live","polite");let c=0;const l=f=>{const A=document.createElement("p");A.textContent=f,s.appendChild(A)},d=(f,A)=>{l(`${f}: ${A===null||A.length===0?"not provided / unknown":A.join("; ")}`)},u=f=>{s.replaceChildren(),l(`${f.status}: ${f.reason}`),l(`Exact requested code: ${f.code}. Checked: ${f.checkedAt}.`);const A=f.definition;if(!A)return;l(`Name: ${A.name||"not provided"}`),l(`Review status: ${A.reviewStatus??"unknown"}`),d("Faces",A.faces),l(`Number of faces: ${A.faceCount??"unknown"}. Number of possible locations: ${A.locationCount??"unknown"}.`),d("Personalization options (global list)",A.options),d("Techniques (global list)",A.techniques),l(`Notion last edited: ${A.lastEditedAt??"unknown"}. This timestamp does not prove approval or a Magento match.`);const w=document.createElement("a");w.href=`https://www.notion.so/${A.pageId.replaceAll("-","")}`,w.textContent="Open Notion definition",w.target="_blank",w.rel="noopener noreferrer",s.appendChild(w);for(const I of A.warnings)l(I);if(A.body.length){const I=document.createElement("details"),N=document.createElement("summary");N.textContent="Source body text (groupings are not per-location assignments)",I.appendChild(N);for(const O of A.body){const h=document.createElement("p");h.textContent=O,I.appendChild(h)}s.appendChild(I)}},m=async()=>{const f=i.value,A=++c;if(s.replaceChildren(),!f.trim()||f.length>128){l("Enter the exact business PP text (1 to 128 characters).");return}l("Reading the Notion reference. Magento data will not be changed.");try{const w={type:"FETCH_PP_CATALOG",code:f},I=await chrome.runtime.sendMessage(w);if(A!==c||!n.isConnected||!e.isConnected||It(location.href)!==t||i.value!==f)return;const N=fs.safeParse(I);if(!N.success||N.data.code!==f||N.data.definition&&N.data.definition.code!==f){s.replaceChildren(),l("unavailable: The background returned an invalid or mismatched reference.");return}u(N.data)}catch{if(A!==c||!n.isConnected||!e.isConnected||It(location.href)!==t||i.value!==f)return;s.replaceChildren(),l("unavailable: The extension could not complete the lookup. Retry explicitly.")}},p=()=>{c++,s.replaceChildren(),l("Code changed. Load the exact reference again.")},x=f=>{f.key==="Enter"&&(f.preventDefault(),m())};i.addEventListener("input",p),i.addEventListener("keydown",x);const g=Z({label:"Load Notion reference",onClick:()=>{m()}});n.append(r,a,o,g,s),e.parentElement.insertBefore(n,e),se={panel:n,entity:t,native:e,destroy:()=>{c++,i.removeEventListener("input",p),i.removeEventListener("keydown",x),n.remove()}}}function Km(t){return t}const xs=!0,bs=12,As=!0,Ss=!0,Es=!0,ys=!0,vs=!0,Cs=!0,Ts=!1,K=(t,e)=>t.querySelector(e)!==null,An=".data-grid",Sn='#product_form, .product-edit, [data-ui-id="product-form"]',ia=".custom-options, .options",ws=/\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/\d+(?:\/|$)/i,_s='[data-bind*="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"]',kt=[{id:"extensionEnabled",label:"Extension",description:"Master switch. Turning this off stops every page feature from mounting.",group:"Global",defaultOn:!0,available:!0,detect:()=>!0},{id:"selects",label:"Searchable dropdowns",description:"Long Magento dropdowns become a searchable picker. The native select stays in the page and keeps the value.",group:"Global",defaultOn:!0,available:xs,detect:t=>K(t,"select")},{id:"tierPrices",label:"Tier price fill buttons",description:"Fills the tier price rows from the Notion reference bands (textil / outros artigos).",group:"Product form",defaultOn:!0,available:!0,detect:t=>K(t,Sn)},{id:"navToggle",label:"Sidebar toggle",description:"A fixed chevron on the admin menu edge hides it so the grid gets the width back.",group:"Page chrome",defaultOn:!0,available:Es,detect:t=>K(t,".admin__menu, nav.admin__menu")},{id:"rowActions",label:"Inline row actions",description:`Each grid row shows its actions inline instead of behind a "Select" dropdown. Clicks forward to Magento's own menu.`,group:"Grid",defaultOn:!0,available:As,detect:t=>K(t,An)},{id:"assocBulk",label:"Bulk select by SKU",description:'Paste SKUs into the "Select Associated Product" window and they get ticked, including rows off the current page.',group:"Grid",defaultOn:!0,available:!0,detect:t=>K(t,'aside[class*="configurable_associated_product_modal"]')},{id:"massactions",label:"Bulk action buttons",description:"The toolbar's Actions menu becomes one-click buttons. Nothing is submitted by the extension.",group:"Grid",defaultOn:!0,available:Ss,detect:t=>K(t,An)},{id:"paging",label:"Per-page sizes",description:`The grid's "per page" dropdown becomes a segmented control.`,group:"Grid",defaultOn:!0,available:ys,detect:t=>K(t,".selectmenu, .paging, .toolbar-amount")},{id:"activeFilters",label:"Editable filter chips",description:"A pencil on every active filter chip edits its value in place, then re-queries through Magento's own Apply control.",group:"Grid",defaultOn:!0,available:vs,detect:t=>K(t,".active-filters, .filter-actions")},{id:"categoryTree",label:"Category tree tools",description:'Branch toggles, a filter over names and index numbers, Tree/List switch and a "selected only" filter on the categories tree.',group:"Category tree",defaultOn:!0,available:Cs,detect:t=>K(t,".category-tree, #category_ids, .categories-side-col")},{id:"pageActions",label:"Actions in the header",description:"Moves the Save / Add action bar into the admin header. Switched off in this build.",group:"Page chrome",defaultOn:!1,available:Ts,detect:t=>K(t,".page-actions, .page-actions-buttons")},{id:"skuCopy",label:"Copy SKU and name",description:"Copy buttons next to the SKU and Name fields.",group:"Product form",defaultOn:!0,available:!0,detect:t=>K(t,Sn)},{id:"productTypeBadge",label:"Product type badge",description:"Shows whether the open product is Simple or Configurable, next to the title.",group:"Product form",defaultOn:!0,available:!0,detect:t=>K(t,Sn)},{id:"gridCopy",label:"Row copy and open",description:"Copy a cell value, or open the row's product, without leaving the grid.",group:"Grid",defaultOn:!0,available:!0,detect:t=>K(t,An)},{id:"storeViews",label:"Store view quick-open",description:"EN / ES / FR buttons beside the store switcher open the same page in that view.",group:"Page chrome",defaultOn:!0,available:!0,detect:t=>K(t,".store-switcher, .store-view")},{id:"configButtons",label:"Colour group buttons",description:'"Colour (N)" buttons that open every child product of that colour.',group:"Product form",defaultOn:!0,available:!0,detect:t=>K(t,".configurable, .super-attribute")},{id:"errorMarkup",label:"Listing error markup",description:"Priority indicators next to the fields a listing error refers to, with the reason.",group:"Product form",defaultOn:!0,available:!0,detect:()=>!0},{id:"optionsCompanion",label:"Option language strip",description:"Per-language chips on each custom-option row, plus the Original / Lang switch.",group:"Product form",defaultOn:!0,available:!0,detect:t=>K(t,ia)},{id:"optionsItems",label:"Options Items panel",description:"A grouped, parallel view of the Options Items table. Writes go through the page's own inputs.",group:"Product form",defaultOn:!0,available:!0,detect:t=>K(t,ia)},{id:"ppCatalog",label:"Notion PP reference",description:"Load an exact business PP definition from Notion without changing the Magento page.",group:"Product form",defaultOn:!0,available:!0,detect:t=>It(t.URL)!==null},{id:"ppScan",label:"Scan current PP draft",description:"Read a bounded snapshot of the current unsaved custom-option draft. The scan never saves or changes Magento data.",group:"Product form",defaultOn:!0,available:!0,detect:t=>{var e;return ws.test(((e=t.defaultView)==null?void 0:e.location.pathname)??"")&&K(t,_s)}}],Lt=Object.fromEntries(kt.map(t=>[t.id,t.defaultOn]));kt.filter(t=>t.id!=="extensionEnabled").map(t=>t.id);function Os(t){return kt.filter(e=>e.detect(t)).map(e=>e.id)}let En={...Lt};function Is(){return En}async function sa(){const t=Object.keys(Lt),e=await chrome.storage.local.get(t.concat(["featureFlags"])),n=e.featureFlags??{},r={...Lt};for(const a of t)typeof n[a]=="boolean"?r[a]=n[a]:typeof e[a]=="boolean"&&(r[a]=e[a]);return En=r,En}function ks(t){chrome.storage.onChanged.addListener((e,n)=>{n==="local"&&(!("featureFlags"in e)&&!Object.keys(Lt).some(r=>r in e)||sa().then(t))})}const Ls={1:"PT",2:"EN",4:"ES",5:"FR",6:"DE",7:"IT"},ca={PT:"1",EN:"2",ES:"4",FR:"5",DE:"6",IT:"7"},yn=["EN","ES","FR"];function Ns(t){const e=t.match(/\/store\/(\d+)\//);if(e){const n=e[1]??"";return Ls[n]??"all"}return"all"}function la(t,e){let n;try{n=new URL(t)}catch{return""}let r=n.pathname.replace(/\/store\/\d+\//gi,"/");if(e!==null){const a=r.match(/\/key\/[^/]+\//);a?r=r.replace(a[0],`/store/${e}/`+a[0]):r=`${r.replace(/\/+$/,"")}/store/${e}/`}return`${n.origin}${r}${n.search}${n.hash}`}const Rs={"catalog/product/edit":"product-edit","catalog/product/index":"product-grid","catalog/product/grid":"product-grid","catalog/category/index":"category","catalog/category/edit":"category","customer/index/index":"customer"};function Ps(t){var e;try{return new URL(t).pathname}catch{return((e=t.split("#")[0])==null?void 0:e.split("?")[0])??""}}function Ms(t){var l;const e=Ps(t),n=e.split("/").filter(Boolean),r=n[1]??"",a=n[2]??"",o=n[3]??"",i=[r,a,o].filter(Boolean).join("/"),s=(l=/\/id\/(\d+)(?:\/|$)/.exec(e))==null?void 0:l[1],c={module:r,controller:a,action:o,route:i,area:Rs[i]??"other"};return s&&(c.productId=s),c}const da={name:"product[name]",short_description:"product[short_description]"},Ds={name:"Name",short_description:"Short Description"},Us=["name","short_description"];function Ge(t){return Ms(t).area==="product-edit"}function Bs(t){return`input[name="${da[t]}"], textarea[name="${da[t]}"]`}function qs(t){return document.querySelector(Bs(t))}function je(){const t=document.querySelector('input[name="product[sku]"]');return(t==null?void 0:t.value.trim())??""}function $s(t){return(t==null?void 0:t.value)??""}function Hs(t){const e=Us.map(n=>({kind:n,label:Ds[n],value:$s(qs(n))}));return{isProductEditPage:Ge(location.href),pageSku:je(),storeView:t,fields:e}}function Vs(t){return t&&t.__esModule&&Object.prototype.hasOwnProperty.call(t,"default")?t.default:t}var Nt={exports:{}},Fs=Nt.exports,ua;function zs(){return ua||(ua=1,(function(t,e){(function(n,r){r(t)})(typeof globalThis<"u"?globalThis:typeof self<"u"?self:Fs,function(n){if(!(globalThis.chrome&&globalThis.chrome.runtime&&globalThis.chrome.runtime.id))throw new Error("This script should only be loaded in a browser extension.");if(globalThis.browser&&globalThis.browser.runtime&&globalThis.browser.runtime.id)n.exports=globalThis.browser;else{const r="The message port closed before a response was received.",a=o=>{const i={alarms:{clear:{minArgs:0,maxArgs:1},clearAll:{minArgs:0,maxArgs:0},get:{minArgs:0,maxArgs:1},getAll:{minArgs:0,maxArgs:0}},bookmarks:{create:{minArgs:1,maxArgs:1},get:{minArgs:1,maxArgs:1},getChildren:{minArgs:1,maxArgs:1},getRecent:{minArgs:1,maxArgs:1},getSubTree:{minArgs:1,maxArgs:1},getTree:{minArgs:0,maxArgs:0},move:{minArgs:2,maxArgs:2},remove:{minArgs:1,maxArgs:1},removeTree:{minArgs:1,maxArgs:1},search:{minArgs:1,maxArgs:1},update:{minArgs:2,maxArgs:2}},browserAction:{disable:{minArgs:0,maxArgs:1,fallbackToNoCallback:!0},enable:{minArgs:0,maxArgs:1,fallbackToNoCallback:!0},getBadgeBackgroundColor:{minArgs:1,maxArgs:1},getBadgeText:{minArgs:1,maxArgs:1},getPopup:{minArgs:1,maxArgs:1},getTitle:{minArgs:1,maxArgs:1},openPopup:{minArgs:0,maxArgs:0},setBadgeBackgroundColor:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0},setBadgeText:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0},setIcon:{minArgs:1,maxArgs:1},setPopup:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0},setTitle:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0}},browsingData:{remove:{minArgs:2,maxArgs:2},removeCache:{minArgs:1,maxArgs:1},removeCookies:{minArgs:1,maxArgs:1},removeDownloads:{minArgs:1,maxArgs:1},removeFormData:{minArgs:1,maxArgs:1},removeHistory:{minArgs:1,maxArgs:1},removeLocalStorage:{minArgs:1,maxArgs:1},removePasswords:{minArgs:1,maxArgs:1},removePluginData:{minArgs:1,maxArgs:1},settings:{minArgs:0,maxArgs:0}},commands:{getAll:{minArgs:0,maxArgs:0}},contextMenus:{remove:{minArgs:1,maxArgs:1},removeAll:{minArgs:0,maxArgs:0},update:{minArgs:2,maxArgs:2}},cookies:{get:{minArgs:1,maxArgs:1},getAll:{minArgs:1,maxArgs:1},getAllCookieStores:{minArgs:0,maxArgs:0},remove:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}},devtools:{inspectedWindow:{eval:{minArgs:1,maxArgs:2,singleCallbackArg:!1}},panels:{create:{minArgs:3,maxArgs:3,singleCallbackArg:!0},elements:{createSidebarPane:{minArgs:1,maxArgs:1}}}},downloads:{cancel:{minArgs:1,maxArgs:1},download:{minArgs:1,maxArgs:1},erase:{minArgs:1,maxArgs:1},getFileIcon:{minArgs:1,maxArgs:2},open:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0},pause:{minArgs:1,maxArgs:1},removeFile:{minArgs:1,maxArgs:1},resume:{minArgs:1,maxArgs:1},search:{minArgs:1,maxArgs:1},show:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0}},extension:{isAllowedFileSchemeAccess:{minArgs:0,maxArgs:0},isAllowedIncognitoAccess:{minArgs:0,maxArgs:0}},history:{addUrl:{minArgs:1,maxArgs:1},deleteAll:{minArgs:0,maxArgs:0},deleteRange:{minArgs:1,maxArgs:1},deleteUrl:{minArgs:1,maxArgs:1},getVisits:{minArgs:1,maxArgs:1},search:{minArgs:1,maxArgs:1}},i18n:{detectLanguage:{minArgs:1,maxArgs:1},getAcceptLanguages:{minArgs:0,maxArgs:0}},identity:{launchWebAuthFlow:{minArgs:1,maxArgs:1}},idle:{queryState:{minArgs:1,maxArgs:1}},management:{get:{minArgs:1,maxArgs:1},getAll:{minArgs:0,maxArgs:0},getSelf:{minArgs:0,maxArgs:0},setEnabled:{minArgs:2,maxArgs:2},uninstallSelf:{minArgs:0,maxArgs:1}},notifications:{clear:{minArgs:1,maxArgs:1},create:{minArgs:1,maxArgs:2},getAll:{minArgs:0,maxArgs:0},getPermissionLevel:{minArgs:0,maxArgs:0},update:{minArgs:2,maxArgs:2}},pageAction:{getPopup:{minArgs:1,maxArgs:1},getTitle:{minArgs:1,maxArgs:1},hide:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0},setIcon:{minArgs:1,maxArgs:1},setPopup:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0},setTitle:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0},show:{minArgs:1,maxArgs:1,fallbackToNoCallback:!0}},permissions:{contains:{minArgs:1,maxArgs:1},getAll:{minArgs:0,maxArgs:0},remove:{minArgs:1,maxArgs:1},request:{minArgs:1,maxArgs:1}},runtime:{getBackgroundPage:{minArgs:0,maxArgs:0},getPlatformInfo:{minArgs:0,maxArgs:0},openOptionsPage:{minArgs:0,maxArgs:0},requestUpdateCheck:{minArgs:0,maxArgs:0},sendMessage:{minArgs:1,maxArgs:3},sendNativeMessage:{minArgs:2,maxArgs:2},setUninstallURL:{minArgs:1,maxArgs:1}},sessions:{getDevices:{minArgs:0,maxArgs:1},getRecentlyClosed:{minArgs:0,maxArgs:1},restore:{minArgs:0,maxArgs:1}},storage:{local:{clear:{minArgs:0,maxArgs:0},get:{minArgs:0,maxArgs:1},getBytesInUse:{minArgs:0,maxArgs:1},remove:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}},managed:{get:{minArgs:0,maxArgs:1},getBytesInUse:{minArgs:0,maxArgs:1}},sync:{clear:{minArgs:0,maxArgs:0},get:{minArgs:0,maxArgs:1},getBytesInUse:{minArgs:0,maxArgs:1},remove:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}}},tabs:{captureVisibleTab:{minArgs:0,maxArgs:2},create:{minArgs:1,maxArgs:1},detectLanguage:{minArgs:0,maxArgs:1},discard:{minArgs:0,maxArgs:1},duplicate:{minArgs:1,maxArgs:1},executeScript:{minArgs:1,maxArgs:2},get:{minArgs:1,maxArgs:1},getCurrent:{minArgs:0,maxArgs:0},getZoom:{minArgs:0,maxArgs:1},getZoomSettings:{minArgs:0,maxArgs:1},goBack:{minArgs:0,maxArgs:1},goForward:{minArgs:0,maxArgs:1},highlight:{minArgs:1,maxArgs:1},insertCSS:{minArgs:1,maxArgs:2},move:{minArgs:2,maxArgs:2},query:{minArgs:1,maxArgs:1},reload:{minArgs:0,maxArgs:2},remove:{minArgs:1,maxArgs:1},removeCSS:{minArgs:1,maxArgs:2},sendMessage:{minArgs:2,maxArgs:3},setZoom:{minArgs:1,maxArgs:2},setZoomSettings:{minArgs:1,maxArgs:2},update:{minArgs:1,maxArgs:2}},topSites:{get:{minArgs:0,maxArgs:0}},webNavigation:{getAllFrames:{minArgs:1,maxArgs:1},getFrame:{minArgs:1,maxArgs:1}},webRequest:{handlerBehaviorChanged:{minArgs:0,maxArgs:0}},windows:{create:{minArgs:0,maxArgs:1},get:{minArgs:1,maxArgs:2},getAll:{minArgs:0,maxArgs:1},getCurrent:{minArgs:0,maxArgs:1},getLastFocused:{minArgs:0,maxArgs:1},remove:{minArgs:1,maxArgs:1},update:{minArgs:2,maxArgs:2}}};if(Object.keys(i).length===0)throw new Error("api-metadata.json has not been included in browser-polyfill");class s extends WeakMap{constructor(b,C=void 0){super(C),this.createItem=b}get(b){return this.has(b)||this.set(b,this.createItem(b)),super.get(b)}}const c=h=>h&&typeof h=="object"&&typeof h.then=="function",l=(h,b)=>(...C)=>{o.runtime.lastError?h.reject(new Error(o.runtime.lastError.message)):b.singleCallbackArg||C.length<=1&&b.singleCallbackArg!==!1?h.resolve(C[0]):h.resolve(C)},d=h=>h==1?"argument":"arguments",u=(h,b)=>function(R,...M){if(M.length<b.minArgs)throw new Error(`Expected at least ${b.minArgs} ${d(b.minArgs)} for ${h}(), got ${M.length}`);if(M.length>b.maxArgs)throw new Error(`Expected at most ${b.maxArgs} ${d(b.maxArgs)} for ${h}(), got ${M.length}`);return new Promise(($,H)=>{if(b.fallbackToNoCallback)try{R[h](...M,l({resolve:$,reject:H},b))}catch(T){console.warn(`${h} API method doesn't seem to support the callback parameter, falling back to call it without a callback: `,T),R[h](...M),b.fallbackToNoCallback=!1,b.noCallback=!0,$()}else b.noCallback?(R[h](...M),$()):R[h](...M,l({resolve:$,reject:H},b))})},m=(h,b,C)=>new Proxy(b,{apply(R,M,$){return C.call(M,h,...$)}});let p=Function.call.bind(Object.prototype.hasOwnProperty);const x=(h,b={},C={})=>{let R=Object.create(null),M={has(H,T){return T in h||T in R},get(H,T,B){if(T in R)return R[T];if(!(T in h))return;let _=h[T];if(typeof _=="function")if(typeof b[T]=="function")_=m(h,h[T],b[T]);else if(p(C,T)){let W=u(T,C[T]);_=m(h,h[T],W)}else _=_.bind(h);else if(typeof _=="object"&&_!==null&&(p(b,T)||p(C,T)))_=x(_,b[T],C[T]);else if(p(C,"*"))_=x(_,b[T],C["*"]);else return Object.defineProperty(R,T,{configurable:!0,enumerable:!0,get(){return h[T]},set(W){h[T]=W}}),_;return R[T]=_,_},set(H,T,B,_){return T in R?R[T]=B:h[T]=B,!0},defineProperty(H,T,B){return Reflect.defineProperty(R,T,B)},deleteProperty(H,T){return Reflect.deleteProperty(R,T)}},$=Object.create(h);return new Proxy($,M)},g=h=>({addListener(b,C,...R){b.addListener(h.get(C),...R)},hasListener(b,C){return b.hasListener(h.get(C))},removeListener(b,C){b.removeListener(h.get(C))}}),f=new s(h=>typeof h!="function"?h:function(C){const R=x(C,{},{getContent:{minArgs:0,maxArgs:0}});h(R)}),A=new s(h=>typeof h!="function"?h:function(C,R,M){let $=!1,H,T=new Promise(he=>{H=function(oe){$=!0,he(oe)}}),B;try{B=h(C,R,H)}catch(he){B=Promise.reject(he)}const _=B!==!0&&c(B);if(B!==!0&&!_&&!$)return!1;const W=he=>{he.then(oe=>{M(oe)},oe=>{let Mr;oe&&(oe instanceof Error||typeof oe.message=="string")?Mr=oe.message:Mr="An unexpected error occurred",M({__mozWebExtensionPolyfillReject__:!0,message:Mr})}).catch(oe=>{console.error("Failed to send onMessage rejected reply",oe)})};return W(_?B:T),!0}),w=({reject:h,resolve:b},C)=>{o.runtime.lastError?o.runtime.lastError.message===r?b():h(new Error(o.runtime.lastError.message)):C&&C.__mozWebExtensionPolyfillReject__?h(new Error(C.message)):b(C)},I=(h,b,C,...R)=>{if(R.length<b.minArgs)throw new Error(`Expected at least ${b.minArgs} ${d(b.minArgs)} for ${h}(), got ${R.length}`);if(R.length>b.maxArgs)throw new Error(`Expected at most ${b.maxArgs} ${d(b.maxArgs)} for ${h}(), got ${R.length}`);return new Promise((M,$)=>{const H=w.bind(null,{resolve:M,reject:$});R.push(H),C.sendMessage(...R)})},N={devtools:{network:{onRequestFinished:g(f)}},runtime:{onMessage:g(A),onMessageExternal:g(A),sendMessage:I.bind(null,"sendMessage",{minArgs:1,maxArgs:3})},tabs:{sendMessage:I.bind(null,"sendMessage",{minArgs:2,maxArgs:3})}},O={clear:{minArgs:1,maxArgs:1},get:{minArgs:1,maxArgs:1},set:{minArgs:1,maxArgs:1}};return i.privacy={network:{"*":O},services:{"*":O},websites:{"*":O}},x(o,N,i)};n.exports=a(chrome)}})})(Nt)),Nt.exports}var Gs=zs();const ee=Vs(Gs),Rt="theme",Pt="themeMagentoPages",Mt="themeAccent",Dt="themeCustom",js="(prefers-color-scheme: dark)",vn={light:{"--mhx-bg":"#f6f7f9","--mhx-surface":"#ffffff","--mhx-surface-2":"#f5f7fa","--mhx-border":"#e4e7eb","--mhx-border-2":"#cbd2d9","--mhx-ink":"#1f2933","--mhx-ink-2":"#3e4c59","--mhx-muted":"#7b8794","--mhx-muted-2":"#52606d","--mhx-accent":"#d81b60","--mhx-accent-2":"#c2185b","--mhx-tint":"#fce4ec","--mhx-tint-2":"#f8bbd0","--mhx-on-accent":"#ffffff","--mhx-ok":"#0b6e4f","--mhx-ok-bg":"#e6f4ea","--mhx-ok-border":"#b7dfc2","--mhx-bad":"#912018","--mhx-bad-bg":"#fdecea","--mhx-bad-border":"#f5b7b1","--mhx-warn-bg":"#fff8e1","--mhx-warn-border":"#ffe082","--mhx-prio-high":"#d93025","--mhx-prio-medium":"#f9ab00","--mhx-prio-low":"#f57f17","--mhx-shadow":"0 4px 16px rgba(0, 0, 0, 0.18)"},dark:{"--mhx-bg":"#14181d","--mhx-surface":"#1c2229","--mhx-surface-2":"#232b34","--mhx-border":"#2e3843","--mhx-border-2":"#3d4956","--mhx-ink":"#e7ecf1","--mhx-ink-2":"#c4cdd7","--mhx-muted":"#98a5b3","--mhx-muted-2":"#aebac6","--mhx-accent":"#ff5c94","--mhx-accent-2":"#ff86b0","--mhx-tint":"#3a1e29","--mhx-tint-2":"#4a2531","--mhx-on-accent":"#12161b","--mhx-ok":"#58d3a4","--mhx-ok-bg":"#16302a","--mhx-ok-border":"#2b5847","--mhx-bad":"#ff9a91","--mhx-bad-bg":"#3a211f","--mhx-bad-border":"#6b3a35","--mhx-warn-bg":"#3a3320","--mhx-warn-border":"#6b5a24","--mhx-prio-high":"#ff6b5e","--mhx-prio-medium":"#ffc247","--mhx-prio-low":"#ff9f1c","--mhx-shadow":"0 4px 16px rgba(0, 0, 0, 0.5)"},"high-contrast":{"--mhx-bg":"#000000","--mhx-surface":"#0a0a0a","--mhx-surface-2":"#1a1a1a","--mhx-border":"#ffffff","--mhx-border-2":"#cccccc","--mhx-ink":"#ffffff","--mhx-ink-2":"#e0e0e0","--mhx-muted":"#a0a0a0","--mhx-muted-2":"#808080","--mhx-accent":"#ffff00","--mhx-accent-2":"#cccc00","--mhx-tint":"#1a1a00","--mhx-tint-2":"#333300","--mhx-on-accent":"#000000","--mhx-ok":"#00ff00","--mhx-ok-bg":"#001a00","--mhx-ok-border":"#006600","--mhx-bad":"#ff0000","--mhx-bad-bg":"#1a0000","--mhx-bad-border":"#660000","--mhx-warn-bg":"#1a1a00","--mhx-warn-border":"#cccc00","--mhx-prio-high":"#ff0000","--mhx-prio-medium":"#ffff00","--mhx-prio-low":"#ffffff","--mhx-shadow":"0 4px 16px rgba(0, 0, 0, 1)"},sepia:{"--mhx-bg":"#f4ecd8","--mhx-surface":"#fdf6e3","--mhx-surface-2":"#efe5d5","--mhx-border":"#d4c3a5","--mhx-border-2":"#c9b891","--mhx-ink":"#3e2723","--mhx-ink-2":"#5d4037","--mhx-muted":"#8d6e63","--mhx-muted-2":"#a1887f","--mhx-accent":"#795548","--mhx-accent-2":"#5d4037","--mhx-tint":"#d7ccc8","--mhx-tint-2":"#bcaaa4","--mhx-on-accent":"#ffffff","--mhx-ok":"#2e7d32","--mhx-ok-bg":"#e8f5e9","--mhx-ok-border":"#a5d6a7","--mhx-bad":"#c62828","--mhx-bad-bg":"#ffebee","--mhx-bad-border":"#ef9a9a","--mhx-warn-bg":"#fff3e0","--mhx-warn-border":"#ffcc80","--mhx-prio-high":"#c62828","--mhx-prio-medium":"#f9a825","--mhx-prio-low":"#fbc02d","--mhx-shadow":"0 4px 16px rgba(0, 0, 0, 0.15)"},"blue-tinted":{"--mhx-bg":"#0f172a","--mhx-surface":"#1e293b","--mhx-surface-2":"#334155","--mhx-border":"#475569","--mhx-border-2":"#64748b","--mhx-ink":"#f1f5f9","--mhx-ink-2":"#cbd5e1","--mhx-muted":"#94a3b8","--mhx-muted-2":"#64748b","--mhx-accent":"#3b82f6","--mhx-accent-2":"#2563eb","--mhx-tint":"#1e3a5f","--mhx-tint-2":"#2c5282","--mhx-on-accent":"#ffffff","--mhx-ok":"#22c55e","--mhx-ok-bg":"#064e3b","--mhx-ok-border":"#10b981","--mhx-bad":"#ef4444","--mhx-bad-bg":"#450a0a","--mhx-bad-border":"#dc2626","--mhx-warn-bg":"#713f12","--mhx-warn-border":"#f59e0b","--mhx-prio-high":"#ef4444","--mhx-prio-medium":"#f59e0b","--mhx-prio-low":"#eab308","--mhx-shadow":"0 4px 16px rgba(0, 0, 0, 0.4)"}};function Ze(t){const e=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t.trim()),n=e==null?void 0:e[1];if(!n)return null;const r=n.length===3?n.split("").map(a=>a+a).join(""):n;return{r:parseInt(r.slice(0,2),16),g:parseInt(r.slice(2,4),16),b:parseInt(r.slice(4,6),16)}}function Cn({r:t,g:e,b:n}){const r=a=>Math.max(0,Math.min(255,Math.round(a))).toString(16).padStart(2,"0");return`#${r(t)}${r(e)}${r(n)}`}function Re(t){return typeof t=="string"&&Ze(t)!==null}function Ut(t){return Zs(t)>.5?"#12161b":"#ffffff"}function te(t,e,n){const r=Ze(t),a=Ze(e);return!r||!a?t:Cn({r:r.r+(a.r-r.r)*n,g:r.g+(a.g-r.g)*n,b:r.b+(a.b-r.b)*n})}function Zs(t){const e=Ze(t);if(!e)return 1;const n=r=>{const a=r/255;return a<=.03928?a/12.92:((a+.055)/1.055)**2.4};return .2126*n(e.r)+.7152*n(e.g)+.0722*n(e.b)}function rt(t){return t==="dark"||t==="high-contrast"||t==="blue-tinted"}function Ks(t){return rt(t)?"dark":"light"}function Ws(t,e){const n=vn[e],r=n["--mhx-surface"]??"#ffffff",a=Re(t)?Ze(t):null,o=a?Cn(a):n["--mhx-accent"]??t,i=rt(e)?"#ffffff":"#000000";return{"--mhx-accent":o,"--mhx-accent-2":te(o,i,.18),"--mhx-tint":te(r,o,rt(e)?.22:.12),"--mhx-tint-2":te(r,o,rt(e)?.34:.22),"--mhx-on-accent":Ut(o)}}function Ys(t,e){const n=Re(t)?Ze(t):null;if(!n)return{};const r=Cn(n),a=vn[e],o=a["--mhx-surface"]??"#ffffff",i=a["--mhx-bg"]??"#f6f7f9",s=a["--mhx-border"]??"#e4e7eb",c=rt(e),l=c?"#000000":"#ffffff",d=te(i,r,c?.25:.15),u=te(o,r,c?.2:.1),m=Ut(d);return{"--mhx-bg":d,"--mhx-surface":u,"--mhx-surface-2":te(u,l,.15),"--mhx-border":te(s,r,.35),"--mhx-border-2":te(s,r,.5),"--mhx-ink":m,"--mhx-ink-2":te(m,l,.3),"--mhx-muted":te(m,l,.55),"--mhx-accent":r,"--mhx-accent-2":te(r,l,.18),"--mhx-on-accent":Ut(r),"--mhx-tint":te(u,r,c?.22:.12),"--mhx-tint-2":te(u,r,c?.34:.22)}}function ma(t){return t==="system"||t==="light"||t==="dark"||t==="high-contrast"||t==="sepia"||t==="blue-tinted"}function Xs(){return typeof window>"u"||typeof window.matchMedia!="function"?"light":window.matchMedia(js).matches?"dark":"light"}function pa(t){return t==="system"?Xs():t}function Js(t,e,n,r){const a=pa(e),o={...vn[a]};n&&Object.assign(o,Ws(n,a)),r&&Object.assign(o,Ys(r,a));for(const[i,s]of Object.entries(o))t.style.setProperty(i,s);return t.style.colorScheme=Ks(a),t.dataset.theme=a,t.dataset.themePreference=e,a}async function Qs(){try{const t=await ee.storage.local.get([Rt]),e=t==null?void 0:t[Rt];return ma(e)?e:"system"}catch{return"system"}}async function ec(){try{const t=await ee.storage.local.get([Mt]),e=t==null?void 0:t[Mt];return Re(e)?e:null}catch{return null}}async function tc(){try{const t=await ee.storage.local.get([Dt]),e=t==null?void 0:t[Dt];return Re(e)?e:null}catch{return null}}async function nc(){try{const t=await ee.storage.local.get([Pt]);return(t==null?void 0:t[Pt])===!0}catch{return!1}}const Bt="toolkitColors",ha=[{id:"accent",cssVar:"--mhx-pg-accent",label:"Accent",hint:"Focus rings, active segments, accent buttons. Auto = the theme accent.",seed:"#d81b60",previewFallbackVar:"--mhx-accent"},{id:"danger",cssVar:"--mhx-pg-danger",label:"Danger",hint:"Delete / remove actions, error badges and toasts.",seed:"#e5484d",previewFallbackVar:"--mhx-bad"},{id:"ok",cssVar:"--mhx-pg-ok",label:"Success",hint:"Copied / done feedback and success badges.",seed:"#16a34a",previewFallbackVar:"--mhx-ok"}],Tn={accent:null,danger:null,ok:null},fa="--mhx-pg-on-accent";function ga(t){const e=t??{},n={...Tn};for(const r of ha){const a=e[r.id];n[r.id]=Re(a)?a:null}return n}async function rc(){try{const t=await ee.storage.local.get([Bt]);return ga(t==null?void 0:t[Bt])}catch{return{...Tn}}}function ac(t,e){for(const n of ha){const r=e[n.id];r?(t.style.setProperty(n.cssVar,r),n.id==="accent"&&t.style.setProperty(fa,Ut(r))):(t.style.removeProperty(n.cssVar),n.id==="accent"&&t.style.removeProperty(fa))}}function oc(t=document.documentElement,e){let n={...Tn};const r=()=>ac(t,n);rc().then(o=>{n=o,r()});const a=(o,i)=>{var s;i!=="local"||!(Bt in o)||(n=ga((s=o[Bt])==null?void 0:s.newValue),r())};return ee.storage.onChanged.addListener(a),()=>ee.storage.onChanged.removeListener(a)}const ic="mhx-magento-theme",sc="mhx-magento-accent",xa="(prefers-color-scheme: dark)",cc="mhxPage",lc="--mhx-pg-page-ink",dc=.4,uc=`
/* --- page shell ------------------------------------------------------- */
html, body { background: var(--mhx-bg) !important; color: var(--mhx-ink) !important; }
.page-wrapper, .page-content, .page-main, .main-col,
.admin__old, .content-header { background: var(--mhx-bg) !important; color: var(--mhx-ink) !important; }

/* --- header & page actions -------------------------------------------- */
.page-header { background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border) !important; }
.page-title, .page-title span, .admin__page-heading, .content-header h3 { color: var(--mhx-ink) !important; background: transparent !important; }
.page-main-actions, .page-actions { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; color: var(--mhx-ink) !important; }
.page-actions .action-default, .page-main-actions .action-default { background: var(--mhx-surface-2) !important; border-color: var(--mhx-border-2) !important; color: var(--mhx-ink) !important; }
.page-actions .action-primary, .page-main-actions .action-primary,
.action-primary { background: var(--mhx-accent) !important; border-color: var(--mhx-accent) !important; color: var(--mhx-on-accent) !important; }

/* --- panels, fieldsets, tabs ------------------------------------------ */
.admin__fieldset, fieldset, .admin__field, .admin__field-control, .admin__fieldset-wrapper,
.entry-edit, .fieldset-wrapper, .box, .admin__collapsible-block { background: transparent !important; color: var(--mhx-ink) !important; }
.admin__fieldset > .admin__fieldset-wrapper-title, .admin__collapsible-title,
.admin__fieldset-wrapper-title { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; color: var(--mhx-ink) !important; }
.admin__field-label, .admin__fieldset-wrapper-title strong, label, .label { color: var(--mhx-ink-2) !important; }
.admin__field-note, .admin__field-error + .admin__field-note, .note { color: var(--mhx-muted) !important; }
.admin__page-nav, .admin__page-nav-items, .admin__page-nav-title { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; }
.admin__page-nav-item, .admin__page-nav-link { color: var(--mhx-ink) !important; }
.admin__page-nav-item._active, .admin__page-nav-link._active { background: var(--mhx-tint) !important; color: var(--mhx-accent-2) !important; }

/* --- form controls ---------------------------------------------------- */
.admin__control-text, .admin__control-select, .admin__control-textarea,
.admin__control-multiselect, .admin__control-file, .admin__control-tel,
.admin__field-control input, .admin__field-control select, .admin__field-control textarea,
.input-text, select, textarea {
  background: var(--mhx-surface) !important;
  color: var(--mhx-ink) !important;
  border-color: var(--mhx-border-2) !important;
}
.admin__control-text:focus, .admin__control-select:focus, .admin__control-textarea:focus { border-color: var(--mhx-accent) !important; }

/* --- grids ------------------------------------------------------------ */
.admin__data-grid-wrap, .admin__data-grid-outer-wrap, .admin__data-grid-header,
.data-grid, .admin__table-primary, .admin__table-secondary { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; color: var(--mhx-ink) !important; }
table.data-grid thead th, .admin__table-primary thead th { background: var(--mhx-surface-2) !important; color: var(--mhx-ink-2) !important; border-color: var(--mhx-border) !important; }
table.data-grid tbody td, .admin__table-primary tbody td { background: transparent !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border) !important; }
table.data-grid tbody tr:hover > td, table.data-grid tbody tr._odd > td { background: var(--mhx-surface-2) !important; }
.data-grid-filters input, .data-grid-filters select, .data-grid-search-control input { background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border-2) !important; }
.admin__data-grid-toolbar, .sticky-header { background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; }
.admin__control-support-text { color: var(--mhx-muted) !important; }

/* --- buttons & dropdowns --------------------------------------------- */
.action-default, .action-secondary, .admin__action-dropdown,
.admin__action-multiselect, .admin__action-dropdown-text { background: var(--mhx-surface-2) !important; border-color: var(--mhx-border-2) !important; color: var(--mhx-ink) !important; }
.action-default:hover, .admin__action-dropdown:hover { background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; }
/* --- action dropdown menus, including nested submenus -------------------
   Magento renders the bulk "Actions" menu as ul.action-menu with items as
   <span class="action-menu-item">, and puts a submenu on its own white
   background one level deeper. Direct-child selectors miss all of that, which
   is how a maroon highlight ended up on a white submenu. Descendant selectors
   everywhere so every level is themed. ---------------------------------- */
.admin__action-dropdown-menu, .admin__action-multiselect-menu, .action-menu,
.admin__action-dropdown-menu ul, .admin__action-multiselect-menu ul, .action-menu ul {
  background: var(--mhx-surface) !important;
  border-color: var(--mhx-border) !important;
  color: var(--mhx-ink) !important;
}
.admin__action-dropdown-menu li, .admin__action-multiselect-menu li, .action-menu li,
.admin__action-dropdown-menu li > a, .admin__action-dropdown-menu li > span,
.admin__action-multiselect-menu li > a, .admin__action-multiselect-menu li > span,
.action-menu li > a, .action-menu li > span, .action-menu-item {
  background: transparent !important;
  color: var(--mhx-ink) !important;
}
/* Hover and open states: keep the accent wash but always the readable ink. */
.admin__action-dropdown-menu li:hover, .admin__action-multiselect-menu li:hover,
.action-menu li:hover, .action-menu li._active, .action-menu li.active,
.admin__action-dropdown-menu li._active, .admin__action-dropdown-menu li.active {
  background: var(--mhx-tint) !important;
}
.admin__action-dropdown-menu li:hover > a, .admin__action-dropdown-menu li:hover > span,
.action-menu li:hover > a, .action-menu li:hover > span, .action-menu li:hover .action-menu-item,
.admin__action-dropdown-menu li._active > span, .action-menu li._active > span {
  background: transparent !important;
  color: var(--mhx-ink) !important;
}

/* --- modals, menus, misc surfaces ------------------------------------ */
.modal-popup .modal-inner-wrap, .modal-slide .modal-inner-wrap,
.modal-popup .modal-header, .modal-popup .modal-content, .modal-popup .modal-footer {
  background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border) !important;
}
.admin__data-grid-loading-mask { background: color-mix(in srgb, var(--mhx-bg) 70%, transparent) !important; }
.admin__field-error, .message-error, .message-warning, .message-success, .message-notice { /* left to Magento */ }

/* --- breadcrumbs ------------------------------------------------------- */
.admin__breadcrumbs, .admin__breadcrumbs li { color: var(--mhx-muted) !important; }
.admin__breadcrumbs a { color: var(--mhx-accent) !important; }

/* --- date picker / calendar ------------------------------------------- */
.admin__date-picker, .calendar,
.admin__date-picker .calendar-header,
.admin__date-picker .calendar-day,
.admin__date-picker .calendar-month,
.admin__date-picker .calendar-year {
  background: var(--mhx-surface) !important;
  color: var(--mhx-ink) !important;
  border-color: var(--mhx-border) !important;
}
.admin__date-picker .calendar-day:hover,
.admin__date-picker .calendar-day._selected {
  background: var(--mhx-tint) !important;
  color: var(--mhx-accent-2) !important;
}

/* --- tooltips & popovers ---------------------------------------------- */
.tooltip, .popover, .admin__tooltip,
.admin__field-description, .admin__hint {
  background: var(--mhx-surface-2) !important;
  color: var(--mhx-ink-2) !important;
  border-color: var(--mhx-border) !important;
}

/* --- store view switcher ---------------------------------------------- */
.admin__scope-old, .store-switcher,
.admin__scope-old select, .store-switcher select {
  background: var(--mhx-surface) !important;
  color: var(--mhx-ink) !important;
  border-color: var(--mhx-border-2) !important;
}

/* --- pager controls ---------------------------------------------------
   The arrows and the "per page" label are Magento's own buttons. Without them
   here they stay light-authored and sit in the themed row as a third system,
   next to our injected per-page control. */
.admin__data-grid-pager, .pager,
.admin__data-grid-pager .pages li,
.admin__data-grid-pager .pages a,
.admin__data-grid-pager .current,
.admin__data-grid-pager .amount,
.admin__data-grid-pager .label,
.admin__data-grid-pager .action-previous,
.admin__data-grid-pager .action-next,
.admin__data-grid-pager-wrap .selectmenu {
  background: var(--mhx-surface) !important;
  color: var(--mhx-ink) !important;
  border-color: var(--mhx-border) !important;
}
.admin__data-grid-pager .admin__control-support-text {
  background: transparent !important;
  color: var(--mhx-ink-2) !important;
  border-color: var(--mhx-border) !important;
}
.admin__data-grid-pager .pages a:hover,
.admin__data-grid-pager .pages a._active,
.admin__data-grid-pager .action-previous:hover,
.admin__data-grid-pager .action-next:hover {
  background: var(--mhx-tint) !important;
  color: var(--mhx-accent-2) !important;
}

/* --- row actions in grids --------------------------------------------- */
.admin__row-actions a,
.action-view, .action-edit, .action-delete,
.action-select, .action-license {
  color: var(--mhx-ink) !important;
}
.admin__row-actions a:hover,
.action-view:hover, .action-edit:hover, .action-delete:hover {
  color: var(--mhx-accent-2) !important;
}

/* --- mass action dropdown --------------------------------------------- */
.admin__mass-action, .admin__mass-action select {
  background: var(--mhx-surface) !important;
  color: var(--mhx-ink) !important;
  border-color: var(--mhx-border-2) !important;
}

/* --- collapse / expand toggles ---------------------------------------- */
.admin__collapsible-toggle, .admin__collapsible-trigger {
  color: var(--mhx-ink) !important;
}
.admin__collapsible-toggle:hover, .admin__collapsible-trigger:hover {
  color: var(--mhx-accent) !important;
}

/* --- notification banners --------------------------------------------- */
.admin__notification, .notice, .admin__notice {
  background: var(--mhx-surface-2) !important;
  color: var(--mhx-ink) !important;
  border-color: var(--mhx-border) !important;
}

/* --- select all / header checkbox ------------------------------------ */
.admin__data-grid-wrap thead input[type="checkbox"],
.admin__data-grid-wrap thead input[type="radio"] {
  accent-color: var(--mhx-accent) !important;
}

`,mc=`
/* links: row links, toolbar links, "Clear all" and friends */
.page-wrapper a:not(.logo):not(.admin__action-dropdown):not(.action-primary):not(.action-default):not(.action-menu-item) { color: var(--mhx-accent) !important; }
.page-wrapper a:not(.logo):not(.admin__action-dropdown):not(.action-primary):not(.action-default):not(.action-menu-item):hover { color: var(--mhx-accent-2) !important; }

/* primary buttons: "Add Product", "Save", grid toolbar primaries */
.action-primary, .page-actions .action-primary, .page-actions-buttons .action-primary,
.admin__data-grid-toolbar .action-primary {
  background: var(--mhx-accent) !important;
  border-color: var(--mhx-accent) !important;
  color: var(--mhx-on-accent) !important;
}
.action-primary:hover, .action-primary:focus {
  background: var(--mhx-accent-2) !important;
  border-color: var(--mhx-accent-2) !important;
  color: var(--mhx-on-accent) !important;
}

/* secondary buttons pick the accent up on interaction, not at rest */
.action-default:hover, .action-secondary:hover, .admin__action-dropdown:hover {
  border-color: var(--mhx-accent) !important;
  color: var(--mhx-accent) !important;
}

/* selected / active states */
.admin__action-dropdown._active .admin__action-dropdown-text,
.admin__page-nav-link._active, .admin__page-nav-item._active { color: var(--mhx-accent) !important; }
.admin__page-nav-link._active, .admin__page-nav-item._active {
  background: var(--mhx-tint) !important;
  border-color: var(--mhx-accent) !important;
}

/* focus rings */
.admin__control-text:focus, .admin__control-select:focus, .admin__control-textarea:focus,
.data-grid-filters input:focus, .data-grid-filters select:focus, .data-grid-search-control input:focus {
  border-color: var(--mhx-accent) !important;
  box-shadow: 0 0 0 1px var(--mhx-accent) !important;
}

/* native controls */
.page-wrapper input[type="checkbox"], .page-wrapper input[type="radio"] { accent-color: var(--mhx-accent) !important; }
`;function ba(t){const e=t.match(/rgba?\(([^)]+)\)/);if(!e)return null;const n=e[1];if(!n)return null;const r=n.split(",").map(o=>Number.parseFloat(o));if(r.length<3||r.some(o=>Number.isNaN(o)))return null;const a=o=>{const i=o/255;return i<=.03928?i/12.92:((i+.055)/1.055)**2.4};return{lum:.2126*a(r[0]??0)+.7152*a(r[1]??0)+.0722*a(r[2]??0),alpha:r.length>3?r[3]??1:1}}function pc(){const t=document.documentElement,e=document.body;if(!e)return;const n=ba(getComputedStyle(e).backgroundColor),r=ba(getComputedStyle(t).backgroundColor),a=n&&n.alpha>0?n:r&&r.alpha>0?r:null,o=a?a.lum<dc:window.matchMedia(xa).matches;t.dataset[cc]=o?"dark":"light",t.style.setProperty(lc,getComputedStyle(e).color)}function Aa(t,e){const n=document.getElementById(t);if(!e){n==null||n.remove();return}if(n)return;const r=document.createElement("style");r.id=t,r.textContent=e,(document.head??document.documentElement).appendChild(r)}function hc(t,e,n=null,r=null){const a=t?pa(e):"light";Js(document.documentElement,a,n,r),Aa(ic,t?uc:null),Aa(sc,n?mc:null),pc()}function fc(t){let e=!1,n="system",r=null,a=null;const o=()=>hc(e,n,r,a);Promise.all([nc(),Qs(),ec(),tc()]).then(([l,d,u,m])=>{e=l,n=d,r=u,a=m,o()});const i=(l,d)=>{var m,p,x,g;if(d!=="local")return;let u=!1;if(Pt in l&&(e=((m=l[Pt])==null?void 0:m.newValue)===!0,u=!0),Rt in l){const f=(p=l[Rt])==null?void 0:p.newValue;n=ma(f)?f:"system",u=!0}if(Mt in l){const f=(x=l[Mt])==null?void 0:x.newValue;r=Re(f)?f:null,u=!0}if(Dt in l){const f=(g=l[Dt])==null?void 0:g.newValue;a=Re(f)?f:null,u=!0}u&&o()};ee.storage.onChanged.addListener(i);const s=window.matchMedia(xa),c=()=>{n==="system"&&e&&o()};return s.addEventListener("change",c),()=>{ee.storage.onChanged.removeListener(i),s.removeEventListener("change",c)}}const Sa=/\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/(\d+)(?:\/|$)/i;function gc(t){try{const e=new URL(t).pathname,n=e.match(Sa);return(n==null?void 0:n.index)===void 0?null:`${e.slice(0,n.index)}${n[0].replace(/\/$/,"")}`}catch{return null}}function Ea(t){var e;try{return((e=new URL(t).pathname.match(Sa))==null?void 0:e[1])??null}catch{return null}}const ya='[data-bind*="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"]',xc="mhx-pp-draft-scan";let ne;function bc(t){if(!t||typeof t!="object")return!1;const e=t;return e.version===1&&["ok","partial","unavailable","identity-mismatch"].includes(e.status)&&(typeof e.entityId=="string"||e.entityId===null)&&typeof e.routePath=="string"&&!!e.general&&typeof e.general=="object"&&!!e.locations&&Array.isArray(e.locations.rows)&&Array.isArray(e.locations.skippedPositions)&&!!e.items&&Array.isArray(e.items.rows)&&Array.isArray(e.items.skippedPositions)&&Array.isArray(e.warnings)}function wn(){ne==null||ne.destroy(),ne=void 0}function Ac(){const t=Ea(window.location.href),e=document.querySelector(ya);if(ne&&(!ne.panel.isConnected||ne.entityId!==t||ne.anchor!==e||!e||ne.panel.parentElement!==ne.host||e.parentElement!==ne.host)&&wn(),!t||!(e!=null&&e.parentElement)||ne)return;const n=document,r=window.location.pathname,a=gc(window.location.href)??"";let o=0;const i=document.createElement("section");i.id=xc,i.setAttribute("aria-label","Current Magento custom-option draft scan");const s=document.createElement("h2");s.textContent="Current Magento draft (read-only)";const c=document.createElement("p");c.textContent="Scans the current unsaved draft. It does not save or change Magento data.";const l=document.createElement("button");l.type="button",l.textContent="Scan current PP";const d=document.createElement("p");d.setAttribute("role","status"),d.setAttribute("aria-live","polite"),d.textContent="Scan when the custom-option form has finished loading.";const u=document.createElement("details"),m=document.createElement("summary");m.textContent="Snapshot";const p=document.createElement("pre");p.setAttribute("aria-label","Current custom-option draft snapshot"),u.append(m,p),i.append(s,c,l,d,u);const x=e.parentElement,g=x.querySelector(":scope > #mhx-pp-catalog");x.insertBefore(i,g??e);const f=N=>N===o&&n===document&&i.isConnected&&e.isConnected&&document.querySelector(ya)===e&&window.location.pathname===r&&Ea(window.location.href)===t,A=()=>{o+=1,l.disabled=!1,p.textContent="",d.textContent="The draft changed. Scan again to refresh the snapshot."},w=async()=>{const N=++o;l.disabled=!0,p.textContent="",d.textContent="Reading the current unsaved Magento draft…";try{const O={type:"SCAN_PP_DRAFT"},h=await chrome.runtime.sendMessage(O);if(!f(N))return;if(!bc(h)||h.entityId!==t||h.routePath!==a){d.textContent="The scan response was invalid or the page identity changed. Scan again.";return}if(h.status==="unavailable"){d.textContent=h.warnings.join(" ")||"The Magento draft is unavailable for scanning.",u.open=!1;return}d.textContent=`${h.status}: snapshot of Magento entity ${t}. Item parent values remain raw; no Notion or location assignment is inferred.`,p.textContent=JSON.stringify(h,null,2),u.open=!0}catch{if(!f(N))return;d.textContent="The scan could not complete. Retry after Magento has finished loading."}finally{f(N)&&(l.disabled=!1)}},I=()=>{w()};l.addEventListener("click",I),e.addEventListener("input",A,!0),e.addEventListener("change",A,!0),ne={panel:i,anchor:e,host:x,entityId:t,destroy:()=>{o+=1,l.removeEventListener("click",I),e.removeEventListener("input",A,!0),e.removeEventListener("change",A,!0),i.remove()}}}const Sc="mhx-nh",va="mhx-nh-native",Ca="mhx-enhance-select-styles",qt=new WeakMap;function Ec(){if(document.getElementById(Ca))return;const t=document.createElement("style");t.id=Ca,t.textContent=Tc,(document.head??document.documentElement).appendChild(t)}function Ta(t){const e=[],n=r=>{const a=(r.textContent??"").trim();r.value===""&&a===""||e.push({value:r.value,label:a||r.value,disabled:r.disabled})};for(const r of Array.from(t.children))if(r instanceof HTMLOptGroupElement)for(const a of Array.from(r.children))a instanceof HTMLOptionElement&&n(a);else r instanceof HTMLOptionElement&&n(r);return e}function wa(t,e){if(t.matches(":disabled"))return;const n=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value");n!=null&&n.set?n.set.call(t,e):t.value=e,t.dispatchEvent(new Event("input",{bubbles:!0})),t.dispatchEvent(new Event("change",{bubbles:!0}))}class _a{constructor(e,n,r,a){q(this,"select");q(this,"wrapper");q(this,"options");q(this,"parent");q(this,"nextSibling");q(this,"observer",null);q(this,"destroyed",!1);q(this,"active");q(this,"onNativeChange",()=>{this.render()});q(this,"onNativeFocus",()=>{this.focusReplacement()});this.select=e,this.options=n,this.parent=e.parentNode,this.nextSibling=e.nextSibling,this.wrapper=document.createElement("div"),this.wrapper.className=`${Sc} mhx-nh--${r}`,this.wrapper.setAttribute("data-mhx-nh","1"),this.active=a}closeSurface(){}focusReplacement(){}mount(){var e;this.destroyed||qt.has(this.select)||(Le(),Ec(),(e=this.select.parentNode)==null||e.insertBefore(this.wrapper,this.select),this.select.classList.add(va),this.wrapper.appendChild(this.select),this.build(),this.select.addEventListener("change",this.onNativeChange),this.select.addEventListener("focus",this.onNativeFocus),this.observer=new MutationObserver(()=>this.syncFromNative()),this.observer.observe(this.select,{childList:!0,subtree:!0}),qt.set(this.select,this),this.render())}syncFromNative(){this.destroyed||this.render()}isStale(){return this.destroyed||!this.select.isConnected}destroy(){var e;if(!this.destroyed){if(this.destroyed=!0,(e=this.observer)==null||e.disconnect(),this.observer=null,this.select.removeEventListener("change",this.onNativeChange),this.select.removeEventListener("focus",this.onNativeFocus),this.detachSurface(),qt.delete(this.select),this.select.classList.remove(va),this.parent){const n=this.nextSibling&&this.nextSibling.parentNode===this.parent?this.nextSibling:null;this.parent.insertBefore(this.select,n)}this.wrapper.remove()}}detachSurface(){}get currentValue(){return this.select.value}}class yc extends _a{constructor(n,r){super(n,r,"search",!0);q(this,"labelEl");q(this,"trigger");q(this,"popover");q(this,"search");q(this,"list");q(this,"activeIndex",-1);q(this,"open",!1);q(this,"onTriggerClick",n=>{n.preventDefault(),this.open?this.close():this.openPopover()});q(this,"onSearchInput",()=>{this.applyFilter()});q(this,"onSearchKeyDown",n=>{if(n.key==="ArrowDown")n.preventDefault(),this.moveCursor(1);else if(n.key==="ArrowUp")n.preventDefault(),this.moveCursor(-1);else if(n.key==="Enter"){n.preventDefault();const r=this.visibleItems()[this.activeIndex],a=r==null?void 0:r.dataset.value;a!==void 0&&(r==null?void 0:r.getAttribute("aria-disabled"))!=="true"&&this.choose(a)}else n.key==="Escape"&&(n.preventDefault(),this.close(),this.trigger.focus())});q(this,"onDocumentPointerDown",n=>{if(!this.open)return;const r=n.target;r instanceof Node&&this.wrapper.contains(r)||this.close()});this.trigger=document.createElement("button"),this.trigger.type="button",this.trigger.className="mhx-btn mhx-nh-trigger",this.trigger.setAttribute("aria-haspopup","listbox"),this.trigger.setAttribute("aria-expanded","false"),r.label&&this.trigger.setAttribute("aria-label",r.label),this.labelEl=document.createElement("span"),this.labelEl.className="mhx-nh-label";const a=document.createElement("span");a.className="mhx-nh-caret",a.setAttribute("aria-hidden","true"),this.trigger.append(this.labelEl,a),this.popover=document.createElement("div"),this.popover.className="mhx-pop mhx-nh-pop",this.popover.hidden=!0,this.search=document.createElement("input"),this.search.type="text",this.search.className="mhx-nh-search",this.search.placeholder=r.searchPlaceholder??"Search…",this.search.setAttribute("autocomplete","off"),this.list=document.createElement("ul"),this.list.className="mhx-nh-list",this.list.setAttribute("role","listbox"),this.popover.append(this.search,this.list)}build(){this.wrapper.append(this.trigger,this.popover),this.trigger.addEventListener("click",this.onTriggerClick),this.search.addEventListener("input",this.onSearchInput),this.search.addEventListener("keydown",this.onSearchKeyDown),document.addEventListener("pointerdown",this.onDocumentPointerDown,!0)}detachSurface(){this.trigger.removeEventListener("click",this.onTriggerClick),this.search.removeEventListener("input",this.onSearchInput),this.search.removeEventListener("keydown",this.onSearchKeyDown),document.removeEventListener("pointerdown",this.onDocumentPointerDown,!0)}syncFromNative(){super.syncFromNative(),this.open&&this.applyFilter()}render(){const n=Ta(this.select),r=n.find(a=>a.value===this.currentValue);this.labelEl.textContent=(r==null?void 0:r.label)??this.options.placeholder??"Select…",this.labelEl.classList.toggle("mhx-nh-label--empty",!r),this.list.textContent="";for(const a of n){const o=document.createElement("li");o.className="mhx-pop-item mhx-nh-opt",o.setAttribute("role","option"),o.dataset.value=a.value,o.textContent=a.label,a.disabled&&(o.classList.add("mhx-nh-opt--disabled"),o.setAttribute("aria-disabled","true")),o.classList.toggle("mhx-pop-item--active",a.value===this.currentValue),o.addEventListener("click",()=>{a.disabled||this.choose(a.value)}),this.list.appendChild(o)}}choose(n){wa(this.select,n),this.options.closeOnSelect!==!1&&this.close()}openPopover(){this.open||(this.open=!0,this.popover.hidden=!1,this.trigger.setAttribute("aria-expanded","true"),this.wrapper.classList.add("mhx-nh--open"),this.search.value="",this.applyFilter(),this.search.focus())}close(){this.open&&(this.open=!1,this.popover.hidden=!0,this.trigger.setAttribute("aria-expanded","false"),this.wrapper.classList.remove("mhx-nh--open"),this.activeIndex=-1)}closeSurface(){this.close()}focusReplacement(){this.trigger.focus()}visibleItems(){return Array.from(this.list.querySelectorAll(".mhx-nh-opt")).filter(n=>!n.hidden)}applyFilter(){var i,s;const n=this.search.value.trim().toLowerCase(),r=Array.from(this.list.querySelectorAll(".mhx-nh-opt"));for(const c of r){const l=(c.textContent??"").toLowerCase(),d=(c.dataset.value??"").toLowerCase();c.hidden=n!==""&&!l.includes(n)&&!d.includes(n)}const a=r.filter(c=>!c.hidden),o=a.find(c=>c.dataset.value===this.currentValue);o?this.activeIndex=a.indexOf(o):this.activeIndex=a.length>0?0:-1;for(const c of r)c.classList.remove("mhx-nh-opt--cursor");(i=a[this.activeIndex])==null||i.classList.add("mhx-nh-opt--cursor"),(s=a[this.activeIndex])==null||s.scrollIntoView({block:"nearest"})}moveCursor(n){var o,i,s;const r=this.visibleItems();if(r.length===0)return;const a=(this.activeIndex+n+r.length)%r.length;(o=r[this.activeIndex])==null||o.classList.remove("mhx-nh-opt--cursor"),this.activeIndex=a,(i=r[a])==null||i.classList.add("mhx-nh-opt--cursor"),(s=r[a])==null||s.scrollIntoView({block:"nearest"})}}class vc extends _a{constructor(n,r){super(n,r,"seg",!1);q(this,"row");this.row=document.createElement("div"),this.row.className="mhx-seg mhx-nh-seg",this.row.setAttribute("role","radiogroup"),r.label&&this.row.setAttribute("aria-label",r.label)}focusReplacement(){const n=this.row.querySelector(".mhx-seg-btn--active")??this.row.querySelector(".mhx-nh-seg-btn:not(:disabled)");n==null||n.focus()}build(){this.row.addEventListener("click",n=>{const r=n.target;if(!(r instanceof HTMLElement))return;const a=r.closest(".mhx-nh-seg-btn");if(!a||a.disabled)return;n.preventDefault();const o=a.dataset.value;o!==void 0&&wa(this.select,o)}),this.wrapper.appendChild(this.row)}render(){this.row.textContent="";for(const n of Ta(this.select)){const r=document.createElement("button");r.type="button",r.className="mhx-seg-btn mhx-nh-seg-btn",r.textContent=n.label,r.dataset.value=n.value,r.disabled=n.disabled;const a=n.value===this.currentValue;r.classList.toggle("mhx-seg-btn--active",a),r.setAttribute("aria-checked",String(a)),r.setAttribute("aria-pressed",String(a)),r.setAttribute("role","radio"),r.title=n.label,this.row.appendChild(r)}}}function _n(t,e={}){if(Cc(t))return null;const n=e.presentation==="segmented"?new vc(t,e):new yc(t,e);return n.mount(),n}function Cc(t){const e=qt.get(t);return!!e&&!(e!=null&&e.isStale())}const Tc=`
.mhx-nh{position:relative;display:block;min-width:180px;font:13px/1.4 system-ui,"Segoe UI",Arial,sans-serif;}
/* D8 fix: keep native select in layout & focusable instead of display:none,
   so Magento validation scroll/focus doesn't target a hidden element */
.mhx-nh>select.mhx-nh-native{position:absolute !important;opacity:0 !important;pointer-events:none !important;width:1px !important;height:1px !important;margin:0 !important;border:0 !important;padding:0 !important;}
.mhx-nh-trigger{justify-content:space-between;width:100%;text-align:left;}
.mhx-nh--open .mhx-nh-trigger{border-color:var(--mhx-pg-accent);box-shadow:0 0 0 1px var(--mhx-pg-accent);}
.mhx-nh-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mhx-nh-label--empty{color:var(--mhx-pg-ink);}
.mhx-nh-caret{flex-shrink:0;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid var(--mhx-pg-ink);}
.mhx-nh-pop{position:absolute;z-index:100000;top:calc(100% + 2px);left:0;right:0;display:flex;flex-direction:column;max-height:280px;overflow-y:auto;}
/* Author styles beat the UA sheet's [hidden]{display:none}, so a class-level
   display would keep the closed list laid out and swallowing clicks on
   whatever sits underneath it. Restore the close. */
.mhx-nh-pop[hidden]{display:none;}
.mhx-nh-search{flex-shrink:0;margin:6px;padding:5px 8px;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill);color:var(--mhx-pg-ink);font:inherit;}
.mhx-nh-search:focus{outline:none;border-color:var(--mhx-pg-accent);box-shadow:0 0 0 1px var(--mhx-pg-accent);}
.mhx-nh-list{margin:0;padding:0 0 6px;overflow-y:auto;list-style:none;}
.mhx-nh-opt--cursor{background:var(--mhx-pg-fill);}
.mhx-nh-opt--disabled{color:var(--mhx-pg-line);cursor:default;}
/* Two classes so the segmented modifier wins over the block default above. */
.mhx-nh.mhx-nh--seg{display:inline-flex;min-width:0;}
.mhx-nh-seg{width:max-content;}
.mhx-nh-seg-btn{min-width:40px;}
.mhx-nh-seg-btn:disabled{color:var(--mhx-pg-line);cursor:default;background:var(--mhx-pg-fill);}
`;function wc(){const t=document.querySelector(".store-switcher select");t&&_n(t,{label:"Store View",searchPlaceholder:"Search store views…"}),document.querySelectorAll('.admin__data-grid-pager select, [data-role="selectPageSize"]').forEach(e=>{_n(e,{presentation:"segmented",label:"Results per page"})}),document.querySelectorAll(".admin__field-control select, select.admin__control-select").forEach(e=>{e.options.length<bs||_n(e,{searchPlaceholder:"Search…"})})}const at="mhx-nav-toggle",Oa="mhx-nav-toggle-styles",xe="mhx-nav-hidden",Ia="mhx.nav.collapsed.v1",_c='nav.admin__menu, #menu, .admin__menu, nav[aria-label="Main Menu"], [role="navigation"]',On='.page-main, .page-wrapper, #page-wrapper, .admin__header, main, body, #html-body, [class*="wrapper"], [class*="content"], [role="main"]',$t=".admin__header, .page-header, header";let Y=null,ka=!1,La=!1;const Na=24;function Ra(t,e){var s;const n=t.getBoundingClientRect(),r=n.width>0?n:((s=t.parentElement)==null?void 0:s.getBoundingClientRect())??n;if(r.width<=0)return 0;const a=Math.min(260,Math.max(120,r.width*2+60));let o=0,i=t.parentElement;for(;i&&i!==document.body&&i!==document.documentElement;){const c=i.getBoundingClientRect(),l=Math.abs(c.left-r.left)<=8,d=c.width>0&&c.width<=a,u=c.height>=Math.max(40,r.height*.5);if(!l||!d||!u)break;i.style.getPropertyValue("display")!=="none"&&(e.push({el:i,prop:"display",value:i.style.getPropertyValue("display")}),i.style.setProperty("display","none","important")),o=Math.max(o,c.width),i=i.parentElement}return o}const Oc='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',Ic='<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';function Ht(){return document.querySelector(_c)}function kc(){try{return localStorage.getItem(Ia)==="1"}catch{return!1}}function Lc(t){try{localStorage.setItem(Ia,t?"1":"0")}catch{}}function Pa(t){if(t){if(Y){In(),document.body.classList.add(xe);return}const e=[],n=(d,u)=>{e.push({el:d,prop:u,value:d.style.getPropertyValue(u)})},r=Ht(),a=r?Ra(r,e):0,o=a>0?a:(r==null?void 0:r.getBoundingClientRect().width)??0,i=document.querySelectorAll(On);for(const d of i){const u=getComputedStyle(d).marginLeft;u&&u!=="0px"&&parseFloat(u)>0&&(n(d,"margin-left"),d.style.setProperty("margin-left","0","important"))}const c=(document.querySelector(".page-wrapper, .page-main, main")??document.body).getBoundingClientRect().left;document.querySelectorAll(On).forEach(d=>{const u=parseFloat(getComputedStyle(d).paddingLeft);if(!(u>0))return;const m=o>4&&u>=o-4,p=c>Na&&u>=c-4;!m&&!p||(n(d,"padding-left"),d.style.setProperty("padding-left","0","important"))});const l=new Set;document.querySelectorAll($t).forEach(d=>{l.add(d),d.querySelectorAll("*").forEach(u=>{const m=getComputedStyle(u);(m.position==="fixed"||m.position==="sticky"||m.position==="absolute")&&l.add(u)})}),l.forEach(d=>{const u=getComputedStyle(d);if(u.position!=="fixed"&&u.position!=="sticky"&&u.position!=="absolute"&&!d.matches($t))return;const m=u.left;m&&m!=="auto"&&parseFloat(m)>0&&(n(d,"left"),d.style.setProperty("left","0","important"));const p=u.right;p&&p!=="auto"&&parseFloat(p)>=0&&(n(d,"right"),d.style.setProperty("right","0","important"));const x=u.marginRight;x&&x!=="0px"&&parseFloat(x)>0&&(n(d,"margin-right"),d.style.setProperty("margin-right","0","important"));const g=u.paddingRight;g&&g!=="0px"&&parseFloat(g)>0&&(n(d,"padding-right"),d.style.setProperty("padding-right","0","important"));const f=u.width;f&&f!=="auto"&&(n(d,"width"),d.style.setProperty("width","auto","important"));const A=u.transform;A&&A!=="none"&&(n(d,"transform"),d.style.setProperty("transform","translate3d(0, 0, 0)","important"))}),Y=e,document.body.classList.add(xe);return}if(Y){for(const{el:e,prop:n,value:r}of Y)r?e.style.setProperty(n,r):e.style.removeProperty(n);Y=null}document.body.classList.remove(xe)}function Vt(t){const e=document.body.classList.contains(xe),n=Ht();t.style.left=e||!n?"0px":`${n.offsetWidth}px`;const r=e?"hidden":"shown";t.dataset.state!==r&&(t.dataset.state=r,t.innerHTML=e?Ic:Oc);const a=e?"Show admin menu":"Hide admin menu";t.title=a,t.setAttribute("aria-label",a),t.setAttribute("aria-expanded",e?"false":"true")}function Nc(){if(Le(),document.getElementById(Oa))return;const t=document.createElement("style");t.id=Oa,t.textContent=Pc,(document.head??document.documentElement).appendChild(t)}function In(){if(!Y||!document.body.classList.contains(xe))return;const t=Ht();if(!t)return;const e=[],n=Ra(t,e),r=n>0?n:(t==null?void 0:t.getBoundingClientRect().width)??0,a=document.querySelectorAll(On);for(const c of a){if(Y.some(u=>u.el===c&&u.prop==="margin-left"))continue;const d=getComputedStyle(c).marginLeft;d&&d!=="0px"&&parseFloat(d)>0&&(e.push({el:c,prop:"margin-left",value:c.style.getPropertyValue("margin-left")}),c.style.setProperty("margin-left","0","important"))}const i=(document.querySelector(".page-wrapper, .page-main, main")??document.body).getBoundingClientRect().left;for(const c of a){if(Y.some(p=>p.el===c&&p.prop==="padding-left"))continue;const d=parseFloat(getComputedStyle(c).paddingLeft);if(!(d>0))continue;const u=r>4&&d>=r-4,m=i>Na&&d>=i-4;!u&&!m||(e.push({el:c,prop:"padding-left",value:c.style.getPropertyValue("padding-left")}),c.style.setProperty("padding-left","0","important"))}const s=new Set;document.querySelectorAll($t).forEach(c=>{s.add(c),c.querySelectorAll("*").forEach(l=>{const d=getComputedStyle(l);(d.position==="fixed"||d.position==="sticky"||d.position==="absolute")&&s.add(l)})}),s.forEach(c=>{const l=getComputedStyle(c);if(l.position!=="fixed"&&l.position!=="sticky"&&l.position!=="absolute"&&!c.matches($t))return;const d=Y.some(h=>h.el===c&&h.prop==="left"),u=l.left;!d&&u&&u!=="auto"&&parseFloat(u)>0&&(e.push({el:c,prop:"left",value:c.style.getPropertyValue("left")}),c.style.setProperty("left","0","important"));const m=Y.some(h=>h.el===c&&h.prop==="right"),p=l.right;!m&&p&&p!=="auto"&&parseFloat(p)>=0&&(e.push({el:c,prop:"right",value:c.style.getPropertyValue("right")}),c.style.setProperty("right","0","important"));const x=Y.some(h=>h.el===c&&h.prop==="margin-right"),g=l.marginRight;!x&&g&&g!=="0px"&&parseFloat(g)>0&&(e.push({el:c,prop:"margin-right",value:c.style.getPropertyValue("margin-right")}),c.style.setProperty("margin-right","0","important"));const f=Y.some(h=>h.el===c&&h.prop==="padding-right"),A=l.paddingRight;!f&&A&&A!=="0px"&&parseFloat(A)>0&&(e.push({el:c,prop:"padding-right",value:c.style.getPropertyValue("padding-right")}),c.style.setProperty("padding-right","0","important"));const w=Y.some(h=>h.el===c&&h.prop==="width"),I=l.width;!w&&I&&I!=="auto"&&(e.push({el:c,prop:"width",value:c.style.getPropertyValue("width")}),c.style.setProperty("width","auto","important"));const N=Y.some(h=>h.el===c&&h.prop==="transform"),O=l.transform;!N&&O&&O!=="none"&&(e.push({el:c,prop:"transform",value:c.style.getPropertyValue("transform")}),c.style.setProperty("transform","translate3d(0, 0, 0)","important"))}),e.length&&Y.push(...e)}function Rc(){if(!document.body||!Ht())return;Nc();let e=document.getElementById(at);e||(e=document.createElement("button"),e.id=at,e.type="button",e.className="mhx-toggle",e.addEventListener("click",()=>{const r=!document.body.classList.contains(xe);Pa(r),Lc(r);const a=document.getElementById(at);a&&Vt(a)}),document.body.appendChild(e));const n=kc();if(n!==document.body.classList.contains(xe)&&Pa(n),document.body.classList.contains(xe)&&In(),Vt(e),ka||(ka=!0,window.addEventListener("resize",()=>{const r=document.getElementById(at);r&&Vt(r)})),!La){La=!0;let r=!1;window.addEventListener("scroll",()=>{document.body.classList.contains(xe)&&(r||(r=!0,window.requestAnimationFrame(()=>{r=!1,In();const a=document.getElementById(at);a&&Vt(a)})))},{passive:!0})}}const Pc=`
/* Chevron box/colours: the toolkit's mhx-toggle primitive (src/ui/toolkit.css) */


/* Make every element use border-box so zeroing offsets never causes overflow */
body.mhx-nav-hidden,
body.mhx-nav-hidden * {
  box-sizing: border-box;
}
/* Hide the nav AND the rail column (left band with logo/background) */
body.mhx-nav-hidden nav.admin__menu,
body.mhx-nav-hidden #menu,
body.mhx-nav-hidden .admin__menu,
body.mhx-nav-hidden [role="navigation"],
body.mhx-nav-hidden nav[aria-label="Main Menu"],
body.mhx-nav-hidden DIV.menu-wrapper._fixed,
body.mhx-nav-hidden [class*="menu-wrapper"] {
  display: none !important;
}
/* F14 fix: the blanket margin/padding zeroing rule was removed.
   The JS setHidden() path measures and restores each element's inline
   offset individually, so a CSS !important override is redundant and
   can fight an admin theme's own layout. The body gutter below is kept
   because it applies once on a single element (no compounding). */
/* A small breathing gutter on the left and right once the rail is gone.
   Applied once on <body> so nested wrappers cannot compound the padding,
   and border-box keeps the total width equal to the viewport (no h-scroll). */
body.mhx-nav-hidden {
  margin: 0 !important;
  padding: 0 !important; /* no side gap */
  overflow-x: hidden !important;
}
html:has(> body.mhx-nav-hidden) {
  overflow-x: hidden !important;
}
/* Fixed/sticky header bars and scroll-injected clones: drop the rail's left
   inset and fill the width, otherwise a right-side gap (and a shifted bar)
   survives the collapse. */
body.mhx-nav-hidden .admin__header,
body.mhx-nav-hidden .page-header,
body.mhx-nav-hidden header {
  left: 0 !important;
  right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  width: auto !important;
  max-width: none !important;
}
`,Ma="data-mhx-row-actions",Mc=4;function Dc(t){return t.getAttribute(Ma)==="1"}function Uc(t){const e=[];return t.querySelectorAll("li").forEach(n=>{if(n.hidden||n.classList.contains("hidden")||n.classList.contains("_disabled")||n.classList.contains("disabled"))return;const r=n.querySelector("a, button, .action-menu-item")??n;if(!r||r.hasAttribute("disabled")||r.getAttribute("aria-disabled")==="true"||r.hidden||r.classList.contains("hidden"))return;const a=(r.textContent??"").replace(/\s+/g," ").trim();a&&e.push({label:a,el:r,danger:/delete|remove|deactivat/i.test(a)})}),e}function Da(t){t.style.setProperty("display","none","important")}function Bc(t){if(Dc(t))return!1;const e=t.querySelector('[data-toggle="dropdown"], .admin__action-dropdown, .action-select')??null,n=t.querySelector("ul.action-menu, ul.admin__action-dropdown-menu")??null;if(!e||!n)return!1;const r=Uc(n);if(r.length===0||r.length>Mc)return!1;Le();const a=Mi(r.map(o=>Z({label:o.label,title:o.label,variant:o.danger?"danger":"default",onClick:i=>{i.preventDefault(),i.stopPropagation(),o.el.click()}})),{label:"Row actions"});return t.insertBefore(a,t.firstChild),Da(e),Da(n),t.setAttribute(Ma,"1"),!0}function qc(){const t=new Set;let e=0;return document.querySelectorAll($c).forEach(n=>{const r=Hc(n);!r||t.has(r)||r.closest("tr, td")&&(t.add(r),Bc(r)&&(e+=1))}),e}const $c=".action-select-wrap, .admin__action-dropdown-wrap, td.data-grid-actions-cell";function Hc(t){return t.matches(".action-select-wrap, .admin__action-dropdown-wrap")?t:t.querySelector(".action-select-wrap, .admin__action-dropdown-wrap")??t}function Vc(){qc()}const Ft="data-mhx-mass",ot="data-mhx-mass-strip";let Fc=0;const zc=40;function Ua(t){return!(t.hidden||t.classList.contains("hidden"))}function Gc(t){if(t.getAttribute("aria-expanded")==="true")return!0;const e=t.closest(".admin__action-dropdown-wrap, .action-select-wrap");return!!(e!=null&&e.classList.contains("_active"))}let it=null;function jc(t,e,n,r){const a=Bi(e.map(m=>{const p=document.createElement("button");return p.type="button",p.className="mhx-pop-item",p.setAttribute("role","menuitem"),p.textContent=m.label,m.danger&&(p.dataset.variant="danger"),p.addEventListener("click",x=>{x.preventDefault(),x.stopPropagation(),s(),m.el.click()}),p}),{label:r});a.classList.add("mhx-pop--menu"),a.setAttribute("role","menu"),a.hidden=!0,n.appendChild(a);let o=!1;function i(){a.style.left="0px",a.style.top="0px";const m=t.getBoundingClientRect(),p=a.getBoundingClientRect();let x=m.left;x+p.width>window.innerWidth-8&&(x=Math.max(8,m.right-p.width));let g=m.bottom+4;if(g+p.height>window.innerHeight-8){const f=m.top-p.height-4;f>=8&&(g=f)}a.style.left=`${Math.round(x)}px`,a.style.top=`${Math.round(g)}px`}function s(){o&&(o=!1,a.hidden=!0,t.setAttribute("aria-expanded","false"),document.removeEventListener("pointerdown",c,!0),document.removeEventListener("keydown",l,!0),window.removeEventListener("scroll",d,!0),window.removeEventListener("resize",d),it===s&&(it=null))}function c(m){const p=m.target;p instanceof Node&&(a.contains(p)||t.contains(p))||s()}function l(m){m.key==="Escape"&&(m.preventDefault(),s(),t.focus())}function d(m){if(!o)return;const p=document.elementFromPoint(m.clientX,m.clientY);a&&a.contains(p)||s()}function u(m){var p;it&&it(),o=!0,a.hidden=!1,i(),t.setAttribute("aria-expanded","true"),m&&((p=a.querySelector(".mhx-pop-item"))==null||p.focus()),document.addEventListener("pointerdown",c,!0),document.addEventListener("keydown",l,!0),window.addEventListener("scroll",d,!0),window.addEventListener("resize",d),it=s}t.setAttribute("aria-haspopup","menu"),t.setAttribute("aria-expanded","false"),t.addEventListener("click",m=>{m.preventDefault(),m.stopPropagation(),o?s():u(m.detail===0)})}function kn(t){return t.replace(/\s+/g," ").trim().toLowerCase()}const Ba=/delete|remove|deactivat/i,Zc=new Set(["assign inventory source","unassign inventory source","transfer inventory to source","regenerate url"]);function Ln(t){const n=t.querySelector("a, button, .action-menu-item")??t;return n.hasAttribute("disabled")||n.getAttribute("aria-disabled")==="true"||n.hidden||n.classList.contains("hidden")||t.classList.contains("_disabled")||t.classList.contains("disabled")?null:n}function qa(t){const e=t.querySelector(":scope > ul");return e&&e.querySelector(":scope > li")?e:null}function Kc(t){const e=[];return t.querySelectorAll(":scope > li").forEach(n=>{if(!Ua(n))return;const r=Ln(n);if(!r)return;const a=$a(n,r);a&&e.push({label:a,el:r,danger:Ba.test(a)})}),e}function $a(t,e){return e!==t?(e.textContent??"").replace(/\s+/g," ").trim():Array.from(t.childNodes).filter(r=>!(r instanceof HTMLElement&&r.tagName==="UL")).map(r=>r.textContent??"").join(" ").replace(/\s+/g," ").trim()}function Wc(){const t=[],e=n=>{!n||!n.isConnected||t.includes(n)||t.push(n)};return document.querySelectorAll('[data-role="massaction"], .massaction-wrap').forEach(e),document.querySelectorAll('[data-toggle="dropdown"], .admin__action-dropdown, .admin__actions-dropdown, .action-select').forEach(n=>{if(kn(n.textContent??"")!=="actions")return;let r=n.parentElement;for(let a=0;r&&a<6;a+=1){const o=r.querySelector("ul");if(o&&o.querySelector("li")){e(r);return}r=r.parentElement}}),t}function Yc(t){const e=t.querySelector('ul.massaction-menu, ul.admin__action-dropdown-menu, [data-role="menu"], ul');return e&&e.querySelector(":scope > li")?e:null}function Xc(){let t=0;for(const e of Wc()){if(e.closest("tr, td"))continue;let n=Yc(e);if(!n)continue;const r=n.getAttribute(ot)??"";if(r&&document.getElementById(r)){e.setAttribute(Ft,"1"),e.setAttribute(ot,r);continue}if(e.getAttribute(Ft)==="1"){const u=e.getAttribute(ot),m=u?document.getElementById(u):null;m==null||m.remove(),e.removeAttribute(Ft)}const a=n.querySelectorAll(":scope > li");if(a.length===1){const u=a[0]&&qa(a[0]);u&&(n=u)}if(!Array.from(n.querySelectorAll(":scope > li")).some(u=>{var p;const m=kn(((p=Ln(u))==null?void 0:p.textContent)??"");return m==="delete"||m==="update attributes"}))continue;const i=[];n.querySelectorAll(":scope > li").forEach(u=>{if(!Ua(u))return;const m=Ln(u);if(!m)return;const p=$a(u,m);if(!p||Zc.has(kn(p)))return;const x=qa(u);i.push({label:p,el:m,danger:Ba.test(p),submenu:!!x,sub:x})});const s=i.length;if(s===0||s>zc||e.closest("tr, td.data-grid-actions-cell"))continue;Le();const c=e.querySelector('[data-toggle="dropdown"], .admin__actions-dropdown, .admin__action-dropdown, .action-select'),l=Di([],"Bulk actions");for(const u of i){const m=u.sub?Kc(u.sub):[],p=m.length>0,x=Z({label:u.submenu?`${u.label} ▾`:u.label,title:p?`${u.label} — opens its options below this button`:u.submenu?`${u.label} — opens its submenu in the Actions menu`:u.label,variant:u.danger?"danger":"default",onClick:p?void 0:g=>{g.preventDefault(),g.stopPropagation(),u.submenu&&c&&!Gc(c)&&c.click(),u.el.click()}});p?jc(x,m,l,u.label):u.submenu&&x.setAttribute("aria-haspopup","true"),l.appendChild(x)}l.id=`mhx-mass-strip-${Fc+=1}`;const d=Jc(e);d?d.parent.insertBefore(l,d.before):e.insertAdjacentElement("afterend",l),e.setAttribute(Ft,"1"),e.setAttribute(ot,l.id),n.setAttribute(ot,l.id),t+=1}return t}function Jc(t){const e=t.closest(".admin__data-grid-header-row, .admin__data-grid-toolbar");let n=null;if(e!=null&&e.parentElement){const a=e.parentElement.querySelectorAll(":scope > .admin__data-grid-header-row"),o=a[a.length-1]??e;n={parent:e.parentElement,before:o.nextSibling}}else{let a=t;for(;a.parentElement&&a.parentElement.children.length===1&&a.parentElement!==document.body;)a=a.parentElement;const o=a.parentElement;o&&(n={parent:o,before:a.nextSibling})}if(!n)return null;const r=n.parent.querySelector(':scope > .admin__data-grid-wrap, :scope > table.data-grid, :scope > [data-role="grid"]');if(r)n.before=r;else{let a=n.before;for(;a;){if(a instanceof HTMLElement&&(a.matches('.admin__data-grid-wrap, table.data-grid, [data-role="grid"]')||a.querySelector(".admin__data-grid-wrap, table.data-grid"))){n.before=a;break}a=a.nextSibling}}return n}function Qc(){Xc()}const Nn="data-mhx-paging-sizes",Rn="mhx-size-widget",Ha="mhx-paging-sizes-styles";function Pn(t){const e=t.querySelector(".selectmenu-value input");return((e==null?void 0:e.value)??"").trim()}function Mn(t){const e=[];return t.querySelectorAll(".selectmenu-items li").forEach(n=>{const r=n.querySelector(".selectmenu-item-action");if(!r)return;const a=(r.textContent??"").trim();/^\d+$/.test(a)&&e.push({label:a,button:r})}),e}function el(t){for(const e of Array.from(t.querySelectorAll(".selectmenu-items li"))){const n=e.querySelector(".selectmenu-item-action");if(n&&!/^\d+$/.test((n.textContent??"").trim()))return e}return null}function tl(t,e){const n=e.trim();if(!/^\d+$/.test(n)||Number(n)<1)return!1;const r=el(t);if(!r)return!1;const a=r.querySelector(".selectmenu-item-action"),o=r.querySelector(".selectmenu-item-edit input"),i=r.querySelector(".selectmenu-item-edit .action-save");return!o||!i?!1:(a==null||a.click(),o.value=n,o.dispatchEvent(new Event("input",{bubbles:!0})),o.dispatchEvent(new Event("change",{bubbles:!0})),i.click(),!0)}function nl(){if(document.getElementById(Ha))return;const t=document.createElement("style");t.id=Ha,t.textContent=il,(document.head??document.documentElement).appendChild(t)}function Dn(t){t instanceof HTMLElement&&t.style.setProperty("display","none","important")}function zt(t,e){const n=Pn(t);e.querySelectorAll(".mhx-seg-btn").forEach(r=>{const a=r.dataset.value===n;r.classList.toggle("mhx-seg-btn--active",a),r.setAttribute("aria-pressed",String(a))})}function st(t,e){if(!e||document.activeElement===e)return;const n=Pn(t);n&&(e.value=n)}function Va(t,e,n){e.replaceChildren();const r=Ui({label:"Results per page",options:n.map(a=>({label:a.label,value:a.label})),active:Pn(t),onPick:a=>{var i;const o=n.find(s=>s.label===a);o==null||o.button.click(),st(t,((i=e.closest(`.${Rn}`))==null?void 0:i.querySelector(".mhx-size-input"))??void 0)}});e.appendChild(r),e.dataset.sizes=n.map(a=>a.label).join(",")}function rl(t){const e=document.createElement("div");e.className="mhx-size-bar";const n=document.createElement("div");n.className="mhx-size-row",e.appendChild(n);const r=document.createElement("span");r.className="mhx-inline-field mhx-size-input-wrap";const a=document.createElement("input");return a.type="text",a.inputMode="numeric",a.className="mhx-size-input",a.setAttribute("aria-label","Set a page size"),a.title="Type a page size and press Enter",a.size=4,a.addEventListener("keydown",o=>{o.key==="Enter"&&(o.preventDefault(),o.stopPropagation(),tl(t,a.value)&&zt(t,n))}),a.addEventListener("blur",()=>st(t,a)),r.appendChild(a),e.appendChild(r),e}function al(t){if(t.getAttribute(Nn)==="1"){const i=t.querySelector(".mhx-size-row"),s=t.querySelector(".mhx-size-input");if(i&&s){const c=Mn(t);return i.dataset.sizes!==c.map(l=>l.label).join(",")&&Va(t,i,c),zt(t,i),st(t,s),!1}t.removeAttribute(Nn),t.classList.remove(Rn)}const e=Mn(t);if(e.length<2)return!1;nl();const n=rl(t);t.insertBefore(n,t.firstChild),Va(t,t.querySelector(".mhx-size-row"),e),Dn(t.querySelector(".selectmenu-value")),Dn(t.querySelector(".selectmenu-toggle")),Dn(t.querySelector(".selectmenu-items")),t.classList.add(Rn),t.setAttribute(Nn,"1");const r=n.querySelector(".mhx-size-row"),a=n.querySelector(".mhx-size-input");zt(t,r),st(t,a);const o=t.querySelector(".selectmenu-value input");if(o){const i=()=>{zt(t,r),st(t,a)};o.addEventListener("change",i),o.addEventListener("input",i)}return!0}function ol(){let t=0;return document.querySelectorAll(".admin__data-grid-pager-wrap .selectmenu, .selectmenu").forEach(e=>{!e.closest(".admin__data-grid-pager-wrap")&&Mn(e).length<2||al(e)&&(t+=1)}),t}const il=`
/* Magento paints .selectmenu as a white panel. Strip it so no pale frame is
   left around the control, and keep the box in the toolbar's flow. */
.selectmenu.mhx-size-widget{background:transparent !important;border:0 !important;padding:0 !important;margin:0 !important;box-shadow:none !important;min-width:0 !important;min-height:0 !important;display:inline-flex !important;align-items:center !important;vertical-align:middle;}
.selectmenu.mhx-size-widget:before,.selectmenu.mhx-size-widget:after{content:none !important;display:none !important;border:0 !important;}
.mhx-size-bar{display:inline-flex;align-items:stretch;gap:6px;}
.mhx-size-row{display:inline-flex;align-items:center;gap:6px;}
.mhx-size-input-wrap input{width:64px;text-align:center;}
`;function sl(){ol()}const Un="data-mhx-chip-edit",ct="data-mhx-chip-editing",Fa="mhx-chip-edit-styles",lt="mhx-chip-edit",Gt="mhx-chip-editing",za="mhx-chip-input",Ga="mhx-chip-select",Pe="mhx-btn mhx-btn--compact",ja=Pe,Za=Pe,Bn="mhx-chip",qn="mhx-chip-pin",Ka="mhx-field-pin",$n="mhx-chip--pinned",Me="data-mhx-pinned-filter",Te="mhx-pinned-filter-strip";function De(t,e,n){const r=`${e?"Unpin":"Pin"} ${n} filter`;t.setAttribute("aria-pressed",e?"true":"false"),t.title=r,t.setAttribute("aria-label",r)}function Wa(t){return t.getAttribute("aria-pressed")==="true"}const Hn='<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>',Ya="mhx.pinnedFilters.v1";function de(){try{const t=localStorage.getItem(Ya);return t?JSON.parse(t):{}}catch{return{}}}function dt(t){try{localStorage.setItem(Ya,JSON.stringify(t))}catch{}}const Xa='.action-remove, [data-role="remove-filter"], .admin__filter-remove, a[title*="remove" i]',cl=new Set(["","text","search","number","email","url","tel"]),Ja='[data-role="filter-form"], .admin__data-grid-filters, .admin__data-grid-filter-row, .admin__fieldset, .admin__data-grid-toolbar, form';function we(t){return t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").replace(/[:：]+$/,"").trim().toLowerCase()}function V(t){return we(t).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")}function ut(t){const e=/\[([^\]]+)\]/.exec(t);return e!=null&&e[1]?V(e[1]):V(t)}function jt(){const t=[],e=n=>{!n||!n.isConnected||t.includes(n)||t.push(n)};return document.querySelectorAll('.filter-current, [data-role="filter-current"], .admin__data-grid-filter-current, .admin__data-grid-filters-current, .admin__current-filters, .admin__current-filters-list, .admin__current-filters-list-wrap, [data-role="filter-list"], .admin__data-grid-active-filters, .mhx-pinned-filter-strip').forEach(e),document.querySelectorAll("strong, b, span, div").forEach(n=>{var r;n.children.length>0||/^active\s+filters?\s*:?\s*$/i.test(n.textContent??"")&&e(n.closest('.admin__data-grid-filters-current, .admin__current-filters, .admin__current-filters-list-wrap, .admin__current-filters-list, .filter-current, [data-role="filter-current"]')??((r=n.parentElement)==null?void 0:r.parentElement)??n.parentElement)}),t}function Zt(t){const e=Array.from(t.querySelectorAll("li, .item"));if(e.length>0)return e;const n=[];return t.querySelectorAll(Xa).forEach(r=>{const a=r.closest("li, .item, .filter-current-item, div, span")??r.parentElement;a&&t.contains(a)&&!n.includes(a)&&n.push(a)}),n}function ll(t,e){let n="";return t.childNodes.forEach(r=>{if(r.nodeType===Node.TEXT_NODE){n+=r.textContent??"";return}if(r.nodeType!==Node.ELEMENT_NODE)return;const a=r;e&&a===e||a.classList.contains(lt)||a.closest(`.${Gt}`)||(n+=a.textContent??"")}),n}function Kt(t){const e=t.querySelector(Xa),n=c=>!!c&&!!e&&(c===e||e.contains(c)),r=c=>{const l=t.querySelector(c);return n(l)?null:l},a=r('.filter-label, [class*="filter-label"], [class*="-label"]'),o=r('.filter-value, [class*="filter-value"], [class*="-value"]');let i="",s="";if(a&&o&&!a.contains(o)&&!o.contains(a)&&(i=a.textContent??"",s=o.textContent??""),!we(i)||!s.trim()){const c=ll(t,e).replace(/\s+/g," ").trim(),l=c.indexOf(":");if(l<=0)return null;i=c.slice(0,l),s=c.slice(l+1)}return i=i.replace(/[:：]+\s*$/,"").trim(),s=s.replace(/^[:：]+\s*/,"").trim(),!we(i)||!s?null:{label:i,value:s,valueEl:o,removeEl:e}}function Qa(){const t=[];return document.querySelectorAll("input, select").forEach(e=>{if(!(e.classList.contains(za)||e.classList.contains(Ga))&&!e.closest(`.${Gt}`)&&!(e.disabled||e.hidden)){if(e instanceof HTMLSelectElement){e.options.length>=1&&t.push(e);return}e.type.toLowerCase()!=="hidden"&&cl.has((e.type||"text").toLowerCase())&&t.push(e)}}),t}function Vn(t){const e=[],n=t.getAttribute("aria-label");if(n&&e.push(n),t.id)try{const s=document.querySelector(`label[for="${CSS.escape(t.id)}"]`);s&&e.push(s.textContent??"")}catch{}const r=t.closest("label");r&&e.push(r.textContent??"");const a=t.parentElement;if(a&&!a.contains(r)){const s=a.querySelector(':scope > label, :scope > [class*="label"]');s&&!s.contains(t)&&e.push(s.textContent??"")}const o=t.closest("fieldset")?[t.closest("fieldset")]:[];let i=t.parentElement;for(;i&&o.length<2;){const s=i.closest("fieldset");if(s&&!o.includes(s)&&o.push(s),i=(s==null?void 0:s.parentElement)??i.parentElement,i===document.body)break}for(const s of o){const c=s.querySelector(":scope > legend");c&&e.push(c.textContent??"")}return t instanceof HTMLInputElement&&t.placeholder&&e.push(t.placeholder),e.map(s=>we(s)).filter(s=>s.length>0)}function eo(t,e){const n=we(t.label),r=V(t.label);let a=null,o=!1;for(const i of Qa()){if(e.has(i))continue;let s=0;if(Vn(i).includes(n))s=3;else{const c=i.getAttribute("name")??"";if(!c)continue;const l=ut(c);(l===r||V(c)===r||l===r.replace(/_id$/,"")||r===`${l}_id`||r==="type"&&l==="type_id"||r==="status"&&l==="status"||r==="store_view"&&l==="store_id"||r==="id"&&l==="entity_id")&&(s=2)}s!==0&&(i.closest(Ja)&&(s+=.25),!a||s>a.score?(a={field:i,score:s},o=!1):s===a.score&&(o=!0))}return!a||o?null:a.field}function dl(t){const e=o=>{if(o.classList.contains(lt)||o.classList.contains(ja)||o.classList.contains(Za)||o.closest(`.${Gt}`))return!1;const i=we((o instanceof HTMLInputElement?o.value:o.textContent)||o.getAttribute("title")||"");return!(!/\bapply\b/.test(i)||/\b(reset|clear|cancel|remove|delete)\b/.test(i)||o instanceof HTMLButtonElement&&o.disabled)},n=o=>Array.from(o.querySelectorAll('button, a, input[type="submit"]')).find(e)??null,r=t.closest(Ja);if(r){const o=n(r);if(o)return o}const a=document.querySelector('[data-role="filter-apply"], [data-action="grid-filter-apply"], .action-apply-filters');return a&&e(a)?a:n(document)}function Fn(t){const e=dl(t);if(e)return e.click(),"button";const n=t.form;if(n)try{const a=n.querySelector('button[type="submit"], input[type="submit"]');return a&&typeof n.requestSubmit=="function"?n.requestSubmit(a):n.submit(),"form"}catch{}const r={key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:!0,cancelable:!0};for(const a of["keydown","keypress","keyup"])t.dispatchEvent(new KeyboardEvent(a,r));return"key"}function zn(t,e){var a;if(t instanceof HTMLSelectElement&&!Array.from(t.options).some(o=>o.value===e))return!1;const n=t instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,r=(a=Object.getOwnPropertyDescriptor(n,"value"))==null?void 0:a.set;return r?r.call(t,e):t.value=e,t.dispatchEvent(new Event("input",{bubbles:!0})),t.dispatchEvent(new Event("change",{bubbles:!0})),!0}const to='<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';function ul(t,e,n){if(e.valueEl){const a=e.valueEl,o=a.style.display;return a.style.display="none",()=>{a.style.display=o}}const r=[];return Array.from(t.childNodes).forEach(a=>{var s;if(a.nodeType===Node.TEXT_NODE){if(!(a.textContent??"").trim())return;const c=document.createElement("span");(s=a.parentNode)==null||s.insertBefore(c,a),c.appendChild(a),c.style.display="none",r.push(()=>{c.replaceWith(...Array.from(c.childNodes))});return}if(a.nodeType!==Node.ELEMENT_NODE)return;const o=a;if(o===e.removeEl||o===n||o===t)return;const i=o.style.display;o.style.display="none",r.push(()=>{o.style.display=i})}),()=>r.forEach(a=>a())}function no(t,e){if(e.getAttribute(ct)==="1")return;const r=eo(t,new Set);if(!r||!r.isConnected)return;const a=e.querySelector(`.${lt}`);e.setAttribute(ct,"1");let o=!1;const i=ul(e,t,a??e),s=document.createElement("span");s.className=`${Gt} mhx-inline-field`,s.dataset.size="wide";const c=()=>{o||(o=!0,s.remove(),i(),e.removeAttribute(ct))},l=u=>{if(!o){if(!zn(r,u)){c();return}if(gl(r,u),o=!0,s.remove(),i(),e.removeAttribute(ct),e.hasAttribute(Me))if(u.trim())e.remove();else{const m=e.querySelector(".filter-value");m&&(m.textContent="Not set")}Fn(r)}},d=document.createElement("button");if(d.type="button",d.className=Za,d.dataset.variant="danger",d.title="Cancel",d.setAttribute("aria-label","Cancel edit"),d.textContent="✕",d.addEventListener("click",u=>{u.preventDefault(),u.stopPropagation(),c()}),r instanceof HTMLSelectElement){const u=document.createElement("select");u.className=Ga,u.setAttribute("aria-label",`${t.label} filter value`);for(const m of Array.from(r.options)){const p=document.createElement("option");p.value=m.value,p.text=m.text,p.disabled=m.disabled,u.appendChild(p)}if(u.value=r.value,!u.value&&t.value){const m=Array.from(u.options).find(p=>we(p.text)===we(t.value));m&&(u.value=m.value)}u.addEventListener("change",()=>l(u.value)),u.addEventListener("keydown",m=>{m.key==="Escape"&&(m.stopPropagation(),c())}),s.append(u,d)}else{const u=document.createElement("input");u.type="text",u.className=za,u.value=r.value||t.value,u.setAttribute("aria-label",`${t.label} filter value`),u.placeholder=t.label;const m=document.createElement("button");m.type="button",m.className=ja,m.dataset.variant="ok",m.title="Apply filter (Enter)",m.setAttribute("aria-label","Apply filter"),m.textContent="✓",m.addEventListener("mousedown",p=>p.preventDefault()),m.addEventListener("click",p=>{p.preventDefault(),p.stopPropagation(),l(u.value)}),u.addEventListener("keydown",p=>{p.key==="Enter"?(p.preventDefault(),l(u.value)):p.key==="Escape"&&(p.preventDefault(),p.stopPropagation(),c())}),u.addEventListener("blur",()=>c()),s.append(u,m,d),requestAnimationFrame(()=>{u.focus(),u.select()})}t.valueEl?t.valueEl.after(s):t.removeEl?e.insertBefore(s,t.removeEl):e.appendChild(s)}function ml(){if(Le(),document.getElementById(Fa))return;const t=document.createElement("style");t.id=Fa,t.textContent=Sl,(document.head??document.documentElement).appendChild(t)}function pl(){let t=0;const e=de();for(const n of jt()){const r=new Set;for(const a of Zt(n)){if(a.getAttribute(Un)==="1")continue;a.classList.add(Bn);const o=Kt(a);if(!o)continue;const i=eo(o,r);if(!i)continue;ml();const s=i.getAttribute("name")??"",c=s?ut(s):V(o.label);a.setAttribute("data-mhx-field-slug",c);const l=document.createElement("button");l.type="button",l.className=`${lt} ${Pe}`,l.dataset.variant="icon",l.title=`Edit ${o.label} filter`,l.setAttribute("aria-label",`Edit ${o.label} filter`),l.innerHTML=to,l.addEventListener("click",m=>{m.preventDefault(),m.stopPropagation(),no(o,a)});const d=document.createElement("button");d.type="button";const u=!!(e[c]||Object.values(e).some(m=>V(m.label)===V(o.label)));d.className=`${qn} ${Pe}`,d.dataset.variant="icon",d.innerHTML=Hn,De(d,u,o.label),u&&a.classList.add($n),d.addEventListener("click",m=>{m.preventDefault(),m.stopPropagation();const p=de(),x=!Wa(d);if(De(d,x,o.label),a.classList.toggle($n,x),x)p[c]={fieldSlug:c,label:o.label,value:i.value||o.value,displayValue:o.value};else{delete p[c];for(const g of Object.keys(p)){const f=p[g];f&&V(f.label)===V(o.label)&&delete p[g]}}dt(p),Gn(),Yt()}),o.valueEl?o.valueEl.after(l):o.removeEl?a.insertBefore(l,o.removeEl):a.append(l),a.insertBefore(d,a.firstChild),a.setAttribute(Un,"1"),r.add(i),t+=1}}return Gn(),hl(),fl(),Yt(),t}function ro(t){for(const e of Qa()){const n=e.getAttribute("name")??"";if(ut(n)===t||V(n)===t)return e;for(const r of Vn(e))if(V(r)===t)return e}return null}let ao=!1;function hl(){ao||(ao=!0,document.addEventListener("click",t=>{var o;const e=t.target;if(!(e==null?void 0:e.closest('button.action-clear, a.action-clear, [data-action="grid-filter-reset"]')))return;const r=de(),a=Object.keys(r);if(a.length===0){(o=document.querySelector(`.${Te}`))==null||o.remove();return}setTimeout(()=>{let i=!1,s=null;for(const c of a){const l=r[c];if(!(l!=null&&l.value))continue;const d=ro(l.fieldSlug);d&&(zn(d,l.value),i=!0,s=d)}i&&s&&Fn(s)},350)},!0))}let Wt=!1;function fl(){if(Wt)return;const t=de(),e=Object.keys(t);if(e.length===0){Wt=!0;return}const n=jt().flatMap(s=>Zt(s).filter(c=>!c.hasAttribute(Me)).map(Kt)).filter(s=>!!s),r=new Set(n.map(s=>V(s.label))),a=e.filter(s=>{const c=t[s];return c?!r.has(s)&&!r.has(V(c.label)):!1});if(a.length===0){Wt=!0;return}let o=!1,i=null;for(const s of a){const c=t[s];if(!(c!=null&&c.value))continue;const l=ro(c.fieldSlug);l&&l.value!==c.value&&(zn(l,c.value),o=!0,i=l)}Wt=!0,o&&i&&Fn(i)}function oo(){const t=de();for(const e of jt())for(const n of Zt(e)){const r=Kt(n);if(!r)continue;const a=V(r.label),o=!!(t[a]||Object.values(t).some(s=>V(s.label)===a)),i=n.querySelector(`.${qn}`);i&&De(i,o,r.label),n.classList.add(Bn),n.classList.toggle($n,o)}}function gl(t,e){const n=de(),r=t.getAttribute("name")??"",a=r?ut(r):"",o=(a&&n[a]?a:"")||Object.keys(n).find(i=>{const s=n[i];return s&&V(s.label)===V(Vn(t)[0]??"")});!o||!n[o]||(n[o].value=e,n[o].displayValue=e,dt(n))}function xl(t){return t.matches("ul, ol")?t:t.querySelector('.admin__current-filters-list, [data-role="filter-list"], ul, ol')??t}function bl(t){if(!t.isConnected)return!1;for(let e=t;e;e=e.parentElement){const n=getComputedStyle(e);if(n.display==="none"||n.visibility==="hidden")return!1}return!0}function Yt(){var d,u;const t=de(),e=Object.keys(t),n=jt(),r=new Set(n.flatMap(m=>Zt(m).filter(p=>!p.hasAttribute(Me)).map(Kt)).filter(m=>!!m).map(m=>V(m.label))),a=e.map(m=>({key:m,pin:t[m]})).filter(({pin:m})=>m&&!r.has(V(m.label)));if(a.length===0){document.querySelectorAll(`[${Me}]`).forEach(m=>m.remove()),(d=document.querySelector(`.${Te}`))==null||d.remove();return}const o=n.find(m=>!m.classList.contains(Te)&&bl(m))??Al();if(!o)return;o.classList.contains(Te)||(u=document.querySelector(`.${Te}`))==null||u.remove();const i=xl(o),s=new Map(a.map(({key:m,pin:p})=>[m,p])),c=new Map;for(const m of Array.from(document.querySelectorAll(`[${Me}]`))){const p=m.getAttribute(Me)??"";if(!s.has(p)||!i.contains(m)||c.has(p)){m.remove();continue}if(c.set(p,m),m.getAttribute(ct)==="1")continue;const x=m.querySelector(".filter-value"),g=s.get(p);x&&g&&(x.textContent=g.value.trim()?g.displayValue||g.value:"Not set")}let l=Array.from(i.children).filter(m=>m instanceof HTMLElement&&m.matches("li, .item")).pop()??null;for(const{key:m,pin:p}of a){if(!p||c.has(m))continue;const x=document.createElement(i.matches("ul, ol")?"li":"span");x.className=`item ${Bn} mhx-pinned-filter-item`,x.setAttribute(Me,m),x.setAttribute(Un,"1");const g=document.createElement("span");g.className="filter-label",g.textContent=p.label;const f=document.createElement("span");f.className="filter-value",f.textContent=p.value.trim()?p.displayValue||p.value:"Not set";const A=document.createElement("button");A.type="button",A.className=`${lt} ${Pe}`,A.dataset.variant="icon",A.title=`Edit ${p.label} filter`,A.setAttribute("aria-label",`Edit ${p.label} filter`),A.innerHTML=to,A.addEventListener("click",O=>{O.preventDefault(),O.stopPropagation(),no({label:p.label,value:p.value,valueEl:f,removeEl:null},x)});const w=()=>{const O=de();delete O[m],dt(O),x.remove(),oo(),Gn(),Yt()},I=document.createElement("button");I.type="button",I.className=`${qn} ${Pe}`,I.dataset.variant="icon",I.innerHTML=Hn,De(I,!0,p.label),I.addEventListener("click",O=>{O.preventDefault(),O.stopPropagation(),w()});let N;if(o.classList.contains(Te)){const O=document.createElement("button");O.type="button",O.className="mhx-chip-remove",O.textContent="×",O.title="Remove filter",O.setAttribute("aria-label",`Remove ${p.label} filter`),N=O}else{const O=document.createElement("a");O.className="action-remove",O.href="#",O.title="Remove filter",O.innerHTML="<span>Remove</span>",N=O}N.addEventListener("click",O=>{O.preventDefault(),O.stopPropagation(),w()}),x.append(I,g,document.createTextNode(": "),f,A,N),l!=null&&l.isConnected?l.after(x):i.appendChild(x),l=x}}function Al(){const t=document.querySelector(`.${Te}`);if(t)return t;const n=document.querySelector('[data-role="filter-form"], .admin__data-grid-filters-wrap, .admin__data-grid-filters')??document.querySelector(".admin__data-grid-header");if(!(n!=null&&n.parentElement))return null;const r=document.createElement("div");r.className=Te,r.setAttribute("role","group"),r.setAttribute("aria-label","Pinned filters");const a=document.createElement("strong");return a.textContent="Pinned filters:",r.appendChild(a),n.parentElement.insertBefore(r,n),r}function Gn(){const t=document.querySelector('[data-role="filter-form"], .admin__data-grid-filters-wrap, .admin__data-grid-filters');if(!t)return;const e=de();t.querySelectorAll(".admin__form-field, .admin__field, fieldset.admin__fieldset > div").forEach(n=>{var d;const r=n.querySelector("label"),a=n.querySelector("input, select");if(!r||!a)return;const o=a.getAttribute("name")??"",i=((d=r.textContent)==null?void 0:d.trim())||"",s=o?ut(o):V(i);if(!s)return;let c=r.querySelector(`.${Ka}`);const l=!!(e[s]||Object.values(e).some(u=>V(u.label)===V(i)));if(c){De(c,l,i);return}c=document.createElement("button"),c.type="button",c.className=`${Ka} ${Pe}`,c.dataset.variant="icon",c.innerHTML=Hn,De(c,l,i),c.addEventListener("click",u=>{u.preventDefault(),u.stopPropagation();const m=de(),p=!Wa(c);if(De(c,p,i),p)m[s]={fieldSlug:s,label:i||s,value:a.value},dt(m),a.value||a.focus();else{delete m[s];for(const x of Object.keys(m)){const g=m[x];g&&V(g.label)===V(i)&&delete m[x]}dt(m)}oo(),Yt()}),r.appendChild(c)})}const Sl=`
.mhx-pinned-filter-strip{display:flex;flex-wrap:wrap;align-items:center;gap:var(--mhx-pg-gap);padding:6px 0;}
.mhx-pinned-filter-strip > strong{font-weight:600;}
.mhx-pinned-filter-item{flex:0 0 auto;white-space:nowrap;}
.mhx-chip-editing{margin:0 0 0 4px;vertical-align:middle;}
`;function El(){pl()}const be={nodes:JSON.parse('[{"id":"1","name":"TÊXTIL PROMOCIONAL","parent":null},{"id":"1.1","name":"T-SHIRTS","parent":"1","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"1.1.1","name":"T-SHIRTS MANGA CURTA","parent":"1.1"},{"id":"1.1.2","name":"T-SHIRTS MANGA COMPRIDA","parent":"1.1"},{"id":"1.1.3","name":"TOPS E SINGLETES","parent":"1.1"},{"id":"1.1.4","name":"LINHA NATURA","parent":"1.1"},{"id":"1.2","name":"POLOS","parent":"1","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"1.2.1","name":"POLOS MANGA CURTA","parent":"1.2"},{"id":"1.2.2","name":"POLOS MANGA COMPRIDA","parent":"1.2"},{"id":"1.2.3","name":"LINHA NATURA","parent":"1.2"},{"id":"1.3","name":"SWEATSHIRTS","parent":"1","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"1.3.1","name":"SWEATSHIRTS SIMPLES","parent":"1.3"},{"id":"1.3.2","name":"SWEATSHIRTS CAPUZ","parent":"1.3"},{"id":"1.3.3","name":"SWEATSHIRTS COM FECHO","parent":"1.3"},{"id":"1.3.4","name":"SWEATSHIRTS POLARES","parent":"1.3"},{"id":"1.3.5","name":"LINHA NATURA","parent":"1.3"},{"id":"1.4","name":"CASACOS","parent":"1","notes":"Usar LABELS Impermeável À prova de Vento Linha Natura Tempo de Entrega??"},{"id":"1.4.1","name":"CASACOS POLARES","parent":"1.4"},{"id":"1.4.2","name":"CASACOS SOFTSHELL","parent":"1.4"},{"id":"1.4.3","name":"PARKAS LEVES","parent":"1.4"},{"id":"1.4.4","name":"PARKAS ACOLCHOADAS","parent":"1.4"},{"id":"1.4.5","name":"CASACOS LEVE","parent":"1.4"},{"id":"1.4.6","name":"CASACOS ACOLCHOADAS","parent":"1.4"},{"id":"1.4.7","name":"LINHA NATURA","parent":"1.4"},{"id":"1.5","name":"COLETES","parent":"1","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"1.5.1","name":"COLETES POLARES","parent":"1.5"},{"id":"1.5.2","name":"COLETES SOFTSHELL","parent":"1.5"},{"id":"1.5.3","name":"COLETES LEVES","parent":"1.5"},{"id":"1.5.4","name":"COLETES ACOLCHOADAS","parent":"1.5"},{"id":"1.5.5","name":"LINHA NATURA","parent":"1.5"},{"id":"1.6","name":"BONÉS E CHAPÉUS","parent":"1","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"1.6.1","name":"BONÉS","parent":"1.6"},{"id":"1.6.2","name":"CHAPÉUS","parent":"1.6"},{"id":"1.6.3","name":"PANAMÁS","parent":"1.6"},{"id":"1.6.4","name":"VISEIRAS / PALAS","parent":"1.6"},{"id":"1.6.5","name":"LINHA NATURA","parent":"1.6"},{"id":"1.7","name":"INTERIORES","parent":"1","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹Térmicos (interiores) tb em 2. TÊXTIL DESPORTO > ACESSÓRIOS DE DESPORTO > Térmicos","crossCategory":[{"source":"Térmicos","targetId":"2","targetName":"TÊXTIL DESPORTO > ACESSÓRIOS DE DESPORTO > Térmicos"}]},{"id":"1.7.1","name":"INTERIORES","parent":"1.7"},{"id":"1.7.2","name":"TÉRMICOS","parent":"1.7"},{"id":"1.7.3","name":"PIJAMAS","parent":"1.7"},{"id":"1.7.4","name":"LINHA NATURA","parent":"1.7"},{"id":"2","name":"TÊXTIL DESPORTO","parent":null},{"id":"2.1","name":"TÊXTIL 100% MADE 4 YOU","parent":"2","notes":"Usar LABELS Tempo de Entrega?? 🔹TÊXTIL 100% MADE 4YOU tb em 12.1. 100% MADE 4YOU ⚠Braçadeiras em 100% MADE 4 YOU (artigos de raiz) ARTIGOS EXCLUSIVOS> Acessórios","crossCategory":[{"source":"TÊXTIL 100% MADE 4YOU","targetId":"12.1","targetName":"100% MADE 4YOU"}]},{"id":"2.1.1","name":"EQUIPAMENTOS","parent":"2.1"},{"id":"2.1.2","name":"FATOS DE TREINO","parent":"2.1"},{"id":"2.1.3","name":"T-SHIRTS E SINGLETES","parent":"2.1"},{"id":"2.1.4","name":"POLOS","parent":"2.1"},{"id":"2.1.5","name":"SWEATSHIRTS","parent":"2.1"},{"id":"2.1.6","name":"CALÇAS E CALÇÕES","parent":"2.1"},{"id":"2.1.7","name":"CACHECÓIS E GOLAS","parent":"2.1"},{"id":"2.2","name":"T-SHIRTS","parent":"2","notes":"Usar LABELS Térmico Linha Natura Tempo de Entrega??"},{"id":"2.2.1","name":"T-SHIRTS MANGA CURTA","parent":"2.2"},{"id":"2.2.2","name":"T-SHIRTS MANGA COMPRIDA","parent":"2.2"},{"id":"2.2.3","name":"TOPS E SINGLETES","parent":"2.2"},{"id":"2.3","name":"POLOS","parent":"2","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"2.3.1","name":"POLOS MANGA CURTA","parent":"2.3"},{"id":"2.3.2","name":"POLOS MANGA COMPRIDA","parent":"2.3"},{"id":"2.4","name":"SWEATSHIRTS","parent":"2","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"2.4.1","name":"SWEATSHIRTS SIMPLES","parent":"2.4"},{"id":"2.4.2","name":"SWEATSHIRTS CAPUZ","parent":"2.4"},{"id":"2.4.3","name":"SWEATSHIRTS COM FECHO","parent":"2.4"},{"id":"2.5","name":"CASACOS","parent":"2","notes":"Usar LABELS Impermeável À prova de Vento Linha Natura Tempo de Entrega??"},{"id":"2.5.1","name":"CASACOS SOFTSHELL","parent":"2.5"},{"id":"2.5.2","name":"PARKAS LEVES","parent":"2.5"},{"id":"2.5.3","name":"PARKAS ACOLCHOADAS","parent":"2.5"},{"id":"2.5.4","name":"CASACOS LEVE","parent":"2.5"},{"id":"2.5.5","name":"CASACOS ACOLCHOADAS","parent":"2.5"},{"id":"2.6","name":"COLETES","parent":"2","notes":"Usar LABELS À prova de Vento Linha Natura Tempo de Entrega??"},{"id":"2.6.1","name":"COLETES SOFTSHELL","parent":"2.6"},{"id":"2.6.2","name":"COLETES LEVES","parent":"2.6"},{"id":"2.6.3","name":"COLETES ACOLCHOADAS","parent":"2.6"},{"id":"2.7","name":"CALÇAS E CALÇÕES","parent":"2","notes":"Usar LABELS Térmico Linha Natura Tempo de Entrega??"},{"id":"2.7.1","name":"CALÇAS","parent":"2.7"},{"id":"2.7.2","name":"CALÇÕES","parent":"2.7"},{"id":"2.7.3","name":"CALÇÕES DE BANHO","parent":"2.7"},{"id":"2.7.4","name":"LEGGINS","parent":"2.7"},{"id":"2.8","name":"FATOS DE TREINO","parent":"2","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"2.8.1","name":"CALÇAS","parent":"2.8"},{"id":"2.8.2","name":"CAMISOLAS E CASACOS","parent":"2.8"},{"id":"2.8.3","name":"CONJUNTOS","parent":"2.8"},{"id":"2.9","name":"BONÉS E GORROS","parent":"2","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"2.9.1","name":"BONÉS","parent":"2.9"},{"id":"2.9.2","name":"GORROS","parent":"2.9"},{"id":"2.10","name":"ACESSÓRIOS DE DESPORTO","parent":"2","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Acessórios de Desporto tb em 7. AR LIVRE E EVENTOS>ACESSÓRIOS DESPORTO > Acessórios de Desporto(colocar artigos que tanto são têxtil como Brinde: fitas cabelo, braçadeiras, etc) 🔹Térmicos (interiores) tb em 1. TÊXTIL PROMOCIONAL > INTERIORES > Térmicos 🔸 Chinelos tb em 7. AR LIVRE E EVENTOS > VERÃO E PRAIA > Chinelos 🔹Toalhas de Desporto tb em 7. AR LIVRE E EVENTOS > ACESSÓRIOS DESPORTO > Toalhas Desporto","crossCategory":[{"source":"Acessórios de Desporto","targetId":"7","targetName":"AR LIVRE E EVENTOS>ACESSÓRIOS DESPORTO > Acessórios de Desporto(colocar artigos que tanto são têxtil como Brinde: fitas cabelo, braçadeiras, etc)"},{"source":"Térmicos","targetId":"1","targetName":"TÊXTIL PROMOCIONAL > INTERIORES > Térmicos"},{"source":"Chinelos","targetId":"7","targetName":"AR LIVRE E EVENTOS > VERÃO E PRAIA > Chinelos"},{"source":"Toalhas de Desporto","targetId":"7","targetName":"AR LIVRE E EVENTOS > ACESSÓRIOS DESPORTO > Toalhas Desporto"}]},{"id":"2.10.1","name":"ACESSÓRIOS","parent":"2.10"},{"id":"2.10.2","name":"TÉRMICOS","parent":"2.10"},{"id":"2.10.3","name":"LUVAS E MEIAS","parent":"2.10"},{"id":"2.10.4","name":"SAPATILHAS E CHINELOS","parent":"2.10"},{"id":"2.10.5","name":"TOUCAS E GOLAS","parent":"2.10"},{"id":"2.10.6","name":"TOALHAS DESPORTO","parent":"2.10"},{"id":"3","name":"TÊXTIL LABORAL","parent":null},{"id":"3.1","name":"ALTA VISIBILIDADE","parent":"3","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"3.1.1","name":"T-SHIRTS","parent":"3.1"},{"id":"3.1.2","name":"POLOS","parent":"3.1"},{"id":"3.1.3","name":"SWEATSHIRTS","parent":"3.1"},{"id":"3.1.4","name":"CASACOS","parent":"3.1"},{"id":"3.1.5","name":"CAMISAS","parent":"3.1"},{"id":"3.1.6","name":"BATAS","parent":"3.1"},{"id":"3.1.7","name":"PARKAS","parent":"3.1"},{"id":"3.1.8","name":"COLETES","parent":"3.1"},{"id":"3.1.9","name":"CALÇAS","parent":"3.1"},{"id":"3.1.10","name":"CALÇÕES","parent":"3.1"},{"id":"3.1.11","name":"FATOS DE MACACO","parent":"3.1"},{"id":"3.1.12","name":"CONJUNTOS","parent":"3.1"},{"id":"3.1.13","name":"ACESSÓRIOS","parent":"3.1"},{"id":"3.1.14","name":"LINHA NATURA","parent":"3.1"},{"id":"3.2","name":"INDÚSTRIA","parent":"3","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"3.2.1","name":"T-SHIRTS","parent":"3.2"},{"id":"3.2.2","name":"POLOS","parent":"3.2"},{"id":"3.2.3","name":"SWEATSHIRTS","parent":"3.2"},{"id":"3.2.4","name":"CASACOS","parent":"3.2"},{"id":"3.2.5","name":"CAMISAS","parent":"3.2"},{"id":"3.2.6","name":"BATAS","parent":"3.2"},{"id":"3.2.7","name":"PARKAS","parent":"3.2"},{"id":"3.2.8","name":"COLETES","parent":"3.2"},{"id":"3.2.9","name":"CALÇAS","parent":"3.2"},{"id":"3.2.10","name":"CALÇÕES","parent":"3.2"},{"id":"3.2.11","name":"FATOS DE MACACO","parent":"3.2"},{"id":"3.2.12","name":"CONJUNTOS","parent":"3.2"},{"id":"3.2.13","name":"CALÇADO E MEIAS","parent":"3.2"},{"id":"3.2.14","name":"ACESSÓRIOS","parent":"3.2"},{"id":"3.2.15","name":"LINHA NATURA","parent":"3.2"},{"id":"3.3","name":"SAÚDE E ESTÉTICA","parent":"3","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Máscaras de Viagem tb em 7. AR LIVRE E EVENTOS > Acessórios Viagem > Máscaras","crossCategory":[{"source":"Máscaras de Viagem","targetId":"7","targetName":"AR LIVRE E EVENTOS > Acessórios Viagem > Máscaras"}]},{"id":"3.3.1","name":"T-SHIRTS","parent":"3.3"},{"id":"3.3.2","name":"POLOS","parent":"3.3"},{"id":"3.3.3","name":"SWEATSHIRTS","parent":"3.3"},{"id":"3.3.4","name":"CASACOS","parent":"3.3"},{"id":"3.3.5","name":"TÚNICAS","parent":"3.3"},{"id":"3.3.6","name":"BATAS","parent":"3.3"},{"id":"3.3.7","name":"COLETES","parent":"3.3"},{"id":"3.3.8","name":"CALÇAS","parent":"3.3"},{"id":"3.3.9","name":"CONJUNTOS","parent":"3.3"},{"id":"3.3.10","name":"CALÇADO E MEIAS","parent":"3.3"},{"id":"3.3.11","name":"ACESSÓRIOS","parent":"3.3"},{"id":"3.3.12","name":"LINHA NATURA","parent":"3.3"},{"id":"3.4","name":"HORECA","parent":"3","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"3.4.1","name":"T-SHIRTS","parent":"3.4"},{"id":"3.4.2","name":"POLOS","parent":"3.4"},{"id":"3.4.3","name":"SWEATSHIRTS","parent":"3.4"},{"id":"3.4.4","name":"CASACOS","parent":"3.4"},{"id":"3.4.5","name":"CAMISAS","parent":"3.4"},{"id":"3.4.6","name":"JALECAS","parent":"3.4"},{"id":"3.4.7","name":"AVENTAIS","parent":"3.4"},{"id":"3.4.8","name":"COLETES","parent":"3.4"},{"id":"3.4.9","name":"CALÇAS","parent":"3.4"},{"id":"3.4.10","name":"CALÇÕES","parent":"3.4"},{"id":"3.4.11","name":"ROUPÕES","parent":"3.4"},{"id":"3.4.12","name":"VESTIDOS E SAIAS","parent":"3.4"},{"id":"3.4.13","name":"CONJUNTOS","parent":"3.4"},{"id":"3.4.14","name":"CALÇADO E MEIAS","parent":"3.4"},{"id":"3.4.15","name":"ACESSÓRIOS","parent":"3.4"},{"id":"3.4.16","name":"LINHA NATURA","parent":"3.4"},{"id":"4","name":"TECNOLOGIA","parent":null},{"id":"4.1","name":"USB","parent":"4","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"4.1.1","name":"USB PENDRIVE","parent":"4.1"},{"id":"4.1.2","name":"USB CARTÃO","parent":"4.1"},{"id":"4.1.3","name":"USB CANETA","parent":"4.1"},{"id":"4.1.4","name":"USB MULTIFUNÇÕES","parent":"4.1"},{"id":"4.1.5","name":"LINHA NATURA","parent":"4.1"},{"id":"4.2","name":"POWERBANKS E CARREGADORES","parent":"4","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Carregadores Automóvel tb em 11. BRICO E AUTO > ACESSÓRIOS AUTO > Suportes e Carregadores 🔸 Cabos e Adaptadores tb em 4. TECNOLOGIA > ACESSÓRIOS DE COMPUTADOR > Cabos e Adaptadores","crossCategory":[{"source":"Carregadores Automóvel","targetId":"11","targetName":"BRICO E AUTO > ACESSÓRIOS AUTO > Suportes e Carregadores"},{"source":"Cabos e Adaptadores","targetId":"4","targetName":"TECNOLOGIA > ACESSÓRIOS DE COMPUTADOR > Cabos e Adaptadores"}]},{"id":"4.2.1","name":"POWERBANKS","parent":"4.2"},{"id":"4.2.2","name":"POWERBANKS MULTIFUNÇÕES","parent":"4.2"},{"id":"4.2.3","name":"CARREGADORES","parent":"4.2"},{"id":"4.2.4","name":"CARREGADORES MULTIFUNÇÕES","parent":"4.2"},{"id":"4.2.5","name":"CARREGADORES AUTOMÓVEL","parent":"4.2"},{"id":"4.2.6","name":"CABOS E ADAPTADORES","parent":"4.2"},{"id":"4.2.7","name":"LINHA NATURA","parent":"4.2"},{"id":"4.3","name":"ACESSÓRIOS COMPUTADOR","parent":"4","notes":"Usar LABELS Linha Natura CMYK Tempo de Entrega?? 🔸 Cabos e Adaptadores tb em 4. TECNOLOGIA >POWERBANKS E CARREGADORES > Cabos e Adaptadores (Porta USB não!!)","crossCategory":[{"source":"Cabos e Adaptadores","targetId":"4","targetName":"TECNOLOGIA >POWERBANKS E CARREGADORES > Cabos e Adaptadores (Porta USB não!!)"}]},{"id":"4.3.1","name":"ACESSÓRIOS","parent":"4.3"},{"id":"4.3.2","name":"RATOS E TECLADOS","parent":"4.3"},{"id":"4.3.3","name":"TAPETES DE RATO","parent":"4.3"},{"id":"4.3.4","name":"LEITOR DE CARTÕES","parent":"4.3"},{"id":"4.3.5","name":"BLOQUEADORES WEBCAM","parent":"4.3"},{"id":"4.3.6","name":"CABOS E ADAPTADORES","parent":"4.3"},{"id":"4.3.7","name":"LINHA NATURA","parent":"4.3"},{"id":"4.4","name":"ACESSÓRIOS TELEMÓVEIS E TABLETS","parent":"4","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Suportes para Automóvel tb em 11. BRICO E AUTO > ACESSÓRIOS AUTO > Suportes e carregadores","crossCategory":[{"source":"Suportes para Automóvel","targetId":"11","targetName":"BRICO E AUTO > ACESSÓRIOS AUTO > Suportes e carregadores"}]},{"id":"4.4.1","name":"SUPORTES TELEMÓVEL E TABLET","parent":"4.4"},{"id":"4.4.2","name":"SUPORTES AUTOMÓVEL E BICICLETA","parent":"4.4"},{"id":"4.4.3","name":"PORTA-CARTÕES E BOLSAS TELEMÓVEL","parent":"4.4"},{"id":"4.4.4","name":"PRODUTOS LIMPEZA ECRÃ","parent":"4.4"},{"id":"4.4.5","name":"PONTEIROS E LOCALIZADORES","parent":"4.4"},{"id":"4.4.6","name":"LINHA NATURA","parent":"4.4"},{"id":"4.5","name":"ACESSÓRIOS MÚSICA","parent":"4","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"4.5.1","name":"AUSCULTADORES","parent":"4.5"},{"id":"4.5.2","name":"AUSCULTADORES SEM FIOS","parent":"4.5"},{"id":"4.5.3","name":"AURICULARES","parent":"4.5"},{"id":"4.5.4","name":"AURICULARES SEM FIOS","parent":"4.5"},{"id":"4.5.5","name":"COLUNAS DE SOM","parent":"4.5"},{"id":"4.5.6","name":"COLUNAS MULTIFUNÇÕES","parent":"4.5"},{"id":"4.5.7","name":"LINHA NATURA","parent":"4.5"},{"id":"4.6","name":"ACESSÓRIOS FOTOGRAFIA E VÍDEO","parent":"4","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"4.6.1","name":"CÂMARAS E DRONES","parent":"4.6"},{"id":"4.6.2","name":"LENTES","parent":"4.6"},{"id":"4.6.3","name":"SELFIE STICKS","parent":"4.6"},{"id":"4.6.4","name":"TRIPÉS E PROJETORES DE LUZ","parent":"4.6"},{"id":"4.6.5","name":"PROJETORES DE IMAGEM","parent":"4.6"},{"id":"4.6.6","name":"ÓCULOS 3D E RV","parent":"4.6"},{"id":"4.7","name":"ACESSÓRIOS ILUMINAÇÃO","parent":"4","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹Luz Decoração tb em 9. CASA E VINHO >ACESSÓRIOS DECORAÇÃO > Luz Decoração 🔹 Luz Secretária tb em 6. ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA >Luz Secretária","crossCategory":[{"source":"Luz Decoração","targetId":"9","targetName":"CASA E VINHO >ACESSÓRIOS DECORAÇÃO > Luz Decoração"},{"source":"Luz Secretária","targetId":"6","targetName":"ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA >Luz Secretária"}]},{"id":"4.7.1","name":"PONTEIROS LASER","parent":"4.7"},{"id":"4.7.2","name":"LUZ DECORAÇÃO","parent":"4.7"},{"id":"4.7.3","name":"LUZ SECRETÁRIA","parent":"4.7"},{"id":"4.7.4","name":"LUZ MULTIFUNÇÕES","parent":"4.7"},{"id":"4.7.5","name":"LUZ ESTERILIZADORA","parent":"4.7"},{"id":"4.7.6","name":"LINHA NATURA","parent":"4.7"},{"id":"4.8","name":"RELÓGIOS E ESTAÇÕES DIGITAIS","parent":"4","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹Relógios de Parede tb em 9. CASA E VINHO >ACESSÓRIOS DECORAÇÃO > Relógios de Parede","crossCategory":[{"source":"Relógios de Parede","targetId":"9","targetName":"CASA E VINHO >ACESSÓRIOS DECORAÇÃO > Relógios de Parede"}]},{"id":"4.8.1","name":"RELÓGIOS DE MESA","parent":"4.8"},{"id":"4.8.2","name":"RELÓGIOS DE PAREDE","parent":"4.8"},{"id":"4.8.3","name":"RELÓGIOS DE PULSO","parent":"4.8"},{"id":"4.8.4","name":"RELÓGIOS INTELIGENTES","parent":"4.8"},{"id":"4.8.5","name":"RELÓGIOS MULTIFUNÇÕES","parent":"4.8"},{"id":"4.8.6","name":"ESTAÇÕES METEOROLÓGICAS","parent":"4.8"},{"id":"4.8.7","name":"LINHA NATURA","parent":"4.8"},{"id":"5","name":"SACOS E MOCHILAS","parent":null},{"id":"5.1","name":"SACOS","parent":"5","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸 Sacos Papel e Mini Sacos Tecido também em 7. AR LIVRE E EVENTOS > EVENTOS E FESTA > Caixas e Sacos Presente 🔹 Sacos de Praia tb em 7. AR LIVRE E EVENTOS > VERÃO E PRAIA > Sacos de Praia","crossCategory":[{"source":"Sacos de Praia","targetId":"7","targetName":"AR LIVRE E EVENTOS > VERÃO E PRAIA > Sacos de Praia"}]},{"id":"5.1.1","name":"SACOS","parent":"5.1"},{"id":"5.1.2","name":"SACOS DOBRÁVEIS","parent":"5.1"},{"id":"5.1.3","name":"SACOS LAMINADOS","parent":"5.1"},{"id":"5.1.4","name":"SACOS PAPEL","parent":"5.1"},{"id":"5.1.5","name":"SACOS DE PRAIA","parent":"5.1"},{"id":"5.1.6","name":"SACOS DE VIAGEM","parent":"5.1"},{"id":"5.1.7","name":"SACOS DE DESPORTO","parent":"5.1"},{"id":"5.1.8","name":"LINHA NATURA","parent":"5.1"},{"id":"5.2","name":"MOCHILAS","parent":"5","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹 Mochilas Criança tb em 08. INFANTIS E PETS > UTILIDADES CRIANÇA > Mochilas Criança","crossCategory":[{"source":"Mochilas Criança","targetId":"8","targetName":"INFANTIS E PETS > UTILIDADES CRIANÇA > Mochilas Criança"}]},{"id":"5.2.1","name":"MOCHILAS","parent":"5.2"},{"id":"5.2.2","name":"MOCHILAS TIPO SACO","parent":"5.2"},{"id":"5.2.3","name":"MOCHILAS DOBRÁVEIS","parent":"5.2"},{"id":"5.2.4","name":"MOCHILAS COMPUTADOR","parent":"5.2"},{"id":"5.2.5","name":"MOCHILAS REFLETORAS","parent":"5.2"},{"id":"5.2.6","name":"MOCHILAS CRIANÇA","parent":"5.2"},{"id":"5.2.7","name":"LINHA NATURA","parent":"5.2"},{"id":"5.3","name":"PASTAS","parent":"5","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"5.3.1","name":"PASTAS CONGRESSO","parent":"5.3"},{"id":"5.3.2","name":"PASTAS COMPUTADOR","parent":"5.3"},{"id":"5.3.3","name":"LINHA NATURA","parent":"5.3"},{"id":"5.4","name":"BOLSAS","parent":"5","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹 Bolsas Cosmética e Bolsas PVC tb em 7. AR LIVRE E EVENTOS > ACESSÓRIOS VIAGEM > Bolsas Cosmética","crossCategory":[{"source":"Bolsas Cosmética e Bolsas PVC","targetId":"7","targetName":"AR LIVRE E EVENTOS > ACESSÓRIOS VIAGEM > Bolsas Cosmética"}]},{"id":"5.4.1","name":"BOLSAS COSMÉTICA","parent":"5.4"},{"id":"5.4.2","name":"BOLSAS PVC","parent":"5.4"},{"id":"5.4.3","name":"BOLSAS CINTURA","parent":"5.4"},{"id":"5.4.4","name":"BOLSAS TIRACOLO","parent":"5.4"},{"id":"5.4.5","name":"BOLSAS CALÇADO","parent":"5.4"},{"id":"5.4.6","name":"BOLSAS MULTIUSOS","parent":"5.4"},{"id":"5.4.7","name":"LINHA NATURA","parent":"5.4"},{"id":"5.5","name":"TÉRMICOS","parent":"5","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"5.5.1","name":"SACOS TÉRMICOS","parent":"5.5"},{"id":"5.5.2","name":"MOCHILAS TÉRMICAS","parent":"5.5"},{"id":"5.5.3","name":"BOLSAS TÉRMICAS","parent":"5.5"},{"id":"5.5.4","name":"LINHA NATURA","parent":"5.5"},{"id":"5.6","name":"TROLLEYS","parent":"5","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"5.6.1","name":"TROLLEYS DE VIAGEM","parent":"5.6"},{"id":"5.6.2","name":"TROLLEYS MOCHILAS","parent":"5.6"},{"id":"5.6.3","name":"TROLLEYS SACO","parent":"5.6"},{"id":"5.6.4","name":"CARRINHOS DE COMPRAS","parent":"5.6"},{"id":"5.6.5","name":"LINHA NATURA","parent":"5.6"},{"id":"6","name":"ESCRITA E ESCRITÓRIO","parent":null},{"id":"6.1","name":"ACESSÓRIOS SECRETÁRIA","parent":"6","notes":"Usar LABELS Linha Natura CMYK Tempo de Entrega?? 🔹 Luz Secretária tb em 4. TECNOLOGIA > ACESSÓRIOS ILUMINAÇÂO >Luz Secretária 🔹 X-atos tb em 11. BRICO E AUTO > FERRAMENTAS > X-atos 🔹 Réguas tb em 8. INFANTIL E PETS > ACESSÓRIOS ESCOLA 🔸 Calendários e Plannings (SÓ exclusivos) em 12. 100% MADE4YOU > PAPELARIA > Calendários e Plannings 🔸 Material Escritório tb em 8. INFANTIL E PETS > ACESSÓRIOS ESCOLA > Material Escolar (Genérico + Infantil) 🔸 Conjuntos Colocar na subcat. “Conjuntos” (se existir) da Categoria do outro objeto","crossCategory":[{"source":"Luz Secretária","targetId":"4","targetName":"TECNOLOGIA > ACESSÓRIOS ILUMINAÇÂO >Luz Secretária"},{"source":"X-atos","targetId":"11","targetName":"BRICO E AUTO > FERRAMENTAS > X-atos"},{"source":"Réguas","targetId":"8","targetName":"INFANTIL E PETS > ACESSÓRIOS ESCOLA"},{"source":"Material Escritório","targetId":"8","targetName":"INFANTIL E PETS > ACESSÓRIOS ESCOLA > Material Escolar (Genérico + Infantil)"}]},{"id":"6.1.1","name":"ESTOJOS","parent":"6.1"},{"id":"6.1.2","name":"LUZ SECRETÁRIA","parent":"6.1"},{"id":"6.1.3","name":"CALENDÁRIOS E PLANNINGS","parent":"6.1"},{"id":"6.1.4","name":"ORGANIZADORES SECRETÁRIA","parent":"6.1"},{"id":"6.1.5","name":"CALCULADORAS","parent":"6.1"},{"id":"6.1.6","name":"MARCADORES DE PÁGINA","parent":"6.1"},{"id":"6.1.7","name":"X-ATOS","parent":"6.1"},{"id":"6.1.8","name":"RÉGUAS","parent":"6.1"},{"id":"6.1.9","name":"MATERIAL DE ESCRITÓRIO","parent":"6.1"},{"id":"6.1.10","name":"UTILIDADES","parent":"6.1"},{"id":"6.1.11","name":"CONJUNTOS","parent":"6.1"},{"id":"6.1.12","name":"LINHA NATURA","parent":"6.1"},{"id":"6.2","name":"CANETAS","parent":"6","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸 Marcadores tb em 8. INFANTIL E PETS > ACESSÓRIOS ESCOLA > Material Escolar (Genérico + Infantil) 🔸 Conjuntos Colocar na subcat. “Conjuntos” (se existir) da Categoria do outro objeto 🔹 Canetas Sem Tinta tb em> 06. ESCRITA E ESCRITÓRIO> LÁPIS E LAPISEIRAS > Lápis Infinito","crossCategory":[{"source":"Marcadores","targetId":"8","targetName":"INFANTIL E PETS > ACESSÓRIOS ESCOLA > Material Escolar (Genérico + Infantil)"}]},{"id":"6.2.1","name":"CANETAS","parent":"6.2"},{"id":"6.2.2","name":"CANETAS COM PONTEIRO","parent":"6.2"},{"id":"6.2.3","name":"CANETAS MINI","parent":"6.2"},{"id":"6.2.4","name":"CANETAS COM SUPORTE","parent":"6.2"},{"id":"6.2.5","name":"CANETAS MULTICOLOR","parent":"6.2"},{"id":"6.2.6","name":"CANETAS MULTIFUNÇÕES","parent":"6.2"},{"id":"6.2.7","name":"CANETAS COM TAMPA","parent":"6.2"},{"id":"6.2.8","name":"CANETAS SEM TINTA","parent":"6.2"},{"id":"6.2.9","name":"MARCADORES","parent":"6.2"},{"id":"6.2.10","name":"MARCAS","parent":"6.2"},{"id":"6.2.11","name":"CONJUNTOS E ESTOJOS","parent":"6.2"},{"id":"6.2.12","name":"LINHA NATURA","parent":"6.2"},{"id":"6.3","name":"LÁPIS E LAPISEIRAS","parent":"6","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹 Lápis Infinito tb em> 06. ESCRITA E ESCRITÓRIO> CANETAS > Canetas sem Tinta"},{"id":"6.3.1","name":"LÁPIS","parent":"6.3"},{"id":"6.3.2","name":"LÁPIS MINI","parent":"6.3"},{"id":"6.3.3","name":"LÁPIS CARPINTEIRO","parent":"6.3"},{"id":"6.3.4","name":"LÁPIS INFINITO","parent":"6.3"},{"id":"6.3.5","name":"LAPISEIRAS","parent":"6.3"},{"id":"6.3.6","name":"CONJUNTOS","parent":"6.3"},{"id":"6.3.7","name":"LINHA NATURA","parent":"6.3"},{"id":"6.4","name":"BLOCOS E CADERNOS","parent":"6","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸 Conjuntos Colocar na subcat. “Conjuntos” (se existir) da Categoria do outro objeto 🔸 Porta Notas e Post-its tb em 12. 100% MADE4YOU > PAPELARIA Porta Notas e Post-its","crossCategory":[{"source":"Porta Notas e Post-its","targetId":"12","targetName":"100% MADE4YOU > PAPELARIA Porta Notas e Post-its"}]},{"id":"6.4.1","name":"BLOCOS","parent":"6.4"},{"id":"6.4.2","name":"BLOCOS FLEXÍVEIS","parent":"6.4"},{"id":"6.4.3","name":"BLOCOS ARGOLAS","parent":"6.4"},{"id":"6.4.4","name":"CONJUNTOS","parent":"6.4"},{"id":"6.4.5","name":"BLOCOS MULTIFUNÇÕES","parent":"6.4"},{"id":"6.4.6","name":"PORTA NOTAS E POST-ITS","parent":"6.4"},{"id":"6.4.7","name":"AGENDAS","parent":"6.4"},{"id":"6.4.8","name":"LINHA NATURA","parent":"6.4"},{"id":"6.5","name":"PORTA-DOCUMENTOS","parent":"6","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"6.5.1","name":"PASTAS","parent":"6.5"},{"id":"6.5.2","name":"PASTAS MULTIFUNÇÕES","parent":"6.5"},{"id":"6.5.3","name":"PORTA-CARTÕES DE VISITA","parent":"6.5"},{"id":"6.5.4","name":"PRANCHETAS","parent":"6.5"},{"id":"6.5.5","name":"LINHA NATURA","parent":"6.5"},{"id":"7","name":"AR LIVRE E EVENTOS","parent":null},{"id":"7.1","name":"INVERNO","parent":"7","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹Acessórios Térmicos tb em 10. PESSOAIS > ACESSÓRIOS SAÚDE > Acessórios Térmicos","crossCategory":[{"source":"Acessórios Térmicos","targetId":"10","targetName":"PESSOAIS > ACESSÓRIOS SAÚDE > Acessórios Térmicos"}]},{"id":"7.1.1","name":"GORROS E LUVAS","parent":"7.1"},{"id":"7.1.2","name":"CACHECÓIS E GOLAS","parent":"7.1"},{"id":"7.1.3","name":"MANTAS","parent":"7.1"},{"id":"7.1.4","name":"IMPERMEÁVEIS E PONCHOS","parent":"7.1"},{"id":"7.1.5","name":"GUARDA-CHUVAS AUTOMÁTICOS","parent":"7.1"},{"id":"7.1.6","name":"GUARDA-CHUVAS MANUAIS","parent":"7.1"},{"id":"7.1.7","name":"GUARDA-CHUVAS DOBRÁVEIS","parent":"7.1"},{"id":"7.1.8","name":"ACESSÓRIOS TÉRMICOS","parent":"7.1"},{"id":"7.1.9","name":"LINHA NATURA","parent":"7.1"},{"id":"7.2","name":"VERÃO E PRAIA","parent":"7","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸 Chinelos tb em 2. TÊXTIL DESPORTO > ACESSÓRIOS DE DESPORTO > Sapatilhas e Chinelos 🔹 Sacos de Praia tb em 5. SACOS E MOCHILAS > SACOS > Sacos de Praia 🔸Bolas Vólei tb em 7. AR LIVRE E VENTOS > ACESSÓRIOS DESPORTO > Acessórios Futebol/Rugby/Vólei","crossCategory":[{"source":"Chinelos","targetId":"2","targetName":"TÊXTIL DESPORTO > ACESSÓRIOS DE DESPORTO > Sapatilhas e Chinelos"},{"source":"Sacos de Praia","targetId":"5","targetName":"SACOS E MOCHILAS > SACOS > Sacos de Praia"},{"source":"Bolas Vólei","targetId":"7","targetName":"AR LIVRE E VENTOS > ACESSÓRIOS DESPORTO > Acessórios Futebol/Rugby/Vólei"}]},{"id":"7.2.1","name":"ÓCULOS","parent":"7.2"},{"id":"7.2.2","name":"CHINELOS","parent":"7.2"},{"id":"7.2.3","name":"ESTEIRAS E CADEIRAS","parent":"7.2"},{"id":"7.2.4","name":"TOALHAS E PÁREOS","parent":"7.2"},{"id":"7.2.5","name":"GUARDA-SÓIS E PARA-VENTOS","parent":"7.2"},{"id":"7.2.6","name":"SACOS DE PRAIA","parent":"7.2"},{"id":"7.2.7","name":"PROTETORES E MEDIDORES UV","parent":"7.2"},{"id":"7.2.8","name":"VENTILADORES E VAPORIZADORES","parent":"7.2"},{"id":"7.2.9","name":"INSUFLÁVEIS","parent":"7.2"},{"id":"7.2.10","name":"LEQUES","parent":"7.2"},{"id":"7.2.11","name":"JOGOS DE PRAIA","parent":"7.2"},{"id":"7.2.12","name":"LINHA NATURA","parent":"7.2"},{"id":"7.3","name":"ACESSÓRIOS AR LIVRE","parent":"7","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"7.3.1","name":"ACESSÓRIOS CAMPISMO","parent":"7.3"},{"id":"7.3.2","name":"ACESSÓRIOS PICNIC","parent":"7.3"},{"id":"7.3.3","name":"ACESSÓRIOS BARBECUE","parent":"7.3"},{"id":"7.3.4","name":"ACESSÓRIOS JARDINAGEM","parent":"7.3"},{"id":"7.3.5","name":"LINHA NATURA","parent":"7.3"},{"id":"7.4","name":"ACESSÓRIOS VIAGEM","parent":"7","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Máscaras de Viagem tb em 3. TÊXTIL LABORAL > Saúde e Estética > Acessórios ⚠EXCLUIR Máscaras COVID de todo o site 🔹 Bolsas Cosmética e Bolsas PVC tb em 5. SACOS E MOCHILAS > BOLSAS > Bolsas Cosmética 🔸Kits costura + kits engraxar tb em 10. PESSOAIS >ACESSÓRIOS jogos E CALÇADO >Acessórios para Roupa + Calçado","crossCategory":[{"source":"Máscaras de Viagem","targetId":"3","targetName":"TÊXTIL LABORAL > Saúde e Estética > Acessórios"},{"source":"Bolsas Cosmética e Bolsas PVC","targetId":"5","targetName":"SACOS E MOCHILAS > BOLSAS > Bolsas Cosmética"},{"source":"Kits costura + kits engraxar","targetId":"10","targetName":"PESSOAIS >ACESSÓRIOS jogos E CALÇADO >Acessórios para Roupa + Calçado"}]},{"id":"7.4.1","name":"ACESSÓRIOS MALA","parent":"7.4"},{"id":"7.4.2","name":"ALMOFADAS E TAMPÕES","parent":"7.4"},{"id":"7.4.3","name":"MÁSCARAS","parent":"7.4"},{"id":"7.4.4","name":"BOLSAS COSMÉTICA","parent":"7.4"},{"id":"7.4.5","name":"BOLSAS PVC","parent":"7.4"},{"id":"7.4.6","name":"PORTA-FATOS E PORTA GRAVATAS","parent":"7.4"},{"id":"7.4.7","name":"BOLSAS PASSAPORTE","parent":"7.4"},{"id":"7.4.8","name":"UTILITÁRIOS VIAGEM","parent":"7.4"},{"id":"7.4.9","name":"LINHA NATURA","parent":"7.4"},{"id":"7.5","name":"ACESSÓRIOS DESPORTO","parent":"7","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Acessórios (de Desporto) tb em 2. TÊXTIL DESPORTO>ACESSÓRIOS DE DESPORTO > Acessórios(colocar artigos que tanto são têxtil como Brinde: fitas cabelo, braçadeiras, etc) ⚠Cordas de Saltar sem ter aspeto desporto (madeira, etc.) colorar em: 8. INFANTIL E PETS > BRINQUEDOS > Jogos Tradicionais Criança 🔸Bolas Vólei tb em 7. AR LIVRE E VENTOS > VERÃO E PRAIA > Jogos de Praia 🔹Toalhas Desporto tb em 2. TÊXTIL DESPORTO >ACESSÓRIOS DE DESPORTO > Toalhas Desporto","crossCategory":[{"source":"Acessórios","targetId":"2","targetName":"TÊXTIL DESPORTO>ACESSÓRIOS DE DESPORTO > Acessórios(colocar artigos que tanto são têxtil como Brinde: fitas cabelo, braçadeiras, etc)"},{"source":"Bolas Vólei","targetId":"7","targetName":"AR LIVRE E VENTOS > VERÃO E PRAIA > Jogos de Praia"},{"source":"Toalhas Desporto","targetId":"2","targetName":"TÊXTIL DESPORTO >ACESSÓRIOS DE DESPORTO > Toalhas Desporto"}]},{"id":"7.5.1","name":"ACESSÓRIOS DE DESPORTO","parent":"7.5"},{"id":"7.5.2","name":"FITNESS","parent":"7.5"},{"id":"7.5.3","name":"IOGA E PILATES","parent":"7.5"},{"id":"7.5.4","name":"CYCLING","parent":"7.5"},{"id":"7.5.5","name":"FUTEBOL, RUGBY E VÓLEI","parent":"7.5"},{"id":"7.5.6","name":"CORRIDA E CAMINHADA","parent":"7.5"},{"id":"7.5.7","name":"LUZES E REFLETORES","parent":"7.5"},{"id":"7.5.8","name":"TOALHAS DESPORTO","parent":"7.5"},{"id":"7.5.9","name":"LINHA NATURA","parent":"7.5"},{"id":"7.6","name":"EVENTOS E FESTA","parent":"7","notes":"Usar LABELS Linha Natura CMYK Tempo de Entrega?? 🔸 Lanyards tb em 10. PESSOAIS >LANYARDS >Lanyards Simples >Lanyards com Fecho >Lanyards com Cordão >Lanyards com Bolsa 🔸 Lanyards tb em 7. AR LIVRE E EVENTOS >EVENTOS E FESTA >Lanyards 🔹Copos Reutilizáveis tb em 9. CASA E VINHO > CANECAS E COPOS > Copos Reutilizáveis 🔸 Sacos Papel e Mini Sacos Tecido tb em 5. SACOS E MOCHILAS > SACOS > Sacos","crossCategory":[{"source":"Lanyards","targetId":"10","targetName":"PESSOAIS >LANYARDS >Lanyards Simples >Lanyards com Fecho >Lanyards com Cordão >Lanyards com Bolsa"},{"source":"Lanyards","targetId":"7","targetName":"AR LIVRE E EVENTOS >EVENTOS E FESTA >Lanyards"},{"source":"Copos Reutilizáveis","targetId":"9","targetName":"CASA E VINHO > CANECAS E COPOS > Copos Reutilizáveis"},{"source":"Sacos Papel e Mini Sacos Tecido","targetId":"5","targetName":"SACOS E MOCHILAS > SACOS > Sacos"}]},{"id":"7.6.1","name":"LANYARDS","parent":"7.6"},{"id":"7.6.2","name":"CRACHÁS E PINS","parent":"7.6"},{"id":"7.6.3","name":"PULSEIRAS","parent":"7.6"},{"id":"7.6.4","name":"DECORAÇÃO E ADEREÇOS","parent":"7.6"},{"id":"7.6.5","name":"BATE-PALMAS","parent":"7.6"},{"id":"7.6.6","name":"BANDEIRAS","parent":"7.6"},{"id":"7.6.7","name":"MEDALHAS E TROFÉUS","parent":"7.6"},{"id":"7.6.8","name":"DOCES","parent":"7.6"},{"id":"7.6.9","name":"COPOS REUTILIZÁVEIS","parent":"7.6"},{"id":"7.6.10","name":"CAIXAS E SACOS PRESENTE","parent":"7.6"},{"id":"7.6.11","name":"LINHA NATURA","parent":"7.6"},{"id":"7.7","name":"ESPECIAL NATAL","parent":"7","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"7.7.1","name":"CASA","parent":"7.7"},{"id":"7.7.2","name":"COZINHA","parent":"7.7"},{"id":"7.7.3","name":"ENFEITES","parent":"7.7"},{"id":"7.7.4","name":"ESCRITA","parent":"7.7"},{"id":"7.7.5","name":"TÊXTIL NATAL","parent":"7.7"},{"id":"7.7.6","name":"CABAZES E CONJUNTOS","parent":"7.7"},{"id":"7.7.7","name":"INFANTIL","parent":"7.7"},{"id":"7.7.8","name":"SACOS E BOLSAS","parent":"7.7"},{"id":"7.7.9","name":"PESSOAIS","parent":"7.7"},{"id":"7.7.10","name":"LINHA NATURA","parent":"7.7"},{"id":"7.8","name":"JOGOS","parent":"7","notes":"Usar LABELS Linha Natura Tempo de Entrega?? ⚠EXCLUIR PUZZLES 🔹Jogos Quebra-cabeças tb em 8. INFANTIL E PETS > BRINQUEDOS > Jogos Quebra-cabeças","crossCategory":[{"source":"Jogos Quebra-cabeças","targetId":"8","targetName":"INFANTIL E PETS > BRINQUEDOS > Jogos Quebra-cabeças"}]},{"id":"7.8.1","name":"JOGOS","parent":"7.8"},{"id":"7.8.2","name":"CARTAS","parent":"7.8"},{"id":"7.8.3","name":"DOMINÓS","parent":"7.8"},{"id":"7.8.4","name":"JOGOS DE TABULEIRO","parent":"7.8"},{"id":"7.8.5","name":"JOGOS TRADICIONAIS","parent":"7.8"},{"id":"7.8.6","name":"JOGOS QUEBRA-CABEÇAS","parent":"7.8"},{"id":"7.8.7","name":"BOLAS E ACESSÓRIOS","parent":"7.8"},{"id":"7.8.8","name":"LINHA NATURA","parent":"7.8"},{"id":"8","name":"INFANTIL E PETS","parent":null},{"id":"8.1","name":"ACESSÓRIOS ESCOLA","parent":"8","notes":"🔹 Mochilas Criança tb em 5. SACOS E MOCHILAS > MOCHILAS > Mochilas Criança 🔸 Material Escolar (Highlighters) tb em 6. ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > Material de Escritório (EXCLUIR material infantil) 🔹 Réguas tb em 6. ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > Conjuntos 🔸 Conjuntos Colocar na subcat. “Conjuntos” (se existir) da Categoria do outro objeto","crossCategory":[{"source":"Mochilas Criança","targetId":"5","targetName":"SACOS E MOCHILAS > MOCHILAS > Mochilas Criança"},{"source":"Material Escolar","targetId":"6","targetName":"ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > Material de Escritório (EXCLUIR material infantil)"},{"source":"Réguas","targetId":"6","targetName":"ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > Conjuntos"}]},{"id":"8.1.1","name":"CANETAS","parent":"8.1"},{"id":"8.1.2","name":"LÁPIS","parent":"8.1"},{"id":"8.1.3","name":"COLORIR","parent":"8.1"},{"id":"8.1.4","name":"ESTOJOS","parent":"8.1"},{"id":"8.1.5","name":"MOCHILAS CRIANÇA","parent":"8.1"},{"id":"8.1.6","name":"RÉGUAS","parent":"8.1"},{"id":"8.1.7","name":"MATERIAL ESCOLAR","parent":"8.1"},{"id":"8.1.8","name":"CONJUNTOS","parent":"8.1"},{"id":"8.1.9","name":"LINHA NATURA","parent":"8.1"},{"id":"8.2","name":"TÊXTIL 100% MADE 4 YOU","parent":"8","notes":"🔹TÊXTIL 100% MADE 4YOU tb em 12.1. 100% MADE 4YOU","crossCategory":[{"source":"TÊXTIL 100% MADE 4YOU","targetId":"12.1","targetName":"100% MADE 4YOU"}]},{"id":"8.2.1","name":"EQUIPAMENTOS","parent":"8.2"},{"id":"8.2.2","name":"FATOS DE TREINO","parent":"8.2"},{"id":"8.2.3","name":"T-SHIRTS E SINGLETES","parent":"8.2"},{"id":"8.2.4","name":"POLOS","parent":"8.2"},{"id":"8.2.5","name":"SWEATSHIRTS","parent":"8.2"},{"id":"8.2.6","name":"CALÇAS E CALÇÕES","parent":"8.2"},{"id":"8.2.7","name":"CACHECÓIS E GOLAS","parent":"8.2"},{"id":"8.3","name":"TÊXTIL CRIANÇA","parent":"8","notes":"⚠ incluir têxteis de criança aqui Seleção de todos os artigos de Criança 🔸Aventais Criança tb em 9. CASA E VINHO > ACESSÓRIOS COZINHA > Aventais 📌A pensar à Posteriori Artigos 100% MADE4YOU Criança","crossCategory":[{"source":"Aventais Criança","targetId":"9","targetName":"CASA E VINHO > ACESSÓRIOS COZINHA > Aventais"}]},{"id":"8.3.1","name":"T-SHIRTS E TOPS","parent":"8.3"},{"id":"8.3.2","name":"POLOS","parent":"8.3"},{"id":"8.3.3","name":"SWEATSHIRTS","parent":"8.3"},{"id":"8.3.4","name":"CASACOS E COLETES","parent":"8.3"},{"id":"8.3.5","name":"CALÇAS E CALÇÕES","parent":"8.3"},{"id":"8.3.6","name":"BONÉS E CHAPÉUS","parent":"8.3"},{"id":"8.3.7","name":"BODIES E BABY-GROWS","parent":"8.3"},{"id":"8.3.8","name":"BABETES E INTERIORES","parent":"8.3"},{"id":"8.3.9","name":"AVENTAIS","parent":"8.3"},{"id":"8.3.10","name":"CAMISAS","parent":"8.3"},{"id":"8.3.11","name":"TÊXTEIS DE INVERNO","parent":"8.3"},{"id":"8.3.12","name":"LINHA NATURA","parent":"8.3"},{"id":"8.4","name":"TÊXTIL DESPORTO CRIANÇA","parent":"8","notes":"⚠ incluir têxteis de criança aqui Seleção de todos os artigos de Criança 🔸Aventais Criança tb em 9. CASA E VINHO > ACESSÓRIOS COZINHA > Aventais 📌A pensar à Posteriori Artigos 100% MADE4YOU Criança","crossCategory":[{"source":"Aventais Criança","targetId":"9","targetName":"CASA E VINHO > ACESSÓRIOS COZINHA > Aventais"}]},{"id":"8.4.1","name":"T-SHIRTS E TOPS","parent":"8.4"},{"id":"8.4.2","name":"POLOS","parent":"8.4"},{"id":"8.4.3","name":"SWEATSHIRTS","parent":"8.4"},{"id":"8.4.4","name":"CASACOS E COLETES","parent":"8.4"},{"id":"8.4.5","name":"CALÇAS E CALÇÕES","parent":"8.4"},{"id":"8.4.6","name":"EQUIPAMENTOS E FATOS DE TREINO","parent":"8.4"},{"id":"8.4.7","name":"BONÉS","parent":"8.4"},{"id":"8.4.8","name":"ACESSÓRIOS","parent":"8.4"},{"id":"8.5","name":"BRINQUEDOS","parent":"8","notes":"Usar LABELS Linha Natura Tempo de Entrega?? ⚠Cordas de Saltar com aspeto desporto colorar em: 7. AR LIVRE E VENTOS > ACESSÓRIOS DESPORTO > Acessórios Fitness 🔹Jogos Quebra-cabeças tb em 7. AR LIVRE E EVENTOS > JOGOS > Jogos Quebra-cabeças","crossCategory":[{"source":"Jogos Quebra-cabeças","targetId":"7","targetName":"AR LIVRE E EVENTOS > JOGOS > Jogos Quebra-cabeças"}]},{"id":"8.5.1","name":"JOGOS","parent":"8.5"},{"id":"8.5.2","name":"JOGOS TRADICIONAIS CRIANÇA","parent":"8.5"},{"id":"8.5.3","name":"JOGOS QUEBRA-CABEÇAS","parent":"8.5"},{"id":"8.5.4","name":"JOGOS SCIENCE4YOU","parent":"8.5"},{"id":"8.5.5","name":"PUZZLES","parent":"8.5"},{"id":"8.5.6","name":"BONECOS","parent":"8.5"},{"id":"8.5.7","name":"LINHA NATURA","parent":"8.5"},{"id":"8.6","name":"UTILIDADES CRIANÇA","parent":"8","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"8.6.1","name":"COPOS E GARRAFAS","parent":"8.6"},{"id":"8.6.2","name":"MEALHEIROS","parent":"8.6"},{"id":"8.6.3","name":"HIGIENE CRIANÇA","parent":"8.6"},{"id":"8.6.4","name":"SEGURANÇA DA CRIANÇA","parent":"8.6"},{"id":"8.6.5","name":"UTILIDADES","parent":"8.6"},{"id":"8.6.6","name":"LINHA NATURA","parent":"8.6"},{"id":"8.7","name":"ACESSÓRIOS ANIMAIS","parent":"8","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"8.7.1","name":"ACESSÓRIOS","parent":"8.7"},{"id":"8.7.2","name":"ALIMENTAÇÃO","parent":"8.7"},{"id":"8.7.3","name":"BRINQUEDOS","parent":"8.7"},{"id":"8.7.4","name":"HIGIENE E PASSEIO","parent":"8.7"},{"id":"8.7.5","name":"LINHA NATURA","parent":"8.7"},{"id":"9","name":"CASA E VINHO","parent":null},{"id":"9.1","name":"CANECAS E COPOS","parent":"9","notes":"Usar LABELS Linha Natura CMYK Certificado FOOD Tempo de Entrega?? 🔹Copos Reutilizáveis tb em 7. AR LIVRE E EVENTOS > EVENTOS E FESTA > Copos Reutilizáveis","crossCategory":[{"source":"Copos Reutilizáveis","targetId":"7","targetName":"AR LIVRE E EVENTOS > EVENTOS E FESTA > Copos Reutilizáveis"}]},{"id":"9.1.1","name":"CANECAS","parent":"9.1"},{"id":"9.1.2","name":"CANECAS VINTAGE","parent":"9.1"},{"id":"9.1.3","name":"COPOS","parent":"9.1"},{"id":"9.1.4","name":"COPOS REUTILIZÁVEIS","parent":"9.1"},{"id":"9.1.5","name":"COPOS TÉRMICOS","parent":"9.1"},{"id":"9.1.6","name":"COPOS PORTÁTEIS","parent":"9.1"},{"id":"9.1.7","name":"LINHA NATURA","parent":"9.1"},{"id":"9.2","name":"GARRAFAS","parent":"9","notes":"Usar LABELS Linha Natura CMYK Tempo de Entrega??"},{"id":"9.2.1","name":"GARRAFAS","parent":"9.2"},{"id":"9.2.2","name":"GARRAFAS TÉRMICAS","parent":"9.2"},{"id":"9.2.3","name":"GARRAFAS DOBRÁVEIS","parent":"9.2"},{"id":"9.2.4","name":"GARRAFAS DESPORTO","parent":"9.2"},{"id":"9.2.5","name":"GARRAFAS MULTIUSOS","parent":"9.2"},{"id":"9.2.6","name":"LINHA NATURA","parent":"9.2"},{"id":"9.3","name":"ACESSÓRIOS COZINHA","parent":"9","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Aventais Criança tb em 8. INFANTIL E PETS > TÊXTIL CRIANÇA > Aventais 🔹 Isqueiros de Cozinha tb em 11. BRICO E AUTO > ISQ. E CINZEIROS > Isqueiros de Cozinha","crossCategory":[{"source":"Aventais Criança","targetId":"8","targetName":"INFANTIL E PETS > TÊXTIL CRIANÇA > Aventais"},{"source":"Isqueiros de Cozinha","targetId":"11","targetName":"BRICO E AUTO > ISQ. E CINZEIROS > Isqueiros de Cozinha"}]},{"id":"9.3.1","name":"AVENTAIS","parent":"9.3"},{"id":"9.3.2","name":"TÊXTEIS COZINHA","parent":"9.3"},{"id":"9.3.3","name":"LANCHEIRAS E RECIPIENTES","parent":"9.3"},{"id":"9.3.4","name":"TÁBUAS DE COZINHA","parent":"9.3"},{"id":"9.3.5","name":"INDIVIDUAIS DE MESA E COPOS","parent":"9.3"},{"id":"9.3.6","name":"ACESSÓRIOS DE MESA","parent":"9.3"},{"id":"9.3.7","name":"LOUÇAS E TALHERES","parent":"9.3"},{"id":"9.3.8","name":"TACHOS E PANELAS","parent":"9.3"},{"id":"9.3.9","name":"ISQUEIROS DE COZINHA","parent":"9.3"},{"id":"9.3.10","name":"FERRAMENTAS COZINHA","parent":"9.3"},{"id":"9.3.11","name":"UTILITÁRIOS","parent":"9.3"},{"id":"9.3.12","name":"CONJUNTOS","parent":"9.3"},{"id":"9.3.13","name":"LINHA NATURA","parent":"9.3"},{"id":"9.4","name":"ACESSÓRIOS CHÁ E CAFÉ","parent":"9","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"9.4.1","name":"CHÁVENAS DE CHÁ E CAFÉ","parent":"9.4"},{"id":"9.4.2","name":"CHALEIRAS E CAFETEIRAS","parent":"9.4"},{"id":"9.4.3","name":"BULES E CAIXAS DE CHÁ","parent":"9.4"},{"id":"9.4.4","name":"CONJUNTOS","parent":"9.4"},{"id":"9.4.5","name":"LINHA NATURA","parent":"9.4"},{"id":"9.5","name":"ACESSÓRIOS VINHO","parent":"9","notes":"Usar LABELS Linha Natura Tempo de Entrega?? ⚠Ocultar Vinhos (ex. M6031)"},{"id":"9.5.1","name":"SACA-ROLHAS","parent":"9.5"},{"id":"9.5.2","name":"ACESSÓRIOS VINHO","parent":"9.5"},{"id":"9.5.3","name":"JARROS E COPOS DE VINHO","parent":"9.5"},{"id":"9.5.4","name":"CAIXAS, SACOS E PORTA-GARRAFAS","parent":"9.5"},{"id":"9.5.5","name":"BALDES GELO E REFRIGERADORES","parent":"9.5"},{"id":"9.5.6","name":"CONJUNTOS","parent":"9.5"},{"id":"9.5.7","name":"LINHA NATURA","parent":"9.5"},{"id":"9.6","name":"ACESSÓRIOS BAR","parent":"9","notes":"Usar LABELS Linha Natura CMYK Tempo de Entrega??"},{"id":"9.6.1","name":"DESCAPSULADORES","parent":"9.6"},{"id":"9.6.2","name":"ACESSÓRIOS BAR","parent":"9.6"},{"id":"9.6.3","name":"GARRAFAS E COPOS DE BAR","parent":"9.6"},{"id":"9.6.4","name":"ACESSÓRIOS COCKTAIL","parent":"9.6"},{"id":"9.6.5","name":"CONJUNTOS","parent":"9.6"},{"id":"9.6.6","name":"LINHA NATURA","parent":"9.6"},{"id":"9.7","name":"ACESSÓRIOS DECORAÇÃO","parent":"9","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹Luz Decoração tb em 4. TECNOLOGIA >ACESSÓRIOS ILUMINAÇÃO > Luz Decoração 🔹Relógios de Parede tb em 4. TECNOLOGIA >RELÓGIOS E ESTAÇÕES DIGITAIS > Relógios de Parede","crossCategory":[{"source":"Luz Decoração","targetId":"4","targetName":"TECNOLOGIA >ACESSÓRIOS ILUMINAÇÃO > Luz Decoração"},{"source":"Relógios de Parede","targetId":"4","targetName":"TECNOLOGIA >RELÓGIOS E ESTAÇÕES DIGITAIS > Relógios de Parede"}]},{"id":"9.7.1","name":"LUZ DECORAÇÃO","parent":"9.7"},{"id":"9.7.2","name":"VELAS E AMBIENTADORES","parent":"9.7"},{"id":"9.7.3","name":"HUMIDIFICADORES","parent":"9.7"},{"id":"9.7.4","name":"VASOS E PLANTAS","parent":"9.7"},{"id":"9.7.5","name":"RELÓGIOS DE PAREDE","parent":"9.7"},{"id":"9.7.6","name":"PORTA-RETRATOS","parent":"9.7"},{"id":"9.7.7","name":"DECORATIVOS","parent":"9.7"},{"id":"9.7.8","name":"LINHA NATURA","parent":"9.7"},{"id":"10","name":"PESSOAIS","parent":null},{"id":"10.1","name":"LANYARDS","parent":"10","notes":"Usar LABELS Linha Natura CMYK Tempo de Entrega?? 🔸 Lanyards tb em 7. AR LIVRE E EVENTOS >EVENTOS E FESTA >Lanyards","crossCategory":[{"source":"Lanyards","targetId":"7","targetName":"AR LIVRE E EVENTOS >EVENTOS E FESTA >Lanyards"}]},{"id":"10.1.1","name":"LANYARDS SIMPLES","parent":"10.1"},{"id":"10.1.2","name":"LANYARDS COM FECHO","parent":"10.1"},{"id":"10.1.3","name":"LANYARDS CORDÃO","parent":"10.1"},{"id":"10.1.4","name":"LANYARDS COM SUPORTE","parent":"10.1"},{"id":"10.1.5","name":"IDENTIFICADORES","parent":"10.1"},{"id":"10.1.6","name":"LINHA NATURA","parent":"10.1"},{"id":"10.2","name":"PORTA-CHAVES","parent":"10","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸 Lanternas Porta-chaves tb em 11. BRICO E AUTO >LANTERNAS >Lanternas Porta-chaves","crossCategory":[{"source":"Lanternas Porta-chaves","targetId":"11","targetName":"BRICO E AUTO >LANTERNAS >Lanternas Porta-chaves"}]},{"id":"10.2.1","name":"PORTA-CHAVES","parent":"10.2"},{"id":"10.2.2","name":"PORTA-CHAVES DESCAPSULADORES","parent":"10.2"},{"id":"10.2.3","name":"PORTA-CHAVES MOEDA","parent":"10.2"},{"id":"10.2.4","name":"PORTA-CHAVES MOLDURA","parent":"10.2"},{"id":"10.2.5","name":"PORTA-CHAVES FIGURAS","parent":"10.2"},{"id":"10.2.6","name":"PORTA-CHAVES MULTIFUNÇÕES","parent":"10.2"},{"id":"10.2.7","name":"LINHA NATURA","parent":"10.2"},{"id":"10.3","name":"PORTA-MOEDAS E PORTA-CARTÕES","parent":"10","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"10.3.1","name":"PORTA-MOEDAS","parent":"10.3"},{"id":"10.3.2","name":"CARTEIRAS","parent":"10.3"},{"id":"10.3.3","name":"PORTA-CARTÕES","parent":"10.3"},{"id":"10.3.4","name":"PORTA-CARTÕES RFID","parent":"10.3"},{"id":"10.3.5","name":"LINHA NATURA","parent":"10.3"},{"id":"10.4","name":"ACESSÓRIOS HIGIENE","parent":"10","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹Higienizantes tb em 10. PESSOAIS >ACCESSÓRIOS SAÚDE > Higienizantes","crossCategory":[{"source":"Higienizantes","targetId":"10","targetName":"PESSOAIS >ACCESSÓRIOS SAÚDE > Higienizantes"}]},{"id":"10.4.1","name":"ESCOVAS DE DENTES","parent":"10.4"},{"id":"10.4.2","name":"SABONETES E CHAMPÔS","parent":"10.4"},{"id":"10.4.3","name":"TOALHAS DE BANHO","parent":"10.4"},{"id":"10.4.4","name":"HIGIENIZANTES","parent":"10.4"},{"id":"10.4.5","name":"UTILITÁRIOS DE BANHO","parent":"10.4"},{"id":"10.4.6","name":"CONJUNTOS","parent":"10.4"},{"id":"10.4.7","name":"LINHA NATURA","parent":"10.4"},{"id":"10.5","name":"ACESSÓRIOS BELEZA","parent":"10","notes":"Usar LABELS Linha Natura Tempo de Entrega??"},{"id":"10.5.1","name":"ESPELHOS","parent":"10.5"},{"id":"10.5.2","name":"BÁLSAMOS E BATONS","parent":"10.5"},{"id":"10.5.3","name":"MANICURE","parent":"10.5"},{"id":"10.5.4","name":"PERFUMES E SPA","parent":"10.5"},{"id":"10.5.5","name":"ACESSÓRIOS CABELO","parent":"10.5"},{"id":"10.5.6","name":"CONJUNTOS","parent":"10.5"},{"id":"10.5.7","name":"LINHA NATURA","parent":"10.5"},{"id":"10.6","name":"ACESSÓRIOS SAÚDE","parent":"10","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹Higienizantes tb em 10. PESSOAIS >ACCESSÓRIOS HIGIENE > Higienizantes 🔹Acessórios Térmicos tb em 7. AR LIVRE E EVENTOS > INVERNO > Acessórios Térmicos","crossCategory":[{"source":"Higienizantes","targetId":"10","targetName":"PESSOAIS >ACCESSÓRIOS HIGIENE > Higienizantes"},{"source":"Acessórios Térmicos","targetId":"7","targetName":"AR LIVRE E EVENTOS > INVERNO > Acessórios Térmicos"}]},{"id":"10.6.1","name":"ANTISSTRESS","parent":"10.6"},{"id":"10.6.2","name":"HIGIENIZANTES","parent":"10.6"},{"id":"10.6.3","name":"CAIXAS COMPRIMIDOS","parent":"10.6"},{"id":"10.6.4","name":"PRIMEIROS SOCORROS","parent":"10.6"},{"id":"10.6.5","name":"BALANÇAS E MEDIDORES","parent":"10.6"},{"id":"10.6.6","name":"ACESSÓRIOS TÉRMICOS","parent":"10.6"},{"id":"10.6.7","name":"LINHA NATURA","parent":"10.6"},{"id":"10.7","name":"ACESSÓRIOS MODA E CALÇADO","parent":"10","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸Kits costura + kits engraxar tb em 7. AR LIVRE E EVENTOS >ACESSÓRIOS EVENTOS >Utilitários Viagem","crossCategory":[{"source":"Kits costura + kits engraxar","targetId":"7","targetName":"AR LIVRE E EVENTOS >ACESSÓRIOS EVENTOS >Utilitários Viagem"}]},{"id":"10.7.1","name":"ACESSÓRIOS MODA","parent":"10.7"},{"id":"10.7.2","name":"ACESSÓRIOS PARA ROUPA","parent":"10.7"},{"id":"10.7.3","name":"ACESSÓRIOS PARA CALÇADO","parent":"10.7"},{"id":"10.7.4","name":"LINHA NATURA","parent":"10.7"},{"id":"11","name":"BRICO E AUTO","parent":null},{"id":"11.1","name":"FERRAMENTAS","parent":"11","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹 X-atos tb em 6. ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > X-atos","crossCategory":[{"source":"X-atos","targetId":"6","targetName":"ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > X-atos"}]},{"id":"11.1.1","name":"FERRAMENTAS","parent":"11.1"},{"id":"11.1.2","name":"X-ATOS","parent":"11.1"},{"id":"11.1.3","name":"NAVALHAS E CANIVETES","parent":"11.1"},{"id":"11.1.4","name":"FERRAMENTAS DE MEDIÇÃO","parent":"11.1"},{"id":"11.1.5","name":"FERRAMENTAS MULTIFUNÇÕES","parent":"11.1"},{"id":"11.1.6","name":"KITS DE FERRAMENTAS","parent":"11.1"},{"id":"11.1.7","name":"PILHAS","parent":"11.1"},{"id":"11.1.8","name":"LINHA NATURA","parent":"11.1"},{"id":"11.2","name":"ACESSÓRIOS AUTOMÓVEL","parent":"11","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸 Carregadores Automóvel + Suportes para Automóvel tb em 4. TECNOLOGIA > POWERBANKS E CARREGADORES > Carregadores Automóvel + 4. TECNOLOGIA >ACESS. TELEMÓVEIS E TABLETS >Suportes para Automóvel e Bicicleta 🔸 Mantas Térmicas tb em 10. PESSOAIS >ACESSÓRIOS SAÚDE >Acessórios térmicos + 7. AR LIVRE E EVENTOS >INVERNO >Acessórios térmicos","crossCategory":[{"source":"Carregadores Automóvel + Suportes para Automóvel","targetId":"4","targetName":"TECNOLOGIA > POWERBANKS E CARREGADORES > Carregadores Automóvel + 4. TECNOLOGIA >ACESS. TELEMÓVEIS E TABLETS >Suportes para Automóvel e Bicicleta"},{"source":"Mantas Térmicas","targetId":"10","targetName":"PESSOAIS >ACESSÓRIOS SAÚDE >Acessórios térmicos + 7. AR LIVRE E EVENTOS >INVERNO >Acessórios térmicos"}]},{"id":"11.2.1","name":"TAPA-SÓIS","parent":"11.2"},{"id":"11.2.2","name":"SUPORTES E CARREGADORES","parent":"11.2"},{"id":"11.2.3","name":"EMERGÊNCIA AUTOMÓVEL","parent":"11.2"},{"id":"11.2.4","name":"ORGANIZAÇÃO E LIMPEZA","parent":"11.2"},{"id":"11.2.5","name":"UTILITÁRIOS AUTO","parent":"11.2"},{"id":"11.2.6","name":"LINHA NATURA","parent":"11.2"},{"id":"11.3","name":"LANTERNAS","parent":"11","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔸 Lanternas Porta-chaves tb em 10. PESSOAIS > PORTA-CHAVES > Porta-chaves Multifunções","crossCategory":[{"source":"Lanternas Porta-chaves","targetId":"10","targetName":"PESSOAIS > PORTA-CHAVES > Porta-chaves Multifunções"}]},{"id":"11.3.1","name":"LANTERNAS","parent":"11.3"},{"id":"11.3.2","name":"LANTERNAS FRONTAIS","parent":"11.3"},{"id":"11.3.3","name":"LANTERNAS PORTA-CHAVES","parent":"11.3"},{"id":"11.3.4","name":"LANTERNAS MULTIFUNÇÕES","parent":"11.3"},{"id":"11.3.5","name":"LINHA NATURA","parent":"11.3"},{"id":"11.4","name":"ISQUEIROS E CINZEIROS","parent":"11","notes":"Usar LABELS Linha Natura Tempo de Entrega?? 🔹 Isqueiros de Cozinha tb em 8. CASA E VINHO > ACESSÓRIOS COZINHA > Isqueiros de Cozinha","crossCategory":[{"source":"Isqueiros de Cozinha","targetId":"8","targetName":"CASA E VINHO > ACESSÓRIOS COZINHA > Isqueiros de Cozinha"}]},{"id":"11.4.1","name":"ISQUEIROS DE BOLSO","parent":"11.4"},{"id":"11.4.2","name":"ISQUEIROS DE COZINHA","parent":"11.4"},{"id":"11.4.3","name":"FÓSFOROS","parent":"11.4"},{"id":"11.4.4","name":"CINZEIROS","parent":"11.4"},{"id":"11.4.5","name":"UTILITÁRIOS FUMADORES","parent":"11.4"},{"id":"12","name":"100% MADE 4 YOU","parent":null},{"id":"12.1","name":"TÊXTIL 100% MADE4YOU","parent":"12","notes":"Usar LABELS Confeção Nacional??? Tempo de Entrega?? 🔹TÊXTIL 100% MADE 4YOU tb em 2. TÊXTIL DESPORTO","crossCategory":[{"source":"TÊXTIL 100% MADE 4YOU","targetId":"2","targetName":"TÊXTIL DESPORTO"}]},{"id":"12.1.1","name":"EQUIPAMENTOS","parent":"12.1"},{"id":"12.1.2","name":"FATOS DE TREINO","parent":"12.1"},{"id":"12.1.3","name":"T-SHIRTS E SINGLETES","parent":"12.1"},{"id":"12.1.4","name":"POLOS","parent":"12.1"},{"id":"12.1.5","name":"SWEATSHIRTS","parent":"12.1"},{"id":"12.1.6","name":"CALÇAS E CALÇÕES","parent":"12.1"},{"id":"12.1.7","name":"CACHECÓIS E GOLAS","parent":"12.1"},{"id":"12.1.8","name":"TÊXTIL 100% PERSONALIZÁVEL","parent":"12.1"},{"id":"12.1.9","name":"CAMISAS","parent":"12.1"},{"id":"12.2","name":"ARTIGOS EXCLUSIVOS","parent":"12","notes":"Usar LABELS Linha Natura Confeção Nacional??? Tempo de Entrega??"},{"id":"12.2.1","name":"CANECAS, COPOS E GARRAFAS","parent":"12.2"},{"id":"12.2.2","name":"TAPETES DE RATO","parent":"12.2"},{"id":"12.2.3","name":"CRACHÁS E PINS","parent":"12.2"},{"id":"12.2.4","name":"LANYARDS E PULSEIRAS","parent":"12.2"},{"id":"12.2.5","name":"PORTA-CHAVES E MAGNÉTICOS","parent":"12.2"},{"id":"12.2.6","name":"GALHARDETES E EMBLEMAS","parent":"12.2"},{"id":"12.2.7","name":"MEDALHAS E TROFÉUS","parent":"12.2"},{"id":"12.2.8","name":"SACOS E MOCHILAS","parent":"12.2"},{"id":"12.2.9","name":"ACESSÓRIOS","parent":"12.2"},{"id":"12.3","name":"PAPELARIA","parent":"12","notes":"Usar LABELS Linha Natura Confeção Nacional??? Tempo de Entrega?? 🔸 Calendários e Plannings (exclusivos + brinde) tb em 6. ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > Calendários e Plannings 🔸 Porta Notas e Post-its tb em 6. ESCRITA E ESCRITÓRIO > BLOCOS E CADERNOS Porta Notas e Post-its","crossCategory":[{"source":"Calendários e Plannings","targetId":"6","targetName":"ESCRITA E ESCRITÓRIO > ACESSÓRIOS SECRETÁRIA > Calendários e Plannings"},{"source":"Porta Notas e Post-its","targetId":"6","targetName":"ESCRITA E ESCRITÓRIO > BLOCOS E CADERNOS Porta Notas e Post-its"}]},{"id":"12.3.1","name":"CARTÕES E FLYERS","parent":"12.3"},{"id":"12.3.2","name":"CALENDÁRIOS E PLANNINGS","parent":"12.3"},{"id":"12.3.3","name":"PORTA NOTAS E POST-ITS","parent":"12.3"},{"id":"12.3.4","name":"BLOCOS","parent":"12.3"},{"id":"12.4","name":"BANDEIRAS E DISPLAYS","parent":"12","notes":"Usar LABELS Confeção Nacional??? Tempo de Entrega??\\""},{"id":"12.4.1","name":"BANDEIRAS PORTÁTEIS","parent":"12.4"},{"id":"12.4.2","name":"BANDEIRAS GOTA","parent":"12.4"},{"id":"12.4.3","name":"BANDEIRAS PLUMA","parent":"12.4"},{"id":"12.4.4","name":"BANDEIRAS RETANGULARES","parent":"12.4"},{"id":"12.4.5","name":"DISPLAYS","parent":"12.4"}]')}.nodes,yl={"promotional textile":"textil promocional","promotional textiles":"textil promocional","promotional-textile":"textil promocional","promotional-textiles":"textil promocional","sports textile":"textil desporto","sports textiles":"textil desporto","sports-textile":"textil desporto","sports-textiles":"textil desporto","workwear textile":"textil trabalho","workwear textiles":"textil trabalho","workwear-textile":"textil trabalho","workwear-textiles":"textil trabalho",technology:"tecnologia","bags and backpacks":"sacos e mochilas","bags-and-backpacks":"sacos e mochilas","writing and office":"escrita e escritorio","writing-and-office":"escrita e escritorio","outdoors and events":"outdoor e eventos","outdoors-and-events":"outdoor e eventos","outdoor and events":"outdoor e eventos","children's and pets":"crianca e animais","childrens and pets":"crianca e animais","children-and-pets":"crianca e animais","house and wine":"casa e bebidas","house-and-wine":"casa e bebidas",personal:"cuidado pessoal","diy and auto":"bricolage e auto","diy-and-auto":"bricolage e auto","100% made4you":"100% made 4 you","100-made4you":"100% made 4 you","pants and shorts":"calcas e calcoes","pants-and-shorts":"calcas e calcoes",leggings:"leggins","polo shirts":"polos","polo-shirts":"polos","t shirts":"t-shirts","t-shirts":"t-shirts",sweatshirts:"sweatshirts",jackets:"casacos",vests:"coletes",tracksuits:"fatos de treino","caps and hats":"bones e gorros","caps-and-hats":"bones e gorros","caps and beanies":"bones e gorros","sports accessories":"acessorios de desporto","sports-accessories":"acessorios de desporto",backpacks:"mochilas",bags:"sacos",bottles:"garrafas","mugs and cups":"canecas","mugs-and-cups":"canecas",umbrellas:"guarda-chuvas",towels:"toalhas",stationery:"papelaria",keychains:"porta-chaves",lanyards:"fitas e lanyards",tools:"ferramentas","kitchen accessories":"cozinha","wine accessories":"acessorios de vinho","travel accessories":"acessorios de viagem"};function j(t){const e=io(t),n=so(e);return yl[n]??n}function io(t){const e=t.indexOf("(");return e===-1?t:t.slice(0,e).trimEnd()}function so(t){return t.normalize("NFD").replace(new RegExp("\\p{Diacritic}","gu"),"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}function jn(t){const e=io(t),n=so(e);return n?n.split(/\s+/).map(r=>vl(r)).join(" "):""}function vl(t){if(!t)return t;let e=t;if(e.endsWith("s")&&e.length>2){const n=e.slice(0,-1);n.length>=3&&(e=n)}return e.length>=5&&(e.endsWith("a")||e.endsWith("o"))&&(e=e.slice(0,-1)),e}function co(t){const e=new Map(be.map(o=>[o.id,o])),n=[];let r=t.parent;const a=new Set;for(;r&&!a.has(r);){a.add(r);const o=e.get(r);if(!o)break;n.unshift(o.name),r=o.parent}return n}const Zn=new Map,mt=new Map,Xt=new Map,Kn=new Map,Wn=new Map,pt=new Map(be.map(t=>[t.id,t])),lo=[],Yn=new Map;for(const t of be){const e=j(t.name);if(t.parent){const i=Yn.get(t.parent);i?i.push(t.id):Yn.set(t.parent,[t.id])}if(e==="")continue;lo.push([t.id,e]);const n=[...co(t),t.name].map(j).join(">");Zn.has(n)||Zn.set(n,t.id);const r=mt.get(e);r?r.push(t.id):mt.set(e,[t.id]);const a=e.replace(/ /g,"");if(a!==""){const i=Wn.get(a);i?i.push(t.id):Wn.set(a,[t.id])}if(t.name.includes("/"))for(const i of t.name.split("/")){const s=j(i);if(s===""||s===e)continue;const c=Kn.get(s);c?c.push(t.id):Kn.set(s,[t.id])}const o=jn(t.name);if(o){const i=Xt.get(o);i?i.push(t.id):Xt.set(o,[t.id])}}const Cl="default category";function Tl(t,e=[],n=null){var c;const r=j(t);if(r==="")return null;const a=e.map(l=>j(l));for(;a[0]===Cl;)a.shift();for(let l=a.length;l>=0;l-=1){const d=l===0?[]:a.slice(a.length-l),u=Zn.get([...d,t].map(j).join(">"));if(u&&!(l===0&&a.length>0&&(n&&((c=pt.get(u))==null?void 0:c.parent)!==n||!n&&(mt.get(r)??[]).length>1)))return u}const o=wl(t,r);if(o.length===0){const l=jn(t),d=l?Xt.get(l)??[]:[];return Jt(d,a)??Xn(d,n)??Jn(r,a,n)??Qn(r,n)}if(o.length===1)return o[0]??null;const i=Xn(o,n)??Jt(o,a);if(i)return i;const s=jn(t);return s?Jt(o.filter(l=>(Xt.get(s)??[]).includes(l)),a)??Jn(r,a,n)??Qn(r,n):Jn(r,a,n)??Qn(r,n)}function wl(t,e){const n=mt.get(e);if(n)return n;for(const o of t.split("/")){const i=j(o);if(i===""||i===e)continue;const s=mt.get(i);if(s)return s}const r=Kn.get(e);if(r)return r;const a=e.replace(/ /g,"");return a===e?[]:Wn.get(a)??[]}function Jt(t,e){var a,o;const n=Array.from(new Set(t));if(n.length===1)return n[0]??null;if(n.length===0)return null;const r=n.map(i=>({id:i,score:_l(i,e)})).filter(({score:i})=>i>0);if(r.length===1)return((a=r[0])==null?void 0:a.id)??null;if(r.length>1){const i=r.reduce((c,l)=>l.score>c.score?l:c),s=r.filter(({score:c})=>c===i.score);if(s.length===1)return((o=s[0])==null?void 0:o.id)??null}return null}function _l(t,e){const n=pt.get(t);if(!n)return 0;const r=co(n).map(j);if(r.length===0||e.length===0)return 0;let a=0;for(let o=0;o<e.length;o+=1){let i=0;for(;i<r.length&&o+i<e.length&&e[o+i]===r[i];)i+=1;i>a&&(a=i)}return a}function Xn(t,e){if(!e)return null;const n=Array.from(new Set(t)).filter(r=>{var a;return((a=pt.get(r))==null?void 0:a.parent)===e});return n.length===1?n[0]??null:null}function Jn(t,e,n){const r=[];for(const[a,o]of lo)o!==t&&t.startsWith(`${o} `)&&Il(t.slice(o.length+1))&&r.push(a);return r.length===0?null:Xn(r,n)??(r.length===1?r[0]??null:Jt(r,e))}const Ol=new Set(["100","100%","made","4","you","made4you"]);function Il(t){const e=t.split(" ").filter(Boolean);return e.length>0&&e.every(n=>Ol.has(n))}function uo(t){const e=new Set;for(let n=0;n<t.length-1;n+=1)e.add(t.slice(n,n+2));return e}function kl(t,e){if(t.size===0||e.size===0)return 0;let n=0;for(const r of t)e.has(r)&&(n+=1);return 2*n/(t.size+e.size)}function Qn(t,e){const n=e?(Yn.get(e)??[]).flatMap(i=>{const s=pt.get(i);return s?[s]:[]}):be;if(n.length===0)return null;const r=uo(t);let a={id:"",score:0},o=0;for(const i of n){const s=j(i.name);if(t.slice(0,1)!==s.slice(0,1))continue;const c=kl(r,uo(s));c>a.score?(o=a.score,a={id:i.id,score:c}):c>o&&(o=c)}return a.score<Ll||a.score-o<Nl?null:a.id}const Ll=.87,Nl=.08;be.length;function mo(t,e){const n=t.split("."),r=e.split(".");for(let a=0;a<Math.max(n.length,r.length);a+=1){const o=Number(n[a]??0)-Number(r[a]??0);if(o)return o}return 0}function Rl(t){const e=[],n=new Map,r=new Map;for(const a of t){if(!a.code)continue;for(const s of[...n.keys()])s>a.depth&&(n.delete(s),r.delete(s));const o=n.get(a.depth);o&&mo(o.code,a.code)>0&&e.push(`${o.code} ${o.name} is followed by ${a.code} ${a.name} (${a.path}) — the numbers run backwards.`),n.set(a.depth,a);const i=r.get(a.depth-1);i!==void 0&&a.code.slice(0,a.code.lastIndexOf("."))!==i&&e.push(`${a.code} ${a.name} (${a.path}) sits under ${i}, so its number is outside the branch it is drawn in.`),r.set(a.depth,a.code)}return e}const po=new Map,Ue=new Map,Be=new Map,ho=[],Pl={"7.2:Bolas Vólei":"7.5.3","11.2:Carregadores Automóvel + Suportes para Automóvel":"4.2.3","11.4:Isqueiros de Cozinha":"9.3.9","2.1:TÊXTIL 100% MADE 4YOU":"12.1","8.2:TÊXTIL 100% MADE 4YOU":"12.1","12.1:TÊXTIL 100% MADE 4YOU":"2.1","12.3:Porta Notas e Post-its":"6.4.6","6.4:Porta Notas e Post-its":"12.3.3","4.3:Cabos e Adaptadores":"4.2.6"};function fo(t){return t.replace(/\([^)]*\)/g,"").trim()}for(const t of be)if((t.notes||t.crossCategory)&&po.set(t.id,{notes:t.notes,crossCategory:t.crossCategory}),t.crossCategory&&t.crossCategory.length>0)for(const e of t.crossCategory){const n=`${t.id}:${e.source}`;let r=Pl[n]??null;const a=j(fo(e.source));let i=be.filter(u=>u.parent===t.id).find(u=>{const m=j(u.name);return m===a||m.includes(a)||a.includes(m)});if(i||(j(t.name).includes(a)||a.includes(j(t.name)))&&(i=t),!r){const u=e.targetName.split(/\s*>\s*/).map(fo).map(j).filter(Boolean),m=u[u.length-1]??a,p=be.filter(f=>f.id===e.targetId||f.id.startsWith(`${e.targetId}.`)),x=p.filter(f=>!be.some(A=>A.parent===f.id));let g=x.find(f=>j(f.name)===m);g||(g=x.find(f=>j(f.name).includes(m)||m.includes(j(f.name)))),g||(g=p.find(f=>j(f.name)===m)),g||(g=p.find(f=>j(f.name).includes(m)||m.includes(j(f.name)))),g&&(r=g.id)}const s=i?i.id:t.id;s&&r&&(Ue.has(s)||Ue.set(s,new Set),Ue.get(s).add(r),Ue.has(r)||Ue.set(r,new Set),Ue.get(r).add(s));let c="🔹";(ki=t.notes)!=null&&ki.includes(`🔸${e.source}`)||(Li=t.notes)!=null&&Li.includes(`🔸 ${e.source}`)?c="🔸":((Ni=t.notes)!=null&&Ni.includes(`⚠${e.source}`)||(Ri=t.notes)!=null&&Ri.includes(`⚠ ${e.source}`))&&(c="⚠");const l=r?pt.get(r):void 0,d={sectionId:t.id,sectionName:t.name,sourceName:e.source,sourceCode:s,targetId:e.targetId,targetName:e.targetName,targetCode:r??"",targetNodeName:(l==null?void 0:l.name)??"",emoji:c};ho.push(d),Be.has(s)||Be.set(s,[]),Be.get(s).push(d),r&&(Be.has(r)||Be.set(r,[]),Be.get(r).push(d))}function Ml(t){return po.get(t)}function Dl(){return ho}function Ul(t){const e=Ue.get(t);return e?Array.from(e):[]}function go(t){return Be.get(t)??[]}const er="data-mhx-cat-tree",tr="data-mhx-cat-node",ht="data-mhx-collapsed",ft="mhx-cat-toggle",nr="mhx-cat-slot",xo="mhx-cat-tree-styles",Bl="mhx-cat-shell",ql="mhx-cat-main",bo="mhx-cat-tree-bar",$l="mhx-cat-search",Hl="mhx-cat-tree-count",gt="mhx-cat-no",Vl="mhx-cat-pills",Fl="mhx-cat-pill-no",zl="mhx-cat-sel",Ao="mhx-cat-sel-row",Gl="mhx-cat-sel-row--context",jl="mhx-cat-sel-name",Zl="mhx-cat-sel-x",Kl="mhx-cat-only",Wl="mhx-cat-natura",Yl="mhx-cat-rules-btn",Xl="mhx-cat-untick",Jl="linha natura",So="mhx.catTree.prefs.v1",Eo={query:"",selectedOnly:!1};function Ql(){try{const t=window.localStorage.getItem(So);if(!t)return{...Eo};const e=JSON.parse(t);return{query:typeof e.query=="string"?e.query:"",selectedOnly:e.selectedOnly===!0}}catch{return{...Eo}}}function rr(t){var n;const e={query:((n=t.ui)==null?void 0:n.search.value)??"",selectedOnly:t.selectedOnly};try{window.localStorage.setItem(So,JSON.stringify(e))}catch{}}const ar=new WeakMap,yo=new WeakMap,or=new WeakMap,vo=new WeakMap,ir=new WeakMap;let xt=!1;const Co=new WeakSet,z='input.category-checkbox, input[name="add_category_ids[]"]';function ed(t){const e=t.closest("fieldset, .fieldset-wrapper, .ui-tabs-panel, form, .entry-edit")??t.parentElement;return(e==null?void 0:e.textContent)??""}function td(t){return/add product to categor/i.test(ed(t))?!0:/\/catalog\/product_action/.test(location.href)}function ue(t){const e=t.nextElementSibling;return e instanceof HTMLUListElement&&e.querySelector(":scope > li")!==null?e:null}function sr(t){return Array.from(t.children).filter(e=>e instanceof HTMLLIElement)}function Qt(t){const e=[];return t.querySelectorAll("li").forEach(n=>{ue(n)&&e.push(n)}),e}function re(t){return Array.from(t.children).find(n=>n instanceof HTMLLIElement)??null}function me(t){const e=t.parentElement;if(!(e instanceof HTMLUListElement))return null;const n=e.previousElementSibling;return n instanceof HTMLLIElement?n:null}function nd(t){return t.closest(".admin__page-nav-items, ul.tabs")||!t.closest('[id="add-products-to-category-content"], .store-tree')||t.querySelectorAll(z).length<3||Qt(t).length===0?!1:td(t)}function rd(){const e=Array.from(document.querySelectorAll('[id="add-products-to-category-content"], .store-tree')).flatMap(r=>Array.from(r.querySelectorAll("ul")).filter(nd));return Array.from(new Set(e)).filter(r=>!e.some(a=>a!==r&&a.contains(r)))}function ad(t){if(t.hasAttribute(ht))return!0;const e=ue(t);return e?window.getComputedStyle(e).display==="none"||e.hidden:!0}function od(t,e){const n=t.querySelector(`:scope > .${ft}`);n&&(n.textContent=e?"▸":"▾",n.setAttribute("aria-expanded",e?"false":"true"),n.title=e?"Expand":"Collapse")}function bt(t,e){const n=ue(t);n&&(e?t.setAttribute(ht,"1"):t.removeAttribute(ht),n.style.setProperty("display",e?"none":"","important"),od(t,e))}function id(t){return ad(t)}function sd(t){if(t.getAttribute(tr)==="1")return;if(!ue(t)){t.setAttribute(tr,"1");return}const e=Z({label:"▾",title:"Collapse",variant:"icon",className:ft});e.setAttribute("aria-expanded","true"),e.addEventListener("click",n=>{n.preventDefault(),n.stopPropagation(),bt(t,!id(t))}),t.insertBefore(e,t.firstChild),t.setAttribute(tr,"1")}function To(t){if(t.querySelector(`:scope > .${ft}, :scope > .${nr}`))return;const e=document.createElement("span");e.className=nr,e.setAttribute("aria-hidden","true"),t.insertBefore(e,t.firstChild)}function _e(t){const e=t.querySelector(":scope > label");if(e!=null&&e.textContent)return e.textContent.trim();const n=t.cloneNode(!0);return n.querySelectorAll(`ul, ol, button, .${gt}, .${Ao}`).forEach(r=>r.remove()),(n.textContent??"").trim()}function cr(t){const e=[];let n=me(t);for(;n;)e.unshift(_e(n)),n=me(n);return e}const wo=new Set,lr={numbered:0,total:0};let _o="",Oo=null;function cd(){const{numbered:t,total:e}=lr;if(e===0)return;const n=`${t}/${e}`;if(n!==_o){if(_o=n,t===e){console.info(`[category-tree] ${n} categories numbered — no gaps.`);return}console.info(`[category-tree] ${n} categories numbered — ${e-t} without a Notion index code. Copy the list below to extend categoryIndex.ts:`,Array.from(wo).sort())}}function ld(t){const e=[t,...Array.from(t.querySelectorAll("ul"))];for(const n of e){const r=[];let a=!0;for(const i of Array.from(n.children)){if(i instanceof HTMLLIElement){r.push({item:i,childList:null});continue}if(i instanceof HTMLUListElement){const s=r[r.length-1];if(!s||s.childList){a=!1;break}s.childList=i}}if(!a||r.length<2||r.every(i=>!Ke(i.item,!1)))continue;const o=[...r].sort((i,s)=>{const c=Ke(i.item,!1),l=Ke(s.item,!1);return c&&l?mo(c,l):c?-1:l?1:0});if(!o.every((i,s)=>i===r[s]))for(const i of o)n.append(i.item),i.childList&&n.append(i.childList)}}function dd(t){const e=re(t),n=[];let r=0;for(const i of Array.from(t.querySelectorAll("li"))){const s=i===e?"":i.dataset.mhxCatNo??"";s&&(r+=1);const c=_e(i);n.push({code:s,name:c,depth:dr(i),path:[...cr(i),c].filter(Boolean).join(" > ")})}const a=Rl(n),o=a.join(`
`);if(o!==Oo){if(Oo=o,a.length===0){console.info(`[category-tree] ${r} numbers in reading order — no branch runs backwards.`);return}console.warn(`[category-tree] ${a.length} number${a.length===1?"":"s"} out of reading order: fix the sheet row or the admin tree (not the resolver):`,a)}}function Ke(t,e=!0){const n=t.dataset.mhxCatNo;if(n)return n;const r=_e(t);if(!r)return null;const a=cr(t),o=me(t),i=o?Ke(o,!1):null,s=Tl(r,a,i);return s?(t.dataset.mhxCatNo=s,s):(e&&wo.add([...a,r].join(" > ")),null)}function dr(t){let e=0,n=me(t);for(;n;)e+=1,n=me(n);return e}function Io(t){return Array.from(t.querySelectorAll("li")).map(e=>{var s;const n=e.querySelector(":scope > label"),r=((s=n==null?void 0:n.textContent)==null?void 0:s.trim())??_e(e),a=e.querySelector(z),o=[...cr(e),r].join(""),i=[e.querySelector(`:scope > .${gt}`)?"n":"",e.querySelector(`:scope > .${ft}`)?"t":"",e.querySelector(`:scope > .${nr}`)?"s":""].join("");return`${o}${(a==null?void 0:a.id)??""}${(a==null?void 0:a.value)??""}${i}`}).join("")}const ud=18;function md(t){const e=dr(t);t.style.setProperty("padding-left",`${e*ud}px`)}function pd(t){if(t.querySelector(`:scope > .${gt}`))return;const e=Ke(t);if(!e)return;const n=Dr(e,{title:`Category ${e} (Notion index)`});n.classList.add(gt);const r=t.querySelector(":scope > label");if(r){r.before(n);return}const a=t.querySelector(z);a?a.after(n):t.insertBefore(n,t.firstChild)}function ko(t){let e=me(t);for(;e;)ue(e)&&bt(e,!1),e=me(e)}function hd(t){const e=re(t);for(const n of Qt(t))n!==e&&bt(n,!0)}function fd(t){for(const e of Qt(t))bt(e,!1)}function Lo(t){for(const e of Array.from(t.querySelectorAll(`li[${ht}]`))){const n=e.nextElementSibling;n instanceof HTMLUListElement&&n.style.removeProperty("display"),e.removeAttribute(ht)}}function ur(t){const e=or.get(t),n=vo.get(t);if(!e||!n)return;let r=!t.isConnected;for(let a=t;!r&&a;a=a.parentElement){const o=window.getComputedStyle(a);r=a.hasAttribute("hidden")||o.display==="none"||o.visibility==="hidden"}e.style.display=r?"none":"",n.style.display=r?"none":""}function No(t){if(ir.has(t)){ur(t);return}const e=new MutationObserver(()=>{ur(t),t.isConnected||(e.disconnect(),ir.delete(t))});for(let n=t;n;n=n.parentElement)e.observe(n,{attributes:!0,attributeFilter:["class","style","hidden","aria-expanded"],childList:n===t.parentElement});ir.set(t,e),ur(t)}function mr(t){return t.toLowerCase().normalize("NFD").replace(new RegExp("\\p{Diacritic}","gu"),"")}function pr(t,e){e?t.style.removeProperty("display"):t.style.setProperty("display","none","important")}function We(t){const e=ar.get(t),n=e==null?void 0:e.ui;if(!e||!n)return;const r=re(t);e.selectedOnly&&!Array.from(t.querySelectorAll("li")).some(d=>{var u;return d===r?!1:((u=d.querySelector(z))==null?void 0:u.checked)===!0})&&(e.selectedOnly=!1,n.only.dataset.variant="default",n.only.setAttribute("aria-pressed","false"),rr(e));const a=mr(n.search.value.trim()),o=e.selectedOnly;if(a===""&&!o){for(const d of Array.from(t.querySelectorAll("li")))pr(d,!0);Lo(t),n.counter.textContent="";return}const i=Array.from(t.querySelectorAll("li")),s=new Map,c=new Map;let l=0;for(let d=i.length-1;d>=0;d-=1){const u=i[d];if(!u)continue;const m=ue(u),p=m?sr(m):[],x=u.querySelector(z);if(c.set(u,(x==null?void 0:x.checked)===!0||p.some(w=>c.get(w)===!0)),a===""){s.set(u,!0);continue}const g=mr(_e(u)),f=(u.dataset.mhxCatNo??"").toLowerCase(),A=g.includes(a)||f.includes(a);A&&(l+=1),s.set(u,A||p.some(w=>s.get(w)===!0))}for(const d of i){const u=s.get(d)===!0,m=c.get(d)===!0,p=u&&(!o||m)||d===r;pr(d,p),p&&d!==r&&ue(d)&&bt(d,!1)}n.counter.textContent=a===""?"":`${l} ${l===1?"match":"matches"}`}function gd(t){const e=[],n=re(t);for(const r of Array.from(t.querySelectorAll("li"))){if(n&&r===n)continue;const a=r.querySelector(z);if(!a)continue;const o=_e(r);if(!o)continue;const i=a.checked;!i&&!Array.from(r.querySelectorAll(z)).some(c=>c.checked)||e.push({real:a,name:o,code:Ke(r)??"",selected:i,depth:dr(r)})}return e}function en(t){const e=ar.get(t),n=e==null?void 0:e.ui;if(!e||!n)return;const r=gd(t),a=r.map(d=>`${d.selected?"1":"0"}${d.code}${d.name}`).join("");if(a===e.pillSig&&n.pills.childElementCount>0)return;e.pillSig=a,n.pills.replaceChildren();const o=r.filter(d=>d.selected),i=r.length-o.length,s=document.createElement("div");s.className="mhx-cat-pills-head";const c=document.createElement("span");if(c.className="mhx-cat-pills-title",c.textContent=`Selected (${o.length})`,s.appendChild(c),i>0){const d=document.createElement("span");d.className="mhx-cat-pills-hint",d.textContent=`+${i} parent ${i===1?"branch":"branches"} for context`,d.title="Grey rows are the branches above a selected category. Grey means not selected — click one to select it too.",s.appendChild(d)}if(n.pills.appendChild(s),o.length===0){const d=document.createElement("span");d.className="mhx-cat-pills-empty",d.textContent="No category selected",n.pills.appendChild(d);return}const l=document.createElement("ul");l.className=zl;for(const d of r){const u=document.createElement("li");if(u.className=`${Ao}${d.selected?"":` ${Gl}`}`,u.style.setProperty("padding-left",`${d.depth*14}px`),u.title=d.selected?`${d.name}${d.code?` (${d.code})`:""} — selected`:`${d.name}${d.code?` (${d.code})`:""} is NOT selected — click to select this branch too`,d.code){const x=Dr(d.code,{title:`Category ${d.code} (Notion index)`});x.classList.add(gt,Fl),u.appendChild(x)}const m=document.createElement("span");if(m.className=jl,m.textContent=d.name,u.appendChild(m),d.selected){const x=Z({label:"×",title:`Remove ${d.name}`,variant:"icon",className:Zl});x.setAttribute("aria-label",`Remove ${d.name}`),x.addEventListener("click",()=>d.real.click()),u.appendChild(x),l.appendChild(u);continue}u.tabIndex=0,u.setAttribute("role","button");const p=()=>d.real.click();u.addEventListener("click",p),u.addEventListener("keydown",x=>{x.key!=="Enter"&&x.key!==" "||(x.preventDefault(),p())}),l.appendChild(u)}n.pills.appendChild(l)}function xd(t){if(t.getAttribute(er)==="1")return;t.setAttribute(er,"1");const e=Ql(),n={selectedOnly:e.selectedOnly,ui:null,pillSig:""};ar.set(t,n);const r=document.createElement("div");r.className=Bl;const a=document.createElement("div");a.className=bo;const o=document.createElement("input");o.type="search",o.className=$l,o.placeholder="Filter categories…",o.setAttribute("aria-label","Filter categories"),o.value=e.query;const i=document.createElement("span");i.className=Hl;const s=Z({label:"Selected only",variant:e.selectedOnly?"accent":"default",className:Kl});s.setAttribute("aria-pressed",String(e.selectedOnly));const c=Z({label:"Tick Linha Natura",title:"Also tick LINHA NATURA for every sub-subcategory that is checked",variant:"accent",className:Wl});let l;c.addEventListener("click",h=>{h.preventDefault();const b=bd(t);c.textContent=b>0?`Ticked ${b}`:"Nothing to tick",clearTimeout(l),l=setTimeout(()=>{c.textContent="Tick Linha Natura"},1800)});const d=Z({label:"Apply Rules",title:'Apply cross-category rules based on "tb em" patterns',variant:"accent",className:Yl});let u={resetTimer:void 0};d.addEventListener("click",h=>{h.preventDefault();const b=Cd(t);d.textContent=b>0?`Applied ${b}`:"No rules to apply",clearTimeout(u.resetTimer),u.resetTimer=setTimeout(()=>{d.textContent="Apply Rules"},1800)});const m=Z({label:"Untick all",title:"Uncheck every selected category (Default Category stays checked)",variant:"ghost",className:Xl});let p;m.addEventListener("click",h=>{h.preventDefault();const b=Ad(t);m.textContent=b>0?`Unticked ${b}`:"Nothing ticked",clearTimeout(p),p=setTimeout(()=>{m.textContent="Untick all"},1800)});const x=Z({label:"Collapse all",variant:"ghost",className:"mhx-cat-tree-btn"});x.addEventListener("click",h=>{h.preventDefault(),hd(t)});const g=Z({label:"Expand all",variant:"ghost",className:"mhx-cat-tree-btn"});g.addEventListener("click",h=>{h.preventDefault(),fd(t)}),a.append(o,i,s,c,d,m,x,g);const f=document.createElement("div");f.className=Vl,f.setAttribute("aria-live","polite"),r.append(a);const A=document.createElement("div");A.className=ql;const w=t.parentElement;w&&(w.insertBefore(r,t),w.insertBefore(A,t)),A.append(f),or.set(t,r),vo.set(t,A);const I={shell:r,bar:a,pills:f,counter:i,search:o,only:s};n.ui=I;let N;const O=()=>{clearTimeout(N),N=setTimeout(()=>rr(n),250)};o.addEventListener("input",()=>{We(t),O()}),o.addEventListener("keydown",h=>{h.key==="Enter"&&h.preventDefault(),h.key==="Escape"&&(o.value="",We(t),O())}),s.addEventListener("click",h=>{h.preventDefault(),n.selectedOnly=!n.selectedOnly,s.dataset.variant=n.selectedOnly?"accent":"default",s.setAttribute("aria-pressed",String(n.selectedOnly)),We(t),rr(n)}),t.addEventListener("change",h=>{const b=h.target;if(!xt&&b instanceof HTMLInputElement){xt=!0;try{b===vd(t)?At(t):b.checked?Sd(b,t):Ed(b,t)}finally{xt=!1}}if(At(t),en(t),n.selectedOnly)We(t);else if(b instanceof HTMLInputElement){const C=b.closest("li");C&&b.checked&&ko(C)}hr(t,b instanceof HTMLInputElement?b.closest("li"):null)}),t.addEventListener("click",h=>{const b=h.target;if(b instanceof Element&&!b.closest(`.${ft}`)&&!b.closest('input[type="checkbox"]')){const C=b.closest("li");C&&hr(t,C)}}),At(t),en(t),We(t),hr(t),No(t)}function Ro(t){return mr(_e(t)).includes(Jl)}function bd(t){const e=re(t),n=[];for(const r of Array.from(t.querySelectorAll("li"))){if(r===e)continue;const a=r.querySelector(z);if(!a||!a.checked||a.disabled||Ro(r))continue;const o=me(r),i=o?ue(o):null;if(!i)continue;const s=sr(i).find(l=>Ro(l));if(!s)continue;const c=s.querySelector(z);!c||c.disabled||c.checked||n.includes(c)||n.push(c)}for(const r of n)r.checked=!0,r.dispatchEvent(new Event("change",{bubbles:!0}));return n.length}function Ad(t){const e=re(t),n=Array.from(t.querySelectorAll(z)).filter(r=>!r.checked||r.disabled?!1:r.closest("li")!==e);xt=!0;try{for(const r of n)r.checked=!1,r.dispatchEvent(new Event("change",{bubbles:!0}))}finally{xt=!1}return At(t),en(t),We(t),n.length}function Sd(t,e){const n=re(e);let r=t.closest("li");for(let a=0;r&&a<50;a+=1){const o=me(r);if(!o||o===n)return;const i=o.querySelector(z);if(i&&i.disabled)return;i&&!i.checked&&(i.checked=!0,i.dispatchEvent(new Event("change",{bubbles:!0}))),r=o}}function Ed(t,e){const n=re(e),r=t.closest("li");if(!r)return;for(const o of Po(r)){const i=o.querySelector(z);!i||i===t||i.disabled||!i.checked||(i.checked=!1,i.dispatchEvent(new Event("change",{bubbles:!0})))}let a=r;for(let o=0;a&&o<50;o+=1){const i=me(a);if(!i||i===n||yd(i))return;const s=i.querySelector(z);if(!s||s.disabled||!s.checked){a=i;continue}s.checked=!1,s.dispatchEvent(new Event("change",{bubbles:!0})),a=i}}function Po(t){const e=[],n=[t];for(let r=0;n.length>0&&r<2e3;r+=1){const a=n.shift();if(!a)break;const o=ue(a);if(o)for(const i of sr(o))e.push(i),n.push(i)}return e}function yd(t){for(const e of Po(t)){const n=e.querySelector(z);if(n!=null&&n.checked)return!0}return!1}function vd(t){const e=re(t);return(e==null?void 0:e.querySelector(z))??null}function Cd(t){const e=re(t),n=[],r=Array.from(t.querySelectorAll("li")).filter(a=>{if(a===e)return!1;const o=a.querySelector(z);if(!o||!o.checked||o.disabled)return!1;const i=ue(a);return!(i&&Array.from(i.querySelectorAll(z)).some(s=>s.checked))});for(const a of r){const o=a.dataset.mhxCatNo;if(!o)continue;const i=Ul(o);for(const s of i){const c=t.querySelector(`li[data-mhx-cat-no="${s}"]`);if(!c)continue;const l=c.querySelector(z);l&&!l.checked&&!l.disabled&&(n.includes(l)||n.push(l))}}for(const a of n)a.checked=!0,a.dispatchEvent(new Event("change",{bubbles:!0}));return n.length}const Mo="mhx-cat-rules-panel",Td="mhx-cat-rules-header",Do="mhx-cat-rules-active",wd="mhx-cat-rules-catalog",_d="mhx-cat-rules-list",Od="mhx-cat-rules-item";function Id(t){const e=t.split(/(?=[\u{1F538}\u{1F539}\u26A0])/u).map(i=>i.trim()).filter(Boolean),r=/^[\u{1F538}\u{1F539}\u26A0]/u.test(e[0]??""),a=r?"":e[0]??"",o=r?e:e.slice(1);return{intro:a,ruleLines:o}}function kd(t){const e=or.get(t);if(!e)return null;let n=e.querySelector(`.${Mo}`);if(!n){n=Ld(t);const r=e.querySelector(`.${bo}`);r!=null&&r.nextSibling?e.insertBefore(n,r.nextSibling):e.appendChild(n)}return n}function Ld(t){const e=document.createElement("div");e.className=Mo;const n=document.createElement("div");n.className=Td;const r=document.createElement("div");r.className="mhx-cat-rules-title-wrap";const a=document.createElement("span");a.className="mhx-cat-rules-title",a.textContent="Notas e Regras Notion",r.appendChild(a);const o=Z({label:"Todas as regras Notion (64) ▾",title:"Ver catálogo completo com todas as regras cruzadas do Notion",variant:"ghost",className:"mhx-cat-rules-toggle-catalog"});n.append(r,o);const i=document.createElement("div");i.className=Do;const s=document.createElement("div");s.className=wd,s.style.display="none";const c=document.createElement("div");c.className="mhx-cat-rules-filter-bar";const l=document.createElement("input");l.type="search",l.placeholder="Filtrar regras Notion (ex: x-atos, chinelos, mochilas)...",l.className="mhx-cat-rules-search",l.setAttribute("aria-label","Filtrar regras Notion");const d=document.createElement("span");d.className="mhx-cat-rules-count-badge",d.textContent="64 regras",c.append(l,d);const u=document.createElement("div");u.className="mhx-cat-rules-list-wrap";const m=Dl();return Uo(u,m,"",t),l.addEventListener("input",()=>{const p=l.value.trim().toLowerCase(),x=m.filter(g=>g.sourceName.toLowerCase().includes(p)||g.targetName.toLowerCase().includes(p)||g.sectionName.toLowerCase().includes(p)||g.sourceCode.includes(p)||g.targetCode.includes(p));d.textContent=`${x.length} ${x.length===1?"regra":"regras"}`,Uo(u,x,p,t)}),o.addEventListener("click",p=>{p.preventDefault();const x=s.style.display!=="none";s.style.display=x?"none":"block",o.textContent=x?"Todas as regras Notion (64) ▾":"Ocultar catálogo Notion ▴"}),s.append(c,u),e.append(n,i,s),e}function Uo(t,e,n,r){if(t.replaceChildren(),e.length===0){const o=document.createElement("div");o.className="mhx-cat-rules-empty",o.textContent="Nenhuma regra encontrada para este filtro.",t.appendChild(o);return}const a=document.createElement("ul");a.className=_d;for(const o of e){const i=document.createElement("li");i.className=Od,i.title=`Clique para localizar ${o.sourceName} (${o.sourceCode}) na árvore`;const s=document.createElement("span");s.className="mhx-cat-rule-sec",s.textContent=`${o.sectionId} ${o.sectionName}`;const c=document.createElement("span");c.className="mhx-cat-rule-text",c.textContent=`${o.emoji} ${o.sourceName} tb em ${o.targetName}`;const l=document.createElement("span");l.className="mhx-cat-rule-badge",l.textContent=`${o.sourceCode} ➔ ${o.targetCode}`,i.append(s,c,l),i.addEventListener("click",()=>{const d=r.querySelector(`li[data-mhx-cat-no="${o.sourceCode}"]`)??r.querySelector(`li[data-mhx-cat-no="${o.targetCode}"]`);d&&(ko(d),d.scrollIntoView({behavior:"smooth",block:"center"}),d.style.transition="background-color 0.3s",d.style.backgroundColor="var(--mhx-pg-fill-hover)",setTimeout(()=>{d.style.removeProperty("background-color")},1500))}),a.appendChild(i)}t.appendChild(a)}function hr(t,e){var c;const n=kd(t);if(!n)return;const r=n.querySelector(`.${Do}`);if(!r)return;if(r.replaceChildren(),e&&e.dataset.mhxCatNo){const l=e.dataset.mhxCatNo,d=_e(e),u=Ml(l),m=go(l),p=document.createElement("div");p.className="mhx-cat-rules-active-block";const x=document.createElement("div");x.className="mhx-cat-rules-active-title",x.textContent=`Notas da Categoria: ${d} (${l})`,p.appendChild(x);let g=!1;if((c=u==null?void 0:u.notes)!=null&&c.trim()){const{intro:f,ruleLines:A}=Id(u.notes);if(f){const w=document.createElement("p");w.className="mhx-cat-rules-intro",w.textContent=f,p.appendChild(w),g=!0}if(A.length>0){const w=document.createElement("ul");w.className="mhx-cat-rules-bullet-list";for(const I of A){const N=document.createElement("li");N.textContent=I,w.appendChild(N)}p.appendChild(w),g=!0}}if(m.length>0){const f=document.createElement("ul");f.className="mhx-cat-rules-active-rules";for(const A of m){const w=document.createElement("li");w.textContent=`${A.emoji} ${A.sourceName} tb em ${A.targetName} (${A.sourceCode} ➔ ${A.targetCode})`,f.appendChild(w)}p.appendChild(f),g=!0}if(!g){const f=document.createElement("p");f.className="mhx-cat-rules-hint",f.textContent="Sem notas ou regras registadas no Notion para esta categoria.",p.appendChild(f)}r.appendChild(p);return}const a=re(t),o=Array.from(t.querySelectorAll("li")).filter(l=>{if(l===a)return!1;const d=l.querySelector(z);return d&&d.checked&&!d.disabled}),i=[];for(const l of o){const d=l.dataset.mhxCatNo;if(!d)continue;const u=go(d);for(const m of u)i.some(p=>p.rule===m)||i.push({li:l,rule:m})}if(i.length>0){const l=document.createElement("div");l.className="mhx-cat-rules-active-block";const d=document.createElement("div");d.className="mhx-cat-rules-active-title",d.textContent=`Regras Aplicáveis para Categorias Selecionadas (${i.length})`,l.appendChild(d);const u=document.createElement("ul");u.className="mhx-cat-rules-active-rules";for(const{rule:m}of i){const p=document.createElement("li");p.textContent=`${m.emoji} ${m.sourceName} tb em ${m.targetName} (${m.sourceCode} ➔ ${m.targetCode})`,u.appendChild(p)}l.appendChild(u),r.appendChild(l);return}const s=document.createElement("p");s.className="mhx-cat-rules-hint",s.textContent='💡 Clique numa categoria na árvore ou selecione artigos para ver as regras "tb em". Clique em "Todas as regras Notion" acima para consultar todo o índice.',r.appendChild(s)}function At(t){const e=re(t);if(!e)return;const n=e.querySelector(z);n&&(n.disabled&&(n.disabled=!1),Co.has(n)||(Co.add(n),n.addEventListener("click",r=>{r.preventDefault(),n.checked||(n.checked=!0,n.dispatchEvent(new Event("change",{bubbles:!0})))},!0)),n.title="Default Category is always selected (store root).",n.setAttribute("aria-label","Default Category (always selected)"),n.checked||(n.checked=!0,n.dispatchEvent(new Event("change",{bubbles:!0}))))}function Nd(){if(document.getElementById(xo))return;const t=document.createElement("style");t.id=xo,t.textContent=Pd,(document.head??document.documentElement).appendChild(t)}function Rd(){let t=0;for(const e of rd()){const n=re(e);No(e);const r=Io(e);if(yo.get(e)===r){At(e);continue}const a=e.getAttribute(er)!=="1";for(const s of Qt(e))s!==n&&sd(s);let o=0,i=0;if(e.querySelectorAll("li").forEach(s=>{To(s),s!==n&&s.querySelector(z)&&(i+=1,pd(s),To(s),md(s),s.dataset.mhxCatNo&&(o+=1))}),lr.numbered=o,lr.total=i,ld(e),cd(),dd(e),a){for(const s of Array.from(e.querySelectorAll("li")))pr(s,!0);Lo(e),t+=1}xd(e),en(e),yo.set(e,Io(e))}return t>0&&Nd(),t}const Pd=`
.mhx-cat-shell{display:flex;flex-direction:column;gap:8px;margin:8px 0 10px;}
.mhx-cat-main{display:flex;gap:14px;align-items:flex-start;}
.mhx-cat-main > *{min-width:0;}
/* The tree takes its own content width, so the Selected panel sits right
   beside it instead of at the far right of the fieldset. */
.mhx-cat-main > :not(.mhx-cat-pills){flex:0 1 auto;max-width:min(560px,100%);}
.mhx-cat-tree-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.mhx-cat-toggle{width:22px;height:22px;margin:0 14px 0 2px;vertical-align:middle;flex-shrink:0;}
.mhx-cat-slot{display:inline-block;width:22px;height:22px;margin:0 14px 0 2px;vertical-align:middle;flex-shrink:0;}
.mhx-cat-no{width:46px;box-sizing:border-box;margin:0 6px 0 0;padding:1px 0;border-radius:3px;background:var(--mhx-pg-fill-hover);color:var(--mhx-pg-muted);font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:center;vertical-align:middle;}
.mhx-cat-search{width:200px;margin:0 4px 0 0;padding:5px 10px;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill);color:var(--mhx-pg-ink);font:12px/1.3 system-ui,"Segoe UI",Arial,sans-serif;}
.mhx-cat-search::placeholder{color:var(--mhx-pg-ink);}
.mhx-cat-search:focus{outline:none;border-color:var(--mhx-pg-accent);box-shadow:0 0 0 1px var(--mhx-pg-accent);}
.mhx-cat-tree-count{margin-right:4px;font:11px/1.3 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-muted);white-space:nowrap;}
.mhx-cat-pills{display:flex;flex:0 0 clamp(230px,24vw,330px);flex-direction:column;gap:4px;padding:8px 10px;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill-hover);max-height:480px;overflow-y:auto;position:sticky;top:8px;}
.mhx-cat-pills-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}
.mhx-cat-pills-title{font:11px/1.4 system-ui,"Segoe UI",Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--mhx-pg-muted);}
.mhx-cat-pills-hint{font:11px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-muted);font-style:italic;}
.mhx-cat-pills-empty{font:12px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-ink);font-style:italic;}
.mhx-cat-sel{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:1px;}
.mhx-cat-sel-row{display:flex;align-items:center;gap:6px;padding:2px 6px;border-left:2px solid var(--mhx-pg-accent);border-radius:2px;font:12px/1.5 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-ink);}
.mhx-cat-sel-row:hover{background:var(--mhx-pg-fill);}
.mhx-cat-sel-row--context{border-left-color:var(--mhx-pg-line);color:var(--mhx-pg-muted);cursor:pointer;font-style:italic;}
.mhx-cat-sel-row--context:focus-visible{outline:2px solid var(--mhx-pg-accent);outline-offset:-2px;}
.mhx-cat-sel-row--context:hover{color:var(--mhx-pg-ink);}
.mhx-cat-pill-no{width:38px;box-sizing:border-box;padding:0;border-radius:2px;color:var(--mhx-pg-muted);font:10px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:center;}
.mhx-cat-sel-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;}
.mhx-cat-sel-x{padding:0 4px;border:0;background:transparent;color:var(--mhx-pg-muted);cursor:pointer;border-radius:2px;line-height:1;}
.mhx-cat-sel-x:hover{background:var(--mhx-pg-fill);color:var(--mhx-pg-accent-strong);}
.mhx-cat-rules-panel{margin-top:8px;padding:10px 12px;border:1px solid var(--mhx-pg-line);border-radius:4px;background:var(--mhx-pg-fill);font:12px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-ink);display:block !important;}
.mhx-cat-rules-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;}
.mhx-cat-rules-title-wrap{display:flex;align-items:center;gap:6px;}
.mhx-cat-rules-title{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:var(--mhx-pg-ink);}
.mhx-cat-rules-toggle-catalog{font-size:11px;padding:2px 6px;}
.mhx-cat-rules-active{margin-bottom:4px;}
.mhx-cat-rules-active-block{display:flex;flex-direction:column;gap:4px;}
.mhx-cat-rules-active-title{font-weight:600;font-size:12px;color:var(--mhx-pg-accent-strong);}
.mhx-cat-rules-intro{margin:0 0 4px 0;font-weight:500;color:var(--mhx-pg-ink);}
.mhx-cat-rules-bullet-list{margin:0;padding-left:18px;}
.mhx-cat-rules-bullet-list li{margin-bottom:3px;}
.mhx-cat-rules-active-rules{margin:4px 0 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;}
.mhx-cat-rules-active-rules li{padding:4px 8px;border-radius:3px;background:var(--mhx-pg-fill-hover);border-left:3px solid var(--mhx-pg-accent);font-size:11.5px;}
.mhx-cat-rules-hint{margin:0;font-style:italic;color:var(--mhx-pg-muted);font-size:11.5px;}
.mhx-cat-rules-catalog{margin-top:8px;padding-top:8px;border-top:1px dashed var(--mhx-pg-line);}
.mhx-cat-rules-filter-bar{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.mhx-cat-rules-search{flex:1;padding:4px 8px;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill);color:var(--mhx-pg-ink);font:11.5px system-ui,"Segoe UI",Arial,sans-serif;}
.mhx-cat-rules-search:focus{outline:none;border-color:var(--mhx-pg-accent);}
.mhx-cat-rules-count-badge{font-size:11px;color:var(--mhx-pg-muted);white-space:nowrap;}
.mhx-cat-rules-list-wrap{max-height:220px;overflow-y:auto;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill-hover);}
.mhx-cat-rules-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;}
.mhx-cat-rules-item{display:flex;align-items:baseline;gap:8px;padding:5px 8px;border-bottom:1px solid var(--mhx-pg-line);cursor:pointer;font-size:11px;}
.mhx-cat-rules-item:last-child{border-bottom:none;}
.mhx-cat-rules-item:hover{background:var(--mhx-pg-fill);}
.mhx-cat-rule-sec{font-weight:600;color:var(--mhx-pg-muted);white-space:nowrap;min-width:130px;}
.mhx-cat-rule-text{flex:1;color:var(--mhx-pg-ink);}
.mhx-cat-rule-badge{padding:1px 5px;border-radius:2px;background:var(--mhx-pg-line);color:var(--mhx-pg-ink);font:10px ui-monospace,monospace;white-space:nowrap;}
.mhx-cat-rules-empty{padding:12px;text-align:center;color:var(--mhx-pg-muted);font-style:italic;font-size:11px;}
`;function Md(){Rd()}async function fr(t){var r;if((r=navigator.clipboard)!=null&&r.writeText)try{await navigator.clipboard.writeText(t);return}catch{}const e=document.createElement("textarea");e.value=t,e.style.cssText="position:fixed;left:-9999px;top:-9999px;",e.setAttribute("readonly",""),document.body.appendChild(e),e.select(),e.setSelectionRange(0,e.value.length);const n=document.execCommand("copy");if(document.body.removeChild(e),!n)throw new Error("copy failed")}const gr="data-mhx-sku-copy",xr="data-mhx-open",Bo=`[${gr}="1"], [${xr}="1"]`,tn='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',Dd='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',Ud='<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',Bd=['input[name="product[sku]"]','input[name="product[name]"]'];function qo(){const t=document.createElement("button");return t.type="button",t.className="mhx-sku-copy-btn",t.setAttribute(gr,"1"),t.innerHTML=tn,t.title="Copy",t}function $o(t,e=!0){t.innerHTML=e?Ud:tn,t.classList.add("mhx-sku-copy-btn--feedback"),t.title=e?"Copied":"Copy failed",setTimeout(()=>{t.innerHTML=tn,t.classList.remove("mhx-sku-copy-btn--feedback"),t.title="Copy"},1200)}function qd(){Bd.forEach(t=>{document.querySelectorAll(t).forEach(n=>{if(!n.value||n.getAttribute("data-mhx-btn")==="1")return;const r=n.closest(".admin__field"),o=(r==null?void 0:r.querySelector("label"))??null??n.closest(".admin__field-control")??n.parentElement;if(!(o!=null&&o.parentNode))return;const i=qo();i.addEventListener("click",s=>{s.preventDefault(),s.stopPropagation(),fr(n.value).then(()=>$o(i))}),o.parentNode.insertBefore(i,o),n.setAttribute("data-mhx-btn","1")})})}function St(){var n;const t=document.querySelector('[data-index="configurable-matrix"]');if(t)return t;const e=document.querySelectorAll(".admin__collapsible-block-wrapper, .fieldset-wrapper, fieldset");for(const r of Array.from(e)){const a=r.querySelector(".admin__collapsible-title, .admin__fieldset legend, .legend");if((n=a==null?void 0:a.textContent)!=null&&n.toLowerCase().includes("configurations"))return r}return null}function Ho(t){if(!t)return!1;const e=t.classList.contains("admin__collapsible-block-wrapper")?t:t.closest(".admin__collapsible-block-wrapper");return!!(e&&!e.classList.contains("_show")&&e.querySelector(".admin__collapsible-title"))}function $d(){if(!Ge(location.href))return null;const t=St();if(t){const a=t.querySelector("table");if(a&&Array.from(a.querySelectorAll("tbody tr")).some(s=>s.classList.contains("empty-text")||s.classList.contains("data-grid-tr-no-data")?!1:s.hasAttribute("data-product-id")||s.querySelector('td[data-index="product_id"], td[data-index="sku"], td[data-index="attributes"]')!==null||s.children.length>2))return"configurable"}if(document.querySelectorAll('[data-index="configurable-matrix"] tbody tr:not(.empty-text):not(.data-grid-tr-no-data), [data-index="associated_products"] tbody tr:not(.empty-text)').length>0||document.querySelector('[data-index="edit_configurable_products_button"], button[data-action="edit-attribute"]'))return"configurable";const r=document.querySelector('input[name="product[type_id]"], input[name="type"], [data-form-part="product_form"][name*="type_id"]');if(r!=null&&r.value){const a=r.value.toLowerCase().trim();if(a==="configurable"||a.includes("config"))return"configurable";if(a==="simple")return"simple"}return je()||document.querySelector('input[name="product[sku]"]')?"simple":null}function Hd(){var o;if(!Ge(location.href))return;const t=$d();if(!t)return;const e=t==="configurable"?"Configurable":"Simple",n=`mhx-product-type-badge mhx-product-type-badge--${t}`,r=document.querySelector('[data-ui-id="page-title-wrapper"]')??document.querySelector(".page-title")??document.querySelector(".page-main-actions .page-title")??document.querySelector(".admin__page-heading");if(r){let i=((o=r.parentElement)==null?void 0:o.querySelector(".mhx-product-type-badge--title"))??r.querySelector(".mhx-product-type-badge--title");i||(i=document.createElement("span"),i.className=`${n} mhx-product-type-badge--title`,r.insertAdjacentElement("afterend",i)),i.className=`${n} mhx-product-type-badge--title`,i.textContent=e}const a=document.querySelector('input[name="product[sku]"]');if(a){const i=a.closest(".admin__field"),s=i==null?void 0:i.querySelector("label");if(s){let c=s.querySelector(".mhx-product-type-badge--sku");c||(c=document.createElement("span"),c.className=`${n} mhx-product-type-badge--sku`,s.appendChild(c)),c.className=`${n} mhx-product-type-badge--sku`,c.textContent=e}}}function Vd(t){return(t.textContent??"").replace(/[↑↓▲►▸▾▿]/g,"").replace(/\s+/g," ").trim().toLowerCase()}function Fd(t){const e=(t.getAttribute("data-index")??"").toLowerCase(),n=t.className.toLowerCase(),r=Vd(t);return e==="sku"||r==="sku"||/(^|\s)col-sku(\s|$)/.test(n)?"sku":e==="parent_sku"||r==="parent sku"||/(^|\s)col-parent_sku(\s|$)/.test(n)?"parent_sku":e==="name"||r==="name"||/(^|\s)col-name(\s|$)/.test(n)?"name":null}function zd(t){const e=[];return t.querySelectorAll("th").forEach((n,r)=>{const a=Fd(n);if(!a)return;const o=Array.from(n.classList).find(s=>s.startsWith("col-"))??null,i=n.getAttribute("data-index")??null;e.push({index:r,className:o,dataIndex:i,kind:a})}),e}function nn(t){for(const e of Array.from(t.querySelectorAll("thead tr"))){const n=zd(e);if(n.length>0)return n}return[]}function Vo(t,e){const n=[e.dataIndex,e.kind].filter(r=>!!r);for(const r of n){const a=t.querySelector(`td[data-index="${r}"]`);if(a)return a}if(e.className){const r=t.querySelector(`td.${e.className}`);if(r)return r}return t.querySelectorAll("td")[e.index]??null}function Fo(t,e){const n=t.cloneNode(!0);return n.querySelectorAll(e).forEach(r=>r.remove()),(n.textContent??"").replace(/\s+/g," ").trim()}function rn(t){return Array.from(t.querySelectorAll("tbody tr")).filter(e=>!e.classList.contains("data-grid-tr-no-data"))}function br(t){return Array.from(t.querySelectorAll("table.data-grid")).sort((e,n)=>rn(n).length-rn(e).length)}function Gd(t,e){for(const n of t)if(nn(n).some(r=>r.kind===e))return!0;return!1}function jd(t,e,n){let r=[];for(const a of t){const o=nn(a).find(s=>s.kind===e);if(!o)continue;const i=[];for(const s of rn(a)){const c=Vo(s,o),l=c?Fo(c,n):"";l&&i.push(l)}i.length>r.length&&(r=i)}return r}function Zd(t){const e=/^(.*?)\/catalog\//.exec(t);return(e==null?void 0:e[1])??""}function Kd(t){const e=(t.getAttribute("data-id")??"").trim();if(/^\d+$/.test(e))return e;const n=t.querySelector('td[data-index="entity_id"], td[data-index="id"], td[data-col="entity_id"]'),r=((n==null?void 0:n.textContent)??"").trim();return/^\d+$/.test(r)?r:null}function Wd(t,e,n){const r=t.querySelector('a[href*="/catalog/product/edit/id/"]');if(r!=null&&r.href)return r.href;const a=Kd(t);return a?`${e}${Zd(n)}/catalog/product/edit/id/${a}/`:null}function Ye(t,e="info"){var o;(o=document.querySelector(".mhx-toast"))==null||o.remove();const n=document.createElement("div");n.className=`mhx-toast mhx-toast--${e}`;const r=document.createElement("span");r.textContent=t;const a=document.createElement("button");a.type="button",a.textContent="×",a.addEventListener("click",()=>n.remove()),n.append(r,a),document.body.appendChild(n),setTimeout(()=>n.remove(),4e3)}function Yd(){br(document).forEach(t=>{const e=nn(t);e.length!==0&&rn(t).forEach(n=>{e.forEach(r=>{const a=Vo(n,r);if(!a||(r.kind==="sku"&&Xd(a,n),a.querySelector(`[${gr}="1"]`)))return;const o=qo();o.addEventListener("click",i=>{i.preventDefault(),i.stopPropagation(),fr(Fo(a,Bo)).then(()=>$o(o))}),a.appendChild(o)})})})}function Xd(t,e){if(t.querySelector(`[${xr}="1"]`))return;const n=Wd(e,location.origin,location.pathname);if(!n)return;const r=document.createElement("button");r.type="button",r.className="mhx-sku-copy-btn mhx-sku-copy-btn--open",r.setAttribute(xr,"1"),r.innerHTML=Dd,r.title="Open product in a new tab",r.addEventListener("click",a=>{a.preventDefault(),a.stopPropagation(),window.open(n,"_blank","noopener,noreferrer")}),t.appendChild(r)}function Jd(t){return t.closest('.admin__data-grid-outer-wrap, [data-role="grid"], .admin__data-grid-wrap')??document}function zo(t,e,n){const r=document.createElement("button");r.type="button",r.className="mhx-grid-copy-all",r.title=`Copy every ${e} on this page`;const a=document.createElement("span");a.innerHTML=tn;const o=document.createElement("span");return o.textContent=t,r.append(a,o),r.addEventListener("click",i=>{i.preventDefault(),i.stopPropagation();const s=br(Jd(r));if(s.length===0){Ye("Product grid not found.","error");return}if(!Gd(s,n)){Ye(`No ${e} column found.`,"error");return}const c=jd(s,n,Bo);if(c.length===0){Ye(`No ${e} found on this page.`,"error");return}fr(c.join(`
`)).then(()=>{o.textContent=`Copied ${c.length}`,r.classList.add("mhx-sku-copy-btn--feedback"),Ye(`Copied ${c.length} ${e}.`,"success"),setTimeout(()=>{o.textContent=t,r.classList.remove("mhx-sku-copy-btn--feedback")},1500)}).catch(()=>Ye("Copy failed.","error"))}),r}function Qd(){br(document).forEach(t=>{const e=nn(t),n=e.find(l=>l.kind==="sku")??null,r=e.find(l=>l.kind==="parent_sku")??null;if(!n&&!r)return;const a=t.closest('[data-role="grid"], .admin__data-grid-outer-wrap, .admin__data-grid-wrap');if(!a)return;const o=a.querySelector(".data-grid-search-control-wrap, .admin__data-grid-search");let i=null,s=null;if(o!=null&&o.parentElement?(i=o.parentElement,s=o.nextSibling):i=a.querySelector(".admin__data-grid-header")??t.parentElement,!i||i.querySelector(".mhx-grid-copy-wrap"))return;s&&s.parentNode!==i&&(s=null);const c=document.createElement("span");c.className="mhx-grid-copy-wrap",n&&c.appendChild(zo("Copy SKUs","SKUs","sku")),r&&c.appendChild(zo("Copy Parent SKUs","Parent SKUs","parent_sku")),i.insertBefore(c,s)})}function eu(){var r;const t=document.querySelector(".store-switcher");if(!t||document.querySelector(".mhx-store-buttons"))return;const e=document.createElement("div");e.className="mhx-store-buttons",yn.forEach(a=>{const o=ca[a];if(!o)return;const i=document.createElement("button");i.type="button",i.className="mhx-store-btn",i.textContent=a,i.title=`Open ${a} store view`,i.addEventListener("click",s=>{s.preventDefault();const c=la(location.href,o);c&&window.open(c,"_blank","noopener,noreferrer")}),e.appendChild(i)});const n=document.createElement("button");n.type="button",n.className="mhx-store-btn mhx-store-btn--all",n.textContent=`Open All (${yn.length} tabs)`,n.addEventListener("click",a=>{a.preventDefault();const o=yn.map(i=>la(location.href,ca[i]??null)).filter(Boolean);o.length!==0&&chrome.runtime.sendMessage({type:"OPEN_TAB_GROUP",urls:o,groupName:"All Store Views"}).then(()=>Ye(`Opened ${o.length} store views.`,"success"))}),e.appendChild(n),(r=t.parentNode)==null||r.insertBefore(e,t.nextSibling)}function tu(){const t=St();return t?t.querySelector(".admin__collapsible-title, .admin__fieldset legend, legend"):null}function nu(){const t=Go();if(!t.available||t.pending||t.groups.length===0)return;const e=tu(),n=e==null?void 0:e.parentElement;!e||!n||t.groups.forEach(r=>{if(r.urls.length===0)return;const a=n.querySelector(`.mhx-open-sizes-btn[data-color="${CSS.escape(r.label)}"]`);if(a){a.textContent=`${r.label} (${r.urls.length})`;return}const o=document.createElement("button");o.type="button",o.className="mhx-open-sizes-btn",o.dataset.color=r.label,o.textContent=`${r.label} (${r.urls.length})`,o.addEventListener("click",i=>{i.preventDefault(),chrome.runtime.sendMessage({type:"OPEN_TAB_GROUP",urls:r.urls,groupName:`${r.label} sizes`})}),n.insertBefore(o,e.nextSibling)})}function Go(){var i;if(!Ge(location.href))return{available:!1,groups:[],reason:"Open a Magento product edit page to read configurations."};const t=St();if(!t)return{available:!0,groups:[],reason:"No Configurations section on this page."};if(Ho(t)){const s=t.classList.contains("admin__collapsible-block-wrapper")?t:t.closest(".admin__collapsible-block-wrapper");return(i=s==null?void 0:s.querySelector(".admin__collapsible-title"))==null||i.click(),{available:!0,pending:!0,groups:[]}}const e=t.querySelector("table.admin__dynamic-rows, table.data-grid, table"),n=new Map,r=je();if(!e)return{available:!0,groups:[],sku:r,reason:"No configuration rows yet."};let a=-1;const o=e.querySelector("thead tr");return o&&(a=Array.from(o.querySelectorAll("th")).findIndex(c=>(c.textContent??"").toLowerCase().includes("attribute"))),a===-1&&(a=7),e.querySelectorAll("tbody tr").forEach(s=>{var g;const c=s.querySelectorAll("td"),l=c[a],d=((l==null?void 0:l.textContent)??"").trim();if(!d)return;const u=d.match(/color:\s*([^,]+)/i);if(!u)return;const m=(u[1]??"").trim();if(!m)return;const p=(g=c[1])==null?void 0:g.querySelector('a[href*="/catalog/product/edit/id/"]');if(!p)return;const x=n.get(m)??{label:m,urls:[]};x.urls.push(p.href),n.set(m,x)}),{available:!0,groups:[...n.values()],sku:r}}let Ar="";const ru='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',au='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',jo='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>',ou={High:ru,Medium:au,Low:jo},iu={High:"high",Medium:"medium",Low:"low"},Zo={High:3,Medium:2,Low:1},su=[{keywords:["box dimensions"],fields:["box_dimensions"]},{keywords:["bag dimensions"],fields:["bag_dimensions"]},{keywords:["dimensions"],fields:["dimensions"]},{keywords:["weight"],fields:["weight"]},{keywords:["grammage"],fields:["grammage"]},{keywords:["image","photo","picture","media","gallery","thumbnail"],fields:["image","thumbnail","small_image","swatch_image","media_gallery"]},{keywords:["stock","quantity","inventory","qty"],fields:["quantity_and_stock_status","qty"]},{keywords:["price","cost","special_price","tier"],fields:["price","special_price","tier_price"]},{keywords:["attribute","color","option","variant"],fields:["color","size"]},{keywords:["category","taxonom","tag"],fields:["category_ids","product_tag"]},{keywords:["related","upsell","crosssell","cross-sell"],fields:["related_products","upsell_products","crosssell_products"]},{keywords:["translation","text","title","description","meta","keyword","seo","url"],fields:["name","description","short_description","meta_title","meta_description","meta_keywords","url_key"]}];function cu(t){const e=[...t.errorGroup,...t.errorType,t.notes,t.title].join(" ").toLowerCase();for(const n of su)for(const r of n.keywords)if(new RegExp(`\\b${r.replace(/\s+/g,"\\s+")}\\b`,"i").test(e))return n.fields;return null}function lu(t){var n;let e=t;for(;e;)e.classList.contains("admin__collapsible-block-wrapper")&&(e.classList.contains("_hide")||!e.classList.contains("_show"))&&((n=e.querySelector(".admin__collapsible-title"))==null||n.click()),e=e.parentElement}function du(t,e){const n=e.priority||"Low",r=iu[n]??"low",a=ou[n]??jo,o=t.closest(".admin__field, .admin_field, .admin__fieldset")??t.parentElement;if(!o)return;const i=o.querySelector(".mhx-error-indicator");if(i){const d=i.getAttribute("data-priority")??"";if((Zo[n]??0)<=(Zo[d]??0))return;i.remove()}const s=o.querySelector(".admin__field-label label, .admin_field-label label, label");if(!s)return;const c=document.createElement("span");c.className=`mhx-error-indicator mhx-error-indicator--${r}`,c.innerHTML=a,c.setAttribute("data-priority",n),c.setAttribute("data-tooltip",[e.title,e.notes].filter(Boolean).join(`
`)),s.classList.add("mhx-error-label-host"),s.appendChild(c),lu(t);const l=s.closest(".admin__field")??s.parentElement;l&&(l.classList.remove("mhx-error-label--high","mhx-error-label--medium","mhx-error-label--low"),l.classList.add(`mhx-error-label--${r}`))}function uu(t){if(!t||t.length===0)return{matched:0,unmatched:0};let e=0,n=0;return document.querySelectorAll(".mhx-error-indicator").forEach(r=>r.remove()),document.querySelectorAll(".mhx-error-label-host").forEach(r=>{r.classList.remove("mhx-error-label-host")}),document.querySelectorAll(".mhx-error-label--high, .mhx-error-label--medium, .mhx-error-label--low").forEach(r=>{r.classList.remove("mhx-error-label--high","mhx-error-label--medium","mhx-error-label--low")}),t.forEach(r=>{if(!r||r.status==="Done")return;const a=cu(r);if(!a){n+=1;return}let o=!1;for(const i of a)document.querySelectorAll(`input[name*="${i}"], textarea[name*="${i}"], select[name*="${i}"], [data-index="${i}"]`).forEach(s=>{du(s,r),o=!0});o?e+=1:n+=1}),n>0&&console.debug(`[mhx] ERROR_MARKUP: ${e} matched, ${n} unmatched`),{matched:e,unmatched:n}}function mu(){if(!Ge(location.href))return;const t=je();!t||t===Ar||(Ar=t,chrome.runtime.sendMessage({type:"FETCH_ERROR_MARKUP",sku:t}).catch(()=>{Ar=""}))}const pu=[{code:"PT",storeId:"1",flag:"🇵🇹"},{code:"EN",storeId:"2",flag:"🇬🇧"},{code:"ES",storeId:"4",flag:"🇪🇸"},{code:"FR",storeId:"5",flag:"🇫🇷"},{code:"DE",storeId:"6",flag:"🇩🇪"},{code:"IT",storeId:"7",flag:"🇮🇹"}];function Ko(){return window.location.href.indexOf("toogas_attributesetcustomoptions")!==-1}function hu(t){var d;if(t.dataset.mhxLangMounted==="1")return;const e=Array.from(t.querySelectorAll('input[name*="][name]["]')).filter(u=>u.type==="text");if(e.length===0)return;t.dataset.mhxLangMounted="1";const n=new Map;for(const u of e){const m=u.name.match(/\[name\]\[(\d+)\]$/);m!=null&&m[1]&&n.set(m[1],u)}const r=t.querySelector('button[data-action="remove"], .action-delete, td:last-child button'),a=t.querySelectorAll("td").length||6,o=document.createElement("tr");o.className="mhx-opt-lang-row",o.dataset.mhxOptLang="1";const i=document.createElement("td");i.colSpan=a,i.className="mhx-opt-lang-cell";const s=document.createElement("div");s.className="mhx-opt-lang-wrap";const c=document.createElement("div");c.className="mhx-opt-lang-grid";for(const u of pu){const m=n.get(u.storeId),p=document.createElement("div");p.className="mhx-opt-lang-field";const x=document.createElement("label");x.textContent=u.flag+" "+u.code,x.className="mhx-opt-lang-label";const g=document.createElement("input");g.type="text",g.className="mhx-opt-lang-input",g.placeholder=u.code,m?(g.value=m.value,g.addEventListener("input",()=>{m.value=g.value,m.dispatchEvent(new Event("input",{bubbles:!0})),m.dispatchEvent(new Event("change",{bubbles:!0}))}),m.addEventListener("input",()=>{g!==document.activeElement&&(g.value=m.value)})):(g.disabled=!0,g.placeholder="—",g.className="mhx-opt-lang-input mhx-opt-lang-input--off"),p.appendChild(x),p.appendChild(g),c.appendChild(p)}const l=t.querySelector('input[name*="][sort]"]');if(l){const u=document.createElement("div");u.className="mhx-opt-lang-sortcell";const m=document.createElement("label");m.textContent="↕ Sort",m.className="mhx-opt-lang-label";const p=document.createElement("input");p.type="text",p.value=l.value,p.className="mhx-opt-lang-input mhx-opt-lang-input--sort",p.placeholder="#",p.addEventListener("input",()=>{l.value=p.value,l.dispatchEvent(new Event("input",{bubbles:!0})),l.dispatchEvent(new Event("change",{bubbles:!0}))}),l.addEventListener("input",()=>{p!==document.activeElement&&(p.value=l.value)}),u.appendChild(m),u.appendChild(p),c.appendChild(u)}if(s.appendChild(c),r){const u=r.cloneNode(!0);u.className="mhx-opt-lang-del",u.addEventListener("click",()=>r.click()),s.appendChild(u)}i.appendChild(s),o.appendChild(i),(d=t.parentNode)==null||d.insertBefore(o,t)}function Wo(t){const e=t.closest(".admin__control-table-wrapper");if(!e)return;e.style.maxWidth="none",e.style.width="100%",e.style.overflowX="visible";const n=e.closest(".admin__field-control");n&&(n.style.width="100%",n.style.maxWidth="none",n.style.flexBasis="100%",n.style.flexGrow="1");const r=e.closest(".admin__field");r&&(r.style.flexWrap="wrap")}function fu(){if(!Ko())return;const t=document.querySelectorAll("table");let e=null;for(const a of t){const o=Array.from(a.querySelectorAll("thead th")).map(c=>{var l;return((l=c.textContent)==null?void 0:l.trim().toLowerCase())??""}),i=o.some(c=>c.includes("name")),s=o.some(c=>c.includes("parent"));if(i&&!s){e=a;break}}if(!e)return;Wo(e),e.style.width="100%",e.style.tableLayout="fixed";const n=()=>e.dataset.mhxMode!=="original";if(!document.getElementById("mhx-opt-toggle")){const a=e.closest(".admin__control-table-wrapper")??e.parentElement;if(a!=null&&a.parentElement){const o=document.createElement("button");o.id="mhx-opt-toggle",o.type="button",o.className="mhx-opt-mode-btn";const i=()=>{const s=n();o.textContent=s?"⊞ Original UI":"⊟ Lang fields UI",e.querySelectorAll("tbody tr:not([data-mhx-opt-lang])").forEach(c=>{c.style.display=s?"none":""}),e.querySelectorAll("tr.mhx-opt-lang-row").forEach(c=>{c.style.display=s?"":"none"})};o.addEventListener("click",()=>{e.dataset.mhxMode=n()?"original":"new",i()}),a.parentElement.insertBefore(o,a),e.dataset.mhxMode="new",i()}}e.querySelectorAll("tbody tr:not([data-mhx-opt-lang]):not([data-mhx-lang-mounted])").forEach(a=>{hu(a),a.style.display=n()?"none":""}),e.querySelectorAll("tr.mhx-opt-lang-row").forEach(a=>{a.style.display=n()?"":"none"})}function gu(){if(!Ko())return;const t=document.querySelectorAll("table");let e=null;for(const d of t)if(Array.from(d.querySelectorAll("thead th")).map(m=>{var p;return((p=m.textContent)==null?void 0:p.trim().toLowerCase())??""}).some(m=>m.includes("parent"))){e=d;break}if(!e||e.dataset.mhxItemsEnhanced==="1")return;e.dataset.mhxItemsEnhanced="1",Wo(e);const n=e.querySelector("tbody");if(!n)return;let r=null;n.querySelectorAll("tr").forEach(d=>{var m;const u=d.querySelector('button, input[type="button"]');u&&((m=u.textContent)!=null&&m.trim().toLowerCase().includes("add item"))&&(r=u)});const a=e.closest(".admin__control-table-wrapper")??e.parentElement;if(!(a!=null&&a.parentElement))return;const o=document.createElement("div");o.id="mhx-items-panel",o.className="mhx-items-panel",a.parentElement.insertBefore(o,a);const i=document.createElement("button");i.id="mhx-items-toggle",i.type="button",i.className="mhx-opt-mode-btn",i.textContent="⊞ Original UI",a.parentElement.insertBefore(i,o);let s=!0;const c=()=>{i.textContent=s?"⊞ Original UI":"⊟ Grouped UI",a.style.display=s?"none":"",o.style.display=s?"":"none"};i.addEventListener("click",()=>{s=!s,c()});const l=()=>{var p,x;o.innerHTML="";const d=Array.from(n.querySelectorAll("tr")).filter(g=>{var A;const f=g.querySelector('button, input[type="button"]');return!(f&&((A=f.textContent)!=null&&A.trim().toLowerCase().includes("add item")))});if(d.length===0){o.textContent="No items.";return}const u=[],m=new Map;for(const g of d){const f=g.querySelector('select[name*="[parent]"]');if(!f)continue;const A=f.value??"",w=((x=(p=f.options[f.selectedIndex])==null?void 0:p.text)==null?void 0:x.trim())??A;m.has(A)?u[m.get(A)].rows.push(g):(m.set(A,u.length),u.push({key:A,label:w,rows:[g]}))}for(const g of u){const f=document.createElement("div");f.className="mhx-items-group";const A=document.createElement("div");A.className="mhx-items-group-head";const w=document.createElement("span");w.className="mhx-opt-group-left";const I=document.createElement("span");I.className="mhx-opt-group-arrow",I.textContent="▼";const N=document.createElement("span");N.textContent=` ${g.label} `;const O=document.createElement("span");O.className="mhx-opt-group-count",O.textContent=`(${g.rows.length})`,w.append(I,N,O);const h=document.createElement("span");if(h.className="mhx-opt-group-actions",r){const M=document.createElement("button");M.type="button",M.className="mhx-opt-group-add",M.textContent="+ Add Item",M.addEventListener("click",$=>{$.stopPropagation();const H=new Set(Array.from(n.querySelectorAll("tr")).filter(B=>{var W;const _=B.querySelector('button, input[type="button"]');return!(_&&((W=_.textContent)!=null&&W.trim().toLowerCase().includes("add item")))}));r.click();const T=()=>{const B=Array.from(n.querySelectorAll("tr")).filter(W=>{var oe;const he=W.querySelector('button, input[type="button"]');return!(he&&((oe=he.textContent)!=null&&oe.trim().toLowerCase().includes("add item")))}).find(W=>!H.has(W));if(!B){requestAnimationFrame(T);return}const _=B.querySelector('select[name*="[parent]"]');_&&(_.value=g.key,_.dispatchEvent(new Event("change",{bubbles:!0}))),setTimeout(()=>{e.dataset.mhxItemsEnhanced="",l()},300)};requestAnimationFrame(T)}),h.appendChild(M)}const b=document.createElement("button");b.type="button",b.className="mhx-opt-group-del",b.textContent="🗑 Delete all",b.addEventListener("click",M=>{M.stopPropagation();const $=g.rows.filter(B=>B.isConnected);if(!window.confirm(`Delete all ${$.length} items in "${g.label}"?`))return;let H=0;const T=()=>{if(H>=$.length){setTimeout(()=>{e.dataset.mhxItemsEnhanced="",l()},200);return}const B=$[H++];if(!B)return;const _=B.querySelector('button[data-action="remove"], .action-delete, td:last-child button');_&&_.click(),setTimeout(T,100)};T()}),h.appendChild(b),A.appendChild(w),A.appendChild(h),f.appendChild(A);const C=document.createElement("div");C.className="mhx-items-rows";for(const M of g.rows){const $=document.createElement("div");$.className="mhx-items-row";const H=M.querySelector('select[name*="[name_option]"]');if(H){const _=H.cloneNode(!0);_.className="mhx-items-name-sel",_.value=H.value,_.value!==H.value&&Array.from(_.options).forEach((W,he)=>{W.value===H.value&&(_.selectedIndex=he)}),_.addEventListener("change",()=>{H.value=_.value,H.dispatchEvent(new Event("change",{bubbles:!0}))}),$.appendChild(_)}const T=M.querySelector('select[name*="[store_view]"]');if(T){const _=T.cloneNode(!0);_.className="mhx-items-sv-sel",_.value=T.value,_.addEventListener("change",()=>{T.value=_.value,T.dispatchEvent(new Event("change",{bubbles:!0}))}),$.appendChild(_)}const B=M.querySelector('button[data-action="remove"], .action-delete, td:last-child button');if(B){const _=document.createElement("button");_.type="button",_.className="mhx-items-del-row",_.textContent="🗑",_.title="Delete this item",_.addEventListener("click",()=>{B.click(),setTimeout(()=>{e.dataset.mhxItemsEnhanced="",l()},300)}),$.appendChild(_)}C.appendChild($)}let R=!1;A.addEventListener("click",()=>{R=!R,C.style.display=R?"none":"",I.textContent=R?"▶":"▼"}),f.appendChild(C),o.appendChild(f)}};new MutationObserver(()=>{s&&(clearTimeout(o._mhxTimer),o._mhxTimer=window.setTimeout(()=>{e.dataset.mhxItemsEnhanced="",l()},400))}).observe(n,{childList:!0}),l(),c()}const xu=[{from:100,to:249,discount:5},{from:250,to:499,discount:8},{from:500,to:4999,discount:10},{from:5e3,to:null,discount:12}],bu=[{from:200,to:499,discount:5},{from:500,to:999,discount:8},{from:1e3,to:4999,discount:10},{from:5e3,to:null,discount:12}];function Au(t){return t.includes("product_action_attribute")||t.includes("attributes")&&t.includes("edit")}function Su(){const t=document.querySelectorAll("table");for(const e of t){const n=e.querySelector("thead tr");if(!n)continue;if(Array.from(n.querySelectorAll("th")).map(o=>(o.textContent??"").trim().toLowerCase()).some(o=>["quantity","price","customer group","website"].some(i=>o.includes(i))))return e}return null}function Yo(t){const e=t.querySelectorAll('button.action-delete, [data-action="remove_row"], [data-action="remove"], .action-delete, [class*="delete"], [class*="remove"]');for(const n of e)if(n.tagName==="BUTTON"||n.tagName==="A"||n.getAttribute("role")==="button")return n;for(const n of t.querySelectorAll("*")){const r=(n.getAttribute("aria-label")||n.getAttribute("title")||n.textContent||"").trim().toLowerCase();if(r.includes("delete")||r.includes("remove"))return n}return null}function Eu(){if(!Au(location.href)||document.getElementById("mhx-tier-prices-btns"))return;const t=Su();if(!t)return;const e=document.createElement("div");e.className="mhx-tier-prices-btns",e.id="mhx-tier-prices-btns",e.style.cssText="margin-bottom: 8px; display: flex; gap: 8px; flex-wrap: wrap;";const n=(a,o,i)=>{const s=document.createElement("button");s.type="button",s.className="mhx-tier-prices-btn mhx-tier-prices-btn--fill",s.textContent=a,s.style.cssText=`
      padding: 6px 14px;
      border: 1px solid var(--mhx-pg-line);
      border-radius: 4px;
      cursor: pointer;
      font: 13px/1.4 system-ui, "Segoe UI", Arial, sans-serif;
      background: var(--mhx-pg-fill);
      color: var(--mhx-pg-ink);
    `,s.title=i,s.addEventListener("click",o),e.appendChild(s)};n("Textil",()=>{Qo(t,xu)},"Fill with Textil tier prices from Notion"),n("Outros artigos",()=>{Qo(t,bu)},"Fill with Outros artigos tier prices from Notion"),n("Delete all",()=>{vu(t)},"Remove all tier price rows");const r=t.parentElement??document.body;r&&r.insertBefore(e,r.firstChild)}function yu(t){var o,i;const e=t.querySelectorAll("input");for(const s of e)if(/price_qty/i.test(s.name)||/qty|quantity/i.test(s.name)||/qty|quantity/i.test(s.id)){const c=parseInt(s.value,10);if(!Number.isNaN(c))return c}const r=((i=(o=t.querySelectorAll("td")[2])==null?void 0:o.textContent)==null?void 0:i.trim())??"",a=parseInt(r,10);return Number.isNaN(a)?NaN:a}function Xo(t,e){const n=t.querySelectorAll("select");for(const i of n)if(/value_type/i.test(i.name)||/value_type/i.test(i.id)){for(const s of i.options)if(/percent/i.test(s.text)||/percent/i.test(s.value)){i.value=s.value,i.dispatchEvent(new Event("change",{bubbles:!0}));break}}const r=()=>{const i=t.querySelectorAll("input");for(const s of i)if(/percentage_value/i.test(s.name)||/percentage_value/i.test(s.id))return s.value=String(e),s.dispatchEvent(new Event("change",{bubbles:!0})),s.dispatchEvent(new Event("input",{bubbles:!0})),!0;return!1};let a=0;const o=()=>{r()||a<20&&(a++,setTimeout(o,50))};setTimeout(o,100)}function Jo(t,e){const n=t.querySelectorAll("input");for(const r of n)(/price_qty/i.test(r.name)||/qty|quantity/i.test(r.name)||/qty|quantity/i.test(r.id))&&(r.value=String(e),r.dispatchEvent(new Event("change",{bubbles:!0})),r.dispatchEvent(new Event("input",{bubbles:!0})))}async function vu(t){const e=t.querySelector("tbody");if(e){for(;e.querySelectorAll("tr").length>0;){const n=e.querySelector("tr");if(!n)break;const r=Yo(n);if(!r)break;const a=e.querySelectorAll("tr").length;r.click(),await new Promise(o=>{const i=Date.now(),s=()=>{e.querySelectorAll("tr").length<a?o():Date.now()-i<1e3?setTimeout(s,50):o()};setTimeout(s,50)})}if(e.querySelectorAll("tr").length>0)for(const n of Array.from(e.querySelectorAll("tr"))){const r=n.querySelectorAll("input, select");for(const a of r)a instanceof HTMLInputElement?(a.value="",a.dispatchEvent(new Event("change",{bubbles:!0})),a.dispatchEvent(new Event("input",{bubbles:!0}))):a instanceof HTMLSelectElement&&a.options.length&&(a.selectedIndex=0,a.dispatchEvent(new Event("change",{bubbles:!0})))}}}async function Qo(t,e){const n=t.querySelector("tbody");if(!n)return;for(;n.querySelectorAll("tr").length>0;){const o=n.querySelector("tr");if(!o)break;const i=Yo(o);if(!i)break;const s=n.querySelectorAll("tr").length;i.click(),await new Promise(c=>{const l=Date.now(),d=()=>{n.querySelectorAll("tr").length<s?c():Date.now()-l<1e3?setTimeout(d,50):c()};setTimeout(d,50)})}if(n.querySelectorAll("tr").length>0)for(const o of Array.from(n.querySelectorAll("tr"))){const i=o.querySelectorAll("input, select");for(const s of i)s instanceof HTMLInputElement?(s.value="",s.dispatchEvent(new Event("change",{bubbles:!0})),s.dispatchEvent(new Event("input",{bubbles:!0}))):s instanceof HTMLSelectElement&&s.options.length&&(s.selectedIndex=0,s.dispatchEvent(new Event("change",{bubbles:!0})))}const r=Array.from(n.querySelectorAll("tr"));let a=0;for(const o of e){let i=null;for(let s=a;s<r.length;s++){const c=r[s];if(c&&Number.isNaN(yu(c))){i=c,a=s+1;break}}if(i)Jo(i,o.from),Xo(i,o.discount);else{const s=Array.from(document.querySelectorAll("button")).find(u=>/^\s*add\s*$/i.test((u.textContent??"").trim()));if(!s)continue;const c=n.querySelectorAll("tr").length;s.click(),await new Promise(u=>{const m=Date.now(),p=()=>{n.querySelectorAll("tr").length>c?u():Date.now()-m<1e3?setTimeout(p,50):u()};setTimeout(p,150)});const l=Array.from(n.querySelectorAll("tr")),d=l.length>0?l[l.length-1]:null;d&&(Jo(d,o.from),Xo(d,o.discount))}}}const Sr="data-mhx-assoc-bulk-panel",Oe="data-mhx-assoc-bulk-status",Cu="mhx-assoc-bulk-progress",an="data-mhx-assoc-bulk-cancel",Tu='aside[class*="associated_product_modal"], [id*="associated_product_modal"]';let on="",Er=!1,ei=!1;function wu(){if(ei)return;ei=!0;const t=document.createElement("style");t.id="mhx-assoc-bulk-styles",t.textContent=`
    .mhx-assoc-bulk-panel{
      display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;
      margin:8px 0;padding:8px 10px;box-sizing:border-box;
      border:1px solid var(--mhx-pg-line);border-radius:6px;
      background:var(--mhx-pg-fill);
    }
    .mhx-assoc-bulk-field{display:flex;flex-direction:column;gap:4px;}
    .mhx-assoc-bulk-actions{display:flex;gap:6px;align-items:center;}
    .mhx-assoc-bulk-field label{font-size:11px;color:var(--mhx-pg-muted);font-weight:600;letter-spacing:.02em;text-transform:uppercase;}
    textarea.mhx-assoc-bulk-input{
      width:260px;height:54px;font:inherit;color:var(--mhx-pg-ink);
      background:var(--mhx-pg-fill);border:1px solid var(--mhx-pg-line);
      border-radius:6px;padding:6px 8px;resize:vertical;line-height:1.35;
      font-family:inherit;font-size:13px;
    }
    textarea.mhx-assoc-bulk-input:focus{
      outline:none;border-color:var(--mhx-pg-accent);
      box-shadow:0 0 0 3px var(--mhx-pg-accent);
    }
    [${Oe}]{font-size:12px;color:var(--mhx-pg-muted);line-height:1.4;flex:1 1 220px;min-width:180px;white-space:normal;}
    [${Oe}][data-tone="ok"]{color:var(--mhx-pg-ok);}
    [${Oe}][data-tone="warn"]{color:var(--mhx-pg-warn);}
    [${Oe}][data-tone="err"]{color:var(--mhx-pg-danger);}
  `,(document.head??document.documentElement).appendChild(t)}function _u(t){const e=new Set,n=[],r=/[ \t\r\n;,|]+/;for(const a of t.split(r)){const o=a.trim();if(!o)continue;const i=o.toLowerCase();e.has(i)||(e.add(i),n.push(o))}return n.length>100&&(n.length=100),n}function Ou(t){if(t.querySelector(`[${Sr}]`))return;wu();const e=t.querySelector(".modal-content")??t.querySelector(".admin__data-grid-header")??t.querySelector(".modal-inner-wrap")??t,n=document.createElement("div");n.className="mhx-assoc-bulk-panel",n.setAttribute(Sr,"1");const r=document.createElement("div");r.className="mhx-assoc-bulk-field";const a=document.createElement("label");a.textContent="Bulk select SKUs";const o=document.createElement("textarea");o.className="mhx-assoc-bulk-input",o.placeholder=`RPO6640645
ANOTHER-SKU`,o.rows=3,o.value=on,o.addEventListener("input",()=>{on=o.value}),o.addEventListener("keydown",d=>{d.key==="Enter"&&(d.metaKey||d.ctrlKey)&&(d.preventDefault(),ai(n))}),r.appendChild(a),r.appendChild(o);const i=document.createElement("div");i.className="mhx-assoc-bulk-status",i.setAttribute(Oe,"1"),i.setAttribute("role","status"),i.setAttribute("aria-live","polite"),i.textContent="Paste SKUs, then select them.";const s=document.createElement("div");s.className="mhx-assoc-bulk-actions";const c=Z({label:"Select SKUs",title:"Resolve pasted SKUs and tick them on screen",onClick:()=>{ai(n)}});c.setAttribute("data-mhx-btn","1"),c.disabled=!1,s.appendChild(c);const l=Z({label:"Stop",title:"Stop after the current SKU and leave the selection unchanged",onClick:()=>{document.documentElement.setAttribute(an,"1");const d=n.querySelector(`div[${Oe}]`);d instanceof HTMLElement&&Ie(d,"Stopping after the current SKU…","warn")}});l.setAttribute("data-mhx-stop","1"),l.disabled=!0,s.appendChild(l),n.appendChild(r),n.appendChild(s),n.appendChild(i),e.insertBefore(n,e.firstChild),ti(n,Er)}function Ie(t,e,n){t.textContent=e,t.removeAttribute("data-tone"),n&&t.setAttribute("data-tone",n)}function ti(t,e){const n=t.querySelector("button[data-mhx-btn]");n instanceof HTMLButtonElement&&(n.disabled=e);const r=t.querySelector("button[data-mhx-stop]");r instanceof HTMLButtonElement&&(r.disabled=!e)}function ni(t){Er=t,document.querySelectorAll(`[${Sr}]`).forEach(n=>ti(n,t)),t?document.documentElement.setAttribute(an,"0"):document.documentElement.removeAttribute(an)}let ri=!1;function Iu(){ri||(ri=!0,document.addEventListener(Cu,t=>{try{const e=t.detail;if(typeof e!="string")return;const n=JSON.parse(e);if(!n.done||!n.total||document.documentElement.getAttribute(an)==="1")return;const r=document.querySelectorAll(`div[${Oe}]`);if(r.length===0)return;const a="ok";try{let o=null;for(let i=0;i<r.length;i+=1){const s=r[i];if(s&&s.getClientRects().length>0){o=s;break}}o||(o=r[0]??null),o&&Ie(o,`Resolving ${n.sku}…  (${n.done} of ${n.total})`,a)}catch{}}catch{}}))}async function ai(t){if(Er)return;const e=t.querySelector("textarea.mhx-assoc-bulk-input"),n=e instanceof HTMLTextAreaElement?e:null,r=t.querySelector(`div[${Oe}]`),a=r instanceof HTMLElement?r:null,o=_u((n==null?void 0:n.value)??"");if(o.length===0){a&&Ie(a,"Paste at least one SKU first.","warn");return}o.length>100&&(on=o.slice(0,100).join(`
`)),ni(!0),a&&Ie(a,`Resolving ${o.length} SKU(s)… Press Stop to cancel.`,"ok");try{let i;try{i=await chrome.runtime.sendMessage({type:"SELECT_ASSOCIATED_SKUS",skus:o})}catch{i={ok:!1,reason:"The background did not answer."}}if(!i){a&&Ie(a,"The background did not answer.","err");return}if(!i.ok){a&&Ie(a,String(i.reason||"The run did not start."),"err");return}if(i.cancelled){a&&Ie(a,"Stopped. Nothing was selected and the grid filter was put back.","warn");return}const s=i.requested??o.length,c=i.found??0,l=i.missing??[],d=i.already??[],u=i.added??0,m=i.tickedOnScreen??0,p=i.totalSelected,x=Math.max(0,s-d.length),g=l.length>0?"warn":"ok",f=[];if(c===0&&d.length===0)f.push("No pasted SKU matched this listing.");else if(u===0)d.length&&f.push(`${d.length} already associated, skipped.`),c>0&&f.push("Nothing new to add."),p!==null&&f.push(`Header total: ${p}.`);else{f.push(`Selected ${u} of ${x} new SKU(s).`);const A=Math.max(0,u-m);A>0&&f.push(`${A} are not on this page, so they have no tick: the header count holds them.`),p!==null&&f.push(`Header total: ${p}.`),f.push("Press Done to apply the selection.")}d.length&&f.push(`Already associated: ${d.join(", ")}.`),l.length&&f.push(`Not found: ${l.join(", ")}.`),a&&Ie(a,f.join(" "),g),o.length>100&&(n&&(n.value=o.slice(0,100).join(`
`)),on=n?n.value:"")}finally{ni(!1)}}function ku(){const t=[],e=new Set,n=r=>{e.has(r)||(e.add(r),t.push(r))};if(document.querySelectorAll(Tu).forEach(n),document.querySelectorAll(".modal-slide, .modal-popup, .admin__modal").forEach(r=>{const a=r.querySelector(".modal-title");a&&/select associated product/i.test(a.textContent??"")&&n(r)}),t.length!==0){Iu();for(let r=0;r<t.length;r+=1){const a=t[r];a&&Ou(a)}}}const Lu={selects:wc,tierPrices:Eu,navToggle:()=>{Rc()},rowActions:Vc,massactions:Qc,paging:sl,activeFilters:El,categoryTree:Md,pageActions:()=>{},skuCopy:qd,productTypeBadge:Hd,gridCopy:()=>{Yd(),Qd()},storeViews:eu,configButtons:nu,errorMarkup:mu,optionsCompanion:fu,optionsItems:gu,assocBulk:ku,ppCatalog:gs,ppScan:Ac};function Nu(t){return{ok:!1,reason:"Writing to the page is paused."}}const Ru=3,oi=['select[name="product[attribute_set_id]"]','select[name="attribute_set_id"]',"select#attribute_set_id"].join(", "),Pu=['[name="attribute-set-name"]',"#attribute-set-name",'[name="attribute_set_name"]','[id$="attribute-set-name" i]'].join(", ");function Mu(t){return t?t instanceof HTMLSelectElement?yr(t)||F(t.value):t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement?F(t.value)||F(t.defaultValue):F(t.textContent):""}const Du=['[data-role="affected-attribute-set-selector"]',".affected-attribute-set","#choose-affected-attribute-set"].join(", "),Uu=[".admin__modal",'[data-role="modal"]',".modal-slide",".modal-popup",".ui-dialog"].join(", ");function Bu(t){return!!(t!=null&&t.closest(Uu))}function X(t){return!!(t!=null&&t.closest(Du))||Bu(t)}function qu(t){let e=t;for(let n=0;n<6&&e;n+=1){if(/attribute[_-]?set/i.test(`${e.id} ${e.className}`))return!0;e=e.parentElement}return!1}function $u(){const t=Array.from(document.querySelectorAll('[aria-selected="true"], [aria-checked="true"], option:checked'));for(const e of t){if(e instanceof HTMLOptionElement&&!e.selected||X(e)||!qu(e))continue;const n=pe(e.textContent);if(n)return n}return""}const Hu=/^(categories|categorias|categorías|catégories|kategorien)$/i,Vu=["#product-categories",'[data-role="product-categories"]',".category-tree",".categories-tree","#category-tree"].join(", "),Fu=['input[type="checkbox"][name="category_ids[]"]','input[type="checkbox"][name="product[categories][]"]','input[type="checkbox"][name="product[category_ids][]"]','input[type="checkbox"][name="add_category_ids[]"]',"input.category-checkbox",'input[type="checkbox"][name*="categor" i]'];function zu(t){const e=/(?:^|[^A-Za-z0-9])[\s>_:.-]*PP\s*[-_ ]?(\d{1,6})(?!\d)/i.exec(t??"");return(e==null?void 0:e[1])??""}function F(t){return(t??"").replace(/\s+/g," ").trim()}function ii(t){return F(t).replace(/\s*\((?:global|store view|website|all store views)\)\s*$/i,"").replace(/\s*\[[^\]]*\]\s*$/g,"").replace(/\s*\*+\s*$/,"").trim()}function yr(t){const e=t.options[t.selectedIndex],n=F(e==null?void 0:e.textContent)||F(e==null?void 0:e.value);return/^(select\.{0,3}|--\s*please select\s*--|-)$/i.test(n)?"":n}function Gu(t){const e=t.querySelector(".admin__field-control")??t.querySelector('[data-role="field-value"]');return e?vr(e):""}const si=/^(?:attribute\s*set|conjunto\s+de\s+atributos|jeu\s+d'?attributs)\s*:?\s*$/i,ju=['[data-index="attribute_set_id"]','[data-index="attribute-set-name"]',".field-attribute_set_id",".field-attribute-set-name"].join(", "),Zu=/^(?:all options|all|any|none|no|yes|select\.{0,3}|--\s*please select\s*--|please select(?:\s+\w+)*|choose(?:\s+\w+)*|all store views|all websites|-+|—|–)\s*:?\s*$/i;function vr(t){const e=t.cloneNode(!0);return e.querySelectorAll('input, select, textarea, button, script, style, [class*="mhx-"]').forEach(n=>n.remove()),F(e.textContent)}function ci(t){const e=t.matches("input, textarea")?t:t.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');return e&&F(e.value)?F(e.value):vr(t)}function pe(t){const e=F(t).replace(/^(?:attribute\s*set|conjunto\s+de\s+atributos|jeu\s+d'?attributs)\s*[:\-–]?\s*/i,"").replace(/\s+(?:change|alterar|editar|modifier|ändern)$/i,"").trim();if(!e||Zu.test(e)||/^(?:attribute\s*set|conjunto\s+de\s+atributos|jeu\s+d'?attributs)$/i.test(e)||e.length>200)return"";const n=e.match(/AS>PP/gi);return n&&n.length>1||Wu(e)?"":e}function Ku(){const t=Array.from(document.querySelectorAll(".admin__field-label, label, dt, th, span, div, strong")).filter(n=>n.children.length===0&&si.test(ii(n.textContent))),e=[];for(const n of t){if(X(n))continue;const r=n.parentElement;if(!r)continue;const a=n.closest(".admin__field, .field, fieldset, tr")??r,o=[n.nextElementSibling,r.nextElementSibling,a.querySelector('.admin__field-value, [data-role="field-value"]'),a.querySelector(".admin__field-control"),r];for(const i of o){if(!i||i.contains(n)||i.matches("a, button")||X(i))continue;const s=pe(ci(i));s&&e.push(s)}}return e.find(n=>/AS>|PP\s*\d/i.test(n))??e[0]??""}function Wu(t){if(!t)return!1;const e=t.trim();if(/^Attribute\s+Set\s+/i.test(e)){const n=e.match(/AS>PP/gi);return n!==null&&n.length>1}return!1}function Yu(t){const e=Array.from(document.querySelectorAll(".admin__field-label, .admin__field-label span, label, th.label, .label"));for(const n of e){if(X(n))continue;const r=ii(n.textContent);if(!t.test(r))continue;const a=n.closest(".admin__field, .field, tr, fieldset")??n.parentElement;if(!a)continue;const o=a.querySelector("select");if(o&&!X(o)){const l=pe(yr(o));if(l)return l}const i=a.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])');if(i&&!X(i)){const l=pe(i.value);if(l)return l}const s=a.querySelector('input[type="hidden"]');if(s&&!X(s)){const l=pe(s.value);if(l)return l}const c=pe(Gu(a));if(c)return c}return""}function Xu(){for(const a of Array.from(document.querySelectorAll(Pu))){if(X(a))continue;const o=pe(Mu(a));if(o)return o}const t=document.querySelector(oi);if(t&&!X(t)){const a=pe(yr(t)||F(t.value));if(a)return a}const e=document.querySelector('input[name="product[attribute_set_id]"], input[name="attribute_set_id"]');if(e&&!X(e)&&F(e.value)){const a=document.querySelector(`[data-attribute-set-id="${CSS.escape(e.value)}"]`);if(a&&!X(a)){const o=pe(vr(a));if(o)return o}}for(const a of Array.from(document.querySelectorAll(ju))){if(X(a))continue;const o=a.querySelector('.admin__field-value, [data-role="field-value"], .admin__field-control')??a,i=pe(ci(o));if(i)return i}const n=Ku();if(n)return n;const r=Yu(si);return r||$u()}function Ju(){const t=document.querySelector('input[name="attribute-set-id"], input#attribute-set-id');if(t&&!X(t)&&F(t.value))return F(t.value);const e=document.querySelector(oi);if(e&&!X(e)&&F(e.value))return F(e.value);const n=document.querySelector('input[name="product[attribute_set_id]"], input[name="attribute_set_id"]');return n&&!X(n)?F(n.value):""}function Cr(){const t=new Set,e=Array.from(document.querySelectorAll(Vu));for(const n of e)n.querySelectorAll('input[type="checkbox"]').forEach(r=>t.add(r));for(const n of Fu)document.querySelectorAll(n).forEach(r=>t.add(r));return Array.from(t)}function Qu(t){const e=t.querySelector(":scope > label");if(e){const r=F(e.textContent).replace(/^\s*\*+\s*/,"");if(r)return r}const n=t.cloneNode(!0);return n.querySelectorAll('ul, ol, input, select, textarea, button, script, style, [class*="mhx-"], .admin__field-error, .tooltip').forEach(r=>r.remove()),F(n.textContent).replace(/^[\s>*•·\-–—]+/,"")}function em(t){var a,o;let e=t.closest("li");if(!e)return[];const n=[],r=new Set;for(;e&&!r.has(e);){r.add(e),n.unshift(e);const i=((a=e.parentElement)==null?void 0:a.closest("li"))??null;if(i&&i!==e){e=i;continue}const s=((o=e.parentElement)==null?void 0:o.previousElementSibling)??null;e=s instanceof HTMLLIElement?s:null}return n}function tm(t){const e=[],n=[];for(const r of em(t)){const a=Qu(r);if(!a)continue;e.push(a);const o=r.querySelector(':scope > input[type="checkbox"], :scope > label > input[type="checkbox"]');n.push((o==null?void 0:o.value)??"")}return{path:e,ids:n}}function li(t){const e=new Set,n=[];for(const r of t){const a=r.path.map(i=>F(i)).filter(Boolean);if(a.length===0)continue;const o=a.join(" > ").toLowerCase();e.has(o)||(e.add(o),n.push({path:a,ids:r.ids.slice(0,a.length)}))}return n.sort((r,a)=>a.path.length-r.path.length)}function nm(){const t=document.querySelector('a[href="#product_info_tabs_categories"], a#product_info_tabs_categories, a[href="#product_info_tabs_categories_content"]');if(t)return t;const e=Array.from(document.querySelectorAll('.admin__page-nav-link, [role="tab"], .tabs a, .ui-tabs-anchor, a'));for(const n of e)if(Hu.test(F(n.textContent))&&n.closest('.admin__page-nav, [role="tablist"], .tabs, .ui-tabs'))return n;return null}async function di(t,e){const n=Date.now();for(;Date.now()-n<e;){if(t())return!0;await new Promise(r=>setTimeout(r,100))}return t()}const ui='#product_form, .product-edit, [data-ui-id="product-form"], form[data-role="product-form"]';function rm(){return/\/catalog\/product\/edit(\/|$)/i.test(location.pathname)?!0:document.querySelector(ui)!==null}async function am(){const t=['input[name="product[price]"]',"input#price",'select[name="product[status]"]',"select#status",'input[name="product[status]"]','input[name="product[sku]"]','input[name="product[name]"]','input[name="attribute-set-name"]','select[name="product[attribute_set_id]"]'].join(", "),e=()=>document.readyState!=="loading"&&document.querySelector(ui)!==null&&document.querySelector(t)!==null;e()||await di(e,8e3)}function mi(){const t=document.querySelectorAll('select[name*="categor" i], select[id*="categor" i]'),e=[];for(const n of t){const r=n.selectedOptions.length>0?Array.from(n.selectedOptions):Array.from(n.options).filter(a=>a.selected);for(const a of r){const o=F(a.textContent);o&&e.push({path:[o],ids:a.value?[a.value]:[]})}}return li(e)}async function om(t={}){if(!rm())return null;await am();const e=Xu();let n=Cr(),r=mi(),a="";if(n.length===0&&r.length===0&&t.activateCategoryTab){const d=nm();if(d){d.click();const u=await di(()=>Cr().length>0,4e3);n=Cr(),r=mi(),u||(a="the Categories tab did not load its tree")}else a="no Categories tab was found on this page"}else n.length===0&&r.length===0&&(a="the category selector is not loaded in this tab");const o=li(n.filter(d=>d.checked).map(tm)),i=o.length>0?o:r,s=i.map(d=>d.path),c=i.map(d=>d.ids),l=o.length>0||r.length>0||n.length>0;return l&&s.length===0&&!a&&(a="no category is checked"),!e&&!l?null:{factsVersion:1,attributeSet:e,attributeSetId:Ju(),ppCode:zu(e),categoryPaths:s,categoryIds:c,categoryRead:l,categoryReason:a||void 0,tierPrices:[],tierRead:!1,tierReason:"tier prices are read by the full admin facts pass",priceRead:!1,price:{price:null,specialPrice:null,cost:null,taxClass:""},stockRead:!1,stock:{qty:null,isInStock:null,backorders:""},visibilityRead:!1,visibility:"",statusRead:!1,status:"",websitesRead:!1,websites:[],weightRead:!1,weight:null,readAt:new Date().toISOString()}}const im=/^tier_price\[(\d+)\]\[([a-z_]+)\]$/i,sm=/advanced\s*pric|pre[cç]o\s+avan[cç]ado|precios\s+avanzados|prix\s+avanc|prezzo\s+avanzato/i,pi='input[name="product[price]"], input#price',hi='input[name="product[special_price]"], input#special_price',fi='input[name="product[cost]"], input#cost',gi='select[name="product[tax_class_id]"], select#tax_class_id',xi=['input[name="product[quantity_and_stock_status][qty]"]','input[name="product[qty]"]',"input#inventory_qty"].join(", "),bi=['select[name="product[quantity_and_stock_status][is_in_stock]"]',"select#inventory_is_in_stock"].join(", "),Ai=['select[name="product[stock_data][backorders]"]',"select#backorders"].join(", "),Si='select[name="product[visibility]"], select#visibility',Ei='select[name="product[status]"], select#status',yi='input[name="product[weight]"], input#weight',vi=['input[name="product[website_ids][]"]','#website_ids input[type="checkbox"]'].join(", ");function sn(t){const e=(t??"").trim();if(!e)return null;let n=e.replace(/[^\d.,-]/g,"");if(!n)return null;const r=n.lastIndexOf(","),a=n.lastIndexOf(".");r>=0&&a>=0?r>a?n=n.replace(/\./g,"").replace(",","."):n=n.replace(/,/g,""):r>=0&&(n=n.length-r-1===3?n.replace(/,/g,""):n.replace(",","."));const o=Number(n);return Number.isFinite(o)?o:null}function ae(t){return(t??"").replace(/\s+/g," ").trim()}function Xe(t){const e=document.querySelector(t);if(!e)return"";if(e instanceof HTMLSelectElement){const n=e.options[e.selectedIndex];return ae(n==null?void 0:n.textContent)||ae(e.value)}return ae(e.value)}function Et(t){return sn(Xe(t))}function ce(t){return document.querySelector(t)!==null}function Tr(){return Array.from(document.querySelectorAll('input[name^="tier_price["], select[name^="tier_price["]')).map(e=>{if(e instanceof HTMLSelectElement){const n=e.options[e.selectedIndex];return{name:e.name,value:e.value,text:ae(n==null?void 0:n.textContent)}}return{name:e.name,value:e.value}})}function cm(t){var r,a,o,i,s,c,l,d;const e=new Map;for(const u of t){const m=im.exec(u.name);if(!m)continue;const p=Number.parseInt(m[1]??"",10),x=m[2];if(!Number.isFinite(p)||!x)continue;const g=e.get(p)??{};g[x]=u,e.set(p,g)}const n=[];for(const u of[...e.keys()].sort((m,p)=>m-p)){const m=e.get(u);if(!m)continue;const p=sn((r=m.price_qty)==null?void 0:r.value);if(p===null||p<=0)continue;const x=ae((a=m.value_type)==null?void 0:a.value).toLowerCase(),g=sn((o=m.percentage_value)==null?void 0:o.value),f=sn((i=m.price)==null?void 0:i.value),A=x==="percent"||!x&&g!==null?"percent":"fixed",w=A==="percent"?g:f;w!==null&&n.push({qty:p,valueType:A,value:w,website:ae((s=m.website_id)==null?void 0:s.text)||ae((c=m.website_id)==null?void 0:c.value),group:ae((l=m.cust_group)==null?void 0:l.text)||ae((d=m.cust_group)==null?void 0:d.value)})}return n}function lm(){const t=Array.from(document.querySelectorAll('.fieldset-wrapper-title, .admin__collapsible-title, [data-role="collapsible-title"], .admin__page-nav-title'));for(const e of t)if(sm.test(ae(e.textContent)))return e;return document.querySelector('[data-index="advanced_pricing"]')}function dm(t,e){return new Promise(n=>{const r=Date.now(),a=()=>{if(t())return n(!0);if(Date.now()-r>=e)return n(!1);setTimeout(a,100)};a()})}async function um(t){let e=Tr();if(e.length>0)return{section:!0,inputs:e};const n=lm();return n?(t&&(n.click(),await dm(()=>Tr().length>0,1500),e=Tr()),{section:!0,inputs:e}):{section:!1,inputs:[]}}function mm(){return{price:Et(pi),specialPrice:Et(hi),cost:Et(fi),taxClass:Xe(gi)}}function pm(t){const e=ae(t).toLowerCase();return e?e==="1"||e.startsWith("in stock")?!0:e==="0"||e.startsWith("out of stock")?!1:null:null}function hm(){return{qty:Et(xi),isInStock:pm(Xe(bi)),backorders:Xe(Ai)}}function fm(){return Xe(Si)}function gm(){const t=Xe(Ei);if(t)return t;const e=document.querySelector('input[name="product[status]"], input#status');if(e){if(e.type==="checkbox")return e.checked?"Enabled":"Disabled";if(e.value==="1")return"Enabled";if(e.value==="0")return"Disabled"}return""}function xm(t){const e=t.closest("label")??(t.id?document.querySelector(`label[for="${CSS.escape(t.id)}"]`):null);return ae(e==null?void 0:e.textContent).replace(/\s*\*+\s*$/,"")}function bm(){const e=Array.from(document.querySelectorAll(vi)).filter(n=>n.checked).map(n=>xm(n)||ae(n.value)).filter(Boolean);return[...new Set(e)]}async function Am(t={}){const e=await om(t);if(!e)return null;const n=await um(!!t.expandPricing);let r="";return n.section?n.inputs.length===0&&(r="the Advanced Pricing section is present but has no tier rows yet"):r="the Advanced Pricing section is not on this page",{...e,factsVersion:Ru,tierPrices:cm(n.inputs),tierRead:n.section,tierReason:r||void 0,priceRead:ce(pi)||ce(hi)||ce(fi)||ce(gi),price:mm(),stockRead:ce(xi)||ce(bi)||ce(Ai),stock:hm(),visibilityRead:ce(Si),visibility:fm(),statusRead:ce(Ei),status:gm(),websitesRead:ce(vi),websites:bm(),weightRead:ce(yi),weight:Et(yi),readAt:new Date().toISOString()}}function Sm(t){return new Promise(e=>setTimeout(e,t))}async function Em(t){var a;const e=t.classList.contains("admin__collapsible-block-wrapper")?t:t.closest(".admin__collapsible-block-wrapper"),n=e==null?void 0:e.querySelector(".admin__collapsible-title");n==null||n.click();const r=Date.now();for(;Date.now()-r<2500;){const o=(a=St())==null?void 0:a.querySelector("table");if(o&&o.querySelectorAll("tbody tr").length>0)return;await Sm(150)}}const ym='a[href*="/catalog/product/edit/id/"]';function Ae(t,e){var r;if(!t)return"";const n=t[e]??((r=t.data)==null?void 0:r[e]);return n==null?"":String(n).replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").trim()}function Ci(t){return Ae(t,"entity_id")||Ae(t,"id")}function Ti(t){if(t==null)return"";if(typeof t=="boolean")return t?"Enabled":"Disabled";const e=String(t).replace(/<[^>]*>/g,"").trim();return e?/^(1|true|enabled|enable|active)$/i.test(e)?"Enabled":/^(2|false|disabled|disable|inactive)$/i.test(e)?"Disabled":e:""}function vm(t){const e=Ti(t);if(e==="Enabled")return!0;if(e==="Disabled")return!1}const wi=/mui[\\/]+index[\\/]+render[\\/]+key[\\/]+([a-f0-9]{16,})/,Cm="mhx:adminkey";function _i(){var e;const t=((e=location.pathname.match(/^(\/[^/]+\/)/))==null?void 0:e[1])??"/";return`${Cm}:${location.origin}${t}`}function Tm(){const t=document.querySelectorAll("script");for(const n of t){const r=n.textContent??"";if(!r.includes("render"))continue;const a=wi.exec(r);if(a!=null&&a[1])return a[1]}const e=document.querySelectorAll("[data-mage-init], [data-bind], [data-role]");for(const n of e)for(const r of Array.from(n.attributes)){if(!r.value.includes("render"))continue;const a=wi.exec(r.value);if(a!=null&&a[1])return a[1]}return""}async function wm(){try{const t=_i(),e=(await chrome.storage.local.get([t]))[t];return typeof e=="string"?e:""}catch{return""}}async function _m(t){if(t)try{await chrome.storage.local.set({[_i()]:t})}catch{}}function Om(t){var a;const e=((a=location.pathname.match(/^(\/[^/]+\/)/))==null?void 0:a[1])??"/",n=`${location.origin}${e}mui/index/render`,r=[];for(const o of t){const i=`${n}/key/${o}/`;o&&!r.includes(i)&&r.push(i)}return r.push(`${n}/`),r}function Im(t,e){var n;try{const r=JSON.parse(t),a=r.items??((n=r.data)==null?void 0:n.items)??[];return r.error&&a.length===0?{items:[],error:`Grid rejected the filter: ${r.message??"no message"}`,status:e}:{items:a,error:"",status:e}}catch{return{items:[],error:`Grid returned non-JSON (status ${e}) - the admin session may have expired`,status:e}}}function km(){var n;const t=document.querySelector('select#status, select[name="product[status]"]');if(t){const r=(((n=t.options[t.selectedIndex])==null?void 0:n.text)??"").trim();if(r)return/disab|inactiv|desactiv/i.test(r)?"Disabled":"Enabled"}const e=document.querySelector('input[name="product[status]"], input#status');if(e){if(e.type==="checkbox")return e.checked?"Enabled":"Disabled";if(e.value==="1")return"Enabled";if(e.value==="0")return"Disabled"}return""}function Lm(){const t=document.querySelector('input[name="product[type_id]"], input[name="type"], [data-form-part="product_form"][name*="type_id"]'),e=((t==null?void 0:t.value)??"").toLowerCase().trim();return e.includes("config")?"configurable":e}function wr(){const t=document.querySelector('input[name="form_key"]');if(t!=null&&t.value)return t.value;const e=window;return typeof e.FORM_KEY=="string"?e.FORM_KEY:""}async function _r(t){var l;const e=[];let n={items:[],error:"",status:0};const r=Tm();r&&await _m(r);const a=((l=location.href.match(/\/key\/([a-f0-9]{16,})\//))==null?void 0:l[1])??"",o=[r,await wm(),a].filter(Boolean),i=Om(o);for(const d of i)try{const u=await fetch(`${d}?isAjax=true`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8","X-Requested-With":"XMLHttpRequest",Accept:"application/json"},body:t.toString()}),m=Im(await u.text(),u.status);if(!m.error)return m;n=m,e.push(m.error)}catch(u){n={items:[],error:u.message,status:0},e.push(n.error)}const s=[...new Set(e.filter(Boolean))],c=r||o.length>1?"":"no admin grid key on this page - the admin session may be signed out; ";return{items:n.items,error:c+(s.join(" / ")||"the admin grid could not be queried"),status:n.status}}async function Nm(t,e){const n=new URLSearchParams;return n.append("namespace","product_listing"),n.append("form_key",wr()),n.append("filters[placeholder][]","true"),n.append("filters[sku]",t),n.append("paging[pageSize]",String(e)),n.append("paging[currentPage]","1"),n.append("sorting[field]","entity_id"),n.append("sorting[direction]","asc"),_r(n)}async function Rm(t){if(t.length===0)return{items:[],error:"",status:200};const e=t.map(o=>Number(o)).filter(o=>Number.isFinite(o)&&o>0);if(e.length===0)return{items:[],error:"",status:200};const n=Math.min(...e),r=Math.max(...e);if(r-n>500)return{items:[],error:"Range too wide",status:200};const a=new URLSearchParams;return a.append("namespace","product_listing"),a.append("form_key",wr()),a.append("filters[placeholder][]","true"),a.append("filters[entity_id][from]",String(n)),a.append("filters[entity_id][to]",String(r)),a.append("paging[pageSize]",String(Math.max(100,e.length+10))),a.append("paging[currentPage]","1"),a.append("sorting[field]","entity_id"),a.append("sorting[direction]","asc"),_r(a)}async function Oi(t,e=!1){var m,p,x,g,f,A,w;const n=location.pathname.match(/\/catalog\/product\/edit\/id\/(\d+)/);if(!n)return{children:[],reason:"open the parent product edit page to read every child"};if(t&&n[1]!==t)return{children:[],reason:`product ${t} is not the one open in this tab`};const r=St();if(!r)return{children:[],reason:"no Configurations section on this page"};if(Ho(r)){if(!e)return{children:[],reason:"Configurations section is collapsed - expand it and resolve again"};await Em(r)}const a=r.querySelector("table.admin__dynamic-rows, table.data-grid, table");if(!a)return{children:[],reason:"no configuration rows yet"};const o=Array.from(a.querySelectorAll("thead th")).map(I=>(I.textContent??"").trim().toLowerCase()),i=(...I)=>o.findIndex(N=>I.some(O=>N.includes(O))),s=i("attribute"),c=i("sku"),l=i("status"),d=s>=0?s:7,u=[];for(const I of Array.from(a.querySelectorAll("tbody tr"))){if(I.classList.contains("empty-text")||I.classList.contains("data-grid-tr-no-data"))continue;const N=Array.from(I.querySelectorAll("td"));if(N.length===0)continue;const O=(((m=N[d])==null?void 0:m.textContent)??"").trim(),h=((x=(p=O.match(/(?:colou?r|cor)\s*:\s*([^,]+)/i))==null?void 0:p[1])==null?void 0:x.trim())??"",b=((f=(g=O.match(/(?:size|talla|tamanho|taille)\s*:\s*([^,]+)/i))==null?void 0:g[1])==null?void 0:f.trim())??"",C=I.querySelector(ym),R=((A=C==null?void 0:C.href.match(/\/edit\/id\/(\d+)/))==null?void 0:A[1])??"";if(!R)continue;const M=c>=0?N[c]:void 0,$=(M==null?void 0:M.querySelector("input, textarea"))??I.querySelector('input[name*="[sku]"], [data-index="sku"] input'),H=($?$.value:(M==null?void 0:M.textContent)??"").trim(),T=l>=0?N[l]:void 0,B=T==null?void 0:T.querySelector("select"),_=(B?((w=B.options[B.selectedIndex])==null?void 0:w.text)??"":(T==null?void 0:T.textContent)??"").trim(),W=_?!/disab|inactiv|desactiv/i.test(_):void 0;u.push({id:R,sku:H,color:h,size:b,backend:(C==null?void 0:C.href)??"",enabled:W})}return u.length===0?{children:[],reason:"configuration rows are present but none could be read"}:{children:u,reason:""}}const Ii=200;async function Pm(t){const e=new URLSearchParams;return e.append("namespace","product_listing"),e.append("form_key",wr()),e.append("filters[placeholder][]","true"),e.append("filters[parent_sku]",t),e.append("paging[pageSize]",String(Ii)),e.append("paging[currentPage]","1"),e.append("sorting[field]","entity_id"),e.append("sorting[direction]","asc"),_r(e)}function Mm(t,e,n){if(t.length===0||t.length>=Ii)return null;const r=e.trim().toUpperCase(),a=t.filter(i=>{const s=Ae(i,"parent_sku").toUpperCase();return s===""||s===r}),o=Or(a,n);return o.length>0?o:null}function Or(t,e,n,r){var c;const a=e.trim().toUpperCase(),o=n&&n.length>0?new Set(n):null,i=(r??"").trim().toUpperCase(),s=[];for(const l of t){const d=Ae(l,"sku");if(!d||d.toUpperCase()===a||!o&&i&&!d.toUpperCase().startsWith(i))continue;const u=Ci(l);u&&(o&&!o.has(u)||s.push({id:u,sku:d,color:"",size:"",backend:"",enabled:vm(l.status??((c=l.data)==null?void 0:c.status))}))}return s}async function Dm(t,e,n,r=!1,a=!1){var N,O;const o=location.pathname.match(/\/catalog\/product\/edit\/id\/(\d+)/),i=o==null?void 0:o[1],s=je();if(i&&(n&&i===n||!n&&s&&s.toUpperCase()===t.toUpperCase())){const h=n||i,b=await Oi(h,r),C=a?await Am({activateCategoryTab:r,expandPricing:r}):null;if(b.children.length>0||C)return{found:!0,productId:h,sku:s||t,status:km(),productType:Lm()||(b.children.length>0?"configurable":""),children:b.children,childrenReason:b.children.length>0?"":b.reason,magentoFacts:C??void 0}}const l=t.replace(/[-_\s]?[A-Za-z]+$/,"");let d=[],u="";if(e&&e.length>0){const h=await Rm(e),b=Or(h.items,t,e);b.length>0?(d=b,u="child rows read from the product grid by entity id"):h.error&&(u=`grid lookup by child id failed: ${h.error}`)}const m=[t];l&&l!==t&&m.push(l);const p=(N=/(\d{4,})/.exec(t))==null?void 0:N[1];p&&!m.includes(p)&&m.push(p);const x=l||t;let g,f=[],A="";for(const h of m){const b=await Nm(h,100);f.length===0&&(f=b.items),b.error&&!A&&(A=b.error);const C=b.items.find(R=>Ae(R,"sku").toUpperCase()===h.toUpperCase());if(C){g=C;break}if(d.length===0){const R=Or(b.items,t,void 0,x);R.length>0&&(d=R,u=`child rows read from the product grid via "${h}"`)}}const w=g?Ci(g):"";if(w&&d.length===0){const h=Ae(g,"sku");if(h){const b=await Pm(h),C=Mm(b.items,h,t);C?(d=C,u=`child rows read from the product grid by parent SKU ${h}`):u=b.error?`parent SKU query failed: ${b.error}`:`no child rows came back for parent SKU ${h} (${b.items.length} row(s) returned)`}}if(w&&d.length===0){const h=await Oi(w,r);h.children.length>0?(d=h.children,u=""):u||(u=h.reason)}if(w||d.length>0)return{found:!0,productId:w,sku:Ae(g,"sku")||t,status:Ti((g==null?void 0:g.status)??((O=g==null?void 0:g.data)==null?void 0:O.status)),productType:Ae(g,"type_id"),children:d,childrenReason:u};if(A&&f.length===0)return{found:!1,error:A};const I=f.map(h=>Ae(h,"sku")).filter(Boolean).slice(0,6).join(", ");return{found:!1,error:I?`SKU "${t}" has no exact row in the admin grid; the like-filter returned: ${I}.`:`SKU "${t}" not found in the admin grid.`}}let Je;function Ir(t={}){const e=Is();if((!e.extensionEnabled||!e.ppCatalog)&&oa(),!e.extensionEnabled){wn();return}const n=Os(document);(!Je||n.length!==Je.length||n.some((a,o)=>a!==(Je==null?void 0:Je[o])))&&(Je=n,chrome.storage.local.set({detectedFeatures:n}));const r=(a,o)=>{try{o()}catch(i){console.warn(`[BOG Helper] scan step "${a}" failed:`,i)}};for(const a of kt){const o=a.id;if(o!=="extensionEnabled"){if(!e[o]){o==="ppScan"&&wn();continue}o==="categoryTree"&&t.categoryTreeChanged===!1||r(o,Lu[o])}}}const kr='ul[data-mhx-cat-tree="1"], .category-tree, [id="category_ids"], .categories-side-col, [id="add-products-to-category-content"], .store-tree';function Lr(t){return t instanceof Element?t.id.startsWith("mhx-")?!0:Array.from(t.classList).some(e=>e.startsWith("mhx-")):!1}function Um(t){const e=Array.from(t.addedNodes),n=Array.from(t.removedNodes);return t.target instanceof Element&&Lr(t.target)?[...e,...n].every(r=>!(r instanceof Element)||Lr(r)):e.length>0&&n.length===0&&e.every(Lr)}function Bm(t){const e=t.target instanceof Element?t.target:t.target.parentElement;return e!=null&&e.closest(kr)?!0:[...t.addedNodes,...t.removedNodes].some(n=>n instanceof Element?n.matches(kr)||n.querySelector(kr)!==null:!1)}const qm={matches:["https://bestofgifts-pt-qa.toogas.net/*","https://bestofgifts.pt/*","https://bestofgifts.eu/*","https://bestofgifts.es/*","https://bestofgifts.fr/*"],runAt:"document_idle",async main(){const t=window;if(t.__mhxContentLoaded)return;t.__mhxContentLoaded=!0,Le(),oc(),fc(),await sa(),Ir(),ks(()=>Ir());let e,n=!1;new MutationObserver(r=>{const a=r.filter(o=>!Um(o));a.length!==0&&(n||(n=a.some(Bm)),window.clearTimeout(e),e=window.setTimeout(()=>{Ir({categoryTreeChanged:n}),n=!1},200))}).observe(document.body,{childList:!0,subtree:!0}),chrome.runtime.onMessage.addListener((r,a,o)=>{const i=r==null?void 0:r.type;if(i==="GET_FORM_STATE"){const s=Hs(Ns(location.href)),c=Ge(location.href)?{available:!0,state:s}:{available:!1,reason:"Open a Magento product edit page (admin) to fill fields."};return o(c),!1}if(i==="APPLY_FIELD")return o(Nu()),!1;if(i==="GET_CONFIG")return o(Go()),!1;if(i==="GET_SKU"){const s={sku:je()};return o(s),!1}if(i==="SEARCH_MAGENTO"){const s=r;return Dm(String(s.sku??""),s.childIds,s.parentId,!!s.expand,!!s.readFacts).then(o),!0}if(i==="ERROR_MARKUP"){const{matched:s,unmatched:c}=uu(r.errors??[]);return o({success:s>0||c===0,matched:s,unmatched:c}),!1}return!1})}};function cn(t,...e){}const $m={debug:(...t)=>cn(console.debug,...t),log:(...t)=>cn(console.log,...t),warn:(...t)=>cn(console.warn,...t),error:(...t)=>cn(console.error,...t)},dn=class dn extends Event{constructor(e,n){super(dn.EVENT_NAME,{}),this.newUrl=e,this.oldUrl=n}};q(dn,"EVENT_NAME",Rr("wxt:locationchange"));let Nr=dn;function Rr(t){var e;return`${(e=ee==null?void 0:ee.runtime)==null?void 0:e.id}:content:${t}`}function Hm(t){let e,n;return{run(){e==null&&(n=new URL(location.href),e=t.setInterval(()=>{let r=new URL(location.href);r.href!==n.href&&(window.dispatchEvent(new Nr(r,n)),n=r)},1e3))}}}const yt=class yt{constructor(e,n){q(this,"isTopFrame",window.self===window.top);q(this,"abortController");q(this,"locationWatcher",Hm(this));q(this,"receivedMessageIds",new Set);this.contentScriptName=e,this.options=n,this.abortController=new AbortController,this.isTopFrame?(this.listenForNewerScripts({ignoreFirstEvent:!0}),this.stopOldScripts()):this.listenForNewerScripts()}get signal(){return this.abortController.signal}abort(e){return this.abortController.abort(e)}get isInvalid(){return ee.runtime.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(e){return this.signal.addEventListener("abort",e),()=>this.signal.removeEventListener("abort",e)}block(){return new Promise(()=>{})}setInterval(e,n){const r=setInterval(()=>{this.isValid&&e()},n);return this.onInvalidated(()=>clearInterval(r)),r}setTimeout(e,n){const r=setTimeout(()=>{this.isValid&&e()},n);return this.onInvalidated(()=>clearTimeout(r)),r}requestAnimationFrame(e){const n=requestAnimationFrame((...r)=>{this.isValid&&e(...r)});return this.onInvalidated(()=>cancelAnimationFrame(n)),n}requestIdleCallback(e,n){const r=requestIdleCallback((...a)=>{this.signal.aborted||e(...a)},n);return this.onInvalidated(()=>cancelIdleCallback(r)),r}addEventListener(e,n,r,a){var o;n==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),(o=e.addEventListener)==null||o.call(e,n.startsWith("wxt:")?Rr(n):n,r,{...a,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),$m.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){window.postMessage({type:yt.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:Math.random().toString(36).slice(2)},"*")}verifyScriptStartedEvent(e){var o,i,s;const n=((o=e.data)==null?void 0:o.type)===yt.SCRIPT_STARTED_MESSAGE_TYPE,r=((i=e.data)==null?void 0:i.contentScriptName)===this.contentScriptName,a=!this.receivedMessageIds.has((s=e.data)==null?void 0:s.messageId);return n&&r&&a}listenForNewerScripts(e){let n=!0;const r=a=>{if(this.verifyScriptStartedEvent(a)){this.receivedMessageIds.add(a.data.messageId);const o=n;if(n=!1,o&&(e!=null&&e.ignoreFirstEvent))return;this.notifyInvalidated()}};addEventListener("message",r),this.onInvalidated(()=>removeEventListener("message",r))}};q(yt,"SCRIPT_STARTED_MESSAGE_TYPE",Rr("wxt:content-script-started"));let Pr=yt;const Vm=Symbol("null");let Fm=0;class zm extends Map{constructor(...e){super(),this._objectHashes=new WeakMap,this._symbolHashes=new Map,this._publicKeys=new Map;const[n]=e;if(n!=null){if(typeof n[Symbol.iterator]!="function")throw new TypeError(typeof n+" is not iterable (cannot read property Symbol(Symbol.iterator))");for(const[r,a]of n)this.set(r,a)}}_getPublicKeys(e,n=!1){if(!Array.isArray(e))throw new TypeError("The keys parameter must be an array");const r=this._getPrivateKey(e,n);let a;return r&&this._publicKeys.has(r)?a=this._publicKeys.get(r):n&&(a=[...e],this._publicKeys.set(r,a)),{privateKey:r,publicKey:a}}_getPrivateKey(e,n=!1){const r=[];for(const a of e){const o=a===null?Vm:a;let i;if(typeof o=="object"||typeof o=="function"?i="_objectHashes":typeof o=="symbol"?i="_symbolHashes":i=!1,!i)r.push(o);else if(this[i].has(o))r.push(this[i].get(o));else if(n){const s=`@@mkm-ref-${Fm++}@@`;this[i].set(o,s),r.push(s)}else return!1}return JSON.stringify(r)}set(e,n){const{publicKey:r}=this._getPublicKeys(e,!0);return super.set(r,n)}get(e){const{publicKey:n}=this._getPublicKeys(e);return super.get(n)}has(e){const{publicKey:n}=this._getPublicKeys(e);return super.has(n)}delete(e){const{publicKey:n,privateKey:r}=this._getPublicKeys(e);return!!(n&&super.delete(n)&&this._publicKeys.delete(r))}clear(){super.clear(),this._symbolHashes.clear(),this._publicKeys.clear()}get[Symbol.toStringTag](){return"ManyKeysMap"}get size(){return super.size}}new zm;function rp(){}function ln(t,...e){}const Gm={debug:(...t)=>ln(console.debug,...t),log:(...t)=>ln(console.log,...t),warn:(...t)=>ln(console.warn,...t),error:(...t)=>ln(console.error,...t)};return(async()=>{try{const{main:t,...e}=qm,n=new Pr("content",e);return await t(n)}catch(t){throw Gm.error('The content script "content" crashed on startup!',t),t}})()})();
content;
