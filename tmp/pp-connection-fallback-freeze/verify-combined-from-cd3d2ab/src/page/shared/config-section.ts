// Locating Magento's "Configurations" section on a product edit page.
// Shared by the product-type badge and the colour-group buttons.

/**
 * Locate the Configurations (configurable-matrix) section, by data-index first
 * and by section title text as a fallback (Magento renders either shape).
 */
export function findConfigSection(): Element | null {
  const byIndex = document.querySelector('[data-index="configurable-matrix"]');
  if (byIndex) return byIndex;
  const wrappers = document.querySelectorAll(
    '.admin__collapsible-block-wrapper, .fieldset-wrapper, fieldset',
  );
  for (const wrapper of Array.from(wrappers)) {
    const title = wrapper.querySelector(
      '.admin__collapsible-title, .admin__fieldset legend, .legend',
    );
    if (title?.textContent?.toLowerCase().includes('configurations')) {
      return wrapper;
    }
  }
  return null;
}

export function isCollapsed(wrapper: Element | null): boolean {
  if (!wrapper) return false;
  const collapsible = wrapper.classList.contains(
    'admin__collapsible-block-wrapper',
  )
    ? wrapper
    : wrapper.closest('.admin__collapsible-block-wrapper');
  return Boolean(
    collapsible &&
      !collapsible.classList.contains('_show') &&
      collapsible.querySelector('.admin__collapsible-title'),
  );
}
