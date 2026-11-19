# 01 — Optimizing a Single-SKU Audit

**Parent:** [Run Audit Optimization Plan](./RUN-AUDIT-OPTIMIZATION-PLAN.md)
**Status:** Research and proposal only; no implementation or timing benchmark
has been completed.
**Research date:** 2026-10-22

## Objective

Reduce the time an operator waits for one SKU while keeping the same resolver,
image, text, payload, anomaly, and evidence results. The first opportunities
are duplicate network work and avoidable sequential waits—not reducing audit
coverage.

## Existing path

The current per-SKU flow is in `src/lib/batchRunner.ts`:

```text
resolve SKU + fetch EN PDP HTML
        ↓
collect child × language media and run image checks
        ↓
resolve the SKU again and fetch PDP HTML for text audit
        ↓
fetch selected ES/FR PDPs
        ↓
build payloads, dossier, library cells; persist results
        ↓
optional model scoring (separate vision request)
```

Resolver/network behavior is implemented in `src/lib/resolver.ts` and
`src/lib/textFetch.ts`; image collection and checks are in
`src/lib/imageFetch.ts` and `src/lib/imageAudit.ts`.

## Recommendation 1: reuse resolver and English HTML

The first resolver call returns both `resolver` and `enHtml`. The text audit
currently calls `resolveSkuWithHtml` again, even though the batch runner
already has that product URL and HTML. The explicit product URL prevents a
second catalog-search lookup, but the second English PDP request and repeated
parsing/resolution work remain.

### Proposed interface change

Allow the text-audit entry point to accept already resolved data, for example:

```ts
textAuditForSku(sku, {
  resolved: { resolver, enHtml },
  langs: options.langs,
});
```

The exact type and API shape should follow local code conventions. The existing
standalone text-audit UI must continue to work without a supplied resolver; it
can retain the current resolve-and-fetch behavior as its fallback.

### Correctness conditions

- Confirm the supplied resolver SKU matches the requested SKU after the
  project's standard normalization.
- Use the exact `enHtml` associated with that resolver, not an unrelated cached
  page.
- Continue extracting the same EN fields and hreflang/store URLs.
- Continue reporting missing alternate URLs and unreadable language pages as
  anomalies/review flags.
- Ensure a supplied product URL does not accidentally bypass the storefront
  validation rules that the standalone path currently applies.

### Why this is the best first change

It removes repeated work without changing the rules or which images/pages are
audited. It is likely useful for every SKU, including one-SKU runs, and is much
safer to verify than changing concurrency or sampling.

## Recommendation 2: overlap image and text audit

After the resolver is available, image collection and text comparison are
largely independent. They can be started together and awaited together. The
text audit's ES/FR fetches are also independent once the resolver's alternates
are known.

### Suggested rollout

1. First make the resolver result reusable and verify output parity with
   sequential execution.
2. Add an explicit limited worker for ES/FR pages, preserving requested
   language selection and deterministic result assembly.
3. Start image and text work concurrently after resolution.
4. Compare errors and coverage on representative SKUs before making the new
   path the default.

Do not start with a generic `Promise.all` over all work. Image collection
already has in-flight limits (currently six media-map requests and four image
downloads per SKU). When text requests are added, the total load rises.

### Error-handling requirement

If the existing pipeline treats an image-fetch issue as a collection anomaly
but continues to build the audit, preserve that behavior. If text fetches fail,
preserve the current language-specific anomaly/review flag behavior. Parallel
execution must not turn one stage's recoverable error into a blanket SKU
failure, nor may it silently hide rejected promises.

## Recommendation 3: make cancellation effective

The batch-level timeout is currently a `Promise.race` around SKU work. A race
rejects the wrapper when the deadline expires, but does not inherently stop
fetches already started by the losing promise.

Before scaling concurrency, pass an `AbortSignal` through resolver, media,
image, and text fetch helpers. On timeout, cancel the active requests and stop
starting new requests for that SKU. Where a browser API does not support
cancellation for a given operation, document the limitation and ensure late
results cannot overwrite a newer/cancelled job's state.

This improves more than speed: without real cancellation, timed-out or cancelled
work may consume bandwidth and compete with subsequent work.

## Options that trade audit coverage for speed

The batch options in `src/lib/batch.ts` make several costs visible:

- **Languages:** fewer languages mean fewer media maps and fewer PDP
  comparisons. Only choose fewer languages if the omitted-language checks are
  not required for this run.
- **Child cap:** fewer children reduce media-map requests and coverage.
- **Image hashing:** disabled by default; enabling it fetches unique images to
  compare hashes.
- **Background sampling:** enabled by default; it fetches position-zero images
  for the background check.
- **Max image downloads:** caps the number of unique images downloaded. A cap
  hit should remain an explicit anomaly.
- **Model scoring:** optional and separate from mechanical image checks. It can
  add significant model latency and should remain an explicit user choice.

If defaults or controls change, UI copy and reports must state which checks are
being skipped. A shorter run is not an equivalent audit if it did less work.

## Benchmark plan

### Test set

Use at least:

- A simple product with few images.
- A configurable product with a typical number of children.
- A high-child-count product that approaches current limits.
- A product with missing/unavailable language alternatives or one or more
  failed media/image requests.

### Compare

For each same SKU and identical options, record:

| Metric | Baseline | Candidate |
|---|---:|---:|
| Total per-SKU elapsed time |  |  |
| Resolver time and PDP fetch count |  |  |
| Image collection/audit time |  |  |
| Text audit time and language request count |  |  |
| Unique images downloaded and total bytes |  |  |
| Errors/anomalies by stage |  |  |
| Payloads and review flags |  |  |
| Resolver children covered by media/files |  |  |

Run repeated trials and compare median as well as slow-run time. Check whether
the browser/network cache changes repeat-run results.

## Acceptance criteria

- Existing standalone text-audit behavior remains available.
- The batch path does not fetch the same EN product page a second time.
- Payloads, audit flags, anomalies, and selected languages match the baseline
  for the same input/options.
- Parallelism has a documented limit and produces stable result ordering.
- Timeout/pause/cancel cannot leave uncontrolled requests or let stale results
  change a later job.
- No speed claim is published until the same-input benchmark is recorded.

## Relevant code and sources

- `src/lib/batchRunner.ts`
- `src/lib/resolver.ts`
- `src/lib/textFetch.ts`
- `src/lib/imageFetch.ts`
- `src/lib/imageAudit.ts`
- [Chrome cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Chrome service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
