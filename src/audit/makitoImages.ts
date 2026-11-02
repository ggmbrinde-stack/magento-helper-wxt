import { supplierFor } from '../shared/resolver';

const MAKITO_HOSTS = new Set([
  'makito.eu',
  'www.makito.eu',
  'makito.es',
  'www.makito.es',
  'makito.pt',
  'www.makito.pt',
]);

/** How long a single image may take before it is reported as unfinished. */
const DOWNLOAD_TIMEOUT_MS = 90_000;

/** Poll budget while the gallery builds itself. */
const GALLERY_ATTEMPTS = 12;
const GALLERY_RETRY_MS = 450;
/** Stop once the URL set has not grown for this many consecutive polls. */
const GALLERY_SETTLE_POLLS = 3;

export function isMakitoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MAKITO_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Magento serves every image through a resized derivative:
 *
 *   /media/catalog/product/cache/<32-hex>/2/2/22482-W.jpg
 *   /media/catalog/product/2/2/22482-W.jpg            <- the original
 *
 * The same photo appears once per size and once per cache hash, so comparing
 * URLs verbatim turns a ten-photo gallery into fourteen downloads of four
 * photos at four sizes. Stripping the cache segment gives the one canonical URL
 * for both de-duplication and the download itself.
 */
export const MAGENTO_CACHE = /\/cache\/[0-9a-f]{8,}\//i;

export function stripMagentoCache(url: string): string {
  return url.replace(MAGENTO_CACHE, '/');
}

/** Only real product media: excludes CMS banners, labels and payment icons. */
const PRODUCT_MEDIA = /\/media\/catalog\/product\//i;

/** PrestaShop-style size tokens (`-large_default`), for the other shops. */
const IMAGE_TYPE_TOKEN =
  /-(thickbox|large|medium|small|home|cart|category|modal|by_size)_default(?=[./]|$)/i;

/**
 * Turn whatever the page handed back into a stable, de-duplicated list of
 * HTTPS image URLs, keeping the first variant of each photo.
 */
export function galleryImageSources(raw: string[], base?: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const candidate of raw) {
    if (!candidate || typeof candidate !== 'string') continue;
    let url: URL;
    try {
      url = base ? new URL(candidate.trim(), base) : new URL(candidate.trim());
    } catch {
      continue;
    }
    if (url.protocol !== 'https:') continue;

    // The Magento cache segment is dropped from the URL itself: the remaining
    // path is the original file. A PrestaShop size token is only dropped from
    // the key, because that URL would not resolve.
    const servedPath = stripMagentoCache(url.pathname);
    const key = `${url.hostname.toLowerCase()}${servedPath.replace(IMAGE_TYPE_TOKEN, '')}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${url.origin}${servedPath}${url.search}`);
  }

  return out;
}

/**
 * `<index>-<SKU>[-<image name>].<ext>`.
 *
 * The index is zero padded so a folder listing sorts in gallery order, and the
 * SKU is in the name so images from different products cannot be mixed up once
 * they leave the supplier folder.
 */
export function makitoImageFilename(url: string, index: number, sku: string): string {
  const pathName = (() => {
    try {
      return stripMagentoCache(new URL(url).pathname).split('/').pop() ?? '';
    } catch {
      return '';
    }
  })();

  // Supplier filenames arrive percent-encoded (`soporte%20zynix.jpg`,
  // `cora%C3%A7%C3%A3o.jpg`); decoding first turns those into readable dashes
  // and letters instead of `%20` / `-20` noise.
  const decodedName = (() => {
    try {
      return decodeURIComponent(pathName);
    } catch {
      return pathName;
    }
  })();

  const extension = /\.(jpe?g|png|webp|avif|gif)$/i.exec(decodedName)?.[0].toLowerCase() ?? '.jpg';
  const safeName = decodedName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.[^.]+$/, '')
    .replace(IMAGE_TYPE_TOKEN, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  const prefix = `${String(index + 1).padStart(2, '0')}-${sku}`;
  return `${prefix}${safeName ? `-${safeName}` : ''}${extension}`;
}

/*
 * Everything below runs inside the supplier tab via
 * chrome.scripting.executeScript, so each function must be self-contained: no
 * imports, no closures over module scope.
 */

/** Collect the gallery image URLs currently in the DOM (originals). */
function readGalleryUrls(): string[] {
  const roots = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        // Magento 2: the placeholder holds the main image while Fotorama builds,
        // then Fotorama itself holds every frame and thumbnail.
        '.product.media',
        '.gallery-placeholder',
        '[data-gallery-role]',
        '.fotorama',
        // PrestaShop and generic themes.
        '.product-images',
        '#product-images',
        '[class*="product-gallery" i]',
        '[class*="image-gallery" i]',
        '[id*="gallery" i]',
      ].join(','),
    ),
  );
  if (roots.length === 0) roots.push(document.querySelector('main') ?? document.body);

  const found: string[] = [];
  const push = (value: string | null | undefined, renderedWidth = 0): void => {
    if (!value) return;
    let url: URL;
    try {
      url = new URL(value, document.baseURI);
    } catch {
      return;
    }
    if (url.protocol !== 'https:') return;

    const cached = /\/cache\/[0-9a-f]{8,}\//i.test(url.pathname);
    // A direct original rendered tiny really is a tiny file (Magento stores
    // 90px `<sku>_250.gif` previews next to the photos). A cached derivative is
    // full size no matter how small its <img> renders, so it always counts.
    if (!cached && renderedWidth > 0 && renderedWidth < 200) return;

    // One entry per photo: the same file appears at every cache size.
    const path = url.pathname.replace(/\/cache\/[0-9a-f]{8,}\//i, '/');
    if (!/\/media\/catalog\/product\//i.test(path) && /\/media\//i.test(path)) return;
    if (!found.includes(path)) found.push(path);
  };

  for (const root of roots) {
    for (const image of Array.from(root.querySelectorAll('img'))) {
      push(image.getAttribute('data-image-large-src'), image.naturalWidth);
      push(image.getAttribute('data-zoom-image'), image.naturalWidth);
      push(image.getAttribute('data-src'), image.naturalWidth);
      push(image.currentSrc || image.src, image.naturalWidth);
      const srcset = image.getAttribute('srcset');
      if (srcset) {
        for (const entry of srcset.split(',')) {
          push(entry.trim().split(/\s+/)[0], image.naturalWidth);
        }
      }
      const anchor = image.closest('a');
      if (anchor?.href) push(anchor.href, image.naturalWidth);
    }
  }

  return found.map((path) => `https://${location.hostname}${path}`);
}

/** Fetch one gallery image in the page and return it as base64. */
async function fetchImageBase64(
  urls: string[],
): Promise<{ name: string; base64: string }[]> {
  const out: { name: string; base64: string }[] = [];
  for (const url of urls) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    out.push({ name: url, base64: btoa(binary) });
  }
  return out;
}

function waitForTabLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error('Timed out waiting for the Makito product page to load.')),
      timeoutMs,
    );
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo): void => {
      if (id === tabId && info.status === 'complete') finish();
    };
    const onRemoved = (id: number): void => {
      if (id === tabId) finish(new Error('The Makito product tab was closed before it loaded.'));
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === 'complete') finish();
      })
      .catch(() => finish(new Error('The Makito product tab is no longer available.')));
  });
}

/** Wait until Chrome reports the download finished or failed. */
function waitForDownload(
  id: number,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(onChanged);
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: 'still downloading after 90s' }),
      timeoutMs,
    );
    const onChanged = (delta: chrome.downloads.DownloadDelta): void => {
      if (delta.id !== id) return;
      if (delta.state?.current === 'complete') finish({ ok: true });
      else if (delta.state?.current === 'interrupted') {
        finish({ ok: false, error: delta.error?.current ?? 'interrupted' });
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
    void chrome.downloads
      .search({ id })
      .then(([item]) => {
        if (item?.state === 'complete') finish({ ok: true });
        else if (item?.state === 'interrupted') {
          finish({ ok: false, error: item.error ?? 'interrupted' });
        }
      })
      .catch(() => undefined);
  });
}

/**
 * Poll until the gallery stops growing.
 *
 * Magento renders one placeholder image first and builds the carousel a moment
 * later, so "the first poll that returned anything" is one photo - the bug that
 * saved a single image. Waiting for the set to settle yields the whole gallery.
 */
async function readGallery(tabId: number): Promise<string[]> {
  let best: string[] = [];
  let stablePolls = 0;

  for (let attempt = 0; attempt < GALLERY_ATTEMPTS; attempt += 1) {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readGalleryUrls,
    });
    const urls = galleryImageSources(
      Array.isArray(injection?.result) ? (injection.result as string[]) : [],
    );
    if (urls.length > best.length) {
      best = urls;
      stablePolls = 0;
    } else if (best.length > 0) {
      stablePolls += 1;
      if (stablePolls >= GALLERY_SETTLE_POLLS) return best;
    }
    await new Promise((resolve) => setTimeout(resolve, GALLERY_RETRY_MS));
  }

  return best;
}

export interface MakitoImageFile {
  name: string;
  /** Original supplier URL, kept for the report and the Downloads fallback. */
  url: string;
  /** Filled when the caller asked for bytes (writing to the evidence folder). */
  base64?: string;
}

export interface MakitoGallery {
  /** Gallery photos found on the page, in carousel order. */
  total: number;
  folder: string;
  files: MakitoImageFile[];
}

function guard(skuValue: string, catalogUrl: string): string {
  const sku = skuValue.trim().toUpperCase();
  if (!sku || supplierFor(sku) !== 'MAKITO') {
    throw new Error('This image downloader only supports Makito product SKUs.');
  }
  if (!isMakitoUrl(catalogUrl)) {
    throw new Error('A confirmed HTTPS Makito product URL is required.');
  }
  return sku;
}

/**
 * Open the confirmed Makito product page in an inactive tab, read the whole
 * gallery, and (optionally) fetch the image bytes there.
 *
 * The page is read in a real tab because Makito answers 403 to automated
 * requests; the bytes are fetched from inside that page for the same reason, so
 * the download carries the page's own cookies and referrer.
 */
export async function collectMakitoGallery(
  skuValue: string,
  catalogUrl: string,
  options: { withBytes?: boolean } = {},
): Promise<MakitoGallery> {
  const sku = guard(skuValue, catalogUrl);

  const tab = await chrome.tabs.create({ url: catalogUrl, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error('Could not open a Makito product tab.');

  try {
    await waitForTabLoad(tabId);
    const currentTab = await chrome.tabs.get(tabId);
    if (!isMakitoUrl(currentTab.url ?? '')) {
      throw new Error('The Makito product page redirected outside the approved supplier domains.');
    }

    const urls = await readGallery(tabId);
    if (urls.length === 0) {
      throw new Error(
        'No product-gallery images were found. Makito may have blocked the page, or the URL may not be a product page.',
      );
    }

    const files: MakitoImageFile[] = urls.map((url, index) => ({
      url,
      name: makitoImageFilename(url, index, sku),
    }));

    if (options.withBytes) {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: fetchImageBase64,
        args: [urls],
      });
      const fetched = injection?.result;
      if (!Array.isArray(fetched) || fetched.length !== urls.length) {
        throw new Error('The supplier page refused to hand over the image data.');
      }
      for (const [index, file] of files.entries()) {
        file.base64 = (fetched[index] as { base64: string }).base64;
      }
    }

    return { total: files.length, folder: `Makito/${sku}`, files };
  } finally {
    await chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

export interface MakitoImageDownload {
  started: number;
  saved: number;
  total: number;
  folder: string;
  failures: { url: string; error: string }[];
}

/**
 * Downloads fallback: save into `Downloads/Makito/<SKU>/` when no evidence
 * folder has been picked. Chrome's download request is a separate request that
 * the shop may refuse, so every file is checked after it settles.
 */
export async function downloadMakitoCarouselImages(
  skuValue: string,
  catalogUrl: string,
): Promise<MakitoImageDownload> {
  const gallery = await collectMakitoGallery(skuValue, catalogUrl);
  const sku = skuValue.trim().toUpperCase();
  const folder = `Makito/${sku}`;
  const started: { url: string; id: number }[] = [];
  const failures: { url: string; error: string }[] = [];

  for (const file of gallery.files) {
    try {
      const id = await chrome.downloads.download({
        url: file.url,
        filename: `${folder}/${file.name}`,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      started.push({ url: file.url, id });
    } catch (error) {
      failures.push({ url: file.url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (started.length === 0) {
    throw new Error(
      `The browser did not start any image downloads (${failures[0]?.error ?? 'unknown error'}).`,
    );
  }

  const settled = await Promise.all(
    started.map(async ({ url, id }) => ({ url, ...(await waitForDownload(id)) })),
  );
  for (const item of settled) {
    if (!item.ok) failures.push({ url: item.url, error: item.error ?? 'failed' });
  }

  return {
    started: started.length,
    saved: settled.filter((item) => item.ok).length,
    total: gallery.total,
    folder,
    failures,
  };
}
