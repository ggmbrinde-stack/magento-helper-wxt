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
  /** SKUs that were already children of this configurable, so they were skipped. */
  already: string[];
  /** True when the operator stopped the run; no selection was applied. */
  cancelled: boolean;
  added: number;
  selectedBefore: number;
  selectedAfter: number;
  totalSelected: number | null;
  tickedOnScreen: number;
  filterPasses: number;
}

export type PpDraftValue =
  | null
  | boolean
  | number
  | string
  | PpDraftValue[]
  | { [key: string]: PpDraftValue };

export interface PpDraftTranslation {
  raw: PpDraftValue;
  parsed?: PpDraftValue;
  parseError?: string;
}

export interface PpDraftRow {
  position: number;
  values: Record<string, PpDraftValue>;
  translations: Record<string, PpDraftTranslation>;
}

export interface PpDraftCollection {
  state: 'available' | 'missing' | 'invalid';
  rows: PpDraftRow[];
  truncated: boolean;
  identifierGaps: number;
  skippedPositions: number[];
}

export interface ScanPpDraftRequest {
  type: 'SCAN_PP_DRAFT';
}

export interface ScanPpDraftResponse {
  version: 1;
  status: 'ok' | 'partial' | 'unavailable' | 'identity-mismatch';
  entityId: string | null;
  providerEntityId?: PpDraftValue;
  routePath: string;
  scannedAt?: number;
  providerAttributeSetId?: PpDraftValue;
  generalAttributeSetId?: PpDraftValue;
  general: Record<string, PpDraftValue>;
  generalTranslations?: PpDraftTranslation;
  locations: PpDraftCollection;
  items: PpDraftCollection;
  warnings: string[];
  /** Visible native option text per item record_id. Display only, never an identity. */
  itemLabels?: Record<string, string>;
  /** Technique catalogue rendered by Magento's own dropdown. Display only. */
  catalogue?: Array<{ id: string; label: string }>;
}

/** Sanitized identity of an existing supported Magento edit tab. No tab URL/title. */
export interface PpPreviewTab {
  tabId: number;
  host: string;
  entityId: string;
  routePath: string;
  selectionToken: string;
}

export interface ListPpPreviewTabsRequest { type: 'LIST_PP_PREVIEW_TABS' }
export type ListPpPreviewTabsResponse =
  | { ok: true; tabs: PpPreviewTab[] }
  | { ok: false; reason: string };

export interface ReadPpPreviewDraftRequest {
  type: 'READ_PP_PREVIEW_DRAFT';
  tabId: number;
  selectionToken: string;
}
export type ReadPpPreviewDraftResponse =
  | { ok: true; tab: PpPreviewTab; snapshot: ScanPpDraftResponse }
  | { ok: false; reason: string };

export type PpReferenceSource = 'options-grid' | 'exact-record' | 'current-draft';
export interface PpSourceSelection { tabId: number; selectionToken: string }
export interface PpConnectionTab extends PpSourceSelection { host: string; kind: 'options-grid' | 'edit'; loading: boolean }
export interface CheckPpConnectionRequest {
  type: 'CHECK_PP_CONNECTION'; entityId: string; referenceSource: PpReferenceSource; selection?: PpSourceSelection;
}
export interface PpConnectionResponse {
  status: 'ready' | 'invalid' | 'no-source' | 'base-mismatch' | 'loading' | 'ambiguous' | 'changed' | 'unavailable';
  reason: string; tabs: PpConnectionTab[]; grid?: PpGridCoverage;
}
export interface ReadPpFreshFormRequest { type: 'READ_PP_FRESH_FORM'; requestId: string; entityId: string; referenceSource?: PpReferenceSource; selection?: PpSourceSelection }
export interface CancelPpFreshFormRequest { type: 'CANCEL_PP_FRESH_FORM'; requestId: string }
export interface GetPpFreshFormStateRequest { type: 'GET_PP_FRESH_FORM_STATE' }
export interface PpReadinessCheckpoint {
  document: 'loading' | 'interactive' | 'complete' | 'unknown';
  stage: 'document-loading' | 'route-mismatch' | 'registry-unavailable' | 'provider-unavailable' |
    'data-unavailable' | 'identity-missing' | 'identity-invalid' | 'identity-mismatch' | 'ready' | 'read-error';
  registry: 'unknown' | 'available' | 'unavailable';
  provider: 'unknown' | 'available' | 'unavailable';
  data: 'unknown' | 'available' | 'unavailable';
  identity: 'unknown' | 'missing' | 'invalid' | 'matching' | 'mismatched';
  blockedAccessor: boolean;
}
export type PpScanWarningCode = 'registry-unavailable' | 'provider-unavailable' | 'data-unavailable' |
  'identity-missing' | 'identity-mismatch' | 'route-mismatch' | 'partial-fields' | 'scan-error' |
  'no-scan-result' | 'invalid-scan-result' | 'wrong-frame' | 'injection-error';
export interface PpFreshReadiness {
  elapsedMs: number;
  checks: number;
  extractions: number;
  last?: PpReadinessCheckpoint;
  lastScanStatus?: ScanPpDraftResponse['status'] | 'no-result' | 'invalid-result' | 'injection-error';
  warningCodes: PpScanWarningCode[];
}
export interface PpGridCoverage {
  status: 'found' | 'duplicate' | 'invalid-link' | 'loading' | 'error' | 'not-in-loaded-results' |
    'incomplete' | 'unavailable' | 'changed' | 'ambiguous-source';
  freshness: 'loaded-unverified';
  /** Which loaded field the read refused, in words. Display only; never a Magento value. */
  detail?: string;
  loadedRows?: number;
  totalRows?: number;
  page?: number;
  pageSize?: number;
  filtered?: boolean;
}
export interface PpFreshFormResponse {
  source: 'fresh-magento-form-load' | 'current-open-page-draft';
  requestId: string;
  entityId: string;
  status: 'ok' | 'partial' | 'cancelled' | 'busy' | 'invalid' | 'unavailable' | 'auth' | 'cleanup-failed';
  reason: string;
  cleanup: 'not-created' | 'closed' | 'failed';
  host?: string;
  readAt?: number;
  snapshot?: ScanPpDraftResponse;
  leftoverTabId?: number;
  cleanupRequestId?: string;
  readiness?: PpFreshReadiness;
  reference?: { kind: PpReferenceSource; grid?: PpGridCoverage };
}
export interface PpFreshFormState {
  status: 'idle' | 'reading' | 'cleanup-failed';
  requestId?: string;
  leftoverTabId?: number;
}

/** One planned addition, already resolved to an exact face and Magento catalogue id. */
export interface PpApplyPlanRow {
  face: string;
  magentoFace: string;
  technique: string;
  catalogueId: string;
  /** Stored copies of this face and catalogue id that present plan rows already claim. */
  claimed?: number;
}
export interface PpApplyPlanResult {
  face: string;
  technique: string;
  catalogueId: string;
  outcome: 'added' | 'removed' | 'ordered' | 'failed' | 'skipped';
  reason: string;
}
export interface ApplyPpPlanRequest {
  type: 'APPLY_PP_PLAN';
  requestId: string;
  entityId: string;
  referenceSource?: 'options-grid' | 'exact-record';
  selection?: PpSourceSelection;
  /** Add missing rows, remove the exact rows chosen, set the existing rows to the plan order, or rebuild (remove then re-add) the out-of-order rows. */
  mode?: 'add' | 'remove' | 'order' | 'rebuild';
  rows: PpApplyPlanRow[];
}
export interface ApplyPpPlanResponse {
  source: 'fresh-magento-form';
  requestId: string;
  entityId: string;
  status: 'applied' | 'partial' | 'failed' | 'cancelled' | 'invalid' | 'unavailable' | 'busy' | 'auth';
  mode: 'add' | 'remove' | 'order' | 'rebuild';
  reason: string;
  keptOpen: boolean;
  tabId?: number;
  results: PpApplyPlanResult[];
  /** The helper form read again after the change, so the panel shows what is on the page now. */
  snapshot?: ScanPpDraftResponse;
  readAt?: number;
  readiness?: PpFreshReadiness;
  /** Read-only account of what the order lane saw, when the request set an order. */
  diagnostics?: unknown;
}
/** Press Magento's own Save in the helper tab that holds the apply result, then read it back. */
export interface SavePpFormRequest {
  type: 'SAVE_PP_FORM';
  requestId: string;
  entityId: string;
  tabId: number;
  rows: PpApplyPlanRow[];
  /** How the rows are arranged before the press: 'append' after their face, 'plan' in plan order. */
  arrangement?: 'append' | 'plan';
}
export interface SavePpFormResponse {
  source: 'pp-save';
  requestId: string;
  entityId: string;
  status: 'saved' | 'rejected' | 'unknown' | 'blocked' | 'invalid' | 'unavailable' | 'busy';
  reason: string;
  magentoMessage?: string;
  keptOpen: boolean;
  tabId?: number;
  readAt?: number;
  snapshot?: ScanPpDraftResponse;
  sortDiagnostic?: {
    entityId: string;
    before: PpSortCapture;
    after: PpSortCapture;
    outcome: SavePpFormResponse['status'];
  };
}

export interface PpSortCapture {
  at: number;
  available: boolean;
  truncated: boolean;
  rows: Array<{ face: string; name: string; catalogueId: string; sort: string }>;
}
