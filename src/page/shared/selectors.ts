// Attributes that mark OUR own injected controls, so text read out of a
// Magento cell can never pick up an icon or a label we added.

export const BTN_ATTR = 'data-mhx-sku-copy';
export const OPEN_ATTR = 'data-mhx-open';
// Both of our injected controls: stripped from any text read out of a cell, so
// a copied SKU can never pick up a stray icon or label.
export const INJECTED_SELECTOR = `[${BTN_ATTR}="1"], [${OPEN_ATTR}="1"]`;
