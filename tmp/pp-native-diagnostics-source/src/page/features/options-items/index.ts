// Feature: grouped view of Options Items using a PARALLEL UI.
// The Knockout-managed table is hidden; we render a separate panel that reads
// from and writes to the existing inputs. Knockout never sees our DOM changes.
import { isCustomOptionsPage, widenTableWrapper } from '../options-companion';

export function enhanceOptionsItems(): void {
  if (!isCustomOptionsPage()) return;

  // Find the Options Items table (has "Parent" header)
  const tables = document.querySelectorAll<HTMLTableElement>('table');
  let itemsTable: HTMLTableElement | null = null;
  for (const t of tables) {
    const headers = Array.from(t.querySelectorAll('thead th')).map(
      (th) => th.textContent?.trim().toLowerCase() ?? '',
    );
    if (headers.some((h) => h.includes('parent'))) {
      itemsTable = t;
      break;
    }
  }
  if (!itemsTable) return;
  if (itemsTable.dataset.mhxItemsEnhanced === '1') return;
  itemsTable.dataset.mhxItemsEnhanced = '1';

  widenTableWrapper(itemsTable);

  const tbody = itemsTable.querySelector('tbody');
  if (!tbody) return;

  // Find the Add Item button row
  let addItemBtn: HTMLButtonElement | null = null;
  tbody.querySelectorAll<HTMLElement>('tr').forEach((tr) => {
    const btn = tr.querySelector<HTMLButtonElement>('button, input[type="button"]');
    if (btn && btn.textContent?.trim().toLowerCase().includes('add item')) {
      addItemBtn = btn;
    }
  });

  // Build the parallel UI and set up toggle
  const tableWrapper =
    itemsTable.closest<HTMLElement>('.admin__control-table-wrapper') ??
    itemsTable.parentElement;
  if (!tableWrapper?.parentElement) return;

  // Container for our parallel panel
  const panel = document.createElement('div');
  panel.id = 'mhx-items-panel';
  panel.className = 'mhx-items-panel';
  tableWrapper.parentElement.insertBefore(panel, tableWrapper);

  // Toggle button
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'mhx-items-toggle';
  toggleBtn.type = 'button';
  toggleBtn.className = 'mhx-opt-mode-btn';
  toggleBtn.textContent = '⊞ Original UI';
  tableWrapper.parentElement.insertBefore(toggleBtn, panel);

  let isGrouped = true;

  const applyMode = (): void => {
    toggleBtn.textContent = isGrouped ? '⊞ Original UI' : '⊟ Grouped UI';
    tableWrapper.style.display = isGrouped ? 'none' : '';
    panel.style.display = isGrouped ? '' : 'none';
  };

  toggleBtn.addEventListener('click', () => {
    isGrouped = !isGrouped;
    applyMode();
  });

  // Render the grouped panel from current DOM state
  const renderPanel = (): void => {
    panel.innerHTML = '';

    // Collect data rows (skip add-item row)
    const dataRows = Array.from(
      tbody.querySelectorAll<HTMLElement>('tr'),
    ).filter((tr) => {
      const btn = tr.querySelector<HTMLElement>('button, input[type="button"]');
      return !(btn && btn.textContent?.trim().toLowerCase().includes('add item'));
    });

    if (dataRows.length === 0) {
      panel.textContent = 'No items.';
      return;
    }

    // Group by parent
    const groups: { key: string; label: string; rows: HTMLElement[] }[] = [];
    const groupMap = new Map<string, number>();
    for (const tr of dataRows) {
      const sel = tr.querySelector<HTMLSelectElement>('select[name*="[parent]"]');
      if (!sel) continue;
      const key = sel.value ?? '';
      const label = sel.options[sel.selectedIndex]?.text?.trim() ?? key;
      if (!groupMap.has(key)) {
        groupMap.set(key, groups.length);
        groups.push({ key, label, rows: [tr] });
      } else {
        groups[groupMap.get(key)!]!.rows.push(tr);
      }
    }

    for (const group of groups) {
      // Group header
      const groupEl = document.createElement('div');
      groupEl.className = 'mhx-items-group';

      const header = document.createElement('div');
      header.className = 'mhx-items-group-head';

      const leftSide = document.createElement('span');
      leftSide.className = 'mhx-opt-group-left';
      const arrow = document.createElement('span');
      arrow.className = 'mhx-opt-group-arrow';
      arrow.textContent = '▼';
      const labelTxt = document.createElement('span');
      labelTxt.textContent = ` ${group.label} `;
      const countEl = document.createElement('span');
      countEl.className = 'mhx-opt-group-count';
      countEl.textContent = `(${group.rows.length})`;
      leftSide.append(arrow, labelTxt, countEl);

      const actions = document.createElement('span');
      actions.className = 'mhx-opt-group-actions';
      // always visible on header hover via CSS

      if (addItemBtn) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'mhx-opt-group-add';
        addBtn.textContent = '+ Add Item';
        addBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rowsBefore = new Set(
            Array.from(tbody.querySelectorAll<HTMLElement>('tr')).filter((tr) => {
              const b = tr.querySelector<HTMLElement>('button, input[type="button"]');
              return !(b && b.textContent?.trim().toLowerCase().includes('add item'));
            }),
          );
          (addItemBtn as HTMLButtonElement).click();
          const adopt = (): void => {
            const newRow = Array.from(tbody.querySelectorAll<HTMLElement>('tr'))
              .filter((tr) => {
                const b = tr.querySelector<HTMLElement>('button, input[type="button"]');
                return !(b && b.textContent?.trim().toLowerCase().includes('add item'));
              })
              .find((r) => !rowsBefore.has(r));
            if (!newRow) { requestAnimationFrame(adopt); return; }
            const sel = newRow.querySelector<HTMLSelectElement>('select[name*="[parent]"]');
            if (sel) {
              sel.value = group.key;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
            // Re-render panel after Knockout processes the change
            setTimeout(() => {
              itemsTable!.dataset.mhxItemsEnhanced = '';
              renderPanel();
            }, 300);
          };
          requestAnimationFrame(adopt);
        });
        actions.appendChild(addBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'mhx-opt-group-del';
      delBtn.textContent = '🗑 Delete all';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const live = group.rows.filter((r) => r.isConnected);
        if (!window.confirm(`Delete all ${live.length} items in "${group.label}"?`)) return;
        let i = 0;
        const next = (): void => {
          if (i >= live.length) {
            setTimeout(() => {
              itemsTable!.dataset.mhxItemsEnhanced = '';
              renderPanel();
            }, 200);
            return;
          }
          const row = live[i++];
          if (!row) return;
          const btn = row.querySelector<HTMLElement>(
            'button[data-action="remove"], .action-delete, td:last-child button',
          );
          if (btn) btn.click();
          setTimeout(next, 100);
        };
        next();
      });
      actions.appendChild(delBtn);

      header.appendChild(leftSide);
      header.appendChild(actions);
      groupEl.appendChild(header);

      // Rows container
      const rowsEl = document.createElement('div');
      rowsEl.className = 'mhx-items-rows';

      for (const tr of group.rows) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'mhx-items-row';

        // Name select
        const nameSel = tr.querySelector<HTMLSelectElement>('select[name*="[name_option]"]');
        if (nameSel) {
          const clone = nameSel.cloneNode(true) as HTMLSelectElement;
          clone.className = 'mhx-items-name-sel';
          // Force the correct selected value (cloneNode copies DOM but not .value state)
          clone.value = nameSel.value;
          // If value didn't set (option not found), try by text match
          if (clone.value !== nameSel.value) {
            Array.from(clone.options).forEach((opt, i) => {
              if (opt.value === nameSel.value) clone.selectedIndex = i;
            });
          }
          clone.addEventListener('change', () => {
            nameSel.value = clone.value;
            nameSel.dispatchEvent(new Event('change', { bubbles: true }));
          });
          rowDiv.appendChild(clone);
        }

        // Store view select
        const svSel = tr.querySelector<HTMLSelectElement>('select[name*="[store_view]"]');
        if (svSel) {
          const clone = svSel.cloneNode(true) as HTMLSelectElement;
          clone.className = 'mhx-items-sv-sel';
          clone.value = svSel.value;
          clone.addEventListener('change', () => {
            svSel.value = clone.value;
            svSel.dispatchEvent(new Event('change', { bubbles: true }));
          });
          rowDiv.appendChild(clone);
        }

        // Delete button (proxy to original)
        const realDel = tr.querySelector<HTMLElement>(
          'button[data-action="remove"], .action-delete, td:last-child button',
        );
        if (realDel) {
          const delRowBtn = document.createElement('button');
          delRowBtn.type = 'button';
          delRowBtn.className = 'mhx-items-del-row';
          delRowBtn.textContent = '🗑';
          delRowBtn.title = 'Delete this item';
          delRowBtn.addEventListener('click', () => {
            realDel.click();
            setTimeout(() => {
              itemsTable!.dataset.mhxItemsEnhanced = '';
              renderPanel();
            }, 300);
          });
          rowDiv.appendChild(delRowBtn);
        }

        rowsEl.appendChild(rowDiv);
      }

      // Collapse/expand
      let collapsed = false;
      header.addEventListener('click', () => {
        collapsed = !collapsed;
        rowsEl.style.display = collapsed ? 'none' : '';
        arrow.textContent = collapsed ? '▶' : '▼';
      });

      groupEl.appendChild(rowsEl);
      panel.appendChild(groupEl);
    }
  };

  // Watch Knockout tbody for external changes (saves, etc.) -- re-render panel
  // We only watch, never mutate -- so no KO conflict possible.
  new MutationObserver(() => {
    if (!isGrouped) return;
    // Small debounce to let KO finish
    clearTimeout((panel as HTMLElement & { _mhxTimer?: number })._mhxTimer);
    (panel as HTMLElement & { _mhxTimer?: number })._mhxTimer = window.setTimeout(() => {
      itemsTable!.dataset.mhxItemsEnhanced = '';
      renderPanel();
    }, 400);
  }).observe(tbody, { childList: true });

  renderPanel();
  applyMode();
}
