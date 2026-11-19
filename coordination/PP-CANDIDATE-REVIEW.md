# PP candidate direction review

**Scope:** Narrow review of the diagnostic plan and frozen v2 review rules to advise the candidate author. The proposed candidate file `coordination/PP-CANDIDATE-FIX.md` is not present yet, so no candidate diff or focused test result is reviewed. This is not a GO for the 11-page batch.

## Evidence inspected

- Diagnostic: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\coordination\aventais-diagnostic-20261119-01\plan.json`
- Frozen source: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\_git_exact_checkout\tmp\pp-full-conversion-candidate\review-full-v2\source\format_layout.py`, especially `review_info`, `format_body`, and `plan`.
- Frozen source: `...\review-full-v2\source\full_conversion.py`, especially `own_review` and `validate_layout`.
- Focused frozen tests: `...\review-full-v2\source\tests\test_layout.py`, including existing callout retention and preservation checks.

The diagnostic is `apply_allowed_now: false`; all 11 target pages have zero content and property operations. Its page records are `READY_FOR_ERROR_REPORT`, which is a diagnostic/error-report status, not a write-ready conversion plan. The exact target manifest lists the 11 intended IDs and has no protected code in `excluded_protected_codes`; candidate generation must independently keep PP601 out of scope.

## Callout direction

Leaving a valid existing review callout unchanged is compatible with full conversion and is the required preservation behavior. The frozen native-layout path validates a callout has exactly two ordered Sim/Não todo choices, boolean unchecked/checked state that is not conflicting, no PP number for another page, and an editable “Se não, porquê?” reason area. It then carries the original callout block forward and records its digest. The rendered full-conversion path likewise returns an existing review callout verbatim. A frozen test asserts that a PP633 callout, including a “Não” choice, is byte-for-byte retained.

The native verifier does not require a single-child callout. Multiple children are expected for the choices and reason field, and extra preserved children can be compatible if the required structure remains valid and no conflicting extra review choices exist. Do not simplify a five-child review callout to one paragraph or regenerate it from a template. Do not reset human checkbox state or erase an existing reason. If a source callout is malformed, duplicated, contradictory, or lacks the editable reason area, fail closed for that page and report it for human reconciliation.

A new unchecked review callout is needed only when no valid existing callout exists and the full-conversion renderer must provide one. That is a deliberate conversion output, not grounds to rewrite an existing one. The diagnostic currently proposes zero content/property operations, so no per-page callout update is authorized or evidenced by that plan.

## Candidate constraints and unresolved items

- Keep preservation checks and page-bound evidence requirements intact. A callout compatibility adjustment must not weaken exact source snapshots, stale-state checks, journal fencing, or readback.
- Preserve each existing valid callout exactly, including every child, order, rich text, checkbox value, reason, and block identity. Preserve valid existing New/Old structures per the same page-specific rules.
- Do not convert a zero-operation diagnostic/error report into executable operations. The new no-write plan must be regenerated from complete current page evidence, then reviewed independently.
- The diagnostic has no current per-page preservation evidence attached in its visible summary. Current source freshness, exact New/Old maps, unresolved Excel-to-local choices, and the five-child callout shapes still require page-by-page evidence in the refreshed plan.
- Keep PP601 excluded and the exact 11-page boundary fixed. The earlier v2 GO covered PP39 only.

**Initial direction assessment:** This preliminary status was superseded by the independent candidate v3 review below. No code was changed and no external writes were run.

## Independent review of candidate v3

**Candidate identity:** `coordination/pp-candidate-preserve-review-v3-20261119-01`; base frozen ZIP SHA-256 `36a9241f8e751dd9488ef9a51a762c1755916a495c9afada13b353bd9ee815cd`; implementation SHA-256 `44ed0044f9ffd46048ee27d58e2abb26a4e9456bb5d8df547acad2666f4b5a75`. `CANDIDATE.json` identifies only `source/full_conversion.py` as changed among the base manifest files and adds `source/tests/test_preserve_review.py`. I independently confirmed `batch_plan.implementation_sha()` returns the candidate digest. The candidate's exact diff is `coordination/PP-CANDIDATE-FIX.patch`.

**Verdict: GO for code only, within the existing fail-closed gates.** The five-child preservation test passed independently with the bundled Python 3.12 runtime. No live plan or write is approved.

The callout rule has two separate code paths. `full_regions.verified_container` at `source/full_regions.py` permits a bounded callout replacement only when it has exactly one paragraph child whose text matches the page-bound browser observation. That rule remains unchanged. The v3 branch in `full_conversion.render` keeps a recognized review callout and every top-level block before it in `preserved`, excludes them from `mutable`, and skips them when constructing replacement groups. Thus the five-child review is not sent through the one-paragraph replacement guard. Separately, `own_review` returns an existing review verbatim, `rendered_layout.review_state` checks its PP identity and decision/reason structure, and `validate_layout` requires one unique review before the New/Old columns. The five-child test confirms unchanged callout text and rejection of a changed human decision in saved-state comparison. These rules are consistent, not conflicting.

The prefix behavior also fits the current diagnostic pages. I parsed their source bodies with the frozen rendered-layout parser. All 11 have images, descriptions and/or notes before their unique review callout. Those are retained at their existing positions. The generated New/Old tables still come from the current Excel record. The candidate refuses when the source toggle precedes the review or an image follows it. Existing mutable containers still need matching bounded evidence, otherwise the function returns zero operations with `blocked_region`. Unknown structures and stale browser observations remain refused by the focused tests.

The replacement and session protocol remain bound to the candidate implementation digest. `batch_apply.Session` compares the approval's implementation hash with the bundle and recomputes `batch_plan.implementation_sha()`. Its existing immediate prewrite source-state check, per-operation region-evidence comparison, durable WRITE_PENDING intent, no-retry uncertain handling, and saved-state readback remain in place. The candidate test additionally checks that operations leave the preserved prefix intact and that edited review decisions fail the saved-state check.

**Plan/live readiness remains NO-GO.** The supplied diagnostic still has `apply_allowed_now: false`, zero content/property operations for every target, and `READY_FOR_ERROR_REPORT` status. Current native New/Old preservation evidence is partial, unresolved Excel/method/location/material decisions remain, and no regenerated no-write plan is under review. PP601 must remain excluded; previous v2 GO is PP39 only. Any future plan must bind to the candidate digest, exact page IDs, fresh page state, and complete page-specific preservation evidence, then undergo its own review and user approval.

Checks performed for this review: inspected the exact source/test diff, candidate identity, relevant renderer/parser/guard/session paths, and diagnostic page ordering; verified the aggregate implementation hash; ran only `test_five_child_review_and_prefix_are_untouched` (passed). Did not run the remaining eight reported focused tests or the broad suites, and did not contact Notion or perform writes.

