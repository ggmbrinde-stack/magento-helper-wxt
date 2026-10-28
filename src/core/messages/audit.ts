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
}

export interface ResolverNotionMetadata {
  backend: string;
  frontend: string;
  category?: string;
  subcategory?: string;
  supplier?: string;
  status?: string;
}

export interface ResolveAdminFallback {
  productId: string;
  backend: string;
  children: ResolverChild[];
}

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
  source?: 'cache' | 'storefront' | 'admin' | 'notion';
  adminBase?: string;
  adminFallback?: ResolveAdminFallback;
  notion?: ResolverNotionMetadata;
  resolutionError?: string;
  error?: string;
  warning?: string;
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
}

export interface SearchMagentoResponse {
  found: boolean;
  productId?: string;
  sku?: string;
  status?: string;
  children?: ResolverChild[];
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
