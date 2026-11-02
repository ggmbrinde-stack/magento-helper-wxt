/**
 * Lane B — audit contracts.
 *
 * Everything that produces audit knowledge: the storefront resolver and its
 * admin fallback, image and text audits, the payload builder and the guarded
 * Notion writers, Notion health, and the on-page error markup data.
 *
 * Other lanes may import types from here. This lane must not import from
 * `ui.ts` or `automation.ts`.
 */

import type { ListingError, SkuLibrary } from '../../shared/schemas';
import type { ResolverJson } from '../../shared/resolver';
import type { ListingErrorPayload } from '../../audit';
import type { ListingPreflight, PushReport } from '../../audit';
import type { ImageAuditResult } from '../../audit';
import type { TextAuditResult } from '../../audit';
import type { NotionHealthReport } from '../../audit';
import type { VariantTargets } from '../../audit';
import type { AvailabilityCheck } from '../../audit';
import type { SupplierLinkInfo } from '../../audit';

/* ------------------------------------------------------------------------- */
/* SKU data for the panel (SKU Library row + open errors, read-only)          */
/* ------------------------------------------------------------------------- */

export interface FetchSkuDataRequest {
  type: 'FETCH_SKU_DATA';
  sku: string;
  storeView: string;
}

export interface FetchSkuDataResponse {
  skuLibrary: SkuLibrary | null;
  errors: ListingError[];
  skippedRows: number;
  /** More open errors exist than the read ceiling (10 pages / 1,000 rows). */
  truncated?: boolean;
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* SKU resolution: storefront resolver, Notion enrichment and admin fallback */
/* ------------------------------------------------------------------------- */

export interface ResolverChild {
  id: string;
  sku: string;
  color: string;
  size: string;
  backend: string;
  /**
   * False when the admin reports the child disabled. Undefined = the page did
   * not expose a status column (unknown, never assumed enabled).
   */
  enabled?: boolean;
}

export interface ResolverNotionMetadata {
  backend: string;
  frontend: string;
  category?: string;
  subcategory?: string;
  /** L3, when the SKU Library exposes a Sub-subcategory property (C4). */
  subSubCategory?: string;
  supplier?: string;
  /** Confirmed supplier site / product page (D1). */
  supplierLink?: string;
  supplierProduct?: string;
  status?: string;
}

export interface ResolveAdminFallback {
  productId: string;
  backend: string;
  /**
   * The product grid's Status cell (`Enabled` / `Disabled`). The grid lists
   * disabled products, which is the only way to name the state of a SKU that
   * has no storefront page at all. Empty when the column was not returned.
   */
  status?: string;
  /** Magento `type_id` when the grid reported it (`simple`, `configurable`, …). */
  productType?: string;
  /** Every assigned child, including disabled ones (the admin matrix is status-blind). */
  children: ResolverChild[];
  /** Why `children` is empty, when it is. */
  childrenReason?: string;
}

/**
 * Storefront breadcrumb vs the SKU Library category row (C5). Both sides are
 * reported so a mismatch is readable without opening either source.
 */
export interface CategoryCheck {
  storefront: { l1: string; l2: string; l3: string; l4: string };
  notion: { category: string; subcategory: string; subSubCategory: string };
  mismatches: string[];
}

/** Another cached SKU that resolves to the same product (E3). */
export interface CacheDuplicate {
  sku: string;
  frontend_url: string;
  configurable_id: number | null;
  reason: string;
}

/** Run the full resolver (search -> PDP -> parse) for one SKU. */
export interface ResolveSkuRequest {
  type: 'RESOLVE_SKU';
  sku: string;
  /** Explicit bestofgifts.eu product URL (skips the catalogsearch step). */
  url?: string;
  /** Bypass the cache and re-resolve (F1). */
  force?: boolean;
}

export interface ResolveSkuResponse {
  ok: boolean;
  resolver?: ResolverJson;
  source?: 'cache' | 'storefront' | 'admin' | 'notion';
  adminBase?: string;
  adminFallback?: ResolveAdminFallback;
  notion?: ResolverNotionMetadata;
  /** Intended colour x size matrix from the admin matrix (all children, any status). */
  targets?: VariantTargets;
  /** Why the target matrix could not be built. */
  targetsError?: string;
  /** Supplier attribution: tier, official site, catalogue link + provenance (D4). */
  supplier?: SupplierLinkInfo;
  /** Last stored supplier-availability verdict, when one was checked (D4). */
  availability?: AvailabilityCheck | null;
  /** Storefront breadcrumb vs SKU Library category (C5). */
  categoryCheck?: CategoryCheck;
  /** Other cached SKUs resolving to the same product (E3). */
  duplicates?: CacheDuplicate[];
  /** True when the payload came from the cache past its TTL (F1). */
  stale?: boolean;
  /** Age of the payload in days (F2). */
  ageDays?: number | null;
  resolutionError?: string;
  error?: string;
  warning?: string;
}

/** Check one SKU against its supplier catalogue now (D2/D3). */
export interface CheckSupplierRequest {
  type: 'CHECK_SUPPLIER';
  sku: string;
  /** Ignore the cached verdict and fetch again. */
  force?: boolean;
}

export interface CheckSupplierResponse {
  ok: boolean;
  check?: AvailabilityCheck;
  error?: string;
}

/** Download the visible product-gallery images from a confirmed Makito URL. */
export interface DownloadMakitoImagesRequest {
  type: 'DOWNLOAD_MAKITO_IMAGES';
  sku: string;
  catalogUrl: string;
}

export interface DownloadMakitoImagesResponse {
  ok: boolean;
  /** Downloads Chrome accepted. */
  started?: number;
  /** Downloads that reached the disk. */
  saved?: number;
  /** Gallery photos found on the page. */
  total?: number;
  folder?: string;
  failures?: { url: string; error: string }[];
  error?: string;
}

/** Read or clear the per-SKU resolver cache (F5). */
export interface ResolverCacheRequest {
  type: 'RESOLVER_CACHE';
  action: 'list' | 'delete' | 'clear';
  sku?: string;
}

export interface ResolverCacheResponse {
  ok: boolean;
  entries?: import('../../shared/resolver').ResolverJson[];
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

/**
 * Background -> open admin tab: search its product grid (last-resort lookup).
 * Declared here because the resolver initiates it; the page lane answers it.
 */
export interface SearchMagentoRequest {
  type: 'SEARCH_MAGENTO';
  sku: string;
  /** Child entity ids already known from the storefront payload. */
  childIds?: string[];
  /**
   * The configurable parent's entity id. When the open tab is that product's
   * edit page, the Configurations matrix is read directly - it is status-blind
   * (so disabled children appear) and needs no admin grid query.
   */
  parentId?: string;
  /**
   * Allow the reader to expand a collapsed Configurations section. Only set when
   * the extension opened (and will close) the tab itself - never on the
   * operator's own tab.
   */
  expand?: boolean;
}

export interface SearchMagentoResponse {
  found: boolean;
  productId?: string;
  sku?: string;
  status?: string;
  /** Every assigned child read from the open product's Configurations matrix. */
  children?: ResolverChild[];
  /** Why `children` is empty, when it is (collapsed section, no edit page, …). */
  childrenReason?: string;
  /** Magento `type_id` for the row, e.g. `simple` or `configurable`. */
  productType?: string;
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
/* On-page error markup: panel/content -> background (query) -> content (draw) */
/* ------------------------------------------------------------------------- */

export interface FetchErrorMarkupRequest {
  type: 'FETCH_ERROR_MARKUP';
  sku: string;
}

export interface FetchErrorMarkupResponse {
  success?: boolean;
  errorCount?: number;
  truncated?: boolean;
  error?: string;
}

/** Background -> content: the Listing Errors to draw next to form fields. */
export interface ErrorMarkupMessage {
  type: 'ERROR_MARKUP';
  errors: ListingError[];
}
