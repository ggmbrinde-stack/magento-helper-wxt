// Mounts for the feature catalog.
//
// `src/shared/featureCatalog.ts` says what each feature is (key, label, page
// detection, default). This file says what it runs. The record below is typed
// against the catalog's keys, so adding a feature without a mount — or a mount
// without a catalog entry — is a type error rather than a switch that silently
// does nothing.
//
// Order in the catalog is mount order. Every mount is idempotent; `content.ts`
// isolates each one so a throw cannot skip the rest.
import type { FeatureKey } from '../../shared/featureCatalog';
import { ENHANCE_NAV_TOGGLE, MOVE_PAGE_ACTIONS } from '../../shared/flags';

import { enhanceAdminSelects } from './dropdowns/scan';
import { enhanceAdminNavToggle } from './nav-toggle';
import { enhanceGridRowActions } from './row-actions/scan';
import { enhanceMassactions } from './massactions/scan';
import { enhanceGridPagingSizes } from './paging-sizes/scan';
import { enhanceActiveFilterChips } from './active-filters/scan';
import { enhanceCategoryTree } from './category-tree/scan';
import { movePageActionsToHeader } from './page-header';
import { scanEditPage } from './sku-copy';
import { renderProductTypeBadge } from './product-type';
import { addGridCopyButtons, scanGrid } from './grid-copy';
import { addStoreViewButtons } from './store-views';
import { renderConfigButtons } from './config-groups';
import { maybeRequestErrorMarkup } from './error-markup';
import { addOptionsCompanion } from './options-companion';
import { enhanceOptionsItems } from './options-items';
import { renderTierPricesButtons } from './tier-prices';

/** Every key except the master switch, which gates the whole run. */
export type MountableFeatureKey = Exclude<FeatureKey, 'extensionEnabled'>;

/**
 * Build-time kill switches that used to live in `content.ts`. They stay here so
 * the master chain has one shape: a catalog entry, a settings key, a mount, and
 * at most one const that can veto it.
 */
export const FEATURE_MOUNTS: Record<MountableFeatureKey, () => void> = {
  selects: enhanceAdminSelects,
  tierPrices: renderTierPricesButtons,
  navToggle: () => {
    if (ENHANCE_NAV_TOGGLE) enhanceAdminNavToggle();
  },
  rowActions: enhanceGridRowActions,
  massactions: enhanceMassactions,
  paging: enhanceGridPagingSizes,
  activeFilters: enhanceActiveFilterChips,
  categoryTree: enhanceCategoryTree,
  pageActions: () => {
    if (MOVE_PAGE_ACTIONS) movePageActionsToHeader();
  },
  skuCopy: scanEditPage,
  productTypeBadge: renderProductTypeBadge,
  gridCopy: () => {
    scanGrid();
    addGridCopyButtons();
  },
  storeViews: addStoreViewButtons,
  configButtons: renderConfigButtons,
  errorMarkup: maybeRequestErrorMarkup,
  optionsCompanion: addOptionsCompanion,
  optionsItems: enhanceOptionsItems,
};
