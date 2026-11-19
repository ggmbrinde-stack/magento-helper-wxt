import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readLoadedPpGrid } from '../src/page/features/pp-scan/grid';
import { readFreshForm, cancelFreshForm } from '../src/entrypoints/background/ppFreshForm';

const origin = 'https://bestofgifts.pt', base = origin + '/admin_fixture';
const controller = '/toogas_attributesetcustomoptions/attributesetcustomoptions';
const gridPath = '/admin_fixture' + controller + '/index/';
const gridUrl = origin + gridPath + 'key/SYNTHETIC_GRID/';
const editUrl = base + controller + '/edit/attributesetcustomoptions_id/42/key/SYNTHETIC_EDIT/';
const namespace = 'toogas_attributesetcustomoptions_attributesetcustomoptions_listing';
const providerName = namespace + '.' + namespace + '_data_source';
const moduleName = 'Magento_Ui/js/lib/registry/registry';
const row = (id: string | number): any => ({ attributesetcustomoptions_id: id,
  actions: { delete: { href: base + controller + '/delete/' }, duplicate: { href: base + controller + '/duplicate/' },
    edit: { href: editUrl.replace('/42/', '/' + id + '/') } } });

function gridFixture() {
  const provider: any = { firstLoad: false, lastError: false, message: '',
    data: { items: [row(420), row(42), row(142)], totalRecords: 20 },
    params: { namespace, filters: { placeholder: true, attributesetcustomoptions_id: '42' }, paging: { pageSize: 200, current: 1 },
      sorting: { field: 'attributesetcustomoptions_id', direction: 'asc' } },
    reload: () => assert.fail('never reload'), set: () => assert.fail('never set grid parameters') };
  let loaderCalls = 0, gets = 0;
  let onGet = (): void => {};
  const registry: any = Object.create({ get: (name: string) => { assert.equal(name, providerName); gets++; onGet(); return provider; } });
  const context: any = { URL, window: { location: { origin, pathname: new URL(gridUrl).pathname },
    require: Object.assign(() => { loaderCalls++; assert.fail('never load modules'); }, { s: { contexts: { _: { defined: { [moduleName]: registry } } } } }) } };
  const run = () => runInNewContext('(' + readLoadedPpGrid.toString() + ')(...args)', { ...context, args: ['42', origin, gridPath] });
  return { provider, registry, context, run, counts: () => ({ gets, loaderCalls }), onGet: (fn: () => void) => { onGet = fn; } };
}

test('serialized loaded-grid reader selects exact 42 among substring matches and only the named Edit action', () => {
  const f = gridFixture(), before = JSON.stringify(f.provider), result = f.run();
  assert.equal(result.status, 'found'); assert.equal(result.nativeUrl, editUrl); assert.equal(result.loadedRows, 3); assert.equal(result.totalRows, 20);
  assert.equal(result.page, 1); assert.equal(result.pageSize, 200); assert.equal(result.filtered, true); assert.equal(result.freshness, 'loaded-unverified');
  assert.equal(JSON.stringify(f.provider), before); assert.equal(f.counts().loaderCalls, 0);
  assert.ok(result.stamp.includes('42')); assert.doesNotMatch(result.nativeUrl, /delete|duplicate/);
});

for (const scenario of ['missing', 'duplicate', 'loading', 'error', 'message', 'namespace', 'oversized', 'malformed-id', 'unknown-filter', 'wrong-route', 'wrong-origin']) {
  test('loaded-grid status: ' + scenario, () => {
    const f = gridFixture();
    if (scenario === 'missing') f.provider.data.items = [row(420), row(142)];
    if (scenario === 'duplicate') f.provider.data.items.push(row('42'));
    if (scenario === 'loading') f.provider.firstLoad = true;
    if (scenario === 'error') f.provider.lastError = true;
    if (scenario === 'message') f.provider.message = 'SYNTHETIC_PRIVATE/key/secret';
    if (scenario === 'namespace') f.provider.params.namespace = 'other_listing';
    if (scenario === 'oversized') f.provider.data.items = Array.from({ length: 5001 }, () => row(42));
    if (scenario === 'malformed-id') f.provider.data.items.push({});
    if (scenario === 'unknown-filter') f.provider.params.filters.unobserved = 'SYNTHETIC_PRIVATE';
    if (scenario === 'wrong-route') f.context.window.location.pathname = new URL(editUrl).pathname;
    if (scenario === 'wrong-origin') f.context.window.location.origin = 'https://example.org';
    const result = f.run();
    const expected = scenario === 'missing' ? 'not-in-loaded-results' : scenario === 'duplicate' ? 'duplicate' : scenario === 'loading' ? 'loading' :
      ['error', 'message'].includes(scenario) ? 'error' : ['namespace', 'wrong-route', 'wrong-origin'].includes(scenario) ? 'unavailable' : 'incomplete';
    assert.equal(result.status, expected); assert.equal(result.nativeUrl, undefined); assert.equal(result.stamp, undefined);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC|key\//);
  });
}

test('a large loaded page is accepted: 925 rows inside a 1000 row page (PP 963)', () => {
  const f = gridFixture();
  f.provider.data.items = Array.from({ length: 925 }, (_, index) => row(1000 + index));
  f.provider.data.items[500] = row(42);
  f.provider.data.totalRecords = 925;
  f.provider.params.paging.pageSize = 1000;
  const result = f.run();
  assert.equal(result.status, 'found'); assert.equal(result.nativeUrl, editUrl);
  assert.equal(result.loadedRows, 925); assert.equal(result.pageSize, 1000); assert.equal(result.totalRows, 925);
  assert.equal(result.filtered, true);
});

test('loaded-grid rejects wrong action/record/host/query/hash and missing native Edit link', () => {
  for (const bad of [editUrl.replace('/edit/', '/delete/'), editUrl.replace('/42/', '/420/'), editUrl.replace('bestofgifts.pt', 'example.org'),
    editUrl + '?private=SYNTHETIC', editUrl + '#SYNTHETIC', '/relative/edit/42/', 'not a URL', undefined]) {
    const f = gridFixture(); f.provider.data.items[1].actions.edit.href = bad;
    const result = f.run(); assert.equal(result.status, 'invalid-link'); assert.equal(result.nativeUrl, undefined);
  }
});

test('grid own reads avoid getters/coercion and reject data/params/link identity changes', () => {
  const f = gridFixture(); let called = 0;
  Object.defineProperty(f.provider.data.items[1].actions, 'edit', { get: () => { called++; return {}; } });
  assert.equal(f.run().status, 'invalid-link'); assert.equal(called, 0);
  const invalidSort = gridFixture(); invalidSort.provider.params.sorting.direction = { toString: () => assert.fail('no arbitrary coercion') };
  assert.equal(invalidSort.run().status, 'incomplete');
  for (const kind of ['data', 'params', 'link', 'id']) {
    const current = gridFixture();
    current.onGet(() => { if (current.counts().gets !== 2) return;
      if (kind === 'data') current.provider.data = { ...current.provider.data };
      if (kind === 'params') current.provider.params = { ...current.provider.params };
      if (kind === 'link') current.provider.data.items[1].actions.edit.href = editUrl.replace('SYNTHETIC_EDIT', 'CHANGED');
      if (kind === 'id') current.provider.data.items[1].attributesetcustomoptions_id = '43';
    });
    assert.equal(current.run().status, 'changed');
  }
});

test('grid provider fields remain own-property reads and inherited/accessor registry methods are guarded', () => {
  const f = gridFixture(); const data = f.provider.data; delete f.provider.data; Object.setPrototypeOf(f.provider, { data });
  assert.equal(f.run().status, 'unavailable');
  f.provider.data = data;
  let called = 0; Object.defineProperty(f.registry, 'get', { get: () => { called++; return () => f.provider; } });
  assert.equal(f.run().status, 'unavailable'); assert.equal(called, 0);
});

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
async function settle<T>(t: TestContext, pending: Promise<T>): Promise<T> {
  let done = false; void pending.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 90 && !done; i++) { await flush(); t.mock.timers.tick(500); }
  await flush(); assert.equal(done, true); return pending;
}
function workerFixture(t: TestContext, config: { scenario?: string; gridWait?: Promise<any> } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_900_000_000_000 });
  const old = (globalThis as any).chrome, f = gridFixture(), created: any[] = [], removed: number[] = [], listeners = new Set<(id: number) => void>();
  const injections: number[] = [], queries: any[] = []; let gridReads = 0, sourceGets = 0;
  if (config.scenario === 'duplicate') f.provider.data.items.push(row(42));
  if (config.scenario === 'missing') f.provider.data.items = [row(420)];
  if (config.scenario === 'invalid-link') f.provider.data.items[1].actions.edit.href = editUrl.replace('/edit/', '/delete/');
  if (config.scenario === 'loading') f.provider.firstLoad = true;
  const formProvider = { data: { attributesetcustomoptions_id: '42', general: { option_title: 'Fresh helper form' },
    options: { sub_options: { sub_options: [] }, sub_options_items: { sub_options_items: [] } } } };
  const formRequire = Object.assign(() => assert.fail('No module load'), { s: { contexts: { _: { defined: { [moduleName]: Object.create({ get: () => formProvider }) } } } } });
  (globalThis as any).chrome = { storage: { local: { get: async (keys: string[]) => { assert.deepEqual(keys, ['adminBaseUrl']); return { adminBaseUrl: base }; } } },
    tabs: { query: async (options: any) => { queries.push(options); assert.deepEqual(options, { url: [origin + gridPath.replace(/\/$/, ''), origin + gridPath + '*'] });
      if (config.scenario === 'no-grid') return [];
      const source = { id: 88, url: gridUrl, status: 'complete' }; return config.scenario === 'multiple-grids' ? [source, { ...source, id: 89 }] : [source]; },
      get: async (id: number) => {
        if (id === 88) { sourceGets++; return { id, url: config.scenario === 'source-moved' && sourceGets > 1 ? editUrl : gridUrl, status: 'complete' }; }
        assert.equal(id, 77); return { id, url: config.scenario === 'helper-redirect' ? base + '/admin/dashboard/index/' : editUrl, status: 'complete' };
      }, create: async (options: any) => { created.push(options); assert.deepEqual(options, { url: editUrl, active: false }); return { id: 77 }; },
      remove: async (id: number) => { assert.equal(id, 77); removed.push(id); for (const fn of [...listeners]) fn(id); },
      update: () => assert.fail('Never change a reference grid'), onRemoved: { addListener: (fn: any) => listeners.add(fn), removeListener: (fn: any) => listeners.delete(fn) } },
    scripting: { executeScript: async (options: any) => {
      assert.equal(options.world, 'MAIN'); assert.deepEqual(options.target.frameIds, [0]); injections.push(options.target.tabId);
      if (options.target.tabId === 88) {
        assert.equal(options.func, readLoadedPpGrid); gridReads++;
        if (config.gridWait) return config.gridWait;
        if (config.scenario === 'between-probes' && gridReads === 2) f.provider.params.paging.current = 2;
        const result = f.run(); (result as any).extraUrl = 'SYNTHETIC_PRIVATE/key/secret';
        return [{ frameId: 0, result }];
      }
      assert.equal(options.target.tabId, 77);
      return [{ frameId: 0, result: runInNewContext('(' + options.func.toString() + ')(...args)', { args: options.args ?? [], document: { readyState: 'complete' },
        window: { location: { pathname: new URL(editUrl).pathname }, require: formRequire } }) }];
    } } };
  t.after(() => { (globalThis as any).chrome = old; });
  return { created, removed, injections, queries, config, grid: f };
}

test('worker rechecks loaded grid identity, copies the exact whole native URL privately and scans only its owned helper', async t => {
  const f = workerFixture(t), before = JSON.stringify(f.grid.provider);
  const response = await settle(t, readFreshForm('grid-positive', '42', 1, 'options-grid'));
  assert.equal(response.status, 'ok'); assert.equal(response.cleanup, 'closed'); assert.equal(response.snapshot!.general.option_title, 'Fresh helper form');
  assert.equal(response.reference!.grid!.status, 'found'); assert.equal(response.reference!.grid!.loadedRows, 3); assert.equal(response.reference!.grid!.totalRows, 20);
  assert.deepEqual(f.injections.slice(0, 2), [88, 88]); assert.equal(f.created.length, 1); assert.deepEqual(f.removed, [77]);
  assert.equal(JSON.stringify(f.grid.provider), before);
  assert.doesNotMatch(JSON.stringify(response), /SYNTHETIC|nativeUrl|stamp|admin_fixture|key\//);
});

for (const scenario of ['no-grid', 'multiple-grids', 'duplicate', 'missing', 'invalid-link', 'loading', 'between-probes', 'source-moved', 'helper-redirect']) {
  test('worker grid reference blocks ' + scenario + ' without silent exact-record fallback', async t => {
    const f = workerFixture(t, { scenario });
    const response = await settle(t, readFreshForm('grid-' + scenario, '42', 1, 'options-grid'));
    assert.equal(response.status, 'unavailable');
    assert.equal(f.created.length, scenario === 'helper-redirect' ? 1 : 0); assert.equal(f.removed.length, scenario === 'helper-redirect' ? 1 : 0);
    assert.equal(f.queries.length, 1); assert.doesNotMatch(JSON.stringify(response), /SYNTHETIC|nativeUrl|stamp|key\//);
    if (scenario === 'missing') { assert.equal(response.reference!.grid!.status, 'not-in-loaded-results'); assert.match(response.reason, /not a global not-found/); }
    if (scenario === 'between-probes' || scenario === 'source-moved') assert.equal(response.reference!.grid!.status, 'changed');
  });
}

test('cancelling a pending grid read never opens a helper or changes/closes the user grid', async t => {
  let resolve!: (value: any) => void;
  const f = workerFixture(t, { gridWait: new Promise(done => { resolve = done; }) });
  const pending = readFreshForm('grid-cancel', '42', 1, 'options-grid'); await flush();
  const stopped = cancelFreshForm('grid-cancel', 1); resolve([{ frameId: 0, result: f.grid.run() }]);
  assert.equal((await settle(t, pending)).status, 'cancelled'); await stopped;
  assert.equal(f.created.length, 0); assert.equal(f.removed.length, 0);
});

test('cancelling a grid read releases a never-settling injected probe without changing the grid', async t => {
  const f = workerFixture(t, { gridWait: new Promise(() => {}) });
  const pending = readFreshForm('grid-cancel-hung', '42', 1, 'options-grid'); await flush();
  const response = await settle(t, cancelFreshForm('grid-cancel-hung', 1));
  assert.equal(response.status, 'cancelled'); assert.equal((await pending).status, 'cancelled');
  assert.equal(f.created.length, 0); assert.equal(f.removed.length, 0);
});
