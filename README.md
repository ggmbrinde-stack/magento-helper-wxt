# BOG Helper (WXT) — plan-stack migration

Migration target for the BestOfGifts admin helper extension, built on the stack
chosen in the Notion Build Plan: **TypeScript strict · WXT (MV3) · Zod · Preact
in Shadow DOM**, with all Notion calls from the service worker only.

The current working extension stays untouched in
[`../sku-copy-button/`](../sku-copy-button/) and still loads independently —
this folder is a separate, loadable extension.

## Development rule — Notion is CREATE-ONLY (board direction, 2026-10-19)

> "create rows only — never update, delete, or append."

The extension may **create** Listing Errors rows, but never update properties,
delete pages, or append blocks. Dedup (`SKU + Error title`) runs before every
create.

This is enforced, not just intended:

- `src/lib/notion.ts` routes every Notion call through a guarded fetch:
  `readOnlyNotionFetch` (query / search / GET) and `createOnlyNotionFetch`
  (the same reads **plus** `POST /v1/pages` only). Anything else throws
  `NotionWriteBlockedError`.
- `npm run check:notion` statically fails the build if any source references a
  Notion update/delete/schema endpoint or issues an unguarded `fetch`.
- `npm run build` and `npm run typecheck` both stay green alongside it.

Notion writes also require `NOTION_WRITES_ENABLED` (`src/lib/flags.ts`) **and**
an explicit `confirm: true` from the UI.

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
- **M3a (first increment) — fill `name` / `short_description`** — a “Fill
  fields” panel reads the open product form (`product[name]`,
  `product[short_description]`), shows the page SKU and store-view scope, and
  writes each field with per-field **Apply** / **Undo**. Values are written
  through the element's native setter plus `input`/`change` events so Magento's
  UI components actually observe them. A pre-apply snapshot per field powers
  Undo. **No Save button is ever clicked** — the operator saves themselves.
- **M3a guards** — every apply and undo is refused unless the open page is a
  product edit page, the page SKU matches the SKU selected in the panel
  (case-insensitive), and the store view matches the detected scope.
- **Notion client** — rate-limited request queue (~3 req/s) with 429 backoff;
  property extractors for title / rich_text / select / multi_select / url /
  date; Zod schemas for both databases.
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

Content script matches are currently defaulted to the QA admin host
(`bestofgifts-pt-qa.toogas.net`) in `src/entrypoints/content.ts`; the live host
belongs in extension settings, not in committed code.

## V2 port (2026-10-16)

Read-only half of the V2 port, in the same stack. `npm run typecheck`,
`npm run check:notion`, and `npm run build` all stay green.

- **5-tab panel** — Data / Config / Lookup / Fill / Settings.
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
- **Lookup tab (`LookupPanel.tsx`)** — full chain ported: resolver cache → Notion
  → storefront scrape → admin-grid search (`LOOKUP_SKU` → `lib/lookup.ts`, with
  the content-script `SEARCH_MAGENTO` AJAX fallback). Renders Frontend / Backend
  / All-domains (EU/ES/FR) links with copy buttons, plus Category / Supplier /
  Status. The panel prefills the SKU from the open product page (`GET_SKU`).
- **On-page error indicators** — priority dots (High/Medium/Low) next to each
  matching form field, label colouring, hover tooltip, and auto-expanding
  collapsed sections. Driven by the `FETCH_ERROR_MARKUP` (panel/content) →
  `ERROR_MARKUP` (background → content) round-trip; the content script requests
  them automatically per product, and the Data tab has a **Mark fields** button.
- **Clipboard** — `clipboardWrite` permission plus an `execCommand` fallback.
- **Copy all SKUs** — grid toolbar buttons next to the search box that copy
  every SKU / Parent SKU currently listed on the page, newline-separated.
- **Dashboard page** (`src/dashboard/Dashboard.tsx`) — a full-page management UI,
  exposed **both** as the extension **Options page** (`entrypoints/options/`) and
  a standalone `dashboard.html` tab (button in the panel header). Extensible
  left-nav shell; sections: **Overview** (status + quick links), **Settings**
  (Notion token / DB ids / admin URL, with read-back verify), **SKU Lookup**
  (reuses `LookupPanel`), and **Resolver Cache** (list / delete / clear cached
  SKUs).
- **Audit workspace** (`src/dashboard/AuditDashboard.tsx`, `audit.html`) — a
  separate page reached from the dashboard sidebar or the panel header
  (**Audit**). Audit-only nav: **Audit home** (pipeline status), **Resolver**
  (variants matrix + Magento admin links), **Image audit** (live storefront
  media: duplicates / carousel order / pos0 background, with a generated
  `<!-- image-audit:begin -->` block), **Text audit** (live EN/ES/FR PDPs:
  untranslated text, gender, composition rules, JSON-LD brand, dimensions /
  grammage, with a generated `<!-- text-audit:begin -->` block), and **Push
  errors** (dossier markdown → Listing Errors payloads → create-only Notion
  write, dedup first).

Write features (fill, Page Builder, image upload/reorder) are ported/gated but
left **OFF** (`src/lib/flags.ts` → `WRITES_ENABLED = false`). Notion stays
**create-only** (`NOTION_WRITES_ENABLED = true`): new Listing Errors rows only,
never updates/deletes/appends.

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
   says. Our own injected widgets (copy buttons, the segmented pager) read
   `--mhx-*`, so they follow the accent in a light admin too. The page itself is
   light unless the operator asked for the dark admin.
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

The admin overrides are a first pass over the common surfaces and are unverified
against a live Magento admin; missing surfaces get added as they are reported.

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
nothing is added there. The toolbar's bulk **Actions** dropdown is deliberately
left alone — turning destructive bulk actions into always-visible buttons was
not asked for. The scan is idempotent, so Magento's AJAX grid reloads are picked
up by the existing debounced re-scan. Toggle: `ENHANCE_ROW_ACTIONS` in
`src/lib/flags.ts`.

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

## Toolbar massaction buttons (2026-10-20, placement 2026-10-21)

The grid toolbar's bulk **Actions** dropdown (`Delete`, `Change status`,
`Update attributes`, `Assign Inventory Source`, …) becomes one-click inline
buttons (`src/lib/massactionButtons.ts`), so bulk actions stop costing a
menu-open plus a pick from a nine-item list.

- **Forwarding only** — every button clicks Magento's OWN menu element, so
  the massaction selection check, confirmation modals ("Are you sure?"), KO
  handlers and ACL filtering all keep running. Nothing is submitted, written
  or requested by the extension; with no rows selected Magento replies
  exactly as it would for the stock menu.
- **Its own row, outside the dropdown** — the strip is inserted after the
  grid's last header row, i.e. the full-width line between the toolbar and the
  table. (First cut put it inside the dropdown wrap, where it inherited the
  trigger's width and stacked two buttons per line, half over the menu.) The
  native wrap is never restyled — only where the strip lives.
- **Submenus preserved** — nothing inside the Actions menu is flattened.
  Anything with a submenu (`Change status`, `Change attribute set`,
  `AI Translate`) stays reachable through the native dropdown, which stays
  visible and works exactly as Magento drew it.
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
- **Filter** — accent-insensitive search over names *and* numbers (“1.2.3”
  finds it, “textil” finds “Têxtil Promocional”), ancestors kept on screen.
- **View state persists** — mode, filter text and “Selected only” survive
  navigation/reloads in `localStorage` (`mhx.catTree.prefs.v1`).

Colours come from the shared `--mhx-*` palette (light fallbacks), so the bar,
list and pills follow the dark admin theme like the rest of the injected UI.
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
The extension's own Notion client remains guarded to reads and create-only
page writes; it does not update or delete Notion content.
