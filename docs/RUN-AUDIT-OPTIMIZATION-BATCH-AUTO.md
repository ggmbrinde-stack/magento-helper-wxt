# 02 — Batch Throughput and Auto Pipeline

**Parent:** [Run Audit Optimization Plan](./RUN-AUDIT-OPTIMIZATION-PLAN.md)
**Status:** Research and proposal only; no implementation or throughput
benchmark has been completed.
**Research date:** 2026-10-22

## Objective

Improve total completion time for many SKUs and the post-audit Auto pipeline,
without losing durable progress, generating incomplete manifests, corrupting
per-SKU results, overwhelming external services, or weakening Notion safety.

This page treats **audit batch execution** and **Auto pipeline** separately.
They have different bottlenecks and correctness constraints.

## Current batch execution

`src/lib/batchRunner.ts` uses a single pump and serial cursor. It processes one
SKU, persists results, updates the cursor/totals, then starts the next SKU. It
sets an alarm and re-reads stored job state to support recovery if the MV3
service worker is stopped.

The dashboard polls `BATCH_STATE` every two seconds during the Auto flow. This
explains coarse progress updates; it is not a deliberate two-second delay
between SKU executions.

## Batch recommendation 1: instrument stage timings first

Today each item records a total elapsed time. That is insufficient to establish
whether a large run is dominated by resolver latency, media requests, image
downloads, text pages, model scoring, or storage.

Capture lightweight per-SKU stage durations and aggregate counts:

- Resolve/PDP.
- Media-map fetches and parse.
- Image download/hash/background processing.
- Text fetch and audit.
- Model inference and image preparation.
- Result persistence.
- Retry, timeout, failure, and coverage/cap counts.

Persist compact numeric summaries; avoid storing raw HTML, credentials, or
unnecessary model input in telemetry. Keep user-facing anomalies actionable.

## Batch recommendation 2: global bounded concurrency

After the single-SKU pipeline is safe and measured, test a small scheduler that
runs a limited number of SKUs in flight. Two simultaneous SKUs is a reasonable
first experiment, not an established optimum. Compare it with three only if the
first remains reliable.

### Why global limits matter

`imageFetch.ts` already has separate per-SKU pools: up to six media requests
and four image downloads per SKU. Running several SKUs at once multiplies those
requests. A per-SKU limit alone is not a global safety limit.

Use explicit shared budgets for:

- Storefront search/PDP/media requests.
- Image downloads and concurrent byte memory.
- Local vision-bridge calls.
- Filesystem reads/writes/hashes.
- Notion API calls (separate from audit concurrency).

Observe server response errors, retries, latency, memory, and worker recovery.
Reduce concurrency automatically or stop admitting new work when a service
shows throttling or persistent failure.

### Required scheduler semantics

Moving from a single cursor to concurrent tasks affects user-visible control
and crash recovery. Define and test:

- Each SKU has a durable state: pending, in progress, completed, or failed.
- On restart, an in-progress SKU is either safely re-run or resumed from an
  explicit durable checkpoint. Do not advance the cursor before its outputs
  are durably stored.
- Results are keyed by job ID and SKU so stale work cannot overwrite a newer
  run for the same SKU.
- Per-SKU storage updates are serialized or use a design that cannot lose
  another SKU's simultaneous read-modify-write update.
- Pause stops scheduling new SKUs and either drains or cancels current work
  according to a documented policy.
- Cancel aborts active fetches where possible, prevents new work, and prevents
  late completions from marking the cancelled job successful.
- One SKU's failure does not discard other completed SKUs.
- The progress view distinguishes active count, completed count, failed count,
  and queued count.

Chrome extension service workers may be stopped after inactivity or for
long-running work. The runner must remain storage-backed and resumable; do not
make global variables the sole source of job truth.

## Storage and durability

The current batch storage helpers use whole maps keyed by SKU. Several update
helpers perform a read-modify-write for an individual SKU. As the maps grow,
that can cause repeated serialization of increasingly large values. Parallel
updates can also race if two workers load the same old map and each writes its
own update.

Before raising concurrency:

1. Measure bytes used per job and the time spent in each storage helper.
2. Determine whether evidence media, file maps, hashes, dossiers, and payloads
   all need to remain in `chrome.storage.local` at their current granularity.
3. Consider per-SKU keys or IndexedDB for larger structured/blob-like job
   outputs, while retaining the job/status record needed to resume.
4. Introduce migration and cleanup rules before changing key layout.
5. Verify quota behavior and surface storage failures; do not convert them to
   success-shaped empty results.

Chrome's storage documentation notes asynchronous operation cost and a default
10 MB `storage.local` quota unless `unlimitedStorage` is requested. Check the
extension's actual manifest and runtime usage before assuming more capacity.

## Auto pipeline dependency graph

```text
Audit results
  └─ Save images to mirror (network + local writes)
       ├─ Reorder mirror images (read/rename/write)
       ├─ Model-shot detection and moves (local image prep + model bridge)
       └─ Manifest verification (reads + hashes written files)
            └─ Coverage and status reports (local data)
                 └─ Optional, confirmed Notion push
```

The UI currently runs these major stages in sequence. The sequence is
conservative; not every stage can be safely combined.

## Auto pipeline recommendations by stage

### A. Save images

`src/lib/evidenceExport.ts` builds plans, groups file aliases by URL within a
SKU, then fetches and writes each unique URL sequentially. It also hashes bytes
for deduplication/manifest records.

Potential improvements:

- Reuse already downloaded bytes/hashes only when the exact URL/content and
  required output semantics are known.
- Consider a small worker pool for independent URLs, with a byte/memory cap.
- Consider bounded parallelism across SKUs only after storage/destination
  writes are isolated.
- Keep same-SKU directory writes ordered if aliases, deduplication, or manifest
  assembly depends on that order.
- Maintain per-file progress and errors; partial failure must remain explicit.

### B. Reorder

`src/lib/mirrorTidy.ts` processes SKUs and folders sequentially. Reordering
reads a folder's bytes before removing the old names, then writes the
destination names. The "read first" step protects against losing files during
renaming; keep that invariant.

Independent SKU folders could be processed with a small worker pool. Do not
parallelize writes within one rename plan unless collision-safe temporary
names and crash recovery are designed.

### C. Model-shot moving

The model mover prepares images and calls the bridge in groups of four. It
processes groups/folders/SKUs serially, creating a bridge session per SKU. This
can make model inference a dominant Auto stage.

Possible improvements, in increasing risk:

1. Reuse the bridge session across a batch rather than creating/deleting one
   per SKU, if the bridge semantics and failure isolation support it.
2. Avoid re-preparing duplicate content when a trustworthy prepared-image
   result is already available.
3. Measure bridge latency and local image preparation separately.
4. Try limited concurrent model requests only after testing local bridge and
   provider capacity.

The model must still receive enough context for correct per-file IDs, and each
classification must map back to the correct file. Do not skip uncertainty
review signals or move a file based on a missing/invalid model answer.

### D. Manifest verification

`src/lib/mirrorManifest.ts` scans files and hashes their bytes again to compare
the disk state with the saved manifest. This is deliberately a real integrity
check, not a redundant no-op.

Potential improvements:

- Time directory traversal, reads, and hashing separately.
- A bounded worker pool across independent files or SKUs may improve throughput,
  subject to memory and local storage limits.
- Reuse a saved hash only if it is tied to file identity/metadata and the
  verification requirement permits that shortcut. If integrity means
  "re-read current bytes", cached hashes are not equivalent.
- Keep missing/extra/mismatch reports and the same verification standard.

### E. Coverage and status

These steps primarily combine stored maps and report gaps. Existing code
already reads several sources concurrently. Benchmark before optimizing; they
may not be material next to network, model, or image hashing.

### F. Notion push

Do not solve batch latency by blindly parallelizing Notion writes. Listing
Errors rows are deduplicated by SKU + title before creation and remain
create-only. The SKU Library
path performs lookups and may read back changed rows. The shared client uses a
serialized queue with spacing and retries.

Safe areas to measure/improve:

- Count API calls by operation, separating queries from creates and readbacks.
- Avoid repeated local work or duplicate payloads before any request is queued.
- Where API query semantics permit, investigate bulk lookup strategy while
  preserving exact dedup semantics.
- Surface the time spent waiting in the queue and the exact failures.
- Respect current Notion `429`/`529` handling and `Retry-After`.

The public Notion documentation describes per-connection and workspace limits
and specifically recommends queuing requests and respecting retry headers.
Keep user confirmation, Listing Errors create-only behavior, the SKU Library
update whitelist, and the existing database-specific rules intact.

## Benchmark matrix

Run the same sets at concurrency 1, 2, then optionally 3:

| Scenario | Include |
|---|---|
| Small batch | A few simple products. |
| Typical batch | Mixed simple/configurable products and typical image counts. |
| Stress batch | High-child SKUs, many unique images, all requested languages. |
| Auto pipeline | Same completed batch plus save/reorder/verify/model move. |
| Fault/recovery | Slow/failing request, pause, cancel, and worker restart. |

Capture total throughput (SKUs/minute), median and slow-run SKU time, stage
times, request concurrency, failures/retries, completed coverage, storage bytes,
and model cost/latency. Repeat trials. Network caching, storefront load, model
provider variability, and filesystem performance should be recorded as
conditions.

## Acceptance criteria

- No lost or cross-assigned SKU results under parallel execution.
- Restart/pause/cancel behavior is tested at each meaningful stage.
- No manifest says a file was successfully saved when it was not.
- Verification still detects a deliberately introduced mismatch.
- Audit payloads/anomalies and image coverage match the serial baseline.
- Notion duplicates and rate-limit behavior remain correct.
- The measured speedup is material and repeatable; failure rates and
  tail-latency do not regress unacceptably.

## Relevant code and sources

- `src/lib/batchRunner.ts`, `src/lib/batch.ts`
- `src/lib/evidenceExport.ts`, `src/lib/mirrorManifest.ts`
- `src/lib/mirrorTidy.ts`
- `src/lib/coverageCheck.ts`, `src/lib/statusReport.ts`
- `src/lib/notion.ts`, `src/lib/listingWriter.ts`,
  `src/lib/skuLibraryWriter.ts`
- [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome storage API and quotas](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Notion API request limits](https://developers.notion.com/reference/request-limits)
