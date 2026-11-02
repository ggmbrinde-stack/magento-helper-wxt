import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  downloadMakitoCarouselImages,
  galleryImageSources,
  isMakitoUrl,
  makitoImageFilename,
} from '../makitoImages';

// --- chrome stub -----------------------------------------------------------
// The downloader only talks to tabs/scripting/downloads, so the whole flow can
// be exercised without a browser.

interface FakeChrome {
  gallery: string[];
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
      executeScript: async () => [{ result: fake.gallery }],
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
