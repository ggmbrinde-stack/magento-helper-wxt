# Project State Analysis — 2026-10-27

## Executive summary

The WXT/TypeScript extension is present, builds successfully, and has no
tracked-file deletions in the current worktree. The local branch is `main` and
matches `origin/main` at `a7bb25f`.

The working tree is not ready for a broad commit or production release. It
contains an unfinished custom-options companion, a temporary visibility marker
that is injected on every matched Magento page, and toolkit CSS added for
controls that are not yet implemented. In addition, the Notion write-safety
check fails because an unused SKU Library body-repair helper can delete
existing Notion blocks, contrary to the guard's stated policy.

The earlier encoding issue in `content.ts` is repaired: the corrupted strings
are no longer present. That repair matches the committed strings, so it does
not form a standalone change to commit.

## Verified project state

- **Repository/branch:** `main`, synchronized with `origin/main`; no commits
  ahead of or behind the remote at inspection.
- **Tracked deletions:** none. `git ls-files --deleted` returned no paths.
- **Modified tracked files:**
  - `src/entrypoints/content.ts`
  - `src/ui/toolkit.css`
  - `src/public/ui/toolkit.css`
  - `src/ui/toolkitCss.ts`
- **Untracked files:** a local `records/` directory and three DevTools probe
  files under `scripts/`. Do not stage these as a group without inspecting
  them. A local workplan contains credential-bearing admin URL material; it
  must not be committed or copied to Notion. If that material is an active
  credential, invalidate it.
- **Toolkit copies:** canonical CSS and generated copies are synchronized.
  The local build check verifies this without overwriting the canonical source.
- **Validation:** `npm run check:ui`, `npm run typecheck`, `npm run build`,
  `node scripts/sync-toolkit.mjs --check`, and `git diff --check` pass.
- **Notion safety validation:** `npm run check:notion` fails. Details below.
- **Live Magento verification:** not performed as part of this assessment.

## Findings and recommended changes

### 1. High priority — reconcile Notion body-repair deletion with policy

`npm run check:notion` reports a `DELETE /v1/blocks/{id}` request in
`src/lib/skuLibraryWriter.ts`. The code is in the exported
`repairSkuLibraryBody()` helper, which backs up a page's body blocks, deletes
them, then writes a dossier. No call site for this helper was found during
this review.

This conflicts with the static guard's explicit “deletes ... are never
allowed” policy and the README's description that non-empty page bodies are
never overwritten. Do not solve this by simply broadening the guard.

Recommended resolution:

1. Confirm whether malformed-body repair is still a required feature.
2. If not, remove the unused helper and its delete-only API path, then require
   `npm run check:notion` to pass.
3. If it is required, define the explicit user-confirmation, backup, recovery,
   and scope policy first; update the code, guard, and documentation together.

Keep Notion write operations disabled for that path until the policy is
resolved.

### 2. High priority — remove the global visibility test

`src/entrypoints/content.ts` calls `mhxVisTest()` unconditionally from content
script startup. It injects a fixed red dot into every page matching the
extension's Magento host patterns. This is diagnostic UI, not part of the
options companion, and must not ship to normal users.

Remove the marker and its call after confirming the companion is detected
through normal scoped diagnostics. Also remove or deliberately wire the
currently unused `bootDiagOnLoad()` diagnostic entrypoint; avoid leaving dead
debug code in the production content script.

### 3. High priority — finish or gate the custom-options companion

The current uncommitted code adds a prototype for the
`toogas_attributesetcustomoptions` page. It finds the first matching repeating
fieldset and builds a read-only list of option labels. The implementation is
not yet a complete companion:

- The added toolkit CSS contains styling for tabs, search controls, chips,
  delete controls, and other surfaces that the current DOM-building code does
  not create.
- The companion is added once. Later scans return early when its shell exists,
  so Knockout/AJAX changes to the underlying editor may leave its labels stale.
- Only the first matching `foreach` fieldset is used, although the observed
  page probe found multiple matching fieldsets.
- If no editor is found, the repeated scan path can emit the same warning on
  later mutations.
- This feature has no dedicated feature flag and has not been visually
  verified on the live page.

Before enabling it broadly: define exactly which editor(s) it represents,
keep Magento inputs and Knockout handlers as the source of truth, refresh
derived labels safely after editor changes, make diagnostics feature-scoped,
remove unused styles, and add an explicit flag or otherwise keep it off until
verified. Do not add save, delete, or other write behavior without a separate
review and explicit requirements.

### 4. Medium priority — restore first-paint ordering

The current content-script startup calls `ensureUi()`, starts the async theme
and custom-color watchers, and immediately calls `scan()`. `ensureUi()` returns
a promise that resolves when the stylesheet is loaded or the inline fallback
is ready; the current startup does not await it. The theme/color reads are
also asynchronous.

This can draw injected controls before styling and initial colors are ready.
Await toolkit readiness and both initial theme/color applications before the
first scan; preserve ongoing watcher behavior for later changes.

### 5. Medium priority — review toolkit CSS growth and synchronization

The canonical toolkit has grown by roughly 290 CSS lines in the current
worktree, principally for the options companion. The generated public and
inline copies match, but many of the new option-editor selectors are not used
by the current prototype.

Keep only rules needed by implemented UI. Put genuinely feature-specific
styles in the appropriate component module where that follows project
conventions, rather than adding speculative controls to the shared toolkit.
Regenerate the two copies only from the reviewed canonical CSS and retain the
check-only build hooks.

The broader toolkit migration is partial, not complete. The current
`docs/UI-MIGRATION-REMAINING.md` describes the remaining picker search/layout,
category-tree list/layout, and Magento-specific styling. Keep it aligned with
actual usage; do not describe the options companion as complete until verified.

### 6. Medium priority — improve confidence with focused tests

The repository's `package.json` exposes UI guard, Notion guard, typecheck, and
build commands, but no test script. The existing checks establish static
consistency and successful bundling; they do not prove the new companion works
with Magento's Knockout lifecycle or that the first paint is visually correct.

Add focused tests for pure DOM/render helpers or use a controlled fixture for
the custom-options editor if the feature continues. Verify that repeated scans
do not duplicate nodes, updates refresh derived labels, accessibility remains
intact, and no Magento data is written. Do not test by saving or deleting
production records.

## Suggested order of work

1. Resolve the Notion body-delete policy/check failure.
2. Remove the global visibility marker and dead diagnostics.
3. Decide whether to retain the custom-options companion; if retained, gate it
   and complete its Knockout/re-scan lifecycle before broad use.
4. Fix asynchronous first-scan ordering.
5. Remove unused toolkit CSS and update UI migration documentation.
6. Add focused fixture/tests and rerun all checks; perform read-only live visual
   verification only after the feature is gated and reviewed.
7. Review all untracked files individually before staging. Keep credentials,
   admin URLs containing keys, probe output, and generated artifacts out of
   commits and Notion.

## Validation results

| Check | Result |
|---|---|
| `npm run check:ui` | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `node scripts/sync-toolkit.mjs --check` | Pass |
| `git diff --check` | Pass |
| `npm run check:notion` | **Fail** — DELETE block request in `skuLibraryWriter.ts` conflicts with guard policy |
| Live Magento visual/behavior verification | Not performed |

