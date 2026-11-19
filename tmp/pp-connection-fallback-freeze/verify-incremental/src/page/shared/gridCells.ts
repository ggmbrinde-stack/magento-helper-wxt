// Reading SKUs out of a Magento UI-component grid.
//
// A grid is not one table. With the sticky header enabled, Magento renders a
// second one (`ui/grid/sticky/listing.html`):
//
//   <div class="admin__data-grid-wrap" data-role="sticky-el-root">
//     <table class="data-grid"><thead>…</thead><tbody></tbody></table>
//   </div>
//
// Its header is a real copy of the columns and its body is empty. Choosing "the
// first table.data-grid in the container" can therefore return a table with no
// rows, which is exactly how "No SKUs found on this page." appeared on a grid
// full of products. Everything here ranks tables by how many rows they actually
// have and reads the best one.

export type SkuKind = 'sku' | 'parent_sku' | 'name';

export interface SkuColumn {
  index: number;
  className: string | null;
  dataIndex: string | null;
  kind: SkuKind;
}

/** Sortable headers carry an arrow glyph; strip it before comparing text. */
function headerText(th: Element): string {
  return (th.textContent ?? '')
    .replace(/[↑↓▲►▸▾▿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Classify a header cell as SKU / Parent SKU / Name, or null if not one. */
function headerColumnKind(th: Element): SkuKind | null {
  const dataIndex = (th.getAttribute('data-index') ?? '').toLowerCase();
  const cls = th.className.toLowerCase();
  const text = headerText(th);
  if (dataIndex === 'sku' || text === 'sku' || /(^|\s)col-sku(\s|$)/.test(cls)) {
    return 'sku';
  }
  if (
    dataIndex === 'parent_sku' ||
    text === 'parent sku' ||
    /(^|\s)col-parent_sku(\s|$)/.test(cls)
  ) {
    return 'parent_sku';
  }
  if (dataIndex === 'name' || text === 'name' || /(^|\s)col-name(\s|$)/.test(cls)) {
    return 'name';
  }
  return null;
}

/** Columns described by one header row. */
export function skuColumnsIn(headerRow: Element): SkuColumn[] {
  const columns: SkuColumn[] = [];
  headerRow.querySelectorAll('th').forEach((th, index) => {
    const kind = headerColumnKind(th);
    if (!kind) return;
    const className =
      Array.from(th.classList).find((c) => c.startsWith('col-')) ?? null;
    const dataIndex = th.getAttribute('data-index') ?? null;
    columns.push({ index, className, dataIndex, kind });
  });
  return columns;
}

/**
 * Columns for a table. The first header row that names a SKU/Parent SKU column
 * wins; the filter row above it does not.
 */
export function tableColumns(table: Element): SkuColumn[] {
  for (const row of Array.from(table.querySelectorAll('thead tr'))) {
    const columns = skuColumnsIn(row);
    if (columns.length > 0) return columns;
  }
  return [];
}

/** The cell holding this column's value in one row. */
export function cellForColumn(
  row: Element,
  column: SkuColumn,
): Element | null {
  // Magento body cells carry `data-index` for the column they belong to. It is
  // the only identifier that survives reordered, resized or hidden columns.
  const indexes = [column.dataIndex, column.kind].filter(
    (v): v is string => Boolean(v),
  );
  for (const index of indexes) {
    const byIndex = row.querySelector(`td[data-index="${index}"]`);
    if (byIndex) return byIndex;
  }
  if (column.className) {
    const byClass = row.querySelector(`td.${column.className}`);
    if (byClass) return byClass;
  }
  return row.querySelectorAll('td')[column.index] ?? null;
}

/** Cell text without our own injected copy button. */
export function cellTextValue(cell: Element, ignoreSelector: string): string {
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll(ignoreSelector).forEach((b) => b.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Rows that hold data, excluding the "no records" placeholder row. */
export function rowsOf(table: Element): Element[] {
  return Array.from(table.querySelectorAll('tbody tr')).filter(
    (row) => !row.classList.contains('data-grid-tr-no-data'),
  );
}

/**
 * Every grid table in scope, the one with the most rows first. The sticky
 * header clone has an empty body and therefore sorts last.
 */
export function gridTables(scope: ParentNode): Element[] {
  return Array.from(scope.querySelectorAll('table.data-grid')).sort(
    (a, b) => rowsOf(b).length - rowsOf(a).length,
  );
}

/** True when any of these tables has a column of this kind. */
export function hasColumn(tables: Iterable<Element>, kind: SkuKind): boolean {
  for (const table of tables) {
    if (tableColumns(table).some((c) => c.kind === kind)) return true;
  }
  return false;
}

/**
 * The column's values, taken from whichever table holds the most of them.
 *
 * Duplicates inside one table are preserved (a variant grid repeats its parent
 * SKU on purpose); only the choice of table is decided here.
 */
export function collectColumnValues(
  tables: Iterable<Element>,
  kind: SkuKind,
  ignoreSelector: string,
): string[] {
  let best: string[] = [];
  for (const table of tables) {
    const column = tableColumns(table).find((c) => c.kind === kind);
    if (!column) continue;
    const values: string[] = [];
    for (const row of rowsOf(table)) {
      const cell = cellForColumn(row, column);
      const value = cell ? cellTextValue(cell, ignoreSelector) : '';
      if (value) values.push(value);
    }
    if (values.length > best.length) best = values;
  }
  return best;
}
