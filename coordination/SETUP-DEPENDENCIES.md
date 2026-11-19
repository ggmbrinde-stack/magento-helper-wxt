# Setup dependencies handoff — 2026-11-19

## Verified setup evidence

- Setup report: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\MAGENTO_HELPER_SETUP_REPORT_2026-11-19.md`
- Fresh clone: `C:\Users\gonca\Documents\ChatGPT\BOG_Studio\magento-helper-wxt`
- HEAD: `dba3f426cb528a3c49679e586604cddec054ff0e`
- Branch/worktree: one clean worktree on `main`, tracking `origin/main`.
- Remote branches observed: `origin/main`, `origin/develop`, `origin/codex/release-baseline`.
- `experimental/drime-integration` and `946e7514d0fe90f4f89029f9c0eb3bdf47619031` are absent from GitHub and the clone.

## Exact missing transfer artifacts

Must come from the old PC or another preserved transfer, not be reconstructed:

- `C:\Users\user\Videos\BestOfGifts_Master\magento-helper-wxt`
- `docs/shared/AGENT-WORKFLOW.md`
- `docs/shared/PP-FULL-CONVERSION-CONTINUE-2026-11-19.md`
- `tmp/pp-full-conversion-candidate/review-full-v2/`
- `tmp/pp-full-conversion-candidate/PP_Full_Conversion_REVIEW_v2.zip`
- Handoff-listed dirty/untracked state: `tmp/`, `.postman/`, `postman/`, PP docs, probes, and local edits.

GitHub can supply only the currently published branches above; it cannot supply the missing experimental branch/commit unless someone restores/publishes them. The frozen v2 package and any historical tmp artifacts must remain untouched if recovered.

## Available prerequisites

- Node.js `v24.22.1` observed; npm is available.
- `npm ci` completed in the fresh clone; `node_modules` is present.
- `package.json`, `package-lock.json`, and `wxt.config.ts` are present.
- Existing tests use `npx esbuild`; no source changes were made.

## Baseline results already recorded

- Passed: `npm run check:notion`.
- Passed: 79 tests across supplier, Makito, enable-flow, and admin-facts suites.
- Blocked: `test:attribute-set` and `test:features` because `jsdom` is referenced by the test commands but absent from the committed dependency set.
- Blocked: `npm run typecheck` and `npm run build` because generated `src/ui/toolkitCss.ts` is out of date.
- Blocked: `npm run check:ui` because of the same generated drift plus existing assoc-bulk colour/token guard violations.
- GitHub CLI `2.93.0` is installed, but configured tokens were invalid. No credential was exposed or changed.

## Recovery actions for Coding/Notion

1. Restore the exact experimental branch/commit and handoff/tmp artifacts from the old PC or an approved archive; do not infer them from `main`.
2. Confirm the restored working tree’s dirty/untracked files before any checkout or tooling action.
3. Resolve dependency/tooling prerequisites from the restored project state: preserve the lockfile, determine whether `jsdom` is intentionally omitted, and regenerate toolkit copies only with explicit authorization.
4. Re-run the full baseline after restoration, then refresh current read-only PP captures for exactly `428, 429, 430, 467, 558, 612, 633, 661, 662, 786, 840`; keep `PP601` protected.
5. Treat the Nov 17 dry run as stale. Do not repeat pocket fixes for `430, 558, 661, 662`, and do not generalize PP428’s confirmed 1-colour Transfer mapping.

No credentials, Notion writes, Magento writes, commits, pushes, merges, releases, or frozen-package edits were performed.
