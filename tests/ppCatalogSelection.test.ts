import test from 'node:test';
import assert from 'node:assert/strict';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
// @ts-expect-error - untyped transitive dependency
import { JSDOM } from 'jsdom';
import { PpPreview } from '../src/dashboard/sections/ui/PpPreview';
import { catalogProblems, loadPpIndex } from '../src/dashboard/sections/ui/ppPreviewModel';
import { handleAuditMessage } from '../src/entrypoints/background/routers/audit';
import type { PpCatalogIndexRow, PpCatalogResponse } from '../src/shared/ppCatalog';
import type { PpFreshFormResponse } from '../src/core/messages';

const row = (n: number, code = String(n)): PpCatalogIndexRow => ({ pageId: '00000000-0000-0000-0000-' + String(n).padStart(12, '0'), code, name: 'PP ' + n, reviewStatus: 'A rever' });
const page = (rows: PpCatalogIndexRow[], next: string | null = null) => ({ status: 'page', rows, hasMore: !!next, nextCursor: next, checkedAt: '2026-11-16T10:00:00Z', reason: 'Summary page' });
const desired = (record = row(1, ' 0049 ')): PpCatalogResponse => ({ status: 'found', code: record.code!, checkedAt: '2026-11-16T10:00:00Z', reason: 'Reference read',
  definition: { pageId: record.pageId!, code: record.code!, name: '<img src=x onerror=alert(1)>', reviewStatus: 'A rever', faces: ['Face 1'],
    options: ['Laser'], techniques: null, faceCount: null, locationCount: 6, body: ['No established assignments'], warnings: ['Global lists do not establish per-location assignments'], lastEditedAt: null } });
const fresh = (requestId: string, entityId = '966'): PpFreshFormResponse => ({ source: 'fresh-magento-form-load', requestId, entityId, status: 'partial',
  cleanup: 'closed', reason: 'Fresh form loaded', host: 'bestofgifts.pt', readAt: 1_900_000_000_000,
  snapshot: { version: 1, status: 'partial', entityId, providerEntityId: entityId, providerAttributeSetId: '479', generalAttributeSetId: ['479'],
    routePath: '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/' + entityId,
    scannedAt: 1_900_000_000_000, general: { option_title: 'Fresh native title', sort_order: '', price: 0 },
    locations: { state: 'available', rows: [], skippedPositions: [], identifierGaps: 0, truncated: false },
    items: { state: 'missing', rows: [], skippedPositions: [], identifierGaps: 0, truncated: false }, warnings: ['Item collection missing'] } });

const cancelled = (requestId: string, failed = false): PpFreshFormResponse => ({ source: 'fresh-magento-form-load', requestId,
  entityId: '966', status: failed ? 'cleanup-failed' : 'cancelled', cleanup: failed ? 'failed' : 'closed',
  reason: failed ? 'Helper could not close' : 'Helper closed', ...(failed ? { leftoverTabId: 77 } : {}) });

test('index loads pages sequentially, preserves exact identities and certifies coverage only at exhaustion', async () => {
  const calls: (string | undefined)[] = [], progress: number[] = [];
  const result = await loadPpIndex(async cursor => { calls.push(cursor); return cursor ? page([row(2, '0049')]) : page([row(1, ' 0049 ')], 'next'); }, rows => progress.push(rows.length), () => false);
  assert.deepEqual(calls, [undefined, 'next']); assert.deepEqual(progress, [1, 2]); assert.equal(result.coverage, 'complete');
  assert.deepEqual(result.rows.map(r => r.code), [' 0049 ', '0049']); assert.deepEqual(catalogProblems(result.rows), [null, null]);
});

test('duplicate codes and missing/null/invalid identities remain explicit without aliases', () => {
  const rows = [row(1, '49'), row(2, '49'), row(3, '0049'), { ...row(4), code: null }, { ...row(5), pageId: null },
    { ...row(6), name: null }, row(7, ' '), row(8, 'x'.repeat(129))];
  assert.deepEqual(catalogProblems(rows), ['Duplicate exact business code', 'Duplicate exact business code', null,
    'Missing business code', 'Missing or invalid Notion page ID', 'Unreadable title', 'Missing business code', 'Unsupported business code length']);
});

for (const scenario of ['cursor-missing', 'cursor-repeated', 'id-repeated', 'malformed', 'auth', 'network']) {
  test('index incomplete state: ' + scenario, async () => {
    let calls = 0;
    const result = await loadPpIndex(async () => {
      calls++;
      if (scenario === 'malformed') return {};
      if (scenario === 'auth') return { ...page([]), status: 'auth', reason: 'Authentication required' };
      if (scenario === 'network' && calls > 1) throw new Error('PRIVATE');
      if (scenario === 'cursor-missing') return { ...page([row(1)]), hasMore: true };
      return page([row(scenario === 'id-repeated' ? 1 : calls)], 'same-cursor');
    }, () => {}, () => false);
    assert.notEqual(result.coverage, 'complete'); assert.ok(calls <= 2); assert.doesNotMatch(result.reason, /PRIVATE/);
    if (scenario === 'network') assert.equal(result.rows.length, 1);
  });
}

test('cancellation stops page scheduling and ignores the in-flight page result', async () => {
  let stopped = false, calls = 0;
  const result = await loadPpIndex(async () => { calls++; stopped = true; return page([row(1)], 'next'); }, () => assert.fail('late progress'), () => stopped);
  assert.equal(result.coverage, 'cancelled'); assert.equal(calls, 1); assert.deepEqual(result.rows, []);
  stopped = false; calls = 0;
  const kept = await loadPpIndex(async () => { calls++; return page([row(1)], 'next'); }, () => { stopped = true; }, () => stopped);
  assert.equal(kept.coverage, 'cancelled'); assert.equal(kept.rows.length, 1); assert.equal(calls, 1);
});

test('page and wall-clock coverage caps are explicit partial results', async t => {
  let calls = 0;
  const capped = await loadPpIndex(async () => page([row(++calls)], 'cursor-' + calls), () => {}, () => false);
  assert.equal(calls, 50); assert.equal(capped.coverage, 'partial'); assert.match(capped.reason, /50 pages/);
  t.mock.timers.enable({ apis: ['Date'], now: 1_900_000_000_000 });
  const timed = await loadPpIndex(async () => { t.mock.timers.tick(60_001); return page([row(1)]); }, () => assert.fail('expired result'), () => false);
  assert.equal(timed.coverage, 'partial'); assert.match(timed.reason, /time limit/); assert.equal(timed.rows.length, 0);
});

test('index request requires the exact extension dashboard sender', async () => {
  const globals = globalThis as any, old = globals.chrome;
  let storageCalls = 0;
  globals.chrome = { runtime: { getURL: () => 'chrome-extension://fixture/dashboard.html' }, storage: { local: { get: async () => { storageCalls++; return {}; } } } };
  try {
    for (const senderUrl of ['https://bestofgifts.pt/admin/', 'chrome-extension://other/dashboard.html', 'chrome-extension://fixture/sidepanel.html']) {
      const response: any = await new Promise(resolve => handleAuditMessage({ type: 'FETCH_PP_CATALOG_INDEX_PAGE' }, { senderUrl, sendResponse: resolve }));
      assert.equal(response.status, 'unavailable');
    }
    assert.equal(storageCalls, 0);
    const response: any = await new Promise(resolve => handleAuditMessage({ type: 'FETCH_PP_CATALOG_INDEX_PAGE' }, { senderUrl: 'chrome-extension://fixture/dashboard.html#/ppPreview', senderFrameId: 0, sendResponse: resolve }));
    assert.equal(response.status, 'auth'); assert.equal(storageCalls, 1);
  } finally { globals.chrome = old; }
});

function fixture(connectionResult?: any) {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'chrome-extension://fixture/dashboard.html#/ppPreview' });
  const globals = globalThis as any, previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ['window', 'document', 'Event', 'HTMLElement']) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] }); }
  const oldChrome = globals.chrome;
  const pending: { message: any; resolve: (value: any) => void; reject: (reason: Error) => void }[] = [], messages: any[] = [];
  globals.chrome = { runtime: { sendMessage: (message: any) => {
    messages.push(message);
    if (message.type === 'GET_PP_FRESH_FORM_STATE') return Promise.resolve({ status: 'idle' });
    if (message.type === 'CHECK_PP_CONNECTION' && connectionResult !== 'pending') return Promise.resolve(connectionResult ?? { status: 'ready', reason: 'Connection ready', tabs: [{ tabId: 88, selectionToken: 'a'.repeat(64), host: 'bestofgifts.pt', kind: message.referenceSource === 'options-grid' ? 'options-grid' : 'edit', loading: false }] });
    return new Promise((resolve, reject) => pending.push({ message, resolve, reject }));
  } } };
  const root = document.getElementById('app')!;
  act(() => render(h(PpPreview, {}), root));
  const button = (text: string) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === text)!;
  const click = (text: string) => act(() => button(text).click());
  const resolve = async (type: string, value: any, occurrence = 0) => { const item = pending.filter(p => p.message.type === type)[occurrence]!;
    assert.ok(item, type); await act(async () => { item.resolve(value); for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
  const reject = async (type: string, occurrence = 0) => { const item = pending.filter(p => p.message.type === type)[occurrence]!;
    assert.ok(item, type); await act(async () => { item.reject(new Error('Synthetic rejected request')); for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
  const field = (name: string) => Array.from(root.querySelectorAll('label')).find(label => label.textContent!.startsWith(name))!.querySelector<HTMLInputElement | HTMLSelectElement>('input,select')!;
  const change = (name: string, value: string) => act(() => { const control = field(name); control.value = value; control.dispatchEvent(new dom.window.Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  const checkRow = (n: number) => act(() => root.querySelectorAll<HTMLInputElement>('table input[type="checkbox"]')[n]!.click());
  const pair = () => act(() => root.querySelector<HTMLInputElement>('input[type="checkbox"]:not([aria-label])')!.click());
  const connect = async () => { await act(async () => { button('Check Magento connection').click(); for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
  const prepare = async () => { click('Load PP catalogue'); await resolve('FETCH_PP_CATALOG_INDEX_PAGE', page([row(1, ' 0049 '), row(2, '50')])); checkRow(0); checkRow(1);
    change('Selected Notion record', row(1).pageId!); change('Exact Magento custom-option entity ID', '966'); await connect(); pair(); };
  const noWrites = () => assert.equal(messages.some(message => message.type === 'APPLY_PP_PLAN' || message.type === 'SAVE_PP_FORM'), false);
  const previewDisabled = () => root.querySelector<HTMLButtonElement>('button[aria-busy]')!.disabled;
  return { root, pending, messages, click, button, resolve, reject, noWrites, previewDisabled, change, checkRow, pair, prepare, connect,
    unmount: () => act(() => render(null, root)),
    close: () => { act(() => render(null, root)); globals.chrome = oldChrome; dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } } };
}

test('multi-selection preserves exact identities during parallel reads and rendering remains read-only/text-safe', async () => {
  const f = fixture();
  try {
    assert.equal(f.pending.length, 0); assert.equal(f.previewDisabled(), true);
    assert.match(f.root.textContent!, /Keep one Options Grid open/);
    assert.doesNotMatch(f.root.textContent!, /No existing Magento edit tab is needed/);
    await f.prepare(); assert.match(f.root.textContent!, /2 selected/);
    f.change('Search loaded codes or titles', '50'); assert.match(f.root.textContent!, /2 selected · 1 match\(es\) · 1 visible/);
    f.change('Search loaded codes or titles', ''); assert.equal(f.root.querySelectorAll('table input:checked').length, 2);
    f.click('Preview selected PP');
    assert.deepEqual(f.pending.find(p => p.message.type === 'FETCH_PP_PREVIEW_CATALOG')!.message, { type: 'FETCH_PP_PREVIEW_CATALOG', code: ' 0049 ' });
    assert.equal(f.pending.filter(p => p.message.type === 'READ_PP_FRESH_FORM').length, 1, 'Magento starts in parallel with Notion');
    assert.doesNotMatch(f.root.textContent!, /Fresh native title/);
    await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    assert.equal(request.entityId, '966'); assert.equal('tabId' in request, false);
    assert.equal(request.referenceSource, 'options-grid');
    await f.resolve('READ_PP_FRESH_FORM', fresh(request.requestId));
    assert.match(f.root.textContent!, /Fresh Magento form load, not a certified saved-server snapshot/);
    assert.match(f.root.textContent!, /Fresh native title/); assert.match(f.root.textContent!, /A rever/);
    assert.match(f.root.textContent!, /Magento fresh form/); assert.match(f.root.textContent!, /<img src=x onerror=alert\(1\)>/);
    assert.match(f.root.textContent!, /Notion PP Catalog V2 \(global lists\)/); assert.equal(f.root.querySelector('img'), null);
    assert.equal(f.root.querySelector('img'), null); assert.match(f.root.textContent!, /<img src=x/);
    assert.ok(Array.from(f.root.querySelectorAll('button')).every(b => b.type === 'button'));
    f.noWrites();
    assert.ok(f.messages.every(m => !['LIST_PP_PREVIEW_TABS', 'READ_PP_PREVIEW_DRAFT'].includes(m.type)));
    assert.doesNotMatch(f.root.innerHTML, /PRIVATE|form_key|\/key\//);
  } finally { f.close(); }
});

test('duplicate/missing catalogue rows are blocked; new loads clear selections and discard older pages', async () => {
  const f = fixture();
  try {
    f.click('Load PP catalogue'); f.click('Stop catalogue load'); f.click('Load PP catalogue');
    await f.resolve('FETCH_PP_CATALOG_INDEX_PAGE', page([row(2, 'dup'), row(3, 'dup'), { ...row(4), code: null }]), 1);
    await f.resolve('FETCH_PP_CATALOG_INDEX_PAGE', page([row(1, 'OLD')]), 0);
    assert.doesNotMatch(f.root.textContent!, /OLD/); assert.match(f.root.textContent!, /Duplicate exact business code|Missing business code/);
    assert.ok(Array.from(f.root.querySelectorAll<HTMLInputElement>('table input')).every(input => input.disabled));
    f.click('Load PP catalogue'); await f.resolve('FETCH_PP_CATALOG_INDEX_PAGE', page([row(1)]), 2); f.checkRow(0);
    assert.match(f.root.textContent!, /1 selected/); f.click('Load PP catalogue'); assert.match(f.root.textContent!, /0 selected/);
  } finally { f.close(); }
});

for (const scenario of ['mismatch', 'multiple', 'rejected'] as const) {
test('abandoned parallel read cancels the same request and retains failed cleanup: ' + scenario, async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP');
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    if (scenario === 'rejected') await f.reject('FETCH_PP_PREVIEW_CATALOG');
    else {
      const wrong = desired(); wrong.definition!.pageId = row(2).pageId!;
      await f.resolve('FETCH_PP_PREVIEW_CATALOG', scenario === 'mismatch' ? wrong :
        { status: 'multiple', code: ' 0049 ', checkedAt: '2026-11-16', reason: 'Multiple exact matches' });
    }
    assert.deepEqual(f.pending.filter(p => p.message.type === 'CANCEL_PP_FRESH_FORM').map(p => p.message),
      [{ type: 'CANCEL_PP_FRESH_FORM', requestId: request.requestId }]);
    await f.resolve('CANCEL_PP_FRESH_FORM', cancelled(request.requestId, true));
    assert.match(f.root.textContent!, /Helper tab 77 could not be closed/);
    assert.equal(f.previewDisabled(), true);
    await f.resolve('READ_PP_FRESH_FORM', fresh(request.requestId));
    assert.match(f.root.textContent!, /Helper tab 77 could not be closed/);
    assert.doesNotMatch(f.root.textContent!, /Fresh native title|Show raw Magento snapshot/);
    assert.equal(f.previewDisabled(), true);
    assert.equal(f.pending.filter(p => p.message.type === 'READ_PP_FRESH_FORM').length, 1);
    f.noWrites();
    f.click('Stop preview / close helper tab');
    assert.equal(f.pending.filter(p => p.message.type === 'CANCEL_PP_FRESH_FORM')[1]!.message.requestId, request.requestId);
    await f.resolve('CANCEL_PP_FRESH_FORM', cancelled(request.requestId), 1);
    assert.doesNotMatch(f.root.textContent!, /Helper tab 77 could not be closed/);
  } finally { f.close(); }
});
}

test('a failed form cleanup remains visible when cancellation replies closed', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP');
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    await f.reject('FETCH_PP_PREVIEW_CATALOG');
    await f.resolve('READ_PP_FRESH_FORM', cancelled(request.requestId, true));
    await f.resolve('CANCEL_PP_FRESH_FORM', cancelled(request.requestId));
    assert.match(f.root.textContent!, /Helper tab 77 could not be closed/);
    assert.equal(f.previewDisabled(), true); f.noWrites();
  } finally { f.close(); }
});

test('a duplicate discovered on a later page clears the affected selection and active pairing', async () => {
  const f = fixture();
  try {
    f.click('Load PP catalogue'); await f.resolve('FETCH_PP_CATALOG_INDEX_PAGE', page([row(1, '49')], 'next'));
    f.checkRow(0); f.change('Selected Notion record', row(1).pageId!); f.change('Exact Magento custom-option entity ID', '966'); f.pair();
    assert.match(f.root.textContent!, /1 selected/);
    await f.resolve('FETCH_PP_CATALOG_INDEX_PAGE', page([row(2, '49')]), 1);
    assert.match(f.root.textContent!, /0 selected/); assert.match(f.root.textContent!, /Duplicate exact business code/);
    assert.equal(f.previewDisabled(), true);
    assert.equal(f.pending.some(p => p.message.type === 'FETCH_PP_PREVIEW_CATALOG'), false);
  } finally { f.close(); }
});

test('identity edits invalidate both sources, prevent overlapping previews, and retain cleanup failure even for stale reads', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP'); await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    f.change('Exact Magento custom-option entity ID', '967'); assert.equal(f.root.querySelector<HTMLButtonElement>('button[aria-busy]')!.disabled, true);
    assert.equal(f.pending.find(p => p.message.type === 'CANCEL_PP_FRESH_FORM')!.message.requestId, request.requestId);
    const failed = { ...fresh(request.requestId), status: 'cleanup-failed', cleanup: 'failed', leftoverTabId: 77, reason: 'Helper could not close' };
    await f.resolve('CANCEL_PP_FRESH_FORM', failed); await f.resolve('READ_PP_FRESH_FORM', failed);
    assert.match(f.root.textContent!, /Helper tab 77 could not be closed/); assert.doesNotMatch(f.root.textContent!, /Fresh native title/);
    assert.equal(f.previewDisabled(), true);
    f.click('Stop preview / close helper tab'); await f.resolve('CANCEL_PP_FRESH_FORM', { ...fresh(request.requestId), status: 'cancelled' }, 1);
    await f.connect(); f.pair(); assert.equal(f.previewDisabled(), false);
  } finally { f.close(); }
});

test('Stop settles both parallel replies before a new preview and ignores foreign cancellation identity', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP'); f.click('Stop preview / close helper tab');
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    assert.equal(f.pending.find(p => p.message.type === 'CANCEL_PP_FRESH_FORM')!.message.requestId, request.requestId);
    await f.resolve('READ_PP_FRESH_FORM', fresh(request.requestId));
    await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    assert.equal(f.previewDisabled(), true, 'the cancellation reply is still pending');
    assert.doesNotMatch(f.root.textContent!, /Fresh native title|Show raw Magento snapshot/);
    await f.resolve('CANCEL_PP_FRESH_FORM', cancelled(request.requestId));
    assert.equal(f.previewDisabled(), false);
    f.click('Preview selected PP');
    const next = f.pending.filter(p => p.message.type === 'READ_PP_FRESH_FORM')[1]!.message;
    assert.notEqual(next.requestId, request.requestId);
    f.click('Stop preview / close helper tab');
    assert.equal(f.pending.filter(p => p.message.type === 'CANCEL_PP_FRESH_FORM')[1]!.message.requestId, next.requestId);
    await f.resolve('CANCEL_PP_FRESH_FORM', cancelled(request.requestId, true), 1);
    assert.doesNotMatch(f.root.textContent!, /Helper tab 77 could not be closed/, 'foreign cleanup cannot replace current helper state');
    await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired(), 1);
    assert.equal(f.previewDisabled(), true, 'the second read is still pending');
    await f.resolve('READ_PP_FRESH_FORM', fresh(next.requestId), 1);
    assert.doesNotMatch(f.root.textContent!, /Fresh native title|Show raw Magento snapshot/); f.noWrites();
    assert.equal(f.pending.filter(p => p.message.type === 'CANCEL_PP_FRESH_FORM').length, 2);
  } finally { f.close(); }
});

test('unmount cancels the same parallel read and discards all late replies', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP');
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    f.unmount();
    assert.equal(f.pending.find(p => p.message.type === 'CANCEL_PP_FRESH_FORM')!.message.requestId, request.requestId);
    await f.resolve('CANCEL_PP_FRESH_FORM', cancelled(request.requestId, true));
    await f.resolve('READ_PP_FRESH_FORM', fresh(request.requestId));
    await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    assert.equal(f.root.textContent, ''); f.noWrites();
    assert.equal(f.pending.filter(p => p.message.type === 'CANCEL_PP_FRESH_FORM').length, 1);
  } finally { f.close(); }
});

test('a mismatched fresh-form snapshot is rejected without rendering either associated preview', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP'); await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    const response = fresh(request.requestId); response.snapshot!.providerEntityId = '49';
    await f.resolve('READ_PP_FRESH_FORM', response);
    assert.match(f.root.textContent!, /did not match the explicit target/);
    assert.doesNotMatch(f.root.textContent!, /Fresh native title|Desired: Notion/);
    await f.resolve('CANCEL_PP_FRESH_FORM', cancelled(request.requestId)); f.noWrites();
  } finally { f.close(); }
});

test('address source is explicit and switching to the exact-record reader clears the old pairing', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.change('Magento address source', 'exact-record');
    assert.equal(f.previewDisabled(), true); assert.match(f.root.textContent!, /2 selected/);
    assert.match(f.root.textContent!, /Only its native address is copied privately/);
    await f.connect(); f.pair(); f.click('Preview selected PP'); await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    assert.equal(request.referenceSource, 'exact-record');
    await f.resolve('READ_PP_FRESH_FORM', { ...fresh(request.requestId), reference: { kind: 'exact-record' } });
    assert.match(f.root.textContent!, /Address source: exact-record/);
  } finally { f.close(); }
});

test('grid failure and readiness checkpoints render safe diagnostics without a comparison or automatic source switch', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP'); await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    await f.resolve('READ_PP_FRESH_FORM', { source: 'fresh-magento-form-load', requestId: request.requestId, entityId: '966', status: 'unavailable', cleanup: 'closed',
      reason: 'No matching snapshot within the readiness budget', reference: { kind: 'options-grid', grid: { status: 'found', loadedRows: 20, totalRows: 20, page: 1, pageSize: 200, filtered: true, freshness: 'loaded-unverified' } },
      readiness: { checks: 60, extractions: 10, elapsedMs: 30000, lastScanStatus: 'unavailable', warningCodes: ['provider-unavailable'],
        last: { document: 'complete', stage: 'provider-unavailable', registry: 'available', provider: 'unavailable', data: 'unknown', identity: 'unknown', blockedAccessor: false } } });
    assert.match(f.root.textContent!, /Readiness checks: 60/); assert.match(f.root.textContent!, /Elapsed: 30.0s/);
    assert.match(f.root.textContent!, /provider-unavailable/); assert.match(f.root.textContent!, /Grid freshness and in-flight state are not verified/);
    assert.doesNotMatch(f.root.textContent!, /Fresh native title|Show raw Magento snapshot/);
    assert.match(f.root.textContent!, /No usable Magento snapshot\. Comparison blocked/);
    assert.equal(f.pending.filter(p => p.message.type === 'READ_PP_FRESH_FORM').length, 1);
    assert.equal((Array.from(f.root.querySelectorAll('label')).find(label => label.textContent!.startsWith('Magento address source'))!.querySelector('select')!).value, 'options-grid');
  } finally { f.close(); }
});


test('draft fallback requires an explicit tab and labels unsaved state throughout comparison', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.change('Magento address source', 'current-draft');
    await f.connect(); assert.equal(f.previewDisabled(), true);
    f.change('Detected source tab', '88'); await f.connect(); f.pair();
    f.click('Preview selected PP'); await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    assert.equal(request.referenceSource, 'current-draft'); assert.equal(request.selection.tabId, 88);
    const response = fresh(request.requestId);
    response.source = 'current-open-page-draft'; response.cleanup = 'not-created'; response.reason = 'Unsaved draft';
    response.reference = { kind: 'current-draft' }; response.snapshot!.general.option_title = 'Unsaved edit';
    await f.resolve('READ_PP_FRESH_FORM', response);
    assert.match(f.root.textContent!, /CURRENT OPEN-PAGE DRAFT/);
    assert.match(f.root.textContent!, /Unsaved edit/);
    assert.match(f.root.textContent!, /CURRENT OPEN-PAGE DRAFT includes unsaved edits, not a fresh load or saved-server snapshot/);
    assert.match(f.root.textContent!, /Magento current draft/);
    assert.doesNotMatch(f.root.textContent!, /Current: FRESH MAGENTO FORM LOAD|Not an existing user draft/);
    assert.ok(Array.from(f.root.querySelectorAll('details summary')).some(node => node.textContent === 'Show raw Magento snapshot'));
    f.change('Magento address source', 'options-grid');
    assert.doesNotMatch(f.root.textContent!, /Unsaved edit/);
    assert.equal(f.previewDisabled(), true);
  } finally { f.close(); }
});


test('no eligible Grid connection blocks preview before Notion details or Magento read', async () => {
  const f = fixture({ status: 'no-source', reason: 'No eligible Options Grid tab. Open the Grid or explicitly choose CURRENT DRAFT.', tabs: [] });
  try {
    await f.prepare();
    assert.match(f.root.textContent!, /Connection no-source\./);
    assert.equal(f.previewDisabled(), true);
    f.click('Preview selected PP');
    assert.equal(f.messages.some(m => m.type === 'FETCH_PP_PREVIEW_CATALOG' || m.type === 'READ_PP_FRESH_FORM'), false);
  } finally { f.close(); }
});

test('connection replies after entity changes cannot enable or relabel a stale selection', async () => {
  const f = fixture('pending');
  try {
    await f.prepare();
    f.change('Exact Magento custom-option entity ID', '967');
    await f.resolve('CHECK_PP_CONNECTION', { status: 'ready', reason: 'STALE CONNECTION', tabs: [{ tabId: 88, selectionToken: 'a'.repeat(64), host: 'bestofgifts.pt', kind: 'options-grid', loading: false }] });
    assert.doesNotMatch(f.root.textContent!, /STALE CONNECTION/);
    assert.equal(f.previewDisabled(), true);
  } finally { f.close(); }
});

test('the batch tab queues the ticked codes and hands each one to the single-PP flow', async () => {
  const f = fixture();
  try {
    await f.prepare();
    const tab = (text: string) => Array.from(f.root.querySelectorAll<HTMLElement>('[role="tab"]'))
      .find(node => node.textContent!.startsWith(text))!;
    act(() => tab('Batch progress').click());
    assert.match(f.root.textContent!, /Batch progress 0 of 2 saved/);
    assert.match(f.root.textContent!, /2 queued/);
    assert.match(f.root.textContent!, /2 left/);
    // The current code is the first queued one, and it is only a handoff, never a write.
    assert.match(f.root.textContent!, /PP  0049 /);
    f.click('Skip this code');
    assert.match(f.root.textContent!, /1 left/);
    assert.match(f.root.textContent!, /Skipped/);
    assert.match(f.root.textContent!, /PP 50/);
    f.click('Open this code in Single progress');
    assert.match(f.root.textContent!, /Choose a Notion PP/);
    const record = Array.from(f.root.querySelectorAll('label'))
      .find(label => label.textContent!.startsWith('Selected Notion record'))!.querySelector('select')!;
    assert.equal(record.value, row(2).pageId);
    assert.equal(f.messages.some(m => m.type === 'APPLY_PP_PLAN' || m.type === 'SAVE_PP_FORM' ||
      m.type === 'READ_PP_FRESH_FORM'), false);
  } finally { f.close(); }
});
