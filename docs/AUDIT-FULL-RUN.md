# Full run audit — code audit (2026-10-26)

**Status:** all findings below are fixed in the working tree (same day). The
sections after "Verified working" keep the original evidence; every fix and the
check that proves it is in the [fix log](#fix-log-2026-10-26).

Scope: the **Run audit** path in the dashboard — paste SKUs → `BATCH_START` → `batchRunner.pump()` → `runSku()` (resolve → variants → image audit → text audit → payload/dossier/library) → per-SKU storage, plus the post-batch gates that read that stored state. The audit was read-and-run; the fixes it lists were applied afterwards (see the fix log).

Method:

- Read the engine (`imageAudit.ts`, `textAudit.ts`), collectors (`imageFetch.ts`, `textFetch.ts`), harness (`batch.ts`, `batchRunner.ts`), payload/dossier builders and the dashboard sections.
- Ran the real modules in Node (bundled with the project's esbuild) against synthetic fixtures and against the **live** storefront (`R0304`, 48 children, EN/ES/FR) — see `.output/audit1/` (`entry.ts` → `run.mjs`, `live.ts` → `live.mjs`, `live2.ts` → `live2.mjs`, and the post-fix regression suite `verify-fixes.ts` → `verify-fixes.mjs`).
- Ran `npx tsc --noEmit` and `npm run build`.

Repro (`.output/` is gitignored; rebuild the probes with the project's esbuild):

```bash
./node_modules/.bin/esbuild .output/audit1/entry.ts --bundle --format=esm --platform=node --outfile=.output/audit1/run.mjs && node .output/audit1/run.mjs
./node_modules/.bin/esbuild .output/audit1/live2.ts --bundle --format=esm --platform=node --outfile=.output/audit1/live2.mjs && node .output/audit1/live2.mjs R0304
./node_modules/.bin/esbuild .output/audit1/verify-fixes.ts --bundle --format=esm --platform=node --outfile=.output/audit1/verify-fixes.mjs && node .output/audit1/verify-fixes.mjs
./node_modules/.bin/esbuild .output/audit1/live3.ts --bundle --format=esm --platform=node --outfile=.output/audit1/live3.mjs && node .output/audit1/live3.mjs R0304
```

Relation to the existing docs: `docs/AUDIT-SUMMARY.md` and
`docs/PERFORMANCE-CODE-AUDIT.md` are the 2026-10-21 snapshots (content script,
injected UI, worker); the `docs/RUN-AUDIT-OPTIMIZATION-*.md` pages are
2026-10-22 throughput proposals (for example "instrument per-SKU stage timings
first" — `stageMs` now exists). This page is neither: it is a defect audit of
the **current** Run audit implementation, with reproductions.

## Verified working

Live `R0304` (48 children, EN + ES + FR):

- Resolver: 3.9 s, 48 children, `store_urls` ES/FR resolved from `hreflang`, 0 anomalies.
- Media endpoint `…/swatches/ajax/media/?product_id=<child>` returns the shape the parser expects; `gallery` includes the main image at `position: "0"`, positions are `0,3,1,2` (unsorted in the payload) and the parser sorts them correctly. All image URLs are on `bestofgifts.eu/.es/.fr`, which are in `host_permissions`.
- Image audit (6 children, no sampling): coverage 6/6, order 0 violations, 18 media files, **24 unique image URLs** (4 per child; it was 72 before the store-view de-duplication fix). Classifier reads the real Roly filenames (`_1_1` front, `_7_1`/`_8_1` side, `_2_1` back) correctly.
- Text audit: 3 pages extracted, 2 findings (`ES/FR name identical to EN`), 0 fetch anomalies, 0 review flags — plausible on this SKU.
- Assembly to the end: variants block + image block + text block → `buildPayloadsFromMarkdown` → 1 payload, 1 dossier (5.3 KB), complete library cells, breadcrumbs `Promotional Textile / T-shirts`.

So the pipeline is structurally sound. The defects below are mostly in the seams between the engines and the batch/UI, plus one systematic duplication problem.

---

## P1 — affects every SKU

### 1. Every image-audit block injects a phantom row → every SKU gets an anomaly

`buildImageAuditBlock` writes its summary as one pipe-separated bullet:

```md
- Checks: duplicates sha256 (3 files, …) | order (6 children, langs EN/ES/FR) | background pos0 (…)
```

`getPipeRows` accepts any `- … | …` line as a data row (`magento-helper-wxt/src/lib/payload.ts:212-236`), so that summary becomes a "finding" whose SKU is `CHECKS: DUPLICATES SHA256 (…)`. The SKU guard then emits an anomaly (`magento-helper-wxt/src/lib/payload.ts:540`).

Live evidence (`live2.mjs`, R0304):

```
anomalies: [
  'row sku CHECKS: DUPLICATES SHA256 (0 FILES, 0 CROSS-COLOR DUP GROUPS, …) does not match file R0304 - skipped',
  'duplicate input row: R0304 — Text — possibly untranslated name'
]
```

Impact: `batchItem.anomalyCount`, `job.totals.anomalies`, the "Blockers" list in the batch report and the per-SKU anomaly panel all report at least one false anomaly per SKU, which hides the real ones.

Fix (smallest): use `;` or `·` instead of `|` in the `- Checks:` line (`magento-helper-wxt/src/lib/imageAudit.ts:659`), and/or skip lines matching `^-\s+Checks:` in `getPipeRows`.

### 2. Duplicate check and image downloads are multiplied by the number of store views

File names are `"<child>_pos<N>_<base><ext>"` — they contain no language, but `collectImageAuditData` keys everything by **URL**, and the same photo is served from three hosts (`bestofgifts.eu`, `.es`, `.fr`) with an identical path.

- `urlFiles` / `pos0Urls` are keyed by URL (`magento-helper-wxt/src/lib/imageFetch.ts:135-155`), so one physical image becomes three entries.
- `wanted` is also URL-keyed (`:158-161`), so the same bytes are downloaded, hashed and tone-sampled up to **three times**.
- `hashes[hash]` therefore receives the same file name 3× (`:202-206`), inflating `dupFiles` (`magento-helper-wxt/src/lib/imageAudit.ts:367`) and `sameColorGroups` (`:391`).

Evidence (harness, one image in EN/ES/FR):

```
duplicates.files for ONE image seen in 3 languages (collector shape): 3   ← should be 1
duplicates.same_color_groups for ONE image (collector shape): 1          ← one image counted as a group
uniqueFileNames: 4, hashEntries: 8                                        ← 2× entries, live R0304 excerpt
```

Live counts for R0304: 6 children → `files` map has 72 URLs but only 24 distinct file names (12 URLs per child instead of 4). Extrapolated to the full SKU: 48 children × 4 images × 3 stores = **576 downloads/hashes instead of 192**, which also eats the `maxImages` cap (default 800 in `imageFetch`, 2000 from the Batch UI) three times faster and silently truncates the duplicate sample (`anomalies: image download capped at …`). For a 120-child SKU the cap is hit even at 2000.

Impact: wrong "N files / N same-colour groups" numbers in the dossier and the dashboard, 3× network and hash cost per SKU, duplicate check silently incomplete on large SKUs.

Fix: de-duplicate by image identity (e.g. `new URL(url).pathname`, which is identical across the three stores) before downloading/hashing, and feed `hashes` one canonical file name per image (`[...new Set(files)]`).

### 3. The coverage gate skips its dossier cross-check for real SKUs

`magento-helper-wxt/src/lib/coverageCheck.ts:187` guards the dossier-child comparison with `resolver.size <= 8`, with a comment about the 8-row cap **per colour group**. The dossier caps rows at 8 per colour group (`MAX_PER_GROUP`), not 8 in total.

So for R0304 (48 children, 8 colours × 6 sizes) the check is skipped entirely and `consistent: true` is reported as long as the dossier has any table — real drift between resolver, media, images and the dossier table goes unnoticed on essentially every configurable SKU.

Fix: compare per colour group (or compare `rows.size` against `min(resolver.size, groups × 8)`), and flag a shortfall only when it cannot be explained by the per-group cap.

---

## P2 — visible or workflow-breaking bugs

### 4. Unchecking ES/FR still reports them as missing

`textAuditForSku` only fetches the requested languages (`magento-helper-wxt/src/lib/textFetch.ts:50-52`), but `auditText` always reports "ES/FR html missing" (`magento-helper-wxt/src/lib/textAudit.ts:1168`, plus `:619` from `getTextChecks`).

Harness, `langs: ['EN']`:

```
review_flags: [
  'ES html missing - partial matrix',
  'FR html missing - partial matrix',
  'ES page not extracted (missing html)',
  'FR page not extracted (missing html)',
  'gender-canonical-miss-en'
]
ok: false
```

The same happens in the Batch: its options carry `langs`, so an EN-only run marks every SKU with two bogus review flags and `ok: false`.

Fix: pass the requested language list into `auditText` (or delete the keys before checking) and only flag languages that were requested.

### 5. Resolver's SKU guard is case-sensitive

`magento-helper-wxt/src/lib/resolver.ts:606-609`:

```ts
if (!enHtml.includes(sku)) throw new Error(`SKU ${sku} not present on … - wrong slug?`);
```

`sku` is upper-cased, the page is not. Harness: a PDP that renders `ttkp230` fails with `SKU TTKP230 not present … - wrong slug?`. A store-view/supplier that lower-cases the SKU (or renders it only inside JSON in a different case) aborts the whole SKU with a misleading message.

Fix: compare case-insensitively (`enHtml.toLowerCase().includes(sku.toLowerCase())`), or check the parsed config/index instead.

### 6. The per-SKU "stage" never advances

`pump()` sets `item.stage = 'resolve'` (`batchRunner.ts:378`) and then jumps straight to `'done'`/`'failed'` (`:461`, `:477`). The other stages in `STAGE_LABEL` (`variants`, `images`, `text`, `payload`, `Batch.tsx:56-65`) are never written, so the progress table and the "Now running: … stage …" line show `resolve` for the whole SKU (up to the 180 s timeout), even though the image stage dominates the runtime (live: 3.1 s images vs 3.9 s resolve).

Fix: set `item.stage` (and save) at each stage boundary, or expose the stage timings already collected in `result.stageMs`.

### 7. Pause/Cancel leave an orphan `running` item, and a timed-out SKU can still write its dossier

- `pauseBatch`/`cancelBatch` only flip `job.status`; the in-flight SKU is not aborted.
- When it finishes, `if (!current || current.status !== 'running') return;` (`batchRunner.ts:457`) exits **without** marking the item, so the table keeps a SKU in `running` state forever and `recountTotals` never counts it as ok/failed.
- `withTimeout` rejects the race but cannot stop `runSku`, which keeps going and calls `setSkuDossier` (`batchRunner.ts:236`) — a SKU recorded as `failed` can still have a dossier (and the coverage/status gates then treat it as collected).

Fix: mark the item `cancelled`/`paused` before returning, and move `setSkuDossier` out of `runSku` into the success path in `pump()`.

### 8. Mojibake in the Run audit UI and in batch status messages

The file bytes really contain `â€”` (U+00E2 U+20AC U+201D), `Â·`, `â€¦`, `â†’` — verified with a byte/codepoint dump, not a display artifact. 26 lines in `magento-helper-wxt/src/dashboard/sections/Batch.tsx` (e.g. `:828`, `:836`, `:849`, `:873`, `:1064`, `:1099`, `:1103`, `:1271`, `:1520`, `:1526`, `:1537`, `:1677`, `:1687`) and the two `job.message` strings in `batchRunner.ts:360,379`:

```
done â€” 12 payload(s)
resolving 3/40 â€” R0304
```

They render literally as `done â€” 12 payload(s)`, `3/40 SKUs Â· 25%`, `Save imagesâ€¦`, `This browser has no File System Access API â€” use Chrome or Edge.` All other hits (`adminNavToggle.ts`, `ui/index.ts`, `batch.ts`, `imageFetch.ts`, headers) are comments only.

Fix: re-encode those strings (`—`, `·`, `…`, `→`).

### 9. A new batch keeps the previous run's dossiers

`resetBatchResults()` (`magento-helper-wxt/src/lib/batch.ts:245-256`) clears payloads, library, anomalies, model verdicts, evidence, pushed, manifest and availability — but **not** `BATCH_DOSSIER_KEY`, although `clearBatch()` does. After Start, a SKU that fails (or is no longer in the list) still shows its old dossier, and `checkCoverage`/`buildStatuses` treat it as built.

### 10. `npm run typecheck` fails

```
src/lib/check-live-names.ts(57,63): TS7053 …
src/lib/check-live-names.ts(81,13): TS2532 …
(+3 more in the same file)
```

`src/lib/check-live-names.ts` is a `console.log` scratch script sitting in `src/lib`; nothing imports it. It breaks `tsc --noEmit` (and would spam if ever imported). Move it to `scripts/` or delete it.

---

## P3 — parity / robustness notes

### 11. The collector hashes and tone-samples the cache rendition, not the original

`fetchOriginalBytes` exists specifically because "the audit pipeline always prefers the original and falls back to the cache URL" (`imageFetch.ts:255-284`), and the save-images/diagnose paths use it — but `collectImageAuditData` calls plain `fetchBytes(url)` (`:174`). Hashes are therefore taken over the square-cropped `/cache/<32hex>/` rendition, and the pos0 border tone is sampled from that crop, so a grey-background verdict can differ from the PowerShell pipeline the port is supposed to match.

### 12. Every text payload carries three review flags by construction

`readMarkerRows` gives text rows `fixLocation: null` (the marker layout has no Fix column), so every text finding gets `fix-location-missing` (`payload.ts:570`); `KNOWN_TYPES` (`payload.ts:111-131`) contains none of the strings `textAudit` emits (`possibly untranslated name`, `… description`, `… gender`, `Composition keeps …`, `brackets in dimensions value`, …), so every text row also gets `unknown-error-type`; and `flag-suggestion-confirm` is always added. Live R0304: 1 text payload → `['unknown-error-type', 'fix-location-missing', 'flag-suggestion-confirm']`. Probably intended as "auditor decides", but worth confirming the known-type list is meant to be that stale.

### 13. Text-audit review flags are dropped by the batch

`runSku` counts review flags only from payloads (`batchRunner.ts:237`) and puts only `text.anomalies` into the anomaly list. Signals like `… contains EN stopwords - eyeball before flagging`, `gender-crosslang-disagree` or `composition-fix-human` exist only in the single-SKU Text audit tab and never reach the batch item, the dossier or the report.

### 14. A media entry without `position` collapses to position 0

`parseIntStrict` maps a missing/invalid `position` to `0` (`imageAudit.ts:698`), so every positionless gallery entry sorts as the main image; the order check and `_posN_` file names become meaningless without an anomaly. Live JSON always carries positions, but this is the failure mode if the supplier schema changes (the harness shows two entries both at `pos 0`).

### 15. Smaller inconsistencies

- `buildImageAuditBlock` always says `Source: live storefront media (EN/ES/FR)` (`imageAudit.ts:664`) even when only EN was selected.
- `auditImages` always returns `ok: true` (`imageAudit.ts:590`), so `AuditImagesResponse.ok` carries no signal (`background.ts:249` → `ok: run.audit.ok`).
- `runSku` forwards `images.collection.anomalies` but not `images.audit.anomalies`, so skip notices such as `hashes not collected - duplicate check skipped` or `background check skipped` never reach the per-SKU anomaly list.
- `startBatch` has no server-side guard for an already `running` job (`batchRunner.ts:492`); only the button is disabled. Starting via the message while one runs replaces the job, and the in-flight SKU is then recorded against the **new** job's `items[cursor]`, skipping that SKU.
- `normalizeOptions` drops `maxImages` when the caller omits it, so the documented default (2000 in `DEFAULT_BATCH_OPTIONS`) is not applied — the collector's own 800 wins (`batchRunner.ts:63-84` vs `batch.ts:66`).
- The dossier's "Text facts" section prints the finding notes verbatim, so R0304 reads `Name: ES name: ES name identical to EN: "SLAM"` — accurate data, misleading label (`dossierContent.ts:96-114`).
- Storage growth: `batchEvidence` keeps the raw media JSON for every child × language and is rewritten as one map per SKU (`batch.ts:setSkuEvidence`), ≈0.35 MB for R0304 (48 children × 3 languages). A 25-SKU batch therefore rewrites a ~9 MB value on every SKU. Not fatal with `unlimitedStorage`, but it will slow the run and make the "save images" gate sluggish.

---

## Residual risks not testable here

- **MV3 worker lifetime.** A SKU can take 3-10 s for small matrices and minutes for 48-120 children with `hashImages`. The pump is kept alive by continuous fetches (`chrome.alarms` 30 s also re-enters it), but there is no resumable mid-SKU state: a suspended worker restarts that SKU from scratch. Pause/cancel responsiveness is bounded by the current SKU too.
- **Pixel sampling** (`createImageBitmap` + `OffscreenCanvas`) was not exercised (no DOM in Node). The pure `backgroundToneFromPixels` matches its spec on white/grey/transparent fixtures.
- **Model scoring / bridge** was out of scope (only the call site in `pump()` was read).

## Fix log (2026-10-26)

Implemented in this order; `npm run typecheck` and `npm run build` are green, and
`.output/audit1/verify-fixes.mjs` (27 checks, rebuilt from
`.output/audit1/verify-fixes.ts`) passes 27/27 against the real modules.

| # | Finding | Change | Proof |
|---|---|---|---|
| 1 | Phantom `Checks:` row in every image block | `buildImageAuditBlock` now separates the summary with `;` (coverage segment included); the block has no summary pipes at all | `readMarkerRows(block)` returns 0 rows for a clean audit; live `R0304` payload build has no `row sku …` anomaly |
| 2 | Duplicates and downloads multiplied by store views | `imageFetch` keys images by **pathname** (`imageIdentity`), so one photo = one download/hash/tone and one evidence URL (EN first); `hashes` buckets are de-duplicated by name, and `auditImages` also de-duplicates a bucket defensively | Live R0304: 24 unique URLs for 6 children (was 72); probe `hashEntries 8 / uniqueFileNames 8` (was 8/4); harness: 3 identical names → `files: 1`, `same_color_groups: 0` |
| 3 | Coverage gate skipped the dossier check for real SKUs | `expectedDossierRows()` derives the expected row count from the colour groups (`childColor`) and the real 8-per-group cap; rows for unknown children are always a gap, small SKUs are checked child by child, large SKUs against the capped total | Harness: 10 children + 8 rows → no gap; 10 children + 7 rows → gap; 5 children + 4 rows → gap naming the child |
| 4 | ES/FR opt-out produced “missing page” flags | `auditText`/`getTextChecks` accept the requested language list; `textFetch` passes it through | Harness: EN-only run → `review_flags: []`, `ok: true`; EN+ES never flags FR; no list still flags both (parity) |
| 5 | Case-sensitive SKU guard in the resolver | Comparison is now case-insensitive | Harness: PDP that renders `ttkp230` resolves (was “wrong slug?”) |
| 6 | Per-SKU stage never advanced | `runSku` reports `resolve → variants → images → payload` through an `onStage` hook that `pump()` persists (job-id checked, best effort) | Typecheck/build; stage values are persisted on every boundary |
| 7 | Pause/Cancel left an orphan `running` item and timed-out SKUs wrote dossiers | `pauseBatch`/`cancelBatch` abort the in-flight run (`activeRun`); the item becomes `pending` on pause and `cancelled` on cancel; `setSkuDossier` moved into the success path in `pump()` | `startBatch` guard check passes; item states type-checked; abort path covered by the new `cancelled` status/stage |
| 8 | Mojibake in the Run audit UI and status messages | Replaced every `â€”`/`Â·`/`â€¦`/`â†’`/`Â±`/`Â§` sequence in `src/` with the real characters (26 UI lines, both `job.message` strings, and the comments that carried it) | `grep -rn "Ã\|â€\|Â" src` returns nothing |
| 9 | A new batch kept the previous dossiers | `resetBatchResults()` clears `batchDossier` like `clearBatch()` does | Harness: dossier + pushed maps are gone after a reset |
| 10 | `npm run typecheck` failed | Deleted `src/lib/check-live-names.ts` (unused scratch script; the same check exists as `scripts/check-live-names.mjs`) | `npx tsc --noEmit` exits 0 |
| 11 | Audit hashed/sampled the cache crop, not the original | The collector now uses `fetchOriginalBytes` (original first, cache as fallback), matching the pipeline and the evidence export | Live probe downloads originals; `/cache/<hash>/` removal is exercised by the existing helper |
| 12 | Every text payload carried `unknown-error-type` + `fix-location-missing` | Text rows are exempt from the known-type check (they fold onto “Translation error” at push time) and take a real Fix Location (`Configurable` / `Simple`) from the audited product | Live R0304 text payload: `fix: 'Configurable'`, flags `['flag-suggestion-confirm']` only |
| 13 | Text-audit review flags dropped by the batch | `runSku` counts them and lists them as `text review flag: …` (fetch anomalies are not duplicated) | Code path type-checked; count feeds `reviewFlagCount`/totals |
| 14 | Positionless gallery entries collapsed to position 0 | Missing/invalid positions fall back to gallery order and raise an anomaly | Harness: two positionless entries → `[1, 2]` + “without position” anomaly |
| 15 | Smaller inconsistencies | `Source:` line reports the real languages; image `ok` means “no findings and no skipped check”; per-SKU anomalies now include audit-level skip notices (but not checks the operator switched off); `startBatch` refuses to replace a running job; `normalizeOptions` applies the documented `maxImages` default (2000); dossier “Text facts” labels are `Name finding:` etc.; evidence `files` holds one URL per image, which also removes duplicate downloads in Save images | Harness + live probe |

Not changed on purpose: `batchEvidence` still stores the raw media JSON per
SKU. It is what Save images and model scoring read back, and the growth is
bounded by the per-SKU child cap; splitting the storage key is a separate
refactor, not a defect.
