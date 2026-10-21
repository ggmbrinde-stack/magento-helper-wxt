/**
 * Mirror tidy-up: the browser port of `order-fix.ps1` + `model-sort.ps1`
 * (mirror side only).
 *
 * - **Reorder** rewrites the `PP_` prefixes of a colour folder so alphabetical
 *   order is the canonical carousel order (front -> side -> back -> box -> bag
 *   -> detail -> ambience), using the same `getImageCategory` classifier as the
 *   audit. A folder with ANY unclassifiable file is skipped whole (eyes rule);
 *   already-ordered folders are reported, not rewritten.
 * - **Model shots** asks the vision bridge whether a human is visible wearing
 *   the product and moves those files to `<SKU>\configure\`. Mannequins, flat
 *   lays and hangers are not moved; anything the model is unsure about stays.
 *
 * Evidence is never touched (this only works inside the picked mirror folder)
 * and `configure\` / `_superseded\` are never reordered.
 */

import { loadEvidence } from './batch';
import {
  ensureEvidenceDir,
  evidenceRoot,
  requestWritePermission,
  writeEvidenceFile,
} from './evidenceFolder';
import { RANK_NAME, getImageCategory } from './imageAudit';
import {
  bridgeScore,
  createBridgeSession,
  deleteBridgeSession,
  loadBridgeConfig,
  modelQuotaMessage,
} from './modelBridge';
import { supplierFor } from './resolver';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const HIDDEN_DIRS = new Set(['configure', '_superseded', 'images']);
const MODEL_BATCH = 4;

export interface TidyProgress {
  sku: string;
  skuIndex: number;
  skuTotal: number;
  stage: 'reorder' | 'model' | 'dedupe';
  detail: string;
  done: number;
  total: number;
}

export interface TidyResult {
  applied: boolean;
  skus: number;
  reordered: number;
  alreadyOrdered: number;
  moves: number;
  skipped: number;
  skippedDetails: string[];
  receipts: string[];
  errors: string[];
  /** Model run only: images sent to the bridge, and how many it called "model". */
  scored?: number;
  modelHits?: number;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}

async function listDir(dir: FileSystemDirectoryHandle): Promise<DirEntry[]> {
  const out: DirEntry[] = [];
  const iterator = (
    dir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
  ).values();
  for await (const entry of iterator) {
    out.push({ name: entry.name, kind: entry.kind as 'file' | 'directory' });
  }
  return out;
}

async function imageNames(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const entries = await listDir(dir);
  return entries
    .filter((entry) => entry.kind === 'file' && IMAGE_EXT.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function readBytes(dir: FileSystemDirectoryHandle, name: string): Promise<ArrayBuffer> {
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  return file.arrayBuffer();
}

async function removeFile(dir: FileSystemDirectoryHandle, name: string): Promise<void> {
  await dir.removeEntry(name);
}

async function childDir(
  root: FileSystemDirectoryHandle,
  parts: string[],
): Promise<FileSystemDirectoryHandle | null> {
  let dir = root;
  try {
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
  } catch {
    return null;
  }
  return dir;
}

/* ------------------------------------------------------------------------- */
/* reorder                                                                    */
/* ------------------------------------------------------------------------- */

interface ReorderItem {
  name: string;
  bare: string;
  pp: number;
  rank: number;
}

interface ReorderPlan {
  label: string;
  order: ReorderItem[];
  ordered: boolean;
  renamed: { from: string; to: string }[];
}

function orderCategory(name: string): number | null {
  return getImageCategory(name.replace(/\.[^.]+$/, ''));
}

/** Pure planning, mirroring order-fix.ps1 (no filesystem writes). */
export function planReorderFolder(label: string, names: string[]): ReorderPlan | string {
  const items: ReorderItem[] = [];
  for (const name of names) {
    const match = /^(\d{2})_(.*)$/.exec(name);
    const pp = match ? Number(match[1]) : 0;
    const bare = match ? (match[2] as string) : name;
    const rank = orderCategory(bare);
    if (rank === null) return `${label}: unclassifiable ${name} - skipped whole, eyes`;
    items.push({ name, bare, pp, rank });
  }
  if (items.length <= 1) return `${label}: too few images - skipped`;
  const want = [...items].sort((a, b) => a.rank - b.rank || a.pp - b.pp);
  const ordered = want.every((item, index) => item.name === items[index]?.name);
  const renamed = want.map((item, index) => ({
    from: item.name,
    to: `${String(index + 1).padStart(2, '0')}_${item.bare}`,
  }));
  return { label, order: want, ordered, renamed };
}

async function reorderDir(
  dir: FileSystemDirectoryHandle,
  label: string,
  apply: boolean,
): Promise<{
  plan: ReorderPlan | null;
  skip?: string;
  error?: string;
}> {
  const names = await imageNames(dir);
  const planned = planReorderFolder(label, names);
  if (typeof planned === 'string') {
    return { plan: null, skip: planned };
  }
  if (planned.ordered || !apply) return { plan: planned };
  try {
    // Read everything first so the rewrite cannot lose a file mid-way.
    const bytes = new Map<string, ArrayBuffer>();
    for (const rename of planned.renamed) {
      bytes.set(rename.from, await readBytes(dir, rename.from));
    }
    for (const rename of planned.renamed) await removeFile(dir, rename.from);
    for (const rename of planned.renamed) {
      const data = bytes.get(rename.from);
      if (data) await writeEvidenceFile(dir, [], rename.to, data);
    }
    return { plan: planned };
  } catch (err) {
    return { plan: planned, error: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------------- */
/* model shots                                                                */
/* ------------------------------------------------------------------------- */

function mimeOf(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Port of `model-score.ps1`'s code-side signals, minus the WinRT face bridge:
 * the OS FaceDetector is not exposed to pages, but Chrome's Shape Detection
 * `FaceDetector` is used where the runtime has it (`faces: null` otherwise).
 * Skin fraction is the same YCbCr test on a 256px sample, near-white studio
 * background excluded first.
 */
export interface CodeSignals {
  skin: number;
  faces: number | null;
  portrait: boolean;
  width: number;
  height: number;
}

function skinFraction(bitmap: ImageBitmap): number {
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  let sampled = 0;
  let skin = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if ((data[i + 3] ?? 255) < 10) continue;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (r >= 245 && g >= 245 && b >= 245) continue;
      sampled += 1;
      const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
      const yy = 0.299 * r + 0.587 * g + 0.114 * b;
      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && yy > 40) skin += 1;
    }
  }
  return sampled === 0 ? 0 : skin / sampled;
}

async function detectFaces(bitmap: ImageBitmap): Promise<number | null> {
  const ctor = (
    globalThis as {
      FaceDetector?: new (options?: unknown) => { detect(input: unknown): Promise<unknown[]> };
    }
  ).FaceDetector;
  if (!ctor) return null;
  try {
    const faces = await new ctor({ fastMode: true, maxDetectedFaces: 8 }).detect(bitmap);
    return Array.isArray(faces) ? faces.length : null;
  } catch {
    return null;
  }
}

interface PreparedImage extends CodeSignals {
  dataUrl: string;
}

async function prepareImage(bytes: ArrayBuffer, mime: string): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try {
    const signals: CodeSignals = {
      skin: skinFraction(bitmap),
      faces: await detectFaces(bitmap),
      portrait: bitmap.height > bitmap.width,
      width: bitmap.width,
      height: bitmap.height,
    };
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    return { ...signals, dataUrl: await blobToDataUrl(blob) };
  } finally {
    bitmap.close();
  }
}

function describeSignals(signals: CodeSignals): string {
  const skin = `${(signals.skin * 100).toFixed(1)}% skin`;
  const faces = signals.faces === null ? 'faces n/a' : `faces ${signals.faces}`;
  return `${skin}, ${faces}${signals.portrait ? ', portrait' : ''}`;
}

const MODEL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          model: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['id', 'model', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

interface ModelAnswer {
  id: string;
  model: boolean;
  reason: string;
}

function truthy(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'model'].includes(v)) return true;
    if (['false', 'no', 'n', '0', 'none', 'product'].includes(v)) return false;
  }
  return null;
}

function parseModelAnswers(value: unknown): ModelAnswer[] | null {
  if (!value || typeof value !== 'object') return null;
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  const out: ModelAnswer[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const model = truthy(rec['model']);
    // Keep the slot even when the model got loose with types: position is the
    // fallback match, so dropping an entry would shift every later image.
    out.push({
      id: typeof rec['id'] === 'string' ? rec['id'] : '',
      model: model ?? false,
      reason: typeof rec['reason'] === 'string' ? rec['reason'] : '',
    });
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* configure dedupe                                                           */
/* ------------------------------------------------------------------------- */

/**
 * The same studio/model photo is reused across every child colour, so moving
 * model shots into `configure\` leaves one identical file per child. Keep the
 * first (alphabetical) copy of each hash and retire the rest to
 * `_superseded\configure\` - the mirror rule is report, never delete.
 */
async function dedupeSkuConfigure(
  root: FileSystemDirectoryHandle,
  supplier: string,
  skuName: string,
  result: TidyResult,
  apply: boolean,
): Promise<void> {
  const configure = await childDir(root, [supplier, skuName, 'configure']);
  if (!configure) return;
  const names = await imageNames(configure);
  if (names.length < 2) return;
  const byHash = new Map<string, string[]>();
  for (const name of names) {
    try {
      const hash = await sha256Hex(await readBytes(configure, name));
      const list = byHash.get(hash);
      if (list) list.push(name);
      else byHash.set(hash, [name]);
    } catch (err) {
      result.errors.push(`${skuName}/configure/${name}: ${messageOf(err)}`);
    }
  }
  for (const [hash, list] of byHash) {
    const [keep, ...extras] = list;
    if (!keep || extras.length === 0) continue;
    for (const name of extras) {
      if (!apply) continue;
      try {
        const bytes = await readBytes(configure, name);
        await writeEvidenceFile(
          root,
          [supplier, skuName, '_superseded', 'configure'],
          name,
          bytes,
        );
        await removeFile(configure, name);
        result.moves += 1;
      } catch (err) {
        result.errors.push(`${skuName}/configure/${name}: ${messageOf(err)}`);
      }
    }
    result.receipts.push(
      `${skuName}/configure: kept ${keep}, retired ${extras.length} duplicate(s) ` +
        `to _superseded/configure (${hash.slice(0, 8)})`,
    );
  }
}

export async function dedupeConfigure(options: {
  skus?: string[];
  onProgress?: (progress: TidyProgress) => void;
}): Promise<TidyResult> {
  const granted = await requestWritePermission();
  if (granted === 'no-folder') throw new Error('Choose an evidence folder first.');
  if (granted !== 'granted') {
    throw new Error('Write permission was not granted - press Grant access first.');
  }
  const root = await evidenceRoot();
  if (!root) throw new Error('Choose an evidence folder first.');
  const stored = await loadEvidence();
  const skus = tidySkus(options, stored);
  if (skus.length === 0) throw new Error('No batch SKUs to tidy.');

  const result: TidyResult = {
    applied: true,
    skus: 0,
    reordered: 0,
    alreadyOrdered: 0,
    moves: 0,
    skipped: 0,
    skippedDetails: [],
    receipts: [],
    errors: [],
  };

  for (const [index, sku] of skus.entries()) {
    const supplier = supplierFor(sku);
    const skuName = sku.toUpperCase();
    const skuDir = await childDir(root, [supplier, skuName]);
    if (!skuDir) {
      result.errors.push(`${sku}: mirror folder not found`);
      continue;
    }
    result.skus += 1;
    options.onProgress?.({
      sku,
      skuIndex: index + 1,
      skuTotal: skus.length,
      stage: 'dedupe',
      detail: 'configure',
      done: index + 1,
      total: skus.length,
    });
    await dedupeSkuConfigure(root, supplier, skuName, result, true);
  }

  return result;
}

/* ------------------------------------------------------------------------- */
/* public API                                                                 */
/* ------------------------------------------------------------------------- */

function tidySkus(options: { skus?: string[] }, stored: Record<string, unknown>): string[] {
  // A typed SKU is honoured even when the folder came from the old pipeline;
  // the mirror path is the real gate, not the batch evidence.
  if (options.skus?.length) {
    return options.skus.map((sku) => sku.trim().toUpperCase()).filter(Boolean);
  }
  return Object.keys(stored);
}

export async function reorderMirror(options: {
  apply: boolean;
  skus?: string[];
  onProgress?: (progress: TidyProgress) => void;
}): Promise<TidyResult> {
  const granted = await requestWritePermission();
  if (granted === 'no-folder') throw new Error('Choose an evidence folder first.');
  if (granted !== 'granted') {
    throw new Error('Write permission was not granted - press Grant access first.');
  }
  const root = await evidenceRoot();
  if (!root) throw new Error('Choose an evidence folder first.');
  const stored = await loadEvidence();
  const skus = tidySkus(options, stored);
  if (skus.length === 0) throw new Error('No batch SKUs to tidy.');

  const result: TidyResult = {
    applied: options.apply,
    skus: 0,
    reordered: 0,
    alreadyOrdered: 0,
    moves: 0,
    skipped: 0,
    skippedDetails: [],
    receipts: [],
    errors: [],
  };

  for (const [index, sku] of skus.entries()) {
    const skuDir = await childDir(root, [supplierFor(sku), sku.toUpperCase()]);
    if (!skuDir) {
      result.errors.push(`${sku}: mirror folder not found`);
      continue;
    }
    result.skus += 1;
    const entries = await listDir(skuDir);
    const folders: { dir: FileSystemDirectoryHandle; label: string }[] = [];
    for (const entry of entries) {
      if (entry.kind !== 'directory' || HIDDEN_DIRS.has(entry.name)) continue;
      const dir = await childDir(root, [supplierFor(sku), sku.toUpperCase(), entry.name]);
      if (dir) folders.push({ dir, label: entry.name });
    }
    const flat = await imageNames(skuDir);
    if (flat.length > 0) folders.push({ dir: skuDir, label: '(flat)' });

    for (const [folderIndex, folder] of folders.entries()) {
      options.onProgress?.({
        sku,
        skuIndex: index + 1,
        skuTotal: skus.length,
        stage: 'reorder',
        detail: folder.label,
        done: folderIndex + 1,
        total: folders.length,
      });
      const outcome = await reorderDir(folder.dir, folder.label, options.apply);
      if (outcome.skip) {
        result.skipped += 1;
        result.skippedDetails.push(`${sku}/${outcome.skip}`);
        continue;
      }
      if (outcome.error) {
        result.errors.push(`${sku}/${folder.label}: ${outcome.error}`);
        continue;
      }
      const plan = outcome.plan;
      if (!plan) continue;
      if (plan.ordered) {
        result.alreadyOrdered += 1;
        continue;
      }
      const desc = plan.order.map((item) => RANK_NAME[item.rank] ?? '?').join(' > ');
      result.receipts.push(`${sku}/${plan.label}: ${desc}`);
      for (const rename of plan.renamed) {
        result.receipts.push(`    ${rename.from} -> ${rename.to}`);
      }
      if (options.apply) result.reordered += 1;
    }
  }

  return result;
}

export async function moveModelShots(options: {
  /** false = only report what the model sees; nothing is moved. */
  apply?: boolean;
  skus?: string[];
  onProgress?: (progress: TidyProgress) => void;
}): Promise<TidyResult> {
  const granted = await requestWritePermission();
  if (granted === 'no-folder') throw new Error('Choose an evidence folder first.');
  if (granted !== 'granted') {
    throw new Error('Write permission was not granted - press Grant access first.');
  }
  const root = await evidenceRoot();
  if (!root) throw new Error('Choose an evidence folder first.');

  const config = await loadBridgeConfig();
  if (!config.enabled) throw new Error('The model bridge is disabled in settings.');
  const latched = modelQuotaMessage();
  if (latched) throw new Error(latched);

  const stored = await loadEvidence();
  const skus = tidySkus(options, stored);
  if (skus.length === 0) throw new Error('No batch SKUs to tidy.');

  const result: TidyResult = {
    applied: options.apply !== false,
    skus: 0,
    reordered: 0,
    alreadyOrdered: 0,
    moves: 0,
    skipped: 0,
    skippedDetails: [],
    receipts: [],
    errors: [],
    scored: 0,
    modelHits: 0,
  };

  for (const [index, sku] of skus.entries()) {
    const supplier = supplierFor(sku);
    const skuName = sku.toUpperCase();
    const skuDir = await childDir(root, [supplier, skuName]);
    if (!skuDir) {
      result.errors.push(`${sku}: mirror folder not found`);
      continue;
    }
    result.skus += 1;

    let sessionId: string | undefined;
    try {
      sessionId = await createBridgeSession(`bog-mirror-${sku}`, config);
    } catch (err) {
      result.errors.push(`${sku}: bridge session failed: ${messageOf(err)}`);
      continue;
    }

    try {
      const entries = await listDir(skuDir);
      const folders: { dir: FileSystemDirectoryHandle; label: string }[] = [];
      for (const entry of entries) {
        if (entry.kind !== 'directory' || HIDDEN_DIRS.has(entry.name)) continue;
        const dir = await childDir(root, [supplier, skuName, entry.name]);
        if (dir) folders.push({ dir, label: entry.name });
      }
      if ((await imageNames(skuDir)).length > 0) folders.push({ dir: skuDir, label: '(flat)' });

      let quotaAbort = false;
      let skuHits = 0;
      let skuScored = 0;
      const reviews: string[] = [];
      const stayedList: { color: string; pos: number; name: string; bytes: ArrayBuffer; folder: FileSystemDirectoryHandle; skin: number; faces: number; band: 'review' | 'product' }[] = [];
      for (const folder of folders) {
        if (quotaAbort) break;
        const names = await imageNames(folder.dir);
        for (let start = 0; start < names.length; start += MODEL_BATCH) {
          if (quotaAbort) break;
          const chunk = names.slice(start, start + MODEL_BATCH);
          options.onProgress?.({
            sku,
            skuIndex: index + 1,
            skuTotal: skus.length,
            stage: 'model',
            detail: `${folder.label} ${start + 1}-${start + chunk.length}/${names.length}`,
            done: start + chunk.length,
            total: names.length,
          });
          const sent: {
            id: string;
            name: string;
            bytes: ArrayBuffer;
            dataUrl: string;
            signals: CodeSignals;
          }[] = [];
          for (const name of chunk) {
            try {
              const bytes = await readBytes(folder.dir, name);
              const prepared = await prepareImage(bytes, mimeOf(name));
              sent.push({
                id: `IMG${sent.length + 1}`,
                name,
                bytes,
                dataUrl: prepared.dataUrl,
                signals: prepared,
              });
            } catch {
              /* image unreadable - skip it */
            }
          }
          if (sent.length === 0) continue;
          const idList = sent.map((item) => item.id).join(', ');
          const answer = await bridgeScore(
            {
              sessionId,
              providerID: config.providerID,
              modelID: config.modelID,
              text:
                `The attached images are, in order: ${idList}.\n` +
                'For EACH id, say whether a HUMAN model or person is visible wearing, ' +
                'holding or demonstrating the product (face, body, hands, legs). ' +
                'Mannequins, ghost mannequins, hangers, flat lays, packaging and empty ' +
                'backdrops are NOT a model. When unsure answer false. ' +
                'Return exactly one result per id, using the ids above verbatim.',
              system:
                'You inspect wholesale product photos. Answer only through the schema; never invent ids.',
              images: sent.map((item) => item.dataUrl),
              schema: MODEL_SCHEMA,
              retryCount: 1,
              timeoutMs: 180000,
            },
            config,
          );
          if (!answer.ok) {
            result.errors.push(`${sku}/${folder.label}: ${answer.error ?? 'model call failed'}`);
            if (answer.quota) quotaAbort = true;
            continue;
          }
          const parsed = parseModelAnswers(answer.structured);
          if (!parsed) {
            result.errors.push(`${sku}/${folder.label}: unexpected model answer`);
            continue;
          }
          result.scored = (result.scored ?? 0) + sent.length;
          skuScored += sent.length;
          const byId = new Map(sent.map((item) => [item.id, item]));
          const matched = parsed.map((item, position) => {
            const direct = byId.get(item.id.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
            const positional = parsed.length === sent.length ? sent[position] : undefined;
            return { answer: item, source: direct ?? positional };
          });
          let hits = 0;
          for (const entry of matched) {
            const item = entry.answer;
            const source = entry.source;
            if (!source) continue;
            const faces = source.signals.faces ?? 0;
            const skin = source.signals.skin;
            if (!item.model && faces < 1) {
              const garment = skin >= 0.5;
              const band: 'review' | 'product' = garment
                ? 'product'
                : skin >= 0.01 || source.signals.portrait
                  ? 'review'
                  : 'product';
              if (band === 'review') {
                reviews.push(
                  `${sku}/${folder.label}/${source.name}: review (${describeSignals(source.signals)})`,
                );
              }
              const posMatch = /pos(\\d+)/i.exec(source.name);
              stayedList.push({
                color: folder.label,
                pos: posMatch && posMatch[1] ? parseInt(posMatch[1], 10) : 999,
                name: source.name,
                bytes: source.bytes,
                folder: folder.dir,
                skin,
                faces,
                band,
              });
              continue;
            }
            hits += 1;
            skuHits += 1;
            result.modelHits = (result.modelHits ?? 0) + 1;
            if (!options.apply) {
              result.receipts.push(
                `${sku}/${folder.label}/${source.name}: model` +
                  `${item.reason ? ` (${item.reason})` : ''} [${describeSignals(source.signals)}]`,
              );
              continue;
            }
            const target = await childDir(root, [supplier, skuName, 'configure']);
            if (!target) {
              try {
                await ensureEvidenceDir(root, [supplier, skuName, 'configure']);
              } catch (err) {
                result.errors.push(`${sku}: configure/: ${messageOf(err)}`);
                continue;
              }
            }
            const configure = await childDir(root, [supplier, skuName, 'configure']);
            if (!configure) continue;
            try {
              const existing = await listDir(configure);
              if (existing.some((entry) => entry.name === source.name)) {
                result.skipped += 1;
                result.skippedDetails.push(
                  `${sku}/${folder.label}/${source.name}: already in configure`,
                );
                continue;
              }
              await writeEvidenceFile(root, [supplier, skuName, 'configure'], source.name, source.bytes);
              await removeFile(folder.dir, source.name);
              result.moves += 1;
              const hash = (await sha256Hex(source.bytes)).slice(0, 8);
              result.receipts.push(
                `${sku}/${folder.label}/${source.name} -> configure/ (${hash}${item.reason ? `: ${item.reason}` : ''})`,
              );
            } catch (err) {
              result.errors.push(`${sku}/${source.name}: ${messageOf(err)}`);
            }
          }
        }
      }
      // product-cap pass: per colour keep at most 4 product images (lowest
      // positions first); overflow review-band moves to configure/ as cap-move,
      // overflow product-band is listed as cap-review (never auto-moved).
      const PRODUCT_CAP = 4;
      const byColor = new Map<string, typeof stayedList>();
      for (const item of stayedList) {
        const list = byColor.get(item.color) ?? [];
        list.push(item);
        byColor.set(item.color, list);
      }
      for (const [color, items] of byColor) {
        const sorted = [...items].sort((a, b) => a.pos - b.pos);
        if (sorted.length <= PRODUCT_CAP) {
          for (const item of sorted) {
            if (item.band === 'review') {
              reviews.push(`${sku}/${color}/${item.name}: review (cap-kept)`);
            }
          }
          continue;
        }
        const kept = sorted.slice(0, PRODUCT_CAP);
        const overflow = sorted.slice(PRODUCT_CAP);
        for (const item of kept) {
          if (item.band === 'review') {
            reviews.push(`${sku}/${color}/${item.name}: review (cap-kept)`);
          }
        }
        for (const item of overflow) {
          if (item.band === 'review') {
            if (!options.apply) {
              result.receipts.push(`${sku}/${color}/${item.name}: cap-move (preview)`);
              continue;
            }
            try {
              let configure = await childDir(root, [supplier, skuName, 'configure']);
              if (!configure) {
                await ensureEvidenceDir(root, [supplier, skuName, 'configure']);
                configure = await childDir(root, [supplier, skuName, 'configure']);
              }
              if (!configure) continue;
              const existing = await listDir(configure);
              if (existing.some((entry) => entry.name === item.name)) {
                result.skipped += 1;
                result.skippedDetails.push(`${sku}/${color}/${item.name}: already in configure`);
                continue;
              }
              await writeEvidenceFile(root, [supplier, skuName, 'configure'], item.name, item.bytes);
              await removeFile(item.folder, item.name);
              result.moves += 1;
              const hash = (await sha256Hex(item.bytes)).slice(0, 8);
              result.receipts.push(`${sku}/${color}/${item.name} -> configure/ (cap-move ${hash})`);
            } catch (err) {
              result.errors.push(`${sku}/${item.name}: ${messageOf(err)}`);
            }
          } else {
            reviews.push(`${sku}/${color}/${item.name}: cap-review`);
          }
        }
      }

      if (skuScored > 0) {
        result.skippedDetails.push(
          `${sku}: ${config.modelID} labelled ${skuHits}/${skuScored} image(s) as human model` +
            (skuHits === 0
              ? ' - if that is wrong, check the model accepts images (a text-only model ' +
                'says "no" to every photo)'
              : ''),
        );
      }
      if (reviews.length > 0) {
        result.skippedDetails.push(...reviews.slice(0, 40));
        if (reviews.length > 40) {
          result.skippedDetails.push(`... ${reviews.length - 40} more review candidate(s)`);
        }
      }
    } catch (err) {
      result.errors.push(`${sku}: ${messageOf(err)}`);
    } finally {
      if (sessionId) await deleteBridgeSession(sessionId, config).catch(() => undefined);
    }
    if (result.applied) await dedupeSkuConfigure(root, supplier, skuName, result, true);
    if (modelQuotaMessage()) break;
  }

  return result;
}


function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
