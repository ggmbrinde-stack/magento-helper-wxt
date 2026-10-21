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

- **Status:** this is a design investigation, not an implemented change. No file
  under `src/` was modified for it; the only artefact is this document plus the
  inventory script.
- **Baseline is reproducible:** `node .output/audit-ui.mjs` prints the class
  inventory, the cross-file class collisions, the hex-literal counts per file and
  the `!important` total. It reads `src/` only and writes nothing.
- **What was verified:** the numbers in §1 (140 classes / 15 collisions / 152 hex
  literals / 144 `!important` / 9 sheets / 29,422 bytes of CSS) and the
  feature–theme coupling in `magentoTheme.ts` (ten `.mhx-nh-*` selectors).
- **What was not:** no toolkit code exists yet, so none of the migration rows in
  §4 is proven; the estimates (9 → 1 sheets, 152 → ≤ 12 literals, 140 → ~40 class
  names) are targets derived from the inventory, not measurements of a build.
- **Contrast claims** rest on the one case already shipped and observed — the
  bulk-actions strip's `currentColor` workaround for a native dark admin — not on
  a light-admin test, which is why §8 leaves that as a decision.
- **Decision needed before phase 1:** delivery mechanism (A with B fallback is
  recommended) and whether a light admin must be supported.
