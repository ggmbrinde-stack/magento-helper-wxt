import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIER_PRICE_TABLES,
  buildEnableFlow,
  checkSizeOrder,
  foldCategoryName,
  standardSizeRank,
  unmatchedCategories,
  type PpAssignment,
} from '../enableFlow';

const ppComplete: PpAssignment = {
  found: true,
  url: 'https://app.notion.com/407b6705ae1f81c88c29d34e0ea78f56',
  assignment: 'M22498',
  status: 'Done',
  ppCode: '323',
  categories: ['6.2. CANETAS', '6. ESCRITA E ESCRITÓRIO'],
  subSubCategories: ['6.2.1. Canetas de Plástico'],
  original: '',
  notes: '',
};

const resolverComplete = {
  sku: 'M22498',
  product_type: 'configurable' as const,
  child_count: 2,
  children_detail: [
    { id: '1', sku: 'M22498NEGS/T', color: 'Preto', size: 'M', source: 'admin' as const },
    { id: '2', sku: 'M22498NEGS/T', color: 'Preto', size: 'L', source: 'admin' as const },
  ],
  categories: {
    ok: true,
    l1: 'Escrita e Escritório',
    l2: 'Canetas',
    l3: 'Canetas de Plástico',
    l4: '',
    path: ['Escrita e Escritório', 'Canetas', 'Canetas de Plástico'],
    urls: [],
    ids: [],
    source: 'document' as const,
  },
  magento_facts: {
    attributeSet: 'AS>PP0323_CANETAS PLÁSTICO',
    ppCode: '323',
    categoryPaths: [['Escrita e Escritório', 'Canetas', 'Canetas de Plástico']],
    categoryRead: true,
    readAt: '2026-11-02T00:00:00.000Z',
  },
  configurable_id: 364009,
  simple_product_id: null,
  magento_status: { label: 'Disabled' },
  supplier: { supplier: 'MAKITO', tier: 1 },
};

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    sku: 'M22498',
    resolver: resolverComplete,
    targets: { colors: ['Preto'], sizes: ['M', 'L'] },
    pp: ppComplete,
    ...overrides,
  };
}

function checkOf(
  report: ReturnType<typeof buildEnableFlow>,
  id: string,
): ReturnType<typeof buildEnableFlow>['checks'][number] {
  const found = report.checks.find((check) => check.id === id);
  assert.ok(found, `check "${id}" exists`);
  return found;
}

test('a fully readable SKU passes every automatic check', () => {
  const report = buildEnableFlow(baseInput());

  assert.equal(checkOf(report, 'pp').status, 'pass');
  assert.match(checkOf(report, 'pp').detail, /PP 323/);
  assert.equal(checkOf(report, 'category').status, 'pass');
  assert.match(checkOf(report, 'category').detail, /Escrita e Escritório › Canetas/);
  assert.equal(checkOf(report, 'variants').status, 'pass');
  assert.equal(checkOf(report, 'size-order').status, 'pass');
  assert.equal(checkOf(report, 'type').status, 'pass');

  assert.equal(report.counts.missing, 0);
  assert.equal(report.ready, false, 'manual rows still need verification');
  assert.equal(report.blockers, report.counts.missing + report.counts.manual);
  assert.equal(report.counts.manual, 7);
  assert.equal(report.summary.magentoStatus, 'Disabled');
  assert.equal(report.summary.ppCode, '323');
  assert.match(report.adminUrl, /catalog\/product\/edit\/id\/364009/);
});

test('a SKU with no Notion row still passes on the Magento PP and categories', () => {
  const report = buildEnableFlow(
    baseInput({ pp: { ...ppComplete, found: false, ppCode: '', categories: [] } }),
  );
  assert.equal(checkOf(report, 'pp').status, 'pass');
  assert.match(checkOf(report, 'pp').detail, /PP 323.*Magento Attribute Set/);
  assert.equal(checkOf(report, 'category').status, 'pass');
  assert.match(checkOf(report, 'category').detail, /Magento: Escrita e Escritório/);
  assert.equal(report.summary.ppCode, '323');
});

test('a SKU with neither a Notion row nor readable Magento facts is missing both', () => {
  const report = buildEnableFlow(
    baseInput({
      pp: { ...ppComplete, found: false, ppCode: '', categories: [] },
      resolver: {
        ...resolverComplete,
        categories: { ...resolverComplete.categories, ok: false, path: [] },
        magento_facts: undefined,
      },
    }),
  );
  assert.equal(checkOf(report, 'pp').status, 'missing');
  assert.match(checkOf(report, 'pp').detail, /No row for M22498/);
  assert.equal(checkOf(report, 'category').status, 'missing');
  assert.match(checkOf(report, 'category').detail, /No Notion row/);
});

test('a PP mismatch between Notion and Magento blocks the SKU', () => {
  const report = buildEnableFlow(
    baseInput({
      pp: { ...ppComplete, ppCode: '452' },
    }),
  );
  const pp = checkOf(report, 'pp');
  assert.equal(pp.status, 'missing');
  assert.match(pp.detail, /Notion 452 vs Magento 323/);
  assert.equal(report.summary.ppCode, '323 (Magento) / 452 (Notion)');
});

test('leading zeros are not a PP mismatch', () => {
  const report = buildEnableFlow(
    baseInput({
      resolver: {
        ...resolverComplete,
        magento_facts: { ...resolverComplete.magento_facts, ppCode: '0323' },
      },
    }),
  );
  assert.equal(checkOf(report, 'pp').status, 'pass');
  assert.equal(report.summary.ppCode, '0323');
});

test('Magento read but empty is missing, not manual', () => {
  const report = buildEnableFlow(
    baseInput({
      pp: { ...ppComplete, ppCode: '', categories: [], subSubCategories: [] },
      resolver: {
        ...resolverComplete,
        categories: { ...resolverComplete.categories, ok: false, path: [] },
        magento_facts: {
          ...resolverComplete.magento_facts,
          ppCode: '',
          attributeSet: 'AS>TÊXTIL',
          categoryPaths: [],
          categoryRead: true,
        },
      },
    }),
  );
  assert.equal(checkOf(report, 'pp').status, 'missing');
  assert.match(checkOf(report, 'pp').detail, /no PP in the Magento Attribute Set/);
  assert.equal(checkOf(report, 'category').status, 'missing');
  assert.match(checkOf(report, 'category').detail, /No category in Notion or Magento/);
});

test('PP Not Applicable is a pass-through, not a blocker', () => {
  const report = buildEnableFlow(
    baseInput({
      pp: { ...ppComplete, status: 'Not Applicable', ppCode: '' },
      resolver: {
        ...resolverComplete,
        categories: { ...resolverComplete.categories, ok: false, path: [] },
        magento_facts: {
          ...resolverComplete.magento_facts,
          attributeSet: 'AS>TÊXTIL',
          ppCode: '',
          categoryPaths: [],
          categoryRead: true,
        },
      },
    }),
  );
  assert.equal(checkOf(report, 'pp').status, 'na');
  assert.equal(report.summary.ppCode, '—');
});

test('an unreadable Notion tracker is manual, never missing or pass', () => {
  const report = buildEnableFlow(
    baseInput({ pp: null, ppError: 'Notion token not configured' }),
  );
  assert.equal(checkOf(report, 'pp').status, 'manual');
  assert.equal(checkOf(report, 'category').status, 'manual');
  assert.match(checkOf(report, 'pp').detail, /Notion token not configured/);
});

test('a category mismatch between Notion and Magento blocks the SKU', () => {
  const report = buildEnableFlow(
    baseInput({
      pp: { ...ppComplete, categories: ['6.4. BLOCOS E CADERNOS'] },
    }),
  );
  const category = checkOf(report, 'category');
  assert.equal(category.status, 'missing');
  assert.match(category.detail, /disagree/);
  assert.ok(category.notes.some((n) => n.includes('Not matched in Magento')));
});

test('an unreadable Magento breadcrumb is manual with the Notion path shown', () => {
  const report = buildEnableFlow(
    baseInput({
      resolver: {
        ...resolverComplete,
        categories: {
          ...resolverComplete.categories,
          ok: false,
          path: [],
        },
        magento_facts: undefined,
      },
    }),
  );
  const category = checkOf(report, 'category');
  assert.equal(category.status, 'manual');
  assert.ok(category.notes.some((n) => n.includes('Notion: 6.2. CANETAS')));
});

test('unlabelled admin children are manual, not a pass', () => {
  const report = buildEnableFlow(
    baseInput({
      resolver: {
        ...resolverComplete,
        children_detail: [
          { id: '1', sku: 'M22498NEGS/T', color: '', size: '', source: 'admin' },
        ],
      },
    }),
  );
  const variants = checkOf(report, 'variants');
  assert.equal(variants.status, 'manual');
  assert.match(variants.detail, /no colour\/size label/);
});

test('a configurable product with no children is missing its type', () => {
  const report = buildEnableFlow(
    baseInput({ resolver: { ...resolverComplete, child_count: 0, children_detail: [] } }),
  );
  const type = checkOf(report, 'type');
  assert.equal(type.status, 'missing');
  assert.match(type.detail, /no assigned children/);
});

test('wrong size order is a blocker that prints the expected order', () => {
  const report = buildEnableFlow(
    baseInput({ targets: { colors: ['Preto'], sizes: ['XL', 'S', 'M'] } }),
  );
  const order = checkOf(report, 'size-order');
  assert.equal(order.status, 'missing');
  assert.ok(order.notes.includes('Expected: S < M < XL'));
});

test('standard size ranking covers aliases, and numeric sizes sort numerically', () => {
  assert.equal(standardSizeRank('S'), 30);
  assert.equal(standardSizeRank('2XL'), standardSizeRank('XXL'));
  assert.equal(standardSizeRank('xxxl'), standardSizeRank('3XL'));
  assert.equal(standardSizeRank('Único'), null);

  assert.equal(checkSizeOrder(['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']).ok, true);
  assert.equal(checkSizeOrder(['XL', 'S']).ok, false);
  assert.equal(checkSizeOrder(['36', '38', '40']).ok, true);
  assert.equal(checkSizeOrder(['38', '36']).ok, false);

  const custom = checkSizeOrder(['S', 'Único']);
  assert.equal(custom.ok, null);
  assert.deepEqual(custom.unknown, ['Único']);
});

test('category folding ignores numbering, accents and case', () => {
  assert.equal(foldCategoryName('6.2. CANETAS'), 'canetas');
  assert.equal(foldCategoryName('6. ESCRITA E ESCRITÓRIO'), 'escrita e escritorio');
  assert.deepEqual(
    unmatchedCategories(
      ['6.2. CANETAS', '6. ESCRITA E ESCRITÓRIO'],
      ['Escrita e Escritório', 'Canetas'],
    ),
    [],
  );
  assert.deepEqual(
    unmatchedCategories(['6.2. CANETAS'], ['Escrita e Escritório', 'Blocos']),
    ['6.2. CANETAS'],
  );
});

test('the tier snapshot matches the Notion page', () => {
  const textile = TIER_PRICE_TABLES.find((t) => t.name === 'Têxtil');
  const other = TIER_PRICE_TABLES.find((t) => t.name === 'Outros artigos');
  assert.ok(textile && other);
  assert.deepEqual(
    textile.bands.map((b) => [b.from, b.to, b.discount]),
    [
      [0, 99, 0],
      [100, 249, 5],
      [250, 499, 8],
      [500, 4999, 10],
      [5000, null, 12],
    ],
  );
  assert.deepEqual(
    other.bands.map((b) => [b.from, b.to, b.discount]),
    [
      [0, 199, 0],
      [200, 499, 5],
      [500, 999, 8],
      [1000, 4999, 10],
      [5000, null, 12],
    ],
  );
});
