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
      void fillTierPrices(table, bands);
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
  // Switch value type to "percent" first (Magento swaps the price input).
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
  // Set the percentage value after Magento renders the right input.
  const setPct = () => {
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
  if (!setPct()) {
    setTimeout(setPct, 50);
    setTimeout(setPct, 200);
  }
  // Also try fixed-price input as fallback (in case percent input never appears).
  const inputs = row.querySelectorAll<HTMLInputElement>('input');
  for (const input of inputs) {
    if (/^tier_price\[\d+\]\[price\]$/i.test(input.name)) {
      // Only set if value_type is fixed; skip here since we use percent.
    }
  }
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

export async function fillTierPrices(
  table: HTMLElement,
  bands: readonly TierBand[]
): Promise<void> {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  // Update existing rows whose quantity matches a band.
  for (const row of Array.from(tbody.querySelectorAll('tr'))) {
    const qty = readQty(row);
    if (Number.isNaN(qty)) continue;
    const band = bands.find((b) => b.from === qty);
    if (band) setPrice(row, band.discount);
  }

  const addButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (btn) => /^\s*add\s*$/i.test((btn.textContent ?? '').trim()),
  );

  const missingBands = bands.filter(
    (band) => !Array.from(tbody.querySelectorAll('tr')).some((row) => readQty(row) === band.from)
  );

  // Add missing bands one at a time so Magento renders each row before filling.
  for (const band of missingBands) {
    if (!addButton) break;
    const beforeCount = tbody.querySelectorAll('tr').length;
    addButton.click();
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const check = () => {
        if (tbody.querySelectorAll('tr').length > beforeCount) {
          resolve();
        } else if (Date.now() - start < 1000) {
          setTimeout(check, 50);
        } else {
          resolve();
        }
      };
      setTimeout(check, 50);
    });
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const last = rows[rows.length - 1];
    if (last) {
      setQty(last, band.from);
      setPrice(last, band.discount);
    }
  }
}