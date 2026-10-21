// SKU lookup chain (background only): resolver cache -> Notion -> storefront
// scrape -> admin-grid fallback. Read-only: it resolves ids/URLs and never
// writes to Magento or Notion.
//
// Security: admin URLs carry a secret `key` segment, so we never log full URLs
// — only SKUs, ids, and store labels.

import {
  loadSettings,
  mapSkuLibraryPage,
  queryDatabase,
} from './notion';
import { SkuLibrarySchema, validateRows } from './schemas';
import type {
  LookupChild,
  LookupEntry,
  LookupSkuResponse,
  ResolverEntry,
  ResolverMap,
  SearchMagentoRequest,
  SearchMagentoResponse,
} from './messages';

const STOREFRONT = 'https://bestofgifts.eu';

// JSON config on the Magento PDP: `attributes` map option ids to labels, and
// `index` maps each child product id to its attribute option ids.
const COLOR_ATTR_ID = '93';
const SIZE_ATTR_ID = '142';

interface JsonOption {
  id: string | number;
  label?: string;
}
interface JsonAttribute {
  options?: JsonOption[];
}
interface JsonConfig {
  productId?: string | number;
  index?: Record<string, Record<string, string | number>>;
  attributes?: Record<string, JsonAttribute>;
}

interface StorefrontResult {
  productId: string;
  children: LookupChild[];
  frontendEu: string;
  frontendEs: string;
  frontendFr: string;
}

function normalizeBase(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

// ---------------------------------------------------------------------------
// Storefront scraping (anonymous GETs; same chain as the vanilla extension)
// ---------------------------------------------------------------------------

async function storefrontFetch(url: string): Promise<string> {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml' },
    credentials: 'include',
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function storefrontSearch(sku: string): Promise<string> {
  const urls = [
    `${STOREFRONT}/catalogsearch/result/?q=${encodeURIComponent(sku)}`,
    `${STOREFRONT}/catalogsearch/result/index/?q=${encodeURIComponent(sku)}`,
    `${STOREFRONT}/search/?q=${encodeURIComponent(sku)}`,
  ];
  const tryUrl = async (index: number): Promise<string> => {
    const url = urls[index];
    if (!url) throw new Error(`All search URLs failed for SKU "${sku}"`);
    try {
      await storefrontFetch(`${STOREFRONT}/`);
      return await storefrontFetch(url);
    } catch {
      return tryUrl(index + 1);
    }
  };
  return tryUrl(0);
}

function skuToSlugTokens(sku: string): string[] {
  const s = sku.toLowerCase();
  const tokens = [s];
  const split = s.match(/^([a-z]+)(\d+[a-z]*)$/);
  if (split?.[1] && split[2]) {
    tokens.push(`${split[1]}-${split[2]}`, `${split[1]}${split[2]}`);
  }
  const numeric = s.match(/^(\d+)([a-z]+)$/);
  if (numeric?.[1] && numeric[2]) {
    tokens.push(`${numeric[1]}-${numeric[2]}`);
  }
  return tokens;
}

function extractProductLinks(html: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const re =
    /<a[^>]+class="[^"]*product-item-link[^"]*"[^>]+href="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1];
    if (href && !seen.has(href)) {
      seen.add(href);
      links.push(href);
    }
  }
  return links;
}

const RESERVED_PATHS = [
  'catalogsearch',
  'catalog',
  'customer',
  'checkout',
  'cart',
  'search',
  'sales',
  'newsletter',
  'contact',
  'about',
  'faq',
  'shipping',
  'returns',
  'terms',
  'privacy',
  'cookie',
];

function isProductUrl(url: string): boolean {
  const path = url.replace(STOREFRONT, '').replace(/^\/+/, '');
  if (!path || path.includes('/') || path.length < 3) return false;
  const lower = path.toLowerCase();
  return !RESERVED_PATHS.some((reserved) => lower.startsWith(reserved));
}

function findProductUrl(searchHtml: string, sku: string): string | null {
  const tokens = skuToSlugTokens(sku);
  for (const href of extractProductLinks(searchHtml)) {
    if (!href.includes('bestofgifts.eu')) continue;
    const lower = href.toLowerCase();
    if (tokens.some((t) => lower.includes(t)) && isProductUrl(href)) {
      return href;
    }
  }
  return null;
}

/** Brace-match the `jsonConfig` object embedded in a PDP's scripts. */
function extractJsonConfig(html: string): JsonConfig | null {
  const idx = html.indexOf('jsonConfig');
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as JsonConfig;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractSimpleProductId(html: string): string | null {
  const match = html.match(/data-product-id="(\d+)"/);
  return match?.[1] ?? null;
}

function extractHreflang(html: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re =
    /<link[^>]+rel="alternate"[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const lang = match[1];
    const href = match[2];
    if (lang && href) result[lang.toLowerCase()] = href;
  }
  return result;
}

function optionLabel(
  attribute: JsonAttribute | undefined,
  optionId: string | number | undefined,
): string {
  if (!attribute || optionId === undefined) return '';
  const option = (attribute.options ?? []).find(
    (o) => String(o.id) === String(optionId),
  );
  return option?.label ?? '';
}

async function lookupViaStorefront(
  sku: string,
  adminBase: string,
): Promise<StorefrontResult> {
  const searchHtml = await storefrontSearch(sku);
  const productUrl = findProductUrl(searchHtml, sku);
  if (!productUrl) {
    throw new Error(`No product found on storefront for SKU "${sku}"`);
  }

  const pdpHtml = await storefrontFetch(productUrl);
  const config = extractJsonConfig(pdpHtml);
  const children: LookupChild[] = [];
  let productId: string | null = null;

  if (config?.productId !== undefined) {
    productId = String(config.productId);
    const index = config.index ?? {};
    const attributes = config.attributes ?? {};
    for (const [childId, mapping] of Object.entries(index)) {
      children.push({
        id: childId,
        sku: '',
        color: optionLabel(attributes[COLOR_ATTR_ID], mapping[COLOR_ATTR_ID]),
        size: optionLabel(attributes[SIZE_ATTR_ID], mapping[SIZE_ATTR_ID]),
        backend: adminBase
          ? `${adminBase}catalog/product/edit/id/${childId}/`
          : '',
      });
    }
  } else {
    productId = extractSimpleProductId(pdpHtml);
    if (!productId) throw new Error('Could not extract product ID from PDP');
  }

  const hreflang = extractHreflang(pdpHtml);
  return {
    productId,
    children,
    frontendEu: productUrl,
    frontendEs: hreflang['es'] ?? '',
    frontendFr: hreflang['fr'] ?? '',
  };
}

// ---------------------------------------------------------------------------
// Resolver cache (chrome.storage.local, keyed by SKU)
// ---------------------------------------------------------------------------

async function getResolverMap(): Promise<ResolverMap> {
  const data = await chrome.storage.local.get(['resolverMap']);
  return (data.resolverMap as ResolverMap | undefined) ?? {};
}

async function cacheResolver(
  map: ResolverMap,
  entry: ResolverEntry,
): Promise<void> {
  map[entry.sku] = entry;
  await chrome.storage.local.set({ resolverMap: map });
}

function entryFromResolver(sku: string, cached: ResolverEntry): LookupEntry {
  return {
    title: sku,
    sku,
    backend: cached.backend,
    frontend: '',
    productId: cached.id,
    children: cached.children ?? [],
  };
}

// ---------------------------------------------------------------------------
// Admin-grid fallback: ask an open admin tab to search its product grid
// ---------------------------------------------------------------------------

function adminBaseFromTab(tabUrl: string, fallback: string): string {
  const match = tabUrl.match(/^(https:\/\/[^/]+(?:\/[^/]+)?\/)/);
  const base = match?.[1] ?? fallback;
  return normalizeBase(base);
}

async function tryAdminGrid(
  sku: string,
  fallbackBase: string,
  map: ResolverMap,
): Promise<LookupSkuResponse> {
  const allTabs = await chrome.tabs.query({});
  const adminTabs = allTabs.filter((t) =>
    /^https:\/\/bestofgifts/.test(t.url ?? ''),
  );
  const adminTab =
    adminTabs.find((t) => (t.url ?? '').includes('/catalog/product')) ??
    adminTabs.find((t) => (t.url ?? '').includes('admin'));
  if (!adminTab?.id) {
    return {
      found: false,
      error: 'Not found on storefront and no Magento admin tab open.',
    };
  }

  const request: SearchMagentoRequest = { type: 'SEARCH_MAGENTO', sku };
  let response: SearchMagentoResponse | undefined;
  try {
    response = (await chrome.tabs.sendMessage(
      adminTab.id,
      request,
    )) as SearchMagentoResponse;
  } catch {
    return {
      found: false,
      error: 'Admin tab found but the helper content script is not loaded. Reload the admin page.',
    };
  }
  if (!response?.found || !response.productId) {
    return {
      found: false,
      error: response?.error ?? 'Product not found in the admin grid.',
    };
  }

  const base = adminBaseFromTab(adminTab.url ?? '', fallbackBase);
  const entry: LookupEntry = {
    title: sku,
    sku,
    backend: base ? `${base}catalog/product/edit/id/${response.productId}/` : '',
    frontend: '',
    productId: response.productId,
    children: response.children ?? [],
  };
  await cacheResolver(map, {
    id: response.productId,
    sku,
    backend: entry.backend,
    children: entry.children,
    timestamp: Date.now(),
  });
  return { found: true, source: 'admin', entry };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function lookupSku(sku: string): Promise<LookupSkuResponse> {
  const settings = await loadSettings();
  const adminBase = normalizeBase(settings.adminBaseUrl);
  const map = await getResolverMap();

  const cached = map[sku];
  if (cached?.id) {
    return { found: true, source: 'resolver', entry: entryFromResolver(sku, cached) };
  }

  if (settings.notionToken) {
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
      if (row) {
        return {
          found: true,
          source: 'notion',
          entry: {
            title: row.sku,
            sku: row.sku,
            backend: row.backend,
            frontend: row.frontend,
            productId: '',
            children: [],
            category: row.category,
            subcategory: row.subcategory,
            supplier: row.supplier,
            status: row.status,
          },
        };
      }
    } catch {
      // Notion is best-effort here; fall through to the storefront.
    }
  }

  try {
    const result = await lookupViaStorefront(sku, adminBase);
    const entry: LookupEntry = {
      title: sku,
      sku,
      backend: adminBase
        ? `${adminBase}catalog/product/edit/id/${result.productId}/`
        : '',
      frontend: result.frontendEu,
      frontendEs: result.frontendEs,
      frontendFr: result.frontendFr,
      productId: result.productId,
      children: result.children,
    };
    await cacheResolver(map, {
      id: result.productId,
      sku,
      backend: entry.backend,
      children: result.children,
      timestamp: Date.now(),
    });
    return { found: true, source: 'storefront', entry };
  } catch {
    return tryAdminGrid(sku, adminBase, map);
  }
}
