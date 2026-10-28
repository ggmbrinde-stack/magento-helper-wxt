/**
 * Mirror manifest - the browser port of `scripts/evidence-manifest.ps1`.
 *
 * The old pipeline kept `manifest.json` + `hashes.sha256` inside
 * `evidence/<SKU>/`; this mirror has no evidence archive, so the manifest is
 * captured in extension storage when "Save images" writes the files and is
 * verified against the folder on demand.
 *
 * Verification is CONTENT-based (SHA-256), not path-based: `order-fix` renames
 * files and `model-sort` moves them into `configure\`, so a name-only compare
 * would report drift after every legitimate tidy. A file counts as present when
 * its bytes are still somewhere under the SKU (colour folder, flat, configure).
 *
 * Nothing here deletes: stale files are moved to `_superseded\stale\`.
 */

import { supplierFor } from '../shared/resolver';

export const BATCH_MANIFEST_KEY = 'batchManifests';

export interface ManifestFile {
  /** Mirror name at save time (`PP_<child>_pos<N>_<base>.<ext>`). */
  name: string;
  /** `<SUP>/<SKU>[/<Colour>]` at save time. */
  folders: string[];
  child: string;
  pos: number;
  hash: string;
  bytes: number;
  url: string;
}

export interface MirrorManifest {
  schema: 'bog-mirror-manifest/v1';
  sku: string;
  supplier: string;
  createdAt: string;
  files: ManifestFile[];
  /** Alias mirror name -> kept mirror name (identical bytes in one colour). */
  aliases: Record<string, string>;
  imageCount: number;
}

export type ManifestMap = Record<string, MirrorManifest>;

export async function loadManifests(): Promise<ManifestMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_MANIFEST_KEY]);
    return (stored[BATCH_MANIFEST_KEY] as ManifestMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function setSkuManifest(sku: string, manifest: MirrorManifest): Promise<void> {
  const map = await loadManifests();
  map[sku] = manifest;
  await chrome.storage.local.set({ [BATCH_MANIFEST_KEY]: map });
}

export async function clearManifests(): Promise<void> {
  await chrome.storage.local.remove(BATCH_MANIFEST_KEY);
}

/* ------------------------------------------------------------------------- */
/* verification                                                               */
/* ------------------------------------------------------------------------- */

const RASTER = /\.(jpe?g|png|webp)$/i;
const HIDDEN = new Set(['configure', '_superseded', 'images']);

export interface ManifestDrift {
  sku: string;
  verdict: 'ok' | 'drift' | 'missing' | 'blocked';
  manifestFiles: number;
  onDisk: number;
  /** Manifest photos whose bytes are nowhere under the SKU. */
  missing: string[];
  /** Photos on disk that the save never recorded (or a later writer added). */
  extra: string[];
  /** Same name, different bytes. */
  mismatch: string[];
  note?: string;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  let hex = '';
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

interface DiskImage {
  name: string;
  folder: string;
  hash: string;
}

async function scanSkuImages(
  root: FileSystemDirectoryHandle,
  supplier: string,
  sku: string,
): Promise<DiskImage[] | null> {
  let skuDir: FileSystemDirectoryHandle;
  try {
    const sup = await root.getDirectoryHandle(supplier);
    skuDir = await sup.getDirectoryHandle(sku);
  } catch {
    return null;
  }
  const out: DiskImage[] = [];
  const dirs: { handle: FileSystemDirectoryHandle; label: string }[] = [
    { handle: skuDir, label: '(flat)' },
  ];
  const iterator = (
    skuDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
  ).values();
  for await (const entry of iterator) {
    if (entry.kind !== 'directory' || HIDDEN.has(entry.name)) continue;
    dirs.push({ handle: entry as FileSystemDirectoryHandle, label: entry.name });
  }
  for (const dir of dirs) {
    const files = (
      dir.handle as unknown as { values: () => AsyncIterable<FileSystemHandle> }
    ).values();
    for await (const file of files) {
      if (file.kind !== 'file' || !RASTER.test(file.name)) continue;
      try {
        const handle = await dir.handle.getFileHandle(file.name);
        const blob = await handle.getFile();
        out.push({
          name: file.name,
          folder: dir.label,
          hash: await sha256Hex(await blob.arrayBuffer()),
        });
      } catch {
        /* unreadable file - skip, the caller sees onDisk count */
      }
    }
  }
  return out;
}

export async function verifyManifests(
  options: {
    root: FileSystemDirectoryHandle;
    skus?: string[];
    onProgress?: (sku: string, index: number, total: number) => void;
  },
): Promise<ManifestDrift[]> {
  const manifests = await loadManifests();
  const skus = (options.skus ?? Object.keys(manifests)).filter(Boolean);
  const results: ManifestDrift[] = [];
  for (const [index, sku] of skus.entries()) {
    options.onProgress?.(sku, index + 1, skus.length);
    const manifest = manifests[sku];
    if (!manifest) {
      results.push({
        sku,
        verdict: 'missing',
        manifestFiles: 0,
        onDisk: 0,
        missing: [],
        extra: [],
        mismatch: [],
        note: 'no manifest - save images first',
      });
      continue;
    }
    const disk = await scanSkuImages(options.root, supplierFor(sku), sku.toUpperCase());
    if (!disk) {
      results.push({
        sku,
        verdict: 'blocked',
        manifestFiles: manifest.files.length,
        onDisk: 0,
        missing: [],
        extra: [],
        mismatch: [],
        note: 'mirror folder not found',
      });
      continue;
    }
    const diskHashes = new Set(disk.map((image) => image.hash));
    const expected = new Map<string, string[]>();
    for (const file of manifest.files) {
      const list = expected.get(file.hash);
      if (list) list.push(file.name);
      else expected.set(file.hash, [file.name]);
    }
    const missing: string[] = [];
    for (const [hash, names] of expected) {
      if (!diskHashes.has(hash)) missing.push(names[0] ?? hash.slice(0, 12));
    }
    const extra: string[] = [];
    for (const image of disk) {
      if (!expected.has(image.hash)) extra.push(`${image.folder}/${image.name}`);
    }
    const mismatch: string[] = [];
    const byName = new Map(disk.map((image) => [image.name, image]));
    for (const file of manifest.files) {
      const hit = byName.get(file.name);
      if (hit && hit.hash !== file.hash) mismatch.push(file.name);
    }
    const drifted = missing.length + extra.length + mismatch.length > 0;
    results.push({
      sku,
      verdict: drifted ? 'drift' : 'ok',
      manifestFiles: manifest.files.length,
      onDisk: disk.length,
      missing: missing.slice(0, 20),
      extra: extra.slice(0, 20),
      mismatch: mismatch.slice(0, 20),
    });
  }
  return results;
}

/* ------------------------------------------------------------------------- */
/* retire stale files                                                         */
/* ------------------------------------------------------------------------- */

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

async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  bytes: ArrayBuffer,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export interface RetireResult {
  skus: number;
  retired: number;
  errors: string[];
}

/**
 * Move files the manifest does not know about into `_superseded\stale\`.
 * Guarded: a SKU with no manifest is skipped (nothing proves the file is stale).
 */
export async function retireStale(
  options: {
    root: FileSystemDirectoryHandle;
    skus?: string[];
    onProgress?: (sku: string, index: number, total: number) => void;
  },
): Promise<RetireResult> {
  const manifests = await loadManifests();
  const skus = (options.skus ?? Object.keys(manifests)).filter(Boolean);
  const result: RetireResult = { skus: 0, retired: 0, errors: [] };
  for (const [index, sku] of skus.entries()) {
    options.onProgress?.(sku, index + 1, skus.length);
    const manifest = manifests[sku];
    if (!manifest) {
      result.errors.push(`${sku}: no manifest - skipped`);
      continue;
    }
    const supplier = supplierFor(sku);
    const skuName = sku.toUpperCase();
    const skuDir = await childDir(options.root, [supplier, skuName]);
    if (!skuDir) {
      result.errors.push(`${sku}: mirror folder not found`);
      continue;
    }
    result.skus += 1;
    const known = new Set(manifest.files.map((file) => file.hash));
    const dirs = [{ handle: skuDir, label: '(flat)' }] as {
      handle: FileSystemDirectoryHandle;
      label: string;
    }[];
    const iterator = (
      skuDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
    ).values();
    for await (const entry of iterator) {
      if (entry.kind !== 'directory' || HIDDEN.has(entry.name)) continue;
      dirs.push({ handle: entry as FileSystemDirectoryHandle, label: entry.name });
    }
    for (const dir of dirs) {
      const files = (
        dir.handle as unknown as { values: () => AsyncIterable<FileSystemHandle> }
      ).values();
      for await (const file of files) {
        if (file.kind !== 'file' || !RASTER.test(file.name)) continue;
        try {
          const handle = await dir.handle.getFileHandle(file.name);
          const blob = await handle.getFile();
          const bytes = await blob.arrayBuffer();
          if (known.has(await sha256Hex(bytes))) continue;
          const target = await childDir(options.root, [supplier, skuName, '_superseded', 'stale']);
          if (!target) {
            const sup = await options.root.getDirectoryHandle(supplier);
            const skuH = await sup.getDirectoryHandle(skuName);
            const supDir = await skuH.getDirectoryHandle('_superseded', { create: true });
            await supDir.getDirectoryHandle('stale', { create: true });
          }
          const staleDir = await childDir(options.root, [supplier, skuName, '_superseded', 'stale']);
          if (!staleDir) throw new Error('cannot create _superseded/stale');
          await writeFile(staleDir, `${dir.label === '(flat)' ? '' : `${dir.label}_`}${file.name}`, bytes);
          await dir.handle.removeEntry(file.name);
          result.retired += 1;
        } catch (err) {
          result.errors.push(`${sku}/${dir.label}/${file.name}: ${(err as Error).message}`);
        }
      }
    }
  }
  return result;
}
