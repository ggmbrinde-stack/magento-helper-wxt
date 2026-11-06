/**
 * Lane A — page UI contracts.
 *
 * Everything the Magento page and the side panel exchange with the worker about
 * the page itself: form state, guarded field writes, colour groups, the page
 * SKU, and the browser-tab capability our own controls ask for.
 *
 * These contracts describe the page. They never carry Notion or audit data —
 * that belongs in `audit.ts`, which this lane may read.
 */

import type { MageFieldKind, MageFormState } from '../../page/shared/magentoForm';

export interface OpenTabGroupRequest {
  type: 'OPEN_TAB_GROUP';
  urls: string[];
  groupName: string;
}

export interface OpenTabGroupResponse {
  success: boolean;
  groupId?: number;
  tabIds?: number[];
  error?: string;
}

/** M3a — read the current product-form field state from the open admin tab. */
export interface GetFormStateRequest {
  type: 'GET_FORM_STATE';
}

export interface GetFormStateResponse {
  available: boolean;
  state?: MageFormState;
  reason?: string;
}

/** M3a — apply (or step back from) one field on the open admin tab. */
export interface ApplyFieldRequest {
  type: 'APPLY_FIELD';
  sku: string;
  storeView: string;
  field: MageFieldKind;
  /** 'apply' writes the value, 'undo' restores the pre-apply snapshot. */
  action: 'apply' | 'undo';
  value: string;
}

export interface ApplyFieldResponse {
  ok: boolean;
  appliedValue?: string;
  previousValue?: string;
  reason?: string;
}

/** V2 — read the open page's configurable colour groups (read-only). */
export interface ConfigGroup {
  label: string;
  urls: string[];
}

export interface GetConfigRequest {
  type: 'GET_CONFIG';
}

export interface GetConfigResponse {
  available: boolean;
  /** True while a collapsed Configurations section is being expanded. */
  pending?: boolean;
  sku?: string;
  groups: ConfigGroup[];
  reason?: string;
}

/** V2 — plain SKU read from the open admin tab (read-only). */
export interface GetSkuRequest {
  type: 'GET_SKU';
}

export interface GetSkuResponse {
  sku: string;
}

/**
 * Bulk-select SKUs in the open "Select Associated Product" modal.
 *
 * The request is sent by the content script's panel. The response is the report
 * produced by the injected page-world function in
 * `src/page/features/assoc-bulk/page.ts`.
 */
export interface SelectAssociatedSkusRequest {
  type: 'SELECT_ASSOCIATED_SKUS';
  skus: string[];
}

export interface SelectAssociatedSkusResponse {
  ok: boolean;
  reason?: string;
  requested: number;
  found: number;
  missing: string[];
  added: number;
  selectedBefore: number;
  selectedAfter: number;
  totalSelected: number | null;
  tickedOnScreen: number;
  filterPasses: number;
}
