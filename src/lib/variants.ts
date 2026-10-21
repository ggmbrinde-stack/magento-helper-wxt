/**
 * Variants — colours x sizes matrix + Magento URL (offline).
 *
 * Faithful port of the audit pipeline's `scripts/sku-variants.ps1`
 * (schema `bog-variants/1`). Operates purely on a `ResolverJson` (no network).
 * The colour-family step is the only judgment step and comes from a FIXED
 * keyword map; unmatched labels land in "Unclassified (review)".
 */

import {
  COLOR_ATTR_ID,
  SIZE_ATTR_ID,
  type ResolverJson,
} from './resolver';

export const VARIANTS_SCHEMA = 'bog-variants/1';

/**
 * Colour families. Fixed rule order; first keyword (case-insensitive substring)
 * match wins, so "Shocking Pink" -> Reds & Pinks, "Fluor Coral" -> Yellows &
 * Oranges, etc. Bicolor labels ("White/Turquoise") take the first matching rule.
 */
export const FAMILY_RULES: { name: string; words: string[] }[] = [
  {
    name: 'Blues',
    words: ['blue', 'turquoise', 'navy', 'ocean', 'sky', 'cobalt', 'azure', 'denim', 'aqua', 'cyan'],
  },
  {
    name: 'Greens',
    words: ['green', 'lime', 'mint', 'fern', 'moss', 'forest', 'kelly', 'olive', 'sage', 'grass', 'irish', 'tropical', 'eucalyptus', 'basil'],
  },
  {
    name: 'Reds & Pinks',
    words: ['red', 'pink', 'fuchsia', 'burgundy', 'maroon', 'wine', 'bordeaux', 'cherry', 'rose', 'magenta', 'raspberry', 'claret', 'hibiscus', 'crimson'],
  },
  {
    name: 'Yellows & Oranges',
    words: ['yellow', 'orange', 'coral', 'amber', 'gold', 'peach', 'apricot', 'tangerine', 'mustard', 'banana'],
  },
  {
    name: 'Purples',
    words: ['purple', 'violet', 'lilac', 'lavender', 'orchid', 'mauve', 'plum'],
  },
  {
    name: 'Neutrals',
    words: ['white', 'black', 'grey', 'gray', 'lead', 'charcoal', 'anthracite', 'beige', 'sand', 'khaki', 'stone', 'ivory', 'cream', 'taupe', 'graphite', 'silver', 'ecru', 'natural', 'ebony', 'chocolate', 'brown'],
  },
];

export const UNCLASSIFIED_FAMILY = 'Unclassified (review)';

export function colorFamily(label: string): string {
  const l = label.toLowerCase();
  for (const rule of FAMILY_RULES) {
    for (const w of rule.words) {
      if (l.includes(w)) return rule.name;
    }
  }
  return UNCLASSIFIED_FAMILY;
}

export interface VariantSummary {
  store: string;
  confId: string;
  simpleId: string;
  isSimple: boolean;
  frontend: string;
  colors: string[];
  sizes: string[];
  colorCount: number;
  sizeCount: number;
  total: number;
  expected: number;
  optCount: number;
  /** Missing combos as "colour|size" (labels may contain '/'). */
  missing: string[];
  /** Missing combos with '|' rendered as '/' for display. */
  missingDisplay: string[];
  /** Missing combos grouped by size: "size: colour, colour | size: colour". */
  missingText: string;
  familyOrder: string[];
  families: Record<string, string[]>;
  familiesCompact: string;
  anomalies: string[];
  notes: string[];
}

/** Build the variants summary from a resolver payload. */
export function buildVariantSummary(r: ResolverJson): VariantSummary {
  const anomalies: string[] = [];
  const notes: string[] = [];

  const conf = r.configurable_id === null ? '' : String(r.configurable_id);
  const frontend = r.frontend_url;
  const store = r.store;
  const kids = r.children;
  const idx = r.index;
  const a93 = r.attributes['93'];
  const a142 = r.attributes['142'];
  const optCount = r.option_prices_count;

  if (r.product_type === 'simple') {
    let ssid = r.simple_product_id === null ? '' : String(r.simple_product_id);
    if (!ssid && kids.length > 0) ssid = kids[0] ?? '';
    notes.push('simple product: single variant, no color/size matrix');
    return {
      store,
      confId: '',
      simpleId: ssid,
      isSimple: true,
      frontend,
      colors: [],
      sizes: [],
      colorCount: 0,
      sizeCount: 0,
      total: kids.length,
      expected: 1,
      optCount,
      missing: [],
      missingDisplay: [],
      missingText: '',
      familyOrder: [],
      families: {},
      familiesCompact: '',
      anomalies,
      notes,
    };
  }

  if (a93 === null) anomalies.push('attributes.93 (colors) missing in resolver.json');
  if (a142 === null) anomalies.push('attributes.142 (sizes) missing in resolver.json');

  // Attribute option ORDER must be preserved (it drives the missing-combo order,
  // and the payload notes). A plain object would reorder integer-like option
  // ids numerically, so use Maps (insertion-ordered) like PS's [ordered]@{}.
  const cMap = new Map<string, string>();
  for (const o of a93?.options ?? []) cMap.set(o.id, o.label);
  const sMap = new Map<string, string>();
  for (const o of a142?.options ?? []) sMap.set(o.id, o.label);

  const colors = [...cMap.values()];
  const sizes = [...sMap.values()];
  const colorSet: Record<string, true> = {};
  for (const c of colors) colorSet[c] = true;
  const sizeSet: Record<string, true> = {};
  for (const s of sizes) sizeSet[s] = true;

  const present: Record<string, true> = {};
  for (const [kid, entry] of Object.entries(idx)) {
    const cid = entry[COLOR_ATTR_ID] ?? '';
    const sid = entry[SIZE_ATTR_ID] ?? '';
    const cl = cMap.has(cid) ? (cMap.get(cid) as string) : null;
    const sl = sMap.has(sid) ? (sMap.get(sid) as string) : null;
    if (cl === null) anomalies.push(`child ${kid} has unknown color id ${cid}`);
    if (sl === null) anomalies.push(`child ${kid} has unknown size id ${sid}`);
    if (cl && !(cl in colorSet)) anomalies.push(`index color "${cl}" not in attribute 93 options`);
    if (sl && !(sl in sizeSet)) anomalies.push(`index size "${sl}" not in attribute 142 options`);
    if (cl && sl) present[`${cl}|${sl}`] = true;
  }

  const missing: string[] = [];
  for (const c of colors) {
    for (const s of sizes) {
      if (!(`${c}|${s}` in present)) missing.push(`${c}|${s}`);
    }
  }

  const expected = colors.length * sizes.length;
  if (optCount !== kids.length) {
    anomalies.push(`option_prices_count ${optCount} != children ${kids.length}`);
  }
  if (expected - missing.length !== kids.length) {
    anomalies.push(
      `children ${kids.length} != matrix-minus-missing ${expected - missing.length} ` +
        `(${colors.length}x${sizes.length} - ${missing.length}) -> duplicates or unknown ids`,
    );
  }

  const familyOrder: string[] = [];
  const families: Record<string, string[]> = {};
  for (const c of colors) {
    const f = colorFamily(c);
    const list = families[f] ?? (families[f] = []);
    if (list.length === 0) familyOrder.push(f);
    list.push(c);
  }
  const unclassified = families[UNCLASSIFIED_FAMILY];
  if (unclassified) {
    notes.push(`unclassified colors (review): ${unclassified.join(', ')}`);
  }

  let missingText = '';
  if (missing.length > 0) {
    const bySize = new Map<string, string[]>();
    for (const m of missing) {
      const parts = m.split('|', 2);
      const co = parts[0] ?? '';
      const sz = parts[1] ?? '';
      const list = bySize.get(sz) ?? [];
      list.push(co);
      bySize.set(sz, list);
    }
    missingText = [...bySize.entries()]
      .map(([sz, cos]) => `${sz}: ${cos.join(', ')}`)
      .join(' | ');
  }

  const familiesCompact = familyOrder
    .map((f) => `${f}: ${(families[f] ?? []).join(', ')}`)
    .join('; ');

  return {
    store,
    confId: conf,
    simpleId: '',
    isSimple: false,
    frontend,
    colors,
    sizes,
    colorCount: colors.length,
    sizeCount: sizes.length,
    total: kids.length,
    expected,
    optCount,
    missing,
    missingDisplay: missing.map((m) => m.replace('|', '/')),
    missingText,
    familyOrder,
    families,
    familiesCompact,
    anomalies,
    notes,
  };
}

/**
 * Render the `<!-- variants -->` marker block the payload builder reads for
 * variant-matrix gaps. Mirrors `Build-VariantsBlock` in sku-variants.ps1 so the
 * dossier markdown and the in-extension batch agree byte-for-byte on the lines
 * that matter (`- Missing combos:` / `- Total: NxM (...)`).
 */
export function renderVariantsBlock(
  v: VariantSummary,
  sku: string,
  stamp: string,
  magentoUrl: string,
): string {
  const lines: string[] = [];
  lines.push(
    '<!-- variants:begin (generated by BOG Helper - do not hand-edit this block) -->',
  );
  lines.push(`## Variants - ${stamp}`);
  lines.push('');
  if (v.isSimple) {
    lines.push('- Colors: n/a (simple product - single variant)');
    lines.push('');
    lines.push('- Sizes: n/a (simple product - single variant)');
    lines.push('- Total: 1 (simple - single variant)');
    lines.push('- Missing combos: none (simple product - single variant)');
    lines.push(`- Frontend: ${v.frontend}`);
    lines.push(`- Magento simple: ${magentoUrl}`);
    lines.push(`- Evidence: single variant; source evidence/${sku}/resolver.json`);
    for (const n of v.notes) lines.push(`- Note: ${n}`);
    lines.push('<!-- variants:end -->');
    return lines.join('\r\n');
  }
  lines.push(`- Colors: ${v.colorCount} (grouped in families; exact frontend labels)`);
  lines.push('');
  for (const family of v.familyOrder) {
    lines.push(`- ${family}: ${(v.families[family] ?? []).join(', ')}`);
    lines.push('');
  }
  lines.push(`- Sizes: ${v.sizeCount} - ${v.sizes.join(', ')}`);
  lines.push(
    `- Total: ${v.total} (${v.colorCount}x${v.sizeCount}) expected ${v.expected}`,
  );
  if (v.missing.length > 0) {
    lines.push(
      `- Missing combos: ${v.missing.length} - ${v.missingDisplay.join(', ')}`,
    );
  } else {
    lines.push('- Missing combos: none (full matrix)');
  }
  lines.push(`- Frontend: ${v.frontend}`);
  lines.push(`- Magento configurable: ${magentoUrl}`);
  lines.push(
    `- Evidence: children ${v.total}; optionPrices ${v.optCount}; source evidence/${sku}/resolver.json`,
  );
  for (const n of v.notes) lines.push(`- Note: ${n}`);
  lines.push('<!-- variants:end -->');
  return lines.join('\r\n');
}
