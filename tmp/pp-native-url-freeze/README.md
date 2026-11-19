# PP exact-record native URL fallback v1

Ready for independent review, not installed or live-tested.

Source: C:\Users\user\Videos\BestOfGifts_Master\magento-helper-wxt\tmp\pp-native-url-candidate
Base: cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071, plus frozen selection v2 and this four-file delta. Task branch codex/pp-native-url starts at develop dba3f426cb528a3c49679e586604cddec054ff0e and remains unmodified. Develop integration is separate.

Complete patch SHA-256: eda4cf6664ca84522b8ae46354f5f1a64ddd80976c786930323d5b5e57812804
Fallback-only patch SHA-256: d594b7671e0849e0fe24fd2fae31a1abc1177801625851723ae916c5e3156b92
Manifest SHA-256: 120b06d850770ce357136fc8cdb60459611831e9c0c9f3388dd82c1218e4df19

All 209 source/config files and 15 frozen build files are hashed. Both patches pass strict whitespace checks, reproduce every canonical source hash from clean archives, and pass reverse checks.

Runtime user flow: keep the Notion catalogue/search/multi-selection workflow, choose one PP, enter the exact Magento entity separately and acknowledge temporary pairing. Keep exactly one native edit tab open for that same entity and configured admin base. The worker queries only that exact path, validates the whole native address, and rechecks it before opening a new inactive owned helper with the unchanged address. Zero/multiple/invalid/changed references block before helper creation. The reference tab is only an address source; no user draft is read, injected into, navigated, reloaded or closed.

The full native address stays private in worker memory; no session-key extraction, substitution, persistence, report, settings value or actual key-bearing artifact. Existing route/provider/frame/staleness/redirect checks and helper-only cleanup/cancellation remain. Source labeling stays FRESH MAGENTO FORM LOAD, not the user's draft or certified saved-server state. General-reference/native-listing acquisition is still unproven and not implemented.

Checks: 46 selection/fresh-form, 14 retained preview, 16 scanner and 35 catalogue tests (111 total), typecheck, normal build, UI/Notion/lane/feature guards and diff check passed. Tests cover unchanged native URL copying; wrong host/base/action/entity; query/hash/auth/path rejection; missing/ambiguous/changed/closed references; cancellation during discovery and recheck; no original-tab page access; standalone extraction; redirect/provider identity and owned cleanup. Only synthetic keys used. No browser/live service testing.

Reviewer starts with fallback-only patch, then complete patch and manifest. Engineering Lead owns review and later same-Experimental staging with backup; human tests live. Prior sources, freezes, installed builds, root output and dirty docs/probes were preserved. No agents or automatic cross-chat messages used. Source work is stopped pending review.
