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

export type ProductType =
  | 'configurable'
  | 'simple'
  | 'bundle'
  | 'grouped'
  | 'downloadable'
  | 'virtual';

export const PRODUCT_TYPES: readonly ProductType[] = [
  'configurable',
  'simple',
  'bundle',
  'grouped',
  'downloadable',
  'virtual',
];

/** Storefront languages the audit actually compares (hreflang may advertise more). */
export const AUDITED_LANGS = ['en', 'es', 'fr'] as const;

/** How long a cached `bog-resolver/1` payload is treated as current (F1). */
export const RESOLVER_TTL_DAYS = 14;

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

/** One breadcrumb step; `id` and `url` are kept when the page publishes them. */
export interface ResolverCategory {
  name: string;
  url: string;
  id: string;
}

/**
 * Storefront breadcrumb path (L1..L4). Parsed from the page's `categories`
 * array - the `jsonConfig` copy when present, the document copy otherwise.
 */
export interface ResolverCategories {
  ok: boolean;
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  path: string[];
  urls: string[];
  ids: string[];
  source: 'jsonConfig' | 'document' | 'none';
}

/**
 * Supplier attribution carried in the payload. Filled by the audit lane
 * (`supplierLinks`), never derived by parsing: the shared lane must not import
 * a lane module.
 */
export interface ResolverSupplier {
  supplier: 'ROLY' | 'TOPTEX' | 'ALLBEST' | 'MAKITO';
  tier: number;
  official: string;
  catalog: string;
  catalogSource: 'manual' | 'notion' | 'map' | 'guessed' | 'none';
  reviewFlags: string[];
}

/**
 * Magento's own enable/disable state, read from the product grid.
 *
 * Never inferred from whether the storefront answered: a disabled product has
 * no PDP at all, which is exactly the case where the status is the only useful
 * fact about the SKU.
 */
export interface ResolverMagentoStatus {
  /** `Enabled` / `Disabled`, or whatever Magento labelled the row. */
  label: string;
  source: 'admin-grid';
  checked_at: string;
}

/**
 * Last supplier availability verdict attached to a payload (D4). Strings keep
 * the shared lane from importing the audit lane's verdict union.
 */
export interface ResolverSupplierAvailability {
  verdict: string;
  url: string;
  urlSource: string;
  checked_at: string;
  misses: string[];
}

/** A child row read from a source that lists children regardless of status. */
export interface ResolverChildDetail {
  id: string;
  sku: string;
  color: string;
  size: string;
  enabled?: boolean;
  source: 'admin' | 'storefront';
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
  /**
   * Every super-attribute block in `jsonConfig.attributes`, keyed by attribute
   * id ("93" colour, "142" size, plus any others). The matrix reads 93/142;
   * nothing else is invisible any more (E4).
   */
  attributes: Record<string, ResolverAttribute | null>;
  /**
   * Option count per configurable attribute. Recorded separately from the
   * options themselves so an empty or shrunken list is visible, not inferred.
   */
  attribute_option_counts?: Record<string, number>;
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
  /** Breadcrumb path L1..L4 (C1/C2); absent on payloads cached before it. */
  categories?: ResolverCategories;
  /** Supplier attribution (D4). */
  supplier?: ResolverSupplier;
  /** Enable/disable state as Magento reports it. */
  magento_status?: ResolverMagentoStatus;
  /** Verdict attached at read time; never persisted, so it cannot go stale. */
  supplier_availability?: ResolverSupplierAvailability;
  /** The requested URL when the storefront redirected (E2). */
  redirected_to?: string | null;
  /** Non-blocking remarks: uncovered hreflang, extra attributes, product type. */
  notices?: string[];
  /** Child rows from the admin matrix, including child SKUs (E7). */
  children_detail?: ResolverChildDetail[];
  /** Age of the payload in days, set by the cache reader (F1). */
  age_days?: number;
  /** Cache entry older than RESOLVER_TTL_DAYS (F1). */
  stale?: boolean;
  /** Other cached SKUs that resolve to the same product (E3). */
  duplicates?: string[];
  /** Built from the admin fallback only: no variants/images/text (F7). */
  partial?: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  );
}

function isResolverAttribute(value: unknown): value is ResolverAttribute | null {
  if (value === null) return true;
  if (
    !isRecord(value) ||
    typeof value.code !== 'string' ||
    typeof value.label !== 'string'
  ) {
    return false;
  }
  return (
    Array.isArray(value.options) &&
    value.options.every(
      (option) =>
        isRecord(option) &&
        typeof option.id === 'string' &&
        typeof option.label === 'string' &&
        Array.isArray(option.products) &&
        option.products.every((product) => typeof product === 'string'),
    )
  );
}

function isOptionCounts(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((n) => typeof n === 'number');
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCategories(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.l1 === 'string' &&
    typeof value.l2 === 'string' &&
    typeof value.l3 === 'string' &&
    typeof value.l4 === 'string' &&
    isStringArray(value.path)
  );
}

function isSupplierBlock(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.supplier === 'ROLY' ||
      value.supplier === 'TOPTEX' ||
      value.supplier === 'ALLBEST' ||
      value.supplier === 'MAKITO') &&
    typeof value.official === 'string' &&
    typeof value.catalog === 'string'
  );
}

export function isResolverJson(value: unknown): value is ResolverJson {
  if (!isRecord(value)) return false;
  if (!isRecord(value.attributes) || !isRecord(value.index)) return false;
  const candidate = value as Partial<ResolverJson>;
  return (
    candidate.schema === RESOLVER_SCHEMA &&
    typeof candidate.sku === 'string' &&
    candidate.ok === true &&
    typeof candidate.verified === 'boolean' &&
    typeof candidate.generated === 'string' &&
    Number.isFinite(Date.parse(candidate.generated)) &&
    typeof candidate.store === 'string' &&
    (candidate.source === null || typeof candidate.source === 'string') &&
    typeof candidate.frontend_url === 'string' &&
    (candidate.slug === null || typeof candidate.slug === 'string') &&
    typeof candidate.product_type === 'string' &&
    (PRODUCT_TYPES as readonly string[]).includes(candidate.product_type) &&
    (candidate.configurable_id === null ||
      typeof candidate.configurable_id === 'number') &&
    (candidate.simple_product_id === null ||
      typeof candidate.simple_product_id === 'number') &&
    Object.values(value.attributes).every((attribute) =>
      isResolverAttribute(attribute),
    ) &&
    (candidate.attribute_option_counts === undefined ||
      isOptionCounts(candidate.attribute_option_counts)) &&
    Object.values(value.index).every((entry) => isStringRecord(entry)) &&
    Array.isArray(candidate.children) &&
    candidate.children.every((child) => typeof child === 'string') &&
    typeof candidate.child_count === 'number' &&
    typeof candidate.option_prices_count === 'number' &&
    isStringRecord(candidate.hreflang) &&
    isStringRecord(candidate.store_urls) &&
    isStringRecord(candidate.snapshots) &&
    Array.isArray(candidate.anomalies) &&
    candidate.anomalies.every((anomaly) => typeof anomaly === 'string') &&
    (candidate.categories === undefined || isCategories(candidate.categories)) &&
    (candidate.supplier === undefined || isSupplierBlock(candidate.supplier)) &&
    (candidate.magento_status === undefined ||
      (isRecord(candidate.magento_status) &&
        typeof candidate.magento_status.label === 'string' &&
        typeof candidate.magento_status.checked_at === 'string')) &&
    (candidate.supplier_availability === undefined ||
      isRecord(candidate.supplier_availability)) &&
    (candidate.notices === undefined || isStringArray(candidate.notices)) &&
    (candidate.children_detail === undefined ||
      (Array.isArray(candidate.children_detail) &&
        candidate.children_detail.every(
          (child) => isRecord(child) && typeof child.id === 'string',
        )))
  );
}

/**
 * Supplier grouping rule (SYSTEM.md 1.7 + the Notion `SKU & Prefixes` table):
 *
 *   TT*            -> TOPTEX      (TT is the wrapper: TTK111 -> K111 Kariban)
 *   AB*            -> ALLBEST     (internal, no public catalogue)
 *   M/MK + 5 digit -> MAKITO      (the M/MK is OUR wrapper: M22480 -> 22480)
 *   everything else-> ROLY
 *
 * `MO` is Midocean, not Makito, and is deliberately not matched.
 */
export function supplierFor(
  sku: string,
): 'TOPTEX' | 'ALLBEST' | 'ROLY' | 'MAKITO' {
  const s = sku.trim().toUpperCase();
  // Evidence-backed exception: M4624 is a Makito product (confirmed catalogue
  // link supplied by the operator), even though it does not carry the 5-digit
  // Makito reference shape.
  if (s === 'M4624') return 'MAKITO';
  if (/^TT/.test(s)) return 'TOPTEX';
  if (/^AB/.test(s)) return 'ALLBEST';
  if (/^M(?:K)?\d{5}$/.test(s)) return 'MAKITO';
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

/**
 * Extract the balanced `[...]` literal starting at `startBracket` (string and
 * escape aware). Lazy regexes truncate on a `]` inside a nested array, which is
 * why the categories array is scanned by depth instead.
 */
export function balancedArray(text: string, startBracket: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startBracket; i < text.length; i++) {
    const n = text.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (n === 92) esc = true;
      else if (n === 34) inStr = false;
    } else if (n === 34) {
      inStr = true;
    } else if (n === 91) {
      depth++;
    } else if (n === 93) {
      depth--;
      if (depth === 0) return text.slice(startBracket, i + 1);
    }
  }
  return null;
}

/** Category id from a category URL (`...-12.html`, `?id=12`, `/id/12`). */
function categoryIdFromUrl(url: string): string {
  const m = /-(\d+)(?:\.html)?(?:[?#]|$)/.exec(url) ?? /[?&]id=(\d+)/.exec(url) ?? /\/id\/(\d+)/.exec(url);
  return m?.[1] ?? '';
}

const EMPTY_CATEGORIES: ResolverCategories = {
  ok: false,
  l1: '',
  l2: '',
  l3: '',
  l4: '',
  path: [],
  urls: [],
  ids: [],
  source: 'none',
};

/**
 * Breadcrumb path from the page's `categories` array. The `jsonConfig` copy is
 * preferred (C2) because the document copy is only a rendered duplicate; the
 * document is scanned by depth and every occurrence is tried, so an unrelated
 * `"categories"` key earlier in the markup cannot poison the path.
 */
export function readCategories(
  html: string,
  config?: Record<string, unknown> | null,
): ResolverCategories {
  let raw: unknown[] | null = null;
  let source: ResolverCategories['source'] = 'none';

  const fromConfig = config?.categories;
  if (Array.isArray(fromConfig) && fromConfig.length > 0) {
    raw = fromConfig;
    source = 'jsonConfig';
  }

  if (!raw) {
    let from = 0;
    while (from < html.length) {
      const marker = html.indexOf('"categories"', from);
      if (marker < 0) break;
      from = marker + 12;
      const bracket = html.indexOf('[', marker);
      if (bracket < 0) continue;
      const fragment = balancedArray(html, bracket);
      if (!fragment) continue;
      try {
        const parsed: unknown = JSON.parse(fragment);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (item) =>
              item !== null &&
              typeof item === 'object' &&
              typeof (item as Record<string, unknown>).name === 'string',
          )
        ) {
          raw = parsed;
          source = 'document';
          break;
        }
      } catch {
        // Not the breadcrumb blob - keep scanning.
      }
    }
  }

  if (!raw) return { ...EMPTY_CATEGORIES };

  const path: string[] = [];
  const urls: string[] = [];
  const ids: string[] = [];
  for (const item of raw) {
    const entry = item as Record<string, unknown>;
    const name = String(entry.name ?? entry.title ?? '').trim();
    if (!name) continue;
    const url = String(entry.url ?? entry.link ?? '').trim();
    const id = String(entry.id ?? entry.entity_id ?? '').trim() || categoryIdFromUrl(url);
    path.push(name);
    urls.push(url);
    ids.push(id);
  }
  if (path.length === 0) return { ...EMPTY_CATEGORIES };

  return {
    ok: true,
    l1: path[0] ?? '',
    l2: path[1] ?? '',
    l3: path[2] ?? '',
    l4: path[3] ?? '',
    path,
    urls,
    ids,
    source,
  };
}

/** The SKU a PDP states about itself, with where it was read. */
export function readPageSku(
  html: string,
  config?: Record<string, unknown> | null,
): { sku: string; source: string } | null {
  const meta =
    /<meta[^>]*itemprop=["']sku["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]*content=["']([^"']+)["'][^>]*itemprop=["']sku["']/i.exec(html);
  if (meta?.[1]) return { sku: meta[1].trim(), source: 'meta-itemprop' };

  const attr = /data-product-sku=["']([^"']+)["']/i.exec(html);
  if (attr?.[1]) return { sku: attr[1].trim(), source: 'data-product-sku' };

  const cell =
    /class=["'][^"']*\bsku\b[^"']*["'][\s\S]{0,400}?class=["'][^"']*\bvalue\b[^"']*["'][^>]*>([\s\S]{0,120}?)</i.exec(
      html,
    );
  if (cell?.[1]) {
    const value = cell[1].replace(/<[^>]*>/g, '').trim();
    // The `.value` cell is only trusted when it reads like a SKU: a single
    // token with a digit. Otherwise it belongs to a neighbouring attribute and
    // treating it as the SKU would fail a perfectly good resolve.
    if (/^[A-Za-z0-9][A-Za-z0-9._/-]{1,31}$/.test(value) && /\d/.test(value)) {
      return { sku: value, source: 'sku-cell' };
    }
  }

  const configSku = config?.sku;
  if (typeof configSku === 'string' && configSku.trim()) {
    return { sku: configSku.trim(), source: 'jsonConfig' };
  }
  return null;
}

/**
 * Exact SKU proof (E1). When the page states its SKU, that is the comparison;
 * only a page with no SKU field falls back to a token match, and even then on
 * alphanumeric boundaries so `R0304` cannot match inside `R03041`.
 */
export function skuMatchesPage(
  html: string,
  sku: string,
  pageSku: { sku: string } | null,
): boolean {
  const want = sku.trim().toUpperCase();
  if (pageSku) return pageSku.sku.trim().toUpperCase() === want;
  // No SKU field on the page: accept the plain SKU (as printed) *and* the slug
  // form with the dash the storefront inserts (R0317C -> r0317-c), each on
  // alphanumeric boundaries so R0304 can never match inside R03041.
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forms = new Set([want.toLowerCase(), skuToken(sku)]);
  for (const form of forms) {
    if (!form) continue;
    if (new RegExp(`(?<![A-Za-z0-9])${escape(form)}(?![A-Za-z0-9])`, 'i').test(html)) {
      return true;
    }
  }
  return false;
}

/**
 * Product type from the PDP (E5). Configurable is proven by `jsonConfig`
 * attributes; the other types are recognised by their own Magento markup, so
 * a bundle is never silently reported as a configurable with no children.
 */
export function readProductType(
  html: string,
  config: Record<string, unknown> | null,
): ProductType {
  // Proven first, and never overridden by a hint: a `jsonConfig` carrying
  // super-attributes is a configurable product even if some unrelated script on
  // the page happens to mention another type.
  const attributes = config?.attributes;
  if (attributes && typeof attributes === 'object' && Object.keys(attributes).length > 0) {
    return 'configurable';
  }

  const declared =
    /"product_type"\s*:\s*"(configurable|simple|bundle|grouped|downloadable|virtual)"/i.exec(
      html,
    ) ??
    /product-type-(configurable|simple|bundle|grouped|downloadable|virtual)\b/i.exec(html);
  if (declared?.[1]) return declared[1].toLowerCase() as ProductType;

  // Class tokens, not CSS selectors: Magento renders `class="table grouped"`.
  if (/bundle-options-wrapper|bundle-slide|data-bundle-options|class="[^"]*\bbundle\b/i.test(html)) {
    return 'bundle';
  }
  if (/super-product-table|grouped-product|class="[^"]*\bgrouped\b/i.test(html)) {
    return 'grouped';
  }
  if (/downloadable-links|downloadable-product|class="[^"]*\bdownloadable\b/i.test(html)) {
    return 'downloadable';
  }

  return 'simple';
}

/** URL without query/hash/trailing slash, for redirect comparison (E2). */
export function normalizeUrl(url: string): string {
  return (url.trim().split(/[?#]/)[0] ?? '').replace(/\/+$/, '');
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
 * R9: the storefront answered with a product that is not this SKU.
 *
 * A disabled product has no PDP, and Magento's search replies with the nearest
 * live siblings instead. That is not a resolver failure - it is the signal that
 * the admin path is the only source - so it gets its own type and callers can
 * report it as a fact rather than an error.
 */
export class SkuMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;
  readonly url: string;
  readonly candidates: string[];

  constructor(args: {
    expected: string;
    actual?: string;
    url: string;
    candidates?: string[];
    source?: string;
  }) {
    const candidates = args.candidates ?? [];
    const listed = candidates.slice(0, 6).join(', ');
    super(
      args.actual
        ? `SKU mismatch: ${args.url} states SKU "${args.actual}"${
            args.source ? ` (${args.source})` : ''
          }, expected ${args.expected}`
        : `${args.expected} has no storefront page - the search returned ${
            listed || 'no product'
          }${candidates.length > 6 ? ` (+${candidates.length - 6} more)` : ''} instead`,
    );
    this.name = 'SkuMismatchError';
    this.expected = args.expected;
    this.actual = args.actual ?? '';
    this.url = args.url;
    this.candidates = candidates;
  }
}

export interface SearchCard {
  sku: string;
  url: AbsoluteEuUrl;
}

/**
 * (SKU, product URL) pairs from a catalogsearch results page.
 *
 * Every card prints its own SKU beside its product link, so "does this SKU have
 * a storefront page at all?" can be answered from the search response alone -
 * no PDP fetch, no misleading mismatch two requests later.
 */
export function searchCards(html: string, base: string = STORE_BASE): SearchCard[] {
  const out: SearchCard[] = [];
  const seen = new Set<string>();
  const re =
    /<span[^>]*class="[^"]*product-sku[^"]*"[^>]*>([^<]*)<\/span>[\s\S]{0,800}?<a[^>]*product-item-link[^>]*href="([^"]+)"/g;
  for (const m of html.matchAll(re)) {
    const sku = (m[1] ?? '').trim();
    const abs = toAbsoluteEuUrl(m[2] ?? '', base);
    if (!sku || !abs || seen.has(sku.toUpperCase())) continue;
    seen.add(sku.toUpperCase());
    out.push({ sku, url: abs });
  }
  return out;
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
  /** Pre-parsed breadcrumbs (C2 avoids parsing the document twice). */
  categories?: ResolverCategories;
  /** The requested URL when the storefront redirected (E2). */
  redirectedTo?: string | null;
  /** The SKU the page states, when it states one (E1 notice). */
  pageSku?: { sku: string; source: string } | null;
  /** Supplier attribution filled by the audit lane (D4). */
  supplier?: ResolverSupplier;
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
  const notices: string[] = [];
  const hreflang = input.hreflang ?? getHreflangMap(enHtml);
  if (Object.keys(hreflang).length === 0) {
    anomalies.push('no hreflang alternates on the EN page');
  } else {
    // E6: an alternate that exists but is never audited is worth knowing.
    const uncovered: string[] = [];
    for (const code of Object.keys(hreflang)) {
      const base = code.split('-')[0] ?? code;
      if ((AUDITED_LANGS as readonly string[]).includes(base)) continue;
      if (!uncovered.includes(code)) uncovered.push(code);
    }
    if (uncovered.length > 0) {
      notices.push(
        `hreflang alternates not audited: ${uncovered.join(', ')} (only en/es/fr are compared)`,
      );
    }
  }

  const cfg = readJsonConfig(enHtml);
  const productType = readProductType(enHtml, cfg);
  const categories = input.categories ?? readCategories(enHtml, cfg);
  if (!categories.ok) {
    notices.push(`categories not found on the PDP (${categories.source}) - category checks skipped`);
  }
  if (input.pageSku === null || input.pageSku === undefined) {
    notices.push(
      'the PDP publishes no SKU field; the SKU was matched on the URL/search link only',
    );
  } else if (input.pageSku.source !== 'sku-cell') {
    notices.push(`SKU proven by ${input.pageSku.source}: ${input.pageSku.sku}`);
  }

  const isMatrix = productType === 'configurable';
  let productId: number | null = null;
  let simpleId: number | null = null;
  const attributes: Record<string, ResolverAttribute | null> = {};
  const optionCounts: Record<string, number> = {};
  const indexMap: Record<string, ResolverIndexEntry> = {};
  let children: string[] = [];
  let opCount = 0;

  if (!isMatrix) {
    // E5: simple / virtual / bundle / grouped / downloadable - no matrix, and
    // the type is recorded instead of being mistaken for a broken configurable.
    const id = readSimpleProductId(enHtml);
    if (id === null) {
      throw new Error(
        `${productType} product: no configurable jsonConfig and no data-product-id on ${resolvedUrl} (the variant matrix only exists for configurable products)`,
      );
    }
    simpleId = id;
    children = [String(id)];
    if (productType !== 'simple') {
      notices.push(
        `${productType} product: child products are not enumerated by the storefront - only parent id ${id} is known, so the colour x size matrix does not apply`,
      );
    }
  } else {
    if (!cfg) {
      throw new Error(`jsonConfig not found or unparsable on ${resolvedUrl}`);
    }
    const config = cfg as Record<string, unknown>;
    const rawProductId = config.productId;
    if (rawProductId === undefined || rawProductId === null) {
      throw new Error('productId missing from jsonConfig');
    }
    const parsedId = Number.parseInt(String(rawProductId), 10);
    productId = Number.isFinite(parsedId) ? parsedId : null;

    // E4: every super-attribute, not only 93/142.
    const attrRaw = config.attributes;
    if (attrRaw && typeof attrRaw === 'object') {
      for (const code of Object.keys(attrRaw as Record<string, unknown>)) {
        const block = getAttributeBlock(config, code);
        if (!block) continue;
        attributes[code] = block;
        optionCounts[code] = block.options.length;
      }
    }
    if (!(COLOR_ATTR_ID in attributes)) {
      anomalies.push('attribute 93 (color) missing from jsonConfig');
    }
    if (!(SIZE_ATTR_ID in attributes)) {
      anomalies.push('attribute 142 (size) missing from jsonConfig');
    }
    const extraCodes = Object.keys(attributes).filter(
      (code) => code !== COLOR_ATTR_ID && code !== SIZE_ATTR_ID,
    );
    if (extraCodes.length > 0) {
      notices.push(
        `extra super-attributes: ${extraCodes
          .map((code) => `${code}${attributes[code]?.label ? ` (${attributes[code]?.label})` : ''}`)
          .join(', ')} - outside the colour x size matrix`,
      );
    }

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

    for (const code of Object.keys(attributes)) {
      const block = attributes[code];
      if (!block) continue;
      for (const o of block.options) {
        // An option with no product is either mid-maintenance or a payload that
        // lost its children; either way the matrix must show it, not hide it.
        if (o.products.length === 0) {
          anomalies.push(`option ${block.code}=${o.label} lists no child products`);
        }
        for (const p of o.products) {
          if (!(p in indexMap)) {
            anomalies.push(`option ${block.code}=${o.label} lists child ${p} that is not in index`);
          }
        }
      }
    }
  }

  let ogUrl = getOgUrl(enHtml);
  if (!ogUrl) {
    anomalies.push('og:url missing on the PDP');
    ogUrl = resolvedUrl;
  } else if (normalizeUrl(ogUrl) !== normalizeUrl(resolvedUrl)) {
    anomalies.push(`og:url ${ogUrl} differs from resolved URL ${resolvedUrl}`);
  }

  // F4: `verified` must mean provable. A first-card or single-link guess is a
  // match, not a proof, so it is recorded as an anomaly.
  if (source === 'search-card-first' || source === 'search-single') {
    anomalies.push(
      `low-confidence product match (${source}): the search page offered no SKU-matching link`,
    );
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
    product_type: productType,
    configurable_id: productId,
    simple_product_id: simpleId,
    attributes,
    attribute_option_counts: optionCounts,
    index: indexMap,
    children,
    child_count: children.length,
    option_prices_count: opCount,
    hreflang,
    store_urls: input.storeUrls ?? {},
    snapshots: input.snapshots ?? {},
    anomalies,
    categories,
    redirected_to: input.redirectedTo ?? null,
    notices,
    supplier: input.supplier,
  };
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** One page fetch, with where it actually ended up (E2) and how long it took. */
export interface FetchHtmlResult {
  html: string;
  finalUrl: string;
  status: number;
  ms: number;
}

const FETCH_TIMEOUT_MS = 15_000;
/** First try + two retries (F3). */
const FETCH_ATTEMPTS = 3;

function abortGuard(outer?: AbortSignal): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = (): void => controller.abort();
  outer?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    },
  };
}

function isRetriable(err: unknown, outer?: AbortSignal): boolean {
  if (outer?.aborted) return false; // the caller cancelled: never retry
  const e = err as { retriable?: boolean; name?: string };
  if (e?.retriable === true) return true;
  return e?.name === 'AbortError' || e?.name === 'TypeError';
}

async function fetchHtmlOnce(
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<FetchHtmlResult> {
  const guard = abortGuard(signal);
  const started = Date.now();
  try {
    const resp = await fetchImpl(url, {
      signal: guard.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!resp.ok) {
      const retriable = resp.status === 429 || resp.status >= 500;
      throw Object.assign(new Error(`fetch failed (status ${resp.status}): ${url}`), {
        retriable,
      });
    }
    return {
      html: await resp.text(),
      finalUrl: resp.url || url,
      status: resp.status,
      ms: Date.now() - started,
    };
  } finally {
    guard.release();
  }
}

async function fetchHtml(
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<FetchHtmlResult> {
  let last: unknown = null;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetchHtmlOnce(url, fetchImpl, signal);
    } catch (err) {
      last = err;
      if (!isRetriable(err, signal) || attempt === FETCH_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export interface ResolveSkuOptions {
  /** Explicit bestofgifts.eu product URL (skips the catalogsearch step). */
  url?: string;
  /** Extra storefront languages to snapshot besides EN (default en,es,fr). */
  languages?: string[];
  fetchImpl?: typeof fetch;
  base?: string;
  /** Optional abort signal for cancellation. */
  signal?: AbortSignal;
  /** Supplier attribution to embed (the audit lane owns the rule). */
  supplier?: ResolverSupplier;
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
  let redirectedTo: string | null = null;

  if (opts.url) {
    const abs = toAbsoluteEuUrl(opts.url, base);
    if (!abs) throw new Error(`url must be a bestofgifts.eu product URL: ${opts.url}`);
    resolvedUrl = abs.url;
    slug = abs.path;
    source = 'url-override';
  } else {
    const searchUrl = `${base}/catalogsearch/result/?q=${encodeURIComponent(sku)}`;
    const searchHtml = (await fetchHtml(searchUrl, fetchImpl, opts.signal)).html;

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
      // R9: an exact SKU on a result card is authoritative - it is the card the
      // storefront indexed for this product, whatever its slug looks like.
      const cards = searchCards(searchHtml, base);
      const exact = cards.find(
        (card) => card.sku.toUpperCase() === sku,
      );
      if (exact) {
        resolvedUrl = exact.url.url;
        slug = exact.url.path;
        source = 'search-card-sku';
      } else if (cards.length > 0 && cards.every((card) => card.sku)) {
        // Every card named its SKU and none of them is ours: the product is not
        // published on the storefront (disabled). Stop here instead of fetching
        // a neighbour's PDP and reporting a mismatch two requests later.
        throw new SkuMismatchError({
          expected: sku,
          url: searchUrl,
          candidates: cards.map((card) => card.sku),
        });
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

  const page = await fetchHtml(resolvedUrl, fetchImpl, opts.signal);
  const enHtml = page.html;
  // E2: a redirect is a finding (a stale link somewhere), not noise. Adopt the
  // final URL when it is still a product page, and keep what was requested.
  if (normalizeUrl(page.finalUrl) !== normalizeUrl(resolvedUrl)) {
    redirectedTo = resolvedUrl;
    const abs = toAbsoluteEuUrl(page.finalUrl, base);
    if (abs) {
      resolvedUrl = abs.url;
      slug = abs.path;
    }
  }

  // E1: prove the page is this SKU. A substring test let R0304 match R03041.
  const cfg = readJsonConfig(enHtml);
  const pageSku = readPageSku(enHtml, cfg);
  if (!skuMatchesPage(enHtml, sku, pageSku)) {
    throw pageSku
      ? new SkuMismatchError({
          expected: sku,
          actual: pageSku.sku,
          url: resolvedUrl,
          source: pageSku.source,
        })
      : new Error(`SKU ${sku} not present on ${resolvedUrl} - wrong slug?`);
  }

  const hreflang = getHreflangMap(enHtml);
  const categories = readCategories(enHtml, cfg);
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
    categories,
    redirectedTo,
    pageSku,
    supplier: opts.supplier,
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
