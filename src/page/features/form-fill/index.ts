// Feature: the guarded field write (and its Undo snapshot).
import type { ApplyFieldRequest, ApplyFieldResponse } from '../../../core/messages';
import { WRITES_ENABLED } from '../../../shared/flags';
import { detectStoreView } from '../../../shared/store';
import {
  FieldSnapshotStore,
  MAGE_FIELDS,
  applyFieldValue,
  findField,
  isProductEditPage,
  normalizeSku,
  readFieldValue,
  readPageSku,
} from '../../shared/magentoForm';

// Snapshots live for the lifetime of the content script (the open tab), so an
// Undo always steps back to what the field held before this extension wrote.
export const snapshots = new FieldSnapshotStore();

/**
 * Guards every write: the operator must be looking at the same product (SKU)
 * and the same store view they selected in the panel. A mismatch means the
 * page changed under us, so we refuse rather than write the wrong record.
 */
export function guardFailure(
  sku: string,
  storeView: string,
): string | null {
  if (!isProductEditPage(location.href)) {
    return 'Not on a Magento product edit page.';
  }
  const pageSku = readPageSku();
  if (!pageSku) {
    return 'No SKU on the open page - load the product first.';
  }
  if (!sku.trim()) {
    return 'No SKU provided by the panel.';
  }
  if (normalizeSku(pageSku) !== normalizeSku(sku)) {
    return `SKU guard: open page is "${pageSku}", panel requested "${sku}".`;
  }
  const pageStoreView = detectStoreView(location.href);
  if (
    storeView &&
    storeView !== 'all' &&
    pageStoreView !== 'all' &&
    pageStoreView !== storeView
  ) {
    return `Store-view guard: open page scope is ${pageStoreView}, panel requested ${storeView}.`;
  }
  return null;
}

export function handleApplyField(
  msg: ApplyFieldRequest,
): ApplyFieldResponse {
  if (!WRITES_ENABLED) {
    return { ok: false, reason: 'Writing to the page is paused.' };
  }
  const guard = guardFailure(msg.sku, msg.storeView);
  if (guard) return { ok: false, reason: guard };
  if (!MAGE_FIELDS.includes(msg.field)) {
    return { ok: false, reason: `Unknown field "${msg.field}".` };
  }
  const el = findField(msg.field);
  if (!el) {
    return {
      ok: false,
      reason: 'Field not found on the open product page.',
    };
  }
  const current = readFieldValue(el);

  if (msg.action === 'undo') {
    if (!snapshots.has(msg.field)) {
      return { ok: false, reason: 'Nothing to undo for this field.' };
    }
    const previous = snapshots.recall(msg.field) ?? '';
    applyFieldValue(el, previous);
    snapshots.clear(msg.field);
    return { ok: true, appliedValue: previous, previousValue: current };
  }

  snapshots.capture(msg.field, current);
  applyFieldValue(el, msg.value);
  return { ok: true, appliedValue: msg.value, previousValue: current };
}
