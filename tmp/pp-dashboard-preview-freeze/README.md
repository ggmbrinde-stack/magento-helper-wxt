# PP dashboard preview v1

Read-only candidate awaiting independent review.

Task branch: codex/pp-dashboard-preview from develop (dba3f426cb528a3c49679e586604cddec054ff0e). The branch worktree is unmodified. Build source: C:\Users\user\Videos\BestOfGifts_Master\magento-helper-wxt\tmp\pp-dashboard-preview-candidate, detached at cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071, with reviewed combined v3 plus the preview-only delta. No merge, rebase or commit was made.

Combined patch: combined-pp-dashboard-preview-v1.patch
SHA-256: 9872b1377cb5febd42bb7156c07888b28836761658dbf0b1abeec99010dc758e

Preview-only delta: pp-dashboard-preview-only-v1.patch
SHA-256: 550cc19c4de5f34ac1ded512fdecaf4eb278917a4ac77c918f601f708154470c

Manifest pins all 206 source/config files and all 15 frozen build files. Both patches pass reverse-apply checks against the candidate. The existing content-script bundle exactly matches frozen v3.

Validation: 19 preview, 16 scanner and 27 catalogue tests; typecheck, normal production build, UI/Notion/lane/feature guards and diff check passed.

The user lists supported open PP edit tabs, selects one, enters an exact code, acknowledges manual pairing and explicitly reads both sources. Source/status/time and separate entity/set/business IDs are shown. The sources remain manually paired, not verified. Current Magento data is an unsaved draft. Cross-source native-field mapping remains unknown, so rows are blocked references, not an executable diff. Provider/general Attribute Set ID consistency is the supported internal check.

New messages: LIST_PP_PREVIEW_TABS and READ_PP_PREVIEW_DRAFT (UI lane), FETCH_PP_PREVIEW_CATALOG (audit lane). All three require the exact own dashboard sender. Existing page-sender routes unchanged. No new writes or settings persistence.

Reviewer: inspect the 11-file preview-only delta first, then the complete combined patch and manifest. Engineering Lead coordinates review and later Experimental staging. Live testing is reserved for the human. Prior worktrees, installations, root output and frozen artifacts were not modified. Develop integration remains a separate unresolved base mismatch.
