import { defineContentScript } from 'wxt/sandbox';
import {
  FieldSnapshotStore,
  MAGE_FIELDS,
  applyFieldValue,
  findField,
  isProductEditPage,
  normalizeSku,
  readFieldValue,
  readFormState,
  readPageSku,
  type MageFieldKind,
} from '../lib/magentoForm';
import { detectStoreView, OPEN_STORE_VIEWS, STORE_VIEW_IDS, scopeAdminUrl } from '../lib/store';
import {
  ENHANCE_ACTIVE_FILTERS,
  ENHANCE_CATEGORY_TREE,
  ENHANCE_MASSACTIONS,
  ENHANCE_MIN_OPTIONS,
  ENHANCE_NAV_TOGGLE,
  ENHANCE_PAGING_SIZES,
  ENHANCE_ROW_ACTIONS,
  ENHANCE_SELECTS,
  MOVE_PAGE_ACTIONS,
  WRITES_ENABLED,
} from '../lib/flags';
import { enhanceActiveFilters } from '../lib/activeFilters';
import { enhanceMassactionButtons } from '../lib/massactionButtons';
import { enhanceAdminNavToggle } from '../lib/adminNavToggle';
import { enhanceSelect } from '../lib/enhanceSelect';
import { enhanceCategoryTrees } from '../lib/categoryTree';
import { enhanceRowActions } from '../lib/rowActions';
import { enhancePagingSizes } from '../lib/pagingSizes';
import { movePageActionsToHeader } from '../lib/pageHeader';
import { productEditUrl } from '../lib/productLink';
import {
  cellForColumn,
  cellTextValue,
  collectColumnValues,
  gridTables,
  hasColumn,
  rowsOf,
  tableColumns,
  type SkuKind,
} from '../lib/gridCells';
import { watchMagentoPageTheme } from '../lib/magentoTheme';
import { ensureUi } from '../ui';
import { watchToolkitColors } from '../ui/tokens';
import type { ListingError } from '../lib/schemas';
import type {
  ApplyFieldRequest,
  ApplyFieldResponse,
  ConfigGroup,
  GetConfigResponse,
  GetFormStateResponse,
  GetSkuResponse,
  LookupChild,
  ResolverEntry,
  SearchMagentoResponse,
} from '../lib/messages';

const BTN_ATTR = 'data-mhx-sku-copy';
const OPEN_ATTR = 'data-mhx-open';
// Both of our injected controls: stripped from any text read out of a cell, so
// a copied SKU can never pick up a stray icon or label.
const INJECTED_SELECTOR = `[${BTN_ATTR}="1"], [${OPEN_ATTR}="1"]`;

// Last resolver key written, so the debounced scan doesn't hit storage on every
// DOM mutation when nothing relevant changed.
let lastResolverKey = '';

// SKU we last requested error-markup for, so the request fires once per product.
let markedSku = '';

const ICON_COPY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const ICON_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
const ICON_CHECK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

const ICON_HIGH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
const ICON_MEDIUM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
const ICON_LOW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';

const PRIORITY_ICONS: Record<string, string> = {
  High: ICON_HIGH,
  Medium: ICON_MEDIUM,
  Low: ICON_LOW,
};
const PRIORITY_CLASS: Record<string, string> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
};
const PRIORITY_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

// Order matters: findErrorFields returns the first match, so longer/more
// specific phrases (box/bag dimensions) must precede the generic ones.
const ERROR_FIELD_MAP: { keywords: string[]; fields: string[] }[] = [
  { keywords: ['box dimensions'], fields: ['box_dimensions'] },
  { keywords: ['bag dimensions'], fields: ['bag_dimensions'] },
  { keywords: ['dimensions'], fields: ['dimensions'] },
  { keywords: ['weight'], fields: ['weight'] },
  { keywords: ['grammage'], fields: ['grammage'] },
  {
    keywords: ['image', 'photo', 'picture', 'media', 'gallery', 'thumbnail'],
    fields: [
      'image',
      'thumbnail',
      'small_image',
      'swatch_image',
      'media_gallery',
    ],
  },
  {
    keywords: ['stock', 'quantity', 'inventory', 'qty'],
    fields: ['quantity_and_stock_status', 'qty'],
  },
  {
    keywords: ['price', 'cost', 'special_price', 'tier'],
    fields: ['price', 'special_price', 'tier_price'],
  },
  {
    keywords: ['attribute', 'color', 'option', 'variant'],
    fields: ['color', 'size'],
  },
  {
    keywords: ['category', 'taxonom', 'tag'],
    fields: ['category_ids', 'product_tag'],
  },
  {
    keywords: ['related', 'upsell', 'crosssell', 'cross-sell'],
    fields: ['related_products', 'upsell_products', 'crosssell_products'],
  },
  {
    keywords: [
      'translation',
      'text',
      'title',
      'description',
      'meta',
      'keyword',
      'seo',
      'url',
    ],
    fields: [
      'name',
      'description',
      'short_description',
      'meta_title',
      'meta_description',
      'meta_keywords',
      'url_key',
    ],
  },
];

// Fields on the product edit page that get a copy button. The broad text-input
// selector was removed because it injected a button next to every text field.
const EDIT_COPY_FIELDS = [
  'input[name="product[sku]"]',
  'input[name="product[name]"]',
];

// Snapshots live for the lifetime of the content script (the open tab), so an
// Undo always steps back to what the field held before this extension wrote.
const snapshots = new FieldSnapshotStore();

const PAGE_STYLES = `
.mhx-sku-copy-btn{display:inline-flex;align-items:center;justify-content:center;margin-right:8px;padding:0 6px;width:28px;height:24px;border:1px solid #c8c8c8;border-radius:2px;background:#f8f8f8;color:#555;cursor:pointer;vertical-align:middle;}
.mhx-sku-copy-btn:hover{background:#efefef;border-color:#b0b0b0;}
.mhx-sku-copy-btn:active{background:#e4e4e4;}
.mhx-sku-copy-btn--feedback{color:#2e7d32 !important;border-color:#2e7d32 !important;}
.mhx-sku-copy-btn--open{color:var(--mhx-accent,#d81b60);border-color:var(--mhx-accent,#d81b60);}
.mhx-sku-copy-btn--open:hover{background:var(--mhx-accent,#d81b60);border-color:var(--mhx-accent,#d81b60);color:var(--mhx-on-accent,#fff);}
.mhx-store-buttons{display:inline-flex;gap:4px;margin-left:32px;align-items:center;}
.mhx-store-btn{padding:2px 8px;font-size:11px;border:1px solid var(--mhx-accent,#d81b60);border-radius:3px;background:var(--mhx-surface,#fff);color:var(--mhx-accent,#d81b60);cursor:pointer;font-weight:600;}
.mhx-store-btn:hover{background:var(--mhx-accent,#d81b60);color:var(--mhx-on-accent,#fff);}
.mhx-store-btn--all{border-color:#e65100;background:#e65100;color:#fff;}
.mhx-store-btn--all:hover{background:#bf360c;border-color:#bf360c;}
.mhx-open-sizes-btn{margin-left:4px;padding:2px 6px;font-size:11px;border:1px solid var(--mhx-accent,#d81b60);border-radius:3px;background:var(--mhx-accent,#d81b60);color:var(--mhx-on-accent,#fff);cursor:pointer;font-weight:600;}
.mhx-open-sizes-btn:hover{background:var(--mhx-accent-2,#ad1457);border-color:var(--mhx-accent-2,#ad1457);}
/* .mhx-toast + variants: the toolkit's toast primitive (src/ui/toolkit.css). */
.mhx-error-indicator{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;margin-left:6px;cursor:help;position:relative;vertical-align:middle;flex-shrink:0;}
.mhx-error-indicator svg{width:14px;height:14px;}
.mhx-error-indicator--high{background:#ffebee;color:#c62828;border:1px solid #c62828;}
.mhx-error-indicator--medium{background:#fff3e0;color:#e65100;border:1px solid #e65100;}
.mhx-error-indicator--low{background:#fff9c4;color:#f57f17;border:1px solid #f57f17;}
.mhx-error-indicator:hover::after{content:attr(data-tooltip);position:absolute;bottom:100%;left:50%;transform:translateX(-50%);padding:6px 10px;background:#333;color:#fff;font-size:11px;font-weight:400;white-space:normal;max-width:300px;text-align:left;line-height:1.4;border-radius:3px;z-index:10000;margin-bottom:4px;}
/* D2: host class drives display — reversible on indicator clear (no inline styles on Magento's labels). */
.mhx-error-label-host{display:inline-flex;align-items:center;}
.mhx-error-label--high label,.mhx-error-label--high .admin__field-label,.mhx-error-label--high .admin_field-label{color:#c62828 !important;font-weight:700 !important;}
.mhx-error-label--medium label,.mhx-error-label--medium .admin__field-label,.mhx-error-label--medium .admin_field-label{color:#e65100 !important;font-weight:700 !important;}
.mhx-error-label--low label,.mhx-error-label--low .admin__field-label,.mhx-error-label--low .admin_field-label{color:#f57f17 !important;font-weight:700 !important;}
.mhx-grid-copy-wrap{display:inline-flex;gap:6px;align-items:center;margin-left:8px;vertical-align:middle;}
.mhx-grid-copy-all{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;font-size:12px;font-weight:600;border:1px solid var(--mhx-accent,#d81b60);border-radius:3px;background:var(--mhx-accent,#d81b60);color:var(--mhx-on-accent,#fff);cursor:pointer;vertical-align:middle;white-space:nowrap;}
.mhx-grid-copy-all:hover{background:var(--mhx-accent-2,#ad1457);border-color:var(--mhx-accent-2,#ad1457);}
.mhx-grid-copy-all svg{width:14px;height:14px;display:block;}
.mhx-grid-copy-all.mhx-sku-copy-btn--feedback{background:#2e7d32 !important;border-color:#2e7d32 !important;color:#fff !important;}
`;

const STYLE_ID = 'mhx-page-styles';

/** Inject the page-UI stylesheet once (hover/active need real CSS). */
function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAGE_STYLES;
  (document.head ?? document.documentElement).appendChild(style);
}

/** Small bottom-right notification, replacing the vanilla toast helper. */
function showToast(text: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  document.querySelector('.mhx-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `mhx-toast mhx-toast--${kind}`;
  const span = document.createElement('span');
  span.textContent = text;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.addEventListener('click', () => toast.remove());
  toast.append(span, close);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mhx-sku-copy-btn';
  btn.setAttribute(BTN_ATTR, '1');
  btn.innerHTML = ICON_COPY;
  btn.title = 'Copy';
  return btn;
}

function flashCopied(btn: HTMLButtonElement, ok = true): void {
  btn.innerHTML = ok ? ICON_CHECK : ICON_COPY;
  btn.classList.add('mhx-sku-copy-btn--feedback');
  btn.title = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => {
    btn.innerHTML = ICON_COPY;
    btn.classList.remove('mhx-sku-copy-btn--feedback');
    btn.title = 'Copy';
  }, 1200);
}

/** Clipboard write with a legacy fallback (clipboard API can reject). */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to the execCommand path
    }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, ta.value.length);
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
}

function scanEditPage(): void {
  EDIT_COPY_FIELDS.forEach((selector) => {
    const inputs =
      document.querySelectorAll<HTMLInputElement>(selector);
    inputs.forEach((input) => {
      if (!input.value || input.getAttribute('data-mhx-btn') === '1') return;
      const field = input.closest('.admin__field');
      const label = field?.querySelector('label') ?? null;
      const container =
        label ?? input.closest('.admin__field-control') ?? input.parentElement;
      if (!container?.parentNode) return;
      const btn = createButton();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyText(input.value).then(() => flashCopied(btn));
      });
      container.parentNode.insertBefore(btn, container);
      input.setAttribute('data-mhx-btn', '1');
    });
  });
}

function scanGrid(): void {
  gridTables(document).forEach((table) => {
    const columns = tableColumns(table);
    if (columns.length === 0) return;

    rowsOf(table).forEach((row) => {
      columns.forEach((column) => {
        const cell = cellForColumn(row, column);
        if (!cell) return;
        if (column.kind === 'sku') addOpenButton(cell, row);
        if (cell.querySelector(`[${BTN_ATTR}="1"]`)) return;
        const btn = createButton();
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          void copyText(cellTextValue(cell, INJECTED_SELECTOR)).then(() =>
            flashCopied(btn),
          );
        });
        cell.appendChild(btn);
      });
    });
  });
}

/**
 * A second small button in the SKU cell: open that product's edit page in a new
 * tab. Magento does not always link the name column, so the grid can otherwise
 * have no way in to the product.
 */
function addOpenButton(cell: Element, row: Element): void {
  if (cell.querySelector(`[${OPEN_ATTR}="1"]`)) return;
  const url = productEditUrl(row, location.origin, location.pathname);
  if (!url) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mhx-sku-copy-btn mhx-sku-copy-btn--open';
  btn.setAttribute(OPEN_ATTR, '1');
  btn.innerHTML = ICON_OPEN;
  btn.title = 'Open product in a new tab';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  });
  cell.appendChild(btn);
}

/**
 * The grid a toolbar button belongs to. The table itself is replaced by Magento
 * on AJAX reloads, so the scope is re-derived at click time rather than stored.
 *
 * A grid renders more than one `table.data-grid` when the sticky header is on
 * (its copy has an empty body), so callers use `gridTables`, which ranks by row
 * count instead of trusting document order.
 */
function gridScopeForButton(btn: HTMLButtonElement): ParentNode {
  return (
    btn.closest(
      '.admin__data-grid-outer-wrap, [data-role="grid"], .admin__data-grid-wrap',
    ) ?? document
  );
}

/** One copy-all button for a given column; flashes the count and toasts. */
function makeCopyButton(
  buttonLabel: string,
  plural: string,
  kind: SkuKind,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mhx-grid-copy-all';
  btn.title = `Copy every ${plural} on this page`;
  const icon = document.createElement('span');
  icon.innerHTML = ICON_COPY;
  const text = document.createElement('span');
  text.textContent = buttonLabel;
  btn.append(icon, text);

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Re-detect the grid + column at click time, using the same helpers as the
    // per-cell buttons. `gridTables` ranks by row count, so the sticky header's
    // row-less copy of the table can never win over the real listing.
    const tables = gridTables(gridScopeForButton(btn));
    if (tables.length === 0) {
      showToast('Product grid not found.', 'error');
      return;
    }
    if (!hasColumn(tables, kind)) {
      showToast(`No ${plural} column found.`, 'error');
      return;
    }

    const values = collectColumnValues(tables, kind, INJECTED_SELECTOR);
    if (values.length === 0) {
      showToast(`No ${plural} found on this page.`, 'error');
      return;
    }
    void copyText(values.join('\n'))
      .then(() => {
        text.textContent = `Copied ${values.length}`;
        btn.classList.add('mhx-sku-copy-btn--feedback');
        showToast(`Copied ${values.length} ${plural}.`, 'success');
        setTimeout(() => {
          text.textContent = buttonLabel;
          btn.classList.remove('mhx-sku-copy-btn--feedback');
        }, 1500);
      })
      .catch(() => showToast('Copy failed.', 'error'));
  });

  return btn;
}

/** Toolbar buttons that copy every SKU / Parent SKU listed in the grid. */
function addGridCopyButtons(): void {
  gridTables(document).forEach((table) => {
    const columns = tableColumns(table);
    const skuColumn = columns.find((c) => c.kind === 'sku') ?? null;
    const parentColumn = columns.find((c) => c.kind === 'parent_sku') ?? null;
    if (!skuColumn && !parentColumn) return;

    // D6 fix: Scope strictly to the grid's own outer wrap. Never fall back to
    // document.querySelector for searchWrap, which could borrow another grid's toolbar.
    const outer =
      table.closest<HTMLElement>(
        '[data-role="grid"], .admin__data-grid-outer-wrap, .admin__data-grid-wrap',
      );
    if (!outer) return;

    const searchWrap = outer.querySelector(
      '.data-grid-search-control-wrap, .admin__data-grid-search',
    );

    let parent: Element | null = null;
    let before: Node | null = null;
    if (searchWrap?.parentElement) {
      parent = searchWrap.parentElement;
      before = searchWrap.nextSibling;
    } else {
      parent =
        outer.querySelector('.admin__data-grid-header') ?? table.parentElement;
    }
    if (!parent || parent.querySelector('.mhx-grid-copy-wrap')) return;
    // Magento re-renders the toolbar; a reference node captured before that is
    // detached and `insertBefore` would throw NotFoundError.
    if (before && before.parentNode !== parent) before = null;

    const wrap = document.createElement('span');
    wrap.className = 'mhx-grid-copy-wrap';
    if (skuColumn) {
      wrap.appendChild(makeCopyButton('Copy SKUs', 'SKUs', 'sku'));
    }
    if (parentColumn) {
      wrap.appendChild(makeCopyButton('Copy Parent SKUs', 'Parent SKUs', 'parent_sku'));
    }
    parent.insertBefore(wrap, before);
  });
}

function scan(): void {
  // Runs on every matched admin page (debounced by the observer). Each step is
  // idempotent, so re-running is safe and picks up AJAX-loaded sections.
  // Each step is isolated: one enhancer throwing must never skip the rest
  // (a dead dropdown pass once cost the operator every pencil on the page).
  const safe = (name: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      console.warn(`[BOG Helper] scan step "${name}" failed:`, err);
    }
  };
  safe('styles', ensureStyles);
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
  safe('scanGrid', scanGrid);
  safe('gridCopy', addGridCopyButtons);
  safe('storeViews', addStoreViewButtons);
  safe('configButtons', renderConfigButtons);
  safe('resolver', buildResolver);
  safe('errorMarkup', maybeRequestErrorMarkup);
}

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
function enhanceAdminSelects(): void {
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

/**
 * Grid rows: replace each row's "Select ▾" dropdown with an inline selector.
 * Idempotent, and it runs on every scan, so rows Magento rebuilds after a
 * filter, sort or pager click are picked up without any extra wiring.
 */
function enhanceGridRowActions(): void {
  if (!ENHANCE_ROW_ACTIONS) return;
  enhanceRowActions();
}

function enhanceCategoryTree(): void {
  if (!ENHANCE_CATEGORY_TREE) return;
  enhanceCategoryTrees();
}

/**
 * Grid massaction (bulk Actions) toolbar dropdown: one-click buttons for each
 * action, so bulk actions no longer cost a menu-open plus a pick. Idempotent,
 * so AJAX reloads keep working.
 */
function enhanceMassactions(): void {
  if (!ENHANCE_MASSACTIONS) return;
  enhanceMassactionButtons();
}

/**
 * Grid "Active filters" chips: a pencil per chip that edits the value inline
 * and re-queries through Magento's own apply control. Idempotent, so chips
 * Magento rebuilds after a filter reload get pencils again on the next scan.
 */
function enhanceActiveFilterChips(): void {
  if (!ENHANCE_ACTIVE_FILTERS) return;
  enhanceActiveFilters();
}

/**
 * Grid pager: Magento renders the "per page" control as a `.selectmenu`
 * widget, not a <select>, so it gets its own pass. Idempotent, so the debounced
 * scan re-applies it after each Knockout re-render.
 */
function enhanceGridPagingSizes(): void {
  if (!ENHANCE_PAGING_SIZES) return;
  enhancePagingSizes();
}

/** On-page store-view quick-open buttons (EN/ES/FR) + "Open All". */
function addStoreViewButtons(): void {
  const switcher = document.querySelector('.store-switcher');
  if (!switcher) return;
  if (document.querySelector('.mhx-store-buttons')) return;

  const container = document.createElement('div');
  container.className = 'mhx-store-buttons';

  OPEN_STORE_VIEWS.forEach((view) => {
    const id = STORE_VIEW_IDS[view];
    if (!id) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mhx-store-btn';
    btn.textContent = view;
    btn.title = `Open ${view} store view`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = scopeAdminUrl(location.href, id);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    container.appendChild(btn);
  });

  const openAll = document.createElement('button');
  openAll.type = 'button';
  openAll.className = 'mhx-store-btn mhx-store-btn--all';
  openAll.textContent = `Open All (${OPEN_STORE_VIEWS.length} tabs)`;
  openAll.addEventListener('click', (e) => {
    e.preventDefault();
    const urls = OPEN_STORE_VIEWS.map((view) =>
      scopeAdminUrl(location.href, STORE_VIEW_IDS[view] ?? null),
    ).filter(Boolean);
    if (urls.length === 0) return;
    void chrome.runtime
      .sendMessage({
        type: 'OPEN_TAB_GROUP',
        urls,
        groupName: 'All Store Views',
      })
      .then(() => showToast(`Opened ${urls.length} store views.`, 'success'));
  });
  container.appendChild(openAll);

  switcher.parentNode?.insertBefore(container, switcher.nextSibling);
}

function configSectionTitle(): HTMLElement | null {
  const section = findConfigSection();
  if (!section) return null;
  return section.querySelector<HTMLElement>(
    '.admin__collapsible-title, .admin__fieldset legend, legend',
  );
}

/** On-page "Color (N)" buttons that open all child products in a tab group. */
function renderConfigButtons(): void {
  const result = extractColorGroups();
  if (!result.available || result.pending || result.groups.length === 0) return;

  const title = configSectionTitle();
  const parent = title?.parentElement;
  if (!title || !parent) return;

  result.groups.forEach((group) => {
    if (group.urls.length === 0) return;
    const existing = parent.querySelector<HTMLButtonElement>(
      `.mhx-open-sizes-btn[data-color="${CSS.escape(group.label)}"]`,
    );
    if (existing) {
      existing.textContent = `${group.label} (${group.urls.length})`;
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mhx-open-sizes-btn';
    btn.dataset.color = group.label;
    btn.textContent = `${group.label} (${group.urls.length})`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      void chrome.runtime.sendMessage({
        type: 'OPEN_TAB_GROUP',
        urls: group.urls,
        groupName: `${group.label} sizes`,
      });
    });
    parent.insertBefore(btn, title.nextSibling);
  });
}

/**
 * Cache the open product's id + child ids in `resolverMap`, so a later lookup
 * for this SKU resolves without scraping. Best-effort and read-only.
 */
function buildResolver(): void {
  const idMatch = location.pathname.match(
    /\/catalog\/product\/edit\/id\/(\d+)/,
  );
  const productId = idMatch?.[1];
  const skuInput = document.querySelector<HTMLInputElement>(
    'input[name="product[sku]"]',
  );
  const sku = skuInput?.value.trim() ?? '';
  if (!productId || !sku) return;

  const adminPath = location.pathname.match(/^(\/[^/]+\/)/)?.[1] ?? '/';
  const editUrl = (id: string): string =>
    `${location.origin}${adminPath}catalog/product/edit/id/${id}/`;

  const children: LookupChild[] = [];
  const table = findConfigSection()?.querySelector('table');
  if (table) {
    table.querySelectorAll('tbody tr').forEach((row) => {
      let rowId = row.getAttribute('data-product-id') ?? '';
      if (!rowId) {
        const idText = (
          row.querySelector('td[data-index="product_id"], td:first-child')
            ?.textContent ?? ''
        ).trim();
        if (/^\d+$/.test(idText)) rowId = idText;
      }
      if (!rowId) return;
      const attrText = (
        row.querySelector('td[data-index="attributes"]')?.textContent ?? ''
      ).trim();
      children.push({
        id: rowId,
        sku: (
          row.querySelector('td[data-index="sku"]')?.textContent ?? ''
        ).trim(),
        color: attrText.match(/Color:\s*([^,]+)/i)?.[1]?.trim() ?? '',
        size: attrText.match(/Size:\s*([^,]+)/i)?.[1]?.trim() ?? '',
        backend: editUrl(rowId),
      });
    });
  }

  // D4 fix: delegate the write to the background service worker so there is
  // exactly one reader-modify-writer path for the resolver map.
  const key = `${productId}:${sku}:${children.length}`;
  if (key === lastResolverKey) return;
  lastResolverKey = key;
  const entry: ResolverEntry = {
    id: productId,
    sku,
    backend: editUrl(productId),
    children,
    timestamp: Date.now(),
  };
  void chrome.runtime
    .sendMessage({ type: 'RESOLVE_CACHE_PUT', entry })
    .catch(() => {
      // Background worker may be dormant; it will pick up the entry next wake.
    });
}

/** Last-resort lookup: search the open admin tab's product grid via AJAX. */
async function handleSearchMagento(
  sku: string,
): Promise<SearchMagentoResponse> {
  const keyHash = location.href.match(/\/key\/([a-f0-9]+)\//)?.[1] ?? '';
  const formKey =
    document.querySelector<HTMLInputElement>('input[name="form_key"]')?.value ??
    '';
  const adminPath = location.pathname.match(/^(\/[^/]+\/)/)?.[1] ?? '/';
  let baseUrl = `${location.origin}${adminPath}mui/index/render`;
  if (keyHash) baseUrl += `/key/${keyHash}`;
  baseUrl += '/';

  const qs = new URLSearchParams();
  qs.append('namespace', 'product_listing');
  qs.append('isAjax', 'true');
  qs.append('form_key', formKey);
  qs.append('filters[placeholder][]', 'true');
  qs.append('filters[sku][value]', sku);
  qs.append('filters[sku][condition_type]', 'like');
  qs.append('paging[pageSize]', '20');
  qs.append('paging[currentPage]', '1');

  type GridItem = {
    sku?: string;
    entity_id?: string | number;
    id?: string | number;
  };
  try {
    const res = await fetch(`${baseUrl}?${qs.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    let items: GridItem[] = [];
    try {
      const data = JSON.parse(text) as {
        items?: GridItem[];
        data?: { items?: GridItem[] };
      };
      items = data.items ?? data.data?.items ?? [];
    } catch {
      const m = text.match(/"entity_id"\s*:\s*"?(\d+)"?/);
      if (m?.[1]) return { found: true, productId: m[1], children: [] };
      return {
        found: false,
        error: `Grid returned non-JSON (status ${res.status})`,
      };
    }
    const match =
      items.find(
        (it) => (it.sku ?? '').toLowerCase() === sku.toLowerCase(),
      ) ?? items[0];
    const productId = match
      ? String(match.entity_id ?? match.id ?? '')
      : '';
    if (productId) return { found: true, productId, children: [] };
    return { found: false, error: `SKU "${sku}" not found in the admin grid.` };
  } catch (err) {
    return {
      found: false,
      error: `Admin grid search failed: ${(err as Error).message}`,
    };
  }
}

/* ------------------------------------------------------------------------- */
/* On-page error-priority markup                                             */
/* ------------------------------------------------------------------------- */

function findErrorFields(err: ListingError): string[] | null {
  const text = [
    ...err.errorGroup,
    ...err.errorType,
    err.notes,
    err.title,
  ]
    .join(' ')
    .toLowerCase();
  for (const map of ERROR_FIELD_MAP) {
    for (const keyword of map.keywords) {
      const re = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (re.test(text)) return map.fields;
    }
  }
  return null;
}

/**
 * D3 fix: expand only the sections that actually contain error-marked fields,
 * not every collapsed section on the page.
 */
function expandAncestorSections(field: Element): void {
  let el: Element | null = field;
  while (el) {
    if (
      el.classList.contains('admin__collapsible-block-wrapper') &&
      (el.classList.contains('_hide') || !el.classList.contains('_show'))
    ) {
      el.querySelector<HTMLElement>('.admin__collapsible-title')?.click();
    }
    el = el.parentElement;
  }
}

function addIndicator(field: Element, err: ListingError): void {
  // Priority is already canonicalised by the Zod schema; fall back defensively.
  const priority = err.priority || 'Low';
  const pClass = PRIORITY_CLASS[priority] ?? 'low';
  const icon = PRIORITY_ICONS[priority] ?? ICON_LOW;

  const wrapper =
    field.closest('.admin__field, .admin_field, .admin__fieldset') ??
    field.parentElement;
  if (!wrapper) return;

  const existing = wrapper.querySelector<HTMLElement>('.mhx-error-indicator');
  if (existing) {
    // Keep the highest-priority indicator on an already-marked field.
    const current = existing.getAttribute('data-priority') ?? '';
    if ((PRIORITY_RANK[priority] ?? 0) <= (PRIORITY_RANK[current] ?? 0)) return;
    existing.remove();
  }

  const label = wrapper.querySelector<HTMLElement>(
    '.admin__field-label label, .admin_field-label label, label',
  );
  if (!label) return;

  const indicator = document.createElement('span');
  indicator.className = `mhx-error-indicator mhx-error-indicator--${pClass}`;
  indicator.innerHTML = icon;
  indicator.setAttribute('data-priority', priority);
  indicator.setAttribute(
    'data-tooltip',
    [err.title, err.notes].filter(Boolean).join('\n'),
  );
  // D2 fix: drive display via a class, not inline styles — reversible on clear.
  label.classList.add('mhx-error-label-host');
  label.appendChild(indicator);

  // D3 fix: expand only the ancestor sections of this field, not the whole page.
  expandAncestorSections(field);

  const labelWrapper = label.closest('.admin__field') ?? label.parentElement;
  if (labelWrapper) {
    labelWrapper.classList.remove(
      'mhx-error-label--high',
      'mhx-error-label--medium',
      'mhx-error-label--low',
    );
    labelWrapper.classList.add(`mhx-error-label--${pClass}`);
  }
}

/**
 * Draw priority indicators next to the form fields each error refers to.
 * D12 fix: returns counts so the caller can report real success/failure.
 */
function applyErrorMarkup(errors: ListingError[]): { matched: number; unmatched: number } {
  if (!errors || errors.length === 0) return { matched: 0, unmatched: 0 };
  let matched = 0;
  let unmatched = 0;

  // D2 fix: clear all previously injected indicators and label classes before
  // re-drawing, so stale markup from a prior product load is never left behind.
  document.querySelectorAll('.mhx-error-indicator').forEach((el) => el.remove());
  document.querySelectorAll('.mhx-error-label-host').forEach((el) => {
    el.classList.remove('mhx-error-label-host');
  });
  document.querySelectorAll(
    '.mhx-error-label--high, .mhx-error-label--medium, .mhx-error-label--low',
  ).forEach((el) => {
    el.classList.remove('mhx-error-label--high', 'mhx-error-label--medium', 'mhx-error-label--low');
  });

  errors.forEach((err) => {
    if (!err || err.status === 'Done') return;
    const fieldNames = findErrorFields(err);
    if (!fieldNames) {
      unmatched += 1;
      return;
    }
    let placed = false;
    for (const name of fieldNames) {
      document
        .querySelectorAll(
          `input[name*="${name}"], textarea[name*="${name}"], select[name*="${name}"], [data-index="${name}"]`,
        )
        .forEach((field) => {
          addIndicator(field, err);
          placed = true;
        });
    }
    if (placed) matched += 1;
    else unmatched += 1;
  });

  if (unmatched > 0) {
    console.debug(`[mhx] ERROR_MARKUP: ${matched} matched, ${unmatched} unmatched`);
  }
  return { matched, unmatched };
}

/** Ask the background to fetch this SKU's errors and draw them on the page. */
function maybeRequestErrorMarkup(): void {
  if (!isProductEditPage(location.href)) return;
  const sku = readPageSku();
  if (!sku || sku === markedSku) return;
  markedSku = sku;
  void chrome.runtime
    .sendMessage({ type: 'FETCH_ERROR_MARKUP', sku })
    .catch(() => {
      markedSku = ''; // allow a retry on the next scan
    });
}

/**
 * Guards every write: the operator must be looking at the same product (SKU)
 * and the same store view they selected in the panel. A mismatch means the
 * page changed under us, so we refuse rather than write the wrong record.
 */
function guardFailure(
  sku: string,
  storeView: string,
): string | null {
  if (!isProductEditPage(location.href)) {
    return 'Not on a Magento product edit page.';
  }
  const pageSku = readPageSku();
  if (!pageSku) {
    return 'No SKU on the open page - load the product first.';
  }
  if (!sku.trim()) {
    return 'No SKU provided by the panel.';
  }
  if (normalizeSku(pageSku) !== normalizeSku(sku)) {
    return `SKU guard: open page is "${pageSku}", panel requested "${sku}".`;
  }
  const pageStoreView = detectStoreView(location.href);
  if (
    storeView &&
    storeView !== 'all' &&
    pageStoreView !== 'all' &&
    pageStoreView !== storeView
  ) {
    return `Store-view guard: open page scope is ${pageStoreView}, panel requested ${storeView}.`;
  }
  return null;
}

function handleApplyField(
  msg: ApplyFieldRequest,
): ApplyFieldResponse {
  if (!WRITES_ENABLED) {
    return { ok: false, reason: 'Writing to the page is paused.' };
  }
  const guard = guardFailure(msg.sku, msg.storeView);
  if (guard) return { ok: false, reason: guard };
  if (!MAGE_FIELDS.includes(msg.field)) {
    return { ok: false, reason: `Unknown field "${msg.field}".` };
  }
  const el = findField(msg.field);
  if (!el) {
    return {
      ok: false,
      reason: 'Field not found on the open product page.',
    };
  }
  const current = readFieldValue(el);

  if (msg.action === 'undo') {
    if (!snapshots.has(msg.field)) {
      return { ok: false, reason: 'Nothing to undo for this field.' };
    }
    const previous = snapshots.recall(msg.field) ?? '';
    applyFieldValue(el, previous);
    snapshots.clear(msg.field);
    return { ok: true, appliedValue: previous, previousValue: current };
  }

  snapshots.capture(msg.field, current);
  applyFieldValue(el, msg.value);
  return { ok: true, appliedValue: msg.value, previousValue: current };
}

/**
 * Locate the Configurations (configurable-matrix) section, by data-index first
 * and by section title text as a fallback (Magento renders either shape).
 */
function findConfigSection(): Element | null {
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

function isCollapsed(wrapper: Element | null): boolean {
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

/**
 * Read-only extraction of the configurable colour groups from the open product
 * page: each row's Attribute cell ("Color: X") plus the child product-edit link.
 * If the section is collapsed we click to expand it and report `pending` so the
 * panel retries shortly (nothing is written to the record).
 */
function extractColorGroups(): GetConfigResponse {
  if (!isProductEditPage(location.href)) {
    return {
      available: false,
      groups: [],
      reason: 'Open a Magento product edit page to read configurations.',
    };
  }
  const section = findConfigSection();
  if (!section) {
    return {
      available: true,
      groups: [],
      reason: 'No Configurations section on this page.',
    };
  }

  if (isCollapsed(section)) {
    const collapsible = section.classList.contains(
      'admin__collapsible-block-wrapper',
    )
      ? section
      : section.closest('.admin__collapsible-block-wrapper');
    collapsible
      ?.querySelector<HTMLElement>('.admin__collapsible-title')
      ?.click();
    return { available: true, pending: true, groups: [] };
  }

  const table = section.querySelector(
    'table.admin__dynamic-rows, table.data-grid, table',
  );
  const groups = new Map<string, ConfigGroup>();
  const sku = readPageSku();
  if (!table) {
    return {
      available: true,
      groups: [],
      sku,
      reason: 'No configuration rows yet.',
    };
  }

  let attrColIndex = -1;
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    const ths = Array.from(headerRow.querySelectorAll('th'));
    attrColIndex = ths.findIndex((th) =>
      (th.textContent ?? '').toLowerCase().includes('attribute'),
    );
  }
  if (attrColIndex === -1) attrColIndex = 7;

  table.querySelectorAll('tbody tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    const attrCell = cells[attrColIndex];
    const attrText = (attrCell?.textContent ?? '').trim();
    if (!attrText) return;
    const colorMatch = attrText.match(/color:\s*([^,]+)/i);
    if (!colorMatch) return;
    const colorText = (colorMatch[1] ?? '').trim();
    if (!colorText) return;
    const link = cells[1]?.querySelector<HTMLAnchorElement>(
      'a[href*="/catalog/product/edit/id/"]',
    );
    if (!link) return;
    const group = groups.get(colorText) ?? { label: colorText, urls: [] };
    group.urls.push(link.href);
    groups.set(colorText, group);
  });

  return { available: true, groups: [...groups.values()], sku };
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
    scan();
    // Keep the admin's own colours in step with the stored theme preference.
    watchMagentoPageTheme();
    // One toolkit sheet per page (link, inline fallback) plus the operator's
    // custom toolkit colours from Settings. Features call ensureUi() too;
    // this first call just gets it on the page before the first scan draws.
    ensureUi();
    watchToolkitColors();
    let timer: number | undefined;
    new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(scan, 200);
    }).observe(document.body, { childList: true, subtree: true });

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
        void handleSearchMagento(String(message.sku ?? '')).then(sendResponse);
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
