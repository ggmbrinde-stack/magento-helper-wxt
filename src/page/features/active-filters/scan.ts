// Feature: a pencil per active-filter chip, editing the value in place.
import { ENHANCE_ACTIVE_FILTERS } from '../../../shared/flags';
import { enhanceActiveFilters } from './index';

/**
 * Grid "Active filters" chips: a pencil per chip that edits the value inline
 * and re-queries through Magento's own apply control. Idempotent, so chips
 * Magento rebuilds after a filter reload get pencils again on the next scan.
 */
export function enhanceActiveFilterChips(): void {
  if (!ENHANCE_ACTIVE_FILTERS) return;
  enhanceActiveFilters();
}
