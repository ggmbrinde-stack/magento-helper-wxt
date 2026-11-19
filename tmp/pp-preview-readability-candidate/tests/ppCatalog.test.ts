import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { loadPpCatalog, loadPpCatalogIndexPage } from '../src/audit/ppCatalog';
import { PP_CATALOG_DATABASE, PP_CATALOG_DATA_SOURCE } from '../src/shared/ppCatalog';

const id = 'cbbb6705-ae1f-8227-90c6-01b6be542afc';
const tableId = '11111111-1111-1111-1111-111111111111';
const rich = (value: string) => [{ plain_text: value }];
const options = (names: string[]) => ({ type: 'multi_select', multi_select: names.map(name => ({ name })) });
const page = (code = '49') => ({ id, last_edited_time: '2026-11-13T10:00:00.000Z', properties: {
  PP: { type: 'title', title: rich('49 - Textile') },
  'Código PP': { type: 'rich_text', rich_text: rich(code) },
  Estado: { type: 'select', select: { name: 'A rever' } },
  Faces: options(['Face 1', 'Face 2', 'Face 3', 'Face 4', 'Face 5', 'Face 6']),
  'Técnicas': options(['Screen print']), 'Opções de personalização': options(['1 colour']),
  'Número de faces': { type: 'number', number: null },
  'Número de locais possíveis': { type: 'number', number: 6 },
} });
let now = 1_800_000_000_000;

async function settle<T>(t: TestContext, promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 500 && !done; i++) {
    t.mock.timers.tick(500);
    for (let j = 0; j < 24; j++) await Promise.resolve();
  }
  assert.ok(done, 'bounded lookup completed');
  return promise;
}

function fixture(t: TestContext, config: {
  code?: string; token?: string; rows?: readonly unknown[]; more?: boolean; schema?: string;
  status?: number; network?: boolean; bodyStatus?: number; cappedBody?: boolean; malformed?: boolean; bodyBlocks?: unknown[];
} = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: now += 2_000_000 });
  const globals = globalThis as unknown as Record<string, unknown>;
  const previousChrome = globals.chrome;
  globals.chrome = { runtime: { id: 'fixture-only-extension' }, storage: { local: { get: async () => ({ notionToken: config.token ?? 'fixture-only-token' }) } } };
  t.after(() => { globals.chrome = previousChrome; });
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {} });
    assert.ok(method === 'GET' || (method === 'POST' && url.endsWith(`/databases/${PP_CATALOG_DATABASE}/query`)), 'only catalogue reads');
    assert.ok(!url.includes(PP_CATALOG_DATA_SOURCE), 'data source is not used as a legacy database id');
    if (config.network) throw new TypeError('fixture network failure');
    if (config.status) return Response.json({ code: 'fixture_error' }, { status: config.status });
    if (url.endsWith(`/databases/${PP_CATALOG_DATABASE}`)) return Response.json({ properties: {
      'Código PP': { type: config.schema ?? 'rich_text' }, PP: { type: 'title' },
    } });
    if (url.endsWith('/query')) return Response.json(config.malformed ? {} : {
      results: config.rows ?? [page(config.code)], has_more: config.more ?? false, next_cursor: config.more ? 'next' : null,
    });
    if (config.bodyStatus) return Response.json({ code: 'restricted_resource' }, { status: config.bodyStatus });
    if (config.bodyBlocks) return Response.json({ results: config.bodyBlocks, has_more: false });
    if (config.cappedBody) return Response.json({ results: [], has_more: true, next_cursor: 'repeated' });
    if (url.includes(`/blocks/${tableId}/children`)) return Response.json({ results: [{
      type: 'table_row', table_row: { cells: [rich('Face 1 / Face 2'), rich('Distribution unconfirmed')] },
    }], has_more: false });
    const cursor = new URL(url).searchParams.get('start_cursor');
    return Response.json(cursor ? { results: [{ type: 'paragraph', paragraph: { rich_text: rich('After table') } }], has_more: false }
      : { results: [
        { type: 'paragraph', paragraph: { rich_text: rich('Locais e personalização') } },
        { id: tableId, type: 'table', table: {}, has_children: true },
      ], has_more: true, next_cursor: 'body-next' });
  });
  return calls;
}

test('exact lookup uses schema, copied database and read-only body pagination; retains uncertainty and blank counts', async t => {
  const calls = fixture(t);
  const result = await settle(t, loadPpCatalog('49'));
  assert.equal(result.status, 'found');
  assert.equal(result.definition!.reviewStatus, 'A rever');
  assert.equal(result.definition!.faceCount, null);
  assert.equal(result.definition!.locationCount, 6);
  assert.equal(result.definition!.faces!.length, 6);
  assert.deepEqual(result.definition!.body, ['Locais e personalização', 'Face 1 / Face 2 | Distribution unconfirmed', 'After table']);
  assert.equal('assignments' in result.definition!, false);
  assert.match(result.definition!.warnings.join(' '), /do not establish assignments/);
  assert.deepEqual(calls.find(call => call.method === 'POST')!.body, {
    page_size: 2, filter: { property: 'Código PP', rich_text: { equals: '49' } },
  });
  assert.ok(!JSON.stringify(result).includes('fixture-only-token'));
});

test('a table cell with several lines keeps them separable', async t => {
  const twoLines = [...rich('Tampografia 1 Cor'), ...rich('Tampografia 2 Cores')];
  fixture(t, { bodyBlocks: [{ type: 'table_row', table_row: { cells: [rich('1 Face'), twoLines, []] } }] });
  const result = await settle(t, loadPpCatalog('49'));
  assert.deepEqual(result.definition!.body, ['1 Face | Tampografia 1 Cor; Tampografia 2 Cores | ']);
});
test('code is kept verbatim without trimming, prefix or numeric aliases', async t => {
  const calls = fixture(t, { code: ' 0049 ' });
  const result = await settle(t, loadPpCatalog(' 0049 '));
  assert.equal(result.definition!.code, ' 0049 ');
  assert.deepEqual(calls.find(call => call.method === 'POST')!.body.filter,
    { property: 'Código PP', rich_text: { equals: ' 0049 ' } });
});

test('index reads only summary properties, preserves exact codes and missing fields, and never reads bodies', async t => {
  const first = page(' 0049 '), second: any = page('0049'); second.id = tableId;
  delete second.properties['Código PP']; second.properties.PP.title = null;
  const calls = fixture(t, { rows: [first, second], more: true });
  const result = await settle(t, loadPpCatalogIndexPage('requested-cursor'));
  assert.equal(result.status, 'page'); assert.equal(result.hasMore, true); assert.equal(result.nextCursor, 'next');
  assert.equal(result.rows[0]!.code, ' 0049 '); assert.equal(result.rows[0]!.reviewStatus, 'A rever');
  assert.equal(result.rows[1]!.code, null); assert.equal(result.rows[1]!.name, null);
  assert.deepEqual(Object.keys(result.rows[0]!).sort(), ['code', 'name', 'pageId', 'reviewStatus']);
  assert.equal(calls.length, 2); assert.ok(calls.every(call => !call.url.includes('/blocks/')));
  assert.deepEqual(calls[1]!.body, { page_size: 100, start_cursor: 'requested-cursor' });
});

test('index rejects invalid cursors without network access', async t => {
  const calls = fixture(t);
  for (const cursor of ['', 1, 'x'.repeat(513)]) assert.equal((await loadPpCatalogIndexPage(cursor)).status, 'invalid');
  assert.equal(calls.length, 0);
});

for (const config of [{ token: '' }, { status: 401 }, { status: 403 }, { schema: 'number' }, { malformed: true }, { network: true }]) {
  test('index fails explicitly and respects existing bounded retries: ' + JSON.stringify(config), async t => {
    const calls = fixture(t, config);
    const result = await settle(t, loadPpCatalogIndexPage());
    assert.notEqual(result.status, 'page'); assert.equal(result.rows.length, 0);
    assert.ok(calls.length <= 6, 'no more than the existing five retries plus initial read');
    assert.ok(calls.every(call => !call.url.includes('/blocks/')));
  });
}

for (const [index, scenario] of ([
  { rows: [], expected: 'not-found' },
  { rows: [page(), page()], expected: 'multiple' },
  { rows: [page()], more: true, expected: 'partial' },
  { rows: [page('PP49')], expected: 'partial' },
  { schema: 'number', expected: 'unavailable' },
  { malformed: true, expected: 'unavailable' },
  { status: 401, expected: 'auth' },
  { status: 403, expected: 'access' },
  { status: 404, expected: 'access' },
  { status: 400, expected: 'unavailable' },
  { network: true, expected: 'network' },
] as const).entries()) {
  test(`lookup case ${index + 1}: ${scenario.expected}, no reference selected`, async t => {
    const calls = fixture(t, scenario);
    const result = await settle(t, loadPpCatalog('49'));
    assert.equal(result.status, scenario.expected);
    assert.equal(result.definition, undefined);
    assert.equal(calls.some(call => call.url.includes('/blocks/')), false);
  });
}

test('missing credentials and invalid input make no network requests', async t => {
  const calls = fixture(t, { token: '' });
  assert.equal((await loadPpCatalog('49')).status, 'auth');
  for (const code of [49, '', '   ', 'x'.repeat(129), null]) assert.equal((await loadPpCatalog(code)).status, 'invalid');
  assert.deepEqual(calls, []);
});

test('partial body coverage is explicit, with verified properties retained', async t => {
  const calls = fixture(t, { cappedBody: true });
  const result = await settle(t, loadPpCatalog('49'));
  assert.equal(result.status, 'partial');
  assert.equal(result.definition!.code, '49');
  assert.match(result.definition!.warnings.join(' '), /coverage limit/);
  assert.ok(calls.filter(call => call.url.includes('/blocks/')).length <= 8);
});

test('body access failure retains the reference but never reports full success', async t => {
  fixture(t, { bodyStatus: 403 });
  const result = await settle(t, loadPpCatalog('49'));
  assert.equal(result.status, 'access');
  assert.equal(result.definition!.code, '49');
  assert.deepEqual(result.definition!.body, []);
});

for (const supported of [true, false]) {
  test(`Audit router only reads the catalogue for a supported sender (${supported})`, async t => {
    const calls = fixture(t);
    const chrome = (globalThis as unknown as { chrome: Record<string, unknown> }).chrome;
    chrome.tabs = { get: async () => ({ url: supported
      ? 'https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966/'
      : 'https://bestofgifts.pt/a-product.html' }) };
    const { handleAuditMessage } = await import('../src/entrypoints/background/routers/audit');
    const response = new Promise<unknown>(resolve => {
      assert.equal(handleAuditMessage({ type: 'FETCH_PP_CATALOG', code: '49' }, { senderTabId: 7, sendResponse: resolve }), true);
    });
    const result = await settle(t, response) as { status: string };
    assert.equal(result.status, supported ? 'found' : 'unavailable');
    assert.equal(calls.length > 0, supported);
  });
}

for (const [block, expected] of [
  [{ type: 'unsupported', unsupported: {}, has_children: false }, 'partial'],
  [{ type: 'paragraph', paragraph: {}, has_children: false }, 'partial'],
  [{ type: 'divider', divider: {}, has_children: false }, 'found'],
] as const) {
  test(`body coverage: ${block.type} is ${expected}, with readable text retained`, async t => {
    fixture(t, { bodyBlocks: [
      { type: 'paragraph', paragraph: { rich_text: rich('Readable source paragraph') } }, block,
    ] });
    const result = await settle(t, loadPpCatalog('49'));
    assert.equal(result.status, expected);
    assert.deepEqual(result.definition!.body, ['Readable source paragraph']);
    assert.equal(result.definition!.warnings.some(warning => /coverage limit/.test(warning)), expected === 'partial');
  });
}

for (const [code, expected] of [
  ['PP-ABC-123-XYZ', 'found'],
  ['PP"test"123', 'found'],
  ['PP café ☕', 'found'],
  ['a'.repeat(128), 'found'],
  ['a'.repeat(129), 'invalid'],
] as const) {
  test(`complicated code ${JSON.stringify(code).slice(0, 30)} → ${expected}`, async t => {
    const calls = fixture(t, { code });
    if (expected === 'invalid') {
      assert.equal((await loadPpCatalog(code)).status, 'invalid');
      assert.equal(calls.length, 0, 'no network request for over-limit code');
    } else {
      const result = await settle(t, loadPpCatalog(code));
      assert.equal(result.status, expected);
      assert.equal(result.definition!.code, code);
      assert.deepEqual(calls.find(call => call.method === 'POST')!.body.filter,
        { property: 'Código PP', rich_text: { equals: code } });
    }
  });
}
