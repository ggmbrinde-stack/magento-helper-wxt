import { defineContentScript } from 'wxt/sandbox';
import type { ListingError } from '../shared/schemas';
import { ENHANCE_NAV_TOGGLE, MOVE_PAGE_ACTIONS } from '../shared/flags';
import { detectStoreView } from '../shared/store';
import { isProductEditPage, readFormState, readPageSku } from '../page/shared/magentoForm';
import { ensureUi } from '../ui';
import { watchToolkitColors } from '../ui/tokens';
import { watchMagentoPageTheme } from '../page/theme/magentoTheme';
import type {
  ApplyFieldRequest,
  GetConfigResponse,
  GetFormStateResponse,
  GetSkuResponse,
  SearchMagentoResponse,
} from '../core/messages';

// Page features. Each one owns a folder (src/page/features/<feature>/) with its
// mount function, and the scan loop below is the only place they are ordered.
import { enhanceAdminSelects } from '../page/features/dropdowns/scan';
import { enhanceAdminNavToggle } from '../page/features/nav-toggle';
import { enhanceGridRowActions } from '../page/features/row-actions/scan';
import { enhanceMassactions } from '../page/features/massactions/scan';
import { enhanceGridPagingSizes } from '../page/features/paging-sizes/scan';
import { enhanceActiveFilterChips } from '../page/features/active-filters/scan';
import { enhanceCategoryTree } from '../page/features/category-tree/scan';
import { movePageActionsToHeader } from '../page/features/page-header';
import { scanEditPage } from '../page/features/sku-copy';
import { renderProductTypeBadge } from '../page/features/product-type';
import { addGridCopyButtons, scanGrid } from '../page/features/grid-copy';
import { addStoreViewButtons } from '../page/features/store-views';
import { extractColorGroups, renderConfigButtons } from '../page/features/config-groups';
import { applyErrorMarkup, maybeRequestErrorMarkup } from '../page/features/error-markup';
import { handleApplyField } from '../page/features/form-fill';
import { handleSearchMagento } from '../page/features/grid-search';
import { addOptionsCompanion } from '../page/features/options-companion';
import { enhanceOptionsItems } from '../page/features/options-items';
import { renderTierPricesButtons, findTierPricesTable } from '../page/features/tier-prices';
import { mhxVisTest } from '../page/features/vis-test';

/**
 * The scan loop.
 *
 * This file is deliberately thin: it boots the toolkit, runs the feature mounts
 * in order, and answers the panel's messages. Anything that touches the page
 * belongs to a feature folder, so two features can be worked on without both
 * agents editing one 1,500-line file.
 *
 * Runs on every matched admin page (debounced by the observer). Each step is
 * idempotent, so re-running is safe and picks up AJAX-loaded sections, and each
 * step is isolated: one enhancer throwing must never skip the rest (a dead
 * dropdown pass once cost the operator every pencil on the page).
 */
function scan(): void {
  const safe = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      console.warn(`[BOG Helper] scan step "${name}" failed:`, err);
    }
  };

  // First, so a later step throwing cannot cost the operator their dropdowns.
  safe('selects', enhanceAdminSelects);
  safe('tierPrices', renderTierPricesButtons);
  // The page-feature styles are not injected from here: they are part of the
  // toolkit sheet (src/ui/toolkit.css), which ensureUi() puts on the page in
  // main() before the first scan. Features only pass classes.
  // First, so a later step throwing cannot cost the operator their dropdowns.
  safe('selects', enhanceAdminSelects);
  safe('navToggle', () => {
    if (ENHANCE_NAV_TOGGLE) enhanceAdminNavToggle();
  });
  safe('rowActions', enhanceGridRowActions);
  safe('massactions', enhanceMassactions);
  safe('paging', enhanceGridPagingSizes);
  safe('activeFilters', enhanceActiveFilterChips);
  safe('categoryTree', enhanceCategoryTree);
  if (MOVE_PAGE_ACTIONS) safe('pageActions', () => movePageActionsToHeader());
  safe('scanEditPage', scanEditPage);
  safe('productTypeBadge', renderProductTypeBadge);
  safe('scanGrid', scanGrid);
  safe('gridCopy', addGridCopyButtons);
  safe('storeViews', addStoreViewButtons);
  safe('configButtons', renderConfigButtons);
  safe('errorMarkup', maybeRequestErrorMarkup);
  // Options features: run on every scan so they pick up AJAX-loaded rows; each
  // one is a no-op outside the custom-options editor.
  safe('optionsCompanion', addOptionsCompanion);
  safe('optionsItems', enhanceOptionsItems);
}

export default defineContentScript({
  // Admin hosts (QA + all live storefronts/admins). Static matches are
  // required for the content script to inject at all.
  matches: [
    'https://bestofgifts-pt-qa.toogas.net/*',
    'https://bestofgifts.pt/*',
    'https://bestofgifts.eu/*',
    'https://bestofgifts.es/*',
    'https://bestofgifts.fr/*',
  ],
  runAt: 'document_idle',
  main() {
    // Tab that predates an extension reload? The background injects this bundle
    // on demand (see ensureHelperContentScript). A second injection must not
    // bind a second message listener or start a second scan loop, so the boot
    // is idempotent per document.
    const booted = window as unknown as Record<string, unknown>;
    if (booted.__mhxContentLoaded) return;
    booted.__mhxContentLoaded = true;

    // One toolkit sheet per page (link, inline fallback) plus the operator's
    // custom toolkit colours from Settings. Features call ensureUi() too; this
    // first call gets the sheet on the page before the first scan draws.
    ensureUi();
    watchToolkitColors();
    // Keep the admin's own colours in step with the stored theme preference.
    watchMagentoPageTheme();
    scan();
    let timer: number | undefined;
    new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 200);
    }).observe(document.body, { childList: true, subtree: true });

    // Visibility probe: proves the content script ran even when no feature
    // matches the page. Remove with src/page/features/vis-test.
    mhxVisTest();

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const type = message?.type;
      if (type === 'GET_FORM_STATE') {
        const state = readFormState(detectStoreView(location.href));
        const response: GetFormStateResponse = isProductEditPage(location.href)
          ? { available: true, state }
          : {
              available: false,
              reason:
                'Open a Magento product edit page (admin) to fill fields.',
            };
        sendResponse(response);
        return false;
      }
      if (type === 'APPLY_FIELD') {
        sendResponse(handleApplyField(message as ApplyFieldRequest));
        return false;
      }
      if (type === 'GET_CONFIG') {
        sendResponse(extractColorGroups());
        return false;
      }
      if (type === 'GET_SKU') {
        const response: GetSkuResponse = { sku: readPageSku() };
        sendResponse(response);
        return false;
      }
      if (type === 'SEARCH_MAGENTO') {
        const req = message as {
          sku?: string;
          childIds?: string[];
          parentId?: string;
          expand?: boolean;
          readFacts?: boolean;
        };
        void handleSearchMagento(
          String(req.sku ?? ''),
          req.childIds,
          req.parentId,
          Boolean(req.expand),
          Boolean(req.readFacts),
        ).then(sendResponse);
        return true;
      }
      if (type === 'ERROR_MARKUP') {
        // D12 fix: report real matched/unmatched counts instead of always {success:true}.
        const { matched, unmatched } = applyErrorMarkup((message.errors ?? []) as ListingError[]);
        sendResponse({ success: matched > 0 || unmatched === 0, matched, unmatched });
        return false;
      }
      return false;
    });
  },
});
