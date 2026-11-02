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

/**
 * Add the "Textil" and "Outros artigos" buttons to the tier prices page.
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

  const addButton = (label: string, bands: readonly TierBand[]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mhx-tier-prices-btn mhx-tier-prices-btn--fill';
    btn.textContent = label;
    btn.style.cssText = `
      padding: 6px 14px;
      border: 1px solid var(--mhx-border, #e4e7eb);
      border-radius: 4px;
      cursor: pointer;
      font: 13px/1.4 system-ui, "Segoe UI", Arial, sans-serif;
      background: var(--mhx-surface, #fff);
      color: var(--mhx-ink);
    `;
    btn.title = `Fill with ${label} tier prices from Notion`;
    btn.addEventListener('click', () => {
      fillTierPrices(table, bands);
    });
    btnWrap.appendChild(btn);
  };

  addButton('Textil', TEXTIL_BANDS);
  addButton('Outros artigos', OUTROS_BANDS);

  const tableSectionEl = table.parentElement ?? document.body;
  if (tableSectionEl) {
    tableSectionEl.insertBefore(btnWrap, tableSectionEl.firstChild);
  }
}

/**
 * Read the quantity of a tier price row.
 */
function readQty(row: HTMLTableRowElement): number {
  const inputs = row.querySelectorAll<HTMLInputElement>('input');
  for (const input of inputs) {
    if (/qty|quantity/i.test(input.name) || /qty|quantity/i.test(input.id) || /qty|quantity/i.test(input.placeholder)) {
      const n = parseInt(input.value, 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  const cells = row.querySelectorAll('td');
  const qtyText = cells[3]?.textContent?.trim() ?? '';
  const n = parseInt(qtyText, 10);
  return Number.isNaN(n) ? NaN : n;
}

/**
 * Set the price/discount on a tier price row.
 */
function setPrice(row: HTMLTableRowElement, discount: number): void {
  // Try selects (Fixed/Percent).
  const selects = row.querySelectorAll<HTMLSelectElement>('select');
  for (const select of selects) {
    if (/price/i.test(select.name) || /price/i.test(select.id)) {
      for (const option of select.options) {
        if (/percent/i.test(option.text) || /percent/i.test(option.value)) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }
  }
  // Try inputs.
  const inputs = row.querySelectorAll<HTMLInputElement>('input');
  for (const input of inputs) {
    if (/price/i.test(input.name) || /price/i.test(input.id) || /price/i.test(input.placeholder)) {
      input.value = String(discount);
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  // Fall back to text replacement if no inputs matched.
  const cells = row.querySelectorAll('td');
  const priceCell = cells[4] as HTMLElement | undefined;
  if (priceCell && priceCell.querySelectorAll('input, select').length === 0) {
    const text = priceCell.textContent ?? '';
    if (/percent/i.test(text)) {
      priceCell.textContent = text.replace(/[\d.]+/, String(discount));
    } else {
      priceCell.textContent = `Percent ${discount}`;
    }
  }
}

/**
 * Fill the tier prices table with reference bands.
 */
export function fillTierPrices(
  table: HTMLElement,
  bands: readonly TierBand[]
): void {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const existing = Array.from(tbody.querySelectorAll('tr'));

  // Update existing rows whose quantity matches a band.
  for (const row of existing) {
    const qty = readQty(row);
    if (Number.isNaN(qty)) continue;
    const band = bands.find((b) => b.from === qty);
    if (band) setPrice(row, band.discount);
  }

  // Add missing rows via the page's own "Add" button so Magento owns the row.
  const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (btn) => /^\s*add\s*$/i.test((btn.textContent ?? '').trim()),
  );

  for (const band of bands) {
    const exists = existing.some((row) => readQty(row) === band.from);
    if (exists) continue;
    if (addButton) {
      addButton.click();
      setTimeout(() => {
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const last = rows[rows.length - 1];
        if (!last) return;
        const qtyInputs = last.querySelectorAll<HTMLInputElement>('input');
        for (const input of qtyInputs) {
          if (/qty|quantity/i.test(input.name) || /qty|quantity/i.test(input.id) || /qty|quantity/i.test(input.placeholder)) {
            input.value = String(band.from);
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        setPrice(last, band.discount);
      }, 100);
    } else {
      // Fallback: append a row (may not persist on Save, but visible).
      const newRow = document.createElement('tr');
      newRow.style.cssText = 'background: var(--mhx-surface-2);';
      const makeCell = (text: string) => {
        const td = document.createElement('td');
        td.textContent = text;
        return td;
      };
      newRow.appendChild(makeCell('All Websites [EUR]'));
      newRow.appendChild(makeCell('All Websites [EUR]'));
      newRow.appendChild(makeCell('ALL GROUPS'));
      newRow.appendChild(makeCell(String(band.from)));
      newRow.appendChild(makeCell(`Percent ${band.discount}`));
      tbody.appendChild(newRow);
    }
  }
}