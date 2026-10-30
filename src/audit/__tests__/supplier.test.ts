import { test } from 'node:test';
import assert from 'node:assert/strict';

import { supplierFor } from '../../shared/resolver';
import {
  supplierLinkFor,
  type CatalogSource,
} from '../supplierLinks';
import { SUPPLIER_CATALOG } from '../rules/supplierCatalog';
import {
  checkSkuAvailability,
  missesEscalate,
  isFresh,
  loadAvailability,
  saveAvailability,
  runAvailabilitySweep,
  type AvailabilityCheck,
} from '../supplierAvailability';

// In-memory chrome.storage.local for the sitemap + availability cache.
const memStore = new Map<string, unknown>();
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (keys: string[]) => {
        const out: Record<string, unknown> = {};
        for (const key of keys) {
          if (memStore.has(key)) out[key] = memStore.get(key);
        }
        return out;
      },
      set: async (obj: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(obj)) memStore.set(k, v);
      },
    },
  },
};

function response(status: number, body = '', finalUrl?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: finalUrl ?? 'https://example.test/final',
    text: async () => body,
  };
}

function fetchFrom(map: Record<string, { status: number; body?: string; finalUrl?: string }>) {
  return async (url: string) => {
    const hit = map[url];
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    return response(hit.status, hit.body ?? '', hit.finalUrl ?? url);
  };
}

const NOW = new Date('2026-01-10T12:00:00.000Z');

// --- attribution ---

test('supplierFor: known prefixes', () => {
  assert.equal(supplierFor('TTFL9293'), 'TOPTEX');
  assert.equal(supplierFor('AB1234'), 'ALLBEST');
  assert.equal(supplierFor('M22477'), 'MAKITO');
  assert.equal(supplierFor('MK22477'), 'MAKITO');
  assert.equal(supplierFor('M4624'), 'MAKITO');
  assert.equal(supplierFor('R0317C'), 'ROLY');
});

test('supplierFor: normalization and boundary cases', () => {
  assert.equal(supplierFor('  m22477 '), 'MAKITO');
  assert.equal(supplierFor('m22477'), 'MAKITO');
  // MO is Midocean, not Makito
  assert.equal(supplierFor('MO12345'), 'ROLY');
  // only exactly 5 digits after M/MK
  assert.equal(supplierFor('M1234'), 'ROLY');
  assert.equal(supplierFor('M123456'), 'ROLY');
  assert.equal(supplierFor('MK1234'), 'ROLY');
  // whitespace inside is not collapsed (no silent normalization beyond trim)
  assert.equal(supplierFor('M 22477'), 'ROLY');
});

// --- links ---

test('supplierLinkFor: precedence notion > map > guessed', () => {
  const notionUrl = 'https://example.test/notion-product';
  const info = supplierLinkFor('R0317C', { catalogUrl: notionUrl });
  assert.equal(info.catalog, notionUrl);
  assert.equal(info.catalogSource, 'notion');
});

test('supplierLinkFor: guessed is labelled guessed, never confirmed', () => {
  const info = supplierLinkFor('R0317C');
  assert.equal(info.supplier, 'ROLY');
  if (info.catalog) {
    assert.equal(info.catalogSource, 'guessed');
    assert.ok(info.reviewFlags.includes('catalog-url-guessed'));
  }
});

test('supplierLinkFor: TOPTEX without URL stays unresolved (no invented catalogue URL)', () => {
  const info = supplierLinkFor('TT9999');
  assert.equal(info.supplier, 'TOPTEX');
  assert.equal(info.catalog, '');
  assert.equal(info.catalogSource, 'none');
  assert.ok(info.reviewFlags.includes('catalog-url-missing'));
});

test('supplierLinkFor: ALLBEST is internal-only', () => {
  const info = supplierLinkFor('AB1234');
  assert.equal(info.internalOnly, true);
  assert.equal(info.catalog, '');
});

// --- availability helpers ---

test('missesEscalate: one miss does not escalate', () => {
  const now = NOW.getTime();
  const one = [new Date(now).toISOString()];
  assert.equal(missesEscalate(one, now), false);
});

test('missesEscalate: two misses 7 days apart escalate', () => {
  const now = NOW.getTime();
  const first = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
  const second = new Date(now).toISOString();
  assert.equal(missesEscalate([first, second], now), true);
});

test('missesEscalate: two misses within 7 days do not escalate', () => {
  const now = NOW.getTime();
  const first = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const second = new Date(now).toISOString();
  assert.equal(missesEscalate([first, second], now), false);
});

test('isFresh: TTL buckets', () => {
  const now = NOW.getTime();
  const freshAvailable: AvailabilityCheck = {
    sku: 'X',
    verdict: 'available',
    urlSource: 'map',
    tried: [],
    misses: [],
    review: [],
    anomalies: [],
    checkedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
  };
  assert.equal(isFresh(freshAvailable, now), true);
  const staleAvailable = { ...freshAvailable, checkedAt: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString() };
  assert.equal(isFresh(staleAvailable, now), false);
});

// --- availability verdicts ---

test('checkSkuAvailability: valid 200 product (confirmed URL) -> available', async () => {
  const url = 'https://toptex.eu/p';
  const fetchImpl: any = fetchFrom({ [url]: { status: 200, body: '<title>Product</title>' } });
  const check = await checkSkuAvailability('TT1234', {
    catalogUrl: url,
    fetchImpl,
    now: NOW,
  });
  assert.equal(check.verdict, 'available');
  assert.equal(check.url, url);
});

test('checkSkuAvailability: redirect 200 counts as available', async () => {
  const url = 'https://toptex.eu/p';
  const fetchImpl: any = fetchFrom({ [url]: { status: 200, body: '<title>Product</title>', finalUrl: 'https://toptex.eu/other' } });
  const check = await checkSkuAvailability('TT1234', {
    catalogUrl: url,
    fetchImpl,
    now: NOW,
  });
  assert.equal(check.verdict, 'available');
});

test('checkSkuAvailability: single 404 -> not-found', async () => {
  const url = 'https://toptex.eu/p';
  const fetchImpl: any = fetchFrom({ [url]: { status: 404, body: '<title>404</title>' } });
  const check = await checkSkuAvailability('TT1234', {
    catalogUrl: url,
    fetchImpl,
    now: NOW,
  });
  assert.equal(check.verdict, 'not-found');
  assert.equal(check.misses.length, 1);
});

test('checkSkuAvailability: two 404s 7 days apart -> discontinued-candidate', async () => {
  const url = 'https://toptex.eu/p';
  const fetchImpl: any = fetchFrom({ [url]: { status: 404, body: '<title>404</title>' } });
  const prior = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const check = await checkSkuAvailability('TT1234', {
    catalogUrl: url,
    priorMisses: [prior],
    fetchImpl,
    now: NOW,
  });
  assert.equal(check.verdict, 'discontinued-candidate');
  assert.equal(check.misses.length, 2);
});

test('checkSkuAvailability: 403/429/5xx/network are not unavailability', async () => {
  const url = 'https://toptex.eu/p';
  for (const status of [403, 429, 500, 503]) {
    const fetchImpl: any = fetchFrom({ [url]: { status, body: 'err' } });
    const check = await checkSkuAvailability('TT1234', { catalogUrl: url, fetchImpl, now: NOW });
    assert.notEqual(check.verdict, 'not-found');
    assert.notEqual(check.verdict, 'discontinued-candidate');
    assert.equal(check.verdict, 'fetch-error');
  }
  // network error
  const netFetch = (async () => { throw new Error('network down'); }) as any;
  const check = await checkSkuAvailability('TT1234', { catalogUrl: url, fetchImpl: netFetch, now: NOW });
  assert.equal(check.verdict, 'fetch-error');
});

test('checkSkuAvailability: MAKITO stays unresolved', async () => {
  const check = await checkSkuAvailability('M22477', { now: NOW });
  assert.equal(check.verdict, 'unresolved');
});

test('checkSkuAvailability: ALLBEST stays internal-only', async () => {
  const check = await checkSkuAvailability('AB1234', { now: NOW });
  assert.equal(check.verdict, 'internal-only');
});

test('checkSkuAvailability: TOPTEX without URL stays unresolved', async () => {
  const check = await checkSkuAvailability('TT9999', { now: NOW });
  assert.equal(check.verdict, 'unresolved');
});

test('checkSkuAvailability: ROLY guessed without sitemap match stays unresolved (not false-positive 200)', async () => {
  memStore.clear();
  // sitemap with no matching ref
  const sitemapXml = '<?xml version="1.0"?><urlset><url><loc>https://roly.eu/es/model_PO9999</loc></url></urlset>';
  const fetchImpl: any = async (url: any) => {
    if (url.includes('sitemap_roly_es.xml')) return response(200, sitemapXml, url);
    // any product URL would 200 but must not be trusted
    return response(200, '<title>PO0317 | Roly</title>', url);
  };
  const check = await checkSkuAvailability('R0317C', { fetchImpl, now: NOW });
  assert.notEqual(check.verdict, 'available');
  assert.equal(check.verdict, 'unresolved');
});

test('checkSkuAvailability: ROLY guessed with sitemap match -> available', async () => {
  memStore.clear();
  const sitemapXml = '<?xml version="1.0"?><urlset><url><loc>https://roly.eu/es/model_PO0317</loc></url></urlset>';
  const fetchImpl: any = async (url: any) => {
    if (url.includes('sitemap_roly_es.xml')) return response(200, sitemapXml, url);
    return response(200, '<title>x</title>', url);
  };
  const check = await checkSkuAvailability('R0317C', { fetchImpl, now: NOW });
  assert.equal(check.verdict, 'available');
  assert.ok((check.url ?? '').includes('model_PO0317'));
});

test('checkSkuAvailability: ROLY confirmed 404 records miss', async () => {
  const url = 'https://roly.pt/model_PO0317';
  const prior = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const fetchImpl: any = fetchFrom({ [url]: { status: 404, body: '<title>404</title>' } });
  const check = await checkSkuAvailability('R0317C', {
    catalogUrl: url,
    priorMisses: [prior],
    fetchImpl,
    now: NOW,
  });
  assert.equal(check.verdict, 'discontinued-candidate');
});

// --- cache freshness / sweep ---

test('runAvailabilitySweep: skips fresh cached results', async () => {
  memStore.clear();
  SUPPLIER_CATALOG['TT1234'] = 'https://toptex.eu/p';
  const url = 'https://toptex.eu/p';
  const fetchImpl: any = fetchFrom({ [url]: { status: 200, body: '<title>Product</title>' } });
  const now = new Date();
  const first = await checkSkuAvailability('TT1234', { catalogUrl: url, fetchImpl, now });
  await saveAvailability([first]);

  let called = false;
  const countingFetch: any = async (u: string) => { called = true; return (fetchFrom({ [url]: { status: 200, body: '<title>Product</title>' } }))(u); };
  const results = await runAvailabilitySweep(['TT1234'], { fetchImpl: countingFetch });
  assert.equal(called, false);
  assert.equal(results[0]!.verdict, 'available');
  delete SUPPLIER_CATALOG['TT1234'];
});

test('runAvailabilitySweep: force re-runs', async () => {
  memStore.clear();
  SUPPLIER_CATALOG['TT1234'] = 'https://toptex.eu/p';
  const url = 'https://toptex.eu/p';
  const fetchImpl: any = fetchFrom({ [url]: { status: 200, body: '<title>Product</title>' } });
  const now = new Date();
  const first = await checkSkuAvailability('TT1234', { catalogUrl: url, fetchImpl, now });
  await saveAvailability([first]);

  let called = false;
  const countingFetch: any = async (u: string) => { called = true; return (fetchFrom({ [url]: { status: 200, body: '<title>Product</title>' } }))(u); };
  const results = await runAvailabilitySweep(['TT1234'], { force: true, fetchImpl: countingFetch });
  assert.equal(called, true);
  assert.equal(results[0]!.verdict, 'available');
  delete SUPPLIER_CATALOG['TT1234'];
});

