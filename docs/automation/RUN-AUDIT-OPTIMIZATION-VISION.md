# 03 — AI Vision Efficiency and Shared Analysis

**Parent:** [Run Audit Optimization Plan](./RUN-AUDIT-OPTIMIZATION-PLAN.md)
**Status:** Research and proposal only; no model-cost or accuracy benchmark has
been completed.
**Research date:** 2026-10-22

## Objective

Reduce avoidable vision requests, image preparation, and image-token usage while
preserving the checks operators rely on. The intended optimization is not
"send fewer images no matter what"; it is "send each necessary image as few
times as possible, reuse valid results, and make sampling/coverage explicit."

## The two current vision workflows

### 1. Batch audit model scoring (optional)

`src/lib/modelSort.ts` selects a representative set of up to eight images by
child and position, deduplicated by URL. It downloads the images, downsizes
them to a maximum side of 768 pixels when supported, encodes them as data URLs,
and sends them with a structured schema. The result describes view, background,
and concerns such as text overlays, printing sheets, or model-worn images.

The batch runner persists the mechanical audit before invoking optional model
scoring. Model failure is recorded as an anomaly rather than erasing a completed
mechanical audit.

### 2. Auto pipeline model-shot mover

`src/lib/mirrorTidy.ts` operates on images already saved into the local mirror.
It prepares images and sends groups of four to the model, asking whether a
human is wearing, holding, or demonstrating the product. The result helps the
operator or pipeline move selected files to `configure/`.

This path can inspect more images than the audit sample. It has a different
input source, question, output schema, and side effect. In the current Auto
pipeline it is a distinct stage, not automatically replaced by audit scoring.

## Main opportunity: share results, not just prompts

When both paths inspect the same image, the image may be fetched/prepared and
sent to the model twice to answer different questions. A combined per-image
analysis can potentially return:

- Image view: front, back, side, detail, box, bag, ambience, model, printing,
  other.
- Background: white, transparent, colored, unknown.
- Explicit concerns: text overlay, watermark, wrong product, instruction or
  size sheet, other review-worthy issue.
- Human/model presence: visible person wearing, holding, or demonstrating the
  product; false when not present; uncertain/review when unclear.

Each downstream feature should consume only the fields it needs. The image
mover must continue to apply its own existing cautious rules for deciding
whether a file is moved. An audit concern is not automatically authorization to
move a file.

### Key qualification

The audit scorer's representative sample is capped; the mover may need to
inspect images outside that sample. A combined schema alone does **not**
eliminate the second stage for uninspected images. The safe design is:

1. Run audit analysis on its current required representative images.
2. Store per-image results with stable identity and provenance.
3. When the mover reaches an image, reuse a compatible result if one exists.
4. Analyze only images with no reusable result.
5. Report how many images were reused, newly analyzed, skipped, or uncertain.

This reduces overlap without silently shrinking the mover's coverage.

## Result identity and reuse policy

URL-only caching is fragile: a URL can serve changed bytes. Prefer a content
hash of the exact bytes that were analyzed. A reusable record should include at
least:

- Content hash (and optionally source URL for traceability).
- SKU, child, carousel position, and file identity where applicable.
- Model provider and model ID.
- Prompt/schema version and image-preprocessing version.
- Analysis timestamp and result status, including uncertainty/failure.
- Whether the image was downscaled and the relevant preprocessing parameters.

Only reuse when the content identity and analysis contract are compatible. If
the schema or prompt changes, old results may not contain the fields or
definitions needed by the new consumer. Version them and re-analyze as needed.

Do not treat failed, partial, or uncertain results as positive classifications.
Cache policy should define expiry/revalidation if images may change frequently.

## Reduce model input cost responsibly

### A. Avoid duplicate image submissions

Deduplicate by content hash where feasible, not just URL. Different URLs can
represent identical bytes; the same URL can also change content. Reuse already
available bytes within a run rather than fetching and encoding them again.

### B. Keep image dimensions appropriate to the task

The audit scorer already downsizes to a maximum 768-pixel side and JPEG quality
0.82. Benchmark smaller sizes/quality on the chosen provider and product set
before changing these values. Text in a tiny size chart or instruction sheet
may disappear under aggressive downscaling. A lower-resolution policy must be
validated against these edge cases.

### C. Use task-aware image selection

The current audit sample aims to cover child products and carousel positions.
Keep the selection deterministic and make any limit visible. Potential
improvements include:

- Prioritize one representative main image per child before secondary views.
- Avoid sending duplicate content across children.
- Use non-model signals to rank likely review images, but do not drop the
  remaining images from a workflow that promises full mover coverage.
- If sampling is used for a faster mode, explicitly label it as sampled and
  surface uninspected counts.

### D. Keep prompt/output concise without removing decision criteria

The model receives the same instructions for each request and a structured
schema. Shortening repetitive wording and limiting output lengths can reduce
text overhead. Do not remove important definitions (for example, mannequin
versus human model) just to save a small prompt amount.

Schema validation, per-image IDs, and concise constrained outputs help avoid
verbose or unusable responses. Keep IDs stable within each request and map
responses to files locally; the model should not need to repeat product URLs.

### E. Group images carefully

Batching images into one request can reduce request/session overhead, but does
not guarantee fewer image tokens. Too many images in one prompt can increase
latency, context pressure, response omissions, or incorrect ID mapping. The
current group sizes (up to eight for audit scoring and four for moving) are
starting behavior, not evidence of an optimal size.

Benchmark sizes against the actual configured provider. The bridge may expose
provider/model/cost/latency, but any cost field should be checked for what it
includes. Model providers may count image inputs differently; do not infer
image-token savings from JPEG byte size alone.

## Combine the stages: recommended architecture

### Phase 1 — measure overlap

For representative runs, record:

- Number of audit-scored images.
- Number of mirror images sent for model-shot moving.
- Number of content-hash matches across the two sets.
- Image downloads, preparation time, model calls, image count per call.
- Per-call latency, model-reported cost when available, and failures.
- Human-review outcomes and mover decisions.

Do not store full image data URLs as durable cache records. Store compact
versioned results and hashes; keep data URL lifetime limited to a request.

### Phase 2 — define one versioned result contract

Design a combined schema that includes both audit and mover fields. Define
allowed values, uncertainty representation, ID mapping, schema version, and
failure semantics before wiring consumers. Validate model responses locally
with a schema, as current code does.

### Phase 3 — reuse only exact compatible analyses

Have the mover consult the analysis store by content hash and schema/model
version. Reuse a valid result; otherwise submit the image. Record reuse and
new-analysis counts. Keep all existing audit and mover output rules until
parity is demonstrated.

### Phase 4 — tune cost/latency/quality

Test a matrix of:

- Maximum image side and compression quality.
- Per-call image count.
- Representative-sample size.
- Single combined task versus separate task prompts.
- Sequential versus a small number of concurrent model calls.

Use the same labeled images and model/provider versions for comparisons.

## Accuracy and safety evaluation

Build a fixed, human-reviewed test set covering:

- A real human wearing/holding/demonstrating the product.
- Mannequins, ghost mannequins, hangers, and flat lays.
- Packaging, instruction/printing sheets, size charts, and logos/text overlays.
- White, transparent, colored, and ambiguous backgrounds.
- Detail and non-main carousel images.
- Duplicate bytes at different URLs and changed bytes at the same URL.
- Unreadable images and malformed/partial model responses.

For each candidate design, compare:

- Precision and recall for model-shot detection (especially false moves).
- Audit flag agreement by category.
- Uncertain/review rate.
- Images analyzed, reused, skipped, or failed.
- Calls, time, provider-reported cost, and estimated image-token usage where
  the provider reports it.
- Whether each file decision still maps to the correct SKU/child/position.

Do not optimize for token count alone. A cheap run that misses a model-worn
image or moves a mannequin image incorrectly is not a successful optimization.

## Operational controls

- Keep batch model scoring opt-in and preserve the mechanical audit if it fails.
- Make the Auto model-move stage's availability/behavior clear to the operator.
- Preserve quota latch behavior so exhausted model quota does not cause repeated
  expensive retries.
- Bound image downloads, encoded bytes, per-call image count, and concurrent
  model requests.
- Stop scheduling new model work on pause/cancel and ignore late results from a
  cancelled job.
- Keep model provider/model ID with cached results; changing model configuration
  should not silently reuse incompatible results.
- Report quota, provider, validation, and image-download failures distinctly.

## Acceptance criteria

- Same input produces stable per-image identities and deterministic mapping.
- Existing mechanical audit remains complete when optional model scoring fails.
- A combined result can drive both audit findings and mover decisions without
  changing their established semantics unintentionally.
- The mover analyzes any image without a compatible cached result; no image is
  skipped solely because it was outside the audit sample.
- Reuse is invalidated when content, model/schema, or preprocessing contract
  does not match.
- Benchmarks show lower duplicate calls or measured cost with no unacceptable
  regression in audit recall, mover precision, or review coverage.
- UI/reporting discloses sampled, skipped, uncertain, and failed image counts.

## Relevant code and sources

- `src/lib/modelSort.ts`
- `src/lib/modelFindings.ts`
- `src/lib/mirrorTidy.ts`
- `src/lib/modelBridge.ts`
- `src/lib/batchRunner.ts`
- `src/lib/imageFetch.ts`
