/**
 * Read the two facts the resolver cannot get from the storefront: the PP and the
 * assigned category path.
 *
 * PP is not a field of its own in this store. It is encoded in the Attribute Set
 * name, e.g. `AS>PP0957_CONJ ESCRITA 2 Peças - ...`. That is the value shown in
 * the product edit header, so it is read from the Attribute Set control (or its
 * static label/value form once Magento locks it).
 *
 * Categories are the checked nodes of the Categories tab. On a tab the
 * extension owns (`activateCategoryTab`) the reader may click the tab, because
 * Magento loads its content over AJAX; on the operator's own tab it never
 * navigates - it reads whatever is already in the DOM.
 *
 * Pure DOM reading. Nothing here saves, clicks a category, or changes a value.
 */

import type { ResolverMagentoFacts } from '../../../shared/resolver';

const ATTRIBUTE_SET_SELECT = [
  'select[name="product[attribute_set_id]"]',
  'select[name="attribute_set_id"]',
  'select#attribute_set_id',
].join(', ');

/**
 * Magento 2.4.7+ shows the set as a text field with a "change" dialog instead
 * of a dropdown, so the name arrives as a plain input value.
 */
const ATTRIBUTE_SET_INPUT =
  'input[name="attribute-set-name"], input#attribute-set-name, input[name="attribute_set_name"]';

const ATTRIBUTE_SET_LABEL =
  /\battribute\s*set\b|conjunto\s+de\s+atributos|jeu\s+d'?attributs|conjunto\s+de\s+atributos/i;

const CATEGORY_TAB_LABEL =
  /^(categories|categorias|categorías|catégories|kategorien)$/i;

/** Product-edit category roots seen across Magento versions/themes. */
const CATEGORY_ROOTS = [
  '#product-categories',
  '[data-role="product-categories"]',
  '.category-tree',
  '.categories-tree',
  '#category-tree',
].join(', ');

/** Checkbox names used by the product category tree across Magento builds. */
const CATEGORY_BOX_SELECTORS = [
  'input[type="checkbox"][name="category_ids[]"]',
  'input[type="checkbox"][name="product[categories][]"]',
  'input[type="checkbox"][name="product[category_ids][]"]',
  'input[type="checkbox"][name="add_category_ids[]"]',
  'input.category-checkbox',
  'input[type="checkbox"][name*="categor" i]',
];

export interface ReadProductFactsOptions {
  /**
   * Activate the Categories tab when its tree is not in the DOM. Only pass true
   * for a tab the extension opened and will close.
   */
  activateCategoryTab?: boolean;
}

/** Parse `PP0957`, `PP-957`, `PP 957` out of an Attribute Set name. */
export function ppCodeFromAttributeSet(name: string): string {
  const match = /(?:^|[^A-Za-z0-9])[\s>_:.-]*PP\s*[-_ ]?(\d{1,6})(?!\d)/i.exec(name ?? '');
  return match?.[1] ?? '';
}

/** PP codes compare by number: `0957` and `957` are the same profile. */
export function samePpCode(a: string, b: string): boolean {
  const left = Number.parseInt((a ?? '').replace(/\D+/g, ''), 10);
  const right = Number.parseInt((b ?? '').replace(/\D+/g, ''), 10);
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
  }
  return left === right;
}

function squash(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Remove Magento scope hints and the required asterisk from a label. */
function fieldLabelText(raw: string | null | undefined): string {
  return squash(raw)
    .replace(/\s*\((?:global|store view|website|all store views)\)\s*$/i, '')
    .replace(/\s*\[[^\]]*\]\s*$/g, '')
    .replace(/\s*\*+\s*$/, '')
    .trim();
}

function optionsText(select: HTMLSelectElement): string {
  const option = select.options[select.selectedIndex];
  const text = squash(option?.textContent) || squash(option?.value);
  return /^(select\.{0,3}|--\s*please select\s*--|-)$/i.test(text) ? '' : text;
}

/** Text of a field's visible value when it is not an input/select. */
function staticFieldValue(field: Element): string {
  const control =
    field.querySelector<HTMLElement>('.admin__field-control') ??
    field.querySelector<HTMLElement>('[data-role="field-value"]');
  if (!control) return '';
  const clone = control.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('input, select, textarea, button, script, style, [class*="mhx-"]')
    .forEach((node) => node.remove());
  return squash(clone.textContent);
}

/** The value of a labelled admin field (select/input, else static text). */
function labelledFieldValue(labelPattern: RegExp): string {
  const labels = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.admin__field-label, .admin__field-label span, label, th.label, .label',
    ),
  );
  for (const label of labels) {
    if (!labelPattern.test(fieldLabelText(label.textContent))) continue;
    const field =
      label.closest('.admin__field, .field, tr, fieldset') ??
      label.parentElement;
    if (!field) continue;
    const select = field.querySelector<HTMLSelectElement>('select');
    if (select) {
      const text = optionsText(select);
      if (text) return text;
    }
    const input = field.querySelector<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])',
    );
    if (input && squash(input.value)) return squash(input.value);
    const hidden = field.querySelector<HTMLInputElement>('input[type="hidden"]');
    if (hidden && squash(hidden.value)) return squash(hidden.value);
    const text = staticFieldValue(field);
    if (text) return text;
  }
  return '';
}

/** Attribute Set name exactly as the product edit page shows it. */
export function readAttributeSetName(): string {
  const named = document.querySelector<HTMLInputElement>(ATTRIBUTE_SET_INPUT);
  if (named) {
    const value = squash(named.value) || squash(named.defaultValue);
    if (value) return value;
  }
  const select = document.querySelector<HTMLSelectElement>(ATTRIBUTE_SET_SELECT);
  if (select) {
    const text = optionsText(select);
    if (text) return text;
  }
  // Some builds replace the select with a static value plus a hidden input.
  const hidden = document.querySelector<HTMLInputElement>(
    'input[name="product[attribute_set_id]"], input[name="attribute_set_id"]',
  );
  if (hidden && squash(hidden.value)) {
    const selected = document.querySelector<HTMLElement>(
      `[data-attribute-set-id="${CSS.escape(hidden.value)}"]`,
    );
    if (selected) {
      const text = squash(selected.textContent);
      if (text) return text;
    }
  }
  return labelledFieldValue(ATTRIBUTE_SET_LABEL);
}

/**
 * PP, Attribute Set name and id from the product edit page, in one read.
 *
 * PP is the only fact here that the storefront cannot supply, so it is kept in
 * one place: the value shown in the "Attribute Set" dropdown (or its static
 * form), the id beside it, and the `PPnnnn` code parsed out of the name. No PP
 * in the name means an empty code — never a guessed one.
 */
export interface AttributeSetProfile {
  name: string;
  id: string;
  ppCode: string;
}

export function readAttributeSetProfile(): AttributeSetProfile {
  const name = readAttributeSetName();
  return { name, id: readAttributeSetId(), ppCode: ppCodeFromAttributeSet(name) };
}

/** Attribute Set id from the select/hidden input, when the page exposes it. */
export function readAttributeSetId(): string {
  const named = document.querySelector<HTMLInputElement>(
    'input[name="attribute-set-id"], input#attribute-set-id',
  );
  if (named && squash(named.value)) return squash(named.value);
  const select = document.querySelector<HTMLSelectElement>(ATTRIBUTE_SET_SELECT);
  if (select && squash(select.value)) return squash(select.value);
  const hidden = document.querySelector<HTMLInputElement>(
    'input[name="product[attribute_set_id]"], input[name="attribute_set_id"]',
  );
  return hidden ? squash(hidden.value) : '';
}

/** The checkout checkboxes currently in the DOM (tree may not be loaded yet). */
function categoryBoxes(): HTMLInputElement[] {
  const boxes = new Set<HTMLInputElement>();
  const roots = Array.from(document.querySelectorAll<HTMLElement>(CATEGORY_ROOTS));
  for (const root of roots) {
    root
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((box) => boxes.add(box));
  }
  for (const selector of CATEGORY_BOX_SELECTORS) {
    document.querySelectorAll<HTMLInputElement>(selector).forEach((box) => boxes.add(box));
  }
  return Array.from(boxes);
}

/** The label of one tree node, without its children or helper chrome. */
function nodeLabel(li: HTMLLIElement): string {
  const direct = li.querySelector<HTMLElement>(':scope > label');
  if (direct) {
    const text = squash(direct.textContent).replace(/^\s*\*+\s*/, '');
    if (text) return text;
  }
  const clone = li.cloneNode(true) as HTMLLIElement;
  clone
    .querySelectorAll(
      'ul, ol, input, select, textarea, button, script, style, [class*="mhx-"], .admin__field-error, .tooltip',
    )
    .forEach((node) => node.remove());
  return squash(clone.textContent).replace(/^[\s>*•·\-–—]+/, '');
}

/**
 * Ancestor names of one tree item, root first.
 *
 * Supports both shapes Magento has shipped: nested (`li > ul > li`) and the
 * sibling form the mass-update tree uses (`li` followed by its child `ul`).
 */
function ancestorItems(box: HTMLInputElement): HTMLLIElement[] {
  let li = box.closest<HTMLLIElement>('li');
  if (!li) return [];
  const items: HTMLLIElement[] = [];
  const seen = new Set<HTMLLIElement>();
  while (li && !seen.has(li)) {
    seen.add(li);
    items.unshift(li);

    // Nested tree: the list sits inside its parent li.
    const nested: HTMLLIElement | null =
      li.parentElement?.closest<HTMLLIElement>('li') ?? null;
    if (nested && nested !== li) {
      li = nested;
      continue;
    }
    // Sibling tree: the list is preceded by the parent li.
    const sibling: Element | null = li.parentElement?.previousElementSibling ?? null;
    li = sibling instanceof HTMLLIElement ? sibling : null;
  }
  return items;
}

/**
 * Category name + id per ancestor, kept aligned: a node whose own checkbox is
 * not found still contributes its name, and its id slot is empty rather than
 * shifting every later id onto the wrong name.
 */
function categoryEntryFor(box: HTMLInputElement): CategoryEntry {
  const path: string[] = [];
  const ids: string[] = [];
  for (const li of ancestorItems(box)) {
    const name = nodeLabel(li);
    if (!name) continue;
    path.push(name);
    const own = li.querySelector<HTMLInputElement>(
      ':scope > input[type="checkbox"], :scope > label > input[type="checkbox"]',
    );
    ids.push(own?.value ?? '');
  }
  return { path, ids };
}

interface CategoryEntry {
  path: string[];
  ids: string[];
}

/** De-duplicate by path, keep ids aligned, deepest first (the real home). */
function uniqueEntries(entries: CategoryEntry[]): CategoryEntry[] {
  const seen = new Set<string>();
  const out: CategoryEntry[] = [];
  for (const raw of entries) {
    const path = raw.path.map((name) => squash(name)).filter(Boolean);
    if (path.length === 0) continue;
    const key = path.join(' > ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, ids: raw.ids.slice(0, path.length) });
  }
  // Deepest first: that is the category the product actually sits in.
  return out.sort((a, b) => b.path.length - a.path.length);
}

function findCategoryTab(): HTMLElement | null {
  // Exact ids shipped by Magento's product edit tabs.
  const direct = document.querySelector<HTMLElement>(
    'a[href="#product_info_tabs_categories"], a#product_info_tabs_categories, a[href="#product_info_tabs_categories_content"]',
  );
  if (direct) return direct;

  const tabs = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.admin__page-nav-link, [role="tab"], .tabs a, .ui-tabs-anchor, a',
    ),
  );
  for (const tab of tabs) {
    if (!CATEGORY_TAB_LABEL.test(squash(tab.textContent))) continue;
    if (tab.closest('.admin__page-nav, [role="tablist"], .tabs, .ui-tabs')) {
      return tab;
    }
  }
  return null;
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return predicate();
}

/** The product form container, as every build we support names it. */
const PRODUCT_FORM =
  '#product_form, .product-edit, [data-ui-id="product-form"], form[data-role="product-form"]';

/**
 * Wait until the edit form is actually built and parsed.
 *
 * The pass is often requested on a tab the resolver just opened, so the message
 * can arrive while the document is still parsing: the Attribute Set select (near
 * the top of the markup) is already there, while price, stock, visibility and
 * the tab bar further down are not. Reading then reported PP correctly and every
 * other fact as "not read". Wait for the form plus one commercial field, which
 * only exist once the page is complete.
 */
async function waitForEditForm(): Promise<void> {
  const commercial =
    'input[name="product[price]"], input#price, select[name="product[status]"], select#status';
  const ready = (): boolean =>
    document.readyState !== 'loading' &&
    document.querySelector(PRODUCT_FORM) !== null &&
    document.querySelector(commercial) !== null;
  if (ready()) return;
  await waitFor(ready, 8_000);
}

/**
 * Read PP + categories from the open product edit page.
 *
 * Returns `null` when this is not a product edit page (no Attribute Set and no
 * category tree), so the caller can tell "not read" from "read and empty".
 */
function categorySelectEntries(): CategoryEntry[] {
  const selects = document.querySelectorAll<HTMLSelectElement>(
    'select[name*="categor" i], select[id*="categor" i]',
  );
  const out: CategoryEntry[] = [];
  for (const select of selects) {
    const options =
      select.selectedOptions.length > 0
        ? Array.from(select.selectedOptions)
        : Array.from(select.options).filter((option) => option.selected);
    for (const option of options) {
      const text = squash(option.textContent);
      if (text) out.push({ path: [text], ids: option.value ? [option.value] : [] });
    }
  }
  return uniqueEntries(out);
}

export async function readProductFacts(
  options: ReadProductFactsOptions = {},
): Promise<ResolverMagentoFacts | null> {
  // The pass can be requested on a tab that is still parsing, so the form is
  // awaited before anything is read rather than reporting it as unreadable.
  await waitForEditForm();
  const attributeSet = readAttributeSetName();
  let boxes = categoryBoxes();
  let selectEntries = categorySelectEntries();
  let categoryReason = '';

  if (boxes.length === 0 && selectEntries.length === 0 && options.activateCategoryTab) {
    const tab = findCategoryTab();
    if (tab) {
      tab.click();
      const loaded = await waitFor(() => categoryBoxes().length > 0, 4_000);
      boxes = categoryBoxes();
      selectEntries = categorySelectEntries();
      if (!loaded) {
        categoryReason = 'the Categories tab did not load its tree';
      }
    } else {
      categoryReason = 'no Categories tab was found on this page';
    }
  } else if (boxes.length === 0 && selectEntries.length === 0) {
    categoryReason = 'the category selector is not loaded in this tab';
  }

  const checkedEntries = uniqueEntries(
    boxes.filter((box) => box.checked).map(categoryEntryFor),
  );
  const entries = checkedEntries.length > 0 ? checkedEntries : selectEntries;
  const categoryPaths = entries.map((entry) => entry.path);
  const categoryIds = entries.map((entry) => entry.ids);
  const categoryRead =
    checkedEntries.length > 0 || selectEntries.length > 0 || boxes.length > 0;

  if (categoryRead && categoryPaths.length === 0 && !categoryReason) {
    categoryReason = 'no category is checked';
  }

  // No Attribute Set and no category selector: not a product edit page we can read.
  if (!attributeSet && !categoryRead) return null;

  return {
    // Base fields only. `readAdminFacts` raises the version and fills the rest.
    factsVersion: 1,
    attributeSet,
    attributeSetId: readAttributeSetId(),
    ppCode: ppCodeFromAttributeSet(attributeSet),
    categoryPaths,
    categoryIds,
    categoryRead,
    categoryReason: categoryReason || undefined,
    tierPrices: [],
    tierRead: false,
    tierReason: 'tier prices are read by the full admin facts pass',
    priceRead: false,
    price: { price: null, specialPrice: null, cost: null, taxClass: '' },
    stockRead: false,
    stock: { qty: null, isInStock: null, backorders: '' },
    visibilityRead: false,
    visibility: '',
    statusRead: false,
    status: '',
    websitesRead: false,
    websites: [],
    weightRead: false,
    weight: null,
    readAt: new Date().toISOString(),
  };
}
