import { supplierFor } from '../shared/resolver';
import { isMakitoUrl, waitForTabLoad } from './makitoImages';

/**
 * Finding a Makito product page from our SKU.
 *
 * The shop cannot be searched by our SKU (`M22482` and `M22473` return nothing)
 * and Magento's GraphQL endpoint answers 403 behind Akamai. What does work is
 * the shop's own reference: its search redirects a single hit straight to the
 * product page, and every product page prints its reference (`Ref: 22498`).
 *
 * So the lookup is: strip the `M`, search the reference, and only accept the
 * page that prints that exact reference back. A wrong product is worse than no
 * product here - the images would be saved under the wrong SKU.
 *
 * The reference is read from a parsed document, not from a slice of the HTML:
 * the product block is only the first occurrence of the markup, and the printed
 * reference sits a megabyte further down the page.
 */

const MAKITO_ORIGIN = 'https://www.makito.eu';

/** `M22482` -> `22482`: the shop's reference has no supplier prefix. */
export function makitoReference(skuRaw: string): string | null {
  const digits = skuRaw
    .trim()
    .toUpperCase()
    .replace(/[^0-9]/g, '');
  return digits.length >= 3 ? digits : null;
}

export function makitoSearchUrl(reference: string): string {
  return `${MAKITO_ORIGIN}/es/catalogsearch/result/?q=${encodeURIComponent(reference)}`;
}

/** A product page, as opposed to the search page it may redirect from. */
const PRODUCT_PATH = /^\/es\/[a-z0-9-]+\.html$/i;

/*
 * Runs inside the search tab. Everything is fetched from the page so the
 * requests carry the shop's cookies and referrer: the same URLs requested from
 * the service worker are refused.
 */
async function matchReference(reference: string): Promise<string | null> {
  const refOf = (html: string): string | null => {
    const probe = (text: string): string | null => {
      const match = /(?:ref(?:erencia|erence)?)\s*[:.]?\s*(\d{3,})/i.exec(text);
      return match?.[1] ?? null;
    };

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
      // The product block only, in falling order of precision: its info column
      // prints `Ref: 22498`, its SKU label repeats it, and the add-to-cart form
      // carries it as `data-product-sku`. Related tiles are never read - they
      // print their own reference and would be a wrong page to accept.
      const sources = [
        doc.querySelector('.product-info-main'),
        doc.querySelector('.product-info-main .sku .value') ?? doc.querySelector('.sku .value'),
        doc.querySelector('[itemprop="sku"]'),
      ];
      for (const source of sources) {
        const found = source ? probe(source.textContent ?? '') : null;
        if (found) return found;
      }
      const attribute = doc.querySelector('form[data-product-sku]')?.getAttribute('data-product-sku');
      return attribute && /^\d{3,}$/.test(attribute) ? attribute : null;
    } catch {
      // No parser in this context: fall back to the SKU label in the markup.
      const match = /class="[^"]*\bsku\b[^"]*"[^>]*>[\s\S]{0,120}?(\d{3,})/i.exec(html);
      return match?.[1] ?? null;
    }
  };

  const read = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url, { credentials: 'include' });
      return response.ok ? await response.text() : '';
    } catch {
      return '';
    }
  };

  const isProduct = (url: string): boolean => {
    try {
      return new URL(url).pathname.match(/^\/es\/[a-z0-9-]+\.html$/i) !== null;
    } catch {
      return false;
    }
  };

  if (isProduct(location.href) && refOf(await read(location.href)) === reference) {
    return location.href;
  }

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.product-item-link'))
    .map((anchor) => anchor.href)
    .filter((href) => ['https:', ''].includes(new URL(href).protocol) && isProduct(href));

  for (const link of [...new Set(links)].slice(0, 12)) {
    if (refOf(await read(link)) === reference) return link;
  }

  return null;
}

export interface MakitoProductMatch {
  url: string;
  reference: string;
}

/**
 * Resolve `SKU -> product URL` through the shop's own search.
 *
 * Resolves to `null` when the shop has no product that prints this reference -
 * that is a real answer ("not sold there"), not an error.
 */
export async function findMakitoProductUrl(skuRaw: string): Promise<MakitoProductMatch | null> {
  const sku = skuRaw.trim().toUpperCase();
  if (!sku || supplierFor(sku) !== 'MAKITO') {
    throw new Error('Automatic product lookup is only available for Makito SKUs.');
  }
  const reference = makitoReference(sku);
  if (!reference) {
    throw new Error(`"${sku}" has no reference number to search the Makito site for.`);
  }

  const tab = await chrome.tabs.create({ url: makitoSearchUrl(reference), active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error('Could not open a Makito search tab.');

  try {
    await waitForTabLoad(tabId);
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: matchReference,
      args: [reference],
    });
    const found = injection?.result;
    if (typeof found === 'string' && isMakitoUrl(found)) {
      return { url: found, reference };
    }
    return null;
  } finally {
    await chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

/** True when the URL is a Makito product page rather than a search or home page. */
export function isMakitoProductUrl(value: string): boolean {
  if (!isMakitoUrl(value)) return false;
  try {
    return PRODUCT_PATH.test(new URL(value).pathname);
  } catch {
    return false;
  }
}
