// Feature: per-cell copy + open buttons and the copy-all toolbar buttons.
import { copyText } from '../../shared/clipboard';
import {
  cellForColumn,
  cellTextValue,
  collectColumnValues,
  gridTables,
  hasColumn,
  rowsOf,
  tableColumns,
  type SkuKind,
} from '../../shared/gridCells';
import { productEditUrl } from '../../shared/productLink';
import { BTN_ATTR, INJECTED_SELECTOR, OPEN_ATTR } from '../../shared/selectors';
import { ICON_COPY, ICON_OPEN } from '../../shared/svg';
import { showToast } from '../../shared/toast';
import { createButton, flashCopied } from '../sku-copy';

export function scanGrid(): void {
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
export function addOpenButton(cell: Element, row: Element): void {
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
export function gridScopeForButton(btn: HTMLButtonElement): ParentNode {
  return (
    btn.closest(
      '.admin__data-grid-outer-wrap, [data-role="grid"], .admin__data-grid-wrap',
    ) ?? document
  );
}

/** One copy-all button for a given column; flashes the count and toasts. */
export function makeCopyButton(
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
export function addGridCopyButtons(): void {
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
