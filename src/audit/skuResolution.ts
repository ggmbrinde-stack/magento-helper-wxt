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
  PRODUCT_TYPES,
  RESOLVER_SCHEMA,
  RESOLVER_TTL_DAYS,
  SkuMismatchError,
  isResolverJson,
  normalizeUrl,
  resolveSkuWithHtml,
  type ProductType,
  type ResolverCategories,
  type ResolverChildDetail,
  type ResolverJson,
  type ResolverMagentoFacts,
} from '../shared/resolver';
import { adminEditUrl, DEFAULT_ADMIN_BASE, normalizeAdminBase } from '../shared/magento';
import { variantTargetsFromRows } from './variants';
import { supplierLinkFor, type SupplierLinkInfo } from './supplierLinks';
import { getSupplierOverride } from './supplierOverrides';
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

/** Resolve once the tab finishes loading (or has already finished). */
function waitForTabLoad(tabId: number, timeoutMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('timed out waiting for the admin grid page')),
      timeoutMs,
    );
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const onRemoved = (id: number) => {
      if (id === tabId) finish(new Error('the admin tab was closed'));
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') finish();
      })
      .catch(() => finish(new Error('the admin tab is gone')));
  });
}

/**
 * Wait until the tab is on the expected URL and finished loading.
 *
 * Polling rather than `onUpdated`: after `tabs.update` the previous page can
 * still report `complete`, so a listener would resolve against the old load.
 */
async function waitForTabUrl(
  tabId: number,
  expected: string,
  timeoutMs = 20_000,
): Promise<void> {
  const wanted = expected.replace(/\/+$/, '').toLowerCase();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) throw new Error('the admin tab was closed');
    const url = (tab.url ?? tab.pendingUrl ?? '').toLowerCase();
    if (tab.status === 'complete' && url.includes(wanted)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('the admin page did not finish loading');
}

/**
 * Read the Configurations matrix for `productId` in a tab we control.
 *
 * Reuses `reuseTabId` when that tab is one this function's caller opened;
 * otherwise it opens its own background tab. The operator's own tab is never
 * navigated - and that matters, because the commonest case is an already-open
 * Products grid, which has no matrix to read.
 */
async function readMatrixTab(
  base: string,
  productId: string,
  request: SearchMagentoRequest,
  reuseTabId: number,
): Promise<SearchMagentoResponse | null> {
  const editUrl = adminEditUrl(base, productId);
  let tabId = reuseTabId;
  const borrowed = tabId === 0;
  if (borrowed) {
    const tab = await chrome.tabs.create({ url: editUrl, active: false });
    tabId = tab.id ?? 0;
    if (!tabId) return null;
  } else {
    await chrome.tabs.update(tabId, { url: editUrl });
  }
  try {
    await waitForTabUrl(tabId, editUrl);
    return await sendToTab<SearchMagentoResponse>(tabId, {
      ...request,
      parentId: productId,
      expand: true,
    });
  } catch {
    return null;
  } finally {
    if (borrowed) await chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

/** Product id out of a stored admin edit URL (`.../edit/id/<id>/...`). */
function backendProductId(url: string): string {
  return url.match(/\/catalog\/product\/edit\/id\/(\d+)/)?.[1] ?? '';
}

async function tryAdminGrid(
  sku: string,
  fallbackBase: string,
  childIds?: string[],
  parentId?: string,
): Promise<ResolveAdminFallback> {
  const allTabs = await chrome.tabs.query({});
  const adminTabs = allTabs.filter((t) =>
    /^https:\/\/bestofgifts/.test(t.url ?? ''),
  );
  // Only a product page carries what we need. A dashboard tab also matches
  // "admin" but has no Configurations matrix and no grid key, so picking it was
  // why the reader reported "no admin grid key on this page" while a perfectly
  // good grid was open in another tab.
  const adminTab = adminTabs.find((t) =>
    (t.url ?? '').includes('/catalog/product'),
  );
  let tabId = adminTab?.id ?? 0;
  let tabUrl = adminTab?.url ?? '';

  // No usable admin tab: open the product grid quietly in the background. The
  // grid page is what carries the route's secret key and the AJAX endpoint, so
  // this makes the resolver work without the operator pre-opening anything. The
  // tab is closed again once the answer is read.
  let openedTabId = 0;
  if (!tabId) {
    const base = normalizeBase(fallbackBase) || DEFAULT_ADMIN_BASE;
    // The parent's own edit page needs no secret key and no AJAX: the browser
    // navigates, Magento adds the key itself, and the Configurations matrix is
    // already in the DOM. The product grid is only the fallback when the parent
    // id is unknown (e.g. the storefront could not be resolved).
    const target = parentId
      ? adminEditUrl(base, parentId)
      : `${base}/catalog/product/index/`;
    let created: chrome.tabs.Tab;
    try {
      created = await chrome.tabs.create({ url: target, active: false });
    } catch (err) {
      throw new Error(
        `Could not open a Magento admin tab (${errorMessage(err)}); the admin grid is unreachable.`,
      );
    }
    const id = created.id ?? 0;
    if (!id) throw new Error('Could not open a Magento admin tab.');
    openedTabId = id;
    try {
      await waitForTabLoad(id);
    } catch (err) {
      await chrome.tabs.remove(id).catch(() => undefined);
      throw new Error(
        `The Magento admin page did not load (${errorMessage(err)}); sign in to the admin, then resolve again.`,
      );
    }
    tabId = id;
    tabUrl = created.url ?? created.pendingUrl ?? '';
  }

  const base = openedTabId
    ? normalizeBase(fallbackBase)
    : adminBaseFromTab(tabUrl, fallbackBase);

  const request: SearchMagentoRequest = {
    type: 'SEARCH_MAGENTO',
    sku,
    childIds,
    parentId,
    // Only the tab this function opened may be interacted with.
    expand: openedTabId !== 0,
    // PP (Attribute Set) and categories come from the edit page. Cheap on a
    // grid page (nothing matches) and required for a disabled SKU.
    readFacts: true,
  };
  let response: SearchMagentoResponse | undefined;
  try {
    response = await sendToTab<SearchMagentoResponse>(tabId, request);
  } catch (err) {
    if (openedTabId) await chrome.tabs.remove(openedTabId).catch(() => undefined);
    throw new Error(
      `The helper could not run in the Magento admin tab (${errorMessage(err)}). Sign in to the admin, then resolve again.`,
    );
  }

  // The grid can name the parent, but it has no Configurations matrix - and a
  // disabled SKU has no storefront page and no SKU Library row, so this is the
  // only place left to ask. When the tab is ours, walk it to the parent's edit
  // page and read the matrix: every child, enabled or disabled, with labels.
  // A simple product has no matrix to walk to; only a configurable (or an
  // unreported type) is worth the second page load.
  if (
    response?.found &&
    (response.children?.length ?? 0) === 0 &&
    response.productId &&
    response.productType !== 'simple'
  ) {
    const second = await readMatrixTab(
      base,
      response.productId,
      request,
      openedTabId,
    );
    if (second?.found) {
      // Adopt the matrix answer either way: an empty one carries the *reason*
      // it was empty, which is more use than the grid page's reason ("open the
      // parent product edit page") when the problem is elsewhere.
      const gained = (second.children?.length ?? 0) > 0;
      response = {
        ...second,
        productId: second.productId || response.productId,
        status: second.status || response.status,
        children: gained ? second.children : response.children,
        childrenReason: gained ? second.childrenReason : (second.childrenReason || response.childrenReason),
        magentoFacts: second.magentoFacts ?? response.magentoFacts,
      };
    }
  }

  // The parent row is optional: when the parent is stored under a different SKU
  // than the storefront code (R0317C vs R0317), the grid still answers the
  // child-id query, and that is the part the SKU Library needs.
  if (!response?.found) {
    if (openedTabId) await chrome.tabs.remove(openedTabId).catch(() => undefined);
    throw new Error(response?.error ?? 'SKU not found in the Magento admin grid.');
  }

  if (openedTabId) await chrome.tabs.remove(openedTabId).catch(() => undefined);
  const children: ResolverChild[] = (response.children ?? []).map((child) => ({
    ...child,
    backend: child.backend || adminEditUrl(base, child.id),
  }));
  const parentEntityId = response.productId ?? '';
  return {
    productId: parentEntityId,
    backend: parentEntityId ? adminEditUrl(base, parentEntityId) : '',
    status: response.status ?? '',
    productType: response.productType ?? '',
    children,
    childrenReason: response.childrenReason,
    magentoFacts: response.magentoFacts,
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
 * Checked category paths -> the single-path `ResolverCategories` shape the rest
 * of the payload already uses. The deepest path wins (the product's real home).
 */
function categoriesFromFacts(
  facts: ResolverMagentoFacts | undefined,
): ResolverCategories | undefined {
  const path = facts?.categoryPaths[0] ?? [];
  if (path.length === 0) return undefined;
  return {
    ok: true,
    l1: path[0] ?? '',
    l2: path[1] ?? '',
    l3: path[2] ?? '',
    l4: path[3] ?? '',
    path,
    urls: [],
    ids: [],
    source: 'admin',
  };
}

/**
 * F7: a payload built from the admin matrix alone. It is explicitly partial,
 * never cached, and says what it cannot answer instead of looking complete.
 */
function partialResolverFromAdmin(
  sku: string,
  fallback: ResolveAdminFallback,
  supplier: SupplierLinkInfo,
  reason?: string,
): ResolverJson {
  const parsedId = Number.parseInt(fallback.productId, 10);
  const children = fallback.children.map((child) => child.id);
  // A simple product has no children by design; calling it "configurable" made
  // the payload claim a matrix that does not exist, and the Magento link table
  // then looked for children instead of linking the product itself.
  const productType: ProductType = (PRODUCT_TYPES as readonly string[]).includes(
    fallback.productType ?? '',
  )
    ? (fallback.productType as ProductType)
    : 'configurable';
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
    product_type: productType,
    configurable_id:
      productType === 'configurable' && Number.isFinite(parsedId) ? parsedId : null,
    simple_product_id:
      productType === 'simple' && Number.isFinite(parsedId) ? parsedId : null,
    attributes: {},
    attribute_option_counts: {},
    index: {},
    children,
    child_count: children.length,
    option_prices_count: 0,
    hreflang: {},
    store_urls: {},
    snapshots: {},
    anomalies: [
      reason
        ? `storefront resolution failed (${reason}) - payload built from the admin matrix only`
        : 'storefront resolution failed - payload built from the admin matrix only',
    ],
    notices: [
      'variants, images and text are unavailable in an admin-only payload',
      reason
        ? 'the storefront failure above is why: fix reachability or the URL, then run Resolve again for the full payload'
        : 'run Resolve again once the storefront page is reachable to get the full payload',
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
    // Read from the product edit page: the disabled SKU has no storefront
    // breadcrumb, so this is the only real Magento category path we get.
    categories: categoriesFromFacts(fallback.magentoFacts),
    magento_facts: fallback.magentoFacts,
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

/**
 * The supplier card for a SKU, read from the storefront-independent sources.
 *
 * Used after the operator pastes or clears a link so the card updates without
 * resolving the product again - a resolve would open an admin tab just to
 * re-read what is already known.
 */
export async function supplierInfoForSku(skuRaw: string): Promise<SupplierLinkInfo> {
  const sku = normalizeSku(skuRaw);
  if (!sku) return supplierLinkFor(skuRaw);
  const settings = await loadSettings();
  const [overrideUrl, enrichment] = await Promise.all([
    getSupplierOverride(sku),
    notionEnrichment(sku, settings).catch(() => ({}) as { metadata?: ResolverNotionMetadata }),
  ]);
  return supplierLinkFor(sku, {
    overrideUrl,
    catalogUrl: enrichment.metadata?.supplierProduct,
    supplierUrl: enrichment.metadata?.supplierLink,
  });
}

export async function resolveSkuForDashboard(
  skuRaw: string,
  url?: string,
  force = false,
  readAdminFacts = false,
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
  // R9: kept apart from `resolverFailure` so the admin path can report it as a
  // fact ("no storefront page") instead of an error when it answers.
  let storefrontMismatch: SkuMismatchError | undefined;
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
      const foreignUrl =
        err instanceof SkuMismatchError ||
        (url && /not present on .*wrong slug/i.test(resolverFailure));
      // A supplied URL is an optimisation, not an instruction. When it names a
      // different product the storefront guard rejects it; searching once more
      // without the override keeps a stale URL from turning a perfectly
      // resolvable SKU into an admin-only payload.
      if (url && foreignUrl) {
        try {
          const retried = await resolveSkuWithHtml(sku, {});
          resolver = retried.resolver;
          enHtml = retried.enHtml;
          source = 'storefront';
          fresh = true;
          resolverFailure = undefined;
          warnings.push(
            `The supplied Product URL does not belong to ${sku} - resolved by search instead.`,
          );
        } catch (retryErr) {
          resolverFailure = errorMessage(retryErr);
          if (retryErr instanceof SkuMismatchError) storefrontMismatch = retryErr;
        }
      } else if (err instanceof SkuMismatchError) {
        storefrontMismatch = err;
      }
    }
  }

  const admin = await adminAttempt;
  const enrichment = await notionEnrichment(sku, settings);
  if (enrichment.warning) warnings.push(enrichment.warning);
  const notion = enrichment.metadata;

  // D4: a link the operator pasted wins, then the confirmed URL (Notion), the
  // rules map and finally a ROLY guess - the payload says which one it used.
  const supplier = supplierLinkFor(sku, {
    overrideUrl: await getSupplierOverride(sku),
    catalogUrl: notion?.supplierProduct,
    supplierUrl: notion?.supplierLink,
  });

  let adminChildren = admin.ok ? admin.fallback.children : [];
  const adminStatus = admin.ok ? (admin.fallback.status ?? '') : '';
  // PP + categories read from the edit page. The first pass can supply them when
  // the tab already sat on the product's edit page; the retry/matrix passes and
  // the explicit facts pass below fill them otherwise.
  let magentoFacts: ResolverMagentoFacts | undefined = admin.ok
    ? admin.fallback.magentoFacts
    : undefined;
  // Why the child SKUs are (or are not) here. The admin attempt above runs in
  // parallel with the storefront fetch, so on its own it can only ever match the
  // parent's own SKU - the child list is the second pass below.
  let childrenReason = admin.ok
    ? (admin.fallback.childrenReason ?? '')
    : errorMessage(admin.error);

  // The storefront payload already names every child id. Ask the grid for
  // exactly those rows: this is the only path that carries the child SKUs when
  // the parent's edit page is not the tab the helper runs in. It is not gated on
  // the first attempt succeeding - a grid that missed the parent still answers
  // an entity-id range query.
  // The parent id decides which page the second pass can open without a secret
  // key: the storefront knows it, and for a SKU the storefront cannot serve at
  // all (disabled) the SKU Library's Backend URL still carries it. This is why
  // the pass also runs when the storefront returned no child ids.
  const configurableId = resolver?.configurable_id;
  const parentEntityId =
    configurableId === null || configurableId === undefined
      ? backendProductId(notion?.backend ?? '')
      : String(configurableId);

  // What the second pass learned, kept even when the first pass failed: for a
  // disabled SKU this is the only source of the parent id and its status.
  let retryParentId = '';
  let retryStatus = '';

  // The first pass often already knows the parent id (it matched the grid row)
  // even though it could not read children there. Gating the second pass on the
  // storefront id alone meant that answer was never followed up: a disabled SKU
  // has no storefront page and no SKU Library row, so nothing triggered it.
  const knownParentId =
    parentEntityId || (admin.ok ? (admin.fallback.productId ?? '') : '');

  if (adminChildren.length === 0) {
    const ids = resolver?.children ?? [];
    if (ids.length > 0 || knownParentId) {
      try {
        const retry = await tryAdminGrid(
          sku,
          adminBase,
          ids,
          knownParentId || undefined,
        );
        retryParentId = retry.productId || '';
        retryStatus = retry.status || '';
        if (retry.magentoFacts) magentoFacts = retry.magentoFacts;
        if (retry.children.length > 0) {
          adminChildren = retry.children;
          childrenReason = retry.childrenReason || '';
        } else {
          childrenReason =
            retry.childrenReason || 'the admin grid returned no child rows';
        }
      } catch (err) {
        childrenReason = errorMessage(err);
      }
    } else {
      childrenReason =
        childrenReason ||
        'no parent id is known for this SKU yet - resolve it once with the storefront reachable, or store its Backend URL in the SKU Library';
    }
  }
  // R1: children read by `Parent SKU` carry no colour/size labels, so a disabled
  // SKU had SKUs and statuses but no variant matrix. The parent's edit page has
  // the labels and needs no secret key, so read it once and merge by child id.
  // Admin-only path only: an enabled resolve already holds storefront labels and
  // must not pay an extra page load for them.
  const unlabelledAdmin =
    adminChildren.length > 0 &&
    adminChildren.every((child) => !child.color && !child.size);
  if (!resolver && unlabelledAdmin) {
    const labelParentId =
      (admin.ok ? (admin.fallback.productId ?? '') : '') ||
      retryParentId ||
      parentEntityId;
    const labelType = admin.ok ? (admin.fallback.productType ?? '') : '';
    if (labelParentId && labelType !== 'simple') {
      const matrix = await readMatrixTab(
        adminBase,
        labelParentId,
        { type: 'SEARCH_MAGENTO', sku, parentId: labelParentId, expand: true, readFacts: true },
        0,
      );
      if (matrix?.magentoFacts) magentoFacts = matrix.magentoFacts;
      const byId = new Map(
        (matrix?.children ?? []).map((child) => [child.id, child] as const),
      );
      if (byId.size > 0) {
        let merged = 0;
        adminChildren = adminChildren.map((child) => {
          const match = byId.get(child.id);
          if (!match) return child;
          merged += 1;
          return {
            ...child,
            sku: child.sku || match.sku,
            color: match.color || child.color,
            size: match.size || child.size,
            enabled: match.enabled ?? child.enabled,
            backend: child.backend || match.backend,
          };
        });
        if (merged > 0) {
          childrenReason = `${
            childrenReason || 'child rows came from the product grid'
          }; colour/size labels merged from the parent's edit page`;
        }
      }
    }
  }

  // PP/category facts are the point of the Enable flow: a disabled SKU has no
  // storefront breadcrumb, so without this pass the card could only show the
  // Notion row - and report "missing" for a product that already has both.
  // The pass runs on its own tab so it may open the Categories tab (read-only).
  if (readAdminFacts && (!magentoFacts || !magentoFacts.categoryRead)) {
    const factsParentId = knownParentId || retryParentId || parentEntityId;
    if (factsParentId) {
      const factsTab = await readMatrixTab(
        adminBase,
        factsParentId,
        {
          type: 'SEARCH_MAGENTO',
          sku,
          parentId: factsParentId,
          expand: true,
          readFacts: true,
        },
        0,
      );
      if (factsTab?.magentoFacts) magentoFacts = factsTab.magentoFacts;
      if (
        adminChildren.length === 0 &&
        (factsTab?.children?.length ?? 0) > 0
      ) {
        adminChildren = factsTab?.children ?? [];
        childrenReason = factsTab?.childrenReason || '';
      }
    }
  }

  // A resolved payload without child SKUs is worth flagging even when the
  // storefront failed - but only for a product type that has children at all.
  // A simple/bundle product legitimately has none, and warning about it turned
  // a correct result into an error message.
  const expectsChildren =
    !resolver || resolver.product_type === 'configurable';
  if (adminChildren.length === 0 && expectsChildren) {
    warnings.push(
      `Child SKUs unavailable: ${childrenReason || 'no child rows came back from the admin grid'}.`,
    );
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
      // Admin PP/category facts are the Magento side of the Enable checklist.
      magento_facts: magentoFacts ?? resolver.magento_facts,
      // The storefront breadcrumb wins when it exists; otherwise the admin's
      // checked category tree is still a real Magento path.
      categories: resolver.categories ?? categoriesFromFacts(magentoFacts),
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

  // A disabled SKU is served by this branch: the storefront has no page for it,
  // so the partial payload *is* the result. It must be built from the merged
  // children, not from `admin.fallback` - that is the first pass, which runs
  // before any child id exists and therefore always looks empty. Reading it was
  // why the children read on the second pass were thrown away.
  let adminFallback: ResolveAdminFallback | undefined;
  const fallbackParentId =
    (admin.ok ? admin.fallback.productId : '') ||
    retryParentId ||
    parentEntityId;
  if (!resolver && (adminChildren.length > 0 || fallbackParentId)) {
    const fallback: ResolveAdminFallback = {
      productId: fallbackParentId,
      backend: fallbackParentId ? adminEditUrl(adminBase, fallbackParentId) : '',
      status:
        (admin.ok ? (admin.fallback.status ?? '') : '') ||
        retryStatus ||
        (adminChildren.some((child) => child.enabled === false) ? 'Disabled' : ''),
      children: adminChildren,
      childrenReason,
      magentoFacts,
    };
    adminFallback = fallback;
    // R9: say why the storefront step had nothing, as a fact rather than an
    // error - this is the normal state of a disabled product, and a stale URL
    // is a different fact that the operator can fix.
    resolver = partialResolverFromAdmin(
      sku,
      fallback,
      supplier,
      storefrontMismatch?.message || resolverFailure,
    );
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

  // Target matrix: every assigned child the admin reported, enabled or not.
  // `adminChildren` is the merged list (first attempt + the second pass), so it
  // is the one to use - reading `admin.fallback.children` alone meant the matrix
  // was reported unavailable even when all 15 children had just been read.
  // Colour labels only exist on the Configurations-matrix path; without them a
  // "target" would be a list of ids, so the message stays instead of inventing.
  const targetRows = adminChildren.filter((child) => child.color !== '');
  const targets =
    targetRows.length > 0
      ? variantTargetsFromRows(targetRows, 'admin-config')
      : undefined;
  const targetsError = targets
    ? undefined
    : adminChildren.length > 0
      ? 'the admin rows carried no colour labels - the parent edit page could not be read'
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
    resolutionError:
      storefrontMismatch && resolver ? undefined : resolverFailure,
    warning: warnings.filter(Boolean).join(' ') || undefined,
  };
}
