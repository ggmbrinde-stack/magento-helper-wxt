# PP Python workflow analysis | 19 November 2026

## Recovery update, superseding the earlier missing-runner assessment

Current checkout is `experimental/drime-integration` at `746159f4228f0cf24ac7e230dad99248c369459b`. The runner, operational plans, captures, workbook and ZIPs are now present. The earlier analysis below is retained as historical evidence. The local Setup reports still describe the pre-recovery state. Setup's reported 141 Python and 14 Node passing tests were not repeated.

### Exact package usable for the next planning run

Read-only hashing performed in this assignment found:

| Location under BOG_Studio | Manifest entries | Current mismatches |
| --- | --- | --- |
| `magento-helper-wxt/tmp/pp-full-conversion-candidate/review-full-v2` | 250 | 159 |
| `_git_exact_checkout/tmp/pp-full-conversion-candidate/review-full-v2` | 250 | 87 |
| Members of `magento-helper-wxt/tmp/pp-full-conversion-candidate/PP_Full_Conversion_REVIEW_v2.zip` | 250 | 0 |

The ZIP hash is the expected `36a9241f8e751dd9488ef9a51a762c1755916a495c9afada13b353bd9ee815cd`. Its entries are at ZIP root. This is the verified immutable package available now. Neither inspected extracted directory satisfies the manifest now. The names alone, including `_git_exact_checkout`, cannot establish identity. Hash differences were observed directly; this pass did not classify every difference as line-ending-only.

For execution, Setup should extract that verified ZIP unchanged to a fresh execution directory and verify its manifest there. Keep outputs elsewhere. No extraction or frozen-file modification was performed in this analysis. The interpreter already available is `C:/Users/gonca/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. The implementation digest hashes raw file bytes of 23 source/contract files, so checkout formatting affects implementation identity as well as evidence checks (`source/batch_plan.py:305`). Passing tests while selected files temporarily used Git blob bytes does not establish that today's checkout matches the reviewed package.

### Actual preparation contract and exact route

Source references below are relative to the verified ZIP root, also readable in the recovered directory for inspection.

- `source/batch_cli.py:84` defines `prepare-full --captures --workbook --index --inventory --codes --output [--contexts]`. It calls `full_conversion.prepare` directly. `inspect --plan` reports stored identity/status without executing a session; it does not revalidate all source hashes (`batch_cli.py:115`).
- `source/full_conversion.py:350` checks workbook against index and the authorized SHA `c2a99e711658a63a09d83156a8c6c7a3b512bf8c59b8c0b9688c017ee6ab4348`, exact selection against inventory, and PP601 exclusion. It binds inventory page IDs to current page code/identity, reads working-copy rules, schema and the PP428 layout reference, then derives per-page content/property operations and blockers.
- Required capture files are `home.json`, `schema.json`, `pp428.json`, and `pp<code>.json` for each selected PP. Page captures have `capture` metadata and the original connector `response`, including `structuredContent.text`. The hardcoded working-copy home is `417b6705ae1f81aabd8bf1130a9b991c`; collection is `collection://431b6705-ae1f-83db-b71c-0739778f9e1a` (`batch_plan.py:16`). Page schema and parent identities are checked at lines 37, 63 and 72.
- `source/prepare_bridge.js:19` obtains selected identities through `selection`, reads only selected pages plus home/schema/PP428, scrubs signed media URLs and writes capture JSON with `apply_patch`. It calls `prepare-full` at line 37. It does not create browser observations. It hardcodes the command name `python`, so the existing bundled interpreter must be selected by the invoking process environment or the local command invoked explicitly. Tool availability and current response shape still require a real read check.
- `captures/browser-regions.json` must contain `pages[code]` with matching page ID and last-edited state. Region evidence includes native IDs, child IDs/types, table cells, headings and column child order. `full_conversion.py:407` binds it to the current page-state hash. `full_regions.py:34` checks actual supported container content and structure. Historical PP261/262 observations do not cover this batch. The older final-current captures and AVENTAIS dry run remain stale.
- Optional contexts are a JSON object keyed by code. Human method decisions require `human_confirmed: true` and `evidence_reference` (`full_conversion.py:144`). Preserve PP428's pocket decision locally to that PP and retain the existing pocket corrections on 430/558/661/662. Fresh page reads must establish the remaining decisions.

After Setup supplies the exact extracted package as `$ppPackage`, and Notion supplies fresh captures and verified inventory as `$ppCaptures` and `$ppInventory`, the no-write command is:

```powershell
& 'C:/Users/gonca/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -B "$ppPackage/source/batch_cli.py" prepare-full --captures $ppCaptures --workbook "$ppPackage/input/workbook.xlsx" --index "$ppPackage/input/workbook-index.json" --inventory $ppInventory --codes 428 429 430 467 558 612 633 661 662 786 840 --output 'C:/Users/gonca/Documents/ChatGPT/BOG_Studio/coordination/aventais-fresh/plan.json'
```

Use a new captures/output directory. Add `--contexts <reviewed-context-file>` when there are documented decisions to supply. This command is specified, not executed against stale data. It produces plan JSON, before/after Markdown, individual PP reports, summary, Notion/Excel coverage and an approval-pending file with blank review reference and `apply_allowed_now: false` (`full_conversion.py:436-465`). An error-report status may include a proposed future `Erro` status operation; preparation performs no Notion write. The updated workbook reader limits PP840 to M126:P135, superseding the October M126:P369 range.

### Actual session journal and response bridge

`source/session_bridge.js:56-63` already solves the Windows command-line-size problem by saving a scrubbed `{nonce,result}` or `{nonce,error}` event to `<plan>.event-<32-hex-nonce>.json`, calling `session-step --event-file`, then removing the consumed spool. `batch_cli.py:134` requires that spool to be in the plan directory with the correct name prefix. No new adapter is justified by the recovered code. Current connector/tool compatibility and end-to-end file transport remain untested here.

The apply protocol requires explicit plan hash, approval and `--apply`. `batch_apply.py:116-164` validates implementation, approval and eligible operations. `batch_cli.py:124-127` selects `<plan-parent>/runs/<digest(plan+approval)>` for the per-page policy. `batch_apply.py:311-364` owns `journal.json`, application fence, persisted events/receipts, quarantine records and `batch-report.json`. Before-page, prewrite, schema/rule and postwrite reads are checked against reviewed state; uncertain operations are not blindly replayed. Reconcile and cancellation are separate transitions.

Recovered PP39 evidence is at `magento-helper-wxt/tmp/pp-full-conversion-run/runs/72cb242f940e9f7b4b04d008d14c485c0413bb632a98eba16db4b0774f56cd60/`. Its journal and batch report are CANCELLED with empty receipts. The report says “User cancelled before next mutation”. The handoff supplies the additional historical reason involving transfer of the MCP response. This is not successful live-write verification.

### Remaining dependencies for Review

1. Use an extraction whose 250 manifest entries match the verified ZIP, with separate writable run output.
2. Verify live access and current connector response format for the exact working copy and its data source, then capture all 11 current pages and page-specific preservation observations.
3. Refresh the no-write plan and resolve only its actual remaining method/source questions. Review exact implementation/plan hashes and operation set before a pilot. No current per-page blocker list can be inferred from the saved dry run.

The October importer analysis below remains valid for its historical create-only behavior. Its workbook, destination and creation ledger do not supply the newer conversion contracts.

## Earlier pre-recovery analysis

**The October importer is available and its offline preview works. The November full-conversion runner, its journal and its inputs were not recovered in the locations checked. The historical preview confirms source ranges for all 11 AVENTAIS profiles, but cannot refresh their Notion state or produce a conversion plan.**

## Repository and evidence

- Checkout: `C:/Users/gonca/Documents/ChatGPT/BOG_Studio/magento-helper-wxt`. One worktree on clean `main` at `dba3f426cb528a3c49679e586604cddec054ff0e`. The old commit `946e7514d0fe90f4f89029f9c0eb3bdf47619031` is absent from the local object database. Setup reports the experimental branch and commit unavailable remotely. Read the [Setup report](../MAGENTO_HELPER_SETUP_REPORT_2026-11-19.md), the checked-out documentation index and 5 November handoff, and the [original handoff](<C:/Users/gonca/.codex/attachments/4bd45a80-65b9-495e-b34b-7b5e731809f4/Pasted text.txt>).
- `AGENTS.md` and `docs/shared/AGENT-WORKFLOW.md` are absent from checked-out main but readable with `git show origin/codex/release-baseline:<path>` at `cd3d2ab`. The PP continuation document `docs/shared/PP-FULL-CONVERSION-CONTINUE-2026-11-19.md` and PP lane material referenced by the original handoff were not found in the checked-out docs. The available Git refs did not reveal a Python importer or full-conversion artifact.
- Missing at their documented paths: `tmp/pp-full-conversion-candidate/review-full-v2/` and `tmp/pp-full-conversion-candidate/PP_Full_Conversion_REVIEW_v2.zip`. Consequently the implementation, manifest, CLI/config, tests, candidate plans/captures, runner journal and its exact filename/format cannot be verified. Targeted filename searches of the local Codex documents, ChatGPT projects and Downloads surfaced no copy. The original handoff records ZIP SHA-256 `36a9241f8e751dd9488ef9a51a762c1755916a495c9afada13b353bd9ee815cd`, manifest `a66b26f10f9361eca92e6d8355510955e2dcd04078188d9f3af714f9a0f776f7`, and implementation `dafc80c641d650fb9311a66cd6c3298c229e2775f8bb8d2e43acc42b1178a676`. These are recovery verification values from the handoff.

## What the existing Python actually does

The historical root is `C:/Users/gonca/Documents/Codex/2026-10-28/rea-plugin-rea-rea-x20/outputs/importador_pp`. See [importar_pp.py](<C:/Users/gonca/Documents/Codex/2026-10-28/rea-plugin-rea-rea-x20/outputs/importador_pp/importar_pp.py>) and [LEIA-ME.md](<C:/Users/gonca/Documents/Codex/2026-10-28/rea-plugin-rea-rea-x20/outputs/importador_pp/LEIA-ME.md>). Its sibling `BOG_Studio_PP_Importer/importar_pp.py` is a company-portable copy with required `preparar --fonte-dados`. The sibling retains the same create-only behavior in `import_records`. A separate archive copy sits under `passagem_empresa_2026-10-30/importer_original/`.

| Stage | Contract and behavior |
| --- | --- |
| `preparar --excel … --pasta …` | Reads OOXML locally, extracts the three catalog sheets and the `Notas PP` option catalog, and saves format v1 `plano_importacao.json`, `revisao.csv`, `resumo.json` and `opcoes_notion.json`. The plan includes source path/hash/metadata, destination data-source UUID, coded records with groups, raw cells, comments, image entry references, flags/blockers, duplicates and orphan records. Locations stay grouped where assignment is ambiguous. See `extract` at line 309 and `main` at 685. |
| `importar --plano … --codigo …` without `--aplicar` | Loads saved JSON, checks version and UUID syntax, and prints counts and selected PP codes, ranges and import blockers. It returns before client creation or lock acquisition. It does not validate current workbook content, authenticate, fetch page state, generate block diffs or open the journal. |
| Historical apply | `Notion` at line 529 uses the REST API with pinned version `2026-03-11` and a local environment credential. `import_records` at line 633 checks the workbook hash, rejects explicitly selected blocked/unknown records, filters blocked records on bulk runs, queries the target data source with pagination, and aborts on duplicate existing `Código PP`. It prepares schema options before skipping existing codes. Therefore an apply can write to the data source even if all selected codes already exist. New codes get workbook images, cover, grouped tables, collapsed Excel evidence and status `A rever`. No existing PP body or properties are updated. |
| Option writes and creation journal | `prepare_options` at line 605 can patch schema options or create a temporary page for option batches, then attempts to trash that helper in a finally block. Apply uses a per-plan-folder `importacao.lock`. `importacao_estado.json` stores `a_criar` before page creation, then `criado` with page ID and workbook hash after the create response, followed by readback of the code. A write 5xx/timeout is not automatically retried. A subsequent run queries the destination again. This is a creation ledger and does not prove full page readback, existing-block preservation, or candidate journal readiness. |

The historical plan points to Demo data source `c85b9e4d-3973-45aa-8603-608ca6da669a` (Demo page `6d1d9ca5a646499d8f7dadf608aa267d`). The saved journal at `importador_pp/previsualizacao/importacao_estado.json` records 803 `criado` entries with the historical workbook hash. This corroborates the company copy README's account of the later import. The early October notes predate that run. PP42 was created/finished via MCP according to the October conclusions. These are historical records, with no new live verification in this assignment.

## Verified offline command and source ranges

From the historical root, the following non-apply command succeeded on local Python 3.10. The package documents Python 3.11+ for supported operation. Two focused existing mock tests passed on 3.10: a page create returning HTTP 503 is attempted once, and a temporary options page receives a trash request after a simulated update failure. The tests that create temp directories alongside the historical script were omitted on retry. No dependency install, broad suite, source edits, or live calls were needed.

```powershell
Set-Location -LiteralPath 'C:/Users/gonca/Documents/Codex/2026-10-28/rea-plugin-rea-rea-x20/outputs/importador_pp'
py -3.10 -B .\importar_pp.py importar --plano .\previsualizacao\plano_importacao.json --codigo 428 --codigo 429 --codigo 430 --codigo 467 --codigo 558 --codigo 612 --codigo 633 --codigo 661 --codigo 662 --codigo 786 --codigo 840
```

All ranges below are on `PPs BRINDE TÊXTIL` in `C:/Users/gonca/Downloads/AI_READ_Perfis de Personalização - Cópia.xlsx`. The file exists and its SHA-256 matches the plan's revision 19 source, `36262f1c3eb216dfeed34b374643d239faf15e0691935ccef5163ced46e28566`. The separate `Downloads/Perfis de Personalização.xlsx` has a different hash, `ffe1b663fed6e50040250e84ce64c0a6c744c43da91720fe55e898ff754a498b`. Confirm the authorized conversion workbook with the current page evidence before choosing either.

| PP | Historical range | Status per 19 November handoff, pending refresh |
| --- | --- | --- |
| 428 | M9:P20 | A rever |
| 429 | M33:P40 | A rever |
| 430 | M41:P51 | Para revisão |
| 467 | M95:P104 | A rever |
| 558 | M105:P116 | Para revisão |
| 612 | M117:P125 | A rever |
| 633 | M21:P32 | A rever |
| 661 | M63:P73 | Para revisão |
| 662 | M74:P94 | Para revisão |
| 786 | M52:P62 | A rever |
| 840 | M126:P369 | A rever |

The preview reports empty October import blocker lists for these 11 records. The conversion blockers remain undetermined. The handoff reports PP786's saved page ID ending `56b` was correct and the typo was in a manual API check. Exact live page UUIDs and current property/block state remain to be verified against the working copy. PP601 stays excluded. The pocket changes on 430, 558, 661 and 662 are already present per handoff. PP428's approved Transfer option (126 cm², one colour) is specific to its pocket.

## Minimum path to a fresh no-write conversion plan

1. Recover the exact frozen files, relevant PP docs and any surviving candidate journal through Setup or the original PC. Hash-check the package and components above. Use a separate working/output directory and inspect the recovered CLI, fixtures and journal schema before choosing an invocation. No verified conversion command is available today.
2. Obtain read access to working-copy page `417b6705-ae1f-81aa-bd8b-f1130a9b991c` and verify its actual data source. The last reported connector result was 404. Capture current data-source/schema and each exact PP's complete page properties and ordered recursive block tree, with pagination exhausted. Bind captures to source ID, page UUID, PP code and current edit state, and check for changes across capture. For the existing New, Old and Excel regions, collect the page-bound evidence that the recovered preservation guard expects. The handoff reports `source/captures/final-current/browser-regions.json` was absent from the candidate. A visual observation of headings alone cannot establish preservation.
3. Keep the runner's existing validated journal ingestion as the destination. First check whether its existing read-to-file or offline import path accepts full API responses. Prefer authorized local read-only API access when the connector only exposes summaries or cannot deliver lossless response files. If needed after recovery, the only proposed code addition is a small external adapter into the existing parser and journal interface. It would preserve read identities, revisions, block ordering and pagination, and reject missing/ambiguous/mismatched evidence. Use a fresh run journal; do not write a success state, fabricate responses, patch the frozen implementation or bypass its checks. Verify with the recovered fixtures and a targeted check that stale, incomplete or wrong-page input is rejected.
4. Run the recovered planner in its verified no-write mode for exactly the 11 allowlisted PPs. Review per-page source range, current status, unresolved mappings and page/block preservation evidence, and exact content/property operations. Independently review that plan before any separately approved pilot. The 17 November saved inputs preceded 18 November live edits. The old zero-operation result and provisional mapping flags do not establish today's outcome. The prior PP39 review covered PP39 only. Its attempt stopped before any Notion write because the MCP response could not be handed to the runner journal safely.

This report is based on local code and artifacts plus explicitly attributed handoff claims. Current Notion access, exact candidate input/journal contracts, and the refreshed conversion plan remain open.
