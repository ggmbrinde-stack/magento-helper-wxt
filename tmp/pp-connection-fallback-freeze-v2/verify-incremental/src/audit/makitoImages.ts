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

/** Poll budget while the page HTML is being served. */
const GALLERY_ATTEMPTS = 4;
const GALLERY_RETRY_MS = 700;

/**
 * Smallest real product photo, in pixels.
 *
 * Magento keeps a 90x90 `<sku>_250.gif` thumbnail next to the photos and lists
 * it in the gallery JSON, so the size has to be measured or it ends up saved as
 * if it were a photo.
 */
const MIN_PHOTO_PX = 200;

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

/**
 * Read the gallery out of the page's own HTML.
 *
 * Magento ships the whole gallery as JSON inside a `text/x-magento-init`
 * script, so the server response already contains every frame. Reading the
 * rendered carousel instead is unreliable: the download tab is opened in the
 * background, where the Fotorama widget does not necessarily build, and the
 * only image present before it does is the placeholder - exactly the "one image
 * instead of ten" failure. The DOM scan below stays as a fallback for themes
 * that render their gallery server-side.
 */
async function readGalleryUrls(): Promise<string[]> {
  const absolute = (value: string): string | null => {
    try {
      const url = new URL(value, location.href);
      return url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  };

  /** Pull the gallery's `data` array out of the unescaped init script. */
  const fromGalleryJson = (source: string): string[] => {
    // The init script escapes slashes (`https:\/\/…`) and quotes (`\"data\"`).
    const flat = source.replace(/\\\//g, '/').replace(/\\u002f/gi, '/');
    const key = flat.indexOf('data-gallery-role=gallery-placeholder');
    if (key < 0) return [];

    const opener = /\\{0,3}"data\\{0,3}"\s*:\s*\[/g;
    opener.lastIndex = key;
    const hit = opener.exec(flat);
    if (!hit) return [];

    // Bracket-match the array so only this product's frames are read - the rest
    // of the page has related products with their own images.
    const start = hit.index + hit[0].length - 1;
    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;
    for (let i = start; i < flat.length; i += 1) {
      const char = flat[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '[') depth += 1;
      else if (char === ']') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return [];

    const region = flat.slice(start, end + 1);
    const urls = region.match(/https:\/\/[^"'\s\\]+?\.(?:jpe?g|png|gif|webp|avif)/gi) ?? [];
    return urls.map((url) => absolute(url)).filter((url): url is string => Boolean(url));
  };

  try {
    const response = await fetch(location.href, { credentials: 'include' });
    if (response.ok) {
      const fromHtml = fromGalleryJson(await response.text());
      if (fromHtml.length > 0) return fromHtml;
    }
  } catch {
    // Fall through to the DOM: a blocked refetch still leaves a rendered page.
  }

  return readGalleryFromDom();
}

/** Fallback: collect the gallery image URLs currently in the DOM. */
function readGalleryFromDom(): string[] {
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

/**
 * Fetch every gallery image inside the page and measure it.
 *
 * The bytes are fetched here for two reasons: the shop refuses requests that do
 * not come from the product page, and the real pixel size is the only reliable
 * way to tell a photo from Magento's thumbnail preview.
 */
async function readImages(
  urls: string[],
  wantBytes: boolean,
): Promise<{ url: string; width: number; height: number; base64?: string; error?: string }[]> {
  const out: { url: string; width: number; height: number; base64?: string; error?: string }[] = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        out.push({ url, width: 0, height: 0, error: `HTTP ${response.status}` });
        continue;
      }
      const blob = await response.blob();
      let width = 0;
      let height = 0;
      try {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch {
        // An unusual format still downloads; it just cannot be measured.
      }

      let base64: string | undefined;
      if (wantBytes) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        base64 = btoa(binary);
      }
      out.push({ url, width, height, base64 });
    } catch (error) {
      out.push({
        url,
        width: 0,
        height: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return out;
}

export function waitForTabLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
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

  for (let attempt = 0; attempt < GALLERY_ATTEMPTS; attempt += 1) {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readGalleryUrls,
    });
    const urls = galleryImageSources(
      Array.isArray(injection?.result) ? (injection.result as string[]) : [],
    );
    if (urls.length > best.length) best = urls;
    // The HTML is complete on the first good read; retries only cover a
    // transient block or a page still streaming its response.
    if (best.length > 0) return best;
    await new Promise((resolve) => setTimeout(resolve, GALLERY_RETRY_MS));
  }

  return best;
}

export interface MakitoImageFile {
  name: string;
  /** Original supplier URL, kept for the report and the Downloads fallback. */
  url: string;
  width: number;
  height: number;
  /** Filled when the caller asked for bytes (writing to the evidence folder). */
  base64?: string;
}

export interface MakitoGallery {
  /** Gallery photos found on the page, in carousel order. */
  total: number;
  /** Candidates dropped for being thumbnails or unreadable. */
  skipped: number;
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

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readImages,
      args: [urls, Boolean(options.withBytes)],
    });
    const measured = Array.isArray(injection?.result)
      ? (injection.result as {
          url: string;
          width: number;
          height: number;
          base64?: string;
          error?: string;
        }[])
      : [];

    const readable = measured.filter((image) => !image.error);
    if (readable.length === 0) {
      throw new Error(
        `The supplier page refused to hand over the image data (${measured[0]?.error ?? 'unknown error'}).`,
      );
    }

    // A 90px preview is not a product photo, and it is only recognisable by its
    // measured size.
    const photos = readable.filter((image) => image.width === 0 || image.width >= MIN_PHOTO_PX);
    if (photos.length === 0) {
      throw new Error('Only thumbnail-sized images were found - is that a product page?');
    }

    const files: MakitoImageFile[] = photos.map((image, index) => ({
      url: image.url,
      width: image.width,
      height: image.height,
      base64: image.base64,
      name: makitoImageFilename(image.url, index, sku),
    }));

    const skipped = measured.length - photos.length;
    return { total: files.length, skipped, folder: `Makito/${sku}`, files };
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
