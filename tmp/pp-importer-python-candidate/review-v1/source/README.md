# BOG Studio · PP importer

This Python tool imports **Perfis de Personalização (PPs)** from the Excel workbook into the company Notion catalog. It uses the official Notion REST API, with the API version pinned to `2026-03-11`. The workbook is read locally. The importer uses the Python 3.11+ standard library.

- [SETUP_NOTION.md](SETUP_NOTION.md) lists the exact database fields, permissions and steps for the first import.
- [PROMPT_BOG_STUDIO.md](PROMPT_BOG_STUDIO.md) is ready to paste into the AI assistant on the company PC.
- [importar_pp.py](importar_pp.py) is the importer. This copy requires `--fonte-dados` when preparing a new plan.

## How it works

1. **Prepare.** Read the workbook, build a JSON plan and produce a summary and review CSV. The supported sheets are `PPs TÊXTIL`, `PPs BRINDES` and `PPs BRINDE TÊXTIL`. `Notas PP` adds to the option catalog. The extractor expects the original layout, including the blocks and borders that separate groups of locations.
2. **Review.** Check the codes, warnings, grouped locations, original option text and detected images. Repeated codes and blocks without a code are held for review. A note about a shared group is kept with the group so the importer does not guess which option belongs to which location.
3. **Import.** Check existing codes, add missing dropdown options and create one page per eligible new code with status **A rever**. The page keeps the full details and a collapsible record of the source cells. It includes all detected images, with the first also used as the main image and cover.

The original run created 803 pages, bringing the original workspace catalog to 805. BOG Studio should generate its own counts from its current workbook. Existing pages are skipped by `Código PP`, so rerunning this tool preserves manual edits. Updating existing profiles would require a separate workflow.

## Files generated on the company PC

| File | Purpose |
| --- | --- |
| `plano_importacao.json` | Workbook path and hash, destination data-source ID, extracted catalog and blocked records |
| `resumo.json` | Counts and exceptions |
| `revisao.csv` | One row per coded block for review |
| `opcoes_notion.json` | Dropdown options detected in the workbook |
| `importacao_estado.json` | Record of page creation during an applied import |

Keep the Excel workbook at the path recorded in the plan until the import finishes. The tool reads image bytes from it at import time. If the file changes or moves, prepare a fresh plan. Use a fresh output folder for each destination so each import has its own log.

The ZIP contains the code and guides. Use the current BOG Studio workbook as the input. The PDF price tables and the later PP transcriptions were part of the PDF project and are outside this importer's scope.


## Offline maintenance candidate, 17 November 2026

Independent review is pending. This candidate has only been exercised offline. It does not update existing PP pages or add new Notion body layouts.

Fixes:

- Automatic/default top-border colours are recognised as location boundaries only on labelled location rows. PP428 now keeps Peito P10:P15 separate from Bolso P16:P17; neighbouring PP633 keeps its three-plus-two layout.
- Shared, missing or ambiguous location assignments remain intact and are blocked for import, including older plans without extraction-time blocks. Original option text, source cells, notes, comments and image references remain recoverable.
- Import rejects missing/duplicate plan codes. An all-existing-code run returns before option preparation or any mutation.
- Both import and option preparation verify the source workbook hash before API operations. Pending page creations not reconciled by the destination query are held for manual review instead of being repeated.
- Temporary option-helper creation and cleanup now use `opcoes_estado.json`. An uncertain helper create or cleanup blocks another attempt; retain that journal. Existing labels and manual page content are preserved.

Local preview commands, from a working copy of this candidate folder:

```powershell
python -m unittest discover -s tests -v
python tests/preview_focused.py
python importar_pp.py importar --plano "focused-preview/AI_READ_Perfis de Personalização - Cópia.json" --codigo 428
```

None of these commands sends Notion requests. The focused preview reads only the documented worksheet range and supporting metadata from the two Desktop workbooks, checks their hashes, and marks every generated record blocked for writes. It uses a placeholder destination UUID. It is not a full-workbook import plan. The XLSX test fixture uses synthetic image bytes; real image bytes remain in the unchanged original workbooks, identified by hash and archive entry.

No live Notion API, uploads, schema changes or imports were tested. Image MIME/size rejection and write-timeout/5xx behaviour are covered by local mocks; image format support and actual API contracts are unchanged. The full 122 MB workbook extraction path was not run. New/Old templates, pricing/PDF rules, DTF label mapping, Magento and the TypeScript extension are outside this change.
