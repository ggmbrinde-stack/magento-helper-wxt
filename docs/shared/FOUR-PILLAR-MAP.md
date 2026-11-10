# Four business pillars

**Independent source-map review complete, 2026-11-06.** Not runtime or test certification. Snapshot: `main` at `dba3f426cb528a3c49679e586604cddec054ff0e`; read-only synthesis, no tests/build/live services checked.

Business pillars overlay technical lanes: UI presents, Audit owns readiness, Automation sequences existing work. The runner does **not** execute Disable -> Enable.

## 1. Magento UI

Catalog: 18 features plus global switch; static F1-F5 reported 19 entries/20 folders, including two services without switches. [`features.test.ts`](../../src/shared/__tests__/features.test.ts) covers detection, not interactions. **C** means catalog coverage; **NV** means behavior not verified.

| Features | User entry and data flow | Implementation pointers | Coverage |
|---|---|---|---|
| `extensionEnabled` | Settings store local preferences; enabled modules observe loaded/AJAX content. Existing controls after disabling were not checked. | [`content.ts`](../../src/entrypoints/content.ts):42 | C; mounted controls NV |
| `selects`, `paging` | Generic enhanced selects show search at 12 or more options; the store selector always shows search. The native select remains the value source. | [`scan.ts`](../../src/page/features/dropdowns/scan.ts):21-28, 45-51; [`paging-sizes`](../../src/page/features/paging-sizes/index.ts):94 | C for catalog detection; interactions NV |
| `navToggle`, `rowActions`, `massactions` | Sidebar toggle saves local preference. Row/grid actions forward to Magento handlers, submenus and confirmations. | [`nav-toggle`](../../src/page/features/nav-toggle/index.ts):439; [`row-actions`](../../src/page/features/row-actions/index.ts):76; [`massactions`](../../src/page/features/massactions/index.ts):373 | Row/mass detection C; behavior NV |
| `activeFilters` | Edit field filters; save pinned filters locally and reapply through Magento. | [`active-filters`](../../src/page/features/active-filters/index.ts):330 | NV |
| `gridCopy`, `skuCopy`, `productTypeBadge` | Copy grid/SKU/name, open product edit in another tab, identify simple/configurable product. | [`grid-copy`](../../src/page/features/grid-copy/index.ts):139; [`sku-copy`](../../src/page/features/sku-copy/index.ts):34; [`product-type`](../../src/page/features/product-type/index.ts):71 | Copy detection C; behavior NV |
| `storeViews`, `configButtons` | EN/ES/FR and open-all URLs; configuration groups read child colors/links and open grouped tabs. | [`store-views`](../../src/page/features/store-views/index.ts):6; [`config-groups`](../../src/page/features/config-groups/index.ts):55 | NV |
| `tierPrices` | Textil, Other items and Delete all update/remove rows through existing controls. Tiers are code constants, not fetched from Notion on click. | [`tier-prices`](../../src/page/features/tier-prices/index.ts):64 | Catalog detection C; behavior NV |
| `categoryTree` | Search, codes, selected labels, expansion, Linha Natura, rules and notes use an embedded index and native checkboxes. The actual `Default Category` root remains checked/enabled. | [`category-tree`](../../src/page/features/category-tree/index.ts):952, 1808 | NV |
| `errorMarkup` | SKU -> Audit request -> listing errors, priorities, reasons and match counts. | [`error-markup`](../../src/page/features/error-markup/index.ts):181 | Detection C; integration NV |
| `optionsCompanion`, `optionsItems` | Language fields and grouped custom options sync existing inputs and forward add/remove to original controls. | [`options-companion`](../../src/page/features/options-companion/index.ts):35; [`options-items`](../../src/page/features/options-items/index.ts):6 | NV |
| `assocBulk` | Up to 100 pasted SKUs; searches Magento filter, restores it and merges visible selection with off-page Knockout IDs. User presses Done. | [`assoc-bulk/page.ts`](../../src/page/features/assoc-bulk/page.ts):59 | NV; includes local changes below |

`pageActions` is disabled. `APPLY_FIELD` has SKU/store guards and `WRITES_ENABLED=false`, but other local UI changes remain possible. `grid-search` supplies Audit reads; fact tests exist, integration is unproven. [`Dashboard`](../../src/dashboard/shell/Dashboard.tsx):43 hosts Overview/Enable and Audit/Automation. [`sidepanel App`](../../src/entrypoints/sidepanel/App.tsx):20 has settings/dashboard link; toolkit docs retain removed Data/Config/Fill.

**Working-tree-only assoc-bulk changes:** local diff adds Stop, excludes existing SKUs, handles empty grids and adds `already`/`cancelled` response fields. Not published behavior. Two earlier UI findings are independently validated against current source (P2, live behavior unverified): disabled selects remain writable through custom choices, and `subtreeHasChecked(parent)` includes the parent box in its subtree check.

## 2. Audit

Audit collects facts and evidence; passing it does not authorize activation.

| Group | Inputs and decisions | Output and boundaries | Implementation and observed coverage |
|---|---|---|---|
| Resolution | SKU/URL, cache, storefront, Magento grid, Notion. Preserves identity/source/age/errors; admin facts complement products without public pages. Partial admin labels do not prove storefront availability. | Resolver, facts, categories, duplicates, intended matrix. [`skuResolution.ts`](../../src/audit/skuResolution.ts):799, 1180. Fact read tests exist; integration unproven. |
| Variants/categories | Color/size options and combinations, admin targets and Notion categories. Reports missing combinations, color families, review labels and category differences. | [`variants.ts`](../../src/audit/variants.ts):191. No dedicated suite observed. |
| Images/text | Per-child/language maps, optional hashes and background samples. English HTML reference, selected ES/FR, gender/composition and category rules. | Duplicate/missing images, order/language differences, first-image background, text matrix and review signals. Missing languages mean partial coverage. [`imageAudit.ts`](../../src/audit/imageAudit.ts):363; [`textFetch.ts`](../../src/audit/textFetch.ts):44; [`textAudit.ts`](../../src/audit/textAudit.ts):1211. No dedicated motor tests observed; Makito collection tests are separate. |
| Supplier/Makito | URL provenance, HTTP/title, Makito search/gallery. One 404 is not discontinuation; two checks seven days apart create a candidate only. | Availability, uncertainty, local history, reference images. [`supplierAvailability.ts`](../../src/audit/supplierAvailability.ts):381. Supplier/Makito tests exist. |
| Notion writes | Validated/deduplicated payloads. Listing Errors can create; Library edits an allowlist and supports readback. | Preview or write report behind explicit confirmation and permissions. [`audit router`](../../src/entrypoints/background/routers/audit.ts):483; [`skuLibraryWriter.ts`](../../src/audit/skuLibraryWriter.ts):691. Static guards exist; functional coverage unknown. |
| Evidence/health | Resolver, dossier, images, local files, processing and Notion setup produce exports, gaps, reports, diagnostics. Automation calls Audit's public API. | [`Batch.tsx`](../../src/dashboard/sections/automation/Batch.tsx):437; [`notionHealth.ts`](../../src/audit/notionHealth.ts):642; [`audit/index.ts`](../../src/audit/index.ts):1. Dedicated coverage not established. |

Entrypoints: Resolve SKU, Image audit, Text audit, Push errors, Notion health, cache. Background routes through [`audit router`](../../src/entrypoints/background/routers/audit.ts):219. These results do not auto-satisfy Enable.

## 3. Automation

| Capability | User entry and flow | Boundaries and observed coverage |
|---|---|---|
| Batch run | Batch -> Start validates SKUs/options and processes sequentially. Per SKU: resolve -> variants -> images/text in parallel -> payloads and dossier. Audit owns those functions. | `chrome.storage.local` persists state/cursor/results; a 30-second alarm and startup/wake resume at cursor, so interrupted SKU may repeat. Integrated runner tests not observed. [`batchRunner.ts`](../../src/automation/batchRunner.ts):159, 371, 580; [`background`](../../src/entrypoints/background/index.ts):45. |
| Controls | Pause/cancel abort `activeRun`; resume restarts processing; clear removes state when allowed. Abort does not reach model scoring. | Dedicated tests not observed. [`batchRunner.ts`](../../src/automation/batchRunner.ts):603; [`automation router`](../../src/entrypoints/background/routers/automation.ts):228. |
| Model | Bridge stores normalized URL/model/auth and checks access/health/catalog. Optional scoring uses up to 8 unique URLs and 2 positions per variant; validates/persists verdict, may mark Library `To Fix`. | OpenCode session reused per batch; quota lock in memory. No dedicated tests observed. [`modelBridge.ts`](../../src/automation/modelBridge.ts):429; [`modelSort.ts`](../../src/automation/modelSort.ts):131; `batchRunner.ts`:473. |
| Evidence and mirror | Folder permission gates evidence save, grouped by URL/hash. Reorder renumbers classifiable images; move/dedupe can alter files. Manifest compares hashes; confirmed stale retirement moves unknown hashes to `_superseded/stale`. | User controls/confirmations guard filesystem changes. Integrated tests not observed; Makito collection test is partial. [`export.ts`](../../src/audit/evidence/export.ts):221; [`mirrorTidy.ts`](../../src/automation/mirrorTidy.ts):141, 257, 374, 569. |
| Reports and pipeline | Coverage/status/supplier call Audit. Auto pipeline sequences save/reorder/move/manifest/coverage/status. Review & push uses Audit writer after validation, health, permission; JSON includes work/payloads/verdicts. | Supplier result reuse test exists. Notion write remains guarded. Runner does **not** execute Disable -> Enable. [`Batch.tsx`](../../src/dashboard/sections/automation/Batch.tsx):435, 547, 759; [`automation router`](../../src/entrypoints/background/routers/automation.ts):373; [`supplierAvailability.ts`](../../src/audit/supplierAvailability.ts):563. |

## 4. Disable -> Enable

This cross-lane workflow reuses [`enableFlow.ts`](../../src/audit/enableFlow.ts):529. Route: `#/enable` -> `LOAD_ENABLE_FLOW` -> resolver/Magento facts -> Notion PP -> readiness rows. Confirmations are per SKU. UI shows ready with no failures or manual checks. Audit owns logic; UI presents it; Automation does not run it. Ready is not Magento-enabled; Audit pass alone is insufficient. Activation remains manual.

The flow has 12 checks. **Manual** means an explicit human review or confirmation is required; **blocks** means a failed rule blocks readiness. Test references below point to existing tests, not tests run for this map. [`enableFlow.test.ts`](../../src/audit/__tests__/enableFlow.test.ts):98 covers selected preparation rules; [`adminFacts.test.ts`](../../src/audit/__tests__/adminFacts.test.ts):93 covers selected Magento facts.

| Check | Actual rule and manual gate | Existing coverage pointers |
|---|---|---|
| PP / attribute set | Numeric Magento code versus Notion. Difference/empty blocks; Notion error needs confirmation. No Notion row can pass Magento PP. “Not Applicable” with no PP is N/A. | `enableFlow.ts`:548; test:171, 199, 211, 224, 247, 268. |
| Categories | All selected Magento paths versus normalized Notion. Difference/empty blocks; unreadable source needs confirmation. Magento can pass without Notion row. | `enableFlow.ts`:689; tests:171, 224, 277, 289, 358. |
| Images | Always manual image audit confirmation; audit result is not consumed automatically. | `enableFlow.ts`:812; test:98 checks count only. |
| Colors and sizes | Child label sets versus admin targets. Incomplete labels need confirmation; missing expected values block. No known children is N/A. | `enableFlow.ts`:822; tests:98, 308; combination coverage unknown. |
| Size order | Admin targets or child sizes; numeric or XS-5XL aliases. Wrong order blocks; custom/missing values need review. | `enableFlow.ts`:877; tests:333, 342. |
| Tier discounts | Category selects Textile/Other snapshot (2026-11-02); compares tiers/percentages and converts fixed prices. Missing/different blocks; uncertain class or configurable parent without rows needs confirmation. | `enableFlow.ts`:921; tests:98, 374; `adminFacts.test.ts`:93, 105, 121, 133, 151. |
| Price and stock | Magento/supplier reads. Missing price and stock issues block; configurable parent/unknown type needs confirmation. WORKTEAM/JHK/ALLBEST stock exception. | `enableFlow.ts`:1048; tests:121, 136, 154. |
| Type | Configurable without children, or other type with children, blocks. Unknown type needs confirmation. | `enableFlow.ts`:1173; tests:98, 324. |
| Visibility | Configurable parent needs “Catalog, Search”. Empty/different blocks; unreadable or non-configurable needs contextual confirmation. | `enableFlow.ts`:1211; tests:98, 121; other branches unproven. |
| New colors | Always manual supplier catalog versus children; automatic detection undefined. | `enableFlow.ts`:1271; test:98 aggregate count only. |
| Attribute translations | Always manual composition, gender, ink color in EN/ES/FR; directs to text audit. | `enableFlow.ts`:1281; test:98 aggregate count only. |
| Text translations | Always manual name, short description, description in EN/ES/FR; directs to text audit. | `enableFlow.ts`:1291; test:98 aggregate count only. |

## Next analyses

1. Reconcile business rules and authority, especially when Notion/Magento has no row.
2. Target coverage for readiness edge cases, batch recovery/write guards and native Magento interactions.
3. Resolve toolkit/sidebar docs drift and the dated discount-table snapshot.
4. Run targeted regression checks and live confirmation for the two validated UI findings before release decisions.

Analysis priorities only, not fix authorization.
