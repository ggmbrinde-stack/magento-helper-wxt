# PP draft scan candidate freeze, revision 3

Date: 2026-11-14

## Candidate

- Combined candidate worktree: `tmp/pp-scan-candidate`
- Base commit: `cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071`
- Earlier Task 1 PP Catalog source and stable/frozen artifacts outside this candidate were left untouched.
- This candidate includes the panel lifecycle fix and its fresh-lookup regression.

## Frozen patch

| Artifact | SHA-256 |
| --- | --- |
| `combined-candidate-final-v3.patch` | `30EBA47C23E2BEF25DB1098CE80EB372FAA3E7D63CF80F54F8DD442D4ED07551` |

## Source hashes

| Candidate file | SHA-256 |
| --- | --- |
| `src/page/features/pp-scan/page.ts` | `B62F4A06D42D682895062D77AF502D91607A1C179F3663E39B1527137485D09D` |
| `src/page/features/pp-scan/index.ts` | `A2B766184BE08D3E4613847F63E9C6935A50F6B04BE7041349DDE18CE1A6E394` |
| `src/entrypoints/background/routers/ui.ts` | `2DD2FA6CC099B4CD9BED91B8A11393E8FDF8C608068865FD17B2DA66BB1F03B1` |
| `src/core/messages/ui.ts` | `FD6B459CE9EF8C8B2A84FBBC004762C7FF7EBC52C238A63E720A98258C8E0321` |
| `tests/ppScan.test.ts` | `A9E3B9D962D28FBF78B93A7ACCE654F00BAA0220F564999703DB29C59CEC6D7D` |
| `src/page/features/pp-catalog/index.ts` | `1D3F06C2BBE4BEE94182F1D4C44E88D88E82F791541E1C54548A1F26078E2754` |
| `tests/ppCatalogUi.test.ts` | `211D6F0F8241868562CFE40D73C554DE34A27C30AF99DBFCD367AE3FCCEE92DE` |

## Build hashes

| Build file | SHA-256 |
| --- | --- |
| `.output/chrome-mv3/manifest.json` | `79B0230E5858C1E3779826FF3DCE7AF170802E21F75969F5BEB852B69F148498` |
| `.output/chrome-mv3/background.js` | `DE24CDE1033D69B62207EC9BCDE09241BA23D661349D46EFF9999FF7102FCB19` |
| `.output/chrome-mv3/content-scripts/content.js` | `13045400275DD7FFFEEA80F41DA439FEECAA1D26F7AFBE998C6B75E19FB90C9D` |
| `.output/chrome-mv3/ui/toolkit.css` | `41C7C3403A18359BF82BE237A4634E4CD871B855ADEDE76F72B1134F89122437` |

## Checks

- `npm run test:pp-scan`: 16 passed. Includes serialized MAIN-world execution in a separate context with an inherited registry method, safe route output, accessor non-invocation, own-property provider reads, skipped-row coverage, route redaction, message routing, panel coexistence, and unavailable-state UI.
- `npm run test:pp-catalog`: 27 passed, including native-anchor replacement followed by a successful fresh lookup.
- `npm run typecheck`: passed.
- `npm run check:ui`: passed.
- `npm run check:notion`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Boundaries and review

The injected scan function is self-contained and reads only the already-loaded Magento registry. It searches bounded prototype descriptors only for the trusted registry `get` method; accessors remain uninvoked, and provider fields retain own-property reads. The reported route omits session path segments, while the full current path remains an internal stale-response check. An unavailable response shows its warning without rendering an empty snapshot.

No live Magento page, extension installation, or reload was used. Independent review is coordinated separately. This freeze is not a release or authenticated Magento validation.
