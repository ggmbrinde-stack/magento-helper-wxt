# Resolver backlog — open work

Last updated: 2026-10-30. Companion to `records/HANDOFF-EXTENSION.md` §6 (which
covers the whole extension); this file is scoped to **Resolve SKU**.

## Where the resolver stands

**Enabled SKU (storefront reachable)** — the full resolver path is available:
storefront payload, child SKUs with colour/size labels, variant matrix incl.
missing combinations, categories with Notion codes, Magento links for all store
scopes, and supplier attribution. Supplier availability is a separate verdict
attached to the result; it can legitimately be `unresolved` (for example, when
a supplier blocks automated requests or the catalogue URL is unconfirmed).

**Disabled SKU (no storefront page)** — works, but partial by nature. Parent id
is found via the grid, status is read from the grid row or the edit page's
`#status`, children come from the `Parent SKU` column (status-blind, so disabled
children are included), and their colour/size labels are merged in from the
parent's edit page. This gives an **admin-derived child/label matrix**, not a
storefront-verified variant matrix. The payload is `partial: true`,
`verified: false`, and is never cached. Because there is no storefront payload,
the normal storefront-based variant, image, and text audits cannot run; do not
present the admin labels as proof of storefront availability or completeness.

## How the admin side works (do not regress this)

- The grid endpoint is **`POST`** to
  `/admin_<front>/mui/index/render/key/<hash>/?isAjax=true`, parameters in the
  form body. A `GET` with query params is silently ignored by the controller.
- The URL secret key is **per route** and cannot be computed (server-side salt).
  It is scraped from the page (`mui/index/render/key/<hash>/`) and cached per
  origin + admin frontname. The address-bar key belongs to the page's own route
  and is rejected by the grid controller.
- Children are read by `filters[parent_sku]=<parent sku>`. A full page back
  (200 rows) means the filter was ignored — treat as no answer.
- When nothing else answers, a **background tab** is opened and walked to the
  parent's edit page, then closed. The operator's own tab is never navigated.

## Open items

Ordered by value per hour. Each names the file that owns the fix.

### R2 — Supplier catalogue URLs per SKU

MAKITO's product slugs are the product name, not the SKU
(`https://www.makito.eu/es/cable-cargador-soporte-zynix.html`), so no URL is
derivable; TOPTEX has no proven pattern either. Both stay `unresolved` until
`Supplier Product` is filled in Notion or an entry is added to
`src/audit/rules/supplierCatalog.ts` (one is seeded: `M22477`).

Until then the card shows a site-search link built from the SKU, marked as a
search, never as a catalogue product.

### R3 — Category comparison across languages

Breadcrumbs are read from the **EN** page. If SKU Library rows are filled in PT,
C5 (`buildCategoryCheck`) flags every product as a mismatch. Decide the mapping
and normalise the rows before enabling the check in batches.
`src/audit/skuResolution.ts`.

### R4 — `Sub-Subcategory` population

The property exists and is read, but rows are empty, so L3 is never compared
(both sides must be non-empty for a mismatch to be reported). Needs a population
pass, not a code change.

### R5 — Technical Information audit (B1–B8)

`getPdpFields` already parses `product-attribute-specs-table` and
`buildTextMatrix` lays the languages side by side. What is missing is the
per-attribute decision: which keys are required per category, which values are
mechanically checkable (grammage digits, composition summing to 100, dimensions),
and which are language noise. Decide as a table first.
`src/audit/textAudit.ts`, `docs/audit/AUDIT-FULL-RUN.md`.

### R6 — Sweep cadence for `discontinued-candidate`

The verdict needs two 404s at least 7 days apart. Nothing schedules that. Decide:
alarm, weekly job, or explicit action only.
`src/audit/supplierAvailability.ts`.

### R8 — Admin tab churn

Each resolve that needs admin data opens a background tab and closes it, and a
configurable that needs labels pays a second page load. Reusing one long-lived
tab for the session would remove both. `src/audit/skuResolution.ts`.

## Resolved

### R1 — Colour/size labels for disabled SKUs (done 2026-10-30)

The `parent_sku` query returns no colour/size columns. The admin-only path now
reads the parent's edit page once (`readMatrixTab`, own background tab) and merges
colour/size/status onto the grid rows by child id, so a disabled SKU has an
admin-derived child/label matrix. This is not a storefront-verified variant
matrix and cannot support the normal storefront-based variant, image, or text
audits. Enabled resolves are untouched: they already hold storefront labels and
do not pay the extra page load.
`src/audit/skuResolution.ts`.

### R7 — Status cache staleness (resolved 2026-10-30)

`magento_status.checked_at` is now printed beside the badge ("Enabled · as of
30/10 11:42"), so a verdict restored from a 14-day-old cache is visibly dated.
The value may still be stale; use **Refresh** to fetch current Magento data.
`src/dashboard/sections/audit/Resolver.tsx`.

### R9 — Storefront search wasted on disabled SKUs (done 2026-10-30)

The catalogsearch result page prints each card's SKU. `searchCards()` reads those
pairs, so a request whose SKU is absent from every card throws `SkuMismatchError`
**before** any PDP fetch (one request, ~180 ms instead of two plus a mismatch).
An exact card SKU is now authoritative even when the slug does not contain it
(`R0317C` → `carla-r0317-c`). When the admin path then answers, the mismatch is
reported as a notice ("M22477 has no storefront page - the search returned …")
instead of a red resolver error. `src/shared/resolver.ts`,
`src/audit/skuResolution.ts`.

## Fixed recently (context, do not re-report)

- Grid query was `GET` with REST-style filter params → nothing was ever filtered.
- Address-bar secret key reused for the grid route → `invalid Secret Key`.
- `roly.eu` missing from host permissions → every ROLY check was `fetch-error`.
- MAKITO availability attempted despite a permanent 403 → now `unresolved` with
  a pointer to the catalogue link.
- Partial payload built from the first admin pass (always empty) → children lost.
- Simple products labelled `configurable` and given no Magento link of their own.
- Tone badges rendered as plain text: CSS matched `data-tone`, components pass
  `db-ok` / `db-warn` / `db-bad` classes.
- Availability required a manual click; it now runs after a resolve when no
  verdict is stored.
- Child labels for disabled SKUs (R1), status read date (R7) and the wasted
  storefront PDP fetch (R9) — see **Resolved** above.
- Stale/foreign Product URL on a resolve no longer turns a resolvable SKU into
  an admin-only payload: the override is dropped when it does not match the
  current SKU, the backend retries by search, and the partial payload names the
  storefront failure it actually hit. `src/dashboard/shell/workspace.ts`,
  `src/dashboard/sections/audit/Resolver.tsx`, `src/audit/skuResolution.ts`.
