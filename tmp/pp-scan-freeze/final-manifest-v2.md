# PP draft scan candidate freeze, revision 2

Date: 2026-11-14

## Candidate

- Combined candidate worktree: `tmp/pp-scan-candidate`
- Base commit: `cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071`
- Earlier Task 1 PP Catalog source and the stable/frozen artifacts outside this candidate were left untouched.
- Combined patch includes the current candidate's PP Catalog anchor replacement fix and fresh-lookup regression.

## Frozen patch

| Artifact | SHA-256 |
| --- | --- |
| `combined-candidate-final-v2.patch` | `2FEE6549E67AB384E8DD390A3258B2F46FBB1B6AEA707BF476C34BEC4C4BF273` |

## Source hashes

| Candidate file | SHA-256 |
| --- | --- |
| `src/page/features/pp-scan/page.ts` | `508F70B74AE563FB5B08960EC7417115499508447FE061A67D355C3E5D11108E` |
| `src/page/features/pp-scan/index.ts` | `A2B766184BE08D3E4613847F63E9C6935A50F6B04BE7041349DDE18CE1A6E394` |
| `src/entrypoints/background/routers/ui.ts` | `2DD2FA6CC099B4CD9BED91B8A11393E8FDF8C608068865FD17B2DA66BB1F03B1` |
| `src/core/messages/ui.ts` | `FD6B459CE9EF8C8B2A84FBBC004762C7FF7EBC52C238A63E720A98258C8E0321` |
| `tests/ppScan.test.ts` | `1E05ED27A06C84A3B9798C51E8E622B156EF7D404AC467AAB03C08421174C63F` |
| `src/page/features/pp-catalog/index.ts` | `1D3F06C2BBE4BEE94182F1D4C44E88D88E82F791541E1C54548A1F26078E2754` |
| `tests/ppCatalogUi.test.ts` | `211D6F0F8241868562CFE40D73C554DE34A27C30AF99DBFCD367AE3FCCEE92DE` |

## Build hashes

| Build file | SHA-256 |
| --- | --- |
| `.output/chrome-mv3/manifest.json` | `79B0230E5858C1E3779826FF3DCE7AF170802E21F75969F5BEB852B69F148498` |
| `.output/chrome-mv3/background.js` | `F11EBB822A977A09826B0C7A7D02D5782FCFB04273164B700F2208E71239F9E3` |
| `.output/chrome-mv3/content-scripts/content.js` | `13045400275DD7FFFEEA80F41DA439FEECAA1D26F7AFBE998C6B75E19FB90C9D` |
| `.output/chrome-mv3/ui/toolkit.css` | `41C7C3403A18359BF82BE237A4634E4CD871B855ADEDE76F72B1134F89122437` |

## Checks

- `npm run test:pp-scan`: 15 passed. Includes inherited registry method, accessor non-invocation, provider getter safety, skipped-row coverage, route redaction, MAIN-world dispatch, panel coexistence, and unavailable-state UI.
- `npm run test:pp-catalog`: 27 passed. Includes native-anchor replacement followed by a successful fresh Notion lookup.
- `npm run typecheck`: passed.
- `npm run check:ui`: passed.
- `npm run check:notion`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Boundaries and review

The scanner reads only the already-loaded Magento registry. It searches bounded prototype descriptors only for the trusted registry `get` method; accessors remain uninvoked, and provider fields retain own-property reads. The reported route is canonicalized to omit session path segments. The full current path remains an internal stale-response check. An unavailable response displays its warning and does not render an empty snapshot.

No live Magento page, extension installation or reload was used. Independent review of this revision is pending coordinator review. Do not treat this freeze as a release or as authenticated Magento validation.
