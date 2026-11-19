# Next steps, 2026-11-10

Implementation is paused at the owner's request. Resume only an agreed task.

## Stopping point

- Candidate: `cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071`, branch `codex/release-baseline`.
- [Draft PR #1](https://github.com/ggmbrinde-stack/magento-helper-wxt/pull/1) targets `develop`. Neither `develop` nor `main` contains the candidate yet.
- GitHub CI passed clean installation, 133 tests, typecheck, UI/Notion guards and Chrome packaging. Local verification also passed after using canonical LF source bytes instead of Windows-converted CRLF files.
- Local ZIP: `tmp/pilot-validation-20261110-cd3d2ab/.output/magento-helper-wxt-0.2.1-chrome.zip`. Final archive inspection/checksum and authenticated Chrome/Magento smoke checks remain pending.
- The original build and local changes are preserved in `tmp/release-backup-20261110-092644Z`.
- Repository remains private. PR/CI gates are manual; no GitHub Pro upgrade, stable release or Chrome Web Store publication is planned now.

## 1. Agree the operating process

Walk through one product from disabled to enabled. Record who acts, the evidence required, blocking conditions, manual decisions, and where each result is recorded. Separate current behavior from desired behavior.

## 2. Define resolver and readiness rules

- Agree evidence priority when Magento, storefront and Notion disagree or data is missing.
- Review the 12 Disable -> Enable checks, their automatic/manual results, freshness and override rules.
- Define what "ready" means. Actual Magento activation remains a separate operator action.

## 3. Plan Notion changes

Separate the development hub from operational SKU Library, Listing Errors and reference pages. Map each workflow step to its page/database and authoritative fields. Preserve identifiers, relations and writer guards until a concrete migration is reviewed. No Notion pages or schemas have been changed by this release work.

## 4. Configure external execution later

- Routine, bounded work: free AI tools, with one brief, allowed files, acceptance checks and an isolated task branch/worktree.
- Complex, safety-sensitive or cross-pillar work: Codex specialists and targeted independent review, activated only when needed.
- OpenCode 1.18.30 and Freebuff 0.2.27 are installed. OpenCode already selects `freellmapi/auto`; its configured `http://localhost:3001/v1` service did not respond during inspection. Authentication/inference through this route is not verified.
- Later: start/locate FreeLLMAPI, verify the free route and one small inference; validate an OpenCode worker profile against the installed schema; check Freebuff login and supported interactive workflow. Do not invent unsupported headless flags, expose keys, overwrite other providers or silently fall back to paid routes.
- Keep handoffs short, start fresh task context, avoid recursive delegation and repeated whole-repository analysis. Reuse Ponytail/RTK; use REA only when runtime evidence is needed.

## 5. Return to release validation after planning

Inspect/hash the ZIP and smoke-test UI, resolver and Disable -> Enable in authenticated Chrome/Magento without saving products or writing Notion data. Triage dependency audit notices separately, without bulk automatic upgrades. Then decide whether to merge into `develop`, prepare a stable promotion, or revise the candidate. Any promotion remains a separate agreed step.
