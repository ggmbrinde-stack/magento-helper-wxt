import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  collectMakitoGallery,
  downloadMakitoCarouselImages,
  galleryImageSources,
  isMakitoUrl,
  makitoImageFilename,
} from '../makitoImages';
import {
  findMakitoProductUrl,
  makitoReference,
  makitoSearchUrl,
} from '../makitoFind';

// --- chrome stub -----------------------------------------------------------
// The downloader only talks to tabs/scripting/downloads, so the whole flow can
// be exercised without a browser.

interface FakeChrome {
  gallery: string[];
  /** Measured pixel width per URL; anything absent is a full-size photo. */
  sizes: Record<string, number>;
  /** Refuse the image data for every URL. */
  unreadable: boolean;
  /** What the search tab reports as the matching product page. */
  matchUrl: string | null;
  finalUrl: string;
  downloads: 'complete' | 'interrupted' | 'reject';
  createdTabs: number;
  removedTabs: number;
  filenames: string[];
  urls: string[];
}

function installChrome(overrides: Partial<FakeChrome> = {}): FakeChrome {
  const fake: FakeChrome = {
    gallery: [
      'https://www.makito.eu/4212-large_default/cable.jpg',
      'https://www.makito.eu/4213-large_default/soporte.jpg',
    ],
    sizes: {},
    unreadable: false,
    matchUrl: 'https://www.makito.eu/es/adorno-navidad-kyper.html',
    finalUrl: 'https://www.makito.eu/es/cable-cargador-soporte-zynix.html',
    downloads: 'complete',
    createdTabs: 0,
    removedTabs: 0,
    filenames: [],
    urls: [],
    ...overrides,
  };

  let nextId = 100;
  const listeners = new Set<(delta: unknown) => void>();

  (globalThis as any).chrome = {
    tabs: {
      create: async () => {
        fake.createdTabs += 1;
        return { id: 7 };
      },
      get: async () => ({ id: 7, url: fake.finalUrl, status: 'complete' }),
      remove: async () => {
        fake.removedTabs += 1;
      },
      onUpdated: { addListener() {}, removeListener() {} },
      onRemoved: { addListener() {}, removeListener() {} },
    },
    scripting: {
      // The gallery reader and the image reader are separate injections, so the
      // stub dispatches on the injected function's name.
      executeScript: async ({ func, args }: { func?: { name?: string }; args?: unknown[] }) => {
        if (func?.name === 'readImages') {
          const urls = (args?.[0] as string[] | undefined) ?? [];
          const wantBytes = Boolean(args?.[1]);
          return [
            {
              result: urls.map((url) => {
                if (fake.unreadable) return { url, width: 0, height: 0, error: 'HTTP 403' };
                const width = fake.sizes[url] ?? 1080;
                return {
                  url,
                  width,
                  height: width,
                  base64: wantBytes ? 'AAAA' : undefined,
                };
              }),
            },
          ];
        }
        if (func?.name === 'matchReference') return [{ result: fake.matchUrl }];
        return [{ result: fake.gallery }];
      },
    },
    downloads: {
      download: async ({ url, filename }: { url: string; filename: string }) => {
        if (fake.downloads === 'reject') throw new Error('Invalid URL');
        fake.urls.push(url);
        fake.filenames.push(filename);
        return nextId++;
      },
      search: async ({ id }: { id: number }) =>
        [{ id, state: fake.downloads === 'interrupted' ? 'interrupted' : 'complete' }],
      onChanged: {
        addListener: (fn: (delta: unknown) => void) => listeners.add(fn),
        removeListener: (fn: (delta: unknown) => void) => listeners.delete(fn),
      },
    },
  };

  return fake;
}

const CATALOG = 'https://www.makito.eu/es/cable-cargador-soporte-zynix.html';

// --- helpers ---------------------------------------------------------------

test('isMakitoUrl accepts the approved hosts over https only', () => {
  assert.equal(isMakitoUrl(CATALOG), true);
  assert.equal(isMakitoUrl('https://makito.es/es/x.html'), true);
  assert.equal(isMakitoUrl('http://www.makito.eu/es/x.html'), false);
  assert.equal(isMakitoUrl('https://makito.evil.example/es/x.html'), false);
  assert.equal(isMakitoUrl('not a url'), false);
});

test('galleryImageSources keeps order, absolutises and drops non-https', () => {
  const found = galleryImageSources(
    [
      '/img/a.jpg',
      'http://insecure.example/b.jpg',
      'https://cdn.example/c.jpg',
      '/img/a.jpg',
    ],
    'https://www.makito.eu/es/product.html',
  );
  assert.deepEqual(found, [
    'https://www.makito.eu/img/a.jpg',
    'https://cdn.example/c.jpg',
  ]);
});

test('galleryImageSources collapses the same photo served at several sizes', () => {
  const found = galleryImageSources(
    [
      'https://www.makito.eu/4212-thickbox_default/cable.jpg',
      'https://www.makito.eu/4212-large_default/cable.jpg',
      'https://www.makito.eu/4212-home_default/cable.jpg',
      'https://www.makito.eu/4213-large_default/soporte.jpg',
    ],
    undefined,
  );
  // One file per photo, and the largest variant (first) wins.
  assert.deepEqual(found, [
    'https://www.makito.eu/4212-thickbox_default/cable.jpg',
    'https://www.makito.eu/4213-large_default/soporte.jpg',
  ]);
});

test('makitoImageFilename is ordered, namespaced and free of size tokens', () => {
  assert.equal(
    makitoImageFilename('https://www.makito.eu/4212-large_default/cable.jpg', 0, 'M22477'),
    '01-M22477-cable.jpg',
  );
  assert.equal(
    makitoImageFilename('https://www.makito.eu/x/4213-home_default/soporte zynix.webp', 11, 'M22477'),
    '12-M22477-soporte-zynix.webp',
  );
  // Unknown extensions fall back to .jpg rather than producing a name Chrome
  // would refuse, and the index is zero padded for stable folder ordering.
  assert.equal(makitoImageFilename(CATALOG, 2, 'M22477'), '03-M22477-cable-cargador-soporte-zynix.jpg');
});

// --- orchestration ---------------------------------------------------------

test('refuses a SKU that does not belong to Makito', async () => {
  installChrome();
  await assert.rejects(
    () => downloadMakitoCarouselImages('R0317C', CATALOG),
    /only supports Makito/,
  );
});

test('refuses a catalogue URL outside the approved Makito domains', async () => {
  installChrome();
  await assert.rejects(
    () => downloadMakitoCarouselImages('M22477', 'https://example.com/p/cable.html'),
    /confirmed HTTPS Makito product URL/,
  );
});

test('saves the gallery into Downloads/Makito/<SKU> and closes the tab', async () => {
  const fake = installChrome();
  const result = await downloadMakitoCarouselImages('m22477', CATALOG);

  assert.equal(result.total, 2);
  assert.equal(result.started, 2);
  assert.equal(result.saved, 2);
  assert.equal(result.folder, 'Makito/M22477');
  assert.deepEqual(result.failures, []);
  assert.equal(fake.createdTabs, 1);
  assert.equal(fake.removedTabs, 1, 'the supplier tab is always closed');
  assert.deepEqual(fake.filenames, [
    'Makito/M22477/01-M22477-cable.jpg',
    'Makito/M22477/02-M22477-soporte.jpg',
  ]);
});

test('reports a download Chrome refuses instead of claiming success', async () => {
  installChrome({ downloads: 'reject' });
  await assert.rejects(
    () => downloadMakitoCarouselImages('M22477', CATALOG),
    /did not start any image downloads/,
  );
});

test('reports blocked downloads as failures, not as saved images', async () => {
  const fake = installChrome({ downloads: 'interrupted' });
  const result = await downloadMakitoCarouselImages('M22477', CATALOG);

  assert.equal(result.started, 2);
  assert.equal(result.saved, 0);
  assert.equal(result.failures.length, 2);
  assert.equal(result.failures[0]?.url, fake.urls[0]);
  assert.match(result.failures[0]?.error ?? '', /interrupted/);
});

test('abandons the tab when the page redirects off Makito', async () => {
  const fake = installChrome({ finalUrl: 'https://example.com/blocked' });
  await assert.rejects(
    () => downloadMakitoCarouselImages('M22477', CATALOG),
    /redirected outside/,
  );
  assert.equal(fake.removedTabs, 1);
  assert.equal(fake.filenames.length, 0);
});

test('abandons the tab when the page has no gallery', async () => {
  const fake = installChrome({ gallery: [] });
  await assert.rejects(
    () => downloadMakitoCarouselImages('M22477', CATALOG),
    /No product-gallery images were found/,
  );
  assert.equal(fake.removedTabs, 1);
});

test('galleryImageSources collapses Magento cache variants to the original file', () => {
  const found = galleryImageSources([
    'https://www.makito.eu/media/catalog/product/cache/a6cdd0282c0697af0ca09bbb5198c058/2/2/22482-W.jpg',
    'https://www.makito.eu/media/catalog/product/cache/9780710a4712efb301092e8c5fb583b9/2/2/22482-W.jpg',
    'https://www.makito.eu/media/catalog/product/2/2/22482-d1.jpg',
  ]);
  // One entry per photo, and the URL is the original - not a resized cache copy.
  assert.deepEqual(found, [
    'https://www.makito.eu/media/catalog/product/2/2/22482-W.jpg',
    'https://www.makito.eu/media/catalog/product/2/2/22482-d1.jpg',
  ]);
});

test('makitoImageFilename names the original, not the cache path', () => {
  assert.equal(
    makitoImageFilename(
      'https://www.makito.eu/media/catalog/product/cache/a6cdd0282c0697af0ca09bbb5198c058/2/2/22482-W.jpg',
      0,
      'M22482',
    ),
    '01-M22482-22482-W.jpg',
  );
});

test('drops the thumbnail preview and keeps the photos', async () => {
  const preview = 'https://www.makito.eu/media/catalog/product/2/2/22482_250.gif';
  const photo = 'https://www.makito.eu/media/catalog/product/cache/a6cdd0/2/2/22482-W.jpg';
  const fake = installChrome({
    gallery: [preview, photo],
    sizes: {
      'https://www.makito.eu/media/catalog/product/2/2/22482_250.gif': 90,
      'https://www.makito.eu/media/catalog/product/2/2/22482-W.jpg': 1080,
    },
  });

  const result = await downloadMakitoCarouselImages('M22482', CATALOG);

  assert.equal(result.total, 1, 'the 90px preview is not a gallery photo');
  assert.equal(fake.urls.length, 1);
  assert.match(fake.urls[0] ?? '', /22482-W\.jpg$/);
});

test('reports the page refusing the image data instead of an empty success', async () => {
  installChrome({ unreadable: true });
  await assert.rejects(
    () => downloadMakitoCarouselImages('M22477', CATALOG),
    /refused to hand over the image data \(HTTP 403\)/,
  );
});

test('collectMakitoGallery returns bytes for the evidence folder', async () => {
  installChrome();
  const gallery = await collectMakitoGallery('M22477', CATALOG, { withBytes: true });

  assert.equal(gallery.total, 2);
  assert.equal(gallery.files[0]?.base64, 'AAAA');
  assert.equal(gallery.files[0]?.width, 1080);
});

// --- finding the product page ----------------------------------------------

test('the shop reference is the SKU without the supplier prefix', () => {
  assert.equal(makitoReference('M22482'), '22482');
  assert.equal(makitoReference(' m4624 '), '4624');
  assert.equal(makitoReference('M-22482'), '22482');
  assert.equal(makitoReference('M12'), null, 'too short to be a reference');
});

test('the search URL carries the reference, not our SKU', () => {
  assert.equal(
    makitoSearchUrl('22482'),
    'https://www.makito.eu/es/catalogsearch/result/?q=22482',
  );
});

test('accepts the product page the shop redirects to', async () => {
  const fake = installChrome();
  const match = await findMakitoProductUrl('M22482');

  assert.deepEqual(match, {
    url: 'https://www.makito.eu/es/adorno-navidad-kyper.html',
    reference: '22482',
  });
  assert.equal(fake.createdTabs, 1);
  assert.equal(fake.removedTabs, 1, 'the search tab is always closed');
});

test('reports no match instead of guessing a product page', async () => {
  const fake = installChrome({ matchUrl: null });
  assert.equal(await findMakitoProductUrl('M99999'), null);
  assert.equal(fake.removedTabs, 1);
});

test('refuses to search for another supplier\'s SKU', async () => {
  installChrome();
  await assert.rejects(() => findMakitoProductUrl('R0317C'), /only available for Makito/);
});
