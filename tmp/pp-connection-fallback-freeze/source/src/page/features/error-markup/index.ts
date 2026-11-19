// Feature: priority indicators next to the fields each listing error refers to.
import type { ListingError } from '../../../shared/schemas';
import { isProductEditPage, readPageSku } from '../../shared/magentoForm';

// SKU we last requested error-markup for, so the request fires once per product.
export let markedSku = '';

export const ICON_HIGH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
export const ICON_MEDIUM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
export const ICON_LOW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';

export const PRIORITY_ICONS: Record<string, string> = {
  High: ICON_HIGH,
  Medium: ICON_MEDIUM,
  Low: ICON_LOW,
};
export const PRIORITY_CLASS: Record<string, string> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
};
export const PRIORITY_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };

// Order matters: findErrorFields returns the first match, so longer/more
// specific phrases (box/bag dimensions) must precede the generic ones.
export const ERROR_FIELD_MAP: { keywords: string[]; fields: string[] }[] = [
  { keywords: ['box dimensions'], fields: ['box_dimensions'] },
  { keywords: ['bag dimensions'], fields: ['bag_dimensions'] },
  { keywords: ['dimensions'], fields: ['dimensions'] },
  { keywords: ['weight'], fields: ['weight'] },
  { keywords: ['grammage'], fields: ['grammage'] },
  {
    keywords: ['image', 'photo', 'picture', 'media', 'gallery', 'thumbnail'],
    fields: [
      'image',
      'thumbnail',
      'small_image',
      'swatch_image',
      'media_gallery',
    ],
  },
  {
    keywords: ['stock', 'quantity', 'inventory', 'qty'],
    fields: ['quantity_and_stock_status', 'qty'],
  },
  {
    keywords: ['price', 'cost', 'special_price', 'tier'],
    fields: ['price', 'special_price', 'tier_price'],
  },
  {
    keywords: ['attribute', 'color', 'option', 'variant'],
    fields: ['color', 'size'],
  },
  {
    keywords: ['category', 'taxonom', 'tag'],
    fields: ['category_ids', 'product_tag'],
  },
  {
    keywords: ['related', 'upsell', 'crosssell', 'cross-sell'],
    fields: ['related_products', 'upsell_products', 'crosssell_products'],
  },
  {
    keywords: [
      'translation',
      'text',
      'title',
      'description',
      'meta',
      'keyword',
      'seo',
      'url',
    ],
    fields: [
      'name',
      'description',
      'short_description',
      'meta_title',
      'meta_description',
      'meta_keywords',
      'url_key',
    ],
  },
];

/* ------------------------------------------------------------------------- */
/* On-page error-priority markup                                             */
/* ------------------------------------------------------------------------- */

export function findErrorFields(err: ListingError): string[] | null {
  const text = [
    ...err.errorGroup,
    ...err.errorType,
    err.notes,
    err.title,
  ]
    .join(' ')
    .toLowerCase();
  for (const map of ERROR_FIELD_MAP) {
    for (const keyword of map.keywords) {
      const re = new RegExp(`\\b${keyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (re.test(text)) return map.fields;
    }
  }
  return null;
}

/**
 * D3 fix: expand only the sections that actually contain error-marked fields,
 * not every collapsed section on the page.
 */
export function expandAncestorSections(field: Element): void {
  let el: Element | null = field;
  while (el) {
    if (
      el.classList.contains('admin__collapsible-block-wrapper') &&
      (el.classList.contains('_hide') || !el.classList.contains('_show'))
    ) {
      el.querySelector<HTMLElement>('.admin__collapsible-title')?.click();
    }
    el = el.parentElement;
  }
}

export function addIndicator(field: Element, err: ListingError): void {
  // Priority is already canonicalised by the Zod schema; fall back defensively.
  const priority = err.priority || 'Low';
  const pClass = PRIORITY_CLASS[priority] ?? 'low';
  const icon = PRIORITY_ICONS[priority] ?? ICON_LOW;

  const wrapper =
    field.closest('.admin__field, .admin_field, .admin__fieldset') ??
    field.parentElement;
  if (!wrapper) return;

  const existing = wrapper.querySelector<HTMLElement>('.mhx-error-indicator');
  if (existing) {
    // Keep the highest-priority indicator on an already-marked field.
    const current = existing.getAttribute('data-priority') ?? '';
    if ((PRIORITY_RANK[priority] ?? 0) <= (PRIORITY_RANK[current] ?? 0)) return;
    existing.remove();
  }

  const label = wrapper.querySelector<HTMLElement>(
    '.admin__field-label label, .admin_field-label label, label',
  );
  if (!label) return;

  const indicator = document.createElement('span');
  indicator.className = `mhx-error-indicator mhx-error-indicator--${pClass}`;
  indicator.innerHTML = icon;
  indicator.setAttribute('data-priority', priority);
  indicator.setAttribute(
    'data-tooltip',
    [err.title, err.notes].filter(Boolean).join('\n'),
  );
  // D2 fix: drive display via a class, not inline styles — reversible on clear.
  label.classList.add('mhx-error-label-host');
  label.appendChild(indicator);

  // D3 fix: expand only the ancestor sections of this field, not the whole page.
  expandAncestorSections(field);

  const labelWrapper = label.closest('.admin__field') ?? label.parentElement;
  if (labelWrapper) {
    labelWrapper.classList.remove(
      'mhx-error-label--high',
      'mhx-error-label--medium',
      'mhx-error-label--low',
    );
    labelWrapper.classList.add(`mhx-error-label--${pClass}`);
  }
}

/**
 * Draw priority indicators next to the form fields each error refers to.
 * D12 fix: returns counts so the caller can report real success/failure.
 */
export function applyErrorMarkup(errors: ListingError[]): { matched: number; unmatched: number } {
  if (!errors || errors.length === 0) return { matched: 0, unmatched: 0 };
  let matched = 0;
  let unmatched = 0;

  // D2 fix: clear all previously injected indicators and label classes before
  // re-drawing, so stale markup from a prior product load is never left behind.
  document.querySelectorAll('.mhx-error-indicator').forEach((el) => el.remove());
  document.querySelectorAll('.mhx-error-label-host').forEach((el) => {
    el.classList.remove('mhx-error-label-host');
  });
  document.querySelectorAll(
    '.mhx-error-label--high, .mhx-error-label--medium, .mhx-error-label--low',
  ).forEach((el) => {
    el.classList.remove('mhx-error-label--high', 'mhx-error-label--medium', 'mhx-error-label--low');
  });

  errors.forEach((err) => {
    if (!err || err.status === 'Done') return;
    const fieldNames = findErrorFields(err);
    if (!fieldNames) {
      unmatched += 1;
      return;
    }
    let placed = false;
    for (const name of fieldNames) {
      document
        .querySelectorAll(
          `input[name*="${name}"], textarea[name*="${name}"], select[name*="${name}"], [data-index="${name}"]`,
        )
        .forEach((field) => {
          addIndicator(field, err);
          placed = true;
        });
    }
    if (placed) matched += 1;
    else unmatched += 1;
  });

  if (unmatched > 0) {
    console.debug(`[mhx] ERROR_MARKUP: ${matched} matched, ${unmatched} unmatched`);
  }
  return { matched, unmatched };
}

/** Ask the background to fetch this SKU's errors and draw them on the page. */
export function maybeRequestErrorMarkup(): void {
  if (!isProductEditPage(location.href)) return;
  const sku = readPageSku();
  if (!sku || sku === markedSku) return;
  markedSku = sku;
  void chrome.runtime
    .sendMessage({ type: 'FETCH_ERROR_MARKUP', sku })
    .catch(() => {
      markedSku = ''; // allow a retry on the next scan
    });
}
