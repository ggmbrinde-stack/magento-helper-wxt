# Duplicate technique on one face

**Status: fixed 2026-11-19**, after explicit approval to change add/remove/order/save write
behaviour. The full bug list is in `docs/ui/PP-PREVIEW-KNOWN-LIMITATIONS.md`.

## The case

PP 963's Notion table lists "Laser CO2 (Madeira) - Até 250 cm2" (catalogue id 19) on all 7
faces. On **Caixa** it appears **twice** (first and last technique). Magento currently has id 19
only once on Caixa, and not at all on the other 6 faces.

Magento is missing id 19 on **7 occasions**: 6 faces missing it entirely, plus the second
occurrence on Caixa.

## What the dashboard does now

The plan pairs each Notion occurrence with its own stored row:

| Face | Notion | Plan |
|------|--------|------|
| Caixa | 19, 5, 19 | `Already present` (19), `Add` (5), `Add` (19) |
| Other faces | 19 | `Add` (19) |

So the count reads "7 to add", not 6, and the second Caixa occurrence is proposed.

Adding places the new copy after the rows of its face. The order lane then moves the planned
rows to the **first** places of that face in Notion order, so a technique Notion lists first is
first and the repeated one is placed as often as Notion lists it.

## Where the rules live now

- `src/dashboard/sections/ui/ppPreviewModel.ts` — `ppUpdatePlan` counts occurrences;
  `ppOrderCheck`, `ppApplyPlannedOrder`, `ppDropRemovedRows`, `ppSavedVerification` and
  `ppRemovedVerification` all match one occurrence to one row.
- `src/page/features/pp-scan/apply.ts` — the add lane counts stored copies, keeps every plan
  row, and arranges with `append` (add, rebuild) or `plan` (order).
- `src/page/features/pp-scan/remove.ts` — each plan row removes one row and skips rows Magento
  only hid.
- `src/page/features/pp-scan/save.ts` — the reader returns one pair per row.
- `src/entrypoints/background/ppFreshForm.ts` — the save pre-check counts pairs, and repeats the
  placement with the arrangement the dashboard sent.

## Why the dashboard still said "6 to add"

The occurrence rules above were correct, but the Notion table reader never delivered the repeated
row: `ppLocationRows` split every table line on `|`, and option labels carry their own pipe
("UV - Até 100 cm2 (Aprox. 10x10cm - BLOCOS PEQUENOS | OUTROS)"). The first such label cut the
row, so PP 963's Caixa cell stopped at UV 100 and lost ids 36, 17, 18 and the repeated 19; Face 2
lost Laser 7, and the three surviving labels were truncated into "Review" instead of matching.

`ppLocationRows` now takes the face from the text before the first pipe, keeps the middle column
whole and crops only the empty trailing Notes column. For PP 963 the plan reads 7 to add (the 6
faces plus the second Caixa copy), 15 already present and 0 review, with 22 plan rows in Notion
order.

## Not verified

No live Magento run was possible here. The duplicate behaviour is covered by jsdom fixtures
only; PP 963 Caixa still has to be run by the operator.
