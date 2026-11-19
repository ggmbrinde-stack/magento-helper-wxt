# Project State — BOG Helper (PP Preview lane)

**Date:** 2026-11-19
**Branch:** `experimental/drime-integration` (NOT `codex/release-baseline`)
**Working tree:** `tmp/pp-preview-readability-candidate` (candidate tree; `src/` at repo root is untouched baseline)
**Build id / version:** pp-order-4 · v0.2.1
**Staged build:** `b6e568acc8035de045ee3ae57b309bf3e034ca9fada2981ca10ceca77c519daa`, staged 2026-11-19 12:11 (its backup is `tmp/experimental-before-pp-remove-tab-20261119-121120-161`). It carries the review fixes, the placement fix, the search cap, the claimed-copy fix and the batched Order lane diagnostics.
**Commit status:** Backed up on `experimental/drime-integration` on 2026-11-19. Not built from the committed copy, not run live, and not merged to `main`.

---

## 2026-11-19 — duplicate techniques, fourteen approved bugs

Explicit approval was given to change add/remove/order/save write behaviour for the duplicate
technique set. Items 1, 2, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16 and 18 are fixed; 3, 6, 7, 17,
19 and 20 were already fixed. Item 11 was named only in the limitation table, not in the
request's list of numbers, but it is the same duplicate-identity defect in the remove lane and
it was included. `docs/ui/PP-PREVIEW-KNOWN-LIMITATIONS.md` is authoritative for each item.

### The rule that was adopted

One stored row satisfies one planned occurrence, and one plan row adds, removes, moves or
verifies exactly one row. A face holds what Notion lists, including a technique listed twice.

### Files changed

| File | Change |
|------|--------|
| `src/dashboard/sections/ui/ppPreviewModel.ts` | `ppUpdatePlan` counts occurrences; `ppOrderCheck`, `ppApplyPlannedOrder`, `ppDropRemovedRows`, `ppSavedVerification`, `ppRemovedVerification` match one occurrence to one row |
| `src/dashboard/sections/ui/PpPreview.tsx` | `removeKey` used for both the tick and the selection (a tick matched nothing before); confirm list shows the plan's `Add` rows; save sends the arrangement; remove note says one tick is one row |
| `src/page/features/pp-scan/apply.ts` | counted pairs so a second copy is added; every plan row kept; `arrangement` (`append` or `plan`); `waitForOrder` checks the last row of the face |
| `src/page/features/pp-scan/remove.ts` | each plan row removes one row and skips rows Magento only hid |
| `src/page/features/pp-scan/save.ts` | `readPpItemPairs` returns one pair per row |
| `src/entrypoints/background/ppFreshForm.ts` | save pre-check counts pairs; order mode and save pass the arrangement |
| `src/entrypoints/background/routers/ui.ts` | passes `message.arrangement` to `savePpForm` |
| `src/core/messages/ui.ts` | optional `arrangement?: 'append' \| 'plan'` on `SAVE_PP_FORM` |
| `tests/ppPreview.test.ts` | 4 new duplicate tests |
| `tests/ppApply.test.ts` | 2 new tests (second copy, plan arrangement) |
| `tests/ppSave.test.ts` | 2 new tests (one pair per row, one stored copy per written row) |

### Behaviour changes the operator will see

- The plan says "7 to add" for PP 963 instead of 6, and a repeated technique appears twice in
the plan table, once `Already present` and once `Add`.
- `Set the row order from Notion` now puts planned rows at the **first** places of their face in
Notion order instead of always at the end. Rows Notion does not name follow them.
- The save pre-check refuses when a repeated technique has only one row in the helper form,
where it used to accept one copy as satisfying both.
- The read-back reports a written duplicate as missing unless a second stored copy exists, and
calls a row misplaced only when it sits before a row written earlier on that face.
- The remove table works again: before this round a tick selected nothing, because the checkbox
key carried the row position and the selection compared without it.

### Verification (2026-11-19)

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `test:pp-apply` | 26 pass (24 existing + 2 new) |
| `test:pp-preview` | 25 pass (21 existing + 4 new) |
| `test:pp-save` | 11 pass (9 existing + 2 new) |
| `test:pp-scan` | 23 pass |
| `test:features` | 14 pass |
| `npm run build` | 0 errors |

`test:pp-catalog` was not rerun in this round; no catalogue code changed. Nothing was staged, so
`chrome-installs/experimental` still holds the 2026-11-18 build.

### Not verified

No live Magento page. The duplicate add, the plan-first arrangement, the count-aware save
pre-check and the occurrence-aware read-back have only run against jsdom fixtures. An operator
run on PP 963 Caixa (technique listed twice) is still required before any of it is called
confirmed.

---

## Files changed on 2026-11-18 (uncommitted)

### Source fixes (6 maintenance-scope items)

| # | Fix | File |
|---|-----|------|
| 3 | Order verdict now says "→ move down" for out-of-place rows | `src/dashboard/sections/ui/ppPreviewModel.ts` (~L497) |
| 6 | Face key preserves word order (no `.sort()` — "Face 1 Artigo" ≠ "Artigo Face 1") | `src/dashboard/sections/ui/ppPreviewModel.ts` (~L302) |
| 7 | Missing face shows `(face key_xxx)` instead of raw `key_hwl1rm` | `src/dashboard/sections/ui/ppPreviewModel.ts` (~L194) |
| 17 | Remove checkbox key now includes row position (`face\|id\|position`) so duplicates on one face can be ticked separately | `src/dashboard/sections/ui/PpPreview.tsx` (~L496) |
| 19 | Confirm add list excludes techniques already present on the face (matches what apply will actually do) | `src/dashboard/sections/ui/PpPreview.tsx` (~L549) |
| 20 | Entity ID `0` now accepted (regex `^(0\|[1-9]\d{0,15})$`) | `src/entrypoints/background/ppFreshForm.ts` (~L80) |

### Test updates

- `tests/ppPreview.test.ts` — 2 assertions updated for intentional behavior changes:
  - `key_missing` → `(face key_missing)` (raw key ID display fix)
  - `['Laser Metal']` → `['Laser Metal → move down']` (order verdict direction fix)

### New docs

- `docs/ui/PP-PREVIEW-KNOWN-LIMITATIONS.md` — all 20 known bugs, root cause, status, fix complexity, freeze-approval requirement
- `docs/ui/PP-DUPLICATE-TECHNIQUE-LIMITATION.md` — the specific PP 963 Caixa duplicate-technique case
- `docs/ui/PP-DATABASE-CHOOSER-FINDING.md` — why a PP vs PP v2 Notion database chooser is not possible under feature freeze

---

## Verification results

| Suite | Result |
|-------|--------|
| typecheck (`tsc --noEmit`) | 0 errors ✓ |
| test:pp-catalog | 41/41 pass ✓ (36 original + 5 new complicated-code cases) |
| test:pp-apply | 24/24 pass ✓ |
| test:pp-preview | 21/21 pass ✓ |
| test:pp-save | 9/9 pass ✓ |
| test:pp-scan | 23/23 pass ✓ |
| test:features | 14/14 pass ✓ |

---

## Known bugs — 20 total (all trace to one root cause)

**Root cause:** The extension assumes each technique appears at most once per Magento face. PP 963's Notion Caixa face lists "Laser CO2 (Madeira) - Até 250 cm2" twice (first and last), but Magento has it once. The extension cannot express "this face needs this technique twice."

**All 20 are closed as of 2026-11-19.** The two tables below are kept as the 2026-11-18 record;
the per-item change is in `docs/ui/PP-PREVIEW-KNOWN-LIMITATIONS.md`.

### Fixed (maintenance scope, no freeze approval needed)

| # | Bug | Status |
|---|-----|--------|
| 3 | Order verdict didn't say which way to move | ✓ Fixed — now says "→ move down" |
| 6 | Face key collision (`ppFaceKey` sorted tokens) | ✓ Fixed — preserves word order |
| 7 | Face shows raw key ID when locations/items out of sync | ✓ Fixed — shows `(face key_xxx)` |
| 17 | Remove checkbox key collapses duplicates | ✓ Fixed — includes row position |
| 19 | Confirm list vs apply mismatch | ✓ Fixed — excludes already-present rows |
| 20 | Entity ID regex rejected `0` | ✓ Fixed — accepts `0` |

### Closed on 2026-11-19 with explicit approval (write behaviour)

Every row below was fixed after approval to change add/remove/order/save write behaviour. The
change per item is recorded in `docs/ui/PP-PREVIEW-KNOWN-LIMITATIONS.md`.

| # | Bug | Complexity | File |
|---|-----|------------|------|
| 1 | Duplicate technique per face not counted (says "6 to add" not "7") | High | `ppPreviewModel.ts:368`, `apply.ts:419` |
| 2 | Order always moves rows to end — Notion may want them first | Medium | `ppPreviewModel.ts:437` |
| 4 | Remove drops all copies of a duplicate at once | Medium | `ppPreviewModel.ts:460-463` |
| 5 | Save verification miscounts with duplicates | Medium | `ppPreviewModel.ts:542-555` |
| 8 | Second occurrence never proposed (marked "present" when id exists once) | Medium | `ppPreviewModel.ts:368` |
| 9 | Save pre-check collapses duplicates via `Set` | Medium | `ppFreshForm.ts:818` |
| 10 | `readPpItemPairs` dedups pairs | Medium | `save.ts:59` |
| 12 | `ppDropRemovedRows` drops ALL matches | Medium | `ppPreviewModel.ts:460-463` |
| 13 | Order plan dedups ids per face | Medium | `apply.ts:580-585` |
| 14 | `ppApplyPlannedOrder` dedups ids | Medium | `ppPreviewModel.ts:419` |
| 15 | `ppSavedVerification` uses `findIndex` (first match) | Medium | `ppPreviewModel.ts:548-549` |
| 16 | `ppOrderCheck` dedups planned rows | Medium | `ppPreviewModel.ts:489-490` |
| 18 | Apply skips "already on this face" — second copy never added | Medium | `apply.ts:372` |

---

## Other open items

### PP 42 order bug (unresolved, pre-existing)
- Magento keeps Laser Metal (id 11) before Tampografia (id 1); writing `elems` doesn't change stored order.
- Root cause unknown (Sort descending vs record-id newest vs array order).
- Requires live Magento operator experiments (Sort test or drag-drop test) — agent has no admin session.

### Notion database chooser (PP vs PP v2) — decided, not built
- Only one hardcoded `PP_CATALOG_DATABASE` (`src/shared/ppCatalog.ts:3`).
- A chooser is a new lane: second database, persisted choice, threading through the readers,
  the audit router and the message contracts, plus new failure states when the two disagree.
- None of the 2026-11-19 fixes depends on it. Decision recorded in
  `docs/ui/PP-DATABASE-CHOOSER-FINDING.md`; it needs its own approval if it is wanted later.

### UI/UX improvements (`tmp/UI-UX-PROMPT.md`) — reviewed, nothing to do
- The six friction points in that prompt are already in the panel: the order verdict sits
  directly above the order button and names the direction, `Confirm: set the order` updates the
  panel model through `ppApplyPlannedOrder` so the verdict changes without a refresh, the save
  section restates that it brings the helper tab forward and presses Magento's own Save, the
  catalogue table has both empty states (`No catalogue rows loaded yet`, `No loaded record
  matches this search`), and the record-list diagnostics are one signal line inside a collapsed
  block.
- The one item that is not implemented, pre-filling the Magento entity ID from the Notion
  record, would assert an unverified Notion-to-Magento association, so it stays manual.
- The duplicate work above added the only UI text that was missing: one tick in the remove
  table is one row.

---

## Batch PP work

### Slice 0, shipped 2026-11-19 (no new write behaviour)

The Batch work tab is no longer a dead screen. It is a queue over the ticked catalogue rows that
hands one code at a time to the existing single-PP lane.

- `src/dashboard/sections/ui/PpBatchWork.tsx`: queue summary (queued, left, saved, need
  attention), a current-code card with Open, Skip and Next, and a status table. It sends no
  preview, apply, order or save request and saves nothing.
- `src/dashboard/sections/ui/PpPreview.tsx`: keeps a per-code result map written only by the
  existing single-PP lane. Apply records `Applied, unsaved` with the handled row count; save
  records `Saved` or `Needs attention` with the lane reason. Opening a code invalidates the
  previous preview, switches to One PP at a time, selects the code and clears the entity field,
  so the pairing stays manual.
- The current code is the first one neither saved nor skipped, so the queue advances by itself
  without stealing the screen. Selecting a row overrides that until it is finished.
- The mode tabs are named for progress and carry live counters: `Single progress` shows the
  current PP state (No preview, N to add, Read only, Applied unsaved, Save blocked, Saved) and
  `Batch progress` shows `N of M saved`. Both read the same per-code result map.
- Single mode also shows a progress strip under the tabs once a preview exists: PP code, state,
  plan counts, order verdict and the read-back time, so one PP's progress sits in one place.

### Recorded 2026-11-19, operator paste on PP 963

State as observed, before the batched fill and before any removal was run:

| Item | Value |
|------|-------|
| Plan | 7 to add, 15 already present, 0 review, 6 rows out of Notion order |
| Untouched rows | 14 |
| Tick helper | `Tick the 14 rows Notion does not ask for` |
| Magento | 7 faces, 29 option rows, attribute set 1105 |
| Notion | partial, code 963, needs review |

Where the 14 come from, per face, from the operator's Notion table:

- Artigo de Escrita Face 1 lists 19 and 2 only, so ids 1, 31 and 15 are extras there.
- Face 2 lists 19, 31 and 15, so ids 1 and 2 are extras.
- Powerbank Face Natural lists 19 and 2, so ids 1, 32 and 15 are extras.
- Powerbank Face ABS lists 19 and 2, so ids 1 and 32 are extras.
- Cabo Face Natural lists 19, 32 and 15, so ids 1 and 2 are extras.
- Cabo Face ABS lists 19 and 32, so ids 1 and 2 are extras.
- Caixa lists all seven of its stored rows, so it contributes none.

Three things to settle before the button is used here:

1. Those ticks delete techniques Notion does list on *other* faces, for example 31 and 15 on Face 1.
   That is the per-face rule working as designed, but it is a real deletion and needs an operator
   decision, not a default.
2. The Notion reference is `partial` and the code row is `Needs review`. The tick helper only
   stands down for plan rows with no exact catalogue id, and there are none right now.
3. The remove lane has not been run on this PP at all, and the batched fill has not been run yet
   either: the last two runs timed out at 90s and 200s on the single-call fill.

A fill of more than three rows now runs in batches of three, each with its own budget. Every
addition waits on the native button and three dropdowns, and seven rows outlasted a single 200
second call. A batch that fails reads the helper form again and reports how many item rows it
holds, so a timeout names the state of the page instead of only the clock.

Trimming to match Notion starts from the same plan. `ppExtraCopies` keeps exactly as many stored
copies per face and technique as the Notion list names and returns the rest, and the Remove section
offers them as one click: `Tick the N row(s) Notion does not ask for`, plus `Clear ticks`. A tick is
a selection only; nothing is removed until the operator confirms and nothing is written until Save.
If any plan row has no exact catalogue id, the helper stands down completely, because an unresolved
Notion row makes its technique look absent and a tick could delete a copy Notion does ask for.

The add lane resolves a new row by the last items segment that carries a number, because the live
page repeats the segment (`options[sub_options_items][sub_options_items][6][parent]`). Reading the
first one returned the word itself and the lookup matched the first row, so a fill could edit
older rows. A new row with no numeric index now stops the lane before it touches any row.

The Notion face table is read without splitting option labels on their own pipe: the face comes
from before the first `|`, the middle column is kept whole and only the empty Notes column is
cropped. Before this, a label such as `BLOCOS PEQUENOS | OUTROS` cut the rest of the row, which
is why PP 963 showed 6 to add instead of 7 and 3 rows as "Review".

The loaded Grid can hold a whole page at once: PP 963's page has 925 rows with a page size of
1000, which the earlier 500 row limit refused as `incomplete`. The reader now accepts up to 5000
rows and a page size up to 5000, which covers the Grid's own page-size choices, and the refusal
still names the count it rejected.

When the Grid path is blocked, `scripts/probe-pp-options-page.js` reads the Options tab of an
edit page by hand: paste it into the DevTools console of
`/toogas/customoption/edit/id/<entity id>/`. It is read-only (it opens the Options tab and reads
the rendered Items rows), prints face, catalogue option, label, sort and store per row, and
reports repeated technique pairs per face.

Grid read refusals now name the loaded field they rejected (`Rejected: params.filters has an
unsupported key: ...`), in the connection reason and in Diagnostics. The acceptance rules are
unchanged; this only replaces one shared sentence with the cause.

Checked on 2026-11-19: typecheck 0, `test:pp-selection` new batch test passes, `test:pp-preview`
25, `test:pp-apply` 26, `test:pp-save` 11, `test:pp-scan` 23, `test:features` 14, build 0.

**Pre-existing failures, not from this work:** `test:pp-selection` still reports 8 failures in
`tests/ppCatalogSelection.test.ts` (6) and `tests/ppFreshForm.test.ts` (2). They are stale
assertions against wording and flow from earlier approved changes, for example expecting
`freshness unverified` and `Current: CURRENT OPEN-PAGE DRAFT`, which the panel no longer renders,
and expecting no Magento read to start while the Notion details are still being read, while the
lane now starts both and cancels on rejection. They were red before this round and are left
untouched rather than relaxed.

### Slice 1, planned, needs approval to build

A sequential runner that does preview, apply, order and save per code without the operator
stepping through each one. Decisions already taken by the operator on 2026-11-19:

- Magento entity ids come from a Notion property. The property name still has to be confirmed
  against the PP database schema, and the index row type would gain one field.
- One standing confirmation for a run authorises the saves; every written row is still read back
  and reported per code.
- It must stop on the first failure and keep a per-code verdict, and it must serialize: the worker
  allows one active job, one cleanup guard and one filled helper tab, so open, fill, save, close,
  next is the only order that works.

Reusable machinery: `src/automation/batch.ts`, `batchRunner.ts` and `batchState.ts` already
persist a job per row in `chrome.storage.local`, mark stages, pause, cancel and resume after a
worker suspension.

### Slice 2, planned

Automatic code to entity resolution. This is the hard part and it is a data question first: the
property name, whether it is populated for every queued PP, and what the runner does when a
record has no entity id.

---

## Commands (run in `tmp/pp-preview-readability-candidate`)

```
export PATH="$PWD/../../node_modules/.bin:$PATH"
node ../../node_modules/typescript/bin/tsc --noEmit          # typecheck
npm run test:pp-catalog                                       # catalogue (41 tests)
npm run test:pp-apply                                         # apply (29 tests)
npm run test:pp-preview                                       # preview panel (30 tests)
npm run test:pp-save                                          # save (11 tests)
npm run test:pp-scan                                          # scan (23 tests)
npm run test:features                                         # feature catalog (14 tests)
npm run build                                                 # full build
```

Stage from repo root (only if operator asks): `node tmp/stage-experimental-pp-session.cjs`. It copies `.output/chrome-mv3` and does not build it, so run `npm run build` in the candidate first; staging without a build ships the previous code.

---

## What NOT to do (feature freeze)

- No commits, pushes, merges, releases, Notion writes, or external messages unless explicitly requested.
- No new product features, redesigns, or broad refactors.
- No changes to `src/page/`, `src/entrypoints/`, or `src/shared/` message contracts unless a UI label change requires it.
- Nothing committed so far — do not commit without explicit request.

## Code review 2026-11-19, fixes

- Save after a fill works again. The panel keeps the rows the change handled (`ppHandledRows`) instead of
  re-deriving them from the plan, which the read-back re-bases onto the form. The confirm list, the save
  request and the post-save verification all use those rows. An order apply keeps the whole list it sent,
  because saving that arrangement writes every row, not only the ones that moved.
- `ppApplyStatus`: a run where every row was already present is `applied`, not `failed`, so a retry no
  longer reports failure and hides Save.
- A batch fill that fails partway returns `partial` when rows from finished batches landed, so the save
  section is still offered.
- Ticks are cleared whenever a read-back moves the rows, because a tick key carries the row position.
- The read-back note names its source: the unsaved helper form, or the stored record read after Save.
- `ppExtraCopies` stands down on review rows as well as on unresolved catalogue ids.
- `ppLocationRows` drops the declared Notes column instead of gluing its text onto the last option.
- `ppLaneFailure` also redacts a query string.

Checks: tsc 0, `test:pp-preview` 30 (includes `ppSaveRows`, which locks the order rule), `test:pp-apply` 29, `test:pp-save` 11, `test:pp-selection` 100 pass
with the same 8 stale failures, build 0. Nothing was run live against Magento.

### Placement 2026-11-19

The add lane only read own properties of the row's view model, so the dynamic-rows record list was
never seen when it sat on the component prototype. That is why three added rows reported "its list was
not found" and stayed at the top of the table. `listWriters` now reads `elems` through the prototype
chain, which is the name that component uses, and still scans own properties for other list names.
Probing every inherited property was rejected: it offered unrelated arrays as the posted list.

A record is only moved inside an array that holds both the new record and the last record of its face,
matched as objects, so a duplicate technique on the same face cannot make the lane move a different
record or pick a different face's list. The visible check after the move still looks at the id of the
last row of the face, so a duplicate that already sits last could still make an unplaced row look
placed; that weakness predates this change and was not touched.

The 12:08 live run on PP 963 still reported the screen-only move (`Row shown below its face, but its
list was not found`), so the model list is still not being found on that page. The batched fill used to
drop the placement diagnostics; it now keeps the last batch's, so the Order lane panel names the list
counts on the next run.

Test: `a saved-order list defined on the component prototype is still found`. The batch timing is not
measured, so the 90 second wall is not proven gone.

### Claimed copies 2026-11-19

A technique Notion lists twice arrives as one present row and one add row, and the page only receives
the add rows. The lane counted the stored copy as satisfying the add and skipped it, which is why
Caixa 19 was reported `skipped` while the plan still asked for it. Each add row now carries `claimed`,
the number of present rows for the same face and id, and the lane subtracts those copies before it
decides. Test: `a present row claims the stored copy, so the planned second copy is still added`.

### Search 2026-11-19

The search box re-drew every matching row on each keystroke, and the catalogue can hold 5,000 rows
(50 pages of 100). A jsdom measurement with 5,000 rows: 35,073 nodes in the table, 81 to 105 ms per
keystroke that keeps the rows visible, and 389 ms to clear the box. The filter itself takes 0.3 ms.
The panel now draws at most `PP_SEARCH_CAP` (200) matches and names the full count, so the same run
renders 1,473 nodes, 3 to 6 ms per keystroke and 11.5 ms to clear. Rows beyond the cap need a narrower
query; they are counted, not silently dropped. Measured in jsdom, not in Chrome. `remove.ts` carries the same instance-only read in
its own `listWriters`; it was left alone because removal behaviour is out of scope.
