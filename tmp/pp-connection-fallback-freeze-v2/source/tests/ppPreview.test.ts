import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
// @ts-expect-error - untyped transitive dependency
import { JSDOM } from 'jsdom';
import type { PpPreviewTab, ScanPpDraftResponse, RouterContext } from '../src/core/messages';
import { PP_CATALOG_DATABASE, type PpCatalogResponse } from '../src/shared/ppCatalog';
import { PpPreview } from '../src/dashboard/sections/ui/PpPreview';
import { attributeSetConsistency, ppPreviewRows, readPreviewResponses } from '../src/dashboard/sections/ui/ppPreviewModel';
import { isPpPreviewSender, ppPreviewTab } from '../src/entrypoints/background/ppPreview';
import { handleUiMessage } from '../src/entrypoints/background/routers/ui';
import { handleAuditMessage } from '../src/entrypoints/background/routers/audit';

const dashboard = 'chrome-extension://fixture/dashboard.html#/ppPreview';
const route = '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966';
const fullUrl = `https://bestofgifts.pt/admin${route}/key/PRIVATE_SESSION?form_key=PRIVATE_QUERY`;
const target: PpPreviewTab = { tabId: 7, entityId: '966', host: 'bestofgifts.pt', routePath: route, selectionToken: 'a'.repeat(64) };
const desired = (code = ' 0049 ', status: PpCatalogResponse['status'] = 'found'): PpCatalogResponse => ({
  status, code, checkedAt: '2026-11-16T10:00:00Z', reason: 'Read reference',
  definition: { pageId: 'cbbb6705-ae1f-8227-90c6-01b6be542afc', code, name: '<img src=x onerror=alert(1)>',
    reviewStatus: 'A rever', faces: ['Face 1', 'Face 2'], options: ['Laser Metal'], techniques: null,
    faceCount: null, locationCount: 6, body: ['No confirmed assignments'], warnings: ['Unknown per-location mapping'], lastEditedAt: null },
});
const snapshot = (): ScanPpDraftResponse => ({ version: 1, status: 'ok', entityId: '966', providerEntityId: '966',
  routePath: route, scannedAt: 1_800_000_000_000, providerAttributeSetId: '479', generalAttributeSetId: ['479'],
  general: { option_title: 'Unsaved current title', sort_order: '', price: 0 },
  locations: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
  items: { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] }, warnings: ['Items unavailable'] });
const draftResponse = () => ({ ok: true as const, tab: target, snapshot: snapshot() });
const context = (sendResponse: (value: unknown) => void, senderUrl = dashboard): RouterContext => ({ senderUrl, senderFrameId: 0, sendResponse });
const globals = globalThis as unknown as Record<string, unknown>;
function setChrome(value: unknown): () => void {
  const old = globals.chrome; globals.chrome = value;
  return () => { if (old === undefined) delete globals.chrome; else globals.chrome = old; };
}
function dispatch(router: typeof handleUiMessage, message: Record<string, unknown>, url = dashboard): Promise<any> {
  return new Promise(resolve => assert.equal(router(message, context(resolve, url)), true));
}

test('only the own dashboard main document can make preview requests', async () => {
  let calls = 0;
  const restore = setChrome({ runtime: { getURL: () => 'chrome-extension://fixture/dashboard.html' },
    tabs: { query: async () => { calls++; return []; }, get: async () => { calls++; } },
    scripting: { executeScript: async () => { calls++; } } });
  try {
    assert.equal(isPpPreviewSender(context(() => {})), true);
    assert.equal(isPpPreviewSender({ ...context(() => {}), senderFrameId: 2 }), false);
    for (const sender of [fullUrl, 'https://example.org/dashboard.html',
      'chrome-extension://other/dashboard.html', 'chrome-extension://fixture/sidepanel.html',
      'chrome-extension://fixture/dashboard.html?other=1', 'chrome-extension://fixture/dashboard.html/extra']) {
      assert.equal(isPpPreviewSender(context(() => {}, sender)), false);
      assert.equal((await dispatch(handleUiMessage, { type: 'LIST_PP_PREVIEW_TABS' }, sender)).ok, false);
      assert.equal((await dispatch(handleUiMessage, { type: 'READ_PP_PREVIEW_DRAFT', tabId: 7, selectionToken: target.selectionToken }, sender)).ok, false);
      assert.equal((await dispatch(handleAuditMessage, { type: 'FETCH_PP_PREVIEW_CATALOG', code: '49' }, sender)).status, 'unavailable');
    }
    assert.equal(calls, 0);
  } finally { restore(); }
});

test('listing returns only matching allowed edit records with redacted identities and no auto-selection or injection', async () => {
  let injected = 0;
  const restore = setChrome({ runtime: { getURL: () => dashboard.split('#')[0] }, tabs: {
    query: async (filter: any) => {
      assert.ok(filter.url.every((url: string) => url.startsWith('https://bestofgifts') && url.includes('/edit/')));
      assert.equal('active' in filter, false);
      return [
        { id: 7, url: fullUrl, title: 'PRIVATE_TITLE' },
        { id: 8, url: 'https://example.org' + route },
        { id: 9, url: 'http://bestofgifts.pt' + route },
        { id: 10, url: 'https://bestofgifts.pt/admin/catalog/product/edit/id/966' },
        { id: 11, url: fullUrl, pendingUrl: fullUrl },
      ];
    } }, scripting: { executeScript: async () => { injected++; } } });
  try {
    const response = await dispatch(handleUiMessage, { type: 'LIST_PP_PREVIEW_TABS' });
    assert.equal(response.ok, true); assert.equal(response.tabs.length, 1);
    assert.equal(response.tabs[0].routePath, route); assert.equal(response.tabs[0].entityId, '966');
    assert.doesNotMatch(JSON.stringify(response), /PRIVATE|\/admin|\/key|form_key|title/);
    assert.equal(injected, 0);
  } finally { restore(); }
});

test('explicit selected draft read executes the self-contained inherited-registry reader only in frame zero', async () => {
  let injections = 0, loaderCalls = 0;
  const nativeData = { attributesetcustomoptions_id: '966', attribute_set_id: '479', general: { attribute_set_id: ['479'], option_title: 'Unsaved' },
    options: { sub_options: { sub_options: [] }, sub_options_items: { sub_options_items: [] } } };
  const registry = Object.create({ get: () => ({ data: nativeData }) });
  const requireFn = Object.assign(() => { loaderCalls++; }, { s: { contexts: { _: { defined: { 'Magento_Ui/js/lib/registry/registry': registry } } } } });
  const restore = setChrome({ runtime: { getURL: () => dashboard.split('#')[0] }, tabs: { get: async () => ({ id: 7, url: fullUrl }) },
    scripting: { executeScript: async (request: any) => {
      injections++; assert.deepEqual(request.target, { tabId: 7, frameIds: [0] }); assert.equal(request.world, 'MAIN');
      const result = runInNewContext(`(${request.func.toString()})()`, { window: { location: { pathname: new URL(fullUrl).pathname }, require: requireFn } });
      return [{ frameId: 0, result }];
    } } });
  try {
    const selected = await ppPreviewTab({ id: 7, url: fullUrl } as chrome.tabs.Tab);
    const response = await dispatch(handleUiMessage, { type: 'READ_PP_PREVIEW_DRAFT', tabId: 7, selectionToken: selected!.selectionToken });
    assert.equal(response.ok, true); assert.equal(response.snapshot.status, 'ok');
    assert.equal(response.snapshot.general.option_title, 'Unsaved'); assert.equal(response.snapshot.routePath, route);
    assert.equal(injections, 1); assert.equal(loaderCalls, 0); assert.doesNotMatch(JSON.stringify(response), /PRIVATE|\/key|form_key/);
  } finally { restore(); }
});

for (const scenario of ['token', 'unsupported', 'before-navigation', 'after-navigation', 'pending', 'frame', 'entity', 'malformed', 'throws']) {
  test(`draft read rejects ${scenario} without returning a snapshot`, async () => {
    let gets = 0, injections = 0;
    const selected = await ppPreviewTab({ id: 7, url: fullUrl } as chrome.tabs.Tab);
    const restore = setChrome({ runtime: { getURL: () => dashboard.split('#')[0] }, tabs: { get: async () => {
      gets++;
      if (scenario === 'throws') throw new Error('PRIVATE_URL');
      return { id: 7,
        url: scenario === 'unsupported' ? 'https://example.org' + route :
          scenario === 'before-navigation' || (scenario === 'after-navigation' && gets > 1) ? fullUrl + 'changed' : fullUrl,
        ...(scenario === 'pending' ? { pendingUrl: fullUrl } : {}) };
    } }, scripting: { executeScript: async () => { injections++;
      const result = snapshot(); result.routePath = '/admin' + route;
      if (scenario === 'entity') result.entityId = '49';
      return [{ frameId: scenario === 'frame' ? 1 : 0, result: scenario === 'malformed' ? {} : result }];
    } } });
    try {
      const response = await dispatch(handleUiMessage, { type: 'READ_PP_PREVIEW_DRAFT', tabId: 7,
        selectionToken: scenario === 'token' ? 'b'.repeat(64) : selected!.selectionToken });
      assert.equal(response.ok, false); assert.equal('snapshot' in response, false);
      assert.doesNotMatch(JSON.stringify(response), /PRIVATE|key\//);
      if (['token', 'unsupported', 'before-navigation', 'pending', 'throws'].includes(scenario)) assert.equal(injections, 0);
    } finally { restore(); }
  });
}

test('dashboard catalogue request reuses the V2 exact reader with no write endpoint', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_900_000_000_000 });
  const restore = setChrome({ runtime: { id: 'fixture', getURL: () => dashboard.split('#')[0] }, storage: { local: { get: async () => ({ notionToken: 'fixture-only' }) } } });
  t.after(restore);
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: any, init?: RequestInit) => {
    calls.push(String(url));
    assert.ok(!init?.method || init.method === 'GET' || (init.method === 'POST' && String(url).endsWith('/query')));
    if (String(url).endsWith('/query')) {
      assert.deepEqual(JSON.parse(String(init!.body)).filter, { property: 'Código PP', rich_text: { equals: ' 0049 ' } });
      return Response.json({ results: [], has_more: false });
    }
    assert.equal(String(url), `https://api.notion.com/v1/databases/${PP_CATALOG_DATABASE}`);
    return Response.json({ properties: { 'Código PP': { type: 'rich_text' }, PP: { type: 'title' } } });
  });
  let done = false;
  const pending = dispatch(handleAuditMessage, { type: 'FETCH_PP_PREVIEW_CATALOG', code: ' 0049 ' }).then(value => { done = true; return value; });
  for (let i = 0; i < 100 && !done; i++) { t.mock.timers.tick(500); for (let j = 0; j < 24; j++) await Promise.resolve(); }
  assert.equal(done, true);
  const response = await pending;
  assert.equal(response.status, 'not-found'); assert.equal(response.code, ' 0049 '); assert.equal(calls.length, 2);
});

test('preview retains unknowns, raw values and blocked semantics without fabricating a diff', () => {
  const current = snapshot();
  const rows = ppPreviewRows(desired(), current);
  assert.equal(rows.length, 4); assert.ok(rows.every(row => row.reason.length > 0));
  assert.match(rows[0]!.reason, /not an established mapping/);
  assert.deepEqual(rows[1]!.current, current.locations); assert.equal(current.items.state, 'missing');
  assert.equal(current.general.sort_order, ''); assert.equal(current.general.price, 0);
  assert.equal('assignments' in rows[2]!, false); assert.equal('changes' in rows[0]!, false);
  for (const status of ['not-found', 'multiple', 'network', 'auth', 'access', 'unavailable'] as const) assert.deepEqual(ppPreviewRows(desired('49', status), current), []);
  assert.equal(ppPreviewRows(desired('49', 'partial'), current).length, 4);
  assert.equal(attributeSetConsistency(current), 'matching');
  current.generalAttributeSetId = ['480']; assert.equal(attributeSetConsistency(current), 'different');
  current.generalAttributeSetId = []; assert.equal(attributeSetConsistency(current), 'unknown');
  current.generalAttributeSetId = undefined; assert.equal(attributeSetConsistency(current), 'unknown');
  current.status = 'unavailable'; assert.deepEqual(ppPreviewRows(desired(), current), []);
  assert.throws(() => readPreviewResponses('49', target, desired('0049'), draftResponse()), /exact business code/);
  assert.throws(() => readPreviewResponses(' 0049 ', target, desired(), { ...draftResponse(), tab: { ...target, entityId: '49' } }), /selected tab/);
});
