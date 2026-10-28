// Feature: the Simple / Configurable badge next to the page title and SKU.
import { isProductEditPage, readPageSku } from '../../shared/magentoForm';
import { findConfigSection } from '../../shared/config-section';

/** Detect whether the open product edit page is a Simple or Configurable product. */
export function detectProductType(): 'configurable' | 'simple' | null {
  if (!isProductEditPage(location.href)) return null;

  // 1. Check if the Configurations area has actual items/rows (definitive Configurable indicator)
  const configSection = findConfigSection();
  if (configSection) {
    const table = configSection.querySelector('table');
    if (table) {
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const hasChildRows = rows.some((row) => {
        if (
          row.classList.contains('empty-text') ||
          row.classList.contains('data-grid-tr-no-data')
        ) {
          return false;
        }
        return (
          row.hasAttribute('data-product-id') ||
          row.querySelector(
            'td[data-index="product_id"], td[data-index="sku"], td[data-index="attributes"]',
          ) !== null ||
          row.children.length > 2
        );
      });
      if (hasChildRows) {
        return 'configurable';
      }
    }
  }

  // 2. Check for configurable matrix rows or associated products anywhere in DOM
  const matrixRows = document.querySelectorAll(
    '[data-index="configurable-matrix"] tbody tr:not(.empty-text):not(.data-grid-tr-no-data), [data-index="associated_products"] tbody tr:not(.empty-text)',
  );
  if (matrixRows.length > 0) {
    return 'configurable';
  }

  // 3. Check for "Edit Configurations" button (present on configurable products)
  const editConfigBtn = document.querySelector(
    '[data-index="edit_configurable_products_button"], button[data-action="edit-attribute"]',
  );
  if (editConfigBtn) {
    return 'configurable';
  }

  // 4. Direct input checks (type_id)
  const typeInput = document.querySelector<HTMLInputElement>(
    'input[name="product[type_id]"], input[name="type"], [data-form-part="product_form"][name*="type_id"]',
  );
  if (typeInput?.value) {
    const val = typeInput.value.toLowerCase().trim();
    if (val === 'configurable' || val.includes('config')) return 'configurable';
    if (val === 'simple') return 'simple';
  }

  // 5. Default on product edit page with SKU
  if (readPageSku() || document.querySelector('input[name="product[sku]"]')) {
    return 'simple';
  }

  return null;
}

/** Prominent "Simple" / "Configurable" badge next to the page title and SKU. */
export function renderProductTypeBadge(): void {
  if (!isProductEditPage(location.href)) return;

  const type = detectProductType();
  if (!type) return;

  const labelText = type === 'configurable' ? 'Configurable' : 'Simple';
  const badgeClass = `mhx-product-type-badge mhx-product-type-badge--${type}`;

  // 1. Mount next to page title
  const titleTarget =
    document.querySelector('[data-ui-id="page-title-wrapper"]') ??
    document.querySelector('.page-title') ??
    document.querySelector('.page-main-actions .page-title') ??
    document.querySelector('.admin__page-heading');

  if (titleTarget) {
    let badge =
      titleTarget.parentElement?.querySelector<HTMLElement>('.mhx-product-type-badge--title') ??
      titleTarget.querySelector<HTMLElement>('.mhx-product-type-badge--title');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = `${badgeClass} mhx-product-type-badge--title`;
      titleTarget.insertAdjacentElement('afterend', badge);
    }
    badge.className = `${badgeClass} mhx-product-type-badge--title`;
    badge.textContent = labelText;
  }

  // 2. Also mount next to SKU field label
  const skuInput = document.querySelector<HTMLInputElement>('input[name="product[sku]"]');
  if (skuInput) {
    const field = skuInput.closest('.admin__field');
    const label = field?.querySelector('label');
    if (label) {
      let skuBadge = label.querySelector<HTMLElement>('.mhx-product-type-badge--sku');
      if (!skuBadge) {
        skuBadge = document.createElement('span');
        skuBadge.className = `${badgeClass} mhx-product-type-badge--sku`;
        label.appendChild(skuBadge);
      }
      skuBadge.className = `${badgeClass} mhx-product-type-badge--sku`;
      skuBadge.textContent = labelText;
    }
  }
}
