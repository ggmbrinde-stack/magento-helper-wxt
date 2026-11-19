// Magento admin product-form field access.
// Read helpers plus a per-field value application that never clicks Save
// (Build Plan rule: per-field Apply only, with snapshot + undo).

import { resolvePageContext } from '../../shared/pageContext';

export type MageFieldKind = 'name' | 'short_description';

export interface MageFormField {
  kind: MageFieldKind;
  label: string;
  value: string;
}

export interface MageFormState {
  isProductEditPage: boolean;
  pageSku: string;
  storeView: string;
  fields: MageFormField[];
}

/** Field control names as rendered by the Magento admin product form. */
const FIELD_CONTROL_NAMES: Record<MageFieldKind, string> = {
  name: 'product[name]',
  short_description: 'product[short_description]',
};

export const FIELD_LABELS: Record<MageFieldKind, string> = {
  name: 'Name',
  short_description: 'Short Description',
};

export const MAGE_FIELDS: MageFieldKind[] = ['name', 'short_description'];

export function isProductEditPage(url: string): boolean {
  // The admin URL names its controller, so read it instead of pattern-matching
  // a substring: this is the same resolver the feature scheduler will use, and
  // it cannot be fooled by `/catalog/product/edit` appearing in a query value.
  return resolvePageContext(url).area === 'product-edit';
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

function selectorFor(kind: MageFieldKind): string {
  return `input[name="${FIELD_CONTROL_NAMES[kind]}"], textarea[name="${FIELD_CONTROL_NAMES[kind]}"]`;
}

export function findField(
  kind: MageFieldKind,
): FieldElement | null {
  return document.querySelector<FieldElement>(selectorFor(kind));
}

export function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

export function readPageSku(): string {
  const sku = document.querySelector<HTMLInputElement>(
    'input[name="product[sku]"]',
  );
  return sku?.value.trim() ?? '';
}

/**
 * Writes a value into a Magento admin form field.
 *
 * The admin wraps inputs in UI components that keep their own value and only
 * react to events, so assigning `el.value` alone is silently ignored. Writing
 * through the prototype's native setter and then dispatching `input` (plus
 * `change` for good measure) is what the component listeners actually observe.
 */
export function applyFieldValue(el: FieldElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function readFieldValue(el: FieldElement | null): string {
  return el?.value ?? '';
}

export function readFormState(storeView: string): MageFormState {
  const fields: MageFormField[] = MAGE_FIELDS.map((kind) => ({
    kind,
    label: FIELD_LABELS[kind],
    value: readFieldValue(findField(kind)),
  }));
  return {
    isProductEditPage: isProductEditPage(location.href),
    pageSku: readPageSku(),
    storeView,
    fields,
  };
}

/**
 * Snapshot of a field before an Apply, so the operator can step back.
 * Keyed by field kind; only the most recent value per field is kept, because
 * chaining snapshots would otherwise apply against a moving target.
 */
export class FieldSnapshotStore {
  private readonly snapshots = new Map<MageFieldKind, string>();

  capture(kind: MageFieldKind, value: string): void {
    this.snapshots.set(kind, value);
  }

  recall(kind: MageFieldKind): string | undefined {
    return this.snapshots.get(kind);
  }

  has(kind: MageFieldKind): boolean {
    return this.snapshots.has(kind);
  }

  clear(kind: MageFieldKind): void {
    this.snapshots.delete(kind);
  }
}
