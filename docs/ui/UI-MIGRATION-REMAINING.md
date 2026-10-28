# UI Toolkit Migration — Remaining Work

The toolkit is the shared styling source for reusable controls. Feature sheets
may remain where they define unique layout or behavior, but should not redefine
toolkit primitives or use extension-surface colors on Magento pages.

## Current adoption

- `activeFilters` uses toolkit chips, buttons, and inline fields; its local
  stylesheet is layout-only.
- `pageHeader`, `rowActions`, `massactionButtons`, and `adminNavToggle` use
  toolkit primitives.
- `enhanceSelect` uses toolkit button, popover, popover-item, and segmented
  primitives. Its wrapper, search field, positioning, and behavior remain
  feature-specific.
- `categoryTree` uses toolkit segmented, button, badge, and chip primitives for its
  view switch, tree actions, code badges, and selected-category pills. Code badges
  use `badge()` with feature-specific overrides (monospace font, 34px min-width,
  3px border-radius). Selected pills use `chip()` with feature-specific overrides
  (accent border, accent text, 12px border-radius). The category list, search
  field, tree layout, checkbox state indicators, indentation, collapse behavior,
  and Magento-specific wiring remain feature-specific.
- `pagingSizes` uses segmented and inline-field primitives; its Magento widget
  reset and compact field sizing remain feature-specific.
- `content.ts` uses toolkit buttons, badges, and toast, and no longer injects a
  stylesheet of its own: the copy/store/open-size buttons, the grid "copy all"
  button, the product-type badges and the error indicators now live in
  `toolkit.css` under "Magento page features", written in layer-1 tokens. The
  feature keeps its class names and state modifiers; only layout specifics
  (widths, margins, `vertical-align`) stay feature-shaped.
- Dashboard and side panel are extension-owned surfaces with their own
  stylesheet and palette.

## Remaining migration

1. ~~Consolidate `categoryTree`'s code badges and selected-category pills where
   toolkit primitives can preserve the current semantics and presentation.~~
   Done: code badges use `badge()` with monospace/min-width overrides;
   selected pills use `chip()` with accent overrides. Search field kept custom
   (compact toolbar). Category list, tree layout, and Magento wiring remain
   feature-specific.
2. Reduce the remaining custom picker/search styling in `enhanceSelect`.
3. ~~Move `content.ts` error indicators and label treatments onto reusable
   toolkit primitives where their tooltip and priority behavior can be kept.~~
   Moved into the toolkit as part of the page-feature section (layer-1 tokens
   and the `data-theme` dark-admin fallback). They are still named features
   rather than `.mhx-btn`/`.mhx-badge` variants, because they inherit Magento's
   box model; folding them into the primitives is the remaining step.
4. Reduce remaining page-specific layout and reset styles without moving
   Magento-specific selectors into the toolkit.
5. Keep generated toolkit copies in sync with `src/ui/toolkit.css`; use the
   check-only sync mode in build hooks so stale copies fail visibly without
   being overwritten.

`npm run check:ui` enforces color ownership, primitive ownership, theme-layer
boundaries, the `!important` budget, exact generated-copy synchronization, and
page-token use.
