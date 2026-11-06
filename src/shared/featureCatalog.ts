// The one list of page features.
//
// Before this file there were four parallel lists that had to agree by hand:
// the defaults in `featureSettings.ts`, the `if (f.x) safe(...)` chain in
// `content.ts`, the ids returned by `detectPageFeatures()`, and the toggle rows
// in the side panel. A rename in one of them produced a switch that rendered,
// saved and did nothing, and no check failed.
//
// Now this catalog is the source, and `src/page/features/registry.ts` attaches
// a mount to every key (typed exhaustively, so a missing mount is a type error).
// Order here is mount order and panel order.
import {
  ENHANCE_ACTIVE_FILTERS,
  ENHANCE_CATEGORY_TREE,
  ENHANCE_MASSACTIONS,
  ENHANCE_NAV_TOGGLE,
  ENHANCE_PAGING_SIZES,
  ENHANCE_ROW_ACTIONS,
  ENHANCE_SELECTS,
  MOVE_PAGE_ACTIONS,
} from './flags';

export type FeatureKey =
  | 'extensionEnabled'
  | 'selects'
  | 'tierPrices'
  | 'navToggle'
  | 'rowActions'
  | 'assocBulk'
  | 'massactions'
  | 'paging'
  | 'activeFilters'
  | 'categoryTree'
  | 'pageActions'
  | 'skuCopy'
  | 'productTypeBadge'
  | 'gridCopy'
  | 'storeViews'
  | 'configButtons'
  | 'errorMarkup'
  | 'optionsCompanion'
  | 'optionsItems';

/** Panel heading a feature is listed under. */
export type FeatureGroup =
  | 'Global'
  | 'Page chrome'
  | 'Grid'
  | 'Product form'
  | 'Category tree';

export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  'Global',
  'Page chrome',
  'Grid',
  'Product form',
  'Category tree',
];

export interface FeatureMeta {
  readonly id: FeatureKey;
  /** Operator-facing name. Never the raw storage key. */
  readonly label: string;
  /** One line, shown as the toggle's tooltip. */
  readonly description: string;
  readonly group: FeatureGroup;
  readonly defaultOn: boolean;
  /**
   * False when a build-time const in `flags.ts` has switched the feature off.
   * The toggle then renders disabled instead of pretending it does something.
   */
  readonly available: boolean;
  /**
   * Is this feature relevant to the page in front of us? Used only to decide
   * which toggles the panel lists — never to decide what to mount.
   */
  readonly detect: (doc: Document) => boolean;
}

const has = (doc: Document, selector: string): boolean =>
  doc.querySelector(selector) !== null;

/** Matches the selectors the old `detectPageFeatures()` used, exactly. */
const GRID = '.data-grid';
const PRODUCT_FORM = '#product_form, .product-edit, [data-ui-id="product-form"]';
const CUSTOM_OPTIONS = '.custom-options, .options';

export const FEATURE_CATALOG: readonly FeatureMeta[] = [
  {
    id: 'extensionEnabled',
    label: 'Extension',
    description:
      'Master switch. Turning this off stops every page feature from mounting.',
    group: 'Global',
    defaultOn: true,
    available: true,
    detect: () => true,
  },
  {
    id: 'selects',
    label: 'Searchable dropdowns',
    description:
      'Long Magento dropdowns become a searchable picker. The native select stays in the page and keeps the value.',
    group: 'Global',
    defaultOn: true,
    available: ENHANCE_SELECTS,
    detect: (doc) => has(doc, 'select'),
  },
  {
    id: 'tierPrices',
    label: 'Tier price fill buttons',
    description:
      'Fills the tier price rows from the Notion reference bands (textil / outros artigos).',
    group: 'Product form',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, PRODUCT_FORM),
  },
  {
    id: 'navToggle',
    label: 'Sidebar toggle',
    description:
      'A fixed chevron on the admin menu edge hides it so the grid gets the width back.',
    group: 'Page chrome',
    defaultOn: true,
    available: ENHANCE_NAV_TOGGLE,
    detect: (doc) => has(doc, '.admin__menu, nav.admin__menu'),
  },
  {
    id: 'rowActions',
    label: 'Inline row actions',
    description:
      'Each grid row shows its actions inline instead of behind a "Select" dropdown. Clicks forward to Magento\'s own menu.',
    group: 'Grid',
    defaultOn: true,
    available: ENHANCE_ROW_ACTIONS,
    detect: (doc) => has(doc, GRID),
  },
  {
    id: 'assocBulk',
    label: 'Bulk select by SKU',
    description:
      'Paste SKUs into the "Select Associated Product" window and they get ticked, including rows off the current page.',
    group: 'Grid',
    defaultOn: true,
    available: true,
    detect: (doc) =>
      has(doc, 'aside[class*="configurable_associated_product_modal"]'),
  },
  {
    id: 'massactions',
    label: 'Bulk action buttons',
    description:
      'The toolbar\'s Actions menu becomes one-click buttons. Nothing is submitted by the extension.',
    group: 'Grid',
    defaultOn: true,
    available: ENHANCE_MASSACTIONS,
    detect: (doc) => has(doc, GRID),
  },
  {
    id: 'paging',
    label: 'Per-page sizes',
    description:
      'The grid\'s "per page" dropdown becomes a segmented control.',
    group: 'Grid',
    defaultOn: true,
    available: ENHANCE_PAGING_SIZES,
    detect: (doc) => has(doc, '.selectmenu, .paging, .toolbar-amount'),
  },
  {
    id: 'activeFilters',
    label: 'Editable filter chips',
    description:
      'A pencil on every active filter chip edits its value in place, then re-queries through Magento\'s own Apply control.',
    group: 'Grid',
    defaultOn: true,
    available: ENHANCE_ACTIVE_FILTERS,
    detect: (doc) => has(doc, '.active-filters, .filter-actions'),
  },
  {
    id: 'categoryTree',
    label: 'Category tree tools',
    description:
      'Branch toggles, a filter over names and index numbers, Tree/List switch and a "selected only" filter on the categories tree.',
    group: 'Category tree',
    defaultOn: true,
    available: ENHANCE_CATEGORY_TREE,
    detect: (doc) =>
      has(doc, '.category-tree, #category_ids, .categories-side-col'),
  },
  {
    id: 'pageActions',
    label: 'Actions in the header',
    description:
      'Moves the Save / Add action bar into the admin header. Switched off in this build.',
    group: 'Page chrome',
    defaultOn: false,
    available: MOVE_PAGE_ACTIONS,
    detect: (doc) => has(doc, '.page-actions, .page-actions-buttons'),
  },
  {
    id: 'skuCopy',
    label: 'Copy SKU and name',
    description: 'Copy buttons next to the SKU and Name fields.',
    group: 'Product form',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, PRODUCT_FORM),
  },
  {
    id: 'productTypeBadge',
    label: 'Product type badge',
    description:
      'Shows whether the open product is Simple or Configurable, next to the title.',
    group: 'Product form',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, PRODUCT_FORM),
  },
  {
    id: 'gridCopy',
    label: 'Row copy and open',
    description:
      'Copy a cell value, or open the row\'s product, without leaving the grid.',
    group: 'Grid',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, GRID),
  },
  {
    id: 'storeViews',
    label: 'Store view quick-open',
    description:
      'EN / ES / FR buttons beside the store switcher open the same page in that view.',
    group: 'Page chrome',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, '.store-switcher, .store-view'),
  },
  {
    id: 'configButtons',
    label: 'Colour group buttons',
    description:
      '"Colour (N)" buttons that open every child product of that colour.',
    group: 'Product form',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, '.configurable, .super-attribute'),
  },
  {
    id: 'errorMarkup',
    label: 'Listing error markup',
    description:
      'Priority indicators next to the fields a listing error refers to, with the reason.',
    group: 'Product form',
    defaultOn: true,
    available: true,
    detect: () => true,
  },
  {
    id: 'optionsCompanion',
    label: 'Option language strip',
    description:
      'Per-language chips on each custom-option row, plus the Original / Lang switch.',
    group: 'Product form',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, CUSTOM_OPTIONS),
  },
  {
    id: 'optionsItems',
    label: 'Options Items panel',
    description:
      'A grouped, parallel view of the Options Items table. Writes go through the page\'s own inputs.',
    group: 'Product form',
    defaultOn: true,
    available: true,
    detect: (doc) => has(doc, CUSTOM_OPTIONS),
  },
];

/** Storage keys and their defaults, derived from the catalog. */
export const FEATURE_DEFAULTS: Record<string, boolean> = Object.fromEntries(
  FEATURE_CATALOG.map((feature) => [feature.id, feature.defaultOn]),
);

/** Features that have a settable key (everything except the master switch). */
export const MOUNTABLE_FEATURE_IDS = FEATURE_CATALOG.filter(
  (feature) => feature.id !== 'extensionEnabled',
).map((feature) => feature.id);

/**
 * Which features are relevant to the page in front of us. Feeds only the
 * panel's toggle list — mounting is driven by the settings, not by this.
 */
export function detectFeatureIds(doc: Document): string[] {
  return FEATURE_CATALOG.filter((feature) => feature.detect(doc)).map(
    (feature) => feature.id,
  );
}

export function featureMeta(id: FeatureKey): FeatureMeta {
  const found = FEATURE_CATALOG.find((feature) => feature.id === id);
  if (!found) throw new Error(`Unknown feature: ${id}`);
  return found;
}
