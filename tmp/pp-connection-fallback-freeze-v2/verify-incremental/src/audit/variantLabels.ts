/**
 * Variant label review (E8).
 *
 * Storefront colour/size labels are free text (Magento attribute option
 * labels), so the same colour arrives spelled several ways across SKUs:
 * "Grey" / "Gray", "Navy" / "Navy Blue", "One Size" / "One size", "X-Large" /
 * "XL". This module does NOT declare a canonical catalogue - inventing one
 * would silently rewrite labels the storefront really publishes. It reports:
 *
 *   1. labels that are unformatted (stray spaces, lowercase start, NBSP);
 *   2. labels that collide INSIDE one SKU once folded;
 *   3. labels that collapse onto the same spelling through the small synonym
 *      map below (the only pairs that are known to be the same word).
 *
 * Cross-SKU canonicalisation is then simply the sum of those reports over the
 * resolver cache, which is exactly the signal the old audit pipeline missed.
 */

export interface LabelReview {
  /** Colour labels with formatting problems. */
  unformattedColors: string[];
  /** Size labels with formatting problems. */
  unformattedSizes: string[];
  /** Two or more labels in one SKU that fold to the same word. */
  nearDuplicates: string[];
  /** One-line remarks, ready for the result card / dossier. */
  notes: string[];
}

/**
 * Pairs that are different spellings of the same word. Deliberately tiny: an
 * entry here means "we are sure these are one colour". "Navy" and "Navy Blue"
 * are handled by the prefix rule, not by this map.
 */
export const LABEL_SYNONYMS: Record<string, string> = {
  gray: 'grey',
  'off white': 'off-white',
  offwhite: 'off-white',
  'off-white': 'off-white',
  multicolor: 'multicolour',
  'multi color': 'multicolour',
  'multi colour': 'multicolour',
  'multi-color': 'multicolour',
  'x large': 'xl',
  'x-large': 'xl',
  xlarge: 'xl',
  'x small': 'xs',
  'x-small': 'xs',
  xsmall: 'xs',
  'xx large': 'xxl',
  'xx-large': 'xxl',
  xxlarge: 'xxl',
  'one size fits all': 'one size',
  osfa: 'one size',
};

/** Lowercase, accent-free, single-spaced, one dash character. */
export function foldLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function synonymKey(label: string): string {
  const folded = foldLabel(label);
  return LABEL_SYNONYMS[folded] ?? folded;
}

/** Objective formatting problems only - no taste, no guessing. */
function formatIssues(label: string): string[] {
  const issues: string[] = [];
  if (label !== label.trim()) issues.push('leading/trailing space');
  if (/\s{2,}/.test(label)) issues.push('double space');
  if (/\u00a0/.test(label)) issues.push('non-breaking space');
  if (/^[a-z]/.test(label.trim())) issues.push('lowercase start');
  if (/-/.test(label) && /\s/.test(label)) issues.push('dash and space mixed');
  return issues;
}

function sizeFormatIssues(label: string): string[] {
  const issues = formatIssues(label);
  const folded = foldLabel(label);
  // "X L", "X-Large", "XX-Large", "3X Large": all the same size, none of them
  // the canonical token the storefront should publish.
  if (
    // The separator is required: "XL" is canonical, "X L" is not.
    /^x+[\s-]+(?:s|m|l)$/.test(folded) ||
    /^\d*(?:x+)?[\s-]+(?:large|medium|small)$/.test(folded)
  ) {
    issues.push('letter size spelled out or hyphenated');
  }
  return issues;
}

function collisions(labels: string[]): string[] {
  const byKey = new Map<string, string[]>();
  for (const label of labels) {
    const key = synonymKey(label);
    const list = byKey.get(key) ?? [];
    list.push(label);
    byKey.set(key, list);
  }
  const out: string[] = [];
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const distinct = [...new Set(group.map((label) => label.trim()))];
    if (distinct.length > 1) out.push(distinct.join(' / '));
  }
  // "Navy" next to "Navy Blue" is the same colour twice with an extra word.
  for (const label of labels) {
    const folded = synonymKey(label);
    for (const other of labels) {
      const otherFolded = synonymKey(other);
      if (folded === otherFolded) continue;
      if (!otherFolded.startsWith(`${folded} `)) continue;
      const pair = `${label.trim()} / ${other.trim()}`;
      if (!out.includes(pair)) out.push(pair);
    }
  }
  return out;
}

/** Review the colour and size labels a single SKU publishes. */
export function reviewVariantLabels(colors: string[], sizes: string[]): LabelReview {
  const unformattedColors = colors.filter((label) => formatIssues(label).length > 0);
  const unformattedSizes = sizes.filter((label) => sizeFormatIssues(label).length > 0);
  const nearDuplicates = [...collisions(colors), ...collisions(sizes)];

  const notes: string[] = [];
  if (unformattedColors.length > 0) {
    notes.push(
      `colour labels need formatting: ${unformattedColors
        .map((label) => `"${label}" (${formatIssues(label).join(', ')})`)
        .join('; ')}`,
    );
  }
  if (unformattedSizes.length > 0) {
    notes.push(
      `size labels need formatting: ${unformattedSizes
        .map((label) => `"${label}" (${sizeFormatIssues(label).join(', ')})`)
        .join('; ')}`,
    );
  }
  if (nearDuplicates.length > 0) {
    notes.push(
      `labels that read as the same value: ${nearDuplicates.join('; ')} - keep one spelling per attribute`,
    );
  }
  return { unformattedColors, unformattedSizes, nearDuplicates, notes };
}
