/**
 * Image audit â€” live collection layer.
 *
 * Fetches the storefront media endpoint for every child Ã— language, optionally
 * hashes the images (SHA-256) and samples the pos0 border tone (alpha-aware, via
 * OffscreenCanvas). Then hands everything to the pure engine in `imageAudit.ts`.
 *
 * This intentionally does NOT read local evidence folders; folder layout is
 * still to be decided. Host permissions cover bestofgifts.eu / .es / .fr.
 */

import type { ResolverJson } from './resolver';
import {
  IMAGE_AUDIT_SCHEMA,
  auditImages,
  backgroundToneFromPixels,
  buildChildColorMap,
  buildImageAuditBlock,
  readMediaSource,
  type ImageAuditResult,
  type ImageTone,
  type MediaSource,
} from './imageAudit';

export const MEDIA_ORIGINS: Record<string, string> = {
  EN: 'https://bestofgifts.eu',
  ES: 'https://bestofgifts.es',
  FR: 'https://bestofgifts.fr',
};

const DEFAULT_LANGS = ['EN', 'ES', 'FR'];

export interface ImageAuditFetchOptions {
  langs?: string[];
  maxChildren?: number;
  hashImages?: boolean;
  background?: boolean;
  /** Cap on unique image downloads (safety valve for large matrices). */
  maxImages?: number;
}

export interface ImageAuditCollection {
  media: MediaSource[];
  /** Children actually requested (may be capped by `maxChildren`). */
  children: string[];
  /** Image URL -> every `<child>_pos<N>_<basename>.<ext>` name that references it. */
  files: Record<string, string[]>;
  hashes?: Record<string, string[]>;
  backgroundTones?: Record<string, ImageTone>;
  anomalies: string[];
  stats: { mediaFiles: number; imagesDownloaded: number; imagesSkipped: number };
}

export interface ImageAuditRun {
  audit: ImageAuditResult;
  mdBlock: string;
  collection: ImageAuditCollection;
}

/** Fetch media maps (+ optional hashes/tones) and run the mechanical checks. */
export async function imageAuditForSku(
  resolver: ResolverJson,
  opts: ImageAuditFetchOptions = {},
): Promise<ImageAuditRun> {
  const collection = await collectImageAuditData(resolver, opts);
  const audit = auditImages({
    sku: resolver.sku,
    media: collection.media,
    childColor: buildChildColorMap(resolver),
    coverageChildren: collection.children,
    hashes: collection.hashes,
    backgroundTones: collection.backgroundTones,
  });
  audit.anomalies.push(...collection.anomalies);
  return { audit, mdBlock: buildImageAuditBlock(audit), collection };
}

export async function collectImageAuditData(
  resolver: ResolverJson,
  opts: ImageAuditFetchOptions = {},
): Promise<ImageAuditCollection> {
  const anomalies: string[] = [];
  const stats = { mediaFiles: 0, imagesDownloaded: 0, imagesSkipped: 0 };
  const langs = (opts.langs?.length ? opts.langs : DEFAULT_LANGS)
    .map((l) => l.trim().toUpperCase())
    .filter(Boolean);
  const children = resolver.children.length
    ? [...resolver.children]
    : resolver.simple_product_id
      ? [String(resolver.simple_product_id)]
      : [];
  const maxChildren = opts.maxChildren ?? 120;
  const usedChildren = children.slice(0, maxChildren);
  if (children.length > usedChildren.length) {
    anomalies.push(`child list truncated to ${maxChildren} of ${children.length}`);
  }

  const origins = resolveOrigins(resolver);
  const media: MediaSource[] = [];

  const fetched = await mapPool(
    usedChildren.flatMap((child) => langs.map((lang) => ({ child, lang }))),
    6,
    async ({ child, lang }) => {
      const origin = origins[lang] ?? origins['EN'] ?? MEDIA_ORIGINS['EN'];
      const url = `${origin}/swatches/ajax/media/?product_id=${encodeURIComponent(child)}`;
      try {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) {
          anomalies.push(`media ${lang} ${child}: HTTP ${res.status}`);
          return null;
        }
        const raw = await res.text();
        return { name: `media_${lang}_${child}.json`, raw } satisfies MediaSource;
      } catch (err) {
        anomalies.push(`media ${lang} ${child}: ${messageOf(err)}`);
        return null;
      }
    },
  );
  for (const source of fetched) {
    if (source) {
      media.push(source);
      stats.mediaFiles++;
    }
  }

  const parsed = media
    .map((source) => readMediaSource(source, anomalies))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // URL -> every file name that references it; pos0 URL -> file names.
  const urlFiles = new Map<string, string[]>();
  const pos0Urls = new Map<string, string[]>();
  const byChild = new Map<string, typeof parsed>();
  for (const p of parsed) {
    const group = byChild.get(p.child) ?? [];
    group.push(p);
    byChild.set(p.child, group);
    for (const entry of p.entries) {
      const files = urlFiles.get(entry.url) ?? [];
      files.push(entry.file);
      urlFiles.set(entry.url, files);
    }
  }
  for (const group of byChild.values()) {
    const groupLangs = group.map((g) => g.lang).sort();
    const ref = groupLangs.includes('EN') ? 'EN' : (groupLangs[0] ?? '');
    const first = group.find((g) => g.lang === ref)?.entries[0];
    if (!first) continue;
    const files = pos0Urls.get(first.url) ?? [];
    if (!files.includes(first.file)) files.push(first.file);
    pos0Urls.set(first.url, files);
  }

  const wanted = new Set<string>();
  if (opts.hashImages) for (const url of urlFiles.keys()) wanted.add(url);
  if (opts.background !== false) for (const url of pos0Urls.keys()) wanted.add(url);

  const maxImages = opts.maxImages ?? 800;
  const queue = [...wanted].slice(0, maxImages);
  if (wanted.size > queue.length) {
    anomalies.push(`image download capped at ${maxImages} of ${wanted.size} unique URLs`);
  }

  const hashes: Record<string, string[]> | undefined = opts.hashImages ? {} : undefined;
  const tones: Record<string, ImageTone> = {};
  const samples = await mapPool(queue, 4, async (url) => {
    const mime = mimeFor(url);
    let bytes: ArrayBuffer;
    try {
      bytes = await fetchBytes(url);
      stats.imagesDownloaded++;
    } catch (err) {
      stats.imagesSkipped++;
      anomalies.push(`image fetch failed: ${baseName(url)} (${messageOf(err)})`);
      return null;
    }
    let hash = '';
    if (hashes) {
      try {
        hash = await sha256Hex(bytes);
      } catch (err) {
        anomalies.push(`image hash failed: ${baseName(url)} (${messageOf(err)})`);
      }
    }
    let tone: ImageTone | null = null;
    if (pos0Urls.has(url)) {
      try {
        tone = await toneFromBytes(bytes, mime);
      } catch (err) {
        anomalies.push(`background sample failed: ${baseName(url)} (${messageOf(err)})`);
      }
    }
    return { url, hash, tone };
  });
  for (const sample of samples) {
    if (!sample) continue;
    if (hashes && sample.hash) {
      for (const file of urlFiles.get(sample.url) ?? []) {
        (hashes[sample.hash] ??= []).push(file);
      }
    }
    if (sample.tone) {
      for (const file of pos0Urls.get(sample.url) ?? []) tones[file] = sample.tone;
    }
  }

  return {
    media,
    children: usedChildren,
    files: Object.fromEntries(urlFiles),
    hashes,
    backgroundTones: opts.background === false ? undefined : tones,
    anomalies,
    stats,
  };
}

/* ------------------------------------------------------------------------- */
/* network + pixel helpers                                                    */
/* ------------------------------------------------------------------------- */

function resolveOrigins(resolver: ResolverJson): Record<string, string> {
  const store = resolver.store_urls ?? {};
  return {
    EN: originOf(resolver.frontend_url, MEDIA_ORIGINS['EN'] ?? 'https://bestofgifts.eu'),
    ES: originOf(
      store['es'] ?? store['ES'],
      MEDIA_ORIGINS['ES'] ?? 'https://bestofgifts.es',
    ),
    FR: originOf(
      store['fr'] ?? store['FR'],
      MEDIA_ORIGINS['FR'] ?? 'https://bestofgifts.fr',
    ),
  };
}

function originOf(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    return new URL(url).origin;
  } catch {
    return fallback;
  }
}

export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Magento serves square-cropped renditions from `/cache/<32hex>/...`; the same
 * path without that segment is the supplier's original (e.g. 600x750). The
 * audit pipeline always prefers the original and falls back to the cache URL.
 */
export function originalImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const index = parts.findIndex((part) => part === 'cache');
    const profile = parts[index + 1] ?? '';
    if (index >= 0 && /^[0-9a-f]{32}$/i.test(profile)) {
      parts.splice(index, 2);
      parsed.pathname = parts.join('/');
      return parsed.toString();
    }
  } catch {
    /* keep the input */
  }
  return url;
}

/** Original first, cache rendition as fallback. */
export async function fetchOriginalBytes(url: string): Promise<ArrayBuffer> {
  const original = originalImageUrl(url);
  if (original !== url) {
    try {
      return await fetchBytes(original);
    } catch {
      /* fall through to the cache URL */
    }
  }
  return fetchBytes(url);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (const byte of view) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

async function toneFromBytes(bytes: ArrayBuffer, mime: string): Promise<ImageTone> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return backgroundToneFromPixels(image.width, image.height, image.data);
  } finally {
    bitmap.close();
  }
}

function mimeFor(url: string): string {
  const path = url.split('?')[0] ?? '';
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function baseName(url: string): string {
  const path = url.split('?')[0] ?? '';
  return path.split('/').pop() ?? path;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Run `fn` over `items` with a fixed concurrency, preserving order. */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Re-exported so callers can type the envelope without a second import. */
export { IMAGE_AUDIT_SCHEMA };

