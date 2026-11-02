/**
 * Disable -> Enable flow.
 *
 * A product that Magento shows as Disabled is not sale-ready just because the
 * row exists. The operator checklist (PPs, categories, images, colour/size,
 * tier prices, price/stock, type/visibility, new colours, translations) is the
 * definition of "ready"; this module turns the facts we can read into a
 * checklist and is deliberately honest about the rest.
 *
 * Two rules shape the whole report:
 *
 *   - missing  = we read the source and the value is absent or contradictory.
 *   - manual   = the source cannot be read by the extension yet. It is NOT a
 *                pass. The operator verifies it in Magento and acknowledges it.
 *
 * Nothing here writes to Magento or Notion. `loadPpAssignment` is a read.
 */

import {
  extractMultiSelect,
  extractRichText,
  extractSelect,
  extractTitle,
  loadSettings,
  queryDatabase,
} from '../shared/notion/client';
import type {
  ProductType,
  ResolverCategories,
  ResolverChildDetail,
  ResolverMagentoFacts,
} from '../shared/resolver';
import type { ResolverNotionMetadata } from '../core/messages';

/** SKU - PP & Category Assignment (database id, Notion API 2022-06-28). */
export const PP_ASSIGNMENT_DB = 'b5b3b50e-3650-4325-a28e-b78298e8d06c';
export const PP_ASSIGNMENT_URL = `https://app.notion.com/${PP_ASSIGNMENT_DB.replace(/-/g, '')}`;

/** The tier table lives on this page; the snapshot below is dated. */
export const TIER_PRICES_URL = 'https://app.notion.com/p/3f7b6705ae1f80ea8873e7eff19266e1';
export const TIER_PRICES_READ_ON = '2026-11-02';

export interface TierBand {
  /** First quantity in the band (inclusive). */
  from: number;
  /** Last quantity in the band (inclusive); null means "and above". */
  to: number | null;
  /** Discount in percent. */
  discount: number;
}

export interface TierTable {
  name: string;
  appliesTo: string;
  bands: TierBand[];
}

/**
 * Snapshot of the Notion "Tier Prices" page. The page stays the source of
 * truth; this snapshot only lets the card show the expected bands and is
 * labelled with the date it was read.
 */
export const TIER_PRICE_TABLES: TierTable[] = [
  {
    name: 'Têxtil',
    appliesTo: 'tudo o que for vestível',
    bands: [
      { from: 0, to: 99, discount: 0 },
      { from: 100, to: 249, discount: 5 },
      { from: 250, to: 499, discount: 8 },
      { from: 500, to: 4999, discount: 10 },
      { from: 5000, to: null, discount: 12 },
    ],
  },
  {
    name: 'Outros artigos',
    appliesTo: 'everything not wearable',
    bands: [
      { from: 0, to: 199, discount: 0 },
      { from: 200, to: 499, discount: 5 },
      { from: 500, to: 999, discount: 8 },
      { from: 1000, to: 4999, discount: 10 },
      { from: 5000, to: null, discount: 12 },
    ],
  },
];

/** Suppliers that sell from a catalogue without Magento stock management. */
export const STOCK_EXCEPTION_SUPPLIERS = ['WORKTEAM', 'JHK', 'ALLBEST'] as const;

/* ------------------------------------------------------------------------- */
/* Notion: PP & Category Assignment                                          */
/* ------------------------------------------------------------------------- */

export interface PpAssignment {
  found: boolean;
  url: string;
  assignment: string;
  status: string;
  ppCode: string;
  /** L1/L2 names as stored, e.g. "6.4. BLOCOS E CADERNOS". */
  categories: string[];
  /** L3 names as stored. */
  subSubCategories: string[];
  original: string;
  notes: string;
}

export const EMPTY_PP_ASSIGNMENT: PpAssignment = {
  found: false,
  url: PP_ASSIGNMENT_URL,
  assignment: '',
  status: '',
  ppCode: '',
  categories: [],
  subSubCategories: [],
  original: '',
  notes: '',
};

function textOf(props: Record<string, unknown>, name: string): string {
  return extractRichText(props[name] as Record<string, unknown>);
}

function selectOf(props: Record<string, unknown>, name: string): string {
  return extractSelect(props[name] as Record<string, unknown>);
}

function namesOf(props: Record<string, unknown>, name: string): string[] {
  return extractMultiSelect(props[name] as Record<string, unknown>);
}

/** Read the SKU's PP/category row, if the token can see the tracker. */
export async function loadPpAssignment(skuRaw: string): Promise<PpAssignment> {
  const sku = skuRaw.trim();
  if (!sku) return { ...EMPTY_PP_ASSIGNMENT };
  const settings = await loadSettings();
  if (!settings.notionToken) {
    throw new Error('Notion token not configured');
  }
  const rows = await queryDatabase(
    settings.notionToken,
    PP_ASSIGNMENT_DB,
    { property: 'Assignment', title: { equals: sku } },
    2,
  );
  const page = rows[0] as
    | { id?: string; properties?: Record<string, unknown> }
    | undefined;
  if (!page?.properties) return { ...EMPTY_PP_ASSIGNMENT, assignment: sku };
  const props = page.properties;
  return {
    found: true,
    url: page.id
      ? `https://app.notion.com/${String(page.id).replace(/-/g, '')}`
      : PP_ASSIGNMENT_URL,
    assignment: extractTitle(props.Assignment as Record<string, unknown>) || sku,
    status: selectOf(props, 'Status'),
    ppCode: textOf(props, 'PP Code'),
    categories: namesOf(props, 'Categoria / Subcategoria'),
    subSubCategories: namesOf(props, 'Sub-subcategoria'),
    original: textOf(props, 'Categorias (Original)'),
    notes: textOf(props, 'Notes'),
  };
}

/* ------------------------------------------------------------------------- */
/* Category comparison                                                       */
/* ------------------------------------------------------------------------- */

/** Strip a numbering prefix and fold case/accents: "6.2. CANETAS" -> "canetas". */
export function foldCategoryName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^\s*\d+(?:\.\d+)*\s*[.)-]?\s*/, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Which Notion category names have no counterpart in the Magento breadcrumb.
 *
 * Notion stores numbered names ("6.4. BLOCOS E CADERNOS") while Magento stores
 * the display name ("Blocos e Cadernos"), so the comparison is by folded name
 * and accepts a breadcrumb that is more specific than the stored name.
 */
export function unmatchedCategories(
  notionNames: string[],
  magentoPath: string[],
): string[] {
  const path = magentoPath.map(foldCategoryName).filter(Boolean);
  return notionNames.filter((raw) => {
    const name = foldCategoryName(raw);
    if (!name) return false;
    return !path.some(
      (segment) =>
        segment === name ||
        (name.length >= 3 && segment.includes(name)) ||
        (segment.length >= 3 && name.includes(segment)),
    );
  });
}

/* ------------------------------------------------------------------------- */
/* Size order                                                                */
/* ------------------------------------------------------------------------- */

const SIZE_WORDS = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  '3XL',
  '4XL',
  '5XL',
] as const;

const SIZE_ALIASES: Record<string, string> = {
  '2XL': 'XXL',
  XXXL: '3XL',
  XXXXL: '4XL',
  XXXXXL: '5XL',
};

/** Standard-order rank for a size, or null when it cannot be ranked. */
export function standardSizeRank(raw: string): number | null {
  const key = raw.trim().toUpperCase().replace(/\s+/g, '');
  const canonical = SIZE_ALIASES[key] ?? key;
  const index = SIZE_WORDS.indexOf(canonical as (typeof SIZE_WORDS)[number]);
  return index < 0 ? null : (index + 1) * 10;
}

export interface SizeOrderResult {
  /** true = ordered, false = out of order, null = cannot rank. */
  ok: boolean | null;
  /** Sizes the standard order does not know (custom values). */
  unknown: string[];
  /** The list as read, for the report. */
  sizes: string[];
}

function isAscending(values: number[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if ((values[i] ?? 0) < (values[i - 1] ?? 0)) return false;
  }
  return true;
}

/**
 * Check sizes against the store's standard order.
 *
 * Numeric sizes sort numerically; word sizes use XS..5XL. A list that mixes
 * the two, or uses a custom value (e.g. "Único"), is not guessed at.
 */
export function checkSizeOrder(sizes: string[]): SizeOrderResult {
  const clean = sizes.map((s) => s.trim()).filter(Boolean);
  if (clean.length <= 1) return { ok: true, unknown: [], sizes: clean };

  const numeric = clean.every((s) => /^\d+(?:\.\d+)?$/.test(s));
  if (numeric) {
    const values = clean.map(Number);
    return {
      ok: isAscending(values),
      unknown: [],
      sizes: clean,
    };
  }

  const ranks = clean.map(standardSizeRank);
  const unknown = clean.filter((_, i) => ranks[i] === null);
  if (unknown.length > 0) return { ok: null, unknown, sizes: clean };
  const values = ranks as number[];
  return {
    ok: isAscending(values),
    unknown: [],
    sizes: clean,
  };
}

/** The standard order, rendered for an error message. */
export function expectedSizeOrder(sizes: string[]): string {
  if (sizes.every((s) => /^\d+(?:\.\d+)?$/.test(s.trim()))) {
    return [...sizes].map(Number).sort((a, b) => a - b).join(' < ');
  }
  return [...sizes]
    .sort((a, b) => (standardSizeRank(a) ?? 0) - (standardSizeRank(b) ?? 0))
    .join(' < ');
}

/* ------------------------------------------------------------------------- */
/* Report                                                                    */
/* ------------------------------------------------------------------------- */

export type EnableCheckStatus = 'pass' | 'missing' | 'manual' | 'na';

export type EnableCheckId =
  | 'pp'
  | 'category'
  | 'images'
  | 'variants'
  | 'size-order'
  | 'tier-prices'
  | 'price-stock'
  | 'type'
  | 'visibility'
  | 'new-colours'
  | 'attribute-translations'
  | 'text-translations';

export interface EnableCheckFix {
  label: string;
  /** External destination, opened in a new tab. */
  href?: string;
  /** In-dashboard destination. */
  open?: 'images' | 'text';
}

export interface EnableCheck {
  id: EnableCheckId;
  title: string;
  status: EnableCheckStatus;
  detail: string;
  /** Extra facts, each rendered on its own line. */
  notes: string[];
  fix?: EnableCheckFix;
}

export interface EnableFlowInput {
  sku: string;
  resolver?: {
    sku?: string;
    product_type?: ProductType;
    child_count?: number;
    children?: string[];
    children_detail?: ResolverChildDetail[];
    categories?: ResolverCategories;
    /** PP + categories read from the Magento product edit page. */
    magento_facts?: ResolverMagentoFacts;
    configurable_id?: number | null;
    simple_product_id?: number | null;
    magento_status?: { label: string };
    supplier?: { supplier: string; tier?: number };
  };
  notion?: ResolverNotionMetadata;
  targets?: { colors: string[]; sizes: string[] };
  categoryCheck?: { mismatches: string[] };
  pp?: PpAssignment | null;
  ppError?: string;
  availability?: { verdict: string; checkedAt?: string } | null;
  adminBase?: string;
}

export interface EnableFlowReport {
  sku: string;
  checks: EnableCheck[];
  counts: Record<EnableCheckStatus, number>;
  /** missing + manual: every one of them blocks Enable until resolved/verified. */
  blockers: number;
  /** True only when nothing is missing and nothing needs manual verification. */
  ready: boolean;
  /** Product facts for the summary strip. */
  summary: {
    magentoStatus: string;
    productType: string;
    children: number;
    supplier: string;
    ppCode: string;
    categoryPath: string;
    availability: string;
  };
  /** Magento product edit page, or the product grid when no id was read. */
  adminUrl: string;
  checkedAt: string;
}

function adminEditUrl(input: EnableFlowInput): string {
  const base = (input.adminBase ?? 'https://bestofgifts.pt/admin_L2pZx').replace(
    /\/+$/,
    '',
  );
  const id =
    input.resolver?.configurable_id ?? input.resolver?.simple_product_id ?? null;
  return id === null
    ? `${base}/catalog/product/`
    : `${base}/catalog/product/edit/id/${id}/`;
}

function fix(
  label: string,
  href: string | undefined,
  open?: EnableCheckFix['open'],
): EnableCheckFix | undefined {
  if (!href && !open) return undefined;
  return { label, href, open };
}

/** PP codes compare by number: `0957` and `957` are the same profile. */
function samePpCode(a: string, b: string): boolean {
  const left = Number.parseInt((a ?? '').replace(/\D+/g, ''), 10);
  const right = Number.parseInt((b ?? '').replace(/\D+/g, ''), 10);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  }
  return left === right;
}

/**
 * Build the checklist from already-read facts. Pure: no network, no storage.
 */
export function buildEnableFlow(input: EnableFlowInput): EnableFlowReport {
  const sku = input.sku.trim();
  const resolver = input.resolver;
  const children = resolver?.children_detail ?? [];
  const childCount = resolver?.child_count ?? resolver?.children?.length ?? 0;
  const editUrl = adminEditUrl(input);
  const checks: EnableCheck[] = [];

  const push = (
    id: EnableCheckId,
    title: string,
    status: EnableCheckStatus,
    detail: string,
    notes: string[] = [],
    link?: EnableCheckFix,
  ): void => {
    checks.push({ id, title, status, detail, notes, fix: link });
  };

  /* 1. PPs ---------------------------------------------------------------- */
  const pp = input.pp ?? null;
  const magento = resolver?.magento_facts ?? null;
  const magentoPp = (magento?.ppCode ?? '').trim();
  const magentoPpRead = Boolean(magento);
  const notionPp =
    pp?.found && !/not applicable/i.test(pp.status) ? (pp.ppCode ?? '').trim() : '';
  const attributeSetNote = magento?.attributeSet
    ? `Magento Attribute Set: ${magento.attributeSet}`
    : '';

  if (input.ppError) {
    push(
      'pp',
      'PP assigned',
      'manual',
      magentoPp
        ? `Magento PP ${magentoPp}, but the Notion tracker could not be read: ${input.ppError}`
        : `The Notion PP tracker could not be read: ${input.ppError}`,
      [
        ...(attributeSetNote ? [attributeSetNote] : []),
        'Confirm the PP in Magento and in the PP & Category Assignment database.',
      ],
      fix('Open PP tracker', PP_ASSIGNMENT_URL),
    );
  } else if (pp?.found && /not applicable/i.test(pp.status)) {
    if (magentoPp) {
      push(
        'pp',
        'PP assigned',
        'missing',
        `Notion says "Not Applicable", but Magento carries PP ${magentoPp}.`,
        [attributeSetNote].filter(Boolean),
        fix('Open the Notion row', pp.url),
      );
    } else {
      push(
        'pp',
        'PP assigned',
        'na',
        'Not applicable: Notion marks this SKU as "Not Applicable".',
      );
    }
  } else if (!pp?.found) {
    if (magentoPp) {
      push(
        'pp',
        'PP assigned',
        'pass',
        `PP ${magentoPp} read from the Magento Attribute Set (no Notion row).`,
        [
          ...(attributeSetNote ? [attributeSetNote] : []),
          'Create the Notion row when convenient; Magento already has the PP.',
        ],
        fix('Open PP tracker', PP_ASSIGNMENT_URL),
      );
    } else if (magentoPpRead) {
      push(
        'pp',
        'PP assigned',
        'missing',
        `No PP in Magento or Notion: the Attribute Set carries no PP code and there is no row for ${sku}.`,
        [
          ...(attributeSetNote ? [attributeSetNote] : []),
          'Assign a PP Attribute Set in Magento and create the Notion row.',
        ],
        fix('Open the product', editUrl),
      );
    } else {
      push(
        'pp',
        'PP assigned',
        'missing',
        `No row for ${sku} in the Notion PP & Category Assignment database, and the Magento Attribute Set was not read.`,
        ['Create the row, assign the PP and the category path.'],
        fix('Open PP tracker', PP_ASSIGNMENT_URL),
      );
    }
  } else if (!notionPp) {
    push(
      'pp',
      'PP assigned',
      'missing',
      magentoPp
        ? `The Notion row has no PP Code, but Magento carries PP ${magentoPp}.`
        : magentoPpRead
          ? `No PP Code in Notion and no PP in the Magento Attribute Set (Status: ${pp.status || '—'}).`
          : `The Notion row exists but PP Code is empty (Status: ${pp.status || '—'}).`,
      [
        ...(attributeSetNote ? [attributeSetNote] : []),
        `Assignment: ${pp.assignment || sku}`,
      ],
      fix('Open the Notion row', pp.url),
    );
  } else if (magentoPp && samePpCode(notionPp, magentoPp)) {
    push(
      'pp',
      'PP assigned',
      'pass',
      `PP ${magentoPp} (Magento and Notion agree).`,
      [
        ...(attributeSetNote ? [attributeSetNote] : []),
        `Notion Status: ${pp.status || '—'}`,
      ],
    );
  } else if (magentoPp) {
    push(
      'pp',
      'PP assigned',
      'missing',
      `PP mismatch: Notion ${notionPp} vs Magento ${magentoPp}.`,
      [
        ...(attributeSetNote ? [attributeSetNote] : []),
        'Neither side wins silently; correct the wrong one before enabling.',
      ],
      fix('Open the product', editUrl),
    );
  } else if (magentoPpRead) {
    push(
      'pp',
      'PP assigned',
      'missing',
      `Notion has PP ${notionPp}, but the Magento Attribute Set carries no PP code.`,
      [attributeSetNote].filter(Boolean),
      fix('Open the product', editUrl),
    );
  } else {
    // Notion has the PP, but this run could not read the Magento side.
    push(
      'pp',
      'PP assigned',
      'manual',
      `Notion PP ${notionPp}; the Magento Attribute Set was not read.`,
      [
        `Notion Status: ${pp.status || '—'}`,
        'Open the product edit page in Magento and confirm the PP Attribute Set.',
      ],
      fix('Open the product', editUrl),
    );
  }

  /* 2. Categories --------------------------------------------------------- */
  const notionNames = pp ? [...pp.categories, ...pp.subSubCategories] : [];
  const magentoPaths = resolver?.magento_facts?.categoryPaths?.length
    ? resolver.magento_facts.categoryPaths
    : resolver?.categories?.ok && resolver.categories.path.length > 0
      ? [resolver.categories.path]
      : [];
  const magentoPath = magentoPaths[0] ?? [];
  const categoriesRead =
    Boolean(resolver?.magento_facts?.categoryRead) ||
    Boolean(resolver?.categories?.ok);
  const categoryReason =
    resolver?.magento_facts?.categoryReason ??
    (resolver?.magento_facts?.categoryRead
      ? 'no category is checked'
      : 'Magento did not return a breadcrumb.');

  if (input.ppError) {
    push(
      'category',
      'Categories assigned',
      'manual',
      'Notion category data is unavailable, so Magento cannot be compared.',
      magentoPath.length ? [`Magento: ${magentoPath.join(' › ')}`] : [],
      fix('Open the product', editUrl),
    );
  } else if (!pp?.found) {
    if (magentoPath.length > 0) {
      push(
        'category',
        'Categories assigned',
        'pass',
        `Magento: ${magentoPath.join(' › ')} (no Notion row).`,
        [
          'Create the Notion row when convenient; Magento already has the category.',
        ],
        fix('Open PP tracker', PP_ASSIGNMENT_URL),
      );
    } else if (categoriesRead) {
      push(
        'category',
        'Categories assigned',
        'missing',
        `No categories in Magento (${categoryReason}), and no row for ${sku} in Notion.`,
        [],
        fix('Open the product', editUrl),
      );
    } else {
      push(
        'category',
        'Categories assigned',
        'missing',
        'No Notion row, so there is no assigned category to compare with Magento.',
        ['The Magento category tree was not read in this run.'],
        fix('Open PP tracker', PP_ASSIGNMENT_URL),
      );
    }
  } else if (notionNames.length === 0) {
    push(
      'category',
      'Categories assigned',
      'missing',
      categoriesRead && magentoPath.length === 0
        ? 'No category in Notion or Magento.'
        : 'The Notion row has no Category / Subcategory assigned.',
      [
        ...(magentoPath.length ? [`Magento: ${magentoPath.join(' › ')}`] : []),
        ...(categoriesRead && magentoPath.length === 0
          ? ['Magento has no category checked.']
          : []),
      ],
      fix('Open the Notion row', pp.url),
    );
  } else if (magentoPath.length === 0) {
    if (categoriesRead) {
      push(
        'category',
        'Categories assigned',
        'missing',
        `Magento has no category checked (${categoryReason}).`,
        [`Notion: ${notionNames.join(' › ')}`],
        fix('Open the product', editUrl),
      );
    } else {
      push(
        'category',
        'Categories assigned',
        'manual',
        `The Magento category tree could not be read (${categoryReason}).`,
        [`Notion: ${notionNames.join(' › ')}`],
        fix('Open the product', editUrl),
      );
    }
  } else {
    const mismatch = input.categoryCheck?.mismatches ?? [];
    // Compare against every checked path: a product can sit in several.
    const unmatched = unmatchedCategories(notionNames, magentoPaths.flat());
    if (mismatch.length > 0 || unmatched.length > 0) {
      push(
        'category',
        'Categories assigned',
        'missing',
        'Notion and Magento disagree on the category path.',
        [
          `Notion: ${notionNames.join(' › ')}`,
          `Magento: ${magentoPath.join(' › ')}`,
          ...mismatch,
          ...(unmatched.length
            ? [`Not matched in Magento: ${unmatched.join(', ')}`]
            : []),
        ],
        fix('Open the product', editUrl),
      );
    } else {
      push(
        'category',
        'Categories assigned',
        'pass',
        `Magento and Notion agree: ${magentoPath.join(' › ')}.`,
      );
    }
  }

  /* 3. Images ------------------------------------------------------------- */
  push(
    'images',
    'Images correct',
    'manual',
    'Image correctness (duplicates, order, background, placeholders) is not read by the resolver.',
    ['Run the Image audit for this SKU, fix the findings, then acknowledge this row.'],
    { label: 'Open Image audit', open: 'images' },
  );

  /* 4a. Colour and size --------------------------------------------------- */
  const labelled = children.filter((c) => c.color.trim() && c.size.trim());
  const unlabelled = children.length - labelled.length;
  if (children.length === 0) {
    push(
      'variants',
      'Colour and size correct',
      childCount > 0 ? 'manual' : 'na',
      childCount > 0
        ? `${childCount} child SKUs exist but no child rows were read.`
        : 'No child rows: nothing to compare (simple product).',
      [],
      fix('Open the product', editUrl),
    );
  } else if (unlabelled > 0) {
    push(
      'variants',
      'Colour and size correct',
      'manual',
      `${unlabelled} of ${children.length} child rows carry no colour/size label in the admin matrix.`,
      ['Verify the labels on the product edit page, then acknowledge this row.'],
      fix('Open the product', editUrl),
    );
  } else {
    const colours = [...new Set(labelled.map((c) => c.color.trim()))];
    const sizes = [...new Set(labelled.map((c) => c.size.trim()))];
    const targetColours = input.targets?.colors ?? [];
    const targetSizes = input.targets?.sizes ?? [];
    const missingColours = targetColours.filter((c) => !colours.includes(c));
    const missingSizes = targetSizes.filter((s) => !sizes.includes(s));
    if (missingColours.length > 0 || missingSizes.length > 0) {
      push(
        'variants',
        'Colour and size correct',
        'missing',
        'Some children expected from the variant matrix are missing.',
        [
          ...(missingColours.length
            ? [`Missing colours: ${missingColours.join(', ')}`]
            : []),
          ...(missingSizes.length ? [`Missing sizes: ${missingSizes.join(', ')}`] : []),
        ],
        fix('Open the product', editUrl),
      );
    } else {
      push(
        'variants',
        'Colour and size correct',
        'pass',
        `${colours.length} colour(s) × ${sizes.length} size(s), every child labelled.`,
        [`Colours: ${colours.join(', ')}`, `Sizes: ${sizes.join(', ')}`],
      );
    }
  }

  /* 4b. Size order -------------------------------------------------------- */
  const sizeList =
    input.targets?.sizes && input.targets.sizes.length > 0
      ? input.targets.sizes
      : [...new Set(labelled.map((c) => c.size.trim()))];
  if (sizeList.length === 0) {
    push(
      'size-order',
      'Size values ordered',
      'manual',
      'No size list was read, so its order cannot be checked.',
      ['New size attribute entries must be ordered in Magento.'],
      fix('Open the product', editUrl),
    );
  } else {
    const order = checkSizeOrder(sizeList);
    if (order.ok === null) {
      push(
        'size-order',
        'Size values ordered',
        'manual',
        `Custom size value(s) cannot be ranked: ${order.unknown.join(', ')}.`,
        ['Check the order manually; new size attribute entries must not show XL before S.'],
        fix('Open the product', editUrl),
      );
    } else if (!order.ok) {
      push(
        'size-order',
        'Size values ordered',
        'missing',
        `Sizes are not in the standard order: ${order.sizes.join(', ')}.`,
        [`Expected: ${expectedSizeOrder(order.sizes)}`],
        fix('Open the product', editUrl),
      );
    } else {
      push(
        'size-order',
        'Size values ordered',
        'pass',
        `Standard order: ${order.sizes.join(' < ')}.`,
      );
    }
  }

  /* 5. Tier prices -------------------------------------------------------- */
  push(
    'tier-prices',
    'Tier prices defined',
    'manual',
    'Tier prices are not read by the resolver. Compare Advanced Pricing in Magento with the Notion Tier Prices table.',
    ['Expected bands: Têxtil 100/250/500/5000 · Outros artigos 200/500/1000/5000.'],
    fix('Open Tier Prices (Notion)', TIER_PRICES_URL),
  );

  /* 6. Price and stock ---------------------------------------------------- */
  const supplier = (resolver?.supplier?.supplier ?? input.notion?.supplier ?? '').toUpperCase();
  const stockException = (STOCK_EXCEPTION_SUPPLIERS as readonly string[]).includes(
    supplier,
  );
  push(
    'price-stock',
    'Price and stock correct',
    'manual',
    stockException
      ? `${supplier} is a catalogue supplier without Magento stock management: verify the price and the catalogue availability only.`
      : 'Verify the price and stock quantity in Magento.',
    [
      stockException
        ? 'Stock exception applies (Workteam / JHK / ALLBEST).'
        : 'The Workteam / JHK / ALLBEST stock exception is still to be confirmed for other suppliers.',
    ],
    fix('Open the product', editUrl),
  );

  /* 7a. Type -------------------------------------------------------------- */
  const type = resolver?.product_type;
  if (!type) {
    push(
      'type',
      'Product type',
      'manual',
      'Magento did not report the product type.',
      [],
      fix('Open the product', editUrl),
    );
  } else if (type === 'configurable' && childCount === 0) {
    push(
      'type',
      'Product type',
      'missing',
      'Configurable product with no assigned children.',
      [],
      fix('Open the product', editUrl),
    );
  } else if (type !== 'configurable' && childCount > 0) {
    push(
      'type',
      'Product type',
      'missing',
      `${type} product with ${childCount} children assigned.`,
      [],
      fix('Open the product', editUrl),
    );
  } else {
    push(
      'type',
      'Product type',
      'pass',
      `${type}, ${childCount} child(ren).`,
    );
  }

  /* 7b. Visibility -------------------------------------------------------- */
  push(
    'visibility',
    'Visibility correct',
    'manual',
    'Visibility is not read by the resolver. Check Catalog, Search, or Not Visible Individually.',
    ['Expected: configurable parent = Catalog, Search; children = Not Visible Individually.'],
    fix('Open the product', editUrl),
  );

  /* 8. New colours -------------------------------------------------------- */
  push(
    'new-colours',
    'New colours linked',
    'manual',
    'New-colour detection is not defined yet. Compare the supplier reference list with the configurable children.',
    ['A new colour is never associated automatically; it must be added to the configurable.'],
    fix('Open the product', editUrl),
  );

  /* 9. Attribute translations -------------------------------------------- */
  push(
    'attribute-translations',
    'Catalogue attributes translated',
    'manual',
    'Composition, gender and ink colour (pens) must exist in EN, ES and FR.',
    ['Run the Text audit for this SKU, fix the findings, then acknowledge this row.'],
    { label: 'Open Text audit', open: 'text' },
  );

  /* 10. Name / description translations ---------------------------------- */
  push(
    'text-translations',
    'Name and descriptions translated',
    'manual',
    'Name, short description and description must exist in EN, ES and FR.',
    ['Run the Text audit for this SKU, fix the findings, then acknowledge this row.'],
    { label: 'Open Text audit', open: 'text' },
  );

  const counts: Record<EnableCheckStatus, number> = {
    pass: 0,
    missing: 0,
    manual: 0,
    na: 0,
  };
  for (const check of checks) counts[check.status] += 1;

  return {
    sku,
    checks,
    counts,
    blockers: counts.missing + counts.manual,
    ready: counts.missing === 0 && counts.manual === 0,
    summary: {
      magentoStatus: resolver?.magento_status?.label ?? 'unknown',
      productType: resolver?.product_type ?? '—',
      children: childCount,
      supplier: resolver?.supplier?.supplier ?? input.notion?.supplier ?? '—',
      ppCode:
        magentoPp && notionPp
          ? samePpCode(magentoPp, notionPp)
            ? magentoPp
            : `${magentoPp} (Magento) / ${notionPp} (Notion)`
          : magentoPp || notionPp || '—',
      categoryPath: magentoPath.join(' › ') || notionNames.join(' › ') || '—',
      availability: input.availability?.verdict ?? 'not checked',
    },
    adminUrl: editUrl,
    checkedAt: new Date().toISOString(),
  };
}
