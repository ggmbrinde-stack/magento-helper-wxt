# Audit summary — performance, defects, UI toolkit

**Date:** 2026-10-21 · **Scope:** `magento-helper-wxt` (content script, injected
UI, MV3 worker) · **Status:** analysis only, no `src` changes shipped.

Three documents, one per question:

| Document | Answers |
|---|---|
| [PERFORMANCE-CODE-AUDIT.md](PERFORMANCE-CODE-AUDIT.md) | how the extension runs, what it costs, what to optimise, and the 12-item **defect register** (Appendix A) |
| [UI-TOOLKIT.md](UI-TOOLKIT.md) | how to give every injected component one shared style system, delivered once like a CDN |
| this file | the short version: headline findings, clean checks, verification, limits |

---

## 1. Performance in one table

Warm scan of a synthetic Magento grid (real enhancer modules, 7 columns, 3
SKU-ish columns):

| Rows | Cold | Warm | Element queries / scan |
|---:|---:|---:|---:|
| 200 | 13.5 ms | 2.0 ms | 1,215 |
| 500 | 21.9 ms | 4.7 ms | 3,015 |
| 1,000 | 35.6 ms | 7.6–28 ms | 6,015 |

The cost is structural: **any** DOM mutation in `<body>` schedules the full
16-step `scan()` (`content.ts:1134`), which performs ~20–24 document-wide
selector passes and 6 element queries per grid row — repeated even when nothing
changed. Fixes are phased in the audit (§7); the top three are row/column
memoisation, one combined trigger query, and a dirty-subtree scheduler.

---

## 2. Defect register — headline items

12 verified entries in [Appendix A](PERFORMANCE-CODE-AUDIT.md#appendix-a--defect-register-2026-10-21).
Status (2026-10-21): **9 fixed** (D1–D6, D8, D10, D12), **3 remaining** (D7, D9, D11).

| # | Status | Sev | In one line |
|---|---|---|---|
| D1 | **Fixed** | High (latent) | Error `priority` is normalised when writing, but read raw from Notion — `HIGH`/`P1` renders as *low* and can never upgrade. |
| D2 | **Fixed** | Medium | Error indicators are never cleared, and `addIndicator` permanently rewrites Magento's label inline styles. |
| D3 | **Fixed** | Medium | Receiving error markup expands **every** collapsed section on the product page. |
| D4 | **Fixed** | Medium | `resolverMap` grows forever and has three racing read-modify-write paths. |
| D5 | **Fixed** | Medium | Bulk-actions strip can be inserted after the grid table on some header shapes. |
| D6 | **Fixed** | Medium | Copy-SKU buttons can land in another grid's toolbar (document-wide search-wrap fallback). |
| D7 | Open | Medium | Collapsed sidebar: an in-page replacement of `.page-wrapper` restores the rail margin while the rail stays hidden. |
| D8 | **Fixed** | Medium | The picker hides the native `<select>` with `display:none`, so validation focus targets a hidden node. |
| D9 | Open | Low | ACL-dependent massaction no-op. |
| D10 | **Fixed** | Low | Prefs written per keystroke (debounced via F15). |
| D11 | Open | Low | Light-palette flash before theme resolves. |
| D12 | **Fixed** | Low | `ERROR_MARKUP` always reports success (now reports matched/unmatched counts). |

### Checked and disproved

Message-type coverage (24 handled, zero orphans), batch pump locking, clipboard
fallback cleanup, Name-column copy buttons (documented), `GET_CONFIG` pending
retry, picker observer/`WeakMap` hygiene, error-field selector safety, and the
`WRITES_ENABLED` gate on field writes. Details in Appendix A.

---

## 3. UI toolkit — the missing seam

Measured today: **140** distinct `.mhx-*` classes, **15** defined in more than one
file, **152** hex literals inside injected CSS, **144** `!important`, **9**
separate `<style>` tags, **29,422 bytes** of CSS. The theme sheet
(`magentoTheme.ts`) re-styles ten `.mhx-nh-*` classes, i.e. it hardcodes another
module's class names — rename one and theming silently breaks.

Proposal ([UI-TOOLKIT.md](UI-TOOLKIT.md)): one `ui/toolkit.css` with ~10
primitives (`btn`, `group`, `seg`, `chip`, `badge`, `field`, `pop`, `bar`,
`toggle`, `toast`), two token layers (page-adaptive `currentColor`/`color-mix`
for injected chrome; `--mhx-*` only for our own surfaces), and factories so
features never write CSS. Delivery: `public/toolkit.css` exposed through
`web_accessible_resources` and injected once as a `<link>` (browser-cached,
CSP-safe) with an inline `<style>` fallback. `check:ui` guardrails fail the build
on new hex literals, duplicated primitives, theme code naming feature classes, or
a growing `!important` count.

---

## 4. Verification performed

- Bench numbers come from `.output/scanbench` running the **real** enhancer
  modules against a synthetic grid; query counts are deterministic, timings are
  ranges (see the note in the audit).
- Defects were established by reading the cited code paths; three checks were
  scripted (message-type coverage, dead lib files, class/colour inventory).
- Dead/broken diagnostic code found during the audit was removed from
  `adminNavToggle.ts` (≈183 lines), with the unparseable file preserved as
  `src/lib/adminNavToggle-diag.ts.bak`; the nav fixture was re-run afterwards
  (rail hides, offsets restore exactly) and `npx tsc --noEmit` is green.

## 5. Limits

- Nothing was reproduced against the live admin: D1, D4–D7 are labelled
  conditional (Notion option spelling, theme markup), not "confirmed bug".
- Preview screenshots are unavailable in this session (webview not compositing).
- `imageAudit.ts`, `textAudit.ts` and `notion.ts` parsing paths were not swept;
  the defect register is targeted, not exhaustive.
- No toolkit code exists yet — the migration estimates are targets derived from
  the inventory, not measurements of a build.

## 6. Progress & next steps

- **Completed fixes (2026-10-21):**
  - **D1–D4**: Priority normalisation, indicator cleanup, targeted ancestor section expansion, and single-writer resolver cache.
  - **D5, D6, D8, D12**: Strip positioning before grid table, strict outer grid toolbar scoping for copy buttons, focusable native `<select>` for validation with trigger focus forwarding, real matched/unmatched count response for `ERROR_MARKUP`.
  - **F10, F14, F15 / D10**: Dead diagnostic code removal, removal of redundant CSS blanket margin/padding zeroing on nav toggle, debounced search prefs writing in category tree.
- **Next steps**:
  - Address remaining defect items (D7 sidebar margin on dynamic replace, D9 ACL massaction fallback, D11 initial theme resolution flash).
  - Performance audit phases: F3/F4 grid row/column memoisation and table sorting optimisation.
