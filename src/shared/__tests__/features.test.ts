/**
 * The feature catalog is the single list that the scan loop, the settings
 * defaults and the side-panel toggles all read. These tests pin the parts that
 * would otherwise break silently:
 *
 *   - the storage contract (key names and their defaults) cannot drift,
 *   - every catalog entry is complete and grouped,
 *   - page detection still recognises the pages it used to,
 *   - the page-context resolver reads Magento admin URLs without hardcoding
 *     the per-install admin frontname.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
// jsdom ships no types and is only used by these DOM tests.
// @ts-expect-error - untyped transitive dependency
import { JSDOM } from 'jsdom';

import { resolvePageContext } from '../pageContext';
import {
  FEATURE_CATALOG,
  FEATURE_DEFAULTS,
  FEATURE_GROUPS,
  detectFeatureIds,
} from '../featureCatalog';

function docWith(html: string): Document {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  return dom.window.document;
}

// ---- storage contract ----------------------------------------------------

test('the catalog still declares every storage key with its default', () => {
  // If one of these changes, the operator's saved `featureFlags` object stops
  // matching what the panel writes. Pin the names and the two non-obvious
  // defaults: the master switch is on, page actions are off.
  const expected = {
    extensionEnabled: true,
    selects: true,
    tierPrices: true,
    navToggle: true,
    rowActions: true,
    assocBulk: true,
    massactions: true,
    paging: true,
    activeFilters: true,
    categoryTree: true,
    pageActions: false,
    skuCopy: true,
    productTypeBadge: true,
    gridCopy: true,
    storeViews: true,
    configButtons: true,
    errorMarkup: true,
    optionsCompanion: true,
    optionsItems: true,
  };
  assert.deepEqual(FEATURE_DEFAULTS, expected);
});

test('every default has a catalog entry and vice versa', () => {
  const catalogIds = FEATURE_CATALOG.map((feature) => feature.id);
  assert.deepEqual(catalogIds, Object.keys(FEATURE_DEFAULTS));
  assert.equal(new Set(catalogIds).size, catalogIds.length, 'duplicate feature id');
});

// ---- catalog shape -------------------------------------------------------

test('every feature is labelled, described and grouped', () => {
  for (const feature of FEATURE_CATALOG) {
    assert.ok(feature.label.length > 2, `${feature.id}: label is empty`);
    assert.notEqual(feature.label, feature.id, `${feature.id}: label is the raw key`);
    assert.ok(
      feature.description.length > 20,
      `${feature.id}: description is too short to help an operator`,
    );
    assert.ok(
      (FEATURE_GROUPS as readonly string[]).includes(feature.group),
      `${feature.id}: group "${feature.group}" is not a known group`,
    );
  }
});

test('a build-disabled feature is reported as unavailable, not silently toggleable', () => {
  // MOVE_PAGE_ACTIONS is false by board direction; the toggle must say so.
  const pageActions = FEATURE_CATALOG.find((f) => f.id === 'pageActions');
  assert.ok(pageActions);
  assert.equal(pageActions.available, false);
  assert.equal(pageActions.defaultOn, false);
});

// ---- page detection ------------------------------------------------------

test('an empty admin page detects only the master switch and error markup', () => {
  assert.deepEqual(detectFeatureIds(docWith('')), ['extensionEnabled', 'errorMarkup']);
});

test('a grid page detects the grid features', () => {
  const detected = detectFeatureIds(
    docWith('<table class="data-grid"><tbody></tbody></table>'),
  );
  for (const id of ['rowActions', 'massactions', 'gridCopy']) {
    assert.ok(detected.includes(id), `${id} not detected on a grid page`);
  }
});

test('a product edit page detects the product-form features', () => {
  const detected = detectFeatureIds(
    docWith(`
      <form id="product_form">
        <select name="product[status]"><option>1</option></select>
      </form>
    `),
  );
  for (const id of ['skuCopy', 'productTypeBadge', 'tierPrices', 'selects']) {
    assert.ok(detected.includes(id), `${id} not detected on a product edit page`);
  }
});

test('detection ids are unique and follow catalog order', () => {
  const detected = detectFeatureIds(
    docWith('<div class="data-grid"></div><div class="store-switcher"></div>'),
  );
  assert.equal(new Set(detected).size, detected.length);
  const order = FEATURE_CATALOG.map((f) => f.id).filter((id) => detected.includes(id));
  assert.deepEqual(detected, order);
});

// ---- page context --------------------------------------------------------

test('reads the live edit URL, frontname and product id included', () => {
  const ctx = resolvePageContext(
    'https://bestofgifts.pt/admin_L2pZx/catalog/product/edit/id/329035/key/abc123/',
  );
  assert.equal(ctx.route, 'catalog/product/edit');
  assert.equal(ctx.area, 'product-edit');
  assert.equal(ctx.productId, '329035');
});

test('reads the QA frontname the same way', () => {
  const ctx = resolvePageContext(
    'https://bestofgifts-pt-qa.toogas.net/admin/catalog/product/index/key/abc123/',
  );
  assert.equal(ctx.route, 'catalog/product/index');
  assert.equal(ctx.area, 'product-grid');
  assert.equal(ctx.productId, undefined);
});

test('classifies category, customer and dashboard pages', () => {
  assert.equal(
    resolvePageContext('https://bestofgifts.pt/admin_L2pZx/catalog/category/edit/id/42/').area,
    'category',
  );
  assert.equal(
    resolvePageContext('https://bestofgifts.pt/admin_L2pZx/customer/index/index/').area,
    'customer',
  );
  assert.equal(
    resolvePageContext('https://bestofgifts.pt/admin_L2pZx/admin/dashboard/index/key/x/').area,
    'other',
  );
});

test('a storefront URL is not mistaken for an admin page', () => {
  const ctx = resolvePageContext('https://bestofgifts.pt/pt/algum-produto.html?x=1#y');
  assert.equal(ctx.area, 'other');
  assert.equal(ctx.productId, undefined);
});

test('a malformed URL does not throw', () => {
  assert.doesNotThrow(() => resolvePageContext('not a url'));
  assert.equal(resolvePageContext('').area, 'other');
});
