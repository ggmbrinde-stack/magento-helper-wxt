# PP catalogue selection and fresh form preview v2

Awaiting independent review. No install or live testing.

Build source: C:\Users\user\Videos\BestOfGifts_Master\magento-helper-wxt\tmp\pp-catalog-selection-candidate
Base: cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071
Task branch: codex/pp-catalog-selection from develop dba3f426cb528a3c49679e586604cddec054ff0e; branch worktree remains unmodified. Complete candidate preserves frozen dashboard preview v1. Develop integration is separate.

Combined patch SHA-256: 2028a0a74599891e21f0e7c32ec7fadc17a586d6a19cba168555406e59a0e15d
Feature-only patch SHA-256: 69a76beea9040445f924975d5083021cc6b36439959194add996d5ee43653d9d
Manifest SHA-256: 32aa5f94a3c6ad816ac1d46437e2fa2eea41cda017052b4b042ca33f5aea3fc7

15 feature files changed. All 209 source/config hashes and 15 frozen build hashes are pinned. Both patches reproduce all canonical source hashes from clean archives, and reverse-apply checks pass.

User flow: Load PP catalogue, search and check multiple Notion V2 records, choose one checked PP, enter its exact Magento entity ID separately, acknowledge temporary manual pairing, Preview selected PP. Definitions/bodies are fetched only for the selected preview. No Magento-only inventory or user-open-tab prerequisite. No automatic association from code/title/Attribute Set.

Catalogue coverage is complete only after pagination exhaustion. Duplicates, missing identities, repeated cursors/records, failures and cancellation stay explicit. Limits: 50 pages/5,000 rows and 60 seconds for page scheduling. An existing queued Notion read/retry may finish after stopping; no next page is scheduled.

Fresh reader requires a configured allowed HTTPS admin base, opens its own inactive keyless edit tab, validates host/route/main-frame/provider entity before and after serialized extraction, and never navigates or borrows user tabs. Readiness/injection is bounded to 30 seconds and 10 injections. Cleanup failure reports the owned tab ID, blocks another read, supports retry and observes manual close. Cancellation races before creation/injection are covered. No native validation/save/update handler or module load invoked.

Current source is FRESH MAGENTO FORM LOAD, not the user's unsaved draft or a certified saved-server snapshot. Keyless route support/authentication/provider initialization remain for human live validation. Native-field mapping blockers stay in place; no Apply/Save/batch execution, persistent mapping or business writes.

Validation: 111 tests (36 new selection/fresh-form, 16 scanner, 14 retained preview, 35 catalogue, 10 Notion retry), typecheck, normal build, UI/Notion/lane/feature guards and diff check passed. Prior page scanner/lookup source preserved. The five old dashboard open-tab UI tests were superseded by the new catalogue/fresh-form UI regressions; legacy message/serialization tests remain.

Reviewer starts with the feature-only patch, then complete patch plus manifest. Engineering Lead coordinates independent review and any later Experimental staging. Native dropdown label task remains deferred. No recursive agents or cross-chat messages used.

Review revision 2 only. Earlier selection freeze v1 is retained but superseded after removing two trailing blank lines. Both patches pass strict whitespace validation, clean-archive reconstruction of all 209 source hashes, and reverse checks. Rebuilt output is byte-identical to v1. Source work is stopped pending independent review.
