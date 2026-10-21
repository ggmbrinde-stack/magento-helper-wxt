import type { ListingError, SkuLibrary } from './schemas';
import type { MageFieldKind, MageFormState } from './magentoForm';
import type { ResolverJson } from './resolver';
import type { ListingErrorPayload } from './payload';
import type { PushReport } from './listingWriter';
import type { ImageAuditResult } from './imageAudit';
import type { TextAuditResult } from './textAudit';
import type { NotionHealthReport } from './notionHealth';
import type { BatchJob, BatchOptions } from './batch';
import type { LibraryReport } from './skuLibraryWriter';
import type {
  BridgeCatalog,
  BridgeHealth,
  ModelBridgeConfig,
} from './modelBridge';

/** Messages exchanged between the panel and the background service worker. */
export interface FetchSkuDataRequest {
  type: 'FETCH_SKU_DATA';
  sku: string;
  storeView: string;
}

export interface FetchSkuDataResponse {
  skuLibrary: SkuLibrary | null;
  errors: ListingError[];
  skippedRows: number;
  error?: string;
}

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

/* ------------------------------------------------------------------------- */
/* SKU Lookup (content ⇄ background ⇄ panel)                                  */
/* ------------------------------------------------------------------------- */

export interface LookupChild {
  id: string;
  sku: string;
  color: string;
  size: string;
  backend: string;
}

/** A resolved product: how the panel renders a lookup result. */
export interface LookupEntry {
  title: string;
  sku: string;
  backend: string;
  frontend: string;
  frontendEs?: string;
  frontendFr?: string;
  productId: string;
  children: LookupChild[];
  category?: string;
  subcategory?: string;
  supplier?: string;
  status?: string;
}

export type LookupSource = 'resolver' | 'notion' | 'storefront' | 'admin';

export interface LookupSkuRequest {
  type: 'LOOKUP_SKU';
  sku: string;
}

export interface LookupSkuResponse {
  found: boolean;
  source?: LookupSource;
  entry?: LookupEntry;
  error?: string;
}

/** Cached resolver entry, keyed by SKU in `chrome.storage.local`. */
export interface ResolverEntry {
  id: string;
  sku: string;
  backend: string;
  children: LookupChild[];
  timestamp: number;
}

export type ResolverMap = Record<string, ResolverEntry>;

/* ------------------------------------------------------------------------- */
/* Audit — Slice 1: resolver / variants / Magento links                       */
/* ------------------------------------------------------------------------- */

/** Run the full resolver (search -> PDP -> parse) for one SKU. */
export interface ResolveSkuRequest {
  type: 'RESOLVE_SKU';
  sku: string;
  /** Explicit bestofgifts.eu product URL (skips the catalogsearch step). */
  url?: string;
}

export interface ResolveSkuResponse {
  ok: boolean;
  resolver?: ResolverJson;
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* Audit — Slice 2: payload builder + create-only Notion writer               */
/* ------------------------------------------------------------------------- */

/** Build (and optionally push) Listing Errors payloads for one SKU. */
export interface PushListingErrorsRequest {
  type: 'PUSH_LISTING_ERRORS';
  sku: string;
  /** Dossier markdown (records/skus/<SKU>.md contents) with marker blocks. */
  content: string;
  link?: string;
  supplier?: string;
  /** Auto-fetch EN breadcrumbs for Category/Subcategory (default true). */
  fetchBreadcrumbs?: boolean;
  /** Write for real (create-only). When false, build + report only. */
  confirm: boolean;
}

export interface PushListingErrorsResponse {
  ok: boolean;
  /** True when nothing was written (preview / disabled / no token). */
  dryRun?: boolean;
  payloads?: ListingErrorPayload[];
  anomalies?: string[];
  report?: PushReport;
  error?: string;
}

/** Ask the open admin tab to search its product grid (last-resort lookup). */
export interface SearchMagentoRequest {
  type: 'SEARCH_MAGENTO';
  sku: string;
}

export interface SearchMagentoResponse {
  found: boolean;
  productId?: string;
  children?: LookupChild[];
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* Audit — Slice 3: image audit (duplicates / order / background)             */
/* ------------------------------------------------------------------------- */

/** Fetch live storefront media and run the mechanical image checks. */
export interface AuditImagesRequest {
  type: 'AUDIT_IMAGES';
  sku: string;
  /** Explicit bestofgifts.eu product URL (skips the catalogsearch step). */
  url?: string;
  /** Storefront languages to compare (default EN, ES, FR). */
  langs?: string[];
  /** Download + SHA-256 every unique image (duplicates check). Default false. */
  hashImages?: boolean;
  /** Sample the pos0 border tone (background check). Default true. */
  background?: boolean;
  maxChildren?: number;
  /** Cap on unique image downloads (default 800). */
  maxImages?: number;
}

export interface AuditImagesResponse {
  ok: boolean;
  audit?: ImageAuditResult;
  /** `<!-- image-audit:begin -->` block, ready to paste into Push errors. */
  mdBlock?: string;
  /** Collection-level anomalies (media fetch, decode, caps). */
  anomalies?: string[];
  stats?: { mediaFiles: number; imagesDownloaded: number; imagesSkipped: number };
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* Audit — Slice 4: text audit (translation / composition / specs)            */
/* ------------------------------------------------------------------------- */

/** Fetch live EN/ES/FR PDPs and run the mechanical text checks. */
export interface AuditTextRequest {
  type: 'AUDIT_TEXT';
  sku: string;
  /** Explicit bestofgifts.eu product URL (skips the catalogsearch step). */
  url?: string;
  /** Storefront languages to compare (default EN, ES, FR). */
  langs?: string[];
}

export interface AuditTextResponse {
  ok: boolean;
  audit?: TextAuditResult;
  /** `<!-- text-audit:begin -->` block, ready to paste into Push errors. */
  mdBlock?: string;
  /** Fetch-level anomalies (missing alternate, HTTP error). */
  anomalies?: string[];
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* Audit — Notion connection health (read-only pre-flight)                    */
/* ------------------------------------------------------------------------- */

/** Probe token, both databases and the write contract. Creates nothing. */
export interface NotionHealthRequest {
  type: 'NOTION_HEALTH';
}

export interface NotionHealthResponse {
  ok: boolean;
  report?: NotionHealthReport;
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* D4 fix: single-writer resolver cache                                       */
/* The content script and lookup path both send this message; only the        */
/* background service worker reads and writes chrome.storage.local.           */
/* ------------------------------------------------------------------------- */

/** Ask the background to store a resolver entry (content script → background). */
export interface ResolveCachePutRequest {
  type: 'RESOLVE_CACHE_PUT';
  entry: ResolverEntry;
}

export interface ResolveCachePutResponse {
  ok: boolean;
}

/* ------------------------------------------------------------------------- */
/* On-page error markup: panel/content -> background (query) -> content (draw) */
/* ------------------------------------------------------------------------- */

export interface FetchErrorMarkupRequest {
  type: 'FETCH_ERROR_MARKUP';
  sku: string;
}

export interface FetchErrorMarkupResponse {
  success?: boolean;
  errorCount?: number;
  error?: string;
}

/** Background -> content: the Listing Errors to draw next to form fields. */
export interface ErrorMarkupMessage {
  type: 'ERROR_MARKUP';
  errors: ListingError[];
}

/* ------------------------------------------------------------------------- */
/* Audit — batch runner (paste SKUs -> full browser pipeline)                  */
/* ------------------------------------------------------------------------- */

/** Start a new batch. Accepts either a raw pasted list or pre-parsed SKUs. */
export interface BatchStartRequest {
  type: 'BATCH_START';
  /** Raw paste; parsed + deduped in the background. */
  input?: string;
  /** Already-parsed SKUs (used when the UI validated them locally). */
  skus?: string[];
  /** Unsupported tokens to surface back to the caller. */
  invalid?: string[];
  options?: Partial<BatchOptions>;
}

export interface BatchStartResponse {
  ok: boolean;
  job?: BatchJob;
  invalid?: string[];
  error?: string;
}

/** Pause / resume / cancel the current batch. */
export interface BatchControlRequest {
  type: 'BATCH_PAUSE' | 'BATCH_RESUME' | 'BATCH_CANCEL' | 'BATCH_CLEAR';
}

export interface BatchControlResponse {
  ok: boolean;
  job?: BatchJob | null;
  error?: string;
}

/** Read the persisted job (used on mount and as a fallback to storage events). */
export interface BatchStateRequest {
  type: 'BATCH_STATE';
}

export interface BatchStateResponse {
  ok: boolean;
  job?: BatchJob | null;
  payloadCount: number;
  error?: string;
}

/**
 * Review-then-push: one confirm for the whole batch. With `confirm: false` it
 * returns the combined payload list + contract warnings and writes nothing.
 */
export interface BatchPushRequest {
  type: 'BATCH_PUSH';
  confirm: boolean;
  /** Create Listing Errors rows (create-only). Default true. */
  listingErrors?: boolean;
  /** Create/update SKU Library rows (whitelisted cells). Default false. */
  library?: boolean;
}

export interface BatchPushResponse {
  ok: boolean;
  dryRun?: boolean;
  payloadCount?: number;
  warnings?: string[];
  report?: PushReport;
  libraryReport?: LibraryReport;
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* Audit — model bridge (local `opencode serve`) for the model-sort stage      */
/* ------------------------------------------------------------------------- */

/** Read the saved bridge config, probe the server and list its models. */
export interface ModelBridgeStatusRequest {
  type: 'MODEL_BRIDGE_STATUS';
}

export interface ModelBridgeStatusResponse {
  ok: boolean;
  config?: ModelBridgeConfig;
  health?: BridgeHealth;
  catalog?: BridgeCatalog;
  error?: string;
}

/** Persist the bridge config, then re-probe so the UI reflects reality. */
export interface ModelBridgeSaveRequest {
  type: 'MODEL_BRIDGE_SAVE';
  config: ModelBridgeConfig;
}

export interface ModelBridgeSaveResponse extends ModelBridgeStatusResponse {}
