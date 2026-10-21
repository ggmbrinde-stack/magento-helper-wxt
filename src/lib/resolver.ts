/**
 * Resolver — SKU -> frontend URL -> configurable/child IDs.
 *
 * Faithful port of the audit pipeline's `scripts/resolve-skus.ps1`
 * (schema `bog-resolver/1`). Parses the storefront PDP's `jsonConfig`
 * (attributes 93 = colour, 142 = size; `index` = child IDs; `optionPrices`)
 * or detects a simple product via `data-product-id`, then validates the
 * counts. Nothing is invented: every field comes from the live page.
 *
 * The parsing core is pure (takes HTML strings) so it can be unit-tested and
 * run off the captured snapshots; `resolveSku` is the network orchestrator.
 * Never writes to Notion or Magento.
 */

export const RESOLVER_SCHEMA = 'bog-resolver/1';
export const STORE_BASE = 'https://bestofgifts.eu';
export const COLOR_ATTR_ID = '93';
export const SIZE_ATTR_ID = '142';

export type ProductType = 'configurable' | 'simple';

export interface ResolverOption {
  id: string;
  label: string;
  products: string[];
}

export interface ResolverAttribute {
  code: string;
  label: string;
  options: ResolverOption[];
}

export interface ResolverIndexEntry {
  [attrId: string]: string;
}

export interface ResolverJson {
  schema: typeof RESOLVER_SCHEMA;
  sku: string;
  ok: boolean;
  verified: boolean;
  generated: string;
  store: string;
  source: string | null;
  frontend_url: string;
  slug: string | null;
  product_type: ProductType;
  configurable_id: number | null;
  simple_product_id: number | null;
  attributes: { '93': ResolverAttribute | null; '142': ResolverAttribute | null };
  index: Record<string, ResolverIndexEntry>;
  children: string[];
  child_count: number;
  option_prices_count: number;
  hreflang: Record<string, string>;
  store_urls: Record<string, string>;
  snapshots: Record<string, string>;
  anomalies: string[];
  /** Set by the caller when a cached resolver.json was reused. */
  cached?: boolean;
  error?: string;
}

/** Supplier grouping rule (SYSTEM.md): TT* -> TOPTEX, AB* -> ALLBEST, else ROLY. */
export function supplierFor(sku: string): 'TOPTEX' | 'ALLBEST' | 'ROLY' {
  const s = sku.trim().toUpperCase();
  if (/^TT/.test(s)) return 'TOPTEX';
  if (/^AB/.test(s)) return 'ALLBEST';
  return 'ROLY';
}

/**
 * R0317C -> 'r0317-c' (storefront slugs insert a dash before a trailing letter);
 * TTFL9293 -> 'ttfl9293'.
 */
export function skuToken(sku: string): string {
  const s = sku.toLowerCase();
  const m = s.match(/^([a-z]+\d+)([a-z])$/);
  return m ? `${m[1]}-${m[2]}` : s;
}

/** Path prefixes that are never product slugs. */
export const RESERVED_PREFIXES = [
  'catalogsearch', 'customer', 'checkout', 'cart', 'wishlist', 'media', 'static',
  'admin', 'graphql', 'rest', 'sales', 'newsletter', 'contact', 'search', 'privacy',
  'terms', 'blog', 'faq', 'about', 'stores', 'sitemap', 'pub', 'errors',
  'onestepcheckout', 'klarna', 'paypal', 'catalog', 'compare', 'review', 'robots',
  'cookie', 'cookies', 'legal', 'returns', 'shipping', 'payments', 'login', 'logout',
  'account', 'register', 'downloadable', 'health', 'status', 'category', 'categories',
];

export function isReservedPath(path: string): boolean {
  const p = path.toLowerCase();
  return RESERVED_PREFIXES.some(
    (r) => p === r || p.startsWith(`${r}-`) || p.startsWith(`${r}/`),
  );
}

export interface AbsoluteEuUrl {
  url: string;
  path: string;
}

/**
 * Normalise a href to the canonical bestofgifts.eu form, or null when it is not
 * a single-segment product URL on the store.
 */
export function toAbsoluteEuUrl(
  href: string,
  base: string = STORE_BASE,
): AbsoluteEuUrl | null {
  if (!href) return null;
  let u = href.trim();
  if (/^https?:\/\//i.test(u)) {
    if (!/^https?:\/\/bestofgifts\.eu(?:\/|$)/i.test(u)) return null;
  } else if (u.startsWith('/')) {
    u = base + u;
  } else {
    return null;
  }
  u = (u.split(/[?#]/)[0] ?? '').replace(/\/+$/, '');
  const rest = u.slice(u.indexOf('://') + 3);
  const slash = rest.indexOf('/');
  if (slash < 0) return null;
  const path = rest.slice(slash + 1);
  if (!path) return null;
  return { url: `${base}/${path}`, path };
}

/**
 * Extract the balanced `{...}` literal starting at `startBrace`
 * (string/escape aware — braces inside strings don't count).
 */
export function balancedObject(text: string, startBrace: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startBrace; i < text.length; i++) {
    const n = text.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (n === 92) esc = true; // backslash
      else if (n === 34) inStr = false; // double quote
    } else if (n === 34) {
      inStr = true;
    } else if (n === 123) {
      depth++; // {
    } else if (n === 125) {
      // }
      depth--;
      if (depth === 0) return text.slice(startBrace, i + 1);
    }
  }
  return null;
}

/** Parse the `jsonConfig` object literal from a PDP, or null when absent/unparsable. */
export function readJsonConfig(html: string): Record<string, unknown> | null {
  const marker = html.indexOf('jsonConfig');
  if (marker < 0) return null;
  const brace = html.indexOf('{', marker);
  if (brace < 0) return null;
  const fragment = balancedObject(html, brace);
  if (!fragment) return null;
  try {
    const parsed = JSON.parse(fragment);
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Simple PDPs carry no jsonConfig. Detect via the `product-info-main` marker +
 * `data-product-id`; both signals come from the live page.
 */
export function readSimpleProductId(html: string): number | null {
  if (!html.includes('product-info-main')) return null;
  const m = html.match(/data-product-id\s*=\s*"(\d+)"/);
  if (!m || m[1] === undefined) return null;
  return Number.parseInt(m[1], 10);
}

export function getOgUrl(html: string): string | null {
  let m = html.match(/<meta[^>]*property="og:url"[^>]*content="([^"]+)"/);
  if (!m) m = html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:url"/);
  return m?.[1] ?? null;
}

export function getHreflangMap(html: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of html.matchAll(/<link[^>]*hreflang="([^"]+)"[^>]*href="([^"]+)"/g)) {
    const code = (m[1] ?? '').toLowerCase();
    if (code && !(code in map)) map[code] = m[2] ?? '';
  }
  for (const m of html.matchAll(/<link[^>]*href="([^"]+)"[^>]*hreflang="([^"]+)"/g)) {
    const code = (m[2] ?? '').toLowerCase();
    if (code && !(code in map)) map[code] = m[1] ?? '';
  }
  return map;
}

/** attributes.'93' / '142' -> { code, label, options[] = { id, label, products[] } } */
export function getAttributeBlock(
  config: Record<string, unknown>,
  attrId: string,
): ResolverAttribute | null {
  const attr = config.attributes as Record<string, unknown> | undefined;
  if (!attr) return null;
  const block = attr[attrId] as Record<string, unknown> | undefined;
  if (!block) return null;
  const rawOptions = Array.isArray(block.options) ? block.options : [];
  const options: ResolverOption[] = rawOptions.map((o) => {
    const obj = o as Record<string, unknown>;
    const prods = Array.isArray(obj.products) ? obj.products : [];
    return {
      id: String(obj.id ?? ''),
      label: String(obj.label ?? ''),
      products: prods.map((x) => String(x)),
    };
  });
  return {
    code: String(block.code ?? ''),
    label: String(block.label ?? ''),
    options,
  };
}

export interface ProductCandidate {
  pick: AbsoluteEuUrl | null;
  source: string | null;
  cards: AbsoluteEuUrl[];
  all: AbsoluteEuUrl[];
}

/**
 * Pick the product link from a search page. Priority: product card containing
 * the SKU token > first product card > any single-segment link with the token
 * > a sole candidate.
 */
export function selectProductCandidate(
  html: string,
  sku: string,
  base: string = STORE_BASE,
): ProductCandidate {
  const token = skuToken(sku);
  const cards: AbsoluteEuUrl[] = [];
  const all: AbsoluteEuUrl[] = [];
  const cardSeen: Record<string, true> = {};
  const allSeen: Record<string, true> = {};

  const addCard = (href: string) => {
    const abs = toAbsoluteEuUrl(href, base);
    if (abs && !(abs.path in cardSeen)) {
      cardSeen[abs.path] = true;
      cards.push(abs);
    }
  };
  for (const m of html.matchAll(/<a[^>]*product-item-link[^>]*href="([^"]+)"/g)) {
    addCard(m[1] ?? '');
  }
  for (const m of html.matchAll(/<a[^>]*href="([^"]+)"[^>]*product-item-link/g)) {
    addCard(m[1] ?? '');
  }
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const abs = toAbsoluteEuUrl(m[1] ?? '', base);
    if (!abs) continue;
    if (abs.path.includes('/')) continue;
    if (isReservedPath(abs.path)) continue;
    if (!(abs.path in allSeen)) {
      allSeen[abs.path] = true;
      all.push(abs);
    }
  }

  let pick: AbsoluteEuUrl | null = null;
  let source: string | null = null;
  for (const c of cards) {
    if (c.path.toLowerCase().includes(token)) {
      pick = c;
      source = 'search-card';
      break;
    }
  }
  if (!pick && cards.length >= 1) {
    pick = cards[0] ?? null;
    source = 'search-card-first';
  }
  if (!pick) {
    for (const c of all) {
      if (c.path.toLowerCase().includes(token)) {
        pick = c;
        source = 'search-link';
        break;
      }
    }
  }
  if (!pick && all.length === 1) {
    pick = all[0] ?? null;
    source = 'search-single';
  }
  return { pick, source, cards, all };
}

export interface ParseResolverInput {
  sku: string;
  resolvedUrl: string;
  slug: string | null;
  source: string | null;
  enHtml: string;
  hreflang?: Record<string, string>;
  storeUrls?: Record<string, string>;
  snapshots?: Record<string, string>;
}

/**
 * Parse a resolved PDP into the `bog-resolver/1` payload. Throws on
 * operational failures (no jsonConfig and no simple marker, no children); data
 * inconsistencies are collected in `anomalies` instead (mirrors the script's
 * exit code 2 vs 3 split).
 */
export function parseResolver(input: ParseResolverInput): ResolverJson {
  const { sku, resolvedUrl, slug, source, enHtml } = input;
  const anomalies: string[] = [];
  const hreflang = input.hreflang ?? getHreflangMap(enHtml);
  if (Object.keys(hreflang).length === 0) {
    anomalies.push('no hreflang alternates on the EN page');
  }

  const cfg = readJsonConfig(enHtml);
  let isSimple = false;
  let simpleId: number | null = null;
  if (!cfg) {
    simpleId = readSimpleProductId(enHtml);
    if (simpleId === null) {
      throw new Error(`jsonConfig not found or unparsable on ${resolvedUrl}`);
    }
    isSimple = true;
  }

  let productId: number | null = null;
  let attr93: ResolverAttribute | null = null;
  let attr142: ResolverAttribute | null = null;
  const indexMap: Record<string, ResolverIndexEntry> = {};
  let children: string[] = [];
  let opCount = 0;

  if (isSimple) {
    children = [String(simpleId)];
  } else {
    const config = cfg as Record<string, unknown>;
    const rawProductId = config.productId;
    if (rawProductId === undefined || rawProductId === null) {
      throw new Error('productId missing from jsonConfig');
    }
    productId = Number.parseInt(String(rawProductId), 10);

    attr93 = getAttributeBlock(config, COLOR_ATTR_ID);
    attr142 = getAttributeBlock(config, SIZE_ATTR_ID);
    if (attr93 === null) anomalies.push('attribute 93 (color) missing from jsonConfig');
    if (attr142 === null) anomalies.push('attribute 142 (size) missing from jsonConfig');

    const idxRaw = config.index;
    if (idxRaw && typeof idxRaw === 'object') {
      for (const [kid, val] of Object.entries(idxRaw as Record<string, unknown>)) {
        const entry: ResolverIndexEntry = {};
        if (val && typeof val === 'object') {
          for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            entry[k] = String(v);
          }
        }
        indexMap[kid] = entry;
      }
    }
    children = Object.keys(indexMap);

    const opRaw = config.optionPrices;
    if (opRaw && typeof opRaw === 'object') {
      opCount = Object.keys(opRaw as Record<string, unknown>).length;
    }

    if (children.length === 0) {
      throw new Error(
        `no configurable children in jsonConfig on ${resolvedUrl} - simple product or markup drift?`,
      );
    }
    if (opCount !== children.length) {
      anomalies.push(`child count ${children.length} != optionPrices count ${opCount}`);
    }

    for (const ab of [attr93, attr142]) {
      if (!ab) continue;
      for (const o of ab.options) {
        for (const p of o.products) {
          if (!(p in indexMap)) {
            anomalies.push(`option ${ab.code}=${o.label} lists child ${p} that is not in index`);
          }
        }
      }
    }
  }

  let ogUrl = getOgUrl(enHtml);
  if (!ogUrl) {
    anomalies.push('og:url missing on the PDP');
    ogUrl = resolvedUrl;
  } else if (ogUrl.replace(/\/+$/, '') !== resolvedUrl.replace(/\/+$/, '')) {
    anomalies.push(`og:url ${ogUrl} differs from resolved URL ${resolvedUrl}`);
  }

  return {
    schema: RESOLVER_SCHEMA,
    sku: sku.trim().toUpperCase(),
    ok: true,
    verified: anomalies.length === 0,
    generated: new Date().toISOString(),
    store: 'bestofgifts.eu',
    source,
    frontend_url: ogUrl,
    slug,
    product_type: isSimple ? 'simple' : 'configurable',
    configurable_id: productId,
    simple_product_id: simpleId,
    attributes: { '93': attr93, '142': attr142 },
    index: indexMap,
    children,
    child_count: children.length,
    option_prices_count: opCount,
    hreflang,
    store_urls: input.storeUrls ?? {},
    snapshots: input.snapshots ?? {},
    anomalies,
  };
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchHtml(url: string, fetchImpl: typeof fetch): Promise<string> {
  const resp = await fetchImpl(url, {
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!resp.ok) {
    throw new Error(`fetch failed (status ${resp.status}): ${url}`);
  }
  return resp.text();
}

export interface ResolveSkuOptions {
  /** Explicit bestofgifts.eu product URL (skips the catalogsearch step). */
  url?: string;
  /** Extra storefront languages to snapshot besides EN (default en,es,fr). */
  languages?: string[];
  fetchImpl?: typeof fetch;
  base?: string;
}

export interface ResolvedSku {
  resolver: ResolverJson;
  /** The EN PDP HTML (kept so callers can read breadcrumbs etc.). */
  enHtml: string;
}

/**
 * Full resolver: search -> PDP -> parse, returning both the payload and the EN
 * HTML it was parsed from. Network orchestrator; the parsing core is
 * `parseResolver`. Throws on operational failure (no product link, wrong slug,
 * fetch error). Snapshots are kept in-memory (never written to disk).
 */
export async function resolveSkuWithHtml(
  skuRaw: string,
  opts: ResolveSkuOptions = {},
): Promise<ResolvedSku> {
  const sku = skuRaw.trim().toUpperCase();
  if (!sku) throw new Error('SKU is required');
  const base = opts.base ?? STORE_BASE;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const languages = opts.languages ?? ['en', 'es', 'fr'];

  let resolvedUrl: string | null = null;
  let slug: string | null = null;
  let source: string | null = null;

  if (opts.url) {
    const abs = toAbsoluteEuUrl(opts.url, base);
    if (!abs) throw new Error(`url must be a bestofgifts.eu product URL: ${opts.url}`);
    resolvedUrl = abs.url;
    slug = abs.path;
    source = 'url-override';
  } else {
    const searchUrl = `${base}/catalogsearch/result/?q=${encodeURIComponent(sku)}`;
    const searchHtml = await fetchHtml(searchUrl, fetchImpl);

    // attribute order varies (142 may precede 93) - do not assume "93" is first.
    if (/"attributes"\s*:\s*\{\s*"(?:93|142)"/.test(searchHtml)) {
      const og = getOgUrl(searchHtml);
      if (og) {
        const abs = toAbsoluteEuUrl(og, base);
        if (abs) {
          resolvedUrl = abs.url;
          slug = abs.path;
          source = 'search-redirect';
        }
      }
    }
    if (!resolvedUrl) {
      const sel = selectProductCandidate(searchHtml, sku, base);
      if (!sel.pick) {
        const hint = [...sel.cards, ...sel.all]
          .slice(0, 8)
          .map((c) => c.path)
          .join(', ');
        throw new Error(
          `no product link found on the search page for ${sku}; candidates seen: ${hint}`,
        );
      }
      resolvedUrl = sel.pick.url;
      slug = sel.pick.path;
      source = sel.source;
    }
  }

  const enHtml = await fetchHtml(resolvedUrl, fetchImpl);
  if (!enHtml.includes(sku)) {
    throw new Error(`SKU ${sku} not present on ${resolvedUrl} - wrong slug?`);
  }

  const hreflang = getHreflangMap(enHtml);
  const storeUrls: Record<string, string> = {};
  for (const lang of languages) {
    const lc = lang.trim().toLowerCase();
    if (!lc || lc === 'en') continue;
    let altUrl: string | null = null;
    for (const [k, v] of Object.entries(hreflang)) {
      if (k.startsWith(lc)) {
        altUrl = v;
        break;
      }
    }
    if (altUrl) storeUrls[lc] = altUrl;
  }

  const resolver = parseResolver({
    sku,
    resolvedUrl,
    slug,
    source,
    enHtml,
    hreflang,
    storeUrls,
  });
  return { resolver, enHtml };
}

/** Full resolver returning only the `bog-resolver/1` payload. */
export async function resolveSku(
  skuRaw: string,
  opts: ResolveSkuOptions = {},
): Promise<ResolverJson> {
  return (await resolveSkuWithHtml(skuRaw, opts)).resolver;
}
