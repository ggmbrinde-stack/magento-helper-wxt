# PP draft scan candidate freeze

Date: 2026-11-14

## Candidate

- Combined candidate worktree: `tmp/pp-scan-candidate`
- Base commit: `cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071`
- Scanner-only worktree: `tmp/pp-scan`
- Scanner-only base commit: `dba3f426cb528a3c49679e586604cddec054ff0e`
- Task 1 PP Catalog patch retained unchanged: `e07f7eac8967bd0619c68e69bfab08fc418bd9dbb3391e26bdbb6685c3736d38` (LF-normalized verification hash; raw CRLF hashes differ)

## Frozen artifacts

| Artifact | SHA-256 |
| --- | --- |
| `combined-candidate-final.patch` | `A522FE936770B62C30BC1E554FD9295F0BF95468B75DEE1338825689CD185CA4` |
| `scanner-only-final.patch` | `AAB045524FCA5EF8B734424A608A076FB4989ACF2792BF1CECCA52084D214845` |

## Source hashes

| Candidate file | SHA-256 |
| --- | --- |
| `src/page/features/pp-scan/index.ts` | `553DA68BEB5E220614AA0125F0364C3665458E87EEF788BEC6311E28714C4DD7` |
| `src/page/features/pp-scan/page.ts` | `B139A2D2FD38694B1456C94D183E8A7481448718AD4FF8B9AA265C98D01249F6` |
| `src/entrypoints/background/routers/ui.ts` | `C908BF85595423CBF781C608EB6AA2E545DCCB6891EE8B9E9DA2D5147A48471F` |
| `src/core/messages/ui.ts` | `FD6B459CE9EF8C8B2A84FBBC004762C7FF7EBC52C238A63E720A98258C8E0321` |
| `tests/ppScan.test.ts` | `570E892D529309B4C26F566D2D13D51C9681153E5521B80F0CA9B56960271957` |

## Build hashes

| Build file | SHA-256 |
| --- | --- |
| `.output/chrome-mv3/manifest.json` | `79B0230E5858C1E3779826FF3DCE7AF170802E21F75969F5BEB852B69F148498` |
| `.output/chrome-mv3/background.js` | `38865E16A99395B06AD3D0B97CCA0BACD3B339CF397F74A73405290CD158A845` |
| `.output/chrome-mv3/content-scripts/content.js` | `4840912D71FF16EEA179AB9D70C4F5B7CE4EE387240610947404C73B1630529D` |
| `.output/chrome-mv3/ui/toolkit.css` | `41C7C3403A18359BF82BE237A4634E4CD871B855ADEDE76F72B1134F89122437` |

## Checks before freeze

- Combined `npm run test:pp-scan`: 13 passed.
- Combined `npm run test:pp-catalog`: 27 passed.
- Combined `npm run typecheck`: passed.
- Combined `npm run check:ui`: passed.
- Combined `npm run build`: passed.
- Scanner-only `npm run test:pp-scan`: 12 passed.
- No live Magento test, extension install/reload, or authenticated page behavior was performed.

## Review state

This freeze preserves the updated candidate and does not mark it ready to accept. Independent re-review confirmed the scanner fixes and found one remaining P2 in the unchanged Task 1 PP Catalog module: replacing the native anchor in place can leave its panel holding a stale native-node reference, causing later Notion lookup responses to be discarded. The combined lifecycle test currently checks panel count and order after replacement but does not perform another lookup. The Task 1 owner needs to address that separately before the combined candidate can be accepted. The original review note and earlier freeze artifacts remain unchanged.
