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

function fixture() {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'chrome-extension://fixture/dashboard.html#/ppPreview' });
  const globals = globalThis as any, previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of ['window', 'document', 'Event', 'HTMLElement']) { previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] }); }
  const oldChrome = globals.chrome;
  const pending: { message: any; resolve: (value: any) => void; reject: (reason: Error) => void }[] = [], messages: any[] = [];
  globals.chrome = { runtime: { sendMessage: (message: any) => {
    messages.push(message);
    if (message.type === 'GET_PP_FRESH_FORM_STATE') return Promise.resolve({ status: 'idle' });
    return new Promise((resolve, reject) => pending.push({ message, resolve, reject }));
  } } };
  const root = document.getElementById('app')!;
  act(() => render(h(PpPreview, {}), root));
  const button = (text: string) => Array.from(root.querySelectorAll('button')).find(b => b.textContent === text)!;
  const click = (text: string) => act(() => button(text).click());
  const resolve = async (type: string, value: any, occurrence = 0) => { const item = pending.filter(p => p.message.type === type)[occurrence]!;
    assert.ok(item, type); await act(async () => { item.resolve(value); for (let i = 0; i < 30; i++) await Promise.resolve(); }); };
  const field = (name: string) => Array.from(root.querySelectorAll('label')).find(label => label.textContent!.startsWith(name))!.querySelector<HTMLInputElement | HTMLSelectElement>('input,select')!;
  const change = (name: string, value: string) => act(() => { const control = field(name); control.value = value; control.dispatchEvent(new dom.window.Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  const checkRow = (n: number) => act(() => root.querySelectorAll<HTMLInputElement>('table input[type="checkbox"]')[n]!.click());
  const pair = () => act(() => root.querySelector<HTMLInputElement>('input[type="checkbox"]:not([aria-label])')!.click());
  const prepare = async () => { click('Load PP catalogue'); await resolve('FETCH_PP_CATALOG_INDEX_PAGE', page([row(1, ' 0049 '), row(2, '50')])); checkRow(0); checkRow(1);
    change('Selected Notion record', row(1).pageId!); change('Exact Magento custom-option entity ID', '966'); pair(); };
  return { root, pending, messages, click, button, resolve, change, checkRow, pair, prepare,
    close: () => { act(() => render(null, root)); globals.chrome = oldChrome; dom.window.close(); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } } };
}

test('multi-selection survives filtering, exact selected details precede the fresh read, and rendering remains read-only/text-safe', async () => {
  const f = fixture();
  try {
    assert.equal(f.pending.length, 0); assert.equal(f.button('Preview selected PP').disabled, true);
    assert.match(f.root.textContent!, /exact Magento record|general admin tab is not sufficient/);
    assert.doesNotMatch(f.root.textContent!, /No existing Magento edit tab is needed/);
    await f.prepare(); assert.match(f.root.textContent!, /2 selected/);
    f.change('Search loaded codes or titles', '50'); assert.match(f.root.textContent!, /2 selected · 1 visible/);
    f.change('Search loaded codes or titles', ''); assert.equal(f.root.querySelectorAll('table input:checked').length, 2);
    f.click('Preview selected PP');
    assert.deepEqual(f.pending.find(p => p.message.type === 'FETCH_PP_PREVIEW_CATALOG')!.message, { type: 'FETCH_PP_PREVIEW_CATALOG', code: ' 0049 ' });
    assert.equal(f.pending.some(p => p.message.type === 'READ_PP_FRESH_FORM'), false);
    await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    const request = f.pending.find(p => p.message.type === 'READ_PP_FRESH_FORM')!.message;
    assert.equal(request.entityId, '966'); assert.equal('tabId' in request, false);
    await f.resolve('READ_PP_FRESH_FORM', fresh(request.requestId));
    assert.match(f.root.textContent!, /FRESH MAGENTO FORM LOAD/); assert.match(f.root.textContent!, /not a certified saved-server snapshot/);
    assert.match(f.root.textContent!, /Fresh native title/); assert.match(f.root.textContent!, /A rever/); assert.match(f.root.textContent!, /Blocked:/);
    assert.equal(f.root.querySelector('img'), null); assert.match(f.root.textContent!, /<img src=x/);
    assert.ok(Array.from(f.root.querySelectorAll('button')).every(b => b.type === 'button' && !/apply|save|batch|execute/i.test(b.textContent!)));
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

test('selected Notion page mismatch or non-unique details never starts Magento', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP');
    const wrong = desired(); wrong.definition!.pageId = row(2).pageId!;
    await f.resolve('FETCH_PP_PREVIEW_CATALOG', wrong); assert.match(f.root.textContent!, /does not match the selected Notion record/);
    assert.equal(f.pending.some(p => p.message.type === 'READ_PP_FRESH_FORM'), false);
    f.click('Preview selected PP'); await f.resolve('FETCH_PP_PREVIEW_CATALOG', { status: 'multiple', code: ' 0049 ', checkedAt: '2026-11-16', reason: 'Multiple exact matches' }, 1);
    assert.match(f.root.textContent!, /Multiple exact matches/); assert.equal(f.pending.some(p => p.message.type === 'READ_PP_FRESH_FORM'), false);
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
    assert.equal(f.button('Preview selected PP').disabled, true);
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
    assert.equal(f.button('Preview selected PP').disabled, true);
    f.click('Stop preview / close helper tab'); await f.resolve('CANCEL_PP_FRESH_FORM', { ...fresh(request.requestId), status: 'cancelled' }, 1);
    f.pair(); assert.equal(f.button('Preview selected PP').disabled, false);
  } finally { f.close(); }
});

test('stop during selected detail read prevents subsequent Magento work and leaving the section discards late results', async () => {
  const f = fixture();
  try {
    await f.prepare(); f.click('Preview selected PP'); f.click('Stop preview / close helper tab');
    await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired());
    assert.equal(f.pending.some(p => p.message.type === 'READ_PP_FRESH_FORM'), false); assert.doesNotMatch(f.root.textContent!, /Desired: Notion/);
    f.click('Preview selected PP');
    act(() => render(null, f.root)); await f.resolve('FETCH_PP_PREVIEW_CATALOG', desired(), 1);
    assert.equal(f.root.textContent, ''); assert.equal(f.pending.some(p => p.message.type === 'READ_PP_FRESH_FORM'), false);
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
  } finally { f.close(); }
});
