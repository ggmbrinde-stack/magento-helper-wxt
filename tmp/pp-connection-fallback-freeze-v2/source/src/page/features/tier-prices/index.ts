// Feature: Buttons to fill tier prices with reference values from Notion.
import { TierBand } from '../../../audit';

// Tier bands from Notion (Textil - everything wearable)
const TEXTIL_BANDS: TierBand[] = [
  { from: 100,  to: 249,  discount: 5 },
  { from: 250,  to: 499,  discount: 8 },
  { from: 500,  to: 4999, discount: 10 },
  { from: 5000, to: null, discount: 12 },
];

// Tier bands from Notion (Outros artigos - everything not wearable)
const OUTROS_BANDS: TierBand[] = [
  { from: 200,  to: 499,  discount: 5 },
  { from: 500,  to: 999,  discount: 8 },
  { from: 1000, to: 4999, discount: 10 },
  { from: 5000, to: null, discount: 12 },
];

/** Gate: only run on the Magento "Update Attributes" page. */
function isTierPricesPage(url: string): boolean {
  return (
    url.includes('product_action_attribute') ||
    (url.includes('attributes') && url.includes('edit'))
  );
}

/**
 * Find the tier prices table on the page.
 */
export function findTierPricesTable(): HTMLElement | null {
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const header = table.querySelector('thead tr');
    if (!header) continue;
    const headers = Array.from(header.querySelectorAll('th')).map((th) =>
      (th.textContent ?? '').trim().toLowerCase()
    );
    const hasTierPriceColumns = headers.some((h) =>
      ['quantity', 'price', 'customer group', 'website'].some((kw) => h.includes(kw))
    );
    if (hasTierPriceColumns) return table as HTMLElement;
  }
  return null;
}

function findDeleteControl(row: HTMLTableRowElement): HTMLElement | null {
  const candidates = row.querySelectorAll<HTMLElement>(
    'button.action-delete, [data-action="remove_row"], [data-action="remove"], .action-delete, [class*="delete"], [class*="remove"]'
  );
  for (const c of candidates) {
    if (c.tagName === 'BUTTON' || c.tagName === 'A' || c.getAttribute('role') === 'button') return c;
  }
  for (const el of row.querySelectorAll<HTMLElement>('*')) {
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().toLowerCase();
    if (label.includes('delete') || label.includes('remove')) return el;
  }
  return null;
}

/**
 * Add the "Textil", "Outros artigos" and "Delete all" buttons to the tier prices page.
 */
export function renderTierPricesButtons(): void {
  if (!isTierPricesPage(location.href)) return;
  if (document.getElementById('mhx-tier-prices-btns')) return;

  const table = findTierPricesTable();
  if (!table) return;

  const btnWrap = document.createElement('div');
  btnWrap.className = 'mhx-tier-prices-btns';
  btnWrap.id = 'mhx-tier-prices-btns';
  btnWrap.style.cssText =
    'margin-bottom: 8px; display: flex; gap: 8px; flex-wrap: wrap;';

  const makeBtn = (label: string, onClick: () => void, title: string) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mhx-tier-prices-btn mhx-tier-prices-btn--fill';
    btn.textContent = label;
    btn.style.cssText = `
      padding: 6px 14px;
      border: 1px solid var(--mhx-pg-line);
      border-radius: 4px;
      cursor: pointer;
      font: 13px/1.4 system-ui, "Segoe UI", Arial, sans-serif;
      background: var(--mhx-pg-fill);
      color: var(--mhx-pg-ink);
    `;
    btn.title = title;
    btn.addEventListener('click', onClick);
    btnWrap.appendChild(btn);
  };

  makeBtn('Textil', () => { void fillTierPrices(table, TEXTIL_BANDS); }, 'Fill with Textil tier prices from Notion');
  makeBtn('Outros artigos', () => { void fillTierPrices(table, OUTROS_BANDS); }, 'Fill with Outros artigos tier prices from Notion');
  makeBtn('Delete all', () => { void deleteAllTierPrices(table); }, 'Remove all tier price rows');

  const tableSectionEl = table.parentElement ?? document.body;
  if (tableSectionEl) {
    tableSectionEl.insertBefore(btnWrap, tableSectionEl.firstChild);
  }
}

function readQty(row: HTMLTableRowElement): number {
  const inputs = row.querySelectorAll<HTMLInputElement>('input');
  for (const input of inputs) {
    if (/price_qty/i.test(input.name) || /qty|quantity/i.test(input.name) || /qty|quantity/i.test(input.id)) {
      const n = parseInt(input.value, 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  const cells = row.querySelectorAll('td');
  const qtyText = cells[2]?.textContent?.trim() ?? '';
  const n = parseInt(qtyText, 10);
  return Number.isNaN(n) ? NaN : n;
}

function setPrice(row: HTMLTableRowElement, discount: number): void {
  const selects = row.querySelectorAll<HTMLSelectElement>('select');
  for (const select of selects) {
    if (/value_type/i.test(select.name) || /value_type/i.test(select.id)) {
      for (const option of select.options) {
        if (/percent/i.test(option.text) || /percent/i.test(option.value)) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }
  }
  const setPct = (): boolean => {
    const inputs = row.querySelectorAll<HTMLInputElement>('input');
    for (const input of inputs) {
      if (/percentage_value/i.test(input.name) || /percentage_value/i.test(input.id)) {
        input.value = String(discount);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    }
    return false;
  };
  // Poll for the percentage_value input to appear after Magento swaps it in.
  let attempts = 0;
  const poll = () => {
    if (setPct()) return;
    if (attempts < 20) {
      attempts++;
      setTimeout(poll, 50);
    }
  };
  setTimeout(poll, 100);
}

function setQty(row: HTMLTableRowElement, qty: number): void {
  const inputs = row.querySelectorAll<HTMLInputElement>('input');
  for (const input of inputs) {
    if (/price_qty/i.test(input.name) || /qty|quantity/i.test(input.name) || /qty|quantity/i.test(input.id)) {
      input.value = String(qty);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
}

export async function deleteAllTierPrices(table: HTMLElement): Promise<void> {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // Delete rows one at a time: Magento re-renders the list after each delete,
  // so clicking them all synchronously only removes the first one.
  while (tbody.querySelectorAll('tr').length > 0) {
    const firstRow = tbody.querySelector('tr');
    if (!firstRow) break;
    const ctrl = findDeleteControl(firstRow as HTMLTableRowElement);
    if (!ctrl) break;
    const beforeCount = tbody.querySelectorAll('tr').length;
    ctrl.click();
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const check = () => {
        if (tbody.querySelectorAll('tr').length < beforeCount) resolve();
        else if (Date.now() - start < 1000) setTimeout(check, 50);
        else resolve();
      };
      setTimeout(check, 50);
    });
  }

  // If no delete controls were found, fall back to clearing all input values.
  if (tbody.querySelectorAll('tr').length > 0) {
    for (const row of Array.from(tbody.querySelectorAll('tr'))) {
      const inputs = row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');
      for (const el of inputs) {
        if (el instanceof HTMLInputElement) {
          el.value = '';
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (el instanceof HTMLSelectElement && el.options.length) {
          el.selectedIndex = 0;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }
}

export async function fillTierPrices(
  table: HTMLElement,
  bands: readonly TierBand[]
): Promise<void> {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // --- Clean existing rows first (delete one at a time) ---
  while (tbody.querySelectorAll('tr').length > 0) {
    const firstRow = tbody.querySelector('tr');
    if (!firstRow) break;
    const ctrl = findDeleteControl(firstRow as HTMLTableRowElement);
    if (!ctrl) break;
    const beforeCount = tbody.querySelectorAll('tr').length;
    ctrl.click();
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const check = () => {
        if (tbody.querySelectorAll('tr').length < beforeCount) resolve();
        else if (Date.now() - start < 1000) setTimeout(check, 50);
        else resolve();
      };
      setTimeout(check, 50);
    });
  }

  // If no delete controls were found, clear all input values in existing rows.
  if (tbody.querySelectorAll('tr').length > 0) {
    for (const row of Array.from(tbody.querySelectorAll('tr'))) {
      const inputs = row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');
      for (const el of inputs) {
        if (el instanceof HTMLInputElement) {
          el.value = '';
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (el instanceof HTMLSelectElement && el.options.length) {
          el.selectedIndex = 0;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }
  }

  // --- Fill bands ---
  const existingRows = Array.from(tbody.querySelectorAll('tr'));
  let rowIndex = 0;

  for (const band of bands) {
    let targetRow: HTMLTableRowElement | null = null;
    for (let i = rowIndex; i < existingRows.length; i++) {
      const candidateRow = existingRows[i];
      if (!candidateRow) continue;
      if (Number.isNaN(readQty(candidateRow))) {
        targetRow = candidateRow;
        rowIndex = i + 1;
        break;
      }
    }

    if (targetRow) {
      setQty(targetRow, band.from);
      setPrice(targetRow, band.discount);
    } else {
      const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
        (btn) => /^\s*add\s*$/i.test((btn.textContent ?? '').trim()),
      );
      if (!addButton) continue;
      const beforeCount = tbody.querySelectorAll('tr').length;
      addButton.click();
      await new Promise<void>((resolve) => {
        const start = Date.now();
        const check = () => {
          if (tbody.querySelectorAll('tr').length > beforeCount) resolve();
          else if (Date.now() - start < 1000) setTimeout(check, 50);
          else resolve();
        };
        setTimeout(check, 150);
      });
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const last = rows.length > 0 ? rows[rows.length - 1] : null;
      if (last) {
        setQty(last, band.from);
        setPrice(last, band.discount);
      }
    }
  }
}