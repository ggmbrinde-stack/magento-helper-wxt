# BOG Helper — WXT / TypeScript extension

This repository is the active BestOfGifts helper extension: **TypeScript strict
· WXT (Manifest V3) · Zod · Preact**. The earlier JavaScript extension is
historical and is not the implementation target. Notion API calls run from the
background service worker; the Magento content script does not call Notion.

The current product structure is one side panel and one dashboard page. Audit
sections are integrated into the dashboard; there is no separate Audit page or
extension Options page in the current build. This README is maintained against
the WXT source and should be used with the current code, not older port plans.

## Notion write policy (current implementation)

The two Notion databases have different write rules:

- **Listing Errors:** create new rows only. The writer deduplicates by
  `SKU + Error title` before creation. Existing rows are never updated or
  deleted, and blocks are never appended.
- **SKU Library:** create missing SKU rows and, when
  `NOTION_LIBRARY_UPDATES_ENABLED` is enabled, update only the explicit
  whitelist in `src/lib/skuLibraryWriter.ts`. Existing rows are matched by
  exact SKU title; changes are diffed and read back. This update path is
  currently enabled. Its Category/Subcategory selectors mirror Listing Errors
  (16 categories / 71 subcategories), and `ALLBEST` is stored as
  `ALLBEST (interno)` in both databases.

**Body completion (SKU Library only):** a newly created page, or an existing
page whose body is empty or only a blank paragraph, may have its dossier body
completed in chunks of at most 90 blocks. The writer reads the page body first;
a non-empty body is never overwritten. This path never touches Listing Errors
and reports `bodyIncomplete` when a chunk fails. A local receipt in
`chrome.storage.local` records the page, body hash, and appended chunk count so
a partial append can resume on the next push. Notion requests have a 20-second
ceiling, and list reads paginate up to 10 pages (1,000 rows) with a visible
`truncated` flag rather than silently dropping rows.

**Batch push preflight:** before the first create, the background validates all
selected Listing Errors payloads, all selected Library cells, and the body plan.
It also runs the read-only Notion health check. A failed preflight writes
nothing. The Preview action returns per-SKU Library rows with create/update/
unchanged state, cell diffs, body block/chunk counts, and health status.

**Listing Errors dedupe:** existing titles are read in batches of up to 50
SKUs and compared locally, instead of issuing one dedup query per payload. If a
batch read is truncated, the affected SKUs fall back to exact per-SKU checks.
SKU Library existing rows are also batch-loaded for preview and writes (one
query per 50 SKUs), and the read-only health report is cached for five minutes
while previewing; an actual push forces a fresh health check.

Every push also requires explicit user confirmation and is checked by the
background handler. The static `npm run check:notion` guard permits the
SKU Library page-property update and empty-body completion only in the
dedicated writer; all other Notion calls must use the guarded read/create
helpers. Do not describe the
entire integration as create-only: only Listing Errors is strictly
create-only. The Notion page **Extention** is the current product overview;
older audit-port reference pages are historical context where they differ from
the current repository.

## Status (2026-10-15)

Ported from v0.2.0 (`sku-copy-button/`) and verified with `npm run typecheck`
and `npm run build`:

- **Settings** — Notion token (stored in `chrome.storage.local`, never logged),
  SKU Library / Listing Errors database ids (empty = default live ids), and
  Magento Admin base URL. No secrets or ids are committed.
- **M1 read-only side panel** — Preact UI inside a Shadow DOM (Magento page CSS
  cannot leak in). Store view auto-detected from the active admin tab
  (`/store/<id>/`), with manual override. Fetches the SKU Library row and open
  Listing Errors, sorted High → Medium → Low, filtered by store view; invalid
  Notion rows are Zod-validated and skipped with a count.
- **M2 copy buttons** — content script adds a copy button on the SKU field of
  the product edit page and on SKU / Parent SKU columns in product grids.
  Incremental scan with a debounced MutationObserver (no full re-creation).
- **M3a — guarded field fill** — the “Fill” panel contains per-field Apply /
  Undo machinery for `name` and `short_description`, with SKU and store-view
  guards and a pre-apply snapshot. **Magento form writes are currently
  disabled** by `WRITES_ENABLED = false`; no field is applied until that gate
  is deliberately enabled.
- **M3a guards** — the retained apply/undo path checks that the open page is a
  product edit page, the page SKU matches the SKU selected in the panel
  (case-insensitive), and the store view matches the detected scope. Runtime
  apply/undo is currently disabled by `WRITES_ENABLED = false`.
- **Notion client** — rate-limited request queue (~2.5 req/s), 20-second
  per-request timeout, retry/backoff for 408/429/5xx, paginated reads (10-page
  ceiling with a visible truncation flag), property extractors for title /
  rich_text / select / multi_select / url / date, and Zod schemas for both
  databases.
- **Tab groups** — `OPEN_TAB_GROUP` groups opened tabs and responds correctly
  to the panel.

## Build & load

```bash
npm install
npm run dev        # watch mode, or:
npm run build      # output in .output/chrome-mv3
npm run typecheck  # strict typecheck
```

`chrome://extensions` → Developer mode → **Load unpacked** → select
`.output/chrome-mv3`. Then open the side panel, go to **Settings**, and add
your Notion token.

The extension is used with the live Magento environment. Content-script host
matches are explicitly declared in `src/entrypoints/content.ts` and
`wxt.config.ts`; the Magento Admin base URL setting is used when constructing
backend links. Keep any host-pattern changes aligned across both configuration
surfaces.

## V2 port (2026-10-16)

Read-only half of the V2 port, in the same stack. `npm run typecheck`,
`npm run check:notion`, and `npm run build` all stay green.

- **4-tab panel** — Data / Config / Fill / Settings. Resolve SKU is handled by
  the single Resolve SKU tab in the dashboard.
- **Data tab (`DataPanel.tsx`)** — priority colours (High red / Medium orange /
  Low amber), errors grouped by Error Group, supplier / brand / CSV row per
  error, copy buttons for SKU / colours / sizes / links.
- **Store-view buttons** — All / EN / ES / FR plus **Open all** in a tab group,
  built from the SKU Library backend URL (`withStoreView` in `store.ts`).
- **Config tab (`ConfigPanel.tsx`)** — reads the open page's configurable colour
  groups via the content-script `GET_CONFIG` message (Attribute cell `Color: X`
  + child product-edit links); expands a collapsed Configurations section and
  retries; **Open all** opens each colour's sizes in a tab group.
- **On-page buttons (content script)** — clipboard-icon copy buttons next to the
  SKU/**Name** field (edit page) and on the SKU / Parent SKU / Name columns
  (grid); store-view quick-open buttons (EN / ES / FR) + **Open All** next to the
  product store switcher; **Color (N)** buttons that open each colour's sizes in
  a tab group. Styles are injected once (hover/active, toast).
- **Resolve SKU tab (`Resolver.tsx`)** — the only SKU lookup/resolution flow
  (`RESOLVE_SKU` → `src/lib/skuResolution.ts` → `resolveSkuWithHtml`). There is
  no separate Lookup tab, panel, message, or storefront parser. Resolve SKU
  uses the full `ResolverJson` as its canonical product result, reuses a
  complete cached resolver unless an explicit product URL is supplied, and
  enriches the result with Notion SKU Library metadata. It searches the open
  Magento admin grid only when storefront resolution fails; if that is
  unavailable, matching Notion data can still be shown as a fallback. Full
  resolver payloads are cached; older compact cache entries are not treated as
  complete and are resolved again on demand. The tab renders frontend/store-view
  and Magento backend links, variants, audit anomalies, and any fallback data.
- **On-page error indicators** — priority dots (High/Medium/Low) next to each
  matching form field, label colouring, hover tooltip, and auto-expanding
  collapsed sections. Driven by the `FETCH_ERROR_MARKUP` (panel/content) →
  `ERROR_MARKUP` (background → content) round-trip; the content script requests
  them automatically per product, and the Data tab has a **Mark fields** button.
- **Clipboard** — `clipboardWrite` permission plus an `execCommand` fallback.
- **Copy all SKUs** — grid toolbar buttons next to the search box that copy
  every SKU / Parent SKU currently listed on the page, newline-separated.
- **Dashboard page** (`src/dashboard/Dashboard.tsx`) — a full-page management
  UI exposed as `dashboard.html`. It contains Overview, Run audit, Resolve SKU,
  Image audit, Text audit, Push errors, Settings, and Resolver Cache. There is
  one SKU resolution tab; audit sections are part of this dashboard, with no separate
  `AuditDashboard.tsx`, `audit.html`, or Options page in the current build.

Magento form-write features (including field fill and future Page Builder or
image-write work) are gated **OFF** (`WRITES_ENABLED = false`). Notion writes
are separately gated: Listing Errors creation is enabled and SKU Library
whitelisted updates are enabled, subject to explicit confirmation. Neither
policy means the extension automatically saves Magento forms.

## Theme manager (2026-10-16)

One setting drives three surfaces. Preferences live in `chrome.storage.local`
under `theme` / `themeAccent` / `themeMagentoPages`, and `src/lib/theme.ts` is
the only place the palette is defined:

- **System / Light / Dark** — applies immediately to the side panel and the
  dashboard, follows the OS while set to System, and needs no Save button.
- **Accent colour** — eight presets plus a picker. Only the accent is chosen;
  the shade, the pale tint and the button foreground are derived
  (`accentOverrides`), so an unreadable pair cannot be produced.
- **Magento admin pages** — opt-in checkbox. When on, the content script writes
  the same palette onto the page's `<html>` and injects the surface overrides
  from `src/lib/magentoTheme.ts`. Dark only, since the admin is already light,
  and Magento's own error/warning/success message colours are left untouched.

Two layers, and the distinction matters:

1. **The palette is always published** on admin pages, whatever the checkbox
   says, because our own surfaces (the side panel, the dashboard) read `--mhx-*`
   wherever they are. The page chrome we inject reads layer 1 only — the
   palette's *accent* reaches it through the toolkit's one bridge,
   `--mhx-pg-accent: var(--mhx-accent, …)` — so the widgets follow the accent in
   a light admin without inheriting a palette that describes the panel rather
   than the page. The page itself is light unless the operator asked for the
   dark admin; for an admin that is dark by its own theme, see the measured
   `data-mhx-page` in UI-TOOLKIT.md §2.1.
2. **The accent sheet is separate and opt-in by virtue of having an accent.**
   `MAGENTO_ACCENT_CSS` recolours links, `.action-primary` buttons ("Add
   Product", "Save"), active nav/view states, focus rings and native
   checkbox/radio tint. It applies to the *light* admin as well, which is what
   makes the accent visible in the page rather than only in our own chips. With
   no accent chosen the sheet is not injected, so a default install keeps
   Magento's own palette untouched.

The palette is applied as CSS custom properties on a root element — `<html>` for
pages, the shadow host for the side panel — so the panel (which renders inside a
Shadow DOM) and the admin pages share one source of truth. `color-scheme` is set
with it so native controls and scrollbars follow.

The extension is in active use against the live Magento admin. The admin
overrides cover common surfaces; adjust them based on issues observed during
normal live use, and avoid triggering destructive Magento actions solely to
test presentation changes.

## Header reordering (2026-10-19)

`src/lib/pageHeader.ts` moves the page's action bar (`.page-main-actions`, or
`.page-actions` when a page has no strip) out from under the title and into
`header.page-header`, immediately before the search / notifications / user
cluster. It moves Magento's own element — the buttons are never rebuilt — so
handlers, confirmations and ACL checks keep working. The move is idempotent and
re-applies after Magento re-renders the header. **Off by default** — the move
was reverted on request (2026-10-19), so "Add Product" sits in the stock strip
under the title; flipping `MOVE_PAGE_ACTIONS` in `src/lib/flags.ts` turns it
back on.

## Grid row actions & paging sizes (2026-10-19)

**Per page** — Magento does *not* use a `<select>` here. The stock template
(`Magento_Ui/templates/grid/paging/sizes.html`) renders a `.selectmenu` widget:
a value input, a toggle button labelled **Select**, and a list of
`button.selectmenu-item-action` items. That is the "500 Select per page" text in
the toolbar. `src/lib/pagingSizes.ts` builds a segmented control from the
numeric sizes and hides the input, the toggle and the list; each segment
forwards its click to Magento's own item button, so `setSize` still runs.
A number box next to the segments takes any size, committed with Enter; it goes
through Magento's own custom path (`showCustom` → bind `customValue` →
`applyCustom`), so `addSize` + `setSize` run and the store's configured
`minSize`/`maxSize` still applies rather than a limit invented here. A committed
size joins the segments on the next scan.

The widget's own white panel (`.selectmenu` background, border and padding) is
stripped, otherwise a pale frame is left around the control in a dark admin.

**Its ink and chrome come from the measured page, not from the widget it sits
in.** The pager hands us its own muted colour (`#6a6a6a` on the operator's native
dark admin) and `--mhx-*` is the light palette unless OUR dark admin is on, so a
`currentColor`-derived control was invisible there: labels measured **3.05:1**,
and the container, its separators and the size box had no visible edge.
`magentoTheme.ts` now measures the page it has painted and publishes
`data-mhx-page` + `--mhx-pg-page-ink` on `<html>` (UI-TOOLKIT.md §2.1); the same
labels read **13.9:1** and the chrome is visible on both admins. The active
segment keeps the operator's accent and adds a ring in the accent's own
contrast-derived foreground, so the selected shape still reads when the accent
sits close to the page colour.
Toggle: `ENHANCE_PAGING_SIZES`.

**Copy SKUs / Copy Parent SKUs** — reading is centralised in
`src/lib/gridCells.ts`. A grid renders *more than one* `table.data-grid` when
the sticky header is active: `ui/grid/sticky/listing.html` renders a second
table whose `<thead>` is a copy of the columns and whose `<tbody>` is empty.
Taking "the first table in the container" could therefore return the row-less
copy, which is what produced **"No SKUs found on this page."** on a full grid.
Tables are now ranked by row count, cells are found by `data-index` first, and
the "no records" placeholder row is skipped.

**Open product** — every SKU cell also gets a small external-link button that
opens that product's admin edit page in a new tab, because the grid does not
always render the name as a link. The URL comes from `src/lib/productLink.ts`:
an existing edit link in the row wins, otherwise the row's `data-id` (or ID cell)
plus the admin base path from the current URL. Rows with no usable id get no
button. Both injected buttons are excluded from copied text.

**Row actions** — the per-row **Select ▾** dropdown becomes an inline selector
(`src/lib/rowActions.ts`).

Magento's trigger and `<ul>` stay in the document and are only hidden; every
button forwards its click to the original item, so Magento's hrefs, handlers,
confirm modals and ACL filtering keep working. Nothing is written and no request
is made. Rows with more than four actions keep the stock dropdown. A row with a single
action already renders as a bare `a.action-menu-item` in Magento's template, so
nothing is added there. The toolbar's bulk **Actions** dropdown has its own
feature (see *Toolbar massaction buttons* below). The scan is idempotent, so
Magento's AJAX grid reloads are picked up by the existing debounced re-scan.
Toggle: `ENHANCE_ROW_ACTIONS` in `src/lib/flags.ts`.

**Active filters pencil** — every chip in the grid's **Active filters** strip
gets a ✎ button that edits its value inline (`src/lib/activeFilters.ts`), so
changing e.g. "Status: Disabled" no longer means opening the filter menu.
Text editors confirm with Enter or ✓ (Esc / ✕ / clicking away cancels); a
select applies on the pick, one gesture. Applying writes into Magento's own
filter field (native setter + `input`/`change`, so Knockout sees it) and clicks
the panel's native **Apply filters** button — form submit / Enter-on-field as
fallbacks — i.e. exactly the re-query the operator could run by hand: a grid
search, never a data write. A pencil only appears when the chip resolves to
exactly one editable field (label match, else form-parameter slug); ambiguous
chips (date ranges) and chips with no field get none. Idempotent per chip, so
AJAX reloads keep working. Toggle: `ENHANCE_ACTIVE_FILTERS`. If a live grid's
markup ever hides the pencil, run `scripts/diag-active-filters.js` in the
console (read-only) and the selectors can be matched to the real DOM.

**Pinned filters** — pin a field in the expanded Filters form or pin an active
filter chip. Pinned filters stay in the grid's visible Active filters area even
when their value is empty (`Not set`), so they can be edited there without
reopening the Filters form. The pencil edits Magento's native field and applies
through Magento's normal filter action; only non-empty pinned values are
restored/applied after reload or **Clear all**. Unpin to return the field to
normal filter behavior.

## Admin sidebar toggle (2026-10-20, rail fix 2026-10-21)

A fixed chevron on the admin nav's right edge (`src/lib/adminNavToggle.ts`)
hides/shows the left sidebar so the grid gets the width back.

- **The whole rail, not just the `<nav>`** — the left band is painted by the
  column AROUND the nav (logo plus background), so hiding the nav alone left a
  grey strip on screen. The rail is the chain of ancestors that share the nav's
  left edge and stay narrow (measured, never a class-name guess), and each one
  is hidden with its previous inline `display` restored on expand.
- **Display-only** — rail/nav `display:none` plus the content offset that
  reserves the band (`margin-left`, and `padding-left` when the theme reserves
  it that way) zeroed while hidden and every previous inline value restored
  exactly on expand. Only padding that equals the rail's measured width is
  touched, so normal content gutters survive.
- **Self-healing** — the rail is measured before the hiding class goes on (a
  hidden element reports a 0×0 rect), and if a collapse happened before layout
  settled on a fresh load it retries on the next scan instead of leaving the
  band behind.
- **Persists** per origin in localStorage (`mhx.nav.collapsed.v1`), like the
  category-tree view prefs; position re-syncs on window resize.
- **Admin pages only** — the toggle renders only where the admin nav exists,
  so it never shows on storefront pages.
  Toggle: `ENHANCE_NAV_TOGGLE`.

## Toolbar massaction buttons (2026-10-20, placement 2026-10-21, all options 2026-10-22)

The grid toolbar's bulk **Actions** dropdown (`Delete`, `Change status`,
`Update attributes`, `Assign Inventory Source`, …) becomes one-click inline
buttons (`src/lib/massactionButtons.ts`), so bulk actions stop costing a
menu-open plus a pick from a nine-item list.

**Every top-level option gets a button**, including the ones that own a submenu
(`Change status ▾`, `Change attribute set ▾`, `AI Translate ▾`). Those buttons
own their dropdown: the menu opens right under the button and lists the
submenu's items. Picking one forwards the click to Magento's own item, so the
handlers, confirmation modals and ACL filtering are untouched — the stock
"Actions" dropdown no longer has to be opened at all. It is **never hidden**
either: it stays exactly as Magento drew it, as the fallback for a submenu we
cannot read.

- **Forwarding only** — every button clicks Magento's OWN menu element, so
  the massaction selection check, confirmation modals ("Are you sure?"), KO
  handlers and ACL filtering all keep running. Nothing is submitted, written
  or requested by the extension; with no rows selected Magento replies
  exactly as it would for the stock menu.
- **Four actions stay in the menu** — "Assign Inventory Source", "Unassign
  Inventory Source", "Transfer Inventory To Source" and "Regenerate Url" get
  no button (operator request, 2026-10-23). They remain in Magento's own
  dropdown, which is never hidden or restyled, so they stay reachable.
- **Its own row, outside the dropdown** — the strip is inserted after the
  grid's last header row, i.e. the full-width line between the toolbar and the
  table. (First cut put it inside the dropdown wrap, where it inherited the
  trigger's width and stacked two buttons per line, half over the menu.) The
  native wrap is never restyled — only where the strip lives.
- **Submenus preserved, never flattened** — the children (`Enable /
  Disable`, the attribute-set list, the languages) stay exactly where Magento
  put them, and the buttons list them verbatim. A submenu button carries a
  `▾` and its menu is anchored to the button (`.mhx-pop--menu`, fixed
  position): it opens below, flips above when there is no room, closes on a
  click outside, `Escape`, scroll/resize or opening another submenu, and only
  one is open at a time. If a submenu cannot be read, the button falls back to
  opening Magento's dropdown exactly as before. The dropdown itself is never
  hidden or restyled.
- **Colours follow the admin, not our palette** — `--mhx-*` is published as
  the light palette unless the dark admin is enabled, so on an admin with its
  own dark theme `var(--mhx-surface)` is white. The strip is translucent
  `currentColor` instead (flat `rgba` fallbacks where `color-mix` is missing),
  so it reads correctly on a light admin, a native dark one and our themed
  dark one alike. Only "Delete"-style actions take a fixed red.
- **Rows never caught** — roots inside `tr` / row cells belong to the
  per-row "Select ▾" menus (rowActions) and are skipped.
- **Idempotent by menu** — the menu element remembers its strip, so the
  debounced re-scan and a second root reaching the same menu never draw a
  duplicate; a menu or strip Magento rebuilt is detected (detached element)
  and drawn again against the current items.
  Toggle: `ENHANCE_MASSACTIONS`.

## Update Attributes category tree (2026-10-20)

`src/lib/categoryTree.ts` enhances the Categories tab of the mass **Update
Attributes** page (`/catalog/product_action_attribute/…`, tree on screen while
"Add Product To Categories" is visible). Nothing here writes: it flips
`display`, inserts badges/buttons, and forwards clicks to Magento's own
checkboxes, which stay the only writers of form state.

- **Numbers on every category** — the code from the Notion index
  (`src/lib/categorias-index.json`, mirrored by `src/lib/categoryIndex.ts`):
  `1`, `1.2`, `1.2.3`. The index is the full consolidated export of all 12
  category pages (618 nodes: 12 top-level, 77 sections, 529 leaves), rebuilt
  from `scripts/categorias-source.md` with `npm run index:build`
  (`scripts/build-category-index.mjs`). Matching folds case/accents/punctuation
  and prefers the ancestor path, because names repeat ("LINHA NATURA" is
  1.1.4, 1.2.3 and 1.3.5). Ambiguous or unknown names get **no** number rather
  than a guess.
- **Check ticks the whole path** — checking a category also checks every
  ancestor up to (but excluding) the root "Default Category": picking "BONÉS"
  ticks BONÉS E CHAPÉUS and its section, so a leaf pick never saves a
  half-selected path. Each tick goes through Magento's own checkbox + a native
  `change`, so pills, list view and form state stay in sync.
- **Uncheck cascades in reverse** — unchecking a parent also unchecks its
  whole subtree, and an ancestor left with no checked children unchecks too
  (up to, but excluding, the locked root). A parent that still holds another
  checked child stays checked. Same terms: Magento's own checkboxes + native
  `change`, nothing saved.
- **Default Category is always checked** — the store root is locked on every
  render, change and re-scan (box disabled + labelled, re-ticked if anything
  clears it), even when nothing else is checked. It gets no pill and no List
  row, since it can never be removed.
- **Selected pills** — a strip under the toolbar lists every checked category
  as a removable chip (code + name); clicking one unchecks the real checkbox.
  Rebuilt from the inputs, so it stays right whoever changed them.
- **Tree | List** — collapsible tree, or a flat depth-indented list that drives
  the same checkboxes.
- **Selected only** — hides everything not checked, in either view.
- **Tick Linha Natura** — one click ticks the “Linha Natura” category in the
  same parent list for every category already checked, so a multi-category
  pick needs no second pass. Additive only (nothing is ever unticked) and it
  reports how many it ticked.
- **Filter** — accent-insensitive search over names *and* numbers (“1.2.3”
  finds it, “textil” finds “Têxtil Promocional”), ancestors kept on screen.
- **View state persists** — mode, filter text and “Selected only” survive
  navigation/reloads in `localStorage` (`mhx.catTree.prefs.v1`).

Colours come from the toolkit's page layer (`--mhx-pg-*`), not from the extension
palette: that is the rule for anything injected onto a Magento page
(UI-TOOLKIT.md §2), and `check:ui` G6 enforces it. The bar, list and pills follow
a light admin, Magento's own dark one and our themed dark one alike.
Toggle: `ENHANCE_CATEGORY_TREE`.

## Deliberately NOT ported

- The old toolbar **popup** (`popup.js`) — replaced by the side panel (the action
  now opens the panel).
- M3a source data (where the suggested name / short description come from),
  M3b–M7 — next milestones.

## Rules honored

- No Magento REST/GraphQL usage; nothing clicks Save (future field-apply work
  will be per-field Apply only, with snapshot + undo).
- SKU + store-view guards: no SKU entered = no fetch; results filter by the
  detected store view.
- Secret keys are never logged; the admin base URL is settings-driven.

## Copilot Notion MCP (workspace)

The workspace MCP server is configured in `.vscode/mcp.json` using Notion's
remote endpoint. To connect your account in VS Code, run **MCP: List Servers**
from the Command Palette, start `notion`, and complete the Notion OAuth prompt.
The authorization is stored by VS Code, not in this repository. Notion MCP can
read and write content available to the authorizing account.

This agent connection is separate from the extension's Notion API settings.
The extension's Notion client remains guarded: Listing Errors are
create-only; the only property-update exception is the confirmed, whitelisted
SKU Library writer in `src/lib/skuLibraryWriter.ts`. The extension does not
delete Notion pages or append blocks.

## Model bridge providers (2026-10-26)

Settings → **Model bridge** offers two adapters and a picker grouped by where the
model runs:

| Group | Presets |
| --- | --- |
| Runs on this machine | `opencode` local server, Ollama `:11434/v1`, LM Studio `:1234/v1`, llama.cpp `:8080/v1` |
| Local gateway (borrowed sign-in) | CLIProxyAPI `:8317`, copilot-api `:4141`, LiteLLM `:4000` — paste the gateway's base URL |
| Hosted | Freebuff (`freebuff.com/api/v1/paid`), OpenRouter, Groq, Google Gemini (OpenAI-compatible), Z.AI / GLM (`api.z.ai/api/paas/v4`, free `*-flash` and `GLM-4.6V-Flash`), NVIDIA NIM (`integrate.api.nvidia.com/v1`, free dev serverless), Mistral, OpenAI |
| Other | any custom URL |

Any OpenAI-compatible endpoint works: the bridge probes `<base>/models`, scores
with `/chat/completions`, and negotiates JSON output down from strict
`json_schema` to `json_object` to a plain prompt. Keys live in
`chrome.storage.local` beside the Notion token; local servers need none. Hosted
presets are declared in `host_permissions`; a custom URL asks for its origin when
you press **Save**.

Cline, Google Antigravity, VS Code / GitHub Copilot and Kiro Crew are
**clients, not providers**: they sign in through their own interface and never
hand out a paste-able bearer key (GitHub Models, the VS Code-adjacent key route,
was retired on 30 Jul 2026). The **Clients & IDEs** card lists how each one
shares the same model — point the client at the local server above, or run a
local gateway (unofficial, borrows the OAuth session) and select the
`gateway` preset. Kiro Crew routes to hosted models through its own credit
system, so configure the matching hosted preset (e.g. Z.AI for GLM,
OpenRouter for DeepSeek/Qwen) to use the same model family.
