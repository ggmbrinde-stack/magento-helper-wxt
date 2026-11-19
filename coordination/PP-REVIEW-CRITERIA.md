# PP update workflow review criteria

**Purpose:** Preflight criteria for an independent review of a refreshed Python-driven PP update plan and its exact implementation. This report does not approve unseen code, plan, pilot, or Notion writes.

## Evidence consulted

- Original transfer handoff: `C:\Users\gonca\.codex\attachments\4bd45a80-65b9-495e-b34b-7b5e731809f4\Pasted text.txt`
- Setup/recovery report: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\MAGENTO_HELPER_SETUP_REPORT_2026-11-19.md`
- Project chat registry and shared context: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\PROJECT-CHATS.md`
- Present clone: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\magento-helper-wxt`, `main` at `dba3f426cb528a3c49679e586604cddec054ff0e`.

The setup report says the old working checkout and its dirty/untracked artifacts were not recovered. The expected `experimental/drime-integration` branch and HEAD `946e7514d0fe90f4f89029f9c0eb3bdf47619031` are absent from the remote. The frozen v2 package, ZIP, and related PP documentation are also absent from this clone. This report relies on handoff/setup evidence and does not claim to have inspected those artifacts or fetched current Notion pages.

## Acceptance criteria

1. **Exact page identity and batch boundary**
   - Every planned operation must bind to the exact Notion page ID and expected PP number, with a fresh title/identity check before planning and immediately before writing.
   - The only batch is PP428, PP429, PP430, PP467, PP558, PP612, PP633, PP661, PP662, PP786, and PP840. Reject unexpected pages, duplicates, missing pages, and any expansion of the batch.
   - PP601 is protected and excluded at discovery, plan generation, execution, and verification. A guard should fail closed if it appears in input or target IDs.
   - The already-applied pocket corrections for PP430, PP558, PP661, and PP662 must be preserved and must not be replayed or counted as full conversions.

2. **Freshness and conflict detection**
   - Refresh all relevant page content and properties from the verified working-copy destination. Record retrieval time, page ID, last-edited timestamp/version if available, and a content fingerprint.
   - Compare the fetched state to the exact state used to generate the plan immediately before any write. Any timestamp, fingerprint, title, status, block structure, or relevant property drift must invalidate the affected plan entry and require regeneration/review.
   - Do not rely on the saved Nov 17 captures or earlier AVENTAIS dry-run. Handoff reports live pages had Nov 18 edits, so stale data can change both source mapping and blockers.
   - PP428's user-confirmed Transfer 126 cm², 1-colour pocket option is page-specific. It cannot justify a 1-colour Transfer mapping for other pages. Any unclear method, source, colour, location/area, or PP662 box material/process choice must remain unresolved and block that page's write.

3. **Immutable source and provenance**
   - Each proposed value must trace to a specific current page section/block and a specific Excel workbook, sheet, range/row, and captured value. Store stable source identifiers and hashes where possible.
   - Keep source captures, plan, and execution journal distinct. Do not modify or overwrite source evidence while generating the plan. Preserve pre-existing New/Old and Excel source content.
   - Do not edit or reconstruct the frozen v2 candidate or ZIP. If a new implementation is supplied, identify it as a separate artifact and provide its exact path and SHA-256 hashes for the code, manifest/configuration, inputs, and generated plan.

4. **Preservation of New/Old content**
   - For each target page, capture and bind evidence to the page ID and current edit state that identifies the existing New and Old containers, their child blocks, order, rich text, links, and relevant metadata.
   - The plan must state exactly which blocks/properties it will add, change, or leave untouched. Existing structured containers may only be edited or repositioned when page-specific preservation evidence proves their identity and intended handling.
   - The execution path must refuse to proceed when preservation evidence is absent, ambiguous, stale, or mismatched. It must not replace the page body wholesale or delete/recreate New/Old content as a shortcut.

5. **Journal, uncertain responses, idempotence, and partial failure**
   - Persist a durable per-page journal before and after each write, including exact intended operation, page ID, pre-write fingerprint, operation/request ID if available, response outcome, and readback outcome. Record unknown/timeout responses as uncertain, never as failed-with-no-write.
   - On retry, inspect live state and journal first. Determine whether each operation already applied, then skip confirmed completed operations. Never blindly replay append/create operations after an uncertain response.
   - Make operations idempotent using stable block IDs or deterministic markers where supported, while preserving original content. If the API cannot establish whether a write succeeded, halt that page and require reconciliation before retry.
   - Partial failure must stop further writes for the affected page and prevent the batch from silently continuing past an unresolved state. Preserve enough journal data to resume safely without repeating completed operations.

6. **Readback and protection checks**
   - After each approved page write, fetch the page again and verify the expected blocks/properties, New/Old preservation, source trace, status, and identity against the plan. Compare actual state with the intended post-write fingerprint or structural assertions.
   - A successful API response alone is insufficient. Record readback evidence for every changed page.
   - Confirm PP601 was not read for mutation, included in a request, or altered. Ensure only the approved page IDs were touched. Any mismatch stops the batch.

7. **Pilot and user approval**
   - Independent review requires the exact refreshed plan and implementation artifacts, including paths and hashes, plus current per-page evidence and unresolved-choice list.
   - User approval must identify the exact plan/version and pilot page(s), before any Notion write. The pilot is a separate bounded operation. Read it back and report results before seeking approval for any wider batch.
   - Approval for a pilot does not imply approval for the remaining pages. After the pilot, regenerate or invalidate entries if live pages changed, then obtain approval tied to the exact remaining plan.

## Prior review scope

The reported v2 independent review was GO for PP39 only. It provides no approval for this 11-page batch or for an unseen refreshed plan, code path, pilot, or write. The old dry-run had zero content/property operations because preservation evidence was unavailable, and its provisional blocker list must be recalculated against fresh inputs.

## Evidence currently absent

- The exact Python updater source, entry point, dependencies/runtime, and its current hash.
- The frozen v2 candidate and ZIP, so their actual guards and implementation cannot be rechecked from this machine.
- Current read-only page captures for the 11 page IDs, their current timestamps/fingerprints, exact New/Old block maps, and authoritative Excel source/range mappings.
- Verified access to the intended Notion working-copy destination. The project registry records that the last fetch returned 404 and the account identity did not match the expected destination.
- The durable journal format and evidence of its behavior for timeouts, retries, partial writes, and readback.
- The refreshed exact no-write plan and its hashes, unresolved decisions, and proposed pilot scope.

**Assessment status:** Criteria defined. Workflow safety and plan correctness remain unassessed until these artifacts and current page-bound evidence are supplied. No source edits, tests, Notion/Magento access, or external writes were performed for this report.

The intended working-copy reference recorded in the handoff is https://app.notion.com/p/PP-Catalog-v2-Working-Copy-417b6705ae1f81aabd8bf1130a9b991c. This is a reference URL, not proof of access or the individual page IDs. Current page IDs and captures were not present in the local evidence consulted.

## Evidence inventory update

A later Setup & GitHub update supersedes the earlier statement that the handoff package was not recovered. Setup reports that the Excel workbook, Python/PP sources, captures, plans, tests, and frozen packages are now present. It reports manifest verification of 250 checked entries with 0 mismatches, 141 Python tests passing on bundled Python 3.12.14, and 14 Node tests passing. These are Setup's verification results, not independent findings in this criteria-only report.

Paths visible in the shared workspace include:

- Extracted handoff materials: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\_pp_handoff_extract\workbook.xlsx`, `PP_Full_Conversion_REVIEW_v2.zip`, and `PP_Full_Conversion_REVIEW_v1.zip`.
- Recovered checkout/evidence: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\_git_exact_checkout\tmp\pp-full-conversion-candidate\review-full-v2\` and `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\_git_exact_checkout\tmp\pp-full-conversion-input-20261119\manifest.json`.
- Fresh page capture directories are present in that candidate tree under `source\captures\final-current\`. The exact per-page files are named `pp428.json`, `pp429.json`, `pp430.json`, `pp467.json`, `pp558.json`, `pp612.json`, `pp633.json`, `pp661.json`, `pp662.json`, `pp786.json`, and `pp840.json`.
- Coding's report is `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\coordination\CODING-PP-ANALYSIS.md`. Notion's report and page evidence index are `coordination\NOTION-PP-ANALYSIS.md` and `coordination\evidence\2026-11-19\NOTION-PP-PAGES.md`.

The exact refreshed executable artifact, manifest, per-page captures, and plan still need to be named and hash-bound for the independent review. Setup's test results establish suite status but do not replace review of uncertain-response journaling, idempotence, partial failure, New/Old preservation, destination identity, and readback behavior. PP39 remains the only scope covered by the earlier v2 GO. The 11-page batch and any pilot remain unapproved here.

## Execution-path byte integrity

Setup's history reports that five CRLF-sensitive evidence files were temporarily populated with exact Git blobs for passing tests, then restored to Windows checkout format. A clean Git status does not establish that the current execution-path byte-hash guards accept those restored files. Before relying on manifest verification or invoking a plan/run path, the supplied exact artifact must demonstrate its own current-path hash checks against the restored bytes, with evidence paths and computed hashes recorded. This is a review criterion only; no files were normalized or modified for this check.
