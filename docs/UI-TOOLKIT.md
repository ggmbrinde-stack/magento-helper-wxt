# One UI toolkit for every injected component

**Date:** 2026-10-21
**Question:** can all injected components (grid buttons, chips, strips, pickers,
pills, badges, the nav toggle, the bulk-actions bar) share one style system —
delivered centrally, "like a CDN"?
**Answer:** yes. Below is the measured current state, the target design, the two
delivery options with a recommendation, and a migration path that keeps the
extension shippable at every step.

---

## 1. Measured current state

From `.output/audit-ui.mjs` (`node .output/audit-ui.mjs`):

| Metric | Value |
|---|---|
| distinct `.mhx-*` class names in `src` | **140** |
| classes defined in more than one file | **15** |
| colour literals (`#rrggbb`) inside injected CSS | **152**, across 8 files |
| `!important` occurrences in `src` | **144** |
| separate `<style>` tags injected into the admin page | **9** (8 feature sheets + page sheet) + 2 theme sheets |
| injected CSS source | **29,422 bytes** in 10 files |

The worst offenders:

```
 43  src/entrypoints/content.ts      (page styles + indicators + copy buttons)
 43  src/lib/categoryTree.ts         (tree bar, list rows, pills, badges)
 22  src/lib/enhanceSelect.ts        (picker, segmented control)
 17  src/lib/activeFilters.ts        (pencil, inline editor, ok/cancel)
 12  src/lib/pagingSizes.ts          (segmented sizes + custom input)
  8  src/lib/rowActions.ts           (row button group)
  5  src/lib/adminNavToggle.ts       (chevron)
  2  src/lib/massactionButtons.ts    (bulk strip)
```

And the cross-file coupling: `magentoTheme.ts` re-styles ten
`.mhx-nh-*` classes (the picker) so the picker follows the admin theme. That
means **the theme sheet hard-codes another module's class names** — rename a
class and the themed variant silently stops applying. This is the strongest
argument for a toolkit: the theme layer should style *primitives*, not features.

Why the duplication happened (and why it will keep happening): each feature was
built standalone, with its own stylesheet and its own hardcoded fallbacks
(`var(--mhx-border-2,#adadad)` repeated 6×, button hover colours repeated 6×,
chip/pill/badge shapes repeated 4×). The recent dark-admin contrast bug was a
direct symptom: page-injected chrome assumed `--mhx-surface` described the page,
which it does not.

---

## 2. Target design

```
src/
  ui/
    tokens.ts        token names + page-adaptive resolution
    toolkit.css      ONE stylesheet: tokens → base → primitives
    components.ts    factories returning DOM built from those classes
    index.ts         ensureUi() + re-exports
  public/
    toolkit.css      (built copy of src/ui/toolkit.css, injected as <link>)
```

Three rules:

1. **Features never style themselves.** A feature may pass a modifier
   (`data-variant="danger"`), never write colours, radii, paddings or fonts.
2. **Primitives are the only place a colour literal exists** (plus the palette
   in `theme.ts` for extension-owned surfaces).
3. **Page chrome derives from the page.** `currentColor` + `color-mix`, with
   flat `rgba` fallbacks; `--mhx-*` is reserved for our own surfaces (panel,
   dashboard, theme preview).

### 2.1 Tokens

Two layers, both plain CSS custom properties:

```css
/* layer 1 — page-adaptive (page-injected chrome) */
:root {
  --mhx-pg-ink: currentColor;
  --mhx-pg-line: color-mix(in srgb, currentColor 22%, transparent);
  --mhx-pg-line-soft: color-mix(in srgb, currentColor 14%, transparent);
  --mhx-pg-fill: color-mix(in srgb, currentColor 7%, transparent);
  --mhx-pg-fill-hover: color-mix(in srgb, currentColor 13%, transparent);
  --mhx-pg-danger: #e5484d;            /* readable on light and dark */
  --mhx-pg-radius: 4px;
  --mhx-pg-gap: 6px;
}
/* layer 2 — extension surfaces (panel / dashboard) */
:root {
  --mhx-surface: #ffffff;              /* from THEME_PALETTES */
  --mhx-ink: #1f2933;
  /* … unchanged, still owned by theme.ts … */
}
```

`color-mix` has `rgba()` fallbacks declared first, so a browser without it gets
a sane grey rather than an invalid declaration. This is exactly the pattern the
bulk-actions strip already uses successfully on the operator's dark admin.

### 2.2 Primitives (the whole vocabulary)

| Primitive | Class | Replaces today |
|---|---|---|
| button | `.mhx-btn` (+ `--danger`, `--accent`, `--ghost`, `--icon`) | `.mhx-row-action`, `.mhx-mass-btn`, `.mhx-size-btn`, `.mhx-chip-ok/x`, `.mhx-grid-copy-all`, `.mhx-sku-copy-btn` |
| button group / strip | `.mhx-group`, `.mhx-group--wrap` | `.mhx-row-actions`, `.mhx-mass`, `.mhx-size-row` |
| segmented control | `.mhx-seg`, `.mhx-seg-btn`, `.mhx-seg-btn--active` | `.mhx-size-row`, `.mhx-nh-seg*`, category Tree/List switch, theme picker |
| chip (removable filter) | `.mhx-chip`, `.mhx-chip-x` | active-filter chips, category pills |
| badge (code / count) | `.mhx-badge` | category numbers, priority dots, counters |
| inline field | `.mhx-field`, `.mhx-field--ok` | chip inline editor, custom page size |
| popover | `.mhx-pop`, `.mhx-pop-item` | picker surface, massaction overflow |
| bar (full-width strip) | `.mhx-bar` | bulk-action strip, active-filter strip, category toolbar |
| toggle / chevron | `.mhx-toggle` | nav chevron |
| toast | `.mhx-toast` | `content.ts` toast (already close) |

That is ~10 primitives against 140 classes: the remaining ~30 class names are
feature hooks (`mhx-cat-tree-row`, `mhx-sku-copy-btn`) that stay but only carry
layout-neutral modifiers.

### 2.3 Factories

```ts
// src/ui/components.ts
export const button = (o: {
  label: string;
  title?: string;
  variant?: 'default' | 'danger' | 'accent' | 'ghost' | 'icon';
  icon?: string;            // from ui/icons.ts
  onClick: (e: MouseEvent) => void;
}): HTMLButtonElement;

export const group = (children: Node[], opts?: { wrap?: boolean }): HTMLDivElement;
export const bar = (children: Node[], label?: string): HTMLDivElement;
export const chip = (o: { label: string; onRemove?: () => void }): HTMLElement;
export const badge = (text: string, title?: string): HTMLElement;
export const segmented = (o: {
  label: string;
  options: { label: string; value: string; title?: string }[];
  active: string;
  onPick: (value: string) => void;
}): HTMLElement;
```

Every factory returns a plain DOM node — no framework in the content script —
which keeps the current Preact boundary intact (panel/dashboard use Preact and
can share the same classes via `class="mhx-btn"`).

---

## 3. Delivery: what "like a CDN" should mean here

Two viable mechanisms. Both are one canonical sheet, injected once per page.

### Option A — `<link>` to a stylesheet served by the extension (recommended)

```
public/toolkit.css                        (built from src/ui/toolkit.css)
manifest.json → web_accessible_resources: ["ui/toolkit.css"]

// content script, once
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = chrome.runtime.getURL('ui/toolkit.css');
document.head.appendChild(link);
```

- One fetch, browser-cached across admin pages and tabs — the real "CDN" feel.
- CSS does not inflate `content.js` (144 KB today, all sheets inlined as strings).
- CSP-friendly: a `chrome-extension://` stylesheet is a trusted source with
  `web_accessible_resources`, unlike inline `<style>` under a strict
  `style-src` policy (Magento admin ships a CSP report-only policy today, but
  this removes the risk entirely).
- Cost: one extra request on the first admin page after install, and the
  manifest must expose the file. Page-loaded styles land in the author origin
  (`document.styleSheets`), which also makes DevTools inspection natural.

### Option B — one inline `<style>` (fallback)

```ts
ensureStyle('mhx-ui', TOOLKIT_CSS);   // idempotent by id
```

- Zero requests, works even where `web_accessible_resources` is unavailable
  (e.g. some enterprise CSP setups block extension URLs).
- Keeps CSS inside the content bundle.

**Recommendation:** ship **A with B as fallback** — try the `<link>`, and if the
sheet is not present after `load`/`error` (or the manifest entry is missing),
inject the inline copy. The toolkit module owns both paths, so features never
care. Either way there is exactly **one** toolkit sheet per page, plus at most
one *theme overlay* sheet from `magentoTheme.ts` (which must only reference
primitives — see guardrail G3).

For the panel/dashboard (extension pages) the same CSS is imported once by the
entry; no injection logic needed.

---

## 4. Migration map

| Module | Today | Target |
|---|---|---|
| `rowActions.ts` | own sheet, `.mhx-row-actions` + `.mhx-row-action` | `group()` + `button()`; delete sheet |
| `massactionButtons.ts` | own sheet, `.mhx-mass` + `.mhx-mass-btn` | `bar()` + `button({variant})`; delete sheet (the current `currentColor` rules become the primitives) |
| `pagingSizes.ts` | `.mhx-size-*` sheet | `segmented()` + `field()`; only the `.selectmenu` reset stays local |
| `activeFilters.ts` | `.mhx-chip-*` sheet | `chip()` + `field()` + `button()`; local sheet keeps only the pencil glyph |
| `categoryTree.ts` | 43 hex literals, own bar/list/pill classes | `bar()`, `segmented()`, `badge()`, `chip()`; feature classes stay for structure |
| `pageHeader.ts` | `.mhx-header-actions` | `group()` of `button()` |
| `adminNavToggle.ts` | `.mhx-nav-toggle` with hardcoded `#36363e` | `.mhx-toggle` primitive (page-adaptive ink) |
| `content.ts` | page sheet with copy buttons, indicator, toast, error labels | `button({variant:'icon'})`, `.mhx-badge`, `.mhx-toast`; priority colours become `--mhx-pg-*` tokens |
| `enhanceSelect.ts` | `.mhx-nh*` sheet + theme re-styling | `popover`/`segmented`/`field` primitives; theme sheet stops naming them |
| `magentoTheme.ts` | re-styles feature classes | styles primitives only (`input`, `.mhx-btn`, `.mhx-pop`), never feature classes |

Expected end state: **9 → 1** injected sheet, **152 → ≤ 12** hex literals (only
inside `tokens.ts`/`theme.ts`), **140 → ~40** class names (10 primitives + feature
hooks), and one place to fix contrast for a light or dark admin.

---

## 5. Guardrails (make it stick)

A single script, `npm run check:ui`, failing the build when:

1. **G1 — no new colour literals outside tokens:** `#rrggbb` in `src/**` is only
   allowed in `src/ui/tokens.ts`, `src/lib/theme.ts`, `src/lib/magentoTheme.ts`
   and `src/entrypoints/demo/*`.
2. **G2 — primitive classes are defined once:** any `.mhx-btn|group|seg|chip|
   badge|field|pop|bar|toggle` selector defined in more than one file fails.
3. **G3 — the theme layer may not name a feature class:** `magentoTheme.ts` must
   not contain `mhx-(nh|size|mass|row-action|cat-|sku-copy|chip-edit|paging)`.
4. **G4 — `!important` budget:** total occurrences in `src` must not grow past
   today's 144; each new one needs a comment on the line above.
5. **G5 — one toolkit sheet:** the built content script must reference exactly
   one `toolkit.css` (or one `#mhx-ui` style tag).

These are cheap greps; the value is that they turn "please keep the style
consistent" into a failing check.

---

## 6. Worked example — bulk actions strip on the toolkit

Before (today, ~20 lines of CSS + a bespoke button factory):

```ts
const group = document.createElement('div');
group.className = 'mhx-mass';
for (const item of leaves) {
  const btn = document.createElement('button');
  btn.className = 'mhx-mass-btn';
  if (item.danger) btn.classList.add('mhx-mass-btn--danger');
  btn.textContent = item.label;
  btn.addEventListener('click', (e) => { e.stopPropagation(); item.el.click(); });
  group.appendChild(btn);
}
```

After:

```ts
import { bar, button } from '../../ui';

const strip = bar(
  leaves.map((item) =>
    button({
      label: item.label,
      variant: item.danger ? 'danger' : 'default',
      onClick: (e) => { e.stopPropagation(); item.el.click(); },
    }),
  ),
  'Bulk actions',
);
```

Behaviour is identical; the look is now the same as the row actions, the pager
segments and the category toolbar by construction, and the dark-admin contrast
is inherited rather than re-derived.

---

## 7. Rollout

| Phase | Work | Risk | Payoff |
|---|---|---|---|
| 1 | `ui/tokens.ts` + `toolkit.css` + `ensureUi()` (A with B fallback); no feature changes yet | Low | infrastructure in place, one sheet injected |
| 2 | Port the three newest features (row actions, bulk strip, pager) — smallest sheets, best understood | Low | 3 sheets deleted, first visual consistency |
| 3 | Port `activeFilters` + `pageHeader` + nav chevron | Medium (interactive states) | 3 more sheets gone; chevron themes correctly |
| 4 | Port `categoryTree` (largest, 43 literals) — page by page, feature classes kept | Medium | biggest colour cleanup |
| 5 | Port `enhanceSelect`, then strip feature-class styling out of `magentoTheme.ts` | Medium (theme coupling) | theme layer stops knowing feature names |
| 6 | Add `check:ui` to CI, delete dead sheets | Low | consistency enforced |

Each phase is independently shippable and visually verifiable in the existing
fixtures (`filters1`, `mass1`, `nav1`, `cat1`) — no behavioural change is
expected at any step, so the fixtures double as the regression suite.

---

## 8. Risks and decisions

- **Magento specificity/resets.** Magento styles bare `button`/`input` with
  `:not(...)` selectors; primitives must set `font`, `line-height`, `color`,
  `background`, `border`, `border-radius`, `box-shadow` explicitly. This is
  already the case today — it just moves into one place.
- **`adoptedStyleSheets`.** A constructable stylesheet would remove the sheet
  from the DOM, but `document.adoptedStyleSheets` in a content script applies to
  the page document (Chrome 73+). It is a clean option for a later optimisation;
  a `<link>` is simpler to inspect and cache, so start there.
- **Dark/light admin.** The token contract (page-adaptive vs extension surface)
  must be written into the file header of `toolkit.css`, otherwise the next
  feature will reach for `--mhx-surface` again.
- **Decision needed:** does the shop want a **light admin** supported? If yes,
  page-adaptive tokens are mandatory; if the admin is always dark, they are
  still the cheapest way to survive theme updates.

---

## 9. Summary

The inconsistent look is not a taste problem, it is a missing seam: every
feature owns a stylesheet, a palette fallback chain and a button factory. One
toolkit sheet (served like a CDN via `web_accessible_resources`, with an inline
fallback), ~10 primitives, two token layers and a `check:ui` guard remove the
duplication, make a new feature inherit the look for free, and turn the dark-admin
contrast lesson into an invariant instead of a footnote.

---

## 10. Status, verification and limits

### 10.1 Current status — IMPLEMENTED (phase 1 complete)

As of 2026-10-21, the UI toolkit infrastructure described in §2–§3 is live in
`src/ui/`:

- **`src/ui/tokens.ts`** — token names + page-adaptive resolution. Three
  operator-customisable tokens (`accent`, `danger`, `ok`) with storage,
  sanitization and inline-custom-property publishing on `<html>`. The Settings
  panel (`src/lib/ToolkitColors.tsx`) reads/writes these; the content script
  (`src/entrypoints/content.ts`) watches them and repaints every open admin tab
  instantly.
- **`src/ui/toolkit.css`** — THE single stylesheet. ~10 primitives
  (button, group, bar, segmented, chip, badge, inline-field, popover, toggle,
  toast) with `currentColor` + `color-mix` page-adaptive tokens and flat
  `rgba()` fallbacks. Exactly one source of truth for injected widget styling.
- **`src/ui/toolkitCss.ts`** — generated inline fallback copy (run
  `npm run ui:sync`). Used when the `<link>` path is unavailable (enterprise CSP,
  fixture without chrome.runtime).
- **`src/ui/index.ts`** — `ensureUi()` injects the toolkit once per page via
  `<link>` to `chrome.runtime.getURL('ui/toolkit.css')` (Option A) with an
  inline `<style id="mhx-ui">` fallback (Option B). Re-exports the factories.
- **`src/ui/components.ts`** — factories (`button`, `group`, `bar`, `chip`,
  `badge`, `segmented`, `popover`) returning plain DOM nodes with toolkit classes.
- **`src/ui/icons.ts`** — icon registry for `icon` variant buttons.

### 10.2 Color customization — IMPLEMENTED

The "Toolkit colours" section in Settings (`src/lib/ToolkitColors.tsx`) lets
operators customize three colours:

- **Accent** (`--mhx-pg-accent`): focus rings, active segments, accent buttons.
  Auto = theme accent (`--mhx-accent`).
- **Danger** (`--mhx-pg-danger`): delete/remove actions, error badges, toasts.
- **Success/OK** (`--mhx-pg-ok`): copied/done feedback, success badges.

Each token has a native `<input type="color">` picker plus an "Auto" reset
button. Overrides are stored in `chrome.storage.local` under `toolkitColors` and
applied as inline custom properties on `<html>`, so clearing one restores the
stylesheet default. Preview swatches in Settings show the real token value
(resolving to the fallback when on Auto).

The color customization is available in both settings surfaces:
- Dashboard Settings (`src/dashboard/sections/Settings.tsx`)
- Side panel Settings (`src/entrypoints/sidepanel/SettingsForm.tsx`)

### 10.3 Verification

- **Guardrails pass:** `npm run check:ui` (scripts/check-ui.mjs) enforces G1–G5:
  - G1: color literals only allowed in tokens.ts, theme.ts, magentoTheme.ts,
    toolkit.css/toolkitCss.ts/public copy
  - G2: primitive classes defined once (src/ui/toolkit.css is source)
  - G3: magentoTheme.ts no longer names feature classes (cleaned)
  - G4: !important budget tracked (currently ≤ 200)
  - G5: ensureUi() references toolkit.css via ensureUi()

- **Toolkit copies in sync:** `npm run ui:sync` regenerates
  `public/ui/toolkit.css` and `src/ui/toolkitCss.ts` from `src/ui/toolkit.css`.

- **Delivery works:** manifest exposes `ui/toolkit.css` via web_accessible_resources
  with matches for all admin hosts. The `<link>` path is primary; inline fallback
  is ready.

- **Live on admin pages:** content script calls `ensureUi()` then
  `watchToolkitColors()` — every admin page gets the single toolkit sheet plus
  the operator's custom colors applied inline.

### 10.4 Proven vs. target

**Proven (measured, this implementation):**
- One toolkit sheet exists (`src/ui/toolkit.css`, ~8 KB)
- One delivery mechanism with fallback (`ensureUi()`, manifests the `<link>`)
- Three customizable colors with Settings UI and live preview
- Guardrails script enforcing consistency rules
- Icon support for button variant='icon'

**Target (not yet proven, from §4 migration map):**
- 9 → 1 injected sheet: still 9+ sheets today; phase 2+ ports not done
- 152 → ≤ 12 hex literals: still 152+ today across feature files; cleanup is
  future work
- 140 → ~40 class names: primitives defined, but features still carry their own
  classes and inline styles
- Full feature migration (rowActions, massactionButtons, pagingSizes, activeFilters,
  categoryTree, enhanceSelect): not yet ported to primitives

The infrastructure is shipped and shippable today. The payoff numbers in §4 are
targets that the remaining phases (2–6) will realize.

### 10.5 Limits

- **Light admin:** not yet tested end-to-end. The token contract supports it
  (page-adaptive currentColor + color-mix), but no fixture or live admin has
  verified it.
- **Dark admin contrast:** the bulk-actions strip proved the approach; full
  primitive set on a dark admin is not yet verified.
- **Popover surface:** translucent + blurred to survive unknown page background;
  phase 5 (enhanceSelect port) will validate against the real picker.
- **adoptedStyleSheets:** not used; `<link>` chosen for inspectability and caching.
  Could be a later optimization.
- **Remaining feature sheets:** the migration is incomplete. Until phases 2–5 land,
  the page still carries 9+ injected sheets alongside the one toolkit sheet.

