// Feature: inline grid row actions instead of the "Select" dropdown.
import { ENHANCE_ROW_ACTIONS } from '../../../shared/flags';
import { enhanceRowActions } from './index';

/**
 * Grid rows: replace each row's "Select ▾" dropdown with an inline selector.
 * Idempotent, and it runs on every scan, so rows Magento rebuilds after a
 * filter, sort or pager click are picked up without any extra wiring.
 */
export function enhanceGridRowActions(): void {
  if (!ENHANCE_ROW_ACTIONS) return;
  enhanceRowActions();
}
