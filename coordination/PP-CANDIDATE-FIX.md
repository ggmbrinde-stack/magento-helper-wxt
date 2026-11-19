# Review-callout preservation candidate v3

Prepared for independent Review on 19 November 2026. No live operations or regenerated AVENTAIS execution plan.

## Candidate and immutable base

- Candidate absolute path: `C:/Users/gonca/Documents/ChatGPT/BOG_Studio/coordination/pp-candidate-preserve-review-v3-20261119-01`.
- Base archive: `C:/Users/gonca/Documents/ChatGPT/BOG_Studio/magento-helper-wxt/tmp/pp-full-conversion-candidate/PP_Full_Conversion_REVIEW_v2.zip`.
- Base archive SHA-256: `36a9241f8e751dd9488ef9a51a762c1755916a495c9afada13b353bd9ee815cd`. Candidate was extracted directly from these verified bytes.
- Candidate implementation digest: `44ed0044f9ffd46048ee27d58e2abb26a4e9456bb5d8df547acad2666f4b5a75`.
- [Exact source and test diff](PP-CANDIDATE-FIX.patch), [candidate identity](pp-candidate-preserve-review-v3-20261119-01/CANDIDATE.json).
- Only `source/full_conversion.py` differs among the original 250 manifest entries. Added `source/tests/test_preserve_review.py`. The copied v2 manifest remains the base manifest; it does not seal this changed candidate. Candidate identity is recorded separately.
- Rechecked the frozen execution extraction after this work: all 250 entries still match. No frozen source, evidence or archives were edited.

## Decision and implementation

An existing review callout does not require modification. `full_conversion.own_review` returns the exact existing callout, including human choices/reason. `rendered_layout.review_state` validates its own PP identity and supported review choices. Full conversion requires a unique review before New/Old, but does not require recreating that native block.

Previously `full_conversion.render` included the callout in the broad content replacement even though the rendered callout text was unchanged. This required destructive-container eligibility from `full_regions.verified_container`, whose single-paragraph rule correctly rejects the five-child review.

The candidate keeps a recognized existing top-level review and its entire preceding content outside all replacement ranges. It excludes that preserved prefix from generated layout content and from mutable groups. Remaining paragraphs after the review stay in generated content, and the existing history retains the previous presentation. Final layout validation still runs. A source toggle before the review, or an image after it, produces an explicit refusal because this limited path cannot preserve that placement and satisfy the required layout safely. A page without an existing review uses the original rendering path.

The container verifier is unchanged. New/Old and other edited native containers still require complete page-bound evidence. The source toggle remains excluded from replacement. Full-page prewrite state checks and exact saved-block comparisons continue to include the preserved review, so a concurrent review edit or altered saved callout cannot be accepted.

The protocol value `PP_FULL_CONVERSION_V1` remains unchanged because existing session dispatch relies on it. The new candidate is distinguished by its directory, CANDIDATE.json and changed implementation digest. Approval for the old implementation cannot authorize this digest.

## Focused verification

Python 3.12.14 at `C:/Users/gonca/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`, with `-B`, ran nine named tests successfully in 18.307 seconds. The five new tests are in `test_preserve_review.PreserveReviewTests`:

- `test_five_child_review_and_prefix_are_untouched`: five children, unchanged prefix through each modeled operation, exact retained callout, complete layout, and readback rejection if the human choice changes.
- `test_unknown_structure_stays_blocked`.
- `test_missing_column_evidence_stays_blocked`.
- `test_single_paragraph_container_support_unchanged`.
- `test_stale_browser_state_stays_blocked`.

Four existing `test_full_conversion.FullTests` checks also passed:

- `test_full_page_execution_verified_final_status_and_scope_receipt`.
- `test_removed_or_mismatched_browser_observation_does_not_unlock_containers`.
- `test_lost_write_never_replayed_and_next_independent_pp_runs`.
- `test_negative_saved_coverage_quarantines_without_success`.

Invoke these individual test names with `python -B -m unittest` from the candidate's `source/tests` directory. Do not discover the whole subclass automatically; it inherits the existing fixture and tests. The successful checks used fake connectors and temporary journals only.

The initial check exposed a protocol-dispatch dependency when a new protocol string was attempted and a synthetic fixture with an image after the inserted review. The final candidate retains the existing protocol value. The positive fixture places its own image before the review, while the production guard explicitly refuses later images. All nine checks passed after those corrections.

## Outstanding blockers and limits

Independent Review must assess this exact diff and digest before fresh execution planning. Complete native New/Old and other mutable-container observations are still missing for the AVENTAIS batch. The fresh diagnostic plan's mapping/material questions also remain open. PP428's confirmed pocket decision and four earlier pocket corrections are preserved in current evidence; this candidate does not grant new business approval or mark them as full conversions. PP601 remains protected by unchanged selection and write guards.

No new plan, apply session, Notion/Magento write, commit, push or broad suite was run. The focused five-child check verifies the modeled preservation path; the unchanged session machinery was tested separately with existing fake-connector regressions. Live native block preservation remains unverified.
