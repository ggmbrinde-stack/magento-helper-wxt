// Feature: the per-language strip for each custom-option row, plus the
// Original / Lang-fields switch for the options table.
//
// Styling is the toolkit's: this file only sets classes (mhx-opt-lang-*,
// mhx-opt-mode-btn). No inline colour, so check:ui stays green.

// ===== Options Area Enhancements (custom-options / attribute-set editors) =====

export const OPT_LANGS: { code: string; storeId: string; flag: string }[] = [
  { code: 'PT', storeId: '1', flag: '🇵🇹' },
  { code: 'EN', storeId: '2', flag: '🇬🇧' },
  { code: 'ES', storeId: '4', flag: '🇪🇸' },
  { code: 'FR', storeId: '5', flag: '🇫🇷' },
  { code: 'DE', storeId: '6', flag: '🇩🇪' },
  { code: 'IT', storeId: '7', flag: '🇮🇹' },
];

export function isCustomOptionsPage(): boolean {
  return window.location.href.indexOf('toogas_attributesetcustomoptions') !== -1;
}

/**
 * Extract the row index N from an input name like
 * `options[sub_options][sub_options][N][name][1]`
 */
export function optRowIndex(input: HTMLInputElement): string | null {
  const m = input.name.match(/\[sub_options\]\[(\w+)\]\[name\]/);
  return m?.[1] ?? null;
}

/**
 * Build or refresh the inline lang strip for ONE option row.
 * The row must contain at least one `input[name*="][name]["]` type=text.
 */
export function mountLangRowForOption(tr: HTMLElement): void {
  if (tr.dataset.mhxLangMounted === '1') return;

  const nameInputs = Array.from(
    tr.querySelectorAll<HTMLInputElement>('input[name*="][name]["]'),
  ).filter((i) => i.type === 'text');

  if (nameInputs.length === 0) return;
  tr.dataset.mhxLangMounted = '1';

  const byStore = new Map<string, HTMLInputElement>();
  for (const inp of nameInputs) {
    const m = inp.name.match(/\[name\]\[(\d+)\]$/);
    if (m?.[1]) byStore.set(m[1], inp);
  }

  // Find delete button in original row to proxy
  const deleteBtn = tr.querySelector<HTMLElement>('button[data-action="remove"], .action-delete, td:last-child button');

  const colCount = tr.querySelectorAll('td').length || 6;
  const companionTr = document.createElement('tr');
  companionTr.className = 'mhx-opt-lang-row';
  companionTr.dataset.mhxOptLang = '1';

  const td = document.createElement('td');
  td.colSpan = colCount;
  td.className = 'mhx-opt-lang-cell';

  const wrapper = document.createElement('div');
  wrapper.className = 'mhx-opt-lang-wrap';

  const grid = document.createElement('div');
  grid.className = 'mhx-opt-lang-grid';

  for (const lang of OPT_LANGS) {
    const source = byStore.get(lang.storeId);
    const cell = document.createElement('div');
    cell.className = 'mhx-opt-lang-field';
    const lbl = document.createElement('label');
    lbl.textContent = lang.flag + ' ' + lang.code;
    lbl.className = 'mhx-opt-lang-label';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'mhx-opt-lang-input';
    inp.placeholder = lang.code;
    if (source) {
      inp.value = source.value;
      inp.addEventListener('input', () => { source.value = inp.value; source.dispatchEvent(new Event('input', { bubbles: true })); source.dispatchEvent(new Event('change', { bubbles: true })); });
      source.addEventListener('input', () => { if (inp !== document.activeElement) inp.value = source.value; });
    } else {
      inp.disabled = true; inp.placeholder = '—';
      inp.className = 'mhx-opt-lang-input mhx-opt-lang-input--off';
    }
    cell.appendChild(lbl); cell.appendChild(inp); grid.appendChild(cell);
  }

  const sortSource = tr.querySelector<HTMLInputElement>('input[name*="][sort]"]');
  if (sortSource) {
    const sortCell = document.createElement('div');
    sortCell.className = 'mhx-opt-lang-sortcell';
    const sortLbl = document.createElement('label');
    sortLbl.textContent = '↕ Sort';
    sortLbl.className = 'mhx-opt-lang-label';
    const sortInp = document.createElement('input');
    sortInp.type = 'text'; sortInp.value = sortSource.value;
    sortInp.className = 'mhx-opt-lang-input mhx-opt-lang-input--sort';
    sortInp.placeholder = '#';
    sortInp.addEventListener('input', () => { sortSource.value = sortInp.value; sortSource.dispatchEvent(new Event('input', { bubbles: true })); sortSource.dispatchEvent(new Event('change', { bubbles: true })); });
    sortSource.addEventListener('input', () => { if (sortInp !== document.activeElement) sortInp.value = sortSource.value; });
    sortCell.appendChild(sortLbl); sortCell.appendChild(sortInp); grid.appendChild(sortCell);
  }

  wrapper.appendChild(grid);

  if (deleteBtn) {
    const deleteCopy = deleteBtn.cloneNode(true) as HTMLElement;
    deleteCopy.className = 'mhx-opt-lang-del';
    deleteCopy.addEventListener('click', () => deleteBtn.click());
    wrapper.appendChild(deleteCopy);
  }

  td.appendChild(wrapper);
  companionTr.appendChild(td);
  tr.parentNode?.insertBefore(companionTr, tr);
}

/**
 * Widen the .admin__control-table-wrapper that directly wraps a given table.
 * Called per-table so AJAX-loaded tables are handled when they appear.
 * Only touches the single nearest wrapper -- nothing else on the page.
 */
export function widenTableWrapper(table: HTMLElement): void {
  const wrapper = table.closest<HTMLElement>('.admin__control-table-wrapper');
  if (!wrapper) return;
  wrapper.style.maxWidth = 'none';
  wrapper.style.width = '100%';
  wrapper.style.overflowX = 'visible';

  // admin__field-control is a ~46%-wide column inside admin__field (Magento two-col layout).
  // Override it to fill the full admin__field width so the table can use all available space.
  const fieldControl = wrapper.closest<HTMLElement>('.admin__field-control');
  if (fieldControl) {
    fieldControl.style.width = '100%';
    fieldControl.style.maxWidth = 'none';
    fieldControl.style.flexBasis = '100%';
    fieldControl.style.flexGrow = '1';
  }

  // Also tell the admin__field row itself to allow its child to overflow the two-col layout
  const adminField = wrapper.closest<HTMLElement>('.admin__field');
  if (adminField) {
    adminField.style.flexWrap = 'wrap';
  }
}

/** @deprecated use widenTableWrapper(table) directly */
export function widenOptionsPage(): void {
  document.querySelectorAll<HTMLTableElement>('table').forEach(widenTableWrapper);
}

export function addOptionsCompanion(): void {
  if (!isCustomOptionsPage()) return;

  const tables = document.querySelectorAll<HTMLTableElement>('table');
  let optionsTable: HTMLTableElement | null = null;
  for (const t of tables) {
    const headers = Array.from(t.querySelectorAll('thead th')).map((th) => th.textContent?.trim().toLowerCase() ?? '');
    const hasName = headers.some((h) => h.includes('name'));
    const hasParent = headers.some((h) => h.includes('parent'));
    if (hasName && !hasParent) { optionsTable = t; break; }
  }
  if (!optionsTable) return;

  // Widen this table's specific wrapper -- called after table is found so the
  // wrapper is guaranteed to exist in DOM.
  widenTableWrapper(optionsTable);
  optionsTable.style.width = '100%';
  optionsTable.style.tableLayout = 'fixed';

  const isNewMode = (): boolean => optionsTable!.dataset.mhxMode !== 'original';

  if (!document.getElementById('mhx-opt-toggle')) {
    // Insert toggle button directly before the table wrapper, not inside the fieldset
    const tableWrapper = optionsTable.closest<HTMLElement>('.admin__control-table-wrapper') ?? optionsTable.parentElement;
    if (tableWrapper?.parentElement) {
      const toggleBtn = document.createElement('button');
      toggleBtn.id = 'mhx-opt-toggle';
      toggleBtn.type = 'button';
      toggleBtn.className = 'mhx-opt-mode-btn';

      const applyMode = (): void => {
        const newMode = isNewMode();
        toggleBtn.textContent = newMode ? '⊞ Original UI' : '⊟ Lang fields UI';
        optionsTable!.querySelectorAll<HTMLElement>('tbody tr:not([data-mhx-opt-lang])').forEach((tr) => { tr.style.display = newMode ? 'none' : ''; });
        optionsTable!.querySelectorAll<HTMLElement>('tr.mhx-opt-lang-row').forEach((tr) => { tr.style.display = newMode ? '' : 'none'; });
      };

      toggleBtn.addEventListener('click', () => {
        optionsTable!.dataset.mhxMode = isNewMode() ? 'original' : 'new';
        applyMode();
      });

      tableWrapper.parentElement.insertBefore(toggleBtn, tableWrapper);
      optionsTable.dataset.mhxMode = 'new';
      applyMode();
    }
  }

  const newRows = optionsTable.querySelectorAll<HTMLElement>('tbody tr:not([data-mhx-opt-lang]):not([data-mhx-lang-mounted])');
  newRows.forEach((tr) => {
    mountLangRowForOption(tr);
    tr.style.display = isNewMode() ? 'none' : '';
  });
  optionsTable.querySelectorAll<HTMLElement>('tr.mhx-opt-lang-row').forEach((tr) => { tr.style.display = isNewMode() ? '' : 'none'; });
}
