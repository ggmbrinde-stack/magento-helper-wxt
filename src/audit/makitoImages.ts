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

/** How long to keep looking for gallery images after the tab says "complete". */
const GALLERY_ATTEMPTS = 8;
const GALLERY_RETRY_MS = 750;

export function isMakitoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MAKITO_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * PrestaShop (and most carts) serve one photo under several image types, e.g.
 * `/312-large_default/name.jpg` and `/312-home_default/name.jpg`. They are the
 * same picture at different sizes, so the type token is dropped from the
 * de-duplication key - otherwise a six-photo gallery downloads as eighteen
 * files, three of them identical.
 */
const IMAGE_TYPE_TOKEN =
  /-(thickbox|large|medium|small|home|cart|category|modal|by_size)_default(?=[./]|$)/i;

/**
 * Turn whatever the page handed back into a stable, de-duplicated list of
 * HTTPS image URLs, keeping the first (largest) variant of each photo.
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

    const key = `${url.hostname.toLowerCase()}${url.pathname.replace(IMAGE_TYPE_TOKEN, '')}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url.href);
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
      return new URL(url).pathname.split('/').pop() ?? '';
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
 * Everything below this line runs inside the supplier tab via
 * chrome.scripting.executeScript, so each function must be self-contained: no
 * imports, no closures over module scope.
 */

/** Force lazy-loaded gallery images to resolve their real source. */
function primeGalleryImages(): void {
  const images = Array.from(document.querySelectorAll('img'));
  for (const image of images) {
    image.loading = 'eager';
    const lazy =
      image.getAttribute('data-src') ??
      image.getAttribute('data-lazy-src') ??
      image.getAttribute('data-original');
    if (lazy && !image.src) image.src = lazy;
  }
  // Many themes only populate the gallery once the container has been on
  // screen; a background tab still lays out, so this is enough to trigger it.
  window.scrollTo(0, document.body.scrollHeight);
}

/** Collect the product-gallery image candidates from the live page. */
function readProductGalleryImages(): string[] {
  const gallerySelector = [
    // PrestaShop (the platform makito.eu uses): cover, thumbs, quick view.
    '[data-image-large-src]',
    '[data-image-medium-src]',
    '.js-qv-product-cover',
    '.product-cover',
    '.js-thumb',
    '.product-images',
    '#product-images',
    // Generic gallery markup.
    '[data-gallery-role]',
    '[data-qa*="gallery" i]',
    '[class*="product-gallery" i]',
    '[class*="product-images" i]',
    '[class*="image-gallery" i]',
    '[id*="gallery" i]',
    '[class*="thumbnails" i]',
  ].join(',');

  const galleries = Array.from(document.querySelectorAll<HTMLElement>(gallerySelector));
  const roots = galleries.length
    ? galleries
    : [document.querySelector<HTMLElement>('main') ?? document.body];
  const found: string[] = [];

  for (const root of roots) {
    for (const image of Array.from(root.querySelectorAll('img'))) {
      const box = image.getBoundingClientRect();
      // A zero-size image is a hidden placeholder, not gallery content. Lazy
      // images that have not loaded yet still report their layout box.
      if (Math.max(image.naturalWidth, image.width, box.width) < 80) continue;

      const anchor = image.closest('a');
      const candidates = [
        image.getAttribute('data-image-large-src'),
        image.getAttribute('data-zoom-image'),
        image.getAttribute('data-zoom-src'),
        image.getAttribute('data-full-image'),
        image.getAttribute('data-large-image'),
        anchor?.href,
        image.currentSrc,
        ...(image
          .getAttribute('srcset')
          ?.split(',')
          .map((entry) => entry.trim().split(/\s+/)[0] ?? '') ?? []),
        image.getAttribute('data-src'),
        image.src,
      ];

      const source = candidates.find((candidate) => {
        if (!candidate) return false;
        try {
          return new URL(candidate, document.baseURI).protocol === 'https:';
        } catch {
          return false;
        }
      });
      if (!source) continue;

      const absolute = new URL(source, document.baseURI).href;
      if (!found.includes(absolute)) found.push(absolute);
    }
  }

  return found;
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
    // The download may already have settled before the listener was attached.
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

async function readGallery(tabId: number): Promise<string[]> {
  for (let attempt = 0; attempt < GALLERY_ATTEMPTS; attempt += 1) {
    if (attempt === 1) {
      await chrome.scripting
        .executeScript({ target: { tabId }, func: primeGalleryImages })
        .catch(() => undefined);
    }
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readProductGalleryImages,
    });
    const images = galleryImageSources(
      Array.isArray(injection?.result) ? (injection.result as string[]) : [],
    );
    if (images.length > 0) return images;
    await new Promise((resolve) => setTimeout(resolve, GALLERY_RETRY_MS));
  }
  return [];
}

export interface MakitoImageDownload {
  /** Downloads Chrome accepted. */
  started: number;
  /** Downloads that reached the disk. */
  saved: number;
  /** Gallery photos found on the page. */
  total: number;
  /** Path under Downloads/. */
  folder: string;
  failures: { url: string; error: string }[];
}

/**
 * Read the product gallery from a confirmed Makito URL in a real browser tab
 * (their shop answers 403 to every automated request, so a plain fetch cannot
 * see the page) and save each photo under `Downloads/Makito/<SKU>/`.
 *
 * The tab is always closed, including on failure, and it is never activated:
 * an operator can keep working while the gallery is collected.
 */
export async function downloadMakitoCarouselImages(
  skuValue: string,
  catalogUrl: string,
): Promise<MakitoImageDownload> {
  const sku = skuValue.trim().toUpperCase();
  if (!sku || supplierFor(sku) !== 'MAKITO') {
    throw new Error('This image downloader only supports Makito product SKUs.');
  }
  if (!isMakitoUrl(catalogUrl)) {
    throw new Error('A confirmed HTTPS Makito product URL is required.');
  }

  const tab = await chrome.tabs.create({ url: catalogUrl, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error('Could not open a Makito product tab.');

  let images: string[];
  try {
    await waitForTabLoad(tabId);
    const currentTab = await chrome.tabs.get(tabId);
    if (!isMakitoUrl(currentTab.url ?? '')) {
      throw new Error('The Makito product page redirected outside the approved supplier domains.');
    }
    images = await readGallery(tabId);
    if (images.length === 0) {
      throw new Error(
        'No product-gallery images were found. Makito may have blocked the page, or the URL may not be a product page.',
      );
    }
  } finally {
    await chrome.tabs.remove(tabId).catch(() => undefined);
  }

  const folder = `Makito/${sku}`;
  const started: { url: string; id: number }[] = [];
  const failures: { url: string; error: string }[] = [];

  for (const [index, url] of images.entries()) {
    try {
      const id = await chrome.downloads.download({
        url,
        filename: `${folder}/${makitoImageFilename(url, index, sku)}`,
        conflictAction: 'uniquify',
        saveAs: false,
      });
      started.push({ url, id });
    } catch (error) {
      failures.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (started.length === 0) {
    const first = failures[0]?.error ?? 'unknown error';
    throw new Error(`The browser did not start any image downloads (${first}).`);
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
    total: images.length,
    folder,
    failures,
  };
}
