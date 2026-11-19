// Feature: the grid pager's "per page" control as a segmented strip.
import { ENHANCE_PAGING_SIZES } from '../../../shared/flags';
import { enhancePagingSizes } from './index';

/**
 * Grid pager: Magento renders the "per page" control as a `.selectmenu`
 * widget, not a <select>, so it gets its own pass. Idempotent, so the debounced
 * scan re-applies it after each Knockout re-render.
 */
export function enhanceGridPagingSizes(): void {
  if (!ENHANCE_PAGING_SIZES) return;
  enhancePagingSizes();
}
