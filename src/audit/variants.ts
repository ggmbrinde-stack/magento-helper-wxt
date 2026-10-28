/**
 * Variants — colours x sizes matrix + Magento URL (offline).
 *
 * Faithful port of the audit pipeline's `scripts/sku-variants.ps1`
 * (schema `bog-variants/1`). Operates purely on a `ResolverJson` (no network).
 * The colour-family step is the only judgment step and comes from a FIXED
 * keyword map; unmatched labels land in "Unclassified (review)".
 *
 * Availability independence: colours and sizes come from the attribute option
 * lists (93 / 142) ONLY - never from the `index` keys or from how many children
 * exist. The storefront payload is itself status-filtered upstream (Magento
 * drops options that have no enabled child), so the payload alone cannot prove
 * a colour is absent. That is what the optional `targets` matrix is for: the
 * admin Configurations list every assigned child, any status, and gives the
 * intended grid to measure the storefront against (`missingVsTarget`).
 */

import {
  COLOR_ATTR_ID,
  SIZE_ATTR_ID,
  type ResolverJson,
} from '../shared/resolver';

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

/** A colour x size grid, either measured (storefront) or intended (admin). */
export interface VariantMatrix {
  colors: string[];
  sizes: string[];
  /** "colour|size" combos that exist in this matrix. */
  present: string[];
  /** Combos in the grid that do not exist. */
  missing: string[];
  expected: number;
  source: 'storefront' | 'target';
}

/**
 * The intended matrix, built from a source that ignores status (the admin
 * Configurations list). `source` is carried into the report so the operator
 * knows what the comparison is against.
 */
export interface VariantTargets {
  colors: string[];
  sizes: string[];
  source: string;
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
  /** Option counts recorded by the resolver (null when absent in old payloads). */
  optionCounts: { '93': number | null; '142': number | null };
  /** Missing combos as "colour|size" (labels may contain '/'). */
  missing: string[];
  /** Missing combos with '|' rendered as '/' for display. */
  missingDisplay: string[];
  /** Missing combos grouped by size: "size: colour, colour | size: colour". */
  missingText: string;
  /** Both grids side by side; `target` is null without admin data. */
  matrix: { storefront: VariantMatrix; target: VariantMatrix | null };
  /** Expected combos (admin) with no storefront child — the availability gap. */
  missingVsTarget: string[];
  missingVsTargetDisplay: string[];
  missingVsTargetText: string;
  /** Storefront combos that the admin target does not contain (data drift). */
  extraVsTarget: string[];
  extraVsTargetText: string;
  targetsSource: string | null;
  /** Why a supplied target matrix could not be compared. */
  targetsNote: string | null;
  familyOrder: string[];
  families: Record<string, string[]>;
  familiesCompact: string;
  anomalies: string[];
  notes: string[];
}

function normLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueLabels(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** "size: colour, colour | size: colour" from "colour|size" keys. */
export function groupMissingText(combos: string[]): string {
  if (combos.length === 0) return '';
  const bySize = new Map<string, string[]>();
  for (const combo of combos) {
    const [color = '', size = ''] = combo.split('|', 2);
    const list = bySize.get(size) ?? [];
    list.push(color);
    bySize.set(size, list);
  }
  return [...bySize.entries()]
    .map(([size, colors]) => `${size}: ${colors.join(', ')}`)
    .join(' | ');
}

/**
 * Build the intended matrix from admin children (any status). Empty labels are
 * skipped; order follows the admin rows.
 */
export function variantTargetsFromRows(
  rows: { color?: string; size?: string }[],
  source = 'admin-config',
): VariantTargets {
  const colors: string[] = [];
  const sizes: string[] = [];
  for (const row of rows) {
    const color = (row.color ?? '').trim();
    const size = (row.size ?? '').trim();
    if (color && !colors.includes(color)) colors.push(color);
    if (size && !sizes.includes(size)) sizes.push(size);
  }
  return { colors, sizes, source };
}

/** Build the variants summary from a resolver payload. */
export function buildVariantSummary(
  r: ResolverJson,
  targets?: VariantTargets,
): VariantSummary {
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
      optionCounts: { '93': null, '142': null },
      missing: [],
      missingDisplay: [],
      missingText: '',
      matrix: {
        storefront: {
          colors: [],
          sizes: [],
          present: [],
          missing: [],
          expected: 1,
          source: 'storefront',
        },
        target: null,
      },
      missingVsTarget: [],
      missingVsTargetDisplay: [],
      missingVsTargetText: '',
      extraVsTarget: [],
      extraVsTargetText: '',
      targetsSource: targets?.source ?? null,
      targetsNote: null,
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

  // Colours/sizes = option lists. Not `idx`, not `kids` (A4).
  const colors = [...cMap.values()];
  const sizes = [...sMap.values()];
  const colorSet: Record<string, true> = {};
  for (const c of colors) colorSet[c] = true;
  const sizeSet: Record<string, true> = {};
  for (const s of sizes) sizeSet[s] = true;

  const present: Record<string, true> = {};
  const presentPairs: string[] = [];
  for (const [kid, entry] of Object.entries(idx)) {
    const cid = entry[COLOR_ATTR_ID] ?? '';
    const sid = entry[SIZE_ATTR_ID] ?? '';
    const cl = cMap.has(cid) ? (cMap.get(cid) as string) : null;
    const sl = sMap.has(sid) ? (sMap.get(sid) as string) : null;
    if (cl === null) anomalies.push(`child ${kid} has unknown color id ${cid}`);
    if (sl === null) anomalies.push(`child ${kid} has unknown size id ${sid}`);
    if (cl && !(cl in colorSet)) anomalies.push(`index color "${cl}" not in attribute 93 options`);
    if (sl && !(sl in sizeSet)) anomalies.push(`index size "${sl}" not in attribute 142 options`);
    if (cl && sl) {
      present[`${cl}|${sl}`] = true;
      presentPairs.push(`${cl}|${sl}`);
    }
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

  const optionCounts = {
    '93': r.attribute_option_counts?.['93'] ?? (a93 ? a93.options.length : null),
    '142': r.attribute_option_counts?.['142'] ?? (a142 ? a142.options.length : null),
  };

  // ---- target matrix (admin, status-blind) --------------------------------
  const targetColors = uniqueLabels(targets?.colors ?? []);
  const targetSizes = uniqueLabels(targets?.sizes ?? []);
  let target: VariantMatrix | null = null;
  let missingVsTarget: string[] = [];
  let extraVsTarget: string[] = [];
  let targetsNote: string | null = null;

  if (targets && (targetColors.length > 0 || targetSizes.length > 0)) {
    if (targetColors.length === 0 || targetSizes.length === 0) {
      targetsNote =
        'target matrix incomplete: admin children carry no colour or no size label';
    } else {
      const colorByNorm = new Map(colors.map((c) => [normLabel(c), c]));
      const sizeByNorm = new Map(sizes.map((s) => [normLabel(s), s]));
      const colorHits = targetColors.filter((c) => colorByNorm.has(normLabel(c))).length;
      const sizeHits = targetSizes.filter((s) => sizeByNorm.has(normLabel(s))).length;

      if (colors.length > 0 && sizes.length > 0 && colorHits === 0 && sizeHits === 0) {
        // Enabled children are a subset of assigned children, so zero overlap
        // means the two sides use different labels (e.g. admin store scope).
        targetsNote = `admin labels (${targets.source}) do not match storefront labels - comparison skipped`;
      } else {
        const targetPresent: string[] = [];
        const targetGrid = new Set<string>();
        for (const c of targetColors) {
          for (const s of targetSizes) {
            const key = `${c}|${s}`;
            targetGrid.add(`${normLabel(c)}|${normLabel(s)}`);
            const sc = colorByNorm.get(normLabel(c)) ?? c;
            const ss = sizeByNorm.get(normLabel(s)) ?? s;
            if (`${sc}|${ss}` in present) targetPresent.push(key);
            else missingVsTarget.push(key);
          }
        }
        target = {
          colors: targetColors,
          sizes: targetSizes,
          present: targetPresent,
          missing: missingVsTarget,
          expected: targetColors.length * targetSizes.length,
          source: 'target',
        };
        extraVsTarget = presentPairs.filter((pair) => {
          const [c = '', s = ''] = pair.split('|', 2);
          return !targetGrid.has(`${normLabel(c)}|${normLabel(s)}`);
        });
      }
    }
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

  const missingText = groupMissingText(missing);
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
    optionCounts,
    missing,
    missingDisplay: missing.map((m) => m.replace('|', '/')),
    missingText,
    matrix: {
      storefront: {
        colors,
        sizes,
        present: presentPairs,
        missing,
        expected,
        source: 'storefront',
      },
      target,
    },
    missingVsTarget,
    missingVsTargetDisplay: missingVsTarget.map((m) => m.replace('|', '/')),
    missingVsTargetText: groupMissingText(missingVsTarget),
    extraVsTarget,
    extraVsTargetText: groupMissingText(extraVsTarget),
    targetsSource: targets?.source ?? null,
    targetsNote,
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
