# Run Audit Optimization Plan

**Status:** Research and proposal only — no implementation or performance
benchmark has been completed for these recommendations.
**Research date:** 2026-10-22
**Scope:** One-SKU audit, many-SKU batches and Auto pipeline, and AI vision
efficiency.

## Purpose

This document is the parent page for a focused optimization plan for the
extension's **Run audit** workflow. It separates three connected problems:

1. Making an individual SKU audit finish sooner without reducing its checks.
2. Improving throughput and reliability for large batches and the Auto
   pipeline.
3. Reducing duplicate vision work and controlling image/token cost while
   retaining the intended review coverage.

The goal is not to make every stage concurrent or to minimize time at any cost.
The goal is to reduce avoidable work, make measured improvements, and retain
audit correctness, coverage, failure visibility, pause/resume behavior, and
safe Notion writes.

## Child pages

- [01 — Optimizing a single-SKU audit](./RUN-AUDIT-OPTIMIZATION-SINGLE-SKU.md)
- [02 — Batch throughput and Auto pipeline](./RUN-AUDIT-OPTIMIZATION-BATCH-AUTO.md)
- [03 — AI vision efficiency and shared analysis](./RUN-AUDIT-OPTIMIZATION-VISION.md)

## Current implementation at a glance

The background batch runner currently processes one SKU at a time. For each
SKU it:

1. Resolves the storefront product and retains the English product-page HTML.
2. Collects media metadata and runs image checks.
3. Runs the text audit.
4. Builds and persists dossier, payload, evidence, library, and anomaly data.
5. Optionally requests model scoring and appends model-generated review
   findings.

The Auto pipeline then operates on successful batch SKUs: save evidence images
to the selected local folder, reorder images, run model-shot detection and move
selected files, verify manifests, check coverage, build status, and optionally
push to Notion after confirmation.

Important distinctions:

- Dashboard progress is polled about every two seconds. That controls the
  *display cadence*, not the batch runner's per-SKU wait.
- The audit's optional model scoring and Auto pipeline's model-shot mover are
  separate vision jobs with different inputs and decisions.
- The save → reorder → verify ordering is meaningful. File verification must
  validate the result that was actually written.
- Notion calls are queued and deduplicated. Their current conservative
  sequential behavior protects data and API limits; simply parallelizing them
  is not a safe speed improvement.

## Priority order

| Priority | Recommendation | Expected benefit | Main risk / guard |
|---|---|---|---|
| 1 | Reuse the first resolver result and English HTML in the text audit. | Avoid redundant storefront fetches for every SKU. | Preserve exact resolver and language behavior. |
| 2 | Measure stage timings and request/image counts. | Identifies the actual bottleneck before larger work. | Keep telemetry useful without logging sensitive data. |
| 3 | Overlap independent image and text audit work with bounded concurrency. | Shortens an individual SKU's network wait. | Use cancellation, global limits, and explicit error collection. |
| 4 | Add low, configurable global SKU concurrency after durability work. | Improves throughput for many SKUs. | Pause, cancel, recovery, storage races, and rate pressure. |
| 5 | Reuse valid vision results and combine per-image questions where useful. | Avoids repeated model calls for overlapping images. | Matching cache identity and preserve full image-mover coverage. |
| 6 | Optimize Auto file I/O only where measurements show a bottleneck. | May reduce lengthy save and verification passes. | Do not skip writes, hashes, manifests, or verification silently. |
| 7 | Keep Notion throttled; reduce unnecessary requests before raising its rate. | May reduce push time without compromising safety. | Respect deduplication, retries, `Retry-After`, and user confirmation. |

## Measurement before implementation

Establish an unchanged baseline with representative inputs and record:

- Audit wall time per SKU and per stage: resolve, media/image audit, text
  audit, persistence, model scoring.
- Auto pipeline wall time per stage: save, reorder, model move, manifest
  verification, coverage/status, Notion.
- SKU count, child count, languages, unique media URLs, image bytes downloaded,
  files written, files hashed, model calls, images sent per call, and failures
  or retries.
- Median and slow-run (for example, 90th percentile) duration across repeated
  runs, not a single best case.
- Output parity: payloads, anomalies, flags, image coverage, manifest verdicts,
  and model-move selections.

Record whether the run is audit-only or Auto pipeline. Separate first-run
network/cache effects from repeat-run effects. Never claim a speedup unless the
same input and options are compared and the required outputs still match.

## Non-negotiable invariants

- Do not lose a completed audit because an optional model step fails.
- Keep every failure or skipped check visible as a status, anomaly, or report.
- Do not silently reduce languages, children, downloaded images, or checks.
- A limit or sampling policy must be explicit, visible, and reflected in
  coverage reporting.
- Pause/cancel must stop or safely drain work; timeouts must not leave
  uncontrolled requests continuing in the background.
- Recovery must remain correct if the MV3 service worker is suspended or
  restarted.
- Do not allow concurrent read-modify-write storage updates to overwrite
  another SKU's results.
- Do not weaken Notion's deduplication, rate-limit handling, explicit
  confirmation, or create-only restrictions.

## Research sources

- [Chrome extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome extension storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome extension cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Notion API request limits and retry guidance](https://developers.notion.com/reference/request-limits)

These are design inputs, not evidence of a measured extension performance
result. Implementation should begin with the low-risk reuse and instrumentation
steps, followed by a small benchmarked concurrency experiment.
