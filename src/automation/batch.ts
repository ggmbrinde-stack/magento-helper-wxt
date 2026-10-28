// Batch audit runner — shared types + storage.
//
// The runner itself lives in the background service worker (`batchRunner.ts`).
// The job is persisted in `chrome.storage.local` after every SKU so a service
// worker suspension (or a browser restart) can resume from the last cursor.

import type { ListingErrorPayload } from '../audit';
import type { LibraryCells } from '../audit';
import type { ModelVerdict } from './modelSort';
import type { MediaSource } from '../audit';
import { BATCH_MANIFEST_KEY } from './mirrorManifest';
import { BATCH_AVAILABILITY_KEY } from '../audit';

export const BATCH_JOB_KEY = 'batchJob';
export const BATCH_PAYLOADS_KEY = 'batchPayloads';
export const BATCH_LIBRARY_KEY = 'batchLibrary';
export const BATCH_ANOMALIES_KEY = 'batchAnomalies';
export const BATCH_MODEL_VERDICTS_KEY = 'batchModelVerdicts';
export const BATCH_DOSSIER_KEY = 'batchDossier';
export const BATCH_EVIDENCE_KEY = 'batchEvidence';
export const BATCH_PUSHED_KEY = 'batchPushed';
export const BATCH_ALARM = 'bog-batch-pump';

export type BatchStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'done'
  | 'cancelled';

/** Coarse stage marker for the per-SKU progress table. */
export type BatchStage =
  | 'pending'
  | 'resolve'
  | 'variants'
  | 'images'
  | 'text'
  | 'payload'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface BatchOptions {
  /** Storefront languages to compare (default EN, ES, FR). */
  langs: string[];
  /** Download + SHA-256 every unique image (duplicates check). */
  hashImages: boolean;
  /** Sample the pos0 border tone (background check). */
  background: boolean;
  maxChildren?: number;
  /** Cap on unique image downloads per SKU (safety valve for large matrices). */
  maxImages?: number;
  /** Per-SKU wall-clock ceiling; a slower SKU fails and the batch moves on. */
  timeoutMs?: number;
  /** Ask the local opencode bridge for vision verdicts (review flags only). */
  modelScoring: boolean;
  /** Model to use; falls back to the saved bridge config when omitted. */
  model?: { providerID: string; modelID: string };
}

export const DEFAULT_BATCH_TIMEOUT_MS = 180000;

export const DEFAULT_BATCH_OPTIONS: BatchOptions = {
  langs: ['EN', 'ES', 'FR'],
  hashImages: false,
  background: true,
  maxImages: 2000,
  timeoutMs: DEFAULT_BATCH_TIMEOUT_MS,
  modelScoring: false,
};

export interface BatchItem {
  sku: string;
  status: 'pending' | 'running' | 'ok' | 'failed' | 'cancelled';
  stage: BatchStage;
  /** Listing Errors payloads produced for this SKU. */
  payloadCount: number;
  /** Collection/fetch/build anomalies noticed while running the SKU. */
  anomalyCount: number;
  /** Payloads carrying review flags (the auditor decides, not us). */
  reviewFlagCount: number;
  /** Candidate flags raised by model scoring (0 when it did not run). */
  modelFlagCount: number;
  error?: string;
  ms?: number;
  /** Compact per-stage durations (ms) for benchmarking. */
  stageMs?: {
    resolve: number;
    images: number;
    text: number;
    payload: number;
    total: number;
  };
}

export interface BatchTotals {
  ok: number;
  failed: number;
  payloads: number;
  anomalies: number;
  reviewFlags: number;
  modelFlags: number;
}

export interface BatchJob {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: BatchStatus;
  options: BatchOptions;
  items: BatchItem[];
  /** Index of the next item to process. */
  cursor: number;
  totals: BatchTotals;
  /** Free-form progress note (e.g. "resolving 12/40"). */
  message?: string;
}

/**
 * Parse a pasted SKU list (one per line, or comma/space separated). Tokens that
 * look like URLs or that aren't plain SKU-shaped are returned in `invalid`
 * rather than being silently dropped.
 */
export function parseSkuInput(input: string): {
  skus: string[];
  invalid: string[];
} {
  const seen = new Set<string>();
  const skus: string[] = [];
  const invalid: string[] = [];
  const tokens = input
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  for (const raw of tokens) {
    const token = raw.replace(/^["'([{]+/, '').replace(/["')\]},.]+$/, '');
    if (!token) continue;
    const upper = token.toUpperCase();
    const looksLikeUrl = /^https?:\/\//i.test(raw) || raw.includes('/');
    const okShape =
      /^[A-Z0-9][A-Z0-9-]*$/.test(upper) && !upper.includes('.') && !upper.includes(':');
    if (looksLikeUrl || !okShape) {
      invalid.push(raw);
      continue;
    }
    if (seen.has(upper)) continue;
    seen.add(upper);
    skus.push(upper);
  }
  return { skus, invalid };
}

export function emptyTotals(): BatchTotals {
  return {
    ok: 0,
    failed: 0,
    payloads: 0,
    anomalies: 0,
    reviewFlags: 0,
    modelFlags: 0,
  };
}

export function recountTotals(items: BatchItem[]): BatchTotals {
  const totals = emptyTotals();
  for (const item of items) {
    if (item.status === 'ok') totals.ok += 1;
    else if (item.status === 'failed') totals.failed += 1;
    totals.payloads += item.payloadCount;
    totals.anomalies += item.anomalyCount;
    totals.reviewFlags += item.reviewFlagCount;
    totals.modelFlags += item.modelFlagCount;
  }
  return totals;
}

export function makeBatchJob(
  skus: string[],
  options: BatchOptions,
): BatchJob {
  const now = Date.now();
  return {
    id: `batch-${now.toString(36)}`,
    createdAt: now,
    updatedAt: now,
    status: 'running',
    options,
    items: skus.map((sku) => ({
      sku,
      status: 'pending',
      stage: 'pending',
      payloadCount: 0,
      anomalyCount: 0,
      reviewFlagCount: 0,
      modelFlagCount: 0,
    })),
    cursor: 0,
    totals: emptyTotals(),
  };
}

export async function loadBatchJob(): Promise<BatchJob | null> {
  try {
    const stored = await chrome.storage.local.get([BATCH_JOB_KEY]);
    const job = stored[BATCH_JOB_KEY] as BatchJob | undefined;
    return job ?? null;
  } catch {
    return null;
  }
}

export async function saveBatchJob(job: BatchJob): Promise<void> {
  job.updatedAt = Date.now();
  await chrome.storage.local.set({ [BATCH_JOB_KEY]: job });
}

export async function patchBatchJob(
  mutate: (job: BatchJob) => void,
): Promise<BatchJob | null> {
  const job = await loadBatchJob();
  if (!job) return null;
  mutate(job);
  await saveBatchJob(job);
  return job;
}

export async function clearBatch(): Promise<void> {
  await chrome.storage.local.remove([
    BATCH_JOB_KEY,
    BATCH_PAYLOADS_KEY,
    BATCH_LIBRARY_KEY,
    BATCH_ANOMALIES_KEY,
    BATCH_MODEL_VERDICTS_KEY,
    BATCH_DOSSIER_KEY,
    BATCH_EVIDENCE_KEY,
    BATCH_PUSHED_KEY,
    BATCH_MANIFEST_KEY,
    BATCH_AVAILABILITY_KEY,
  ]);
}

/**
 * Drop the per-run results but keep the job. Called when a new batch starts so
 * a push can never carry payloads from an earlier, unrelated run.
 */
export async function resetBatchResults(): Promise<void> {
  await chrome.storage.local.remove([
    BATCH_PAYLOADS_KEY,
    BATCH_LIBRARY_KEY,
    BATCH_ANOMALIES_KEY,
    BATCH_MODEL_VERDICTS_KEY,
    // The dossier is a per-run result too: a new batch must not inherit one.
    BATCH_DOSSIER_KEY,
    BATCH_EVIDENCE_KEY,
    BATCH_PUSHED_KEY,
    BATCH_MANIFEST_KEY,
    BATCH_AVAILABILITY_KEY,
  ]);
}

export type BatchPayloadMap = Record<string, ListingErrorPayload[]>;

export async function loadBatchPayloads(): Promise<BatchPayloadMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_PAYLOADS_KEY]);
    return (stored[BATCH_PAYLOADS_KEY] as BatchPayloadMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function saveBatchPayloads(map: BatchPayloadMap): Promise<void> {
  await chrome.storage.local.set({ [BATCH_PAYLOADS_KEY]: map });
}

export async function setSkuPayloads(
  sku: string,
  payloads: ListingErrorPayload[],
): Promise<void> {
  const map = await loadBatchPayloads();
  map[sku] = payloads;
  await saveBatchPayloads(map);
}

/** Count payloads in the map without pulling it into the UI wholesale. */
export function countPayloads(map: BatchPayloadMap): number {
  let total = 0;
  for (const list of Object.values(map)) total += list.length;
  return total;
}

export type BatchLibraryMap = Record<string, LibraryCells>;

export async function loadLibraryCells(): Promise<BatchLibraryMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_LIBRARY_KEY]);
    return (stored[BATCH_LIBRARY_KEY] as BatchLibraryMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function setSkuLibraryCells(
  sku: string,
  cells: LibraryCells,
): Promise<void> {
  const map = await loadLibraryCells();
  map[sku] = cells;
  await chrome.storage.local.set({ [BATCH_LIBRARY_KEY]: map });
}

export type BatchAnomalyMap = Record<string, string[]>;

export async function loadAnomalies(): Promise<BatchAnomalyMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_ANOMALIES_KEY]);
    return (stored[BATCH_ANOMALIES_KEY] as BatchAnomalyMap | undefined) ?? {};
  } catch {
    return {};
  }
}

/** Persist the anomaly detail for one SKU (the count alone loses the reason). */
export async function setSkuAnomalies(
  sku: string,
  anomalies: string[],
): Promise<void> {
  const map = await loadAnomalies();
  if (anomalies.length === 0) delete map[sku];
  else map[sku] = anomalies;
  await chrome.storage.local.set({ [BATCH_ANOMALIES_KEY]: map });
}

export type ModelVerdictMap = Record<string, ModelVerdict>;

export async function loadModelVerdicts(): Promise<ModelVerdictMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_MODEL_VERDICTS_KEY]);
    return (stored[BATCH_MODEL_VERDICTS_KEY] as ModelVerdictMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function setSkuModelVerdict(
  sku: string,
  verdict: ModelVerdict,
): Promise<void> {
  const map = await loadModelVerdicts();
  map[sku] = verdict;
  await chrome.storage.local.set({ [BATCH_MODEL_VERDICTS_KEY]: map });
}

/** Raw media + file names kept so the dashboard can mirror the evidence folder. */
export interface BatchEvidence {
  media: MediaSource[];
  /** Image URL -> every `<child>_pos<N>_<basename>.<ext>` name that references it. */
  files: Record<string, string[]>;
  hashes?: Record<string, string[]>;
  /** Child id -> colour label (resolver attribute 93). Missing = flat mirror. */
  childColor?: Record<string, string>;
  /** Simple product: mirror flat at `<SUP>/<SKU>`, no colour folders. */
  isSimple?: boolean;
  /** Resolver child ids (coverage gate: resolver vs media vs files). */
  children?: string[];
}

export type BatchEvidenceMap = Record<string, BatchEvidence>;

export async function loadEvidence(): Promise<BatchEvidenceMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_EVIDENCE_KEY]);
    return (stored[BATCH_EVIDENCE_KEY] as BatchEvidenceMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function setSkuEvidence(
  sku: string,
  evidence: BatchEvidence,
): Promise<void> {
  const map = await loadEvidence();
  map[sku] = evidence;
  await chrome.storage.local.set({ [BATCH_EVIDENCE_KEY]: map });
}

export interface PushedInfo {
  /** ISO timestamp of the successful Notion push. */
  at: string;
  /** Notion page id when the library writer returned one. */
  pageId?: string;
}

export type PushedMap = Record<string, PushedInfo>;

export async function loadPushed(): Promise<PushedMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_PUSHED_KEY]);
    return (stored[BATCH_PUSHED_KEY] as PushedMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function markPushed(skus: string[], pageIds?: Record<string, string>): Promise<void> {
  if (skus.length === 0) return;
  const map = await loadPushed();
  const at = new Date().toISOString();
  for (const sku of skus) {
    map[sku] = { at, pageId: pageIds?.[sku] };
  }
  await chrome.storage.local.set({ [BATCH_PUSHED_KEY]: map });
}

export type BatchDossierMap = Record<string, string>;

export async function loadDossier(): Promise<BatchDossierMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_DOSSIER_KEY]);
    return (stored[BATCH_DOSSIER_KEY] as BatchDossierMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function setSkuDossier(sku: string, markdown: string): Promise<void> {
  const map = await loadDossier();
  map[sku] = markdown;
  await chrome.storage.local.set({ [BATCH_DOSSIER_KEY]: map });
}

