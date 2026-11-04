import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseDecimal,
  parseTierPriceInputs,
  type TierFieldInput,
} from '../../page/features/grid-search/adminFacts';
import {
  TIER_PRICE_TABLES,
  compareTierPrices,
  tierTableForCategory,
} from '../enableFlow';
import { MAGENTO_FACTS_VERSION, type ResolverTierPrice } from '../../shared/resolver';
import { factsNeedRead } from '../skuResolution';

function tierInput(name: string, value: string, text?: string): TierFieldInput {
  return { name, value, text };
}

function tierRow(
  index: number,
  fields: { qty?: string; type?: string; percent?: string; price?: string },
): TierFieldInput[] {
  const out: TierFieldInput[] = [];
  if (fields.qty !== undefined) {
    out.push(tierInput(`tier_price[${index}][price_qty]`, fields.qty));
  }
  if (fields.type !== undefined) {
    out.push(tierInput(`tier_price[${index}][value_type]`, fields.type));
  }
  if (fields.percent !== undefined) {
    out.push(tierInput(`tier_price[${index}][percentage_value]`, fields.percent));
  }
  if (fields.price !== undefined) {
    out.push(tierInput(`tier_price[${index}][price]`, fields.price));
  }
  out.push(
    tierInput(`tier_price[${index}][website_id]`, '0', 'All Websites'),
    tierInput(`tier_price[${index}][cust_group]`, '32000', 'ALL GROUPS'),
  );
  return out;
}

test('parseDecimal reads Magento decimals and locale labels', () => {
  assert.equal(parseDecimal('1.25'), 1.25);
  assert.equal(parseDecimal(' 10 '), 10);
  assert.equal(parseDecimal('1.234,56 €'), 1234.56);
  assert.equal(parseDecimal('1,234.56'), 1234.56);
  assert.equal(parseDecimal('-3'), -3);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal(null), null);
  assert.equal(parseDecimal('n/a'), null);
});

test('parseTierPriceInputs groups rows and skips incomplete ones', () => {
  const inputs = [
    ...tierRow(0, { qty: '100', type: 'percent', percent: '5' }),
    ...tierRow(1, { qty: '250', type: 'fixed', price: '1.10' }),
    // Magento leaves an empty trailing row in the table.
    ...tierRow(2, { qty: '', type: 'percent', percent: '' }),
    // A value type of "percent" with no percentage cannot be trusted.
    ...tierRow(3, { qty: '500', type: 'percent' }),
  ];

  assert.deepEqual(parseTierPriceInputs(inputs), [
    {
      qty: 100,
      valueType: 'percent',
      value: 5,
      website: 'All Websites',
      group: 'ALL GROUPS',
    },
    {
      qty: 250,
      valueType: 'fixed',
      value: 1.1,
      website: 'All Websites',
      group: 'ALL GROUPS',
    },
  ]);
});

test('parseTierPriceInputs treats a blank value type with a percentage as percent', () => {
  const rows = parseTierPriceInputs(
    tierRow(0, { qty: '500', type: '', percent: '10' }),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.valueType, 'percent');
  assert.equal(rows[0]?.value, 10);
});

test('tierTableForCategory classifies Têxtil, Outros, and refuses to guess', () => {
  assert.equal(tierTableForCategory(['Vestuário', 'T-shirts']), TIER_PRICE_TABLES[0]);
  assert.equal(tierTableForCategory(['Têxtil']), TIER_PRICE_TABLES[0]);
  assert.equal(tierTableForCategory(['Escrita e Escritório', 'Canetas']), TIER_PRICE_TABLES[1]);
  assert.equal(tierTableForCategory([]), null);
  assert.equal(tierTableForCategory(['Default Category']), null);
  assert.equal(
    tierTableForCategory(['Default Category', 'Têxtil', 'Outros']),
    TIER_PRICE_TABLES[0],
  );
});

test('compareTierPrices ignores the implicit 0% band', () => {
  const table = TIER_PRICE_TABLES[1]!; // Outros artigos
  const rows: ResolverTierPrice[] = [
    { qty: 200, valueType: 'percent', value: 5, website: '', group: '' },
    { qty: 500, valueType: 'percent', value: 8, website: '', group: '' },
    { qty: 1000, valueType: 'percent', value: 10, website: '', group: '' },
    { qty: 5000, valueType: 'percent', value: 12, website: '', group: '' },
  ];

  const comparison = compareTierPrices(rows, table, 2);
  assert.deepEqual(comparison.expected.map((band) => band.qty), [200, 500, 1000, 5000]);
  assert.deepEqual(comparison.missing, []);
  assert.deepEqual(comparison.wrong, []);
  assert.deepEqual(comparison.extra, []);
});

test('compareTierPrices reports a missing threshold and a wrong percentage', () => {
  const table = TIER_PRICE_TABLES[1]!;
  const rows: ResolverTierPrice[] = [
    { qty: 200, valueType: 'percent', value: 5, website: '', group: '' },
    { qty: 1000, valueType: 'percent', value: 7, website: '', group: '' },
  ];

  const comparison = compareTierPrices(rows, table, 2);
  assert.deepEqual(comparison.missing, [500, 5000]);
  assert.deepEqual(comparison.wrong, [{ qty: 1000, expected: 10, found: [7] }]);
});

test('compareTierPrices converts a fixed row with the product price and flags it', () => {
  const table = TIER_PRICE_TABLES[1]!;
  const rows: ResolverTierPrice[] = [
    { qty: 200, valueType: 'fixed', value: 1.8, website: '', group: '' },
  ];

  const withPrice = compareTierPrices(rows, table, 2);
  assert.ok(Math.abs((withPrice.actual[0]?.percent ?? 0) - 10) < 1e-9);
  assert.deepEqual(withPrice.fixed, [200]);
  assert.equal(withPrice.wrong[0]?.qty, 200);
  assert.equal(withPrice.wrong[0]?.expected, 5);
  assert.ok(Math.abs((withPrice.wrong[0]?.found[0] ?? 0) - 10) < 1e-9);

  const noPrice = compareTierPrices(rows, table, null);
  assert.equal(noPrice.actual[0]?.percent, null);
  assert.deepEqual(noPrice.missing, [200, 500, 1000, 5000]);
});

test('compareTierPrices lets any group row satisfy a threshold', () => {
  const table = TIER_PRICE_TABLES[1]!;
  const rows: ResolverTierPrice[] = [
    { qty: 200, valueType: 'percent', value: 8, website: '1', group: '1' },
    { qty: 200, valueType: 'percent', value: 5, website: '0', group: '32000' },
    { qty: 500, valueType: 'percent', value: 8, website: '', group: '' },
    { qty: 1000, valueType: 'percent', value: 10, website: '', group: '' },
    { qty: 5000, valueType: 'percent', value: 12, website: '', group: '' },
  ];

  const comparison = compareTierPrices(rows, table, 2);
  assert.deepEqual(comparison.wrong, []);
  assert.deepEqual(comparison.missing, []);
});

function facts(overrides: {
  version?: number;
  readAt?: string;
}): Parameters<typeof factsNeedRead>[0] {
  return {
    factsVersion: overrides.version ?? MAGENTO_FACTS_VERSION,
    attributeSet: 'AS>PP0323_CANETAS',
    attributeSetId: '42',
    ppCode: '323',
    categoryPaths: [['Escrita']],
    categoryIds: [['41']],
    categoryRead: true,
    tierPrices: [],
    tierRead: true,
    priceRead: true,
    price: { price: 1.25, specialPrice: null, cost: null, taxClass: '' },
    stockRead: true,
    stock: { qty: 1, isInStock: true, backorders: '' },
    visibilityRead: true,
    visibility: 'Catalog, Search',
    statusRead: true,
    status: 'Enabled',
    websitesRead: true,
    websites: [],
    weightRead: true,
    weight: null,
    readAt: overrides.readAt ?? new Date().toISOString(),
  };
}

test('factsNeedRead re-reads missing, old-format and stale snapshots', () => {
  assert.equal(factsNeedRead(undefined), true);
  assert.equal(factsNeedRead(facts({ version: MAGENTO_FACTS_VERSION - 1 })), true);
  assert.equal(factsNeedRead(facts({})), false);
  assert.equal(
    factsNeedRead(
      facts({ readAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }),
    ),
    true,
  );
  assert.equal(factsNeedRead(facts({ readAt: 'not a date' })), true);
});
