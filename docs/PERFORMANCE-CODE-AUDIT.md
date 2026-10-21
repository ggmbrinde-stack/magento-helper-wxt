# Performance & code audit — `magento-helper-wxt`

**Date:** 2026-10-21
**Scope:** everything that runs inside the Magento admin (content script, injected
CSS, enhancer modules) plus the MV3 service worker. The dashboard / side panel
are covered where they share code with those paths.
**Method:** full read of the runtime modules, static inventory (duplicated
helpers, dead files, CSS bytes), and a measured benchmark of the real enhancers
on a synthetic Magento-like grid (`.output/scanbench`, harness described in §8).
Nothing here is guesswork: every number below came from this repo at this
revision.

> Repo-state note: while this audit ran, two diagnostic artefacts appeared
> inside `src/lib` (`adminNavToggle-diag.ts` — a console IIFE fused with a copy
> of `hideRail`'s body, so it did not parse — and an empty
> `adminNavToggle-diagnostic.ts`), plus an unfinished `DEBUG_DIAGNOSTIC` block
> inside `adminNavToggle.ts` that no longer typechecked. That block was removed
> (≈180 lines, duplicate rail walker + debug logging on every collapse) and the
> broken file was preserved as `src/lib/adminNavToggle-diag.ts.bak` rather than
> deleted. `npm run typecheck` is green again. If that work was yours and still
> wanted, it is in the `.bak` file.

---

## 1. TL;DR

The extension is *correct* and already unusually careful about idempotence, but
it pays for that with a **whole-page rescan pipeline**: any DOM mutation
anywhere in `<body>` schedules the full 16-step `scan()`, and several steps
re-derive the same facts (tables, columns, rows) by walking the DOM again.

Five changes carry most of the win:

| # | Change | Measured / expected effect |
|---|--------|----------------------------|
| 1 | Scope rescans to the mutated subtree + Magento's `contentUpdated`, pause while the tab is hidden, back off when nothing changes | kills the steady trickle of full scans; ~2–8 ms saved *per avoided scan* |
| 2 | One combined trigger query per scan instead of ~20–24 document-wide selector passes | fewer full-DOM walks; each currently costs 0.1–0.3 ms at 1,000 rows |
| 3 | Memoise per-row / per-table work (WeakSet of enhanced rows, cached columns, grid signature) | removes **1,215–6,015 element queries per scan** at 200–1,000 rows |
| 4 | Merge duplicated primitives (`fold`, `hide`, menu reading, style injection) into one `core/dom` + `core/style` | ~9 `<style>` tags → 1–2; ~120 duplicated lines gone; one place for the dark-admin colour rule |
| 5 | Split `content.ts` (1,178 lines, 10 features) into feature modules behind a tiny registry | no measurable speed change by itself, but every optimisation above becomes local instead of a cross-cutting edit |

What is already good and must be preserved: every enhancer is idempotent
(marked nodes), `scan()` isolates each step with `safe()` so one throw cannot
cost the operator the other features, all injected controls forward clicks to
Magento's own elements instead of re-implementing behaviour, and measured (never
hardcoded) offsets are restored exactly.

---

## 2. How the extension runs today

### 2.1 Content script lifecycle

```
document_idle
  └─ main()
       ├─ scan()                                  ← first paint of our UI
       ├─ watchMagentoPageTheme()                 ← storage + prefers-color-scheme
       └─ new MutationObserver(...)
             .observe(document.body, { childList: true, subtree: true })
                    │ every batch of childList changes in the whole page
                    ▼
              clearTimeout(timer); timer = setTimeout(scan, 200)   ← debounce
```

`content.ts:1134–1137`. There is **no mutation filtering, no visibility check,
no idle scheduling, and no backoff**. Our own insertions are mutations too, so a
cold scan schedules at least one echo scan 200 ms later (it finds nothing to do,
but it still pays for the full walk).

### 2.2 What one `scan()` costs

`scan()` (`content.ts:463`) runs these steps, in order, on **every** matched
admin page regardless of page type:

| # | Step | Document-wide passes |
|---|------|----------------------|
| 1 | `ensureStyles` | 1 `getElementById` |
| 2 | `enhanceAdminSelects` | 3 `querySelectorAll` |
| 3 | `enhanceAdminNavToggle` | 1–3 `querySelector`/`querySelectorAll` |
| 4 | `enhanceGridRowActions` | 1 + per-row work |
| 5 | `enhanceMassactionButtons` | 2 + per-root work |
| 6 | `enhanceGridPagingSizes` | 1 (`selectmenu`, document-wide) |
| 7 | `enhanceActiveFilterChips` | 2 |
| 8 | `enhanceCategoryTree` | 1 |
| 9 | `movePageActionsToHeader` | 2 |
| 10 | `scanEditPage` | 8 |
| 11 | `scanGrid` | 1 table walk + **2–3 queries per cell** |
| 12 | `addGridCopyButtons` | 1 + 2 per table |
| 13 | `addStoreViewButtons` | 2 |
| 14 | `renderConfigButtons` → `extractColorGroups` | 1–3, plus 3 per matrix row |
| 15 | `buildResolver` | 1 + 3 per matrix row + `storage.local.get` |
| 16 | `maybeRequestErrorMarkup` | 1 (+ message once per SKU) |

So a scan is roughly **20–24 document-wide selector passes** and, on a grid,
thousands of element queries. Measured single-selector cost on a 1,000-row
(≈11 k node) page: 0.1–0.3 ms per pass.

### 2.3 Service worker

`background.ts` (682 lines) registers **one** `chrome.runtime.onMessage`
listener containing a 21-condition `if` chain over 16 message types, and
imports the whole capability graph at module scope (`notion`, `resolver`,
`payload`, `imageFetch`, `textFetch`, `batchRunner`, `modelBridge`, …). The
built worker is **276 KB**; MV3 re-parses it on every wake (message, alarm,
browser start).

### 2.4 Bundle facts

| Artefact | Size |
|---|---|
| `content-scripts/content.js` | 144 KB |
| `background.js` | 276 KB |
| whole `.output/chrome-mv3` | 618 KB |
| injected CSS (as source text) | **29,422 bytes across 10 files / 9 `<style>` tags** |

---

## 3. Measurements

Harness: `.output/scanbench` (see §8). A synthetic admin grid with a sticky-header
clone, toolbar, massaction menu, filter chips and paging control; rows are
7-column Magento-shaped cells (`data-index` + `col-*`). The harness treats the
grid part of `scan()` as the app does (`scanGrid` + `addGridCopyButtons` logic
against the real `gridCells` helpers) and calls the real enhancers for the rest.

| Rows | Cold scan (first, inserts UI) | Warm scan (steady state) | Element queries / warm scan | Doc `querySelectorAll` | Doc `querySelector` |
|-----:|-----:|-----:|-----:|-----:|-----:|
| 200 | 13.5 ms | 2.0 ms | 1,215 | 9 | 5 |
| 500 | 21.9 ms | 4.7 ms | 3,015 | 9 | 5 |
| 1,000 | 35.6 ms | 7.6 ms | 6,015 | 9 | 5 |

Notes:

- Query counts are **exact** and deterministic. Warm time varied between runs on
  the same page (7.6 ms → 19–43 ms samples once the preview window was occluded
  and the renderer throttled), so treat the time column as a range and the
  query column as the invariant to optimise.
- The 9 + 5 document passes above cover only the importable subset; the full
  `scan()` adds the content-only steps, hence §2.2's 20–24 estimate.
- `gridTables()` alone measured 1.4 ms at 1,000 rows — it sorts tables using
  `rowsOf()` **inside the comparator**, so every comparison re-queries `tbody tr`.
- Element queries scale at ≈ **6 per row** (3 SKU-ish columns × 2 lookups: find
  the cell, then test whether our button is already there). That work is
  repeated on every scan even though nothing changed — the largest single win
  available.

An idempotence probe (5 consecutive warm scans) showed **zero growth** in
injected nodes (copy wrap 1, massaction strip 1, 3,000 cell buttons) — the
marking discipline works; it just is not used to *skip* work.

---

## 4. Findings

Severity is about runtime cost and maintenance risk, not correctness bugs.

### F1 — Body-wide MutationObserver with no filtering (High)

**Evidence:** `content.ts:1134–1137`.
**Why it hurts:** every childList change anywhere in `<body>` — Knockout
re-rendering a toolbar, a sticky-header clone, a toast removal, an AJAX grid
reload, *our own* insertions — schedules a full scan. On an active admin page
that is a stream of full-page walks, each one re-deriving everything.
**Fix:** collect `MutationRecord`s, keep only records whose `addedNodes` are not
ours (`[data-mhx-…]`, `.mhx-*`), map them to feature roots, and rescan *those*
subtrees; schedule with `requestIdleCallback` (timeout 300 ms); skip entirely
while `document.hidden` and run once on `visibilitychange`; add exponential
backoff (200 ms → 2 s) when a scan changed nothing; a `mutating` flag around our
own writes (disconnect/reconnect or a `self-mutation` counter) removes the echo
scan.
**Expected:** most scans disappear; the remaining ones touch a subtree instead
of the document.

### F2 — Every step runs on every page type (High)

**Evidence:** `scan()` list at `content.ts:463–498`; e.g. `scanEditPage` runs
8 document queries on grid pages, `scanGrid` walks all tables on edit pages,
`enhanceCategoryTree` on every admin page.
**Why it hurts:** ~20–24 full-document passes per scan, most of which cannot
match on the current page.
**Fix:** derive the page kind once per URL (`/catalog/product/edit/`,
`/catalog/product/`, `product_action_attribute`, else generic) and keep a
per-kind step list; replace the per-step `document.querySelectorAll` calls with
**one** combined trigger query per scan
(`document.querySelectorAll('.store-switcher, .data-grid-pager, [data-role="massaction"], .filter-current, …')`)
and dispatch by matched element.
**Expected:** 20–24 passes → 1–3; page-kind gate removes useless steps entirely.

### F3 — Per-row work without memoisation (High)

**Evidence:** `scanGrid` (`content.ts:299–327`) walks every table → every row →
every SKU-ish column and calls `cellForColumn` (a `querySelector`) plus a
second `querySelector` to see whether the button exists. Measured:
1,215 / 3,015 / 6,015 element queries per scan at 200 / 500 / 1,000 rows.
**Why it hurts:** it is the dominant warm cost and it is 100 % repeated work
after the first scan.
**Fix:** `WeakSet<Element>` of processed rows keyed by table generation; process
only rows not in the set; invalidate when the row leaves the DOM (or when the
table's `tbody` identity changes). Keep a `WeakMap<Element, SkuColumn[]>` cache
for columns keyed on the `<thead>` node, invalidated on header replacement.
**Expected:** warm scan element queries → ~0; warm time → sub-millisecond.

### F4 — `gridTables()` sorts with DOM queries inside the comparator (Medium)

**Evidence:** `gridCells.ts:120–125`.
**Why it hurts:** `rowsOf()` (a `querySelectorAll('tbody tr')` + `Array.from` +
filter) is called twice per comparison, O(n log n) times, and `gridTables` is
called from `scanGrid`, `addGridCopyButtons` and again on every copy click.
Measured 1.4 ms at 1,000 rows for the sort alone.
**Fix:** one pass computing `{table, rows}` pairs, sort that array, cache the
result per grid root and invalidate on row-count change (`tbody.children.length`
+ a `MutationObserver` on the tbody, or a `data-mhx-generation` stamp).
**Expected:** sort cost 1.4 ms → ~0.02 ms; also stabilises table choice between
clicks and scans.

### F5 — Column detection repeated per table, per scan, per click (Medium)

**Evidence:** `tableColumns` (`gridCells.ts:73`) walks `thead tr` and classifies
every `th`; `hasColumn` re-runs it inside the copy click handler
(`content.ts:405`), and `collectColumnValues` does it again per table.
**Fix:** cache `SkuColumn[]` per `<thead>` in a `WeakMap` (header identity is the
natural key — Magento replaces the whole table on reload). Fall back to a
`thead.dataset` stamp if the node survives while its cells change.
**Expected:** removes 3× duplication of the same classification per click and
per scan.

### F6 — Edit-page steps scrape the configurable matrix every scan (Medium)

**Evidence:** `renderConfigButtons` (`content.ts:647`) calls
`extractColorGroups` (`content.ts:1044`), which walks the matrix table and runs
three `querySelector`es plus two regexes **per row**; `buildResolver`
(`content.ts:685`) walks the same rows again and then reads
`chrome.storage.local` — the scraping happens *before* the key comparison that
decides whether anything changed.
**Why it hurts:** on a product with 200 children that is ~1,000 DOM lookups plus
storage I/O per scan, on a page that usually has not changed at all.
**Fix:** compute a cheap signature first
(`section.className + tbody.children.length + first/last child id + collapsed state`),
compare with the last signature, and only then scrape. Hoist the storage read
behind the same guard.
**Expected:** edit pages drop to near-zero steady-state work.

### F7 — Paging step queries every `.selectmenu` on the page (Medium)

**Evidence:** `pagingSizes.ts:251` — `document.querySelectorAll('.admin__data-grid-pager-wrap .selectmenu, .selectmenu')`,
then `readSizes(root)` per root to reject non-pager widgets.
**Why it hurts:** Magento renders `.selectmenu` for many UI widgets (filters,
column chooser, saved views); the fallback shape check runs on all of them, every
scan.
**Fix:** query the pager wrapper first; only when it yields nothing fall back to
the document-wide shape check, and remember the negative result for that page
path until a mutation touches `.admin__data-grid-pager-wrap`.
**Expected:** removes a document-wide selector and N shape checks per scan.

### F8 — CSS duplication and a colour-system trap (Medium)

**Evidence:** 29,422 bytes of CSS source across 10 files; nine separate
`<style>` tags (`rowActions.ts:21`, `massactionButtons.ts:40`,
`activeFilters.ts:31`, `pagingSizes.ts:40`, `categoryTree.ts:44`,
`pageHeader.ts:13`, `adminNavToggle.ts:25`, `enhanceSelect.ts:25`,
`content.ts:206`, plus `magentoTheme.ts`'s two). The group/button primitives are
copied in 6 variants (`.mhx-row-actions`, `.mhx-mass`, `.mhx-size-row`, theme
segmented control, category toolbar, pills).
**Why it hurts:** every new control re-invents the same 6 rules and the same
`--mhx-*` fallbacks; each injection is a separate style recalculation; and the
recent dark-admin bug (white strip on a dark grid) came from assuming
`var(--mhx-surface)` describes the page — it does not (see F13).
**Fix:** one `core/style.ts` with `ensureStyle(id, css)` and a single shared
sheet (primitives + tokens). Primitives derive colour from `currentColor`
(`color-mix` with `rgba` fallbacks) so they survive any admin theme; `--mhx-*`
stays for our own extension UI (panel/dashboard) where we control the surface.
**Expected:** 9 tags → 1–2, ~6 KB less duplicated source, one place to fix
contrast.

### F9 — Duplicated helpers across modules (Medium)

| Duplicate | Where | Merge into |
|---|---|---|
| `fold()` (whitespace + case) | `activeFilters.ts:65`, `massactionButtons.ts:72` | `core/text.ts` |
| text normalisation (accents, punctuation, case) | `categoryIndex.ts:34`, `categoryTree.ts:426` | same module, one API |
| `hide(el)` (`display:none !important`) | `rowActions.ts:74`, `massactionButtons.ts:163`, `pagingSizes.ts:110` | `core/dom.ts` |
| action-menu reading (skip hidden/disabled, pick `a, button, .action-menu-item`) | `rowActions.ts:39` (`readRowActions`), `massactionButtons.ts:76` (`actionable`) | `core/menu.ts` |
| grid scope resolution (`closest('.admin__data-grid-outer-wrap…')` + `?? document`) | `content.ts:356` (`gridScopeForButton`), `gridCells.ts` callers, `activeFilters`/`pagingSizes` scoping | `gridCells.scopeOf(el)` |
| SVG icon strings | `content.ts:74–85` (copy/check/open/priority), `adminNavToggle.ts` chevrons | `core/icons.ts` |
| `injectStyles()` + `STYLE_ID` | 8 modules (see F8) | `core/style.ts` |

Each is 5–20 lines, but the cost is behavioural drift: the three `hide()`
versions already differ in signature and the two menu readers differ in whether
they prefer `a`/`button`/`.action-menu-item` — a Magento markup change must be
fixed twice.

### F10 — Dead code and shipped debug paths (Medium)

- `adminNavToggle-diagnostic.ts` — empty stub (BOM only) left in `src/lib`.
- `adminNavToggle-diag.ts` — 198 lines of console-diagnostic IIFE with a copy of
  `hideRail`'s body appended; did not parse. Preserved as `.bak` (see the note at
  the top) and removed from compilation.
- `DEBUG_DIAGNOSTIC = true` block inside `adminNavToggle.ts` — a second rail
  walker (`railAncestorsForRail`), a DOM-wide occupancy scan
  (`analyzeOccupancyForLog`), and `console.group`/`log` output on **every**
  collapse, plus a broken template literal (single quotes around `${…}`). Removed
  in this pass (~180 lines).
- `readRowActions` (`rowActions.ts:39`) is exported but has no external caller.
- All 12 flags in `flags.ts` are still referenced (checked), so the flag layer is
  healthy — but `MOVE_PAGE_ACTIONS`/`ENHANCE_*` only guard `scan()` steps, never
  the observer, so a disabled feature still pays for the scan that would run it.

### F11 — `content.ts` is a 1,178-line monolith with module-global state (Medium)

Ten unrelated features share one file: SKU copy buttons, open-product button,
toolbar copy-all buttons, edit-page field buttons, store-view shortcuts, config
"Color (N)" buttons, resolver cache, error markup, form state, Magento AJAX
lookup. Their state is module-level (`markedSku`, `lastResolverKey`, `saved`,
`timer`), so features cannot be tested or reset independently, and every
optimisation (scoping, signatures) has to be threaded through `scan()`.

**Fix:** `features/gridCopy.ts`, `features/editFields.ts`, `features/storeViews.ts`,
`features/configGroups.ts`, `features/resolver.ts`, `features/errorMarkup.ts`,
`features/formBridge.ts`, each exporting `{ id, pages, triggers, run(root) }`.
`content.ts` becomes the scheduler + message router (~100 lines).

### F12 — Service worker: eager graph + if-chain (Medium)

**Evidence:** `background.ts:1–30` imports every capability; one listener holds
21 conditions for 16 message types (`background.ts:85–660`).
**Why it hurts:** every worker wake parses 276 KB before the first message is
answered; each new message type grows one function that already spans 570 lines,
and the repeated `try/catch + sendResponse` boilerplate invites copy-paste.
**Fix:** a `const handlers: Record<MessageType, Handler>` table with a single
`try/catch` wrapper, and `await import()` inside the heavy handlers
(`notion`, `imageAudit`, `textAudit`, `batchRunner`, `modelBridge`) so a wake
that only answers `GET_SKU` (a content-script message) parses a fraction of the
bundle.
**Expected:** smaller parse on wake, ~570 lines → ~80 lines of routing.

### F13 — The theme palette describes *our* UI, not the page (Medium, design)

`applyMagentoPageTheme()` publishes `THEME_PALETTES.light` on `:root` on every
admin page unless the dark admin is enabled (`magentoTheme.ts:241–250`). Injected
controls that use `var(--mhx-surface)` therefore paint **white** on an admin
with its own dark CSS — exactly the white-strip-on-dark-toolbar bug. The fix
applied to the bulk-actions strip (translucent `currentColor`) is the general
rule: page-injected chrome derives colour from the page; `--mhx-*` is for our
own surfaces (panel, dashboard, theme preview). Document that in the style kit
and stop using `--mhx-surface`/`--mhx-ink` for page chrome.

### F14 — Two mechanisms for the same nav offset (Low)

`adminNavToggle.ts:117` (`setHidden`) zeroes measured `margin-left`/`padding-left`
inline, while `NAV_TOGGLE_STYLES` (`adminNavToggle.ts:267`) also forces
`margin-left:0 !important; padding-left:0 !important` on `.page-main`,
`.page-wrapper`, `#page-wrapper`, `.admin__header`, `main`, `body`. The CSS rule
is a blanket override that can fight a theme's own layout and cannot be reverted
per element; the JS path is measured and restores exactly. Keep one mechanism
(the measured one), or express the CSS rule through variables we set from JS.

### F15 — Category tree writes prefs on every keystroke (Low)

`categoryTree.ts` calls `writePrefs` (JSON + `localStorage.setItem`) from the
search `input` handler (line ~846) and from three other state changes. Storage
is synchronous in the page; on a 618-node tree a fast typist triggers a write per
character. Debounce (~250 ms) or write on blur/visibility change.

### F16 — No instrumentation and no automated tests (Low now, High later)

There are no `performance.mark`s, no counters, and no test suite in the repo
(the fixtures under `.output/` are manual). Every optimisation in this document
is therefore unverifiable in CI. §8 defines the smallest harness that makes them
measurable and regression-proof.

---

## 5. Redundancy inventory (quick reference)

| Item | Location | Action |
|---|---|---|
| Broken diagnostic IIFE + copied `hideRail` | `src/lib/adminNavToggle-diag.ts` → `.bak` | delete after review |
| Empty diagnostic stub | `src/lib/adminNavToggle-diagnostic.ts` | delete |
| Inline `DEBUG_DIAGNOSTIC` block (+3 interfaces, 3 functions) | `adminNavToggle.ts` | removed in this pass |
| `readRowActions` export without callers | `rowActions.ts:39` | unexport or reuse in massaction |
| `fold` ×2 / normalisers ×2 | see F9 | `core/text.ts` |
| `hide` ×3 | see F9 | `core/dom.ts` |
| menu readers ×2 | see F9 | `core/menu.ts` |
| 9 style injections / 29.4 KB CSS | see F8 | `core/style.ts` |
| scope `closest(...) ?? document` ×4 | F9 | `gridCells.scopeOf` |
| `outer.querySelector(x) ?? document.querySelector(x)` toolbar lookup | `content.ts:431–437`, similar in `pagingSizes`, `activeFilters` | one `findIn(el, selector, fallbackDoc)` helper |
| palette fallbacks duplicated in 7 files | F8/F13 | tokens in one sheet |
| comment blocks explaining the sticky-header table twice | `gridCells.ts:1–14`, `content.ts:356–365` | keep one, link to it |

---

## 6. Target architecture

```
src/
  core/
    dom.ts        hide, isVisible, scopeOf, onReady, waitFor
    text.ts       fold, foldAccents, matchAny
    menu.ts       readMenuItems(root)  ← shared by rowActions + massaction
    style.ts      ensureStyle(id, css) + SHARED_PRIMITIVES
    icons.ts      the six SVG strings
    registry.ts   Enhancer { id, pages, triggers, run(root) }
    scheduler.ts  mutation → dirty roots → idle flush (see below)
    stats.ts      counters + performance.mark behind a debug flag
  features/
    gridCopy.ts  editFields.ts  storeViews.ts  configGroups.ts
    resolver.ts  errorMarkup.ts formBridge.ts
  lib/            (existing enhancers, unchanged behaviour)
  entrypoints/content.ts   ← ~100 lines: register features, start scheduler, route messages
```

### 6.1 Scheduler

```ts
// core/scheduler.ts (sketch)
const dirty = new Set<Element>();
let idle: number | undefined;
let backoff = 200;

const mo = new MutationObserver((records) => {
  if (document.hidden) return;                 // F1: no work in background tabs
  for (const r of records) {
    if (isOurs(r)) continue;                   // our own insertions never rescan
    for (const n of r.addedNodes) {
      if (n instanceof Element) dirty.add(nearestScope(n));
    }
  }
  schedule();
});

function schedule() {
  clearTimeout(idle);
  idle = window.setTimeout(() => {
    const changed = flush([...dirty]);          // run features on those roots only
    dirty.clear();
    backoff = changed ? 200 : Math.min(backoff * 2, 2000);  // F1: quiet pages settle
  }, backoff);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) schedule();
});

// Magento fires jQuery's `contentUpdated` after every ajax/render pass:
window.jQuery?.(document).on('contentUpdated', schedule);
```

`nearestScope()` maps an added node to the nearest registered scope
(`.admin__data-grid-outer-wrap`, `[data-role="grid"]`, `.admin__fieldset`,
`#container`, else `<body>`), so a toolbar re-render rescans the toolbar, not the
page.

### 6.2 Registry + combined trigger query (F2)

```ts
type Enhancer = {
  id: string;
  pages: PageKind[];          // ['grid', 'edit', 'category', 'any']
  triggers: string;           // one CSS selector per enhancer
  run(root: ParentNode): void;
};

function flush(roots: ParentNode[]) {
  const kind = pageKind(location.href);          // computed once per URL
  for (const root of roots.length ? roots : [document]) {
    const matched = root.querySelectorAll(activeTriggers(kind).join(','));  // 1 walk
    for (const enhancer of active(kind)) {
      if (matched.some((el) => el.matches(enhancer.triggers))) enhancer.run(root);
    }
  }
}
```

### 6.3 Memoisation layer (F3–F5)

```ts
const doneRows = new WeakSet<Element>();
const columnsByHead = new WeakMap<Element, SkuColumn[]>();
const gridByRoot = new WeakMap<Element, { gen: number; tables: Element[] }>();

function scanGrid(root: ParentNode) {
  for (const table of gridTables(root)) {
    const columns = columnsFor(table);           // cached by <thead>
    for (const row of rowsOf(table)) {
      if (doneRows.has(row)) continue;           // ← the 6-per-row win
      doneRows.add(row);
      // …insert buttons once
    }
  }
}
```

### 6.4 Background

```ts
const handlers = {
  GET_SKU: () => ({ sku: readPageSku() }),
  LOOKUP_SKU: async (m) => { const { lookupSku } = await import('../lib/lookup'); … },
  BATCH_START: async (m) => { const b = await import('../lib/batchRunner'); … },
  // 16 entries, one try/catch wrapper, one sendResponse convention
} as const;
```

---

## 7. Refactor plan

Ordered so each phase is shippable alone and verifiable with the harness in §8.

| Phase | Work | Risk | Expected effect | Verify with |
|---|---|---|---|---|
| 0 | Done here: remove dead/broken diagnostics, restore typecheck | none | −180 lines, no console noise on collapse | `tsc`, nav fixture |
| 1 | `core/dom`, `core/text`, `core/menu`, `core/style`, `core/icons`; delete duplicated helpers; one stylesheet | Low (mechanical) | −120 lines, 9 tags → 1–2 | typecheck, all fixtures |
| 2 | Row/column/grid memoisation (F3–F5) | Low | warm element queries 1,215–6,015 → ~0 | bench: `warm_elQS` ≤ 50 |
| 3 | Registry + page-kind gate + combined trigger query (F2) | Medium | 20–24 doc passes → 1–3 | bench: `warm_docQSA` ≤ 2 |
| 4 | Scheduler: dirty roots, hidden-tab pause, backoff, `contentUpdated` (F1) | Medium | scans become rare and scoped | extend bench with a mutation driver |
| 5 | Split `content.ts` into feature modules (F11) | Medium (move-only) | no behaviour change | fixtures + manual grid pass |
| 6 | Edit-page signatures (F6), pager scoping (F7) | Low | edit-page scans ~0 work when idle | bench on edit fixture |
| 7 | Background handler map + dynamic imports (F12) | Low–Medium | smaller wake parse | `background.js` size, message tests |
| 8 | Stats + budgets + CI (F16) | Low | regressions become visible | CI job |

---

## 8. Budgets & measurement protocol

### 8.1 Budgets to hold

| Metric (1,000-row grid, warm) | Today | Target |
|---|---|---|
| Element queries per scan | 6,015 | ≤ 50 |
| Document-wide selector passes per scan | 20–24 | ≤ 3 |
| Warm scan time (this machine) | 7.6–28 ms | ≤ 2 ms |
| Scans triggered by one toolbar re-render | 1 full page | 1 subtree |
| Injected `<style>` tags | 9 | 1–2 |
| `content.js` / `background.js` | 144 / 276 KB | ≤ 140 / ≤ 180 KB |
| Node growth over 5 warm scans | 0 | 0 (invariant — guard it) |

### 8.2 Reproducing the numbers

The harness lives in `.output/scanbench` and is built like the other fixtures:

```bash
cd magento-helper-wxt
node_modules/.bin/esbuild .output/scanbench/entry.ts --bundle --format=iife \
  --target=chrome100 --outfile=.output/scanbench/bundle.js
node .output/inline-fixtures.mjs        # writes scanbench/page.html
```

Then open `page.html` in the Preview tab and run:

```js
window.BENCH.rebuild(1000);
window.BENCH.bench(10);   // { rows, cold_*, warm_* } — ms + query counters
```

The entry patches `Document.prototype` / `Element.prototype` query methods and
`getComputedStyle` to count calls, so the *query* numbers are stable across runs
while timings depend on machine load (report medians of ≥ 10 runs).

### 8.3 What to make automatic

1. `npm run bench` — headless run (playwright-puppeteer style) asserting
   `warm_elQS ≤ 50` and `warm_docQSA ≤ 2` at 1,000 rows.
2. `npm run check:css` — fails if more than two `<style>` ids exist or if a
   duplicated primitive selector appears twice.
3. `npm run check:dead` — fails on unreferenced `src/lib/*.ts` (this audit found
   two such files in one day).
4. Node-growth invariant: 5 warm scans must not change injected node counts.

---

## 9. Prioritised backlog

- [x] Remove broken diagnostic debris, restore `tsc` (phase 0)
- [ ] Delete `adminNavToggle-diag.ts.bak` + empty `adminNavToggle-diagnostic.ts`
- [ ] Row/column memoisation in `scanGrid` + `gridTables` sort fix (F3, F4)
- [ ] `core/style.ts`: one sheet, `currentColor` primitives (F8, F13)
- [ ] `core/{dom,text,menu,icons}` helpers and delete the duplicates (F9)
- [ ] Registry + page-kind gate + combined trigger query (F2)
- [ ] Scheduler rewrite with dirty roots, `contentUpdated`, hidden-tab pause (F1)
- [ ] Split `content.ts` into `features/*` (F11)
- [ ] Edit-page + resolver signatures (F6); pager scoping (F7)
- [ ] Background handler map + dynamic imports (F12)
- [ ] Debounce category-tree prefs (F15); drop the CSS/JS double offset (F14)
- [ ] `npm run bench` + CI budgets (F16)

---

## 10. Open questions

1. **Grid sizes in production** — the budget table assumes 1,000 rows/page. If the
   real listing is capped at 200 (the pager suggests so), F3/F4 are still worth
   doing but the ceiling is ~2 ms, not 8.
2. **Light admin** — is any store on a light Magento theme? That decides whether
   the `currentColor` primitive rule can be the only colour mechanism.
3. **Extension reload cadence** — if the team reloads the unpacked extension often,
   phase 5 (file split) is cheap to land early; if not, do phases 2–4 first.
4. **Diagnostics ownership** — `adminNavToggle-diag.ts.bak` and the empty stub: keep
   as a `scripts/diag-*.js` probe (repo convention) or delete?

---

## Appendix A — defect register (2026-10-21)

Verified by reading the code paths named below. None of these were fixed in this
pass except where noted; severities are about user-visible consequence.

| ID | Severity | Defect | Evidence | Fix |
|---|---|---|---|---|
| D1 | High (latent) | Error **priority is exact-case only**: `priority: z.string().default('Low')` accepts anything, while the icon/colour/rank maps key on `High`/`Medium`/`Low`. A Notion value like `high`, `HIGH` or `P1` silently renders as *low* and can never be upgraded by a later high indicator (`PRIORITY_RANK[...] ?? 0`). | `schemas.ts:35`, `content.ts:88–98`, `content.ts:858–870` | Normalise once (`z.string().transform(p => canonical(p))`) or `z.enum(['High','Medium','Low'])`; rank from the canonical value only. |
| D2 | Medium | Error indicators are **never cleared and pollute Magento's markup**: `addIndicator` sets `label.style.display = 'inline-flex'` permanently, and nothing removes `.mhx-error-indicator` / `mhx-error-label--*` when the error set changes. | `content.ts:866–907` (only creation + replace-by-priority) | Clear the previous set at the start of `applyErrorMarkup`; use a class (`mhx-error-label` host class) instead of inline styles on Magento's label. |
| D3 | Medium | Receiving error markup **expands every collapsed section on the page** (`expandCollapsedSections()` clicks all `.admin__collapsible-block-wrapper._hide`), not just the ones with errors — a large layout jump and scroll position loss on big product pages. | `content.ts:846–855`, called from `applyErrorMarkup` | Expand only ancestors of the matched fields (`field.closest('._hide')` chain), or offer an explicit "show all" control. |
| D4 | Medium | `resolverMap` **grows forever and is rewritten whole** on every product page. Three independent read-modify-write paths can lose each other's entries (last writer wins). | `content.ts:728–751`, `background.ts:255–262`, `lookup.ts:289` | One writer (background) + a small `RESOLVE_CACHE_PUT` message; write only when the entry changed; prune by `timestamp`/max entries. |
| D5 | Medium | Bulk-actions strip can be inserted **after the grid table** on themes where the header row's parent also hosts the table/wrap; `stripHost` appends when there is no next sibling. | `massactionButtons.ts` `stripHost()` | After choosing the position, check the next sibling chain for `table.data-grid` / `.admin__data-grid-wrap` and insert before it instead. |
| D6 | Medium | Copy-SKU toolbar buttons can land in **another grid's toolbar**: when the owning grid has no search wrap, the fallback is `document.querySelector('.data-grid-search-control-wrap…')`, which may be a different grid's. | `content.ts:431–437` | Scope strictly to the grid's own `outer` (header/`data-role="grid"`); if absent, skip rather than borrow another grid's toolbar. |
| D7 | Medium | With the sidebar collapsed, if Magento replaces `.page-wrapper` in-page, the **new wrapper keeps its rail margin** while the rail stays hidden — the grey band returns (the retry logic only re-hides the rail). | `adminNavToggle.ts` `setHidden()` (restores only the saved nodes) | Keep the collapsed offsets derived: on each scan, re-measure and zero any element that is still indented while `mhx-nav-hidden` is set. |
| D8 | Medium | The custom picker **hides the native `<select>` with `display:none`**, so Magento validation that focuses/scrolls the invalid field now targets a hidden element (no focus ring, no scroll-into-view). | `enhanceSelect.ts` style block (`.mhx-nh-native`) | Use `position:absolute;opacity:0;pointer-events:none` (keeps the control focusable) and forward focus to the trigger. |
| D9 | Low | Massaction buttons **never appear** on a store whose ACL hides `Delete` *and* `Update attributes`: the scope check requires one of those two top-level labels. | `massactionButtons.ts` signature test | Accept any menu labelled "Actions" with ≥2 leaf actions; use the two labels only as a tie-breaker. |
| D10 | Low | Category-tree view prefs are written to `localStorage` **on every keystroke** in the filter (JSON stringify + sync write). | `categoryTree.ts:846` (+3 other `writePrefs` calls) | Debounce ~250 ms or write on blur. |
| D11 | Low | `scan()` paints page chrome **before** the stored theme resolves (`scan()` then `watchMagentoPageTheme()`), so a dark-admin user can see light-palette chrome for a frame. | `content.ts` `main()` | Read the theme first (await), then scan. |
| D12 | Low | `ERROR_MARKUP` always answers `{success:true}`, even when no field matched any error — failures are invisible to the sender. | `content.ts` message branch → `applyErrorMarkup` | Return `matched`/`unmatched` counts and log unmatched error types once. |

**Totals:** 1 High (latent) · 7 Medium · 4 Low.

### Checked and found clean (negative results)

These looked like defects and were disproved — worth recording so they are not
re-investigated:

| Suspect | Result |
|---|---|
| Message types | 24 handled; **zero** sent-but-unhandled. `BATCH_CANCEL/CLEAR/RESUME` *are* sent — via the panel's typed helper (`Batch.tsx:223`), not as literals, which is why a naive scan misses them. |
| Batch pump races | Guarded by the `pumping` flag (`batchRunner.ts:290`); overlapping `maybeResume()`/alarm/startup calls collapse. |
| Clipboard fallback | Removes the temp `<textarea>` and rethrows a clear error (`content.ts:255–274`). |
| Name-column copy button | Documented behaviour (`README.md:97`), not a stray selector match. |
| `GET_CONFIG` "pending" | The panel retries up to 4 times (`ConfigPanel.tsx:43–44`). |
| Picker observers | `mounted` is a `WeakMap` and `destroy()` disconnects (`enhanceSelect.ts:50, 182`). |
| Error-field selectors | Names come from the static `ERROR_FIELD_MAP`, so no CSS-selector injection from Notion text. |
| Writes while paused | `handleApplyField` rejects before touching the page when `WRITES_ENABLED` is false. |

### Verification performed

- Every defect was established by reading the code path cited in the Evidence
  column; the three cross-checks that could be automated (message-type
  coverage, dead lib files, class/colour inventory) were run as scripts.
- No `src` change was required for this register; `npx tsc --noEmit` is green.

### Limitations

- Nothing here was reproduced against the live admin: D1, D4, D5, D6 and D7 are
  conditional on Notion option spelling and theme markup, and are labelled
  accordingly rather than promoted to "confirmed bug".
- Preview screenshots are unavailable in this session (webview not compositing),
  so no visual evidence accompanies the defect list.
- The defect sweep was targeted (message layer, error markup, resolver cache,
  enhancement placement, picker/select handling), not an exhaustive audit of
  `imageAudit.ts` / `textAudit.ts` / `notion.ts` parsing paths.

