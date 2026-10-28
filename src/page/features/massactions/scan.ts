// Feature: one-click buttons for the grid's bulk Actions menu.
import { ENHANCE_MASSACTIONS } from '../../../shared/flags';
import { enhanceMassactionButtons } from './index';

/**
 * Grid massaction (bulk Actions) toolbar dropdown: one-click buttons for each
 * action, so bulk actions no longer cost a menu-open plus a pick. Idempotent,
 * so AJAX reloads keep working.
 */
export function enhanceMassactions(): void {
  if (!ENHANCE_MASSACTIONS) return;
  enhanceMassactionButtons();
}
