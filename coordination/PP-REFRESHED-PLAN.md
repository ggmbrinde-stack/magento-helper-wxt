# AVENTAIS refreshed-plan input handoff

## Fresh diagnostic result, superseding the pending-input status below

Generated 19 November from the 13 current runner captures. Independently checked all 26 original/runner file hashes against `evidence/2026-11-19/current-v2/capture-manifest.json`; zero mismatches. The runner accepted current page identities against the packaged inventory and verified workbook/index identity. The inventory remains the packaged inventory, with selected IDs validated against the fresh page responses; its full 814-page population was not freshly re-queried here. No contexts file was supplied, so this run adds no human business decisions.

The command below ran successfully from `C:/Users/gonca/Documents/ChatGPT/BOG_Studio`:

```powershell
& 'C:/Users/gonca/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -B coordination/pp-execution-746159f-20261119-01/source/batch_cli.py prepare-full --captures coordination/evidence/2026-11-19/current-v2/runner --workbook coordination/pp-execution-746159f-20261119-01/input/workbook.xlsx --index coordination/pp-execution-746159f-20261119-01/input/workbook-index.json --inventory coordination/pp-execution-746159f-20261119-01/input/inventory-current.json --codes 428 429 430 467 558 612 633 661 662 786 840 --output coordination/aventais-diagnostic-20261119-01/plan.json
```

- [Machine-readable plan](aventais-diagnostic-20261119-01/plan.json). Canonical runner plan digest `2cf5d93a2348eda996ae5609d692a201de5df33c172ffd30f7a2eb5fa87e3c1b`; raw file SHA-256 `3c5af343b86397d8ba1c34e28057535fb5fa599e77959d1e429fd78fbc349715`.
- Implementation digest `dafc80c641d650fb9311a66cd6c3298c229e2775f8bb8d2e43acc42b1178a676` matches the frozen package.
- [Summary and exact pending text](aventais-diagnostic-20261119-01/plan-reports/summary.json), individual `PP<code>.json`, and before/after Markdown are under `aventais-diagnostic-20261119-01/plan-reports/`.
- All 11 pages are `READY_FOR_ERROR_REPORT`, `method_complete: false`, with zero body and zero property operations. Every page has the preservation blocker “Contentor existente exige prova limitada de preservação ou edição nativa suportada”. The plan includes proposed success/error status operation definitions and an approval-pending artifact. They were not executed. No execution journal exists because no session was started.

This is a blocked diagnostic artifact. Its rendered proposals and empty pending arrays do not establish technical approval. PP428/429/430/558 have no generated mapping questions, while their existing page notes still contain technical questions documented by Notion.

| PP | Additional generated mapping questions |
| --- | --- |
| 467 | Peito Transfer 57/126 cm² one colour; Bolso Transfer 57 cm² one colour; Chapéu Transfer 12/57 cm² two colours |
| 612 | Peito Transfer 57/126 cm² two colours; Bolso Transfer 57 cm² two colours |
| 633 | Bolso Transfer 126 cm² one colour |
| 661 | Peito Transfer 280/560 cm² one colour |
| 662 | Caixa Serigrafia up to/above 120 cm² two colours, Laser CO2 120/250/360 cm², plus its material/process/area |
| 786 | Grouped chest/left/right pockets Transfer 126 cm² two colours |
| 840 | Peito Transfer 57/126 cm² two colours; Bolso Transfer 57 cm² two colours; Chapéu Transfer 12/57 cm² two colours |

## Precise preservation handoff and verifier limitation

Sources are in `coordination/pp-execution-746159f-20261119-01/source/`.

1. For each PP, `browser-regions.json` needs `pages[code].page_id`, `source_edited_at` matching the fresh response, and actual `regions`. The planner adds the current `source_state_sha256` and sets `global_export_claimed: false` (`full_conversion.py:407-411`).
2. For New/Old columns, observe `kind: columns`, native region `id`, the two ordered column UUIDs in `children`, ordered table matrices in `tables`, and each column's ordered `column_children` entries with `kind` and heading `text`. The verifier matches every child kind and heading plus all table cells (`full_regions.py:48-65`). PP428's few known IDs do not supply these full observations.
3. For mutable toggles, observe `kind: toggle`, `id`, `title`, child UUIDs, `child_types` and `paragraphs`. Current support is specifically bullet-only child paragraphs with `child_types` all `bulleted_list` (`full_regions.py:44-47`). Preserve the exact source toggle in place. The source toggle is explicitly excluded from mutable content at `full_conversion.py:254,290`, so a source-toggle rewrite proof is not required by this render path.
4. **Current callouts exceed the frozen verifier's support.** Read-only parsing of the fresh plan's source bodies found a review callout with five children for every PP. `full_regions.py:42-43` accepts a callout only when it has exactly one child of kind paragraph and matching observed `text`. `full_conversion.py:290-295` requires every mutable top-level node to be a supported leaf or verified container. Consequently complete observations cannot by themselves clear these five-child callouts. Notion should preserve their real child structure; do not flatten them, fabricate evidence, or alter captures to force eligibility.

The coordinator needs to decide how to handle that unsupported structure through a separately scoped, reviewed change or supported native editing approach. This assignment makes no such change. Column/toggle observations remain useful, but collecting them alone cannot make this frozen implementation executable for these pages.

No suites rerun, frozen files edited, or live mutations performed. Raw connector evidence remains in its original directory.

## Earlier required-input handoff

Checked 19 November 2026. Planning is pending the concrete inputs below. No new machine-readable plan or execution journal was generated.

Scope is exactly PP428, 429, 430, 467, 558, 612, 633, 661, 662, 786 and 840. PP601 is protected. The existing pocket corrections remain partial conversions.

## Required from Setup

`coordination/PP-EXECUTION-ENVIRONMENT.md` was absent at this check. Supply the absolute path of the new unchanged v2 ZIP extraction, its completed 250-entry manifest verification, and the Python 3.12 interpreter path. The original ZIP is verified, but the two previously inspected extracted directories have manifest mismatches. See [Coding analysis](CODING-PP-ANALYSIS.md).

## Required from Notion

[The current assessment](NOTION-PP-ANALYSIS.md) confirms working-copy access and successful reads of all 11 pages. Its Markdown research capture explicitly omits expiring image URLs and appended schema and is not a direct planner input.

Supply one fresh capture-directory path containing:

- `home.json` with current rules for home `417b6705ae1f81aabd8bf1130a9b991c`.
- `schema.json` for `collection://431b6705-ae1f-83db-b71c-0739778f9e1a`.
- `pp<code>.json` for each of the 11 codes, including PP428 as layout reference, using the existing prepare bridge's `{capture, response}` envelope and tool-native response structure. Retain page IDs, current edit states and supported body content.
- `browser-regions.json` with actual page-bound observations for the current New/Old/Excel containers. The historical PP261/262 observations cannot establish these pages' preservation.
- The exact verified inventory JSON path mapping these codes to their current working-copy page IDs. Supply an optional per-code contexts JSON only where decisions have documented human confirmation and evidence references.

The existing bridge's documented signed-URL handling remains applicable. Preserve original read evidence separately where appropriate; do not replace required response structure with the research summary.

## Next authorized step

Once those inputs are delivered, run the existing `prepare-full` command from the verified package for the exact 11 codes with new output outside the frozen package. Record the generated plan and implementation hashes, before/after reports, property/content operations and pending choices here. The planner creates an approval-pending file; its execution journal is created only by the separate session protocol. A no-write preparation does not require starting an apply session.

No stale captures were substituted, tests repeated, or source/Notion/Magento changes made.
