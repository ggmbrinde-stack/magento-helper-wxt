/**
 * Image audit — pure port of the audit pipeline's `scripts/image-audit.ps1`
 * (schema `bog-image-audit/v1`).
 *
 * Four mechanical checks, no visual judgement:
 *   1. Duplicates  — identical SHA256 across images; only groups spanning more
 *                    than one colour are flagged (same colour + different sizes
 *                    sharing bytes is normal Magento behaviour).
 *   2. Missing     — every resolver child must have at least one gallery image,
 *                    and at least two variants must carry images.
 *   3. Order       — carousel categories must be non-decreasing by position
 *                    (front -> side -> back -> box -> bag -> detail -> ambience)
 *                    and every language/child must share the reference order.
 *   4. Background  — pos0 (= lowest position, never assumed 1) must be pure
 *                    white or transparent; anything else is reported with its
 *                    sampled RGB.
 *
 * Deliberately NOT here (needs vision / a human): printing-instruction images,
 * text-on-image, model-on-simple waivers. Severity and priority are never
 * decided here.
 *
 * The module is pure: callers pass media JSON bodies, hash maps, and sampled
 * background tones. Fetching images / decoding pixels lives in `imageFetch.ts`.
 * Nothing is written to Notion or Magento.
 */

import type { ResolverJson } from './resolver';

export const IMAGE_AUDIT_SCHEMA = 'bog-image-audit/v1';
export const IMAGE_EXTS: string[] = ['.png', '.jpg', '.jpeg', '.webp'];

/** Canonical carousel rank (SYSTEM.md 1.5). */
export const CATEGORY_RANK: Record<string, number> = {
  front: 1,
  frente: 1,
  fc: 1,
  main: 1,
  fs: 2,
  s: 2,
  side: 2,
  lado: 2,
  b: 3,
  back: 3,
  costas: 3,
  box: 4,
  caixa: 4,
  bag: 5,
  saco: 5,
  det: 6,
  detail: 6,
  details: 6,
  pormenor: 6,
  pormenores: 6,
  amb: 7,
  ambiente: 7,
  ambience: 7,
};

export const RANK_NAME: Record<number, string> = {
  1: 'front',
  2: 'side',
  3: 'back',
  4: 'box',
  5: 'bag',
  6: 'detail',
  7: 'ambience',
};

export type ImageTone = 'transparent' | 'white' | 'unknown' | `rgb(${number},${number},${number})`;

export interface ImageAuditFinding {
  sku: string;
  type: string;
  notes: string;
  fix_location: string;
}

export interface ImageAuditChecks {
  duplicates: { files: number; dup_groups: number; same_color_groups: number };
  coverage?: { children: number; with_images: number; missing: number };
  order: { children: number; languages: string; violations: number; unclassified_files: number };
  background: { sampled: number; missing_files: number; offwhite: number };
}

export interface ImageAuditResult {
  schema: typeof IMAGE_AUDIT_SCHEMA;
  sku: string;
  ok: boolean;
  checks: ImageAuditChecks;
  findings: ImageAuditFinding[];
  anomalies: string[];
  error: string | null;
}

export interface MediaEntry {
  pos: number;
  /** Disk-style name: `<child>_pos<N>_<basename>.<ext>`. */
  file: string;
  isMain: boolean;
  /** Category rank, or null when unclassifiable. */
  rank: number | null;
  /** Absolute image URL (used by the fetcher; ignored by the pure checks). */
  url: string;
}

export interface MediaSource {
  /** `media_<LANG>_<child>.json`. */
  name: string;
  /** Raw body, optionally prefixed by media-map's URL:/STATUS:/LEN: header. */
  raw: string;
}

export interface ParsedMedia {
  child: string;
  lang: string;
  entries: MediaEntry[];
}

export type MediaMaps = Record<string, Record<string, MediaEntry[]>>;

export interface ImageAuditInput {
  sku: string;
  media: MediaSource[];
  /** Child id -> colour label (from resolver index + attribute 93). */
  childColor?: Record<string, string>;
  /** Children actually requested; defaults to every `childColor` key. */
  coverageChildren?: string[];
  /** hash -> image file names. Undefined = hashes not collected. */
  hashes?: Record<string, string[]>;
  /** Image names on disk, used only for the `_posN_` fallback when no media JSON. */
  imageFiles?: string[];
  /** filename -> sampled border tone. Undefined = sampling unavailable. */
  backgroundTones?: Record<string, ImageTone>;
  aliases?: Record<string, string>;
}

/* ------------------------------------------------------------------------- */
/* classifier (ported EXACTLY — order matters)                                */
/* ------------------------------------------------------------------------- */

/**
 * Filename (without extension) -> category rank, or null when unclassifiable.
 * Two dialects: letter codes (`-b`, `-s`, `-fc`, …) and numeric pairs
 * (`_1_1` front, `_2_1` back, `_7_1`/`_8_1` side, `_1_2`..`_1_9` front detail).
 */
export function getImageCategory(base: string): number | null {
  const b = base.toLowerCase();
  if (/_1_[2-9](\b|_)/.test(b)) return 6;
  if (/_2_1(\b|_)/.test(b)) return 3;
  if (/_[78]_1(\b|_)/.test(b)) return 2;
  if (/_1_1(\b|_)/.test(b)) return 1;
  // Roly view-code 3 (0304_264_3_1): model-worn detail/neck series -> detail.
  if (/_\d+_3_[12](\b|_)/.test(b)) return 6;
  // Supplier backdrop asset (R0350C) -> ambience.
  if (b.includes('magnific')) return 7;
  // Side view with extended trailing code (R0420 _221_7_120_) -> side.
  if (/_[78]_\d+(\b|_)/.test(b)) return 2;
  // Sole/bottom product view (R8306 _*_4_1) -> detail.
  if (/_4_1(\b|_)/.test(b)) return 6;
  // Single-sample clog side (R8306 Red pos7 _2_3; cf. _2_1 = back) -> side.
  if (/_2_3(\b|_)/.test(b)) return 2;
  for (const tok of b.split(/[_\-\s.]/)) {
    if (Object.prototype.hasOwnProperty.call(CATEGORY_RANK, tok)) {
      return CATEGORY_RANK[tok] ?? null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* readers                                                                    */
/* ------------------------------------------------------------------------- */

/** Parse a `hashes.sha256` body (sha256sum style) into hash -> file names. */
export function parseHashesText(text: string): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([0-9a-fA-F]{64})\s+(\S.*)$/.exec(line);
    if (!m) continue;
    const hash = (m[1] ?? '').toLowerCase();
    const file = (m[2] ?? '').trim();
    if (!file) continue;
    const ext = extOf(file);
    if (!IMAGE_EXTS.includes(ext)) continue;
    const base = baseName(file).toLowerCase();
    if (base.startsWith('strip_') || base.startsWith('zoom_') || base.startsWith('crop_')) continue;
    (map[hash] ??= []).push(file);
  }
  return map;
}

/** Parse one media JSON (with or without the capture header). */
export function readMediaSource(
  source: MediaSource,
  anomalies: string[] = [],
): ParsedMedia | null {
  const nm = /^media_([A-Za-z]{2})_(\d+)\.json$/.exec(source.name);
  if (!nm) return null;
  const lang = (nm[1] ?? '').toUpperCase();
  const child = nm[2] ?? '';
  const brace = source.raw.indexOf('{');
  if (brace < 0) {
    anomalies.push(`media json unreadable: ${source.name}`);
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(source.raw.slice(brace));
  } catch {
    anomalies.push(`media json unparsable: ${source.name}`);
    return null;
  }
  const top = asRecord(json);
  const gallery = asRecord(top?.['gallery']);
  const entries: MediaEntry[] = [];
  for (const gid of Object.keys(gallery ?? {})) {
    const item = asRecord(gallery?.[gid]);
    const url = typeof item?.['large'] === 'string' ? (item['large'] as string) : '';
    if (!url) continue;
    const raw = (url.split('/').pop() ?? '').split(/[?#]/)[0] ?? '';
    const name = decodeName(raw);
    const base = withoutExt(name);
    const ext = extOf(name) || '.jpg';
    const pos = parseIntStrict(item?.['position']);
    // Keep the real extension: the pipeline writes `<child>_pos<N>_<base>.<ext>`
    // and `hashes.sha256` refers to those on-disk names.
    const file = `${child}_pos${pos}_${base}${ext}`;
    entries.push({
      pos,
      file,
      isMain: Boolean(item?.['isMain']),
      rank: getImageCategory(base),
      url,
    });
  }
  if (entries.length === 0) {
    anomalies.push(`media json without gallery entries: ${source.name}`);
    return null;
  }
  entries.sort((a, b) => a.pos - b.pos);
  return { child, lang, entries };
}

/** Build child -> language -> position-sorted entries from media JSON files. */
export function readMediaMaps(media: MediaSource[], anomalies: string[] = []): MediaMaps {
  const maps: MediaMaps = {};
  for (const source of media) {
    const parsed = readMediaSource(source, anomalies);
    if (!parsed) continue;
    const byLang = (maps[parsed.child] ??= {});
    byLang[parsed.lang] = parsed.entries;
  }
  return maps;
}

/** Fallback grouping by `<prefix>_pos<N>_` when no media JSONs exist. */
export function buildFallbackMaps(imageFiles: string[]): MediaMaps {
  const byPrefix: Record<string, MediaEntry[]> = {};
  for (const name of imageFiles) {
    if (!IMAGE_EXTS.includes(extOf(name))) continue;
    if (/^(strip_|zoom_|crop_)/i.test(name)) continue;
    const m = /_pos(\d+)_/.exec(name);
    if (!m) continue;
    const prefix = name.slice(0, m.index);
    (byPrefix[prefix] ??= []).push({
      pos: Number.parseInt(m[1] ?? '0', 10) || 0,
      file: name,
      isMain: false,
      rank: getImageCategory(withoutExt(name)),
      url: '',
    });
  }
  const maps: MediaMaps = {};
  for (const [prefix, entries] of Object.entries(byPrefix)) {
    entries.sort((a, b) => a.pos - b.pos);
    maps[prefix] = { FN: entries };
  }
  return maps;
}

/** Build the child -> colour-label map from resolver attributes 93 + index. */
export function buildChildColorMap(
  resolver: Pick<ResolverJson, 'attributes' | 'index'>,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const option of resolver.attributes['93']?.options ?? []) {
    labels[option.id] = option.label.trim();
  }
  const out: Record<string, string> = {};
  for (const [child, attrs] of Object.entries(resolver.index)) {
    const cid = attrs['93'] ?? '';
    const label = cid ? labels[cid] : undefined;
    if (label) out[child] = label;
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* background sampling (pure pixel buffer)                                    */
/* ------------------------------------------------------------------------- */

/**
 * Edge scan (alpha-aware): transparent cutout | opaque white | real tone.
 * Mirrors Get-BackgroundTone: every 2nd pixel along all four borders, alpha
 * threshold 10, <5% opaque counts as transparent, white is >=245 per channel.
 */
export function backgroundToneFromPixels(
  width: number,
  height: number,
  data: Uint8ClampedArray | number[],
): ImageTone {
  let opaque = 0;
  let total = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const sample = (x: number, y: number): void => {
    const i = (y * width + x) * 4;
    const a = data[i + 3] ?? 0;
    total++;
    if (a > 10) {
      opaque++;
      rSum += data[i] ?? 0;
      gSum += data[i + 1] ?? 0;
      bSum += data[i + 2] ?? 0;
    }
  };
  for (let x = 0; x < width; x += 2) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += 2) {
    sample(0, y);
    sample(width - 1, y);
  }
  if (opaque === 0) return 'transparent';
  if (opaque / total < 0.05) return 'transparent';
  const r = Math.trunc(rSum / opaque);
  const g = Math.trunc(gSum / opaque);
  const b = Math.trunc(bSum / opaque);
  if (r >= 245 && g >= 245 && b >= 245) return 'white';
  return `rgb(${r},${g},${b})`;
}

/* ------------------------------------------------------------------------- */
/* audit                                                                      */
/* ------------------------------------------------------------------------- */

export function auditImages(input: ImageAuditInput): ImageAuditResult {
  const sku = input.sku.trim().toUpperCase();
  const anomalies: string[] = [];
  const findings: ImageAuditFinding[] = [];
  const childColor = input.childColor ?? {};

  // -- 1) duplicates --------------------------------------------------------
  let dupFiles = 0;
  let dupGroups = 0;
  let sameColorGroups = 0;
  if (!input.hashes) {
    anomalies.push('hashes not collected - duplicate check skipped');
  } else {
    // Detail order follows the hash map's insertion order (deterministic here).
    // PowerShell enumerates a hashtable, so its note order can differ between runs.
    const dupDetails: string[] = [];
    for (const files of Object.values(input.hashes)) {
      if (files.length === 0) continue;
      dupFiles += files.length;
      if (files.length <= 1) continue;
      const cols = uniqueSorted(
        files
          .map((file) => {
            const m = /^(\d+)_pos/.exec(file);
            return m ? (childColor[m[1] ?? ''] ?? '') : '';
          })
          .filter(Boolean),
      );
      if (cols.length > 1) {
        dupGroups++;
        const poss = uniqueSorted(
          files
            .map((file) => {
              const m = /_pos(\d+)_/.exec(file);
              return m ? (m[1] ?? '') : '';
            })
            .filter(Boolean),
        );
        dupDetails.push(
          `position ${poss.join('/')} shared by ${cols.length} colors (${cols.join(', ')})`,
        );
      } else {
        sameColorGroups++;
      }
    }
    if (dupGroups > 0) {
      findings.push({
        sku,
        type: 'Duplicate image',
        notes:
          'Same photo reused across colors: ' +
          shownList(dupDetails, 3) +
          ' // Fix: keep one image per color, remove or replace the rest in the carousel',
        fix_location: 'Simple',
      });
    }
  }

  // -- carousel maps (checks 2 and 3) --------------------------------------
  const maps = readMediaMaps(input.media, anomalies);
  let usedFallback = false;
  if (Object.keys(maps).length === 0) {
    const fallback = buildFallbackMaps(input.imageFiles ?? []);
    for (const [prefix, byLang] of Object.entries(fallback)) maps[prefix] = byLang;
    if (Object.keys(fallback).length > 0) {
      usedFallback = true;
      anomalies.push(
        `no media jsons - using _posN_ filename order (${Object.keys(fallback).length} groups)`,
      );
    }
  }
  const children = Object.keys(maps).sort();
  const languages: string[] = [];
  for (const child of children) {
    for (const lang of Object.keys(maps[child] ?? {})) {
      if (!languages.includes(lang)) languages.push(lang);
    }
  }

  // -- 1b) coverage: every child needs an image; 2 variants minimum ---------
  const expectedChildren = (input.coverageChildren ?? Object.keys(childColor)).sort();
  let coverage: ImageAuditChecks['coverage'];
  if (expectedChildren.length > 0 && children.length > 0 && !usedFallback) {
    const missingChildren = expectedChildren.filter((child) => !maps[child]);
    const withImages = expectedChildren.length - missingChildren.length;
    coverage = {
      children: expectedChildren.length,
      with_images: withImages,
      missing: missingChildren.length,
    };
    const problems: string[] = [];
    if (missingChildren.length > 0) {
      const shown = shownListComma(
        missingChildren.map((child) => {
          const label = (childColor[child] ?? '').trim();
          return label ? `${label} (${child})` : child;
        }),
        5,
      );
      problems.push(`children without any gallery image: ${shown}`);
    }
    if (expectedChildren.length >= 2 && withImages < 2) {
      problems.push(
        `only ${withImages} of ${expectedChildren.length} variants have images (minimum 2)`,
      );
    }
    if (problems.length > 0) {
      findings.push({
        sku,
        type: 'Missing image',
        notes:
          `${problems.join('; ')} // Fix: upload at least one product image for ` +
          'each colour (2 variants minimum)',
        fix_location: 'Simple',
      });
    }
  } else if (expectedChildren.length > 0 && children.length === 0) {
    anomalies.push('no carousel map - missing-image check skipped');
  }

  // -- 2) image order -------------------------------------------------------
  const orderViolations: string[] = [];
  let unclassified = 0;
  for (const child of children) {
    const byLang = maps[child] ?? {};
    const langs = Object.keys(byLang).sort();
    let ref = langs[0] ?? '';
    if (langs.includes('EN')) ref = 'EN';
    const seq = byLang[ref] ?? [];
    let prevRank = 0;
    let prevCat = '';
    let prevPos = 0;
    let violated = false;
    for (const entry of seq) {
      if (violated) break;
      let rank = entry.rank;
      if (rank === null) {
        if (entry.isMain) rank = 1;
        else {
          unclassified++;
          continue;
        }
      }
      if (rank < prevRank) {
        orderViolations.push(
          `child ${child} (${ref}): ${RANK_NAME[rank]} view at position ${entry.pos} ` +
            `comes after ${prevCat} at position ${prevPos} // Fix: move the ` +
            `${RANK_NAME[rank]} view ahead of the ${prevCat} view (carousel order: ` +
            `front -> side -> back -> box -> bag -> detail -> ambience)`,
        );
        violated = true;
      } else {
        prevRank = rank;
        prevCat = RANK_NAME[rank] ?? '';
        prevPos = entry.pos;
      }
    }
    if (langs.length > 1) {
      const refSeq = seq.map((e) => e.file).join(',');
      for (const other of langs) {
        if (other === ref) continue;
        const otherSeq = (byLang[other] ?? []).map((e) => e.file).join(',');
        if (otherSeq !== refSeq) {
          orderViolations.push(
            `child ${child}: ${other} carousel order differs from ${ref} // Fix: align ` +
              `the ${other} carousel to the ${ref} order`,
          );
        }
      }
    }
  }
  if (unclassified > 0) {
    anomalies.push(
      `${unclassified} file(s) unclassifiable - order verdict covers classified files only`,
    );
  }
  if (orderViolations.length > 0) {
    const grouped = groupOrderViolations(orderViolations);
    findings.push({
      sku,
      type: 'Wrong image order',
      notes: shownList(grouped, 3),
      fix_location: 'Simple',
    });
  }

  // -- 3) background: pos0 of every variant must be white/transparent ------
  const pos0: string[] = [];
  for (const child of children) {
    const byLang = maps[child] ?? {};
    const langs = Object.keys(byLang).sort();
    let ref = langs[0] ?? '';
    if (langs.includes('EN')) ref = 'EN';
    const first = (byLang[ref] ?? [])[0];
    if (first && !pos0.includes(first.file)) pos0.push(first.file);
  }

  let bgSampled = 0;
  let bgMissing = 0;
  const offWhite: string[] = [];
  if (pos0.length === 0) {
    anomalies.push('no carousel map (media jsons or _posN_ filenames) - background check skipped');
  } else if (!input.backgroundTones) {
    anomalies.push('image sampling unavailable - background check skipped');
  } else {
    for (const file of pos0) {
      const tone = input.backgroundTones[file];
      if (!tone) {
        bgMissing++;
        continue;
      }
      bgSampled++;
      if (tone !== 'white' && tone !== 'transparent' && tone !== 'unknown') {
        let who = file;
        const bm = /^(\d+)_pos(\d+)_/.exec(file);
        if (bm) {
          const cc = childColor[bm[1] ?? ''] ? `${childColor[bm[1] ?? '']} ` : '';
          who = `${cc}position ${bm[2] ?? ''}`;
        }
        offWhite.push(`${who} (${tone})`);
      }
    }
    if (bgMissing > 0) {
      anomalies.push(`${bgMissing} pos0 file(s) referenced but not sampled`);
    }
    if (offWhite.length > 0) {
      findings.push({
        sku,
        type: 'Grey background',
        notes:
          'Main images with non-white background: ' +
          shownList(offWhite, 3) +
          ' // Fix: replace with pure-white-background versions',
        fix_location: 'Simple',
      });
    }
  }

  return {
    schema: IMAGE_AUDIT_SCHEMA,
    sku,
    ok: true,
    checks: {
      duplicates: { files: dupFiles, dup_groups: dupGroups, same_color_groups: sameColorGroups },
      coverage,
      order: {
        children: children.length,
        languages: languages.join('/'),
        violations: orderViolations.length,
        unclassified_files: unclassified,
      },
      background: { sampled: bgSampled, missing_files: bgMissing, offwhite: offWhite.length },
    },
    findings,
    anomalies,
    error: null,
  };
}

/**
 * Collapse identical per-child order violations into one line (same language +
 * same description); children are listed once. Non-matching lines pass through.
 */
export function groupOrderViolations(violations: string[]): string[] {
  const buckets = new Map<string, { lang: string; text: string; kids: string[] }>();
  const passthrough: string[] = [];
  for (const v of violations) {
    const m = /^child (\d+) \(([A-Za-z]{2})\): (.*)$/.exec(v);
    if (!m) {
      passthrough.push(v);
      continue;
    }
    const lang = m[2] ?? '';
    const text = m[3] ?? '';
    const key = `${lang}|${text}`;
    const bucket = buckets.get(key) ?? { lang, text, kids: [] };
    bucket.kids.push(m[1] ?? '');
    buckets.set(key, bucket);
  }
  const grouped: string[] = [];
  for (const key of [...buckets.keys()].sort()) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const kids = [...bucket.kids].sort();
    const who =
      kids.length === 1
        ? `child ${kids[0]}`
        : `all ${kids.length} children (${shownListComma(kids, 5)})`;
    grouped.push(`${who} (${bucket.lang}): ${bucket.text}`);
  }
  return [...grouped, ...passthrough];
}

/* ------------------------------------------------------------------------- */
/* markdown block (feeds the Slice-2 payload builder)                         */
/* ------------------------------------------------------------------------- */

export function buildImageAuditBlock(result: ImageAuditResult, now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}`;
  const { duplicates: dup, coverage: cov, order, background: bg } = result.checks;
  const coverageText = cov
    ? ` | coverage (${cov.children} children, ${cov.with_images} with images, ${cov.missing} missing)`
    : '';
  const lines: string[] = [];
  lines.push('<!-- image-audit:begin (generated by BOG Helper; do not hand-edit this block) -->');
  lines.push(`## Image audit - ${stamp}`);
  lines.push('');
  lines.push(
    `- Checks: duplicates sha256 (${dup.files} files, ${dup.dup_groups} cross-color dup groups, ` +
      `${dup.same_color_groups} same-color shared [normal, not flagged])${coverageText} | order ` +
      `(${order.children} children, langs ${order.languages || '-'}) | background pos0 ` +
      `(${bg.sampled} sampled, ${bg.offwhite} off-white)`,
  );
  lines.push('- Source: live storefront media (EN/ES/FR)');
  lines.push(
    `- Findings: ${result.findings.length} (fix location suggested; severity/priority is set downstream, never here)`,
  );
  lines.push('');
  if (result.findings.length === 0) {
    lines.push('- No mechanical findings.');
  } else {
    lines.push('| SKU | Error Type | Notes | Fix Location |');
    lines.push('|---|---|---|---|');
    for (const f of result.findings) {
      lines.push(
        `| ${f.sku} | ${f.type} | ${f.notes.replace(/\|/g, '/')} | ${f.fix_location} |`,
      );
    }
  }
  if (result.anomalies.length > 0) {
    lines.push('');
    lines.push(`- ANOMALIES (exit 3): ${result.anomalies.join('; ')}`);
  }
  lines.push('<!-- image-audit:end -->');
  return lines.join('\n');
}

/* ------------------------------------------------------------------------- */
/* helpers                                                                    */
/* ------------------------------------------------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseIntStrict(value: unknown): number {
  const text = value === null || value === undefined ? '' : String(value);
  return /^-?\d+$/.test(text) ? Number.parseInt(text, 10) : 0;
}

function decodeName(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function withoutExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function extOf(path: string): string {
  const base = baseName(path);
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i).toLowerCase() : '';
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function shownList(items: string[], limit: number): string {
  const shown = items.slice(0, limit).join('; ');
  return items.length > limit ? `${shown} (+${items.length - limit} more)` : shown;
}

function shownListComma(items: string[], limit: number): string {
  const shown = items.slice(0, limit).join(', ');
  return items.length > limit ? `${shown} (+${items.length - limit} more)` : shown;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
