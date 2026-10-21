/**
 * Write a finished batch into the local **mirror** folder.
 *
 * Mirrors `scripts/media-map.js` (the pipeline's save step), not the evidence
 * archive:
 *
 *   <root>\<SUPPLIER>\<SKU>\<Colour>\<PP>_<child>_pos<N>_<basename>.<ext>
 *   <root>\<SUPPLIER>\<SKU>\configure\              (always created)
 *
 * - `PP` is the zero-padded carousel position, so alphabetical order IS the
 *   carousel order.
 * - Simple products / unmapped children mirror flat at `<SKU>\` (no colour).
 * - EN carousel in full; ES/FR only when that child's position->basename map
 *   differs from EN.
 * - Bytes come from the **original** file URL (`/cache/<32hex>/` stripped),
 *   falling back to the cache rendition - matching the pipeline, which avoids
 *   the square-cropped cache images.
 * - Content dedupe is hash + colour: identical bytes in one colour folder are
 *   written once, later names are counted as aliases and skipped.
 *
 * Images are downloaded at save time from the URLs stored with the batch; the
 * browser profile keeps no copies.
 */

import { loadEvidence, setSkuEvidence, type BatchEvidence } from './batch';
import {
  ensureEvidenceDir,
  evidenceRoot,
  requestWritePermission,
  writeEvidenceFile,
} from './evidenceFolder';
import { fetchOriginalBytes } from './imageFetch';
import { buildChildColorMap, readMediaSource } from './imageAudit';
import {
  setSkuManifest,
  type ManifestFile,
  type MirrorManifest,
} from './mirrorManifest';
import { resolveSkuWithHtml, supplierFor } from './resolver';

export interface EvidenceSaveProgress {
  sku: string;
  skuIndex: number;
  skuTotal: number;
  file: string;
  filesDone: number;
  filesTotal: number;
}

export interface EvidenceSaveResult {
  folder: string;
  skus: number;
  files: number;
  aliases: number;
  failed: number;
  errors: string[];
}

export interface MirrorFile {
  child: string;
  pos: number;
  /** `<child>_pos<N>_<base>.<ext>` (evidence name). */
  name: string;
  /** Mirror name: `<PP>_<name>`. */
  mirrorName: string;
  /** `<SUP>/<SKU>[/<Colour>]` */
  folders: string[];
  url: string;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Old batches stored extension-less names; add the URL's extension on save. */
export function diskName(name: string, url: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  const path = (url.split(/[?#]/)[0] ?? '').split('/').pop() ?? '';
  const dot = path.lastIndexOf('.');
  const ext = dot > 0 ? path.slice(dot) : '.jpg';
  return `${name}${ext}`;
}

function safeFolder(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[. ]+$/, '') || '_';
}

function parseChildPos(name: string): { child: string; pos: number } | null {
  const m = /^(\d+)_pos(\d+)_/.exec(name);
  if (!m) return null;
  return { child: m[1] as string, pos: Number(m[2]) };
}

function orderKey(name: string): [number, number, string] {
  const parsed = parseChildPos(name);
  if (!parsed) return [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, name];
  return [Number(parsed.child), parsed.pos, name];
}

function compareNames(a: string, b: string): number {
  const ka = orderKey(a);
  const kb = orderKey(b);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
}

/**
 * Evidence names to mirror: EN carousel in full, plus ES/FR names only for
 * children whose position->basename sequence differs from EN.
 */
function selectedNames(entry: BatchEvidence): Set<string> | null {
  const byChild = new Map<string, Map<string, string[]>>();
  for (const source of entry.media) {
    const parsed = readMediaSource(source);
    if (!parsed) continue;
    const langs = byChild.get(parsed.child) ?? new Map<string, string[]>();
    langs.set(
      parsed.lang,
      parsed.entries.map((e) => e.file),
    );
    byChild.set(parsed.child, langs);
  }
  if (byChild.size === 0) return null;

  const selected = new Set<string>();
  for (const langs of byChild.values()) {
    const codes = [...langs.keys()].sort();
    const ref = langs.has('EN') ? 'EN' : (codes[0] as string | undefined);
    if (!ref) continue;
    const refNames = langs.get(ref) ?? [];
    for (const name of refNames) selected.add(name);
    const refSeq = refNames.map((name) => name.replace(/^(\d+)_pos(\d+)_/, ''));
    for (const code of codes) {
      if (code === ref) continue;
      const names = langs.get(code) ?? [];
      const seq = names.map((name) => name.replace(/^(\d+)_pos(\d+)_/, ''));
      if (seq.join('|') !== refSeq.join('|')) {
        for (const name of names) selected.add(name);
      }
    }
  }
  return selected;
}

/** The exact files a save would write, in carousel order. */
export function planMirrorFiles(sku: string, entry: BatchEvidence): MirrorFile[] {
  const supplier = supplierFor(sku);
  const skuFolder = safeFolder(sku.toUpperCase());
  const selected = selectedNames(entry);

  const urlByName = new Map<string, string>();
  for (const [url, names] of Object.entries(entry.files)) {
    for (const raw of names) {
      const name = diskName(raw, url);
      if (!urlByName.has(name)) urlByName.set(name, url);
    }
  }

  const files: MirrorFile[] = [];
  for (const [name, url] of urlByName) {
    if (selected && !selected.has(name) && !selected.has(name.replace(/\.[a-z0-9]+$/i, ''))) {
      // Legacy names without extension: `selected` holds the raw audit names.
      const legacy = name.replace(/\.[a-z0-9]+$/i, '');
      if (!selected.has(legacy)) continue;
    }
    const parsed = parseChildPos(name);
    if (!parsed) continue;
    const color = entry.childColor?.[parsed.child];
    const folders =
      entry.isSimple || !color
        ? [supplier, skuFolder]
        : [supplier, skuFolder, safeFolder(color)];
    files.push({
      child: parsed.child,
      pos: parsed.pos,
      name,
      mirrorName: `${String(parsed.pos).padStart(2, '0')}_${name}`,
      folders,
      url,
    });
  }
  return files.sort((a, b) => compareNames(a.name, b.name));
}

/**
 * Batches stored before colours were part of the evidence have no
 * `childColor`, so the mirror would be flat. Resolve the SKU once, then persist
 * the colours with the evidence so later saves are offline.
 */
export async function enrichEvidence(
  sku: string,
  entry: BatchEvidence,
): Promise<BatchEvidence> {
  if (entry.childColor) return entry;
  try {
    const { resolver } = await resolveSkuWithHtml(sku);
    const enriched: BatchEvidence = {
      ...entry,
      childColor: buildChildColorMap(resolver),
      isSimple: resolver.children.length === 0,
    };
    await setSkuEvidence(sku, enriched);
    return enriched;
  } catch {
    return entry;
  }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** Write every SKU in the stored batch (or just `skus`) into the picked folder. */
export async function saveBatchEvidence(
  options: {
    skus?: string[];
    onProgress?: (progress: EvidenceSaveProgress) => void;
  } = {},
): Promise<EvidenceSaveResult> {
  // Ask for write access before any slow work: Chrome only allows the prompt
  // while the click's user gesture is still active.
  const granted = await requestWritePermission();
  if (granted === 'no-folder') throw new Error('Choose an evidence folder first.');
  if (granted !== 'granted') {
    throw new Error(
      'Write permission was not granted - click "Change folder" and pick the folder again.',
    );
  }
  const root = await evidenceRoot();
  if (!root) throw new Error('Choose an evidence folder first.');

  const stored = await loadEvidence();
  const skus = (options.skus ?? Object.keys(stored)).filter((sku) => stored[sku]);
  if (skus.length === 0) throw new Error('No batch evidence to save yet.');

  const result: EvidenceSaveResult = {
    folder: root.name,
    skus: 0,
    files: 0,
    aliases: 0,
    failed: 0,
    errors: [],
  };

  const plans: { sku: string; files: MirrorFile[] }[] = [];
  for (const sku of skus) {
    const entry = await enrichEvidence(sku, stored[sku] as BatchEvidence);
    plans.push({ sku, files: planMirrorFiles(sku, entry) });
  }
  const filesTotal = plans.reduce((sum, plan) => sum + plan.files.length, 0);

  let filesDone = 0;
  for (const [index, plan] of plans.entries()) {
    const { sku, files } = plan;
    let wrote = 0;
    const seen = new Set<string>();

    const report = (file: string): void => {
      filesDone += 1;
      options.onProgress?.({
        sku,
        skuIndex: index + 1,
        skuTotal: plans.length,
        file,
        filesDone,
        filesTotal,
      });
    };

    const supplier = supplierFor(sku);
    const skuFolder = safeFolder(sku.toUpperCase());
    const manifestFiles: ManifestFile[] = [];
    const aliases: Record<string, string> = {};
    // dedupeKey -> mirror name kept for that folder+hash
    const keptByKey = new Map<string, string>();
    try {
      await ensureEvidenceDir(root, [supplier, skuFolder, 'configure']);
    } catch (err) {
      result.failed += 1;
      result.errors.push(`${sku} configure/: ${messageOf(err)}`);
    }

    const byUrl = new Map<string, MirrorFile[]>();
    for (const file of files) {
      const group = byUrl.get(file.url) ?? [];
      group.push(file);
      byUrl.set(file.url, group);
    }

    for (const [url, group] of byUrl) {
      let bytes: ArrayBuffer;
      try {
        bytes = await fetchOriginalBytes(url);
      } catch (err) {
        result.failed += group.length;
        filesDone += group.length;
        result.errors.push(`${sku} ${group[0]?.name ?? url}: ${messageOf(err)}`);
        continue;
      }
      const hash = await sha256Hex(bytes);
      for (const file of group) {
        const dedupeKey = `${file.folders.join('/')}|${hash}`;
        const kept = keptByKey.get(dedupeKey);
        if (kept) {
          aliases[file.mirrorName] = kept;
          result.aliases += 1;
          filesDone += 1;
          continue;
        }
        keptByKey.set(dedupeKey, file.mirrorName);
        seen.add(dedupeKey);
        try {
          await writeEvidenceFile(root, file.folders, file.mirrorName, bytes);
          manifestFiles.push({
            name: file.mirrorName,
            folders: file.folders,
            child: file.child,
            pos: file.pos,
            hash,
            bytes: bytes.byteLength,
            url,
          });
          wrote += 1;
          report(file.mirrorName);
        } catch (err) {
          result.failed += 1;
          filesDone += 1;
          result.errors.push(`${sku} ${file.mirrorName}: ${messageOf(err)}`);
        }
      }
    }

    if (wrote > 0 || Object.keys(aliases).length > 0) {
      const manifest: MirrorManifest = {
        schema: 'bog-mirror-manifest/v1',
        sku: sku.toUpperCase(),
        supplier,
        createdAt: new Date().toISOString(),
        files: manifestFiles,
        aliases,
        imageCount: manifestFiles.length,
      };
      await setSkuManifest(sku, manifest).catch(() => undefined);
    }
    if (wrote > 0) result.skus += 1;
  }

  result.files = filesDone - result.failed - result.aliases;
  return result;
}
