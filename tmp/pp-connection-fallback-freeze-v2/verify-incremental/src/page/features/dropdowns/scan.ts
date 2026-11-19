// Feature: reshape the admin's own dropdowns (store switcher, long selects,
// the grid's "per page" control).
import { ENHANCE_MIN_OPTIONS, ENHANCE_SELECTS } from '../../../shared/flags';
import { enhanceSelect } from './index';

/**
 * Reshape the admin's own dropdowns.
 *
 * Scope is deliberately narrow, and the shape follows the list:
 *   - store switcher and any form select past `ENHANCE_MIN_OPTIONS` options
 *     become a searchable picker,
 *   - the grid "per page" control becomes a segmented control,
 *     because six options never needed a dropdown.
 * Everything shorter than that is left exactly as Magento drew it.
 * Nothing is written and no request is made — the native <select> stays in the
 * page and remains the source of truth for the form.
 */
export function enhanceAdminSelects(): void {
  if (!ENHANCE_SELECTS) return;

  // Store switcher first: it is the anchor the panel's buttons already use.
  const switcher = document.querySelector<HTMLSelectElement>(
    '.store-switcher select',
  );
  if (switcher) {
    enhanceSelect(switcher, {
      label: 'Store View',
      searchPlaceholder: 'Search store views…',
    });
  }

  // Grid "per page" control. A short, fixed list: the native dropdown buys
  // nothing but a click to open, so show every choice inline instead.
  document
    .querySelectorAll<HTMLSelectElement>(
      '.admin__data-grid-pager select, [data-role="selectPageSize"]',
    )
    .forEach((select) => {
      enhanceSelect(select, {
        presentation: 'segmented',
        label: 'Results per page',
      });
    });

  document
    .querySelectorAll<HTMLSelectElement>(
      '.admin__field-control select, select.admin__control-select',
    )
    .forEach((select) => {
      if (select.options.length < ENHANCE_MIN_OPTIONS) return;
      enhanceSelect(select, { searchPlaceholder: 'Search…' });
    });
}
