// Feature: group the Options Items table by parent, with collapsible headers.
import { isCustomOptionsPage } from '../options-companion';

// ===== Options Items grouping =====

export function enhanceOptionsItems(): void {
  if (!isCustomOptionsPage()) return;

  // Find the Options Items table (has "Parent" header)
  const tables = document.querySelectorAll<HTMLTableElement>('table');
  let itemsTable: HTMLTableElement | null = null;
  for (const t of tables) {
    const headers = Array.from(t.querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim().toLowerCase() ?? '',
    );
    if (headers.some((h) => h.includes('parent'))) { itemsTable = t; break; }
  }
  if (!itemsTable) return;
  if (itemsTable.dataset.mhxItemsEnhanced === '1') return;
  itemsTable.dataset.mhxItemsEnhanced = '1';

  // Widen
  const container = itemsTable.closest<HTMLElement>('fieldset, .admin__fieldset, .fieldset-wrapper') ?? itemsTable.parentElement as HTMLElement | null;
  if (container) { container.style.maxWidth = 'none'; container.style.width = '100%'; }
  itemsTable.style.width = '100%';

  // Hide Sort column (index varies; find by header text)
  const ths = Array.from(itemsTable.querySelectorAll('thead th'));
  const sortColIdx = ths.findIndex((th) => th.textContent?.trim().toLowerCase() === 'sort');
  if (sortColIdx >= 0) {
    (ths[sortColIdx] as HTMLElement).style.display = 'none';
    itemsTable.querySelectorAll<HTMLElement>(`tbody tr td:nth-child(${sortColIdx + 1})`).forEach((td) => { td.style.display = 'none'; });
  }

  const tbody = itemsTable.querySelector('tbody');
  if (!tbody) return;

  // Collect rows and group by parent select value (display text)
  const rows = Array.from(tbody.querySelectorAll<HTMLElement>('tr'));
  if (rows.length === 0) return;

  // Map: parentKey -> { label, rows[] }
  const groups = new Map<string, { label: string; rows: HTMLElement[] }>();
  for (const tr of rows) {
    const parentSel = tr.querySelector<HTMLSelectElement>('select[name*="[parent]"]');
    if (!parentSel) continue;
    const key = parentSel.value ?? '';
    const label = parentSel.options[parentSel.selectedIndex]?.text?.trim() ?? key;
    if (!groups.has(key)) groups.set(key, { label, rows: [] });
    groups.get(key)!.rows.push(tr);
  }

  // Rebuild tbody: for each group, insert a header row then the data rows
  tbody.innerHTML = '';
  const colCount = ths.length;

  for (const [, group] of groups) {
    const headerTr = document.createElement('tr');
    headerTr.dataset.mhxGroupHeader = '1';
    headerTr.className = 'mhx-opt-group-head';

    const headerTd = document.createElement('td');
    headerTd.colSpan = colCount;
    headerTd.className = 'mhx-opt-group-title';
    const arrow = document.createElement('span');
    arrow.className = 'mhx-opt-group-arrow';
    arrow.textContent = '▼';
    const count = document.createElement('span');
    count.className = 'mhx-opt-group-count';
    count.textContent = `(${group.rows.length})`;
    headerTd.append(arrow, `${group.label} `, count);
    headerTr.appendChild(headerTd);
    tbody.appendChild(headerTr);

    for (const tr of group.rows) {
      // Hide the Parent cell (first td) since it's redundant inside the group
      const parentTd = tr.querySelector<HTMLElement>('td:first-child');
      if (parentTd) parentTd.style.display = 'none';
      tbody.appendChild(tr);
    }

    // Collapse/expand on header click
    headerTr.addEventListener('click', () => {
      const collapsed = headerTr.dataset.mhxCollapsed === '1';
      group.rows.forEach((r) => { r.style.display = collapsed ? '' : 'none'; });
      headerTr.dataset.mhxCollapsed = collapsed ? '' : '1';
      const arrow = headerTd.querySelector('span');
      if (arrow) arrow.textContent = collapsed ? '▼ ' : '▶ ';
    });
  }
}
