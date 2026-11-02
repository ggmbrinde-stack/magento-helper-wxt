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
function categoryPathFor(box: HTMLInputElement): string[] {
  let li = box.closest<HTMLLIElement>('li');
  if (!li) return [];
  const names: string[] = [];
  const seen = new Set<HTMLLIElement>();
  while (li && !seen.has(li)) {
    seen.add(li);
    const label = nodeLabel(li);
    if (label) names.unshift(label);

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
  return names;
}

function uniquePaths(paths: string[][]): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const raw of paths) {
    const path = raw.map((name) => squash(name)).filter(Boolean);
    if (path.length === 0) continue;
    const key = path.join(' > ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  // Deepest first: that is the category the product actually sits in.
  return out.sort((a, b) => b.length - a.length);
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

/**
 * Read PP + categories from the open product edit page.
 *
 * Returns `null` when this is not a product edit page (no Attribute Set and no
 * category tree), so the caller can tell "not read" from "read and empty".
 */
function categorySelectPaths(): string[][] {
  const selects = document.querySelectorAll<HTMLSelectElement>(
    'select[name*="categor" i], select[id*="categor" i]',
  );
  const out: string[][] = [];
  for (const select of selects) {
    const options =
      select.selectedOptions.length > 0
        ? Array.from(select.selectedOptions)
        : Array.from(select.options).filter((option) => option.selected);
    for (const option of options) {
      const text = squash(option.textContent);
      if (text) out.push([text]);
    }
  }
  return uniquePaths(out);
}

export async function readProductFacts(
  options: ReadProductFactsOptions = {},
): Promise<ResolverMagentoFacts | null> {
  const attributeSet = readAttributeSetName();
  let boxes = categoryBoxes();
  const selectPaths = categorySelectPaths();
  let categoryReason = '';

  if (boxes.length === 0 && selectPaths.length === 0 && options.activateCategoryTab) {
    const tab = findCategoryTab();
    if (tab) {
      tab.click();
      const loaded = await waitFor(() => categoryBoxes().length > 0, 4_000);
      boxes = categoryBoxes();
      if (!loaded) {
        categoryReason = 'the Categories tab did not load its tree';
      }
    } else {
      categoryReason = 'no Categories tab was found on this page';
    }
  } else if (boxes.length === 0 && selectPaths.length === 0) {
    categoryReason = 'the category selector is not loaded in this tab';
  }

  const checkboxPaths = uniquePaths(
    boxes
      .filter((box) => box.checked)
      .map((box) => categoryPathFor(box)),
  );
  const categoryPaths =
    checkboxPaths.length > 0 ? checkboxPaths : selectPaths;
  const categoryRead = checkboxPaths.length > 0 || selectPaths.length > 0 || boxes.length > 0;

  if (categoryRead && categoryPaths.length === 0 && !categoryReason) {
    categoryReason = 'no category is checked';
  }

  // No Attribute Set and no category selector: not a product edit page we can read.
  if (!attributeSet && !categoryRead) return null;

  return {
    attributeSet,
    ppCode: ppCodeFromAttributeSet(attributeSet),
    categoryPaths,
    categoryRead,
    categoryReason: categoryReason || undefined,
    readAt: new Date().toISOString(),
  };
}
