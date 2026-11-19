/**
 * The rest of the Magento product-edit facts the resolver needs: tier prices,
 * price, stock, visibility, status, websites and weight.
 *
 * `productFacts.ts` owns the two values the storefront cannot supply (PP from
 * the Attribute Set name, categories from the checkbox tree). This module adds
 * the commercial fields from the same page and returns one snapshot, so the
 * resolver stores and the Enable flow reads a single object.
 *
 * Read-only. It never sets a value and never saves. The only click it may make
 * is expanding the "Advanced Pricing" fieldset on a tab the caller owns, so the
 * tier row inputs exist in the DOM.
 */

import {
  MAGENTO_FACTS_VERSION,
  type ResolverMagentoFacts,
  type ResolverPriceFacts,
  type ResolverStockFacts,
  type ResolverTierPrice,
} from '../../../shared/resolver';
import { readProductFacts, type ReadProductFactsOptions } from './productFacts';

export interface ReadAdminFactsOptions extends ReadProductFactsOptions {
  /** Expand Advanced Pricing when its rows are not rendered yet. */
  expandPricing?: boolean;
}

/** One `tier_price[N][field]` control as the DOM exposes it. */
export interface TierFieldInput {
  name: string;
  value: string;
  /** Selected option label for a `<select>` (website, customer group). */
  text?: string;
}

const TIER_FIELD = /^tier_price\[(\d+)\]\[([a-z_]+)\]$/i;

const ADVANCED_PRICING =
  /advanced\s*pric|pre[cç]o\s+avan[cç]ado|precios\s+avanzados|prix\s+avanc|prezzo\s+avanzato/i;

const PRICE_SELECTOR = 'input[name="product[price]"], input#price';
const SPECIAL_SELECTOR =
  'input[name="product[special_price]"], input#special_price';
const COST_SELECTOR = 'input[name="product[cost]"], input#cost';
const TAX_CLASS_SELECTOR =
  'select[name="product[tax_class_id]"], select#tax_class_id';
const QTY_SELECTOR = [
  'input[name="product[quantity_and_stock_status][qty]"]',
  'input[name="product[qty]"]',
  'input#inventory_qty',
].join(', ');
const IN_STOCK_SELECTOR = [
  'select[name="product[quantity_and_stock_status][is_in_stock]"]',
  'select#inventory_is_in_stock',
].join(', ');
const BACKORDERS_SELECTOR = [
  'select[name="product[stock_data][backorders]"]',
  'select#backorders',
].join(', ');
const VISIBILITY_SELECTOR =
  'select[name="product[visibility]"], select#visibility';
const STATUS_SELECTOR = 'select[name="product[status]"], select#status';
const WEIGHT_SELECTOR = 'input[name="product[weight]"], input#weight';
const WEBSITE_SELECTOR = [
  'input[name="product[website_ids][]"]',
  '#website_ids input[type="checkbox"]',
].join(', ');

/** Magento numeric inputs are plain decimals; labels can carry symbols. */
export function parseDecimal(raw: string | null | undefined): number | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  let cleaned = text.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    else cleaned = cleaned.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // A single comma with three decimals is more likely a thousands mark.
    const decimals = cleaned.length - lastComma - 1;
    cleaned = decimals === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  }
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function squash(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Value of an input/select, using the selected option's label for selects. */
function fieldValue(selector: string): string {
  const node = document.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  if (!node) return '';
  if (node instanceof HTMLSelectElement) {
    const option = node.options[node.selectedIndex];
    return squash(option?.textContent) || squash(node.value);
  }
  return squash(node.value);
}

function fieldNumber(selector: string): number | null {
  return parseDecimal(fieldValue(selector));
}

function fieldPresent(selector: string): boolean {
  return document.querySelector(selector) !== null;
}

/** Every `tier_price[...]` control currently rendered. */
export function readTierInputs(): TierFieldInput[] {
  const nodes = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      'input[name^="tier_price["], select[name^="tier_price["]',
    ),
  );
  return nodes.map((node) => {
    if (node instanceof HTMLSelectElement) {
      const option = node.options[node.selectedIndex];
      return { name: node.name, value: node.value, text: squash(option?.textContent) };
    }
    return { name: node.name, value: node.value };
  });
}

/**
 * Group `tier_price[N][field]` controls into rows and keep only complete ones.
 *
 * Magento leaves an empty trailing row (and a hidden `delete` field) in the
 * table, so "row exists" is not "tier price exists".
 */
export function parseTierPriceInputs(inputs: TierFieldInput[]): ResolverTierPrice[] {
  const rows = new Map<number, Record<string, TierFieldInput>>();
  for (const input of inputs) {
    const match = TIER_FIELD.exec(input.name);
    if (!match) continue;
    const index = Number.parseInt(match[1] ?? '', 10);
    const field = match[2];
    if (!Number.isFinite(index) || !field) continue;
    const row = rows.get(index) ?? {};
    row[field] = input;
    rows.set(index, row);
  }

  const out: ResolverTierPrice[] = [];
  for (const index of [...rows.keys()].sort((a, b) => a - b)) {
    const row = rows.get(index);
    if (!row) continue;
    const qty = parseDecimal(row.price_qty?.value);
    if (qty === null || qty <= 0) continue;

    const rawType = squash(row.value_type?.value).toLowerCase();
    const percent = parseDecimal(row.percentage_value?.value);
    const fixed = parseDecimal(row.price?.value);
    const valueType: ResolverTierPrice['valueType'] =
      rawType === 'percent' || (!rawType && percent !== null) ? 'percent' : 'fixed';
    const value = valueType === 'percent' ? percent : fixed;
    if (value === null) continue;

    out.push({
      qty,
      valueType,
      value,
      website: squash(row.website_id?.text) || squash(row.website_id?.value),
      group: squash(row.cust_group?.text) || squash(row.cust_group?.value),
    });
  }
  return out;
}

function findAdvancedPricing(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.fieldset-wrapper-title, .admin__collapsible-title, [data-role="collapsible-title"], .admin__page-nav-title',
    ),
  );
  for (const candidate of candidates) {
    if (ADVANCED_PRICING.test(squash(candidate.textContent))) return candidate;
  }
  return document.querySelector<HTMLElement>('[data-index="advanced_pricing"]');
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = (): void => {
      if (predicate()) return resolve(true);
      if (Date.now() - start >= timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * Make the tier rows readable. Expanding the fieldset is a view action on a
 * tab the caller opened; it changes no value.
 */
async function ensureTierInputs(expand: boolean): Promise<{ section: boolean; inputs: TierFieldInput[] }> {
  let inputs = readTierInputs();
  if (inputs.length > 0) return { section: true, inputs };

  const header = findAdvancedPricing();
  if (!header) return { section: false, inputs: [] };
  if (expand) {
    header.click();
    await waitFor(() => readTierInputs().length > 0, 1_500);
    inputs = readTierInputs();
  }
  return { section: true, inputs };
}

export function readPriceFacts(): ResolverPriceFacts {
  return {
    price: fieldNumber(PRICE_SELECTOR),
    specialPrice: fieldNumber(SPECIAL_SELECTOR),
    cost: fieldNumber(COST_SELECTOR),
    taxClass: fieldValue(TAX_CLASS_SELECTOR),
  };
}

function parseInStock(raw: string): boolean | null {
  const value = squash(raw).toLowerCase();
  if (!value) return null;
  if (value === '1' || value.startsWith('in stock')) return true;
  if (value === '0' || value.startsWith('out of stock')) return false;
  return null;
}

export function readStockFacts(): ResolverStockFacts {
  return {
    qty: fieldNumber(QTY_SELECTOR),
    isInStock: parseInStock(fieldValue(IN_STOCK_SELECTOR)),
    backorders: fieldValue(BACKORDERS_SELECTOR),
  };
}

export function readVisibility(): string {
  return fieldValue(VISIBILITY_SELECTOR);
}

export function readStatus(): string {
  const selectVal = fieldValue(STATUS_SELECTOR);
  if (selectVal) return selectVal;
  const chk = document.querySelector<HTMLInputElement>(
    'input[name="product[status]"], input#status',
  );
  if (chk) {
    if (chk.type === 'checkbox') return chk.checked ? 'Enabled' : 'Disabled';
    if (chk.value === '1') return 'Enabled';
    if (chk.value === '0') return 'Disabled';
  }
  return '';
}

function labelOf(box: HTMLInputElement): string {
  const label =
    box.closest('label') ??
    (box.id ? document.querySelector(`label[for="${CSS.escape(box.id)}"]`) : null);
  return squash(label?.textContent).replace(/\s*\*+\s*$/, '');
}

export function readWebsites(): string[] {
  const boxes = Array.from(
    document.querySelectorAll<HTMLInputElement>(WEBSITE_SELECTOR),
  ).filter((box) => box.checked);
  const names = boxes.map((box) => labelOf(box) || squash(box.value)).filter(Boolean);
  return [...new Set(names)];
}

/**
 * The full snapshot. Returns `null` when the page is not a product edit page
 * (no Attribute Set and no category tree), so the caller can tell "not read"
 * from "read and empty".
 */
export async function readAdminFacts(
  options: ReadAdminFactsOptions = {},
): Promise<ResolverMagentoFacts | null> {
  const base = await readProductFacts(options);
  if (!base) return null;

  const tiers = await ensureTierInputs(Boolean(options.expandPricing));
  let tierReason = '';
  if (!tiers.section) {
    tierReason = 'the Advanced Pricing section is not on this page';
  } else if (tiers.inputs.length === 0) {
    tierReason = 'the Advanced Pricing section is present but has no tier rows yet';
  }

  return {
    ...base,
    factsVersion: MAGENTO_FACTS_VERSION,
    tierPrices: parseTierPriceInputs(tiers.inputs),
    tierRead: tiers.section,
    tierReason: tierReason || undefined,
    priceRead:
      fieldPresent(PRICE_SELECTOR) ||
      fieldPresent(SPECIAL_SELECTOR) ||
      fieldPresent(COST_SELECTOR) ||
      fieldPresent(TAX_CLASS_SELECTOR),
    price: readPriceFacts(),
    stockRead:
      fieldPresent(QTY_SELECTOR) ||
      fieldPresent(IN_STOCK_SELECTOR) ||
      fieldPresent(BACKORDERS_SELECTOR),
    stock: readStockFacts(),
    visibilityRead: fieldPresent(VISIBILITY_SELECTOR),
    visibility: readVisibility(),
    statusRead: fieldPresent(STATUS_SELECTOR),
    status: readStatus(),
    websitesRead: fieldPresent(WEBSITE_SELECTOR),
    websites: readWebsites(),
    weightRead: fieldPresent(WEIGHT_SELECTOR),
    weight: fieldNumber(WEIGHT_SELECTOR),
    readAt: new Date().toISOString(),
  };
}
