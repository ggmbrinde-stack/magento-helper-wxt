# Options Grid source and helper readiness v1

Ready for independent review; not installed or tested live.

Source: C:\Users\user\Videos\BestOfGifts_Master\magento-helper-wxt\tmp\pp-options-grid-source
Base cd3d2ab plus approved external diagnostics. Standalone source snapshot, no new Git branch or metadata. Develop integration remains separate.

Combined SHA-256: 88a27bc84de48ee5ee882a04217e72fc47bb7281694d01a7fefc3859acc843ba
Feature-only SHA-256: 3e11776d41b3ba9f4d04b2a9eff47e27643501158c9dff71f174e1b368fabcd7
Manifest SHA-256: 5b439a18afc868d3cb71c74bbcc2437fa643dd94b3087fe9cee770007bfe9f9c

Confirmed defect: helper extraction previously ended at 5 seconds (10 attempts at 500ms) despite its 30-second readiness budget. Two new regressions reproduced early failure before edits. The reader now meaningfully uses the bounded window, with finite spaced full reads and allowlisted checkpoint diagnostics. Delayed provider at 20 seconds succeeds offline; unavailable provider uses the 30-second window. Cancellation interrupts stalled injection waits and closes only the owned helper. This does not prove delayed initialization caused the live failure.

Grid source: explicit UI choice between Options Grid loaded results and exact-record reference. The Grid adapter reads only the exact already-loaded named provider, validates namespace/native source route/params, matches exact entity rather than substring filters, and selects only row.actions.edit.href. Provider/data/params/link identity is checked within each probe and private fingerprints rechecked across two reads. The entire native URL is validated and copied unchanged privately to an inactive owned helper. No URL/key/stamp is returned to the dashboard. No silent fallback for duplicate/invalid/changed grid results.

Coverage: loaded grid only. No global not-found, no certified freshness or no-in-flight guarantee. No pagination request or provider/grid handler invocation. The human may load another filter/page manually, or explicitly choose the exact-record address source. No general no-tab guarantee. Notion-to-Magento target pairing stays manual and unverified. Fresh helper data remains a FRESH MAGENTO FORM LOAD, not the user draft or a certified saved-server snapshot.

Validation: 165 targeted tests (100 selection/grid/readiness/fresh form, 14 retained preview, 16 original scanner, 35 catalogue), typecheck, normal build, UI/Notion/lane/feature guards, strict patch whitespace checks and clean archive reconstruction passed. All 213 source/config files and 15 frozen build files are pinned. Both complete and feature-only patches reproduce every canonical source hash and reverse-apply cleanly.

Original page scanner and page lookup, Notion reader/comparison model and external diagnostic functions are unchanged. No dependencies, business writes, Apply/Save/batch execution, module loads, settings/credential exports, native filter edits or user-tab navigation. No live browser/service testing by this implementer. Native dropdown label work stays deferred.

Review the eleven-file delta first, then the complete patch and manifest. Engineering Lead owns independent review and later Experimental staging with backup. Human live testing is still required. Existing source worktrees, frozen artifacts, installed builds, root output and dirty scratch/docs were preserved. Source work is stopped.
