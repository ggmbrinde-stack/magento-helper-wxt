// Resolve a SKU from the storefront (or the per-SKU cache), then enrich it with
// Notion metadata and the Magento admin matrix, and check the result against
// itself: duplicate products (E3), category drift (C5), child SKUs (E7), stale
// cache (F1).
//
// Security: admin URLs can contain a secret `key` segment, so this module
// never logs them.

import {
  loadSettings,
  mapSkuLibraryPage,
  queryDatabase,
} from '../shared/notion/client';
import { SkuLibrarySchema, validateRows } from '../shared/schemas';
import {
  RESOLVER_SCHEMA,
  RESOLVER_TTL_DAYS,
  isResolverJson,
  normalizeUrl,
  resolveSkuWithHtml,
  type ResolverChildDetail,
  type ResolverJson,
} from '../shared/resolver';
import { adminEditUrl, DEFAULT_ADMIN_BASE, normalizeAdminBase } from '../shared/magento';
import { variantTargetsFromRows } from './variants';
import { supplierLinkFor, type SupplierLinkInfo } from './supplierLinks';
import { loadAvailability, type AvailabilityCheck } from './supplierAvailability';
import type {
  CacheDuplicate,
  CategoryCheck,
  ResolveAdminFallback,
  ResolverChild,
  ResolveSkuResponse,
  ResolverNotionMetadata,
  SearchMagentoRequest,
  SearchMagentoResponse,
} from '../core/messages';

/** One storage key per SKU; the flat maps are migrated away (F5). */
export const RESOLVER_CACHE_PREFIX = 'mhx:resolver:';
const LEGACY_CACHE_KEYS = ['resolverMap', 'resolverMapV2'] as const;
const DAY_MS = 86_400_000;

function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

function normalizeBase(url: string): string {
  return url.trim() ? normalizeAdminBase(url) : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function resolverCacheKey(sku: string): string {
  return `${RESOLVER_CACHE_PREFIX}${normalizeSku(sku)}`;
}

/** Cache entries carry their age so the UI can label a stale result (F1/F2). */
function withAge(resolver: ResolverJson): ResolverJson {
  const generated = Date.parse(resolver.generated);
  if (!Number.isFinite(generated)) return { ...resolver, stale: true };
  const days = Math.max(0, (Date.now() - generated) / DAY_MS);
  return {
    ...resolver,
    age_days: Math.round(days * 10) / 10,
    stale: days > RESOLVER_TTL_DAYS,
  };
}

/** Never persist the derived fields, or they would age in place. */
function stripVolatile(resolver: ResolverJson): ResolverJson {
  const clone = { ...resolver };
  delete clone.cached;
  delete clone.stale;
  delete clone.age_days;
  return clone;
}

let cacheWriteQueue: Promise<void> = Promise.resolve();

/** Serialize read-modify-write updates from resolver requests. */
export function cacheResolverJson(
  sku: string,
  resolver: ResolverJson,
): Promise<void> {
  const write = cacheWriteQueue.then(async () => {
    // A partial admin payload is not a resolver result: never cache it (F7).
    if (resolver.partial) return;
    await chrome.storage.local.set({
      [resolverCacheKey(sku)]: stripVolatile(resolver),
    });
  });
  cacheWriteQueue = write.catch(() => undefined);
  return write;
}

let migration: Promise<void> | null = null;

/**
 * Move `resolverMap` / `resolverMapV2` into per-SKU keys, then drop the flat
 * maps. Runs at most once per session and is safe to call concurrently.
 */
function migrateLegacyCache(): Promise<void> {
  if (migration) return migration;
  migration = (async () => {
    const stored = await chrome.storage.local.get([...LEGACY_CACHE_KEYS]);
    const writes: Record<string, ResolverJson> = {};
    let found = false;
    for (const key of LEGACY_CACHE_KEYS) {
      const map = stored[key];
      if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
      found = true;
      for (const value of Object.values(map as Record<string, unknown>)) {
        if (!isResolverJson(value)) continue;
        const target = resolverCacheKey(value.sku);
        if (writes[target]) continue;
        writes[target] = stripVolatile(value);
      }
    }
    if (Object.keys(writes).length > 0) {
      await chrome.storage.local.set(writes);
    }
    if (found) await chrome.storage.local.remove([...LEGACY_CACHE_KEYS]);
  })().catch(() => undefined);
  return migration;
}

export async function getCachedResolver(
  sku: string,
): Promise<ResolverJson | undefined> {
  await cacheWriteQueue;
  const key = resolverCacheKey(sku);
  let value = (await chrome.storage.local.get([key]))[key];
  if (!isResolverJson(value)) {
    await migrateLegacyCache();
    value = (await chrome.storage.local.get([key]))[key];
  }
  if (!isResolverJson(value)) return undefined;
  if (normalizeSku(value.sku) !== normalizeSku(sku)) return undefined;
  return withAge({ ...value, cached: true });
}

/** Every cached payload, newest first - the cache screen and overview use it. */
export async function readResolverCache(): Promise<ResolverJson[]> {
  await cacheWriteQueue;
  await migrateLegacyCache();
  const stored = await chrome.storage.local.get(null);
  const out: ResolverJson[] = [];
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith(RESOLVER_CACHE_PREFIX)) continue;
    if (!isResolverJson(value)) continue;
    out.push(withAge(value));
  }
  return out.sort((a, b) => Date.parse(b.generated) - Date.parse(a.generated));
}

export async function deleteCachedResolver(sku: string): Promise<void> {
  await chrome.storage.local.remove([resolverCacheKey(sku)]);
}

export async function clearResolverCache(): Promise<void> {
  const stored = await chrome.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) =>
    key.startsWith(RESOLVER_CACHE_PREFIX),
  );
  if (keys.length > 0) await chrome.storage.local.remove(keys);
}

/**
 * The one freshness rule (F6). Run audit and Resolve SKU both go through here,
 * so a batch cannot resolve a SKU from a different snapshot than the card.
 */
export interface CachedResolveRun {
  resolver: ResolverJson;
  /** Only a live fetch has HTML; a cache hit does not. */
  enHtml: string | null;
  cached: boolean;
}

export async function resolveWithCache(
  skuRaw: string,
  opts: { force?: boolean; url?: string; signal?: AbortSignal } = {},
): Promise<CachedResolveRun> {
  const sku = normalizeSku(skuRaw);
  if (!sku) throw new Error('SKU is required');
  if (!opts.force && !opts.url) {
    const cached = await getCachedResolver(sku);
    if (cached && !cached.stale) return { resolver: cached, enHtml: null, cached: true };
  }
  const resolved = await resolveSkuWithHtml(sku, { url: opts.url, signal: opts.signal });
  await cacheResolverJson(sku, resolved.resolver).catch(() => undefined);
  return { resolver: resolved.resolver, enHtml: resolved.enHtml, cached: false };
}

async function notionEnrichment(
  sku: string,
  settings: Awaited<ReturnType<typeof loadSettings>>,
): Promise<{
  metadata?: ResolverNotionMetadata;
  warning?: string;
}> {
  if (!settings.notionToken) return {};
  try {
    const pages = await queryDatabase(
      settings.notionToken,
      settings.skuLibraryDb,
      { property: 'SKU', title: { equals: sku } },
      1,
    );
    const { rows } = validateRows(
      SkuLibrarySchema,
      pages.map(mapSkuLibraryPage),
    );
    const row = rows[0];
    if (!row) return {};
    return {
      metadata: {
        backend: row.backend,
        frontend: row.frontend,
        category: row.category,
        subcategory: row.subcategory,
        subSubCategory: row.subSubcategory,
        supplier: row.supplier,
        supplierLink: row.supplierLink,
        supplierProduct: row.supplierProduct,
        status: row.status,
      },
    };
  } catch (err) {
    return {
      warning: `Notion enrichment failed: ${errorMessage(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Admin-grid fallback: ask an open admin tab to search its product grid.
// ---------------------------------------------------------------------------

function adminBaseFromTab(tabUrl: string, fallback: string): string {
  const match = tabUrl.match(/^(https:\/\/[^/]+(?:\/[^/]+)?\/)/);
  const base = match?.[1] ?? fallback;
  return normalizeBase(base);
}

/**
 * Put the helper into an admin tab that was open before the extension was
 * (re)loaded. `tabs.sendMessage` cannot reach such a tab, which used to surface
 * as "the helper content script is not loaded" after every reload - the tab has
 * no listener until it is reloaded or the bundle is injected.
 *
 * The file list comes from the manifest, so a rebuilt output name cannot break
 * it, and the content script's boot guard makes a repeat injection a no-op.
 */
async function ensureHelperContentScript(tabId: number): Promise<boolean> {
  const files = [
    ...new Set(
      (chrome.runtime.getManifest().content_scripts ?? []).flatMap(
        (script) => script.js ?? [],
      ),
    ),
  ];
  if (files.length === 0) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
    return true;
  } catch {
    return false;
  }
}

/** Send one message to a tab, injecting the helper once if it is missing. */
async function sendToTab<T>(tabId: number, message: unknown): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch (first) {
    if (!(await ensureHelperContentScript(tabId))) throw first;
    // Give a freshly injected listener a moment to bind on a tab that is still
    // finishing its own load, then retry exactly once.
    await new Promise((resolve) => setTimeout(resolve, 200));
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  }
}

async function tryAdminGrid(
  sku: string,
  fallbackBase: string,
  childIds?: string[],
): Promise<ResolveAdminFallback> {
  const allTabs = await chrome.tabs.query({});
  const adminTabs = allTabs.filter((t) =>
    /^https:\/\/bestofgifts/.test(t.url ?? ''),
  );
  const adminTab =
    adminTabs.find((t) => (t.url ?? '').includes('/catalog/product')) ??
    adminTabs.find((t) => (t.url ?? '').includes('admin'));
  if (!adminTab?.id) {
    throw new Error(
      'No Magento admin tab is open; admin-grid fallback is unavailable.',
    );
  }

  const request: SearchMagentoRequest = { type: 'SEARCH_MAGENTO', sku, childIds };
  let response: SearchMagentoResponse | undefined;
  try {
    response = await sendToTab<SearchMagentoResponse>(adminTab.id, request);
  } catch (err) {
    throw new Error(
      `Admin tab found but the helper could not be loaded into it (${errorMessage(err)}). Reload the admin page and resolve again.`,
    );
  }
  if (!response?.found || !response.productId) {
    throw new Error(response?.error ?? 'SKU not found in the Magento admin grid.');
  }

  const base = adminBaseFromTab(adminTab.url ?? '', fallbackBase);
  const children: ResolverChild[] = (response.children ?? []).map((child) => ({
    ...child,
    backend: child.backend || adminEditUrl(base, child.id),
  }));
  return {
    productId: response.productId,
    backend: adminEditUrl(base, response.productId),
    status: response.status ?? '',
    children,
    childrenReason: response.childrenReason,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Post-resolution checks
// ---------------------------------------------------------------------------

function adminChildDetail(children: ResolverChild[]): ResolverChildDetail[] {
  return children.map((child) => ({
    id: child.id,
    sku: child.sku,
    color: child.color,
    size: child.size,
    enabled: child.enabled,
    source: 'admin',
  }));
}

/**
 * F7: a payload built from the admin matrix alone. It is explicitly partial,
 * never cached, and says what it cannot answer instead of looking complete.
 */
function partialResolverFromAdmin(
  sku: string,
  fallback: ResolveAdminFallback,
  supplier: SupplierLinkInfo,
): ResolverJson {
  const parsedId = Number.parseInt(fallback.productId, 10);
  const children = fallback.children.map((child) => child.id);
  return {
    schema: RESOLVER_SCHEMA,
    sku,
    ok: true,
    verified: false,
    generated: new Date().toISOString(),
    store: 'bestofgifts.eu',
    source: 'admin',
    frontend_url: '',
    slug: null,
    product_type: 'configurable',
    configurable_id: Number.isFinite(parsedId) ? parsedId : null,
    simple_product_id: null,
    attributes: {},
    attribute_option_counts: {},
    index: {},
    children,
    child_count: children.length,
    option_prices_count: 0,
    hreflang: {},
    store_urls: {},
    snapshots: {},
    anomalies: ['storefront resolution failed - payload built from the admin matrix only'],
    notices: [
      'variants, images and text are unavailable in an admin-only payload',
      'run Resolve again once the storefront page is reachable to get the full payload',
    ],
    children_detail: adminChildDetail(fallback.children),
    magento_status: fallback.status
      ? {
          label: fallback.status,
          source: 'admin-grid',
          checked_at: new Date().toISOString(),
        }
      : undefined,
    supplier: {
      supplier: supplier.supplier,
      tier: supplier.tier,
      official: supplier.official,
      catalog: supplier.catalog,
      catalogSource: supplier.catalogSource,
      reviewFlags: supplier.reviewFlags,
    },
    partial: true,
  };
}

function foldCategory(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** C5: the breadcrumb and the SKU Library row must agree, at resolve time. */
function buildCategoryCheck(
  resolver: ResolverJson,
  notion: ResolverNotionMetadata | undefined,
): CategoryCheck | undefined {
  if (!resolver.categories?.ok || !notion) return undefined;
  const store = resolver.categories;
  const pairs: { label: string; storefront: string; stored: string }[] = [
    { label: 'category', storefront: store.l1, stored: notion.category ?? '' },
    { label: 'subcategory', storefront: store.l2, stored: notion.subcategory ?? '' },
    {
      label: 'sub-subcategory',
      storefront: store.l3,
      stored: notion.subSubCategory ?? '',
    },
  ];
  const mismatches: string[] = [];
  for (const pair of pairs) {
    if (!pair.storefront || !pair.stored) continue;
    if (foldCategory(pair.storefront) === foldCategory(pair.stored)) continue;
    mismatches.push(
      `${pair.label}: storefront "${pair.storefront}" vs SKU Library "${pair.stored}"`,
    );
  }
  return {
    storefront: { l1: store.l1, l2: store.l2, l3: store.l3, l4: store.l4 },
    notion: {
      category: notion.category ?? '',
      subcategory: notion.subcategory ?? '',
      subSubCategory: notion.subSubCategory ?? '',
    },
    mismatches,
  };
}

/** E3: another cached SKU pointing at the same product or frontend URL. */
async function findDuplicates(resolver: ResolverJson): Promise<CacheDuplicate[]> {
  let all: ResolverJson[];
  try {
    all = await readResolverCache();
  } catch {
    return [];
  }
  const url = normalizeUrl(resolver.frontend_url);
  const out: CacheDuplicate[] = [];
  for (const other of all) {
    if (normalizeSku(other.sku) === normalizeSku(resolver.sku)) continue;
    const sameUrl = url !== '' && normalizeUrl(other.frontend_url) === url;
    const sameProduct =
      resolver.configurable_id !== null &&
      other.configurable_id !== null &&
      resolver.configurable_id === other.configurable_id;
    if (!sameUrl && !sameProduct) continue;
    out.push({
      sku: other.sku,
      frontend_url: other.frontend_url,
      configurable_id: other.configurable_id,
      reason: sameUrl ? 'same frontend URL' : 'same configurable id',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function resolveSkuForDashboard(
  skuRaw: string,
  url?: string,
  force = false,
): Promise<ResolveSkuResponse> {
  const sku = normalizeSku(skuRaw);
  if (!sku) return { ok: false, error: 'SKU is required.' };

  const settings = await loadSettings();
  const adminBase = normalizeBase(settings.adminBaseUrl) || DEFAULT_ADMIN_BASE;
  const warnings: string[] = [];

  // The admin matrix is the only status-blind child source, so it runs in
  // parallel with the storefront even when the resolver succeeds.
  const adminAttempt = tryAdminGrid(sku, adminBase)
    .then((fallback) => ({ ok: true as const, fallback }))
    .catch((err) => ({ ok: false as const, error: errorMessage(err) }));

  let resolver: ResolverJson | undefined;
  let enHtml: string | null = null;
  let source: ResolveSkuResponse['source'];
  let resolverFailure: string | undefined;
  let fresh = false;

  if (!url && !force) {
    try {
      resolver = await getCachedResolver(sku);
    } catch (err) {
      warnings.push(`Resolver cache could not be read: ${errorMessage(err)}`);
    }
  }
  if (resolver) {
    source = 'cache';
    if (resolver.stale) {
      warnings.push(
        `Cached resolver is ${resolver.age_days ?? '?'} days old (refresh after ${RESOLVER_TTL_DAYS} days) - use Refresh to re-resolve.`,
      );
    }
  } else {
    try {
      const resolved = await resolveSkuWithHtml(sku, { url });
      resolver = resolved.resolver;
      enHtml = resolved.enHtml;
      source = 'storefront';
      fresh = true;
    } catch (err) {
      resolverFailure = errorMessage(err);
    }
  }

  const admin = await adminAttempt;
  const enrichment = await notionEnrichment(sku, settings);
  if (enrichment.warning) warnings.push(enrichment.warning);
  const notion = enrichment.metadata;

  // D1/D4: confirmed URL (Notion) > rules map > ROLY guess, and the payload
  // says which one it used.
  const supplier = supplierLinkFor(sku, {
    catalogUrl: notion?.supplierProduct,
    supplierUrl: notion?.supplierLink,
  });

  let adminChildren = admin.ok ? admin.fallback.children : [];
  const adminStatus = admin.ok ? (admin.fallback.status ?? '') : '';

  // If the initial admin search did not return child SKUs (e.g. parent edit page
  // was not open), but storefront resolution gave us child IDs, query the grid
  // for those specific child IDs to pull their child SKUs.
  if (
    admin.ok &&
    adminChildren.length === 0 &&
    resolver?.children &&
    resolver.children.length > 0
  ) {
    try {
      const retry = await tryAdminGrid(sku, adminBase, resolver.children);
      if (retry.children.length > 0) {
        adminChildren = retry.children;
      }
    } catch {
      // non-fatal
    }
  }

  if (resolver) {
    const notices = [...(resolver.notices ?? [])];
    // A storefront page exists, so a `Disabled` row is a contradiction worth
    // naming (cache, store view, or a status edited after the page was built).
    if (adminStatus === 'Disabled') {
      notices.push(
        'the admin grid reports this product as disabled although the storefront served a PDP - check the store view and the cache before trusting the page',
      );
    }
    if (adminChildren.length > 0) {
      const adminIds = new Set(adminChildren.map((child) => child.id));
      const storefrontIds = new Set(resolver.children);
      const missingFromStorefront = adminChildren.filter(
        (child) => !storefrontIds.has(child.id),
      );
      const unknownToAdmin = resolver.children.filter((id) => !adminIds.has(id));
      if (missingFromStorefront.length > 0) {
        notices.push(
          `${missingFromStorefront.length} admin child(ren) are not in the storefront index (disabled or unassigned): ${missingFromStorefront
            .map((child) => `${child.id}${child.sku ? ` ${child.sku}` : ''}`)
            .join(', ')}`,
        );
      }
      if (unknownToAdmin.length > 0) {
        notices.push(
          `${unknownToAdmin.length} storefront child(ren) are absent from the admin matrix: ${unknownToAdmin.join(', ')}`,
        );
      }
    }
    resolver = {
      ...resolver,
      supplier: {
        supplier: supplier.supplier,
        tier: supplier.tier,
        official: supplier.official,
        catalog: supplier.catalog,
        catalogSource: supplier.catalogSource,
        reviewFlags: supplier.reviewFlags,
      },
      // E7: child SKUs, never invented - they come from the admin matrix.
      children_detail:
        adminChildren.length > 0
          ? adminChildDetail(adminChildren)
          : resolver.children_detail,
      magento_status: adminStatus
        ? {
            label: adminStatus,
            source: 'admin-grid',
            checked_at: new Date().toISOString(),
          }
        : resolver.magento_status,
      notices,
    };
  }

  let adminFallback: ResolveAdminFallback | undefined;
  if (!resolver && admin.ok) {
    adminFallback = admin.fallback;
    resolver = partialResolverFromAdmin(sku, admin.fallback, supplier);
    source = 'admin';
    warnings.push(
      'Admin fallback only: variants, images and text cannot be checked from the admin matrix.',
    );
  }
  if (!resolver && !admin.ok) {
    warnings.push(admin.error);
  }
  if (!source && notion) source = 'notion';

  if (resolver && (fresh || adminChildren.length > 0)) {
    try {
      await cacheResolverJson(sku, resolver);
    } catch (err) {
      warnings.push(`Resolver result could not be cached: ${errorMessage(err)}`);
    }
  }

  if (!resolver && !notion) {
    return {
      ok: false,
      error: [
        resolverFailure
          ? `Storefront resolver failed: ${resolverFailure}`
          : 'Storefront resolver did not return a result.',
        warnings.join(' '),
        'No matching product was found in the Magento admin grid or SKU Library.',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  // Target matrix: every assigned child from the admin, enabled or not.
  const targets =
    admin.ok && admin.fallback.children.length > 0
      ? variantTargetsFromRows(admin.fallback.children, 'admin-config')
      : undefined;
  const targetsError = targets
    ? undefined
    : admin.ok
      ? admin.fallback.childrenReason || 'admin returned no child rows'
      : admin.error;

  const categoryCheck = resolver ? buildCategoryCheck(resolver, notion) : undefined;
  const duplicates = resolver ? await findDuplicates(resolver) : [];

  // D4: the last stored verdict only - checking is an explicit action.
  let availability: AvailabilityCheck | null = null;
  try {
    availability = (await loadAvailability())[sku] ?? null;
  } catch {
    availability = null;
  }
  // D4: the verdict travels with the payload for the dossier/export, but it is
  // attached after the cache write so a stored payload never carries it.
  if (resolver && availability) {
    resolver = {
      ...resolver,
      supplier_availability: {
        verdict: availability.verdict,
        url: availability.url ?? '',
        urlSource: availability.urlSource,
        checked_at: availability.checkedAt,
        misses: availability.misses,
      },
    };
  }

  return {
    ok: true,
    resolver,
    adminFallback,
    notion,
    source,
    adminBase,
    targets,
    targetsError,
    supplier,
    availability,
    categoryCheck,
    duplicates,
    stale: resolver?.stale,
    ageDays: resolver?.age_days ?? null,
    resolutionError: resolverFailure,
    warning: warnings.filter(Boolean).join(' ') || undefined,
  };
}
