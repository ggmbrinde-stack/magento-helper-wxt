import { supplierLinkFor } from './supplierLinks';

/**
 * Operator-pasted supplier product links, keyed by SKU.
 *
 * The other sources are a Notion column and a code map: both need a release or
 * a database edit to change. A supplier link is often discovered mid-audit, so
 * this store is the fast path - paste it once, and the resolve, the dossier and
 * the image download all use it from then on.
 */
const OVERRIDES_KEY = 'supplierUrlOverrides';

export type OverrideMap = Record<string, string>;

export interface SupplierUrlCheck {
  /** Normalised URL when the input is usable. */
  url?: string;
  error?: string;
}

/** Hosts a product link for this SKU may live on. */
function allowedHosts(sku: string): string[] {
  const info = supplierLinkFor(sku);
  const hosts = new Set<string>();
  for (const site of [info.official, info.alt]) {
    if (!site) continue;
    try {
      hosts.add(new URL(site).hostname.toLowerCase().replace(/^www\./, ''));
    } catch {
      // A malformed row is not worth failing the paste over; just skip it.
    }
  }
  return [...hosts];
}

const SEARCH_PATHS = /(^|\/)(search|buscar|busca|pesquisa|recherche|suchen)(\/|\.php|$)/i;

/**
 * Validate a pasted link before it can become the catalogue entry.
 *
 * The failure modes here are the ones that actually cost an operator time: a
 * plain-http link, a link for the wrong supplier, the shop's home page, and a
 * search results page (which looks plausible and has no gallery to download).
 */
export function checkSupplierUrl(skuRaw: string, raw: string): SupplierUrlCheck {
  const sku = skuRaw.trim().toUpperCase();
  if (!sku) return { error: 'Resolve a SKU first.' };

  const info = supplierLinkFor(sku);
  if (info.internalOnly) {
    return { error: `${info.supplier} is an internal supplier with no public catalogue.` };
  }

  const value = raw.trim();
  if (!value) return { error: 'Paste the supplier product link first.' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: 'That is not a complete URL - it must start with https://.' };
  }
  if (url.protocol !== 'https:') {
    return { error: 'The link must start with https://.' };
  }

  const hosts = allowedHosts(sku);
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hosts.length === 0 || !hosts.includes(host)) {
    return {
      error: hosts.length
        ? `That link is on ${host}; ${info.supplier} product pages are on ${hosts.join(' or ')}.`
        : `No public site is known for ${info.supplier}.`,
    };
  }

  if (url.pathname === '' || url.pathname === '/') {
    return { error: 'That is the site home page - paste the product page itself.' };
  }
  if (SEARCH_PATHS.test(url.pathname) || url.searchParams.get('controller') === 'search') {
    return { error: 'That is a search results page - open the product and paste its address.' };
  }

  // Keep the URL as pasted, minus the fragment: `#reviews` and friends only add
  // noise to the dossier and the download tab.
  url.hash = '';
  return { url: url.href };
}

export async function loadSupplierOverrides(): Promise<OverrideMap> {
  try {
    const stored = await chrome.storage.local.get([OVERRIDES_KEY]);
    return (stored[OVERRIDES_KEY] as OverrideMap | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function getSupplierOverride(skuRaw: string): Promise<string> {
  const sku = skuRaw.trim().toUpperCase();
  if (!sku) return '';
  return (await loadSupplierOverrides())[sku] ?? '';
}

/** Validate and store. Throws with the reason when the link is unusable. */
export async function saveSupplierOverride(skuRaw: string, raw: string): Promise<string> {
  const sku = skuRaw.trim().toUpperCase();
  const check = checkSupplierUrl(sku, raw);
  if (!check.url) throw new Error(check.error ?? 'That link cannot be used.');
  const all = await loadSupplierOverrides();
  all[sku] = check.url;
  await chrome.storage.local.set({ [OVERRIDES_KEY]: all });
  return check.url;
}

export async function clearSupplierOverride(skuRaw: string): Promise<void> {
  const sku = skuRaw.trim().toUpperCase();
  const all = await loadSupplierOverrides();
  if (!(sku in all)) return;
  delete all[sku];
  await chrome.storage.local.set({ [OVERRIDES_KEY]: all });
}
