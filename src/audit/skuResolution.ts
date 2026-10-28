// Resolve a SKU from one canonical resolver payload, then enrich it with
// Notion metadata or use the Magento admin grid when storefront resolution fails.
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
  isResolverJson,
  resolveSkuWithHtml,
  type ResolverJson,
} from '../shared/resolver';
import { adminEditUrl, DEFAULT_ADMIN_BASE, normalizeAdminBase } from '../shared/magento';
import { variantTargetsFromRows } from './variants';
import type {
  ResolveAdminFallback,
  ResolverChild,
  ResolveSkuResponse,
  ResolverNotionMetadata,
  SearchMagentoRequest,
  SearchMagentoResponse,
} from '../core/messages';

const RESOLVER_CACHE_KEY = 'resolverMap';
const LEGACY_RESOLVER_CACHE_KEY = 'resolverMapV2';

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

function findResolver(
  map: Record<string, unknown>,
  sku: string,
): ResolverJson | undefined {
  const key = normalizeSku(sku);
  for (const [storedSku, value] of Object.entries(map)) {
    if (
      normalizeSku(storedSku) === key &&
      isResolverJson(value) &&
      normalizeSku(value.sku) === key
    ) {
      return value;
    }
  }
  return undefined;
}

let cacheWriteQueue: Promise<void> = Promise.resolve();

/** Serialize read-modify-write updates from resolver requests. */
export function cacheResolverJson(
  sku: string,
  resolver: ResolverJson,
): Promise<void> {
  const write = cacheWriteQueue.then(async () => {
    const stored = await chrome.storage.local.get([
      RESOLVER_CACHE_KEY,
      LEGACY_RESOLVER_CACHE_KEY,
    ]);
    const map = asRecord(stored[RESOLVER_CACHE_KEY]);
    const legacyMap = asRecord(stored[LEGACY_RESOLVER_CACHE_KEY]);
    const key = normalizeSku(sku);

    for (const storedSku of Object.keys(map)) {
      if (normalizeSku(storedSku) === key) delete map[storedSku];
    }
    map[key] = resolver;

    for (const storedSku of Object.keys(legacyMap)) {
      if (normalizeSku(storedSku) === key) delete legacyMap[storedSku];
    }
    await chrome.storage.local.set({
      [RESOLVER_CACHE_KEY]: map,
      [LEGACY_RESOLVER_CACHE_KEY]: legacyMap,
    });
  });
  cacheWriteQueue = write.catch(() => undefined);
  return write;
}

async function getCachedResolver(sku: string): Promise<ResolverJson | undefined> {
  await cacheWriteQueue;
  const stored = await chrome.storage.local.get([
    RESOLVER_CACHE_KEY,
    LEGACY_RESOLVER_CACHE_KEY,
  ]);
  const resolver = findResolver(asRecord(stored[RESOLVER_CACHE_KEY]), sku);
  if (resolver) return resolver;

  const legacyResolver = findResolver(
    asRecord(stored[LEGACY_RESOLVER_CACHE_KEY]),
    sku,
  );
  if (!legacyResolver) return undefined;

  await cacheResolverJson(sku, legacyResolver);
  return legacyResolver;
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
        supplier: row.supplier,
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

async function tryAdminGrid(
  sku: string,
  fallbackBase: string,
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

  const request: SearchMagentoRequest = { type: 'SEARCH_MAGENTO', sku };
  let response: SearchMagentoResponse | undefined;
  try {
    response = (await chrome.tabs.sendMessage(
      adminTab.id,
      request,
    )) as SearchMagentoResponse;
  } catch {
    throw new Error(
      'Admin tab found but the helper content script is not loaded. Reload the admin page.',
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
    children,
    childrenReason: response.childrenReason,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function resolveSkuForDashboard(
  skuRaw: string,
  url?: string,
): Promise<ResolveSkuResponse> {
  const sku = skuRaw.trim();
  if (!sku) return { ok: false, error: 'SKU is required.' };

  const settings = await loadSettings();
  const adminBase = normalizeBase(settings.adminBaseUrl) || DEFAULT_ADMIN_BASE;
  let resolver: ResolverJson | undefined;
  let source: ResolveSkuResponse['source'];
  let warning: string | undefined;
  let resolverFailure: string | undefined;

  // The admin matrix runs in parallel with the storefront: it is the only
  // source of the full, status-blind child list, so it feeds `targets` even
  // when the resolver succeeds. It costs one message to an open admin tab and
  // fails fast when none is open.
  const adminAttempt = tryAdminGrid(sku, adminBase)
    .then((fallback) => ({ ok: true as const, fallback }))
    .catch((err) => ({ ok: false as const, error: errorMessage(err) }));

  if (!url) {
    try {
      resolver = await getCachedResolver(sku);
    } catch (err) {
      warning = `Resolver cache could not be read: ${errorMessage(err)}`;
    }
  }
  if (resolver) {
    resolver = { ...resolver, cached: true };
    source = 'cache';
  } else {
    try {
      const resolved = await resolveSkuWithHtml(sku, { url });
      resolver = resolved.resolver;
      source = 'storefront';
      try {
        await cacheResolverJson(sku, resolver);
      } catch (err) {
        warning = [
          warning,
          `Resolver result could not be cached: ${errorMessage(err)}`,
        ]
          .filter(Boolean)
          .join(' ');
      }
    } catch (err) {
      resolverFailure = errorMessage(err);
    }
  }

  let adminFallback: ResolveAdminFallback | undefined;
  const admin = await adminAttempt;
  if (!resolver && admin.ok) adminFallback = admin.fallback;
  if (!resolver && !admin.ok) {
    warning = [warning, admin.error].filter(Boolean).join(' ') || undefined;
  }

  const enrichment = await notionEnrichment(sku, settings);
  warning = [warning, enrichment.warning].filter(Boolean).join(' ') || undefined;
  if (!source && adminFallback) source = 'admin';
  if (!source && enrichment.metadata) source = 'notion';

  // Target matrix: every assigned child from the admin, enabled or not. Only
  // present when the admin actually returned children; `targetsError` says why
  // when it did not, so the UI can be explicit instead of silently omitting it.
  const targets =
    admin.ok && admin.fallback.children.length > 0
      ? variantTargetsFromRows(admin.fallback.children, 'admin-config')
      : undefined;
  const targetsError = targets
    ? undefined
    : admin.ok
      ? admin.fallback.childrenReason || 'admin returned no child rows'
      : admin.error;

  if (!resolver && !adminFallback && !enrichment.metadata) {
    return {
      ok: false,
      error: [
        resolverFailure
          ? `Storefront resolver failed: ${resolverFailure}`
          : 'Storefront resolver did not return a result.',
        warning,
        'No matching product was found in the Magento admin grid or SKU Library.',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  return {
    ok: true,
    resolver,
    adminFallback,
    notion: enrichment.metadata,
    source,
    adminBase,
    targets,
    targetsError,
    resolutionError: resolverFailure,
    warning,
  };
}
