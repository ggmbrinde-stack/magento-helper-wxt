// Batch audit runner — the per-SKU pipeline plus the pause/resume controls.
//
// Lives in the background service worker. State is kept in
// `chrome.storage.local` (see `batch.ts`) and re-read before every step, so a
// suspended worker loses nothing: the `chrome.alarms` heartbeat and the
// `onStartup` hook both call `maybeResume()`, which simply re-enters `pump()`.
//
// Stages are browser-runnable only: resolve -> variants -> images -> text ->
// payload. Nothing is written to Notion here; that is a separate, confirmed
// push (M3).

import {
  BATCH_ALARM,
  DEFAULT_BATCH_OPTIONS,
  DEFAULT_BATCH_TIMEOUT_MS,
  emptyTotals,
  loadBatchJob,
  makeBatchJob,
  recountTotals,
  resetBatchResults,
  saveBatchJob,
  setSkuAnomalies,
  setSkuEvidence,
  setSkuLibraryCells,
  setSkuModelVerdict,
  setSkuPayloads,
  type BatchItem,
  type BatchJob,
  type BatchOptions,
  type BatchStage,
} from './batch';
import { buildMagentoTable } from '../shared/magento';
import {
  breadcrumbsFromCategories,
  buildPayloadsFromMarkdown,
  extractBreadcrumbs,
  resolveWithCache,
} from '../audit';
import { supplierFor } from '../shared/resolver';
import { buildVariantSummary, renderVariantsBlock } from '../audit';
import { imageAuditForSku } from '../audit';
import { buildChildColorMap, type MediaSource } from '../audit';
import { textAuditForSku } from '../audit';
import { libraryCellsFor, missingLibraryFields } from '../audit';
import { supplierLinkFor } from '../audit';
import { loadAvailability } from '../audit';
import { buildDossierMarkdown } from '../audit';
import { setSkuDossier } from './batch';
import {
  createBridgeSession,
  deleteBridgeSession,
  loadBridgeConfig,
  modelQuotaMessage,
  resetModelQuotaLatch,
} from './modelBridge';
import { scoreSkuImages } from './modelSort';
import { modelVerdictPayloads } from './modelFindings';
import { batchRuntime, requireSettledBatch, withBatchState } from './batchState';
import type { LibraryCells } from '../audit';
import type { ListingErrorPayload } from '../audit';
import type { ModelBridgeConfig } from './modelBridge';

// Model scoring gets its own ceiling so a slow model can never consume the whole
// per-SKU budget: the audit is already persisted before the model is asked.
const MODEL_TIMEOUT_MS = 90000;

function stamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function normalizeOptions(
  options?: Partial<BatchOptions> | null,
): BatchOptions {
  const langs =
    Array.isArray(options?.langs) && options.langs.length > 0
      ? options.langs.map((l) => String(l).trim().toUpperCase()).filter(Boolean)
      : DEFAULT_BATCH_OPTIONS.langs;
  return {
    langs,
    hashImages: options?.hashImages === true,
    background: options?.background !== false,
    maxChildren:
      typeof options?.maxChildren === 'number' ? options.maxChildren : undefined,
    maxImages:
      typeof options?.maxImages === 'number' && options.maxImages > 0
        ? options.maxImages
        : DEFAULT_BATCH_OPTIONS.maxImages,
    timeoutMs:
      typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
        ? options.timeoutMs
        : DEFAULT_BATCH_TIMEOUT_MS,
    modelScoring: options?.modelScoring === true,
    model:
      options?.model &&
      typeof options.model.providerID === 'string' &&
      typeof options.model.modelID === 'string' &&
      options.model.providerID.trim() &&
      options.model.modelID.trim()
        ? {
            providerID: options.model.providerID.trim(),
            modelID: options.model.modelID.trim(),
          }
        : undefined,
  };
}

/** Reject if `run` does not settle within `ms` (a stuck SKU must not stall). */
function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  sku: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

interface SkuRunResult {
  payloads: ListingErrorPayload[];
  anomalies: string[];
  /** Dossier markdown, persisted by the caller so a timeout leaves none. */
  dossierMd: string;
  reviewFlags: number;
  library: LibraryCells;
  /** Everything model scoring needs (kept out of the payload path entirely). */
  media: MediaSource[];
  files: Record<string, string[]>;
  hashes?: Record<string, string[]>;
  childColor: Record<string, string>;
  isSimple: boolean;
  frontendUrl: string;
  /** Resolver child ids, kept for the coverage gate. */
  children: string[];
  /** Compact per-stage durations (ms). */
  stageMs?: {
    resolve: number;
    images: number;
    text: number;
    payload: number;
    total: number;
  };
  colors: string[];
  sizes: string[];
  category: string;
  subcategory: string;
}

/**
 * Run the full browser pipeline for one SKU and assemble the three marker
 * blocks the payload builder reads (variants + image-audit + text-audit).
 */
async function runSku(
  sku: string,
  options: BatchOptions,
  signal: AbortSignal | undefined,
  onStage: (stage: BatchStage) => Promise<void>,
): Promise<SkuRunResult> {
  const t0 = Date.now();
  const tResolveStart = Date.now();
  // F6: one freshness rule. The batch and the Resolve SKU screen read the same
  // per-SKU cache, so a batch cannot audit a different snapshot than the card.
  const resolved = await resolveWithCache(sku, { signal });
  const resolver = resolved.resolver;
  const enHtml = resolved.enHtml;
  const stageResolve = Date.now() - tResolveStart;
  await onStage('variants');

  const magento = buildMagentoTable(resolver);
  const variants = buildVariantSummary(resolver);
  const variantsBlock = renderVariantsBlock(
    variants,
    sku,
    stamp(),
    magento.configurableUrl,
  );

  let stageImages = 0;
  let stageText = 0;
  await onStage('images');
  const [images, text] = await Promise.all([
    (async () => {
      const s = Date.now();
      const r = await imageAuditForSku(resolver, {
        langs: options.langs,
        hashImages: options.hashImages,
        background: options.background,
        maxChildren: options.maxChildren,
        maxImages: options.maxImages,
        signal,
      });
      stageImages = Date.now() - s;
      return r;
    })(),
    (async () => {
      const s = Date.now();
      const r = await textAuditForSku(sku, {
        // A cache hit has no HTML: re-read the PDP for the text matrix.
        url: enHtml ? undefined : resolver.frontend_url || undefined,
        langs: options.langs,
        ...(enHtml ? { resolved: { resolver, enHtml } } : {}),
        signal,
      });
      stageText = Date.now() - s;
      return r;
    })(),
  ]);

  await onStage('payload');
  const content = [variantsBlock, images.mdBlock, text.audit.mdBlock].join(
    '\n\n',
  );

  const tPayloadStart = Date.now();
  const breadcrumbs = enHtml
    ? extractBreadcrumbs(enHtml)
    : resolver.categories?.ok
      ? breadcrumbsFromCategories(resolver.categories)
      : { l1: '', l2: '', l3: '', ok: false, error: 'no EN html (cached resolver)' };

  // textFetch folds fetch-level problems into review_flags; they are already
  // in `text.anomalies`, so only add what it did not report there.
  const textReviewFlags = text.audit.review_flags.filter(
    (flag) => !text.anomalies.includes(flag),
  );
  // audit.anomalies already includes the collection anomalies, plus the checks
  // that were skipped. A check the operator switched off is not an anomaly.
  const imageNotices = images.audit.anomalies.filter((note) => {
    if (!options.hashImages && note.startsWith('hashes not collected')) return false;
    if (!options.background && note.startsWith('image sampling unavailable')) {
      return false;
    }
    return true;
  });
  const anomalies = [
    ...(resolver.anomalies ?? []),
    ...(magento.anomalies ?? []),
    ...(variants.anomalies ?? []),
    ...imageNotices,
    ...text.anomalies,
    ...textReviewFlags.map((flag) => `text review flag: ${flag}`),
  ];

  const build = buildPayloadsFromMarkdown({
    sku,
    content,
    link: resolver.frontend_url,
    supplier: supplierFor(sku),
    breadcrumbs,
    // Text lives on the product being audited; images live on the variants.
    fixLocation: resolver.product_type === 'simple' ? 'Simple' : 'Configurable',
  });

  const stagePayload = Date.now() - tPayloadStart;
  if (!build.ok) {
    throw new Error(build.error ?? 'payload build failed');
  }

  const payloads = build.payloads;
  anomalies.push(...build.anomalies);

  const dossierMd = buildDossierMarkdown({
    sku,
    resolver,
    magento,
    variants,
    imageAudit: images.audit,
    payloads,
    supplier: supplierLinkFor(sku),
    // D4: only the stored verdict - the batch never blocks on a supplier fetch.
    availability: (await loadAvailability())[sku] ?? undefined,
  });
  const reviewFlags =
    payloads.filter((p) => (p.review_flags ?? []).length > 0).length +
    textReviewFlags.length;

  const library = libraryCellsFor(
    resolver,
    magento,
    variants,
    payloads.length,
    new Date(),
    {
      category: payloads[0]?.category ?? breadcrumbs.l1,
      subcategory: payloads[0]?.subcategory ?? breadcrumbs.l2,
      supplier: payloads[0]?.supplier ?? supplierFor(sku),
      supplierLink: supplierLinkFor(sku).official,
      supplierProduct: supplierLinkFor(sku).catalog,
    },
  );

  const missingLibrary = missingLibraryFields(library);
  if (missingLibrary.length > 0) {
    anomalies.push(
      `library row will not be written - missing ${missingLibrary.join(', ')}`,
    );
  }

  return {
    payloads,
    anomalies,
    dossierMd,
    reviewFlags,
    library,
    media: images.collection.media,
    files: images.collection.files,
    hashes: images.collection.hashes,
    childColor: buildChildColorMap(resolver),
    isSimple: variants.isSimple,
    frontendUrl: resolver.frontend_url,
    children: resolver.children,
    colors: variants.colors,
    sizes: variants.sizes,
    category: breadcrumbs.l1,
    subcategory: breadcrumbs.l2,
    stageMs: {
      resolve: stageResolve,
      images: stageImages,
      text: stageText,
      payload: stagePayload,
      total: Date.now() - t0,
    },
  };
}

// The SKU in flight, so pause/cancel can stop its network work immediately.
let activeRun: AbortController | null = null;

// One opencode session per batch job: cheaper than a session per SKU and it
// keeps the model's context warm. Dropped (and deleted) when the job ends.
let bridgeSession: { jobId: string; id: string } | null = null;

async function endBridgeSession(config?: ModelBridgeConfig): Promise<void> {
  const current = bridgeSession;
  bridgeSession = null;
  if (current) await deleteBridgeSession(current.id, config);
}

async function ensureBridgeSession(
  jobId: string,
  config: ModelBridgeConfig,
): Promise<string> {
  if (bridgeSession && bridgeSession.jobId === jobId) return bridgeSession.id;
  if (bridgeSession) await endBridgeSession(config);
  const id = await createBridgeSession(`bog-batch-${jobId}`, config);
  bridgeSession = { jobId, id };
  return id;
}

/** Merge the saved bridge config with the per-batch model override. */
function effectiveModel(
  options: BatchOptions,
  bridge: ModelBridgeConfig,
): ModelBridgeConfig {
  if (!options.model) return bridge;
  return {
    ...bridge,
    providerID: options.model.providerID,
    modelID: options.model.modelID,
  };
}

async function ensureAlarm(): Promise<void> {
  try {
    await chrome.alarms.create(BATCH_ALARM, { periodInMinutes: 0.5 });
  } catch {
    // alarms unavailable in test harnesses; the pump still runs in-process.
  }
}

async function clearAlarm(): Promise<void> {
  try {
    await chrome.alarms.clear(BATCH_ALARM);
  } catch {
    // ignore
  }
}

/**
 * Process items from the job cursor while the job is `running`. Safe to call
 * repeatedly; overlapping calls collapse into the one in flight.
 */
export async function pump(): Promise<void> {
  if (batchRuntime.pumping) return;
  batchRuntime.pumping = true;
  try {
    for (;;) {
      const step = await withBatchState(async () => {
        const job = await loadBatchJob();
        if (!job || job.status !== 'running') return null;
        if (job.cursor >= job.items.length) {
          job.status = 'done';
          job.message = `done: ${job.totals.payloads} payload(s)`;
          await saveBatchJob(job);
          return null;
        }
        await ensureAlarm();
        const index = job.cursor;
        const item = job.items[index];
        if (!item) {
          job.cursor = index + 1;
          await saveBatchJob(job);
          return { job, index, item, controller: null };
        }
        item.status = 'running';
        item.stage = 'resolve';
        job.message = `resolving ${index + 1}/${job.items.length}: ${item.sku}`;
        await saveBatchJob(job);
        const controller = new AbortController();
        activeRun = controller;
        return { job, index, item, controller };
      });
      if (!step) {
        const job = await loadBatchJob();
        if (job && (job.status === 'done' || job.status === 'cancelled')) {
          await clearAlarm();
          await endBridgeSession();
        }
        return;
      }
      const { job, index, item, controller } = step;
      if (!item || !controller) continue;

      const started = Date.now();
      const jobId = job.id;
      const perSkuMs = job.options.timeoutMs ?? DEFAULT_BATCH_TIMEOUT_MS;

      // Stage markers are best-effort: a stage write must never abort an audit.
      const markStage = async (stage: BatchStage): Promise<void> => {
        await withBatchState(async () => {
          const live = await loadBatchJob();
          if (controller.signal.aborted || !live || live.id !== jobId || live.status !== 'running') return;
          const target = live.items[index];
          if (!target) return;
          target.stage = stage;
          await saveBatchJob(live);
        });
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`timed out after ${Math.round(perSkuMs / 1000)}s`));
        }, perSkuMs);
      });
      try {
        const result = await Promise.race([
          runSku(item.sku, job.options, controller.signal, markStage),
          timeout,
        ]);
        if (controller.signal.aborted) throw new Error('Batch interrupted');
        // Persist the audit first: model scoring must never be able to lose it.
        await setSkuPayloads(item.sku, result.payloads);
        await setSkuLibraryCells(item.sku, result.library);
        await setSkuEvidence(item.sku, {
          media: result.media,
          files: result.files,
          hashes: result.hashes,
          childColor: result.childColor,
          isSimple: result.isSimple,
          children: result.children,
        });
        // Written here rather than inside runSku: a timed-out SKU must not
        // leave a dossier behind after the item was recorded as failed.
        await setSkuDossier(item.sku, result.dossierMd);

        const anomalies = [...result.anomalies];
        let modelFlags = 0;
        if (job.options.modelScoring && modelQuotaMessage()) {
          anomalies.push(`model scoring skipped: ${modelQuotaMessage() ?? ''}`);
        } else if (job.options.modelScoring) {
          try {
            const bridge = await loadBridgeConfig();
            const config = effectiveModel(job.options, bridge);
            const sessionId = await ensureBridgeSession(job.id, config);
            const verdict = await withTimeout(
              () => scoreSkuImages(
                {
                  sku: item.sku,
                  frontendUrl: result.frontendUrl,
                  category: result.category,
                  subcategory: result.subcategory,
                  colors: result.colors,
                  sizes: result.sizes,
                  media: result.media,
                },
                config,
                { sessionId, timeoutMs: Math.min(MODEL_TIMEOUT_MS, perSkuMs) },
              ),
              Math.min(MODEL_TIMEOUT_MS, perSkuMs),
              item.sku,
            );
            if (controller.signal.aborted) throw new Error('Batch interrupted');
            await setSkuModelVerdict(item.sku, verdict);
            modelFlags = verdict.flags.length;

            const extra = modelVerdictPayloads(verdict, {
              sku: item.sku,
              link: result.frontendUrl,
              supplier: supplierFor(item.sku),
              category: result.category,
              subcategory: result.subcategory,
              isSimple: result.isSimple,
              media: result.media,
              childColor: result.childColor,
              existingTitles: result.payloads.map((payload) => payload.title),
            });
            if (extra.length > 0) {
              result.payloads = [...result.payloads, ...extra];
              await setSkuPayloads(item.sku, result.payloads);
              if (result.library.status !== 'To Fix') {
                result.library = { ...result.library, status: 'To Fix' };
                await setSkuLibraryCells(item.sku, result.library);
              }
            }
          } catch (err) {
            anomalies.push(`model scoring: ${(err as Error).message ?? 'failed'}`);
          }
        }
        await setSkuAnomalies(item.sku, anomalies);

        const continued = await withBatchState(async () => {
          const current = await loadBatchJob();
          // A new batch may have replaced this one: never mark its items by index.
          if (!current || current.id !== jobId) return;
          if (current.status !== 'running') throw new Error('Batch interrupted');
          const target = current.items[index];
          if (target) {
            target.status = 'ok';
            target.stage = 'done';
            target.payloadCount = result.payloads.length;
            target.anomalyCount = anomalies.length;
            target.reviewFlagCount = result.reviewFlags;
            target.modelFlagCount = modelFlags;
            target.ms = Date.now() - started;
            target.stageMs = result.stageMs;
          }
          current.cursor = index + 1;
          current.totals = recountTotals(current.items);
          await saveBatchJob(current);
          return true;
        });
        if (!continued) return;
      } catch (err) {
        const continued = await withBatchState(async () => {
          const current = await loadBatchJob();
          if (!current || current.id !== jobId) return;
          const target = current.items[index];
          if (current.status === 'paused' || current.status === 'cancelled') {
            // The run was stopped on purpose: do not count it as a failure.
            if (target) {
              const paused = current.status === 'paused';
              target.status = paused ? 'pending' : 'cancelled';
              target.stage = paused ? 'pending' : 'cancelled';
              target.error = paused ? undefined : 'cancelled';
              target.ms = Date.now() - started;
            }
            current.totals = recountTotals(current.items);
            await saveBatchJob(current);
            return;
          }
          if (target) {
            target.status = 'failed';
            target.stage = 'failed';
            target.error = (err as Error).message ?? 'unknown error';
            target.ms = Date.now() - started;
          }
          current.cursor = index + 1;
          current.totals = recountTotals(current.items);
          await saveBatchJob(current);
          return true;
        });
        if (!continued) return;
      } finally {
        if (timer) clearTimeout(timer);
        if (activeRun === controller) activeRun = null;
      }
    }
  } finally {
    batchRuntime.pumping = false;
  }
}

export async function startBatch(args: {
  skus: string[];
  options?: Partial<BatchOptions>;
}): Promise<BatchJob> {
  return withBatchState(async () => {
    const skus = args.skus
      .map((s) => String(s).trim().toUpperCase())
      .filter(Boolean);
    if (skus.length === 0) throw new Error('No SKUs to run');
    // The UI disables Start while a batch runs; keep the same rule at the API so
    // an in-flight SKU can never be recorded against a replacement job.
    const existing = await loadBatchJob();
    if (existing?.status === 'running') {
      throw new Error('A batch is already running - pause or cancel it first.');
    }
    requireSettledBatch();
    // A new batch starts empty: never let an earlier run's payloads reach a push.
    await resetBatchResults();
    resetModelQuotaLatch();
    const job = makeBatchJob(skus, normalizeOptions(args.options));
    await saveBatchJob(job);
    void pump();
    return job;
  });
}

export async function pauseBatch(): Promise<BatchJob | null> {
  return withBatchState(async () => {
    const job = await loadBatchJob();
    if (!job) return null;
    if (job.status === 'running') {
      job.status = 'paused';
      job.message = 'paused';
      await saveBatchJob(job);
      // Stop the SKU in flight: the pump resets it to pending so Resume re-runs it.
      activeRun?.abort();
    }
    return job;
  });
}

export async function resumeBatch(): Promise<BatchJob | null> {
  return withBatchState(async () => {
    const job = await loadBatchJob();
    if (!job) return null;
    if (job.status === 'paused') {
      requireSettledBatch();
      job.status = 'running';
      job.message = 'resuming';
      await saveBatchJob(job);
      void pump();
    }
    return job;
  });
}

export async function cancelBatch(): Promise<BatchJob | null> {
  return withBatchState(async () => {
    const job = await loadBatchJob();
    if (!job) return null;
    job.status = 'cancelled';
    job.message = 'cancelled';
    await saveBatchJob(job);
    activeRun?.abort();
    await clearAlarm();
    await endBridgeSession();
    return job;
  });
}

/** Called on startup and on the alarm tick: re-enter the pump if a job stalls. */
export async function maybeResume(): Promise<void> {
  const job = await loadBatchJob();
  if (job && job.status === 'running') {
    void pump();
  }
}

/** Fresh job skeleton used by the UI before the first start. */
export function idleJob(): BatchJob {
  return {
    id: '',
    createdAt: 0,
    updatedAt: 0,
    status: 'idle',
    options: { ...DEFAULT_BATCH_OPTIONS },
    items: [],
    cursor: 0,
    totals: emptyTotals(),
  };
}

export type { BatchItem, BatchJob };
