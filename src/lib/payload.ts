/**
 * Payload builder — audit findings -> Notion Listing Errors payloads.
 *
 * Faithful port of the audit pipeline's `scripts/listing-errors.ps1`
 * (schema `bog-listing-errors/v1`). Merges the dossier's `<!-- image-audit -->`
 * and `<!-- text-audit -->` marker blocks (plus variant gaps) into one payload
 * per finding. Never calls Notion and never decides the error flag; severity is
 * the automatic tier from `priorityFor` (board decision 2026-10-20). It emits
 * candidates + review flags.
 *
 * Do-not-change (doc 09/11): payload field names, the em-dash title form, and
 * the `dedup_key = "<SKU>|<title>"` form must match the PowerShell output so
 * dedup continuity with existing rows is preserved.
 */

import { supplierFor } from './resolver';
import {
  CATEGORY_OPTIONS,
  SUBCATEGORY_OPTIONS,
  canonicalSupplier,
} from './notionContract';

export { CATEGORY_OPTIONS, SUBCATEGORY_OPTIONS };

export const PAYLOAD_SCHEMA = 'bog-listing-errors/v1';

export const EM_DASH = '\u2014';

/* ---- enums (SYSTEM.md section 2) ---------------------------------------- */

export const FIX_ENUM = ['Configurable', 'Simple'] as const;
export const PRIORITY_ENUM = ['High', 'Medium', 'Low'] as const;

/**
 * Automatic priority tier (board decision 2026-10-20). The dossiers never carry
 * a priority, so the payload builder assigns one from the error group/type:
 *   High   - missing image, wrong category, wrong product information,
 *            untranslated name/description;
 *   Medium - the other image findings (order, duplicate, grey background,
 *            model image on a simple product);
 *   Low    - text/formatting findings (brackets, separators, composition, …).
 */
export function priorityFor(group: string, type: string): (typeof PRIORITY_ENUM)[number] {
  const g = group.trim().toLowerCase();
  const t = type.trim().toLowerCase();
  if (g === 'category' || g === 'product information') return 'High';
  if (g === 'images') {
    return /missing image|no image/.test(t) ? 'High' : 'Medium';
  }
  if (g === 'text / translation') {
    return /untranslated|wrong language|translation/.test(t) ? 'High' : 'Low';
  }
  return 'Low';
}

const GROUP_MAP: Record<string, string> = {
  images: 'Images',
  text: 'Text / Translation',
  'text / translation': 'Text / Translation',
  'product information': 'Product Information',
  category: 'Category',
  other: 'Other',
};

const GROUP_SHORT: Record<string, string> = {
  Images: 'Images',
  'Text / Translation': 'Text',
  'Product Information': 'Product Information',
  Category: 'Category',
  Other: 'Other',
};

/** Field (Notion) for text findings, 1:1 with Magento attributes. */
const FIELD_BY_KEYWORD: [string, string][] = [
  ['name', 'name'],
  ['gender', 'gender'],
  ['composition', 'composition'],
  ['dimension', 'dimensions'],
  ['brand', 'brand'],
  ['country', 'country'],
  ['short description', 'short_description'],
];
const FIELD_DESCRIPTION_KEYS = ['description', 'details', 'gorro', 'gorra'];

/** Known error types (normalized). Anything else passes, flagged unknown. */
export const KNOWN_TYPES = [
  'wrong image order',
  'grey background',
  'duplicate image',
  'missing image',
  'remove model image',
  'printing instruction sheet',
  'text on image',
  'model image on simple',
  'translation error',
  'wrong product information',
  'composition en untranslated',
  'composition es untranslated',
  'composition fr untranslated',
  'composition omits recycled',
  'brand json-ld conflict',
  'details es wrong word',
  'incomplete variant matrix',
  'incomplete size run (edge sizes)',
  'dimensions brackets',
  'gender untranslated',
  'name mismatch',
];

export const VARIANT_EDGE_SIZES = ['XS', '4XL', '5XL'];

/* ---- types -------------------------------------------------------------- */

/** One finding as read from a marker block or legacy bullet. */
export interface Finding {
  sku: string;
  groupLabel: string;
  type: string;
  notes: string;
  fixLocation: string | null;
  priority: string | null;
  badMeta: string | null;
  sourceHint: string;
  statusHint: string;
  flagHint: string;
}

/** One Notion-ready payload (snake_case names are contract — do not rename). */
export interface ListingErrorPayload {
  dedup_key: string;
  sku: string;
  title: string;
  group: string;
  type: string;
  fix_location: string | null;
  priority: string | null;
  status: string;
  flag: string;
  link: string | null;
  notes: string;
  fix: string;
  notes_full: string;
  source: string;
  supplier: string;
  category: string | null;
  subcategory: string | null;
  language: string;
  field: string | null;
  page_content: string;
  review_flags: string[];
}

export interface Breadcrumbs {
  l1: string;
  l2: string;
  l3: string;
  ok: boolean;
  error: string;
}

export interface PayloadBuild {
  schema: typeof PAYLOAD_SCHEMA;
  sku: string;
  ok: boolean;
  src_fmt: 'markers' | 'legacy';
  payloads: ListingErrorPayload[];
  anomalies: string[];
  error?: string;
}

/* ---- low-level helpers -------------------------------------------------- */

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Body of a `<!-- name:begin --> … <!-- name:end -->` marker block, or null. */
export function getMarkerBody(content: string, name: string): string | null {
  const re = new RegExp(
    `<!--\\s*${escapeRe(name)}:begin.*?-->(?<body>[\\s\\S]*?)<!--\\s*${escapeRe(name)}:end\\s*-->`,
  );
  const m = re.exec(content);
  return m?.groups?.body ?? null;
}

/** Pipe-table rows ("| a | b |"), bullet-pipe rows ("- a | b"), bare rows. */
export function getPipeRows(body: string): string[][] {
  const rows: string[][] = [];
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    let cells: string | null = null;
    let m = /^\|(.+)\|$/.exec(t);
    if (m) cells = m[1] ?? null;
    else {
      m = /^-\s+(.+\|.+)$/.exec(t);
      if (m) cells = m[1] ?? null;
      else {
        m = /^([A-Za-z0-9][^|]*\|.+\|.+\s*)$/.exec(t);
        if (m) cells = m[1] ?? null;
      }
    }
    if (cells === null) continue;
    const parts = cells.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;
    if (/^:?-+:?$/.test(parts[0] ?? '')) continue; // markdown separator row
    if ((parts[0] ?? '').toLowerCase() === 'sku') continue; // header row
    if (!parts[0]) continue;
    rows.push(parts);
  }
  return rows;
}

/** Findings from the image/text marker blocks (SYSTEM.md section 6 layout). */
export function readMarkerRows(content: string): Finding[] {
  const rows: Finding[] = [];
  const img = getMarkerBody(content, 'image-audit');
  if (img !== null) {
    for (const cells of getPipeRows(img)) {
      if (cells.length < 4) continue;
      rows.push({
        sku: (cells[0] ?? '').toUpperCase(),
        groupLabel: 'Images',
        type: cells[1] ?? '',
        notes: cells[2] ?? '',
        fixLocation: cells[3] ?? '',
        priority: null, // image rows carry no severity -> flagged
        badMeta: null,
        sourceHint: 'images',
        statusHint: 'To Fix',
        flagHint: 'Normal',
      });
    }
  }
  const txt = getMarkerBody(content, 'text-audit');
  if (txt !== null) {
    for (const cells of getPipeRows(txt)) {
      if (cells.length < 4) continue;
      let notes = cells.slice(3).filter((c) => c != null).join(' | ');
      if (cells[1]) notes = `${cells[1]}: ${notes}`; // field = the "where"
      rows.push({
        sku: (cells[0] ?? '').toUpperCase(),
        groupLabel: 'Text / Translation',
        type: cells[2] ?? '',
        notes,
        fixLocation: null,
        priority: null,
        badMeta: null,
        sourceHint: 'text',
        statusHint: 'To Fix',
        flagHint: 'Normal',
      });
    }
  }
  return rows;
}

/**
 * Legacy bullets: "- <SKU> — <Group> — <Type> [<Fix>, ]<Priority>".
 * The section header may carry defaults: "(all To Fix / Normal, 2026-09-22)".
 */
export function readLegacyRows(content: string): Finding[] | null {
  const section = /^##\s+Notion Listing Errors rows(?<hdr>[^\r\n]*)\r?\n(?<body>[\s\S]*?)(?=^##\s|^<!--|(?![^]))/m.exec(
    content,
  );
  if (!section) return null;
  let defaultStatus = 'To Fix';
  let defaultFlag = 'Normal';
  const hm = /all\s+(?<status>[A-Za-z][A-Za-z ]*?)\s*\/\s*(?<flag>[A-Za-z]+)/.exec(
    section.groups?.hdr ?? '',
  );
  if (hm?.groups) {
    defaultStatus = hm.groups.status?.trim() || defaultStatus;
    defaultFlag = hm.groups.flag?.trim() || defaultFlag;
  }
  const rows: Finding[] = [];
  const pattern = new RegExp(
    '^\\s*-\\s+(?<sku>[A-Za-z0-9]+)\\s+\u2014\\s+(?<group>[^\u2014]+?)\\s+\u2014\\s+(?<type>[^\\[\u2014]+?)\\s*(?:\\[(?<meta>[^\\]]*)\\])?\\s*$',
  );
  for (const line of (section.groups?.body ?? '').split(/\r?\n/)) {
    const lm = pattern.exec(line);
    if (!lm?.groups) continue;
    let fixLoc: string | null = null;
    let prio: string | null = null;
    let badMeta: string | null = null;
    const meta = lm.groups.meta ?? '';
    if (meta) {
      for (const rawTok of meta.split(',')) {
        const tok = rawTok.trim();
        if (!tok) continue;
        const canonFix = FIX_ENUM.find((v) => v.toLowerCase() === tok.toLowerCase());
        const canonPrio = PRIORITY_ENUM.find((v) => v.toLowerCase() === tok.toLowerCase());
        if (canonFix) fixLoc = canonFix;
        else if (canonPrio) prio = canonPrio;
        else badMeta = tok;
      }
    }
    rows.push({
      sku: (lm.groups.sku ?? '').trim().toUpperCase(),
      groupLabel: (lm.groups.group ?? '').trim(),
      type: (lm.groups.type ?? '').trim(),
      notes: '',
      fixLocation: fixLoc,
      priority: prio,
      badMeta,
      sourceHint: 'legacy',
      statusHint: defaultStatus,
      flagHint: defaultFlag,
    });
  }
  return rows;
}

export interface VariantGapResult {
  row: Finding | null;
  count: number;
  anomalies: string[];
}

/** Variant-matrix gaps (variants block) -> ONE extra payload. */
export function readVariantGapRow(content: string, skuId: string): VariantGapResult {
  const anomalies: string[] = [];
  const none: VariantGapResult = { row: null, count: 0, anomalies: [] };
  const body = getMarkerBody(content, 'variants');
  if (body === null) return none;
  const m = /^\s*-\s*Missing combos:\s*(.+?)\s*$/m.exec(body);
  if (!m) return none;
  const raw = (m[1] ?? '').trim();
  if (/^none\b/.test(raw)) return none;
  if (/resolved[\s\S]{0,150}intentional/i.test(content)) {
    anomalies.push(
      'variant gap previously resolved as intentional - skipped (see dossier; R6414 precedent)',
    );
    return { row: null, count: 0, anomalies };
  }
  let items = raw.split(',').map((s) => s.trim()).filter((s) => s);
  if (items.length > 0) items[0] = (items[0] ?? '').replace(/^\d+\s*-\s*/, '');
  items = items.filter((s) => s);
  if (items.length === 0) return none;
  let edgeOnly = true;
  for (const it of items) {
    const seg = it.split('/');
    const sz = (seg[seg.length - 1] ?? '').trim().toUpperCase();
    if (!VARIANT_EDGE_SIZES.includes(sz)) {
      edgeOnly = false;
      break;
    }
  }
  const type = edgeOnly ? 'incomplete size run (edge sizes)' : 'incomplete variant matrix';
  const tm = /Total:\s*\d+\s*\((\d+)x(\d+)\)/.exec(body);
  const dims = tm ? `${tm[1]}x${tm[2]}` : '';
  const shown = items.slice(0, 3).join(', ');
  const notes = `Variant matrix ${dims} is short ${items.length} combinations: ${shown} // Fix: add the missing variants in Magento admin, or confirm intentional (then no row is needed)`;
  return {
    row: {
      sku: skuId,
      groupLabel: 'Product Information',
      type,
      notes,
      fixLocation: 'Configurable',
      priority: null,
      badMeta: null,
      sourceHint: 'variants',
      statusHint: 'To Fix',
      flagHint: 'Normal',
    },
    count: items.length,
    anomalies: [],
  };
}

/** EN storefront breadcrumbs -> Category L1 / Subcategory L2 / Detail L3. */
export function extractBreadcrumbs(html: string): Breadcrumbs {
  const res: Breadcrumbs = { l1: '', l2: '', l3: '', ok: false, error: '' };
  let m = /"categories":\[(.*?)\]\}/.exec(html);
  if (!m) m = /"categories":\[(.*?)\]/.exec(html);
  if (!m) {
    res.error = 'no categories marker';
    return res;
  }
  const titles = [...(m[1] ?? '').matchAll(/"title":"([^"]+)"/g)].map((x) => x[1] ?? '');
  if (titles.length === 0) {
    res.error = 'categories empty';
    return res;
  }
  res.l1 = titles[0] ?? '';
  if (titles.length > 1) res.l2 = titles[1] ?? '';
  if (titles.length > 2) res.l3 = titles[2] ?? '';
  res.ok = true;
  return res;
}

/* ---- payload helpers ---------------------------------------------------- */

/** Notes -> single line <= 1000 chars; shape issues are flagged, never fixed. */
export function compressNotes(notes: string): { text: string; flags: string[] } {
  const flags: string[] = [];
  if (!notes || !notes.trim()) return { text: '', flags: ['notes-missing'] };
  let n = notes.replace(/\s+/g, ' ').trim();
  if (n.length > 1000) {
    let cut = n.slice(0, 999);
    const sp = cut.lastIndexOf(' ');
    if (sp > 900) cut = cut.slice(0, sp);
    n = `${cut.trimEnd()}...`;
    flags.push('notes-condensed-1000');
  }
  const arrow = '\u2192';
  const shapeOk =
    n.includes(':') &&
    (n.includes(arrow) ||
      n.includes('->') ||
      /Fix [A-Z]{2}:/.test(n) ||
      n.includes('Fix: human') ||
      n.includes('Fix withheld') ||
      n.includes('// Fix:'));
  if (!shapeOk) flags.push('notes-shape-review');
  return { text: n, flags };
}

const FIX_MARKERS = [/\/\/\s*Fix:/, /Fix [A-Z]{2}:/, /\bFix: human/, /\bFix withheld/];

function hasFixMarker(s: string): boolean {
  return FIX_MARKERS.some((re) => re.test(s));
}

/** Split compressed notes into display Notes + Fix column text (first marker wins). */
export function splitNotesFix(text: string): { notes: string; fix: string } {
  const t = text.trim();
  const segs = t.split('; ');
  const marked = segs.filter(hasFixMarker);
  if (marked.length >= 2) {
    const notesPool: string[] = [];
    const fixPool: string[] = [];
    for (const sg of segs) {
      if (hasFixMarker(sg)) {
        let m: RegExpExecArray | null = null;
        for (const pat of FIX_MARKERS) {
          m = pat.exec(sg);
          if (m) break;
        }
        const idx = m?.index ?? 0;
        const pre = sg.slice(0, idx).replace(/[ |/\-;]+$/, '');
        if (pre) notesPool.push(pre);
        const fx = sg.slice(idx).trim().replace(/^\/\/\s*/, '');
        if (fx && !fixPool.includes(fx)) fixPool.push(fx);
      } else {
        notesPool.push(sg.trim());
      }
    }
    return { notes: notesPool.join('; '), fix: fixPool.join('; ') };
  }
  for (const pat of FIX_MARKERS) {
    const m = pat.exec(t);
    if (m) {
      const notes = t.slice(0, m.index).replace(/[ |/\-;]+$/, '').trim();
      const fix = t.slice(m.index).trim().replace(/^\/\/\s*/, '');
      return { notes, fix };
    }
  }
  return { notes: t, fix: '' };
}

/** Case-insensitive compare key; trailing "(qualifier)" is ignored for matching. */
export function normalizeType(type: string): string {
  return type
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/* ---- per-SKU conversion ------------------------------------------------- */

export interface BuildContext {
  link: string | null;
  supplier: string;
  breadcrumbs: Breadcrumbs;
  /** Where text findings are fixed (the audited product, not a variant). */
  defaultFixLocation?: string;
}

/** Build payloads from an explicit finding list (future audit stages feed this). */
export function buildPayloads(
  skuId: string,
  findings: Finding[],
  ctx: BuildContext,
): { payloads: ListingErrorPayload[]; anomalies: string[] } {
  const anomalies: string[] = [];
  const payloads: ListingErrorPayload[] = [];
  const seen: Record<string, true> = {};

  // breadcrumb category / subcategory (blank + anomaly when unmapped)
  let category: string | null = null;
  let subcategory: string | null = null;
  if (ctx.breadcrumbs.ok) {
    const cm = CATEGORY_OPTIONS.find(
      (o) => o.toLowerCase() === ctx.breadcrumbs.l1.toLowerCase(),
    );
    if (cm) category = cm;
    else
      anomalies.push(
        `category-unmapped breadcrumb L1 "${ctx.breadcrumbs.l1}" - Category left blank`,
      );
    if (ctx.breadcrumbs.l2) {
      const sm = SUBCATEGORY_OPTIONS.find(
        (o) => o.toLowerCase() === ctx.breadcrumbs.l2.toLowerCase(),
      );
      if (sm) subcategory = sm;
    }
  } else {
    anomalies.push(
      `breadcrumbs-missing: ${ctx.breadcrumbs.error} - Category/Subcategory left blank`,
    );
  }

  for (const f of findings) {
    if (f.sku && f.sku !== skuId) {
      anomalies.push(`row sku ${f.sku} does not match file ${skuId} - skipped`);
      continue;
    }
    const review: string[] = [];
    if (f.badMeta) anomalies.push(`invalid enum token [${f.badMeta}] in row "${f.type}"`);

    // group (closed enum)
    let groupProp = GROUP_MAP[f.groupLabel.trim().toLowerCase()];
    if (!groupProp) {
      anomalies.push(`invalid group "${f.groupLabel}" in row "${f.type}"`);
      groupProp = f.groupLabel.trim();
      review.push('invalid-group');
    }
    const short = GROUP_SHORT[groupProp] ?? groupProp;

    // error type (open list - unknown values flagged, never blocked). Text rows
    // fold onto "Translation error" at push time (listingWriter), so their
    // wording is not an unknown type.
    const type = f.type.trim();
    if (
      groupProp !== 'Text / Translation' &&
      !KNOWN_TYPES.includes(normalizeType(type))
    ) {
      review.push('unknown-error-type');
    }

    // fix location (closed enum; absence = review flag, invalid = anomaly). The
    // text marker has no Fix column, so fall back to the audited product.
    let fix = (f.fixLocation ?? '').trim();
    if (!fix && f.sourceHint.toLowerCase() === 'text' && ctx.defaultFixLocation) {
      fix = ctx.defaultFixLocation;
    }
    if (fix) {
      const canon = FIX_ENUM.find((v) => v.toLowerCase() === fix.toLowerCase());
      if (canon) fix = canon;
      else {
        anomalies.push(`invalid fix location "${fix}" in row "${type}"`);
        review.push('invalid-fix-location');
      }
    } else {
      fix = '';
      review.push('fix-location-missing');
    }

    // priority = severity: explicit value wins, otherwise the automatic tier.
    const prioRaw = (f.priority ?? '').trim();
    let prio: string | null = null;
    if (prioRaw) {
      const canonP = PRIORITY_ENUM.find((v) => v.toLowerCase() === prioRaw.toLowerCase());
      if (canonP) prio = canonP;
      else {
        anomalies.push(`invalid priority "${prioRaw}" in row "${type}"`);
        review.push('invalid-priority');
      }
    }
    if (!prio) prio = priorityFor(groupProp, type);

    const title = `${skuId} ${EM_DASH} ${short} ${EM_DASH} ${type}`;
    const key = `${skuId}|${title}`;
    if (seen[key]) {
      anomalies.push(`duplicate input row: ${title}`);
      continue;
    }
    seen[key] = true;

    let flagHint = (f.flagHint ?? '').trim();
    if (flagHint.toLowerCase() !== 'normal' && flagHint.toLowerCase() !== 'complex') {
      flagHint = 'Normal';
      review.push('flag-hint-invalid-defaulted');
    }

    const cn = compressNotes(f.notes);
    for (const fl of cn.flags) review.push(fl);
    const split = splitNotesFix(cn.text);
    review.push('flag-suggestion-confirm');

    const srcHint = f.sourceHint;
    let language = 'All Store Views';
    if (srcHint.toLowerCase() === 'text') {
      let lmatch = /\b(EN|ES|FR)\b/.exec(type);
      if (!lmatch) lmatch = /\b(EN|ES|FR)\b/.exec(cn.text);
      if (lmatch) language = lmatch[1] ?? language;
    }

    let field: string | null = null;
    if (srcHint.toLowerCase() !== 'text') review.push('field-blank-nonattribute');
    else {
      const tl = type.toLowerCase();
      let fm: string | null = null;
      for (const [kw, val] of FIELD_BY_KEYWORD) {
        if (tl.includes(kw)) {
          fm = val;
          break;
        }
      }
      if (!fm) {
        for (const dk of FIELD_DESCRIPTION_KEYS) {
          if (tl.includes(dk)) {
            fm = 'description';
            break;
          }
        }
      }
      if (fm) field = fm;
      else anomalies.push(`field-unmapped type "${type}" - Field left blank, needs option decision`);
    }
    if (!subcategory && ctx.breadcrumbs.l2) {
      review.push(`subcategory-unmapped:${ctx.breadcrumbs.l2}`);
    }

    const missingProps: string[] = [];
    if (!ctx.link) {
      missingProps.push('link');
      review.push('link-missing');
    }
    if (!category) missingProps.push('category');
    if (!subcategory) missingProps.push('subcategory');
    if (missingProps.length > 0) review.push(`missing-fields:${missingProps.join(',')}`);

    payloads.push({
      dedup_key: key,
      sku: skuId,
      title,
      group: groupProp,
      type,
      fix_location: fix || null,
      priority: prio,
      status: 'To Fix',
      flag: flagHint,
      link: ctx.link,
      notes: split.notes,
      fix: split.fix,
      notes_full: cn.text,
      source: 'Storefront',
      supplier: ctx.supplier,
      category,
      subcategory,
      language,
      field,
      page_content: '',
      review_flags: review,
    });
  }

  // ambiguous merge: same normalised type reported under different groups
  const byNorm: Record<string, string> = {};
  for (const p of payloads) {
    const n = normalizeType(p.type);
    const g = p.group;
    if (byNorm[n] !== undefined && byNorm[n] !== g) {
      anomalies.push(
        `ambiguous merge: "${n}" appears as both "${byNorm[n]}" and "${g}" - confirm one row or keep split`,
      );
    }
    byNorm[n] = g;
  }

  return { payloads, anomalies };
}

export interface BuildFromMarkdownInput {
  sku: string;
  /** The dossier markdown (records/skus/<SKU>.md contents). */
  content: string;
  link?: string | null;
  supplier?: string;
  breadcrumbs?: Breadcrumbs | null;
  /** Default Fix Location for text rows (Simple / Configurable). */
  fixLocation?: string;
}

/**
 * Full per-SKU conversion over dossier markdown: reads the marker blocks (+
 * variant gap, + partial-input detection), then builds the payloads.
 */
export function buildPayloadsFromMarkdown(input: BuildFromMarkdownInput): PayloadBuild {
  const sku = input.sku.trim().toUpperCase();
  const content = input.content;
  if (!content || !content.trim()) {
    return {
      schema: PAYLOAD_SCHEMA,
      sku,
      ok: false,
      src_fmt: 'markers',
      payloads: [],
      anomalies: [],
      error: `records/skus/${sku}.md not found - run the audit first`,
    };
  }

  const anomalies: string[] = [];

  // frontend link (Notion Link property)
  let link: string | null = input.link ?? null;
  if (!link) {
    const lm = /^\s*-\s*Frontend:\s*(\S+)/m.exec(content);
    if (lm) link = lm[1] ?? null;
  }
  const supplier = canonicalSupplier(input.supplier ?? supplierFor(sku));

  // findings: both marker blocks feed payloads; legacy bullets are the fallback
  let findings = readMarkerRows(content);
  let srcFmt: 'markers' | 'legacy' = 'markers';
  const vg = readVariantGapRow(content, sku);
  for (const a of vg.anomalies) anomalies.push(a);
  if (vg.row) {
    findings = [...findings, vg.row];
    anomalies.push(`variant gap promoted to payload: "${vg.row.type}" (${vg.count} missing combos)`);
  }
  if (findings.length === 0) {
    const legacy = readLegacyRows(content);
    if (legacy && legacy.length > 0) {
      findings = legacy;
      srcFmt = 'legacy';
    }
  }
  if (srcFmt === 'markers') {
    const imgBody = getMarkerBody(content, 'image-audit');
    const txtBody = getMarkerBody(content, 'text-audit');
    const hasImg = imgBody !== null && imgBody.trim().length > 0;
    const hasTxt = txtBody !== null && txtBody.trim().length > 0;
    if (hasImg && !hasTxt) {
      anomalies.push(
        'partial-input: image-audit block present, text-audit block missing - payloads cover images only; run text-matrix first',
      );
    } else if (hasTxt && !hasImg) {
      anomalies.push(
        'partial-input: text-audit block present, image-audit block missing - payloads cover text only; run image-audit first',
      );
    }
  }
  if (findings.length === 0) {
    anomalies.push('no findings: no image-audit/text-audit blocks and no legacy rows');
  }

  const breadcrumbs: Breadcrumbs =
    input.breadcrumbs ?? { l1: '', l2: '', l3: '', ok: false, error: 'not provided' };

  const built = buildPayloads(sku, findings, {
    link,
    supplier,
    breadcrumbs,
    defaultFixLocation: input.fixLocation,
  });
  anomalies.push(...built.anomalies);

  return {
    schema: PAYLOAD_SCHEMA,
    sku,
    ok: true,
    src_fmt: srcFmt,
    payloads: built.payloads,
    anomalies,
  };
}
