# PP Preview — known bugs and limitations

**Updated:** 2026-11-19
**Status:** 20 of 20 items closed. Fourteen of them were closed on 2026-11-19 with explicit
approval to change add/remove/order/save write behaviour; the other six were closed earlier
under maintenance scope.

The one open PP Preview question that is **not** in this list is the stored row order of PP 42
(Magento keeps Laser Metal before Tampografia and writing the record list does not change what
the server stores). It is tracked in `docs/ui/PP-PREVIEW-CURRENT-STATE.md` and is not caused by
duplicate techniques.

---

## Root cause (all of it)

One assumption ran through the whole lane: **each technique appears at most once per Magento
face.** Real Notion data breaks that. PP 963's Caixa face lists "Laser CO2 (Madeira) - Até
250 cm2" twice, first and last, while Magento holds it once.

Every lane asked "is this catalogue id on this face?" — a yes/no question — instead of "how
many copies of it are on this face, and how many does Notion ask for?". A single stored copy
therefore satisfied every occurrence in the plan, order check, save pre-check and read-back,
and one tick in the remove table matched every copy at once.

The fix is one rule applied in each lane:

> **Occurrences, not presence.** One stored row satisfies one planned occurrence. One plan row
> adds, removes, moves or verifies exactly one row. A face holds what Notion lists, including a
> technique listed twice.

---

## Bugs 1–8: duplicate technique per face

### 1. Duplicate technique per face not counted — fixed

**Was:** the plan asked "is this id on this face?" and counted "6 to add" when the answer was 7.

**Now:** `ppUpdatePlan` (`src/dashboard/sections/ui/ppPreviewModel.ts`) keeps a per-face counter
of stored copies (`reuseExisting`). Each planned occurrence consumes one stored copy; when none
is left the occurrence is `add` instead of `present`. A face that lists a technique twice with
one stored copy therefore plans one `already on this face` and one `Add`.

### 2. Order moves rows to end — fixed

**Was:** the order lane always put planned rows at the end of their face, so a technique Notion
lists first could never be first.

**Now:** `placePpItemRows` takes an `arrangement` argument.

- `append` (add lane, rebuild lane, default): planned rows go after the rows of their face, in
  plan order. This is where a newly added row belongs.
- `plan` (order lane): planned rows take the **first** places of their face in plan order, and
  every row the plan does not name follows in the order it already holds.

Order mode uses `plan`; the save lane repeats the placement with the same arrangement, so a save
can no longer undo the order the operator just confirmed. The arrangement travels on the
`SAVE_PP_FORM` message as the optional field `arrangement?: 'append' | 'plan'`
(`src/core/messages/ui.ts`, `src/entrypoints/background/routers/ui.ts`,
`src/entrypoints/background/ppFreshForm.ts`).

The panel's own read-back model does the same in `ppApplyPlannedOrder`.

### 3. Order verdict doesn't say which way to move — fixed (maintenance scope)

The verdict names the direction, for example `Laser Metal → move down`.

### 4. Remove deletes all copies at once — fixed

**Was:** one removed entry dropped every row on the face with that catalogue id.

**Now:** `ppDropRemovedRows` counts the removed entries per face and id and drops exactly that
many stored rows. Removing one of two copies leaves the other one in the panel, and two ticked
copies remove both.

### 5. Save verification miscounts with duplicates — fixed

**Was:** the read-back assumed every written row sat at the end of its face and used the first
matching stored row, so correct saves were reported as misplaced.

**Now:** `ppSavedVerification` matches each written row to its own stored row, and calls a row
misplaced only when it sits **before** a row written earlier on the same face. That is the order
the lanes guarantee, and it holds whatever rows the plan does not name.

### 6. Two faces with the same words get mixed up — fixed (maintenance scope)

`ppFaceKey` preserves word order, so "Face 1 Artigo de Escrita" and "Artigo de Escrita Face 1"
are different keys.

### 7. Face name shows as garbage code — fixed (maintenance scope)

A location with no readable Magento name shows as `(face key_xxx)` instead of a raw key.

### 8. Second occurrence never proposed — fixed

Same code as item 1: `onFace.some(...)` was replaced by per-occurrence counting.

---

## Bugs 9–19: save, remove, order, apply

### 9. Save pre-check collapses duplicates — fixed

**Was:** `savePpForm` built a `Set` of face+id pairs, so one stored copy satisfied a plan that
asked for two.

**Now:** the pairs collected from the helper form are counted, and each planned row consumes one
of them. The refusal count is a count of missing rows, not of distinct pairs.

### 10. `readPpItemPairs` dedups pairs — fixed

**Was:** the injected reader pushed a pair only once, so the save lane could not see two copies.

**Now:** it returns one pair per row (`src/page/features/pp-scan/save.ts`).

### 11. Remove `.find()` returns first match only — fixed

**Was:** after one removal the row stayed in the table (Knockout hides it) and the next plan row
matched the same hidden row and failed.

**Now:** the remove lane skips rows that count as gone (`!hiddenRow(candidate)`), so the next
copy of the same technique is the one that is picked for the next plan row.

### 12. `ppDropRemovedRows` drops ALL matches — fixed

Same change as item 4.

### 13. Order plan dedups ids per face — fixed

**Was:** `placePpItemRows` pushed a catalogue id into a face group only once.

**Now:** every plan row is kept, and both arrangements (`planFirst`, `appendLast`) match each
plan entry to its own row, so a repeated technique is moved twice.

### 14. `ppApplyPlannedOrder` dedups ids — fixed

Same change as item 2 for the panel's own model.

### 15. `ppSavedVerification` uses `findIndex` (first match) — fixed

Same change as item 5.

### 16. `ppOrderCheck` dedups planned rows — fixed

**Was:** `.filter((row, at, all) => all.findIndex(...) === at)` removed the second occurrence
before the check.

**Now:** every occurrence is checked, and each is matched to its own row on the face, so a face
that holds `19 · 5 · 19 · 7` against a Notion `19 · 5 · 7 · 19` reports the second copy as
`move down` while a face that holds `19 · 5 · 7 · 19` is in order. One stored copy against two
planned occurrences is reported as missing, never as out of place.

### 17. Remove checkbox key is `face|catalogueId` — fixed (maintenance scope)

The key carries the row position, so duplicates on one face can be ticked separately.

**Follow-up fixed on 2026-11-19:** the row list that fed the remove lane still compared
`face|catalogueId`, so after the key was widened **no tick matched anything** and the remove
button never appeared. `removeKey(option)` is now used for both the checkbox and the selection,
so one tick is one row.

### 18. Apply skips "already on this face" — fixed

**Was:** a plan row whose id was already on the face was skipped, so the second copy was never
added.

**Now:** the pairs read from the form are a **count**. A plan row consumes one stored copy and is
skipped; the next row for the same technique finds none and is added. `waitForOrder` also checks
that the row just added is the last one of its face, instead of finding the first row with that
id.

### 19. Confirm list shows both adds but apply may skip one — fixed (maintenance scope)

The confirm list now shows exactly the plan rows with action `Add`, which is what apply attempts.

---

## Bug 20: entity ID validation

### 20. Entity ID regex rejects "0" — fixed (maintenance scope)

`^(0|[1-9]\d{0,15})$`.

---

## Status

| # | Bug | Needs freeze approval? | Status |
|---|-----|------------------------|--------|
| 1 | Duplicate technique per face | Yes | ✓ Fixed 2026-11-19 |
| 2 | Order always moves to end | Yes | ✓ Fixed 2026-11-19 |
| 3 | Order verdict no direction | No | ✓ Fixed |
| 4 | Remove drops all duplicates | Yes | ✓ Fixed 2026-11-19 |
| 5 | Save verification miscounts | Yes | ✓ Fixed 2026-11-19 |
| 6 | Face key collision | No | ✓ Fixed |
| 7 | Face shows raw key ID | No | ✓ Fixed |
| 8 | Second occurrence never proposed | Yes | ✓ Fixed 2026-11-19 |
| 9 | Save pre-check collapses duplicates | Yes | ✓ Fixed 2026-11-19 |
| 10 | readPpItemPairs dedups pairs | Yes | ✓ Fixed 2026-11-19 |
| 11 | Remove finds first match only | Yes | ✓ Fixed 2026-11-19 |
| 12 | ppDropRemovedRows drops all matches | Yes | ✓ Fixed 2026-11-19 |
| 13 | Order plan dedups ids per face | Yes | ✓ Fixed 2026-11-19 |
| 14 | ppApplyPlannedOrder dedups ids | Yes | ✓ Fixed 2026-11-19 |
| 15 | Saved verification uses first match | Yes | ✓ Fixed 2026-11-19 |
| 16 | Order check dedups planned rows | Yes | ✓ Fixed 2026-11-19 |
| 17 | Remove checkbox key collapses duplicates | No | ✓ Fixed |
| 18 | Apply skips "already on this face" | Yes | ✓ Fixed 2026-11-19 |
| 19 | Confirm list vs apply mismatch | No | ✓ Fixed |
| 20 | Entity ID rejects leading zero | No | ✓ Fixed |

The approved set was 1, 2, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16 and 18. Item 11 was named
only by its number in the bug list, not in the request's parenthetical, but it is the same
duplicate-identity defect in the remove lane and it was included. Items 3, 6, 7, 17, 19 and 20
were already fixed before this round.

---

## What is verified, and what is not

Verified locally on 2026-11-19 in `tmp/pp-preview-readability-candidate`:

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `test:pp-apply` | 26 pass (2 new: second copy added, plan arrangement) |
| `test:pp-preview` | 25 pass (4 new: repeated occurrence, order check, one copy dropped, panel placement) |
| `test:pp-save` | 11 pass (2 new: one pair per row, one stored copy per written row) |
| `test:pp-scan` | 23 pass |
| `test:features` | 14 pass |
| `npm run build` | 0 errors |

**Not verified:** any live Magento page. There is no admin session here, so the duplicate add,
the plan-first arrangement, the count-aware save pre-check and the occurrence-aware read-back
have only been exercised against jsdom fixtures that mirror the reported markup. They need an
operator run on PP 963 (Caixa, technique listed twice) before they can be called confirmed.

The build was not staged into `chrome-installs/experimental`; the operator has not asked for a
stage in this round.

---

## 21. The add lane edited older rows on the doubled items segment (fixed 2026-11-19, later run)

The live Options page repeats its items segment:
`options[sub_options_items][sub_options_items][6][parent]`. `rowNumber` took the first segment and
returned the word `sub_options_items`, and the lookup it fed matched every row, so it resolved to
the first row of the table. On PP 963 a seven-row fill therefore rewrote six existing Caixa rows
into Laser CO2 250 on other faces and left the six new rows at their defaults (Caixa, Tampografia
1 Cor). Nothing was saved: the save pre-check refused the form (`6 of 7 planned item row(s) are
not in that helper form any more`) and closing the helper tab discarded it.

Now the index is the last items segment followed by a number, and if a new row exposes no numeric
index the lane stops before touching any row. Two jsdom cases use the doubled name and append the
new row at the bottom, as Magento does: one proves the added row is the one edited, the other
proves the stop guard leaves every existing row alone.

Latest local counts: `tsc` 0, `test:pp-apply` 28, `test:pp-preview` 26, `test:pp-save` 11,
`test:pp-selection` 99 pass with the 8 known stale failures, build 0. Still no live Magento
verification.
