import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { checkPpConnection, readFreshForm, cancelFreshForm, freshFormState } from '../src/entrypoints/background/ppFreshForm';
import { ppTabSelectionToken } from '../src/entrypoints/background/ppPreview';
import { handleUiMessage } from '../src/entrypoints/background/routers/ui';

const base = 'https://bestofgifts.pt/admin_fixture';
const route = '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966';
const edit = base + route + '/key/PRIVATE_SESSION/';
const grid = base + '/toogas_attributesetcustomoptions/attributesetcustomoptions/index/key/PRIVATE_SESSION/';
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function fixture(t: any) {
  const globals = globalThis as any, old = globals.chrome;
  const tab: any = { id: 88, url: edit, status: 'complete' };
  let onInjection!: () => void;
  const waitInjected = new Promise<void>(resolve => { onInjection = resolve; });
  const state = { tabs: [tab] as any[], after: null as any, providerId: '966', frame: 0, hang: false, calls: 0, gets: 0, created: 0, removed: 0, injected: 0, gridReads: 0, gridStatus: 'found', changedGrid: false };
  globals.chrome = {
    runtime: { getURL: () => 'chrome-extension://fixture/dashboard.html' },
    storage: { local: { get: async () => ({ adminBaseUrl: base }) } },
    tabs: {
      query: async () => state.tabs,
      get: async () => { state.gets++; return state.gets > 1 && state.after ? state.after : tab; },
      create: async () => { state.created++; assert.fail('No helper allowed in direct read'); },
      remove: async () => { state.removed++; assert.fail('Never close user tab'); },
      update: () => assert.fail('Never navigate'), reload: () => assert.fail('Never reload'),
    },
    scripting: { executeScript: async (options: any) => {
      assert.deepEqual(options.target, { tabId: 88, frameIds: [0] });
      assert.equal(options.world, 'MAIN');
      if (options.func.name === 'readLoadedPpGrid') {
        state.gridReads++;
        return [{ frameId: 0, result: { status: state.gridStatus, freshness: 'loaded-unverified', loadedRows: 1, totalRows: 1, page: 1, pageSize: 20,
          nativeUrl: edit, stamp: state.changedGrid ? String(state.gridReads) : 'stable' } }];
      }
      state.injected++; onInjection();
      if (state.hang) return new Promise(() => {});
      const data = { attributesetcustomoptions_id: state.providerId, attribute_set_id: '479', general: { option_title: 'Unsaved current title', attribute_set_id: ['479'] }, options: { sub_options: { sub_options: [] }, sub_options_items: { sub_options_items: [] } } };
      const registry = Object.create({ get: () => ({ data }) });
      const requireFn = Object.assign(() => assert.fail('No module load'), { s: { contexts: { _: { defined: { 'Magento_Ui/js/lib/registry/registry': registry } } } } });
      const result = runInNewContext('(' + options.func.toString() + ')()', { window: { location: { pathname: new URL(edit).pathname }, require: requireFn } });
      return [{ frameId: state.frame, result }];
    } },
  };
  t.after(() => { globals.chrome = old; });
  return { tab, state, waitInjected, selection: async () => ({ tabId: 88, selectionToken: await ppTabSelectionToken(tab) }) };
}

test('preflight distinguishes absent grid, mismatched base, loading and ambiguity without opening helpers', async t => {
  const f = fixture(t);
  f.state.tabs = [];
  assert.equal((await checkPpConnection('966', 'options-grid')).status, 'no-source');
  f.state.tabs = [{ ...f.tab, url: grid.replace('admin_fixture', 'another_admin') }];
  assert.equal((await checkPpConnection('966', 'options-grid')).status, 'base-mismatch');
  f.state.tabs = [{ ...f.tab, url: grid, status: 'loading' }];
  assert.equal((await checkPpConnection('966', 'options-grid')).status, 'loading');
  f.state.tabs = [{ ...f.tab, url: grid }, { ...f.tab, id: 89, url: grid }];
  const response = await checkPpConnection('966', 'options-grid');
  assert.equal(response.status, 'ambiguous'); assert.equal(response.tabs.length, 2);
  assert.doesNotMatch(JSON.stringify(response), /PRIVATE|admin_fixture|\/key\//);
  assert.equal(f.state.injected, 0); assert.equal(f.state.created, 0);
});

test('grid preflight reads only selected source, checks stability and reports provider loading', async t => {
  const f = fixture(t); f.tab.url = grid;
  f.state.tabs.push({ ...f.tab, id: 89 });
  const selected = await f.selection();
  const ready = await checkPpConnection('966', 'options-grid', selected);
  assert.equal(ready.status, 'ready'); assert.equal(f.state.gridReads, 2);
  assert.equal(ready.grid!.freshness, 'loaded-unverified');
  f.state.gridStatus = 'loading';
  assert.equal((await checkPpConnection('966', 'options-grid', selected)).status, 'loading');
  f.state.gridStatus = 'found'; f.state.changedGrid = true;
  assert.equal((await checkPpConnection('966', 'options-grid', selected)).status, 'changed');
  assert.equal(f.state.created, 0);
});

test('draft preflight demands explicit selection and rejects stale token, wrong identity/base and invalid input', async t => {
  const f = fixture(t);
  assert.equal((await checkPpConnection('966', 'current-draft')).status, 'ambiguous');
  assert.equal((await checkPpConnection('966', 'current-draft', await f.selection())).status, 'ready');
  assert.equal((await checkPpConnection('966', 'current-draft', { tabId: 88, selectionToken: 'a'.repeat(64) })).status, 'changed');
  assert.equal((await checkPpConnection('0966', 'current-draft')).status, 'invalid');
  f.tab.url = edit.replace('/966/', '/42/');
  assert.equal((await checkPpConnection('966', 'current-draft')).status, 'no-source');
  f.tab.url = edit.replace('admin_fixture', 'other_admin');
  assert.equal((await checkPpConnection('966', 'current-draft')).status, 'base-mismatch');
  assert.equal(f.state.injected, 0);
});

test('selected draft reads unsaved provider state once, preserves identities and never owns/closes user tab', async t => {
  const f = fixture(t);
  const response = await readFreshForm('draft-positive', '966', 1, 'current-draft', await f.selection());
  assert.equal(response.status, 'ok'); assert.equal(response.source, 'current-open-page-draft');
  assert.equal(response.cleanup, 'not-created'); assert.equal(response.snapshot!.general.option_title, 'Unsaved current title');
  assert.equal(response.snapshot!.providerAttributeSetId, '479'); assert.equal(response.entityId, '966');
  assert.match(response.reason, /unsaved edits/); assert.equal(f.state.injected, 1);
  assert.equal(f.state.created, 0); assert.equal(f.state.removed, 0); assert.equal(freshFormState(1).status, 'idle');
  assert.doesNotMatch(JSON.stringify(response), /PRIVATE|admin_fixture|\/key\//);
});

for (const scenario of ['stale-token', 'loading', 'wrong-base', 'wrong-entity', 'provider-mismatch', 'navigation', 'pending', 'frame']) {
  test('draft guard blocks ' + scenario + ' without helper or user-tab cleanup', async t => {
    const f = fixture(t); const selection = await f.selection();
    if (scenario === 'stale-token') f.tab.url = edit.replace('PRIVATE_SESSION', 'CHANGED');
    if (scenario === 'loading') f.tab.status = 'loading';
    if (scenario === 'wrong-base') f.tab.url = edit.replace('admin_fixture', 'another_admin');
    if (scenario === 'wrong-entity') f.tab.url = edit.replace('/966/', '/42/');
    if (scenario === 'provider-mismatch') f.state.providerId = '42';
    if (scenario === 'navigation') f.state.after = { ...f.tab, url: edit.replace('/966/', '/42/') };
    if (scenario === 'pending') f.state.after = { ...f.tab, pendingUrl: edit };
    if (scenario === 'frame') f.state.frame = 2;
    const response = await readFreshForm('draft-' + scenario, '966', 1, 'current-draft', selection);
    assert.equal(response.status, 'unavailable'); assert.equal(response.snapshot, undefined);
    assert.equal(response.source, 'current-open-page-draft'); assert.equal(f.state.created, 0); assert.equal(f.state.removed, 0);
  });
}

test('draft cancel enforces owner and discards a hung extraction promptly without closing user tab', async t => {
  const f = fixture(t); f.state.hang = true;
  const pending = readFreshForm('draft-cancel', '966', 1, 'current-draft', await f.selection());
  await f.waitInjected;
  assert.equal((await cancelFreshForm('draft-cancel', 2)).status, 'unavailable');
  assert.equal(freshFormState(1).status, 'reading');
  const cancelled = await cancelFreshForm('draft-cancel', 1);
  assert.equal(cancelled.status, 'cancelled'); assert.equal((await pending).snapshot, undefined);
  assert.equal(f.state.created, 0); assert.equal(f.state.removed, 0); assert.equal(freshFormState(1).status, 'idle');
});

test('direct read rejects implicit source and dashboard permission protects preflight before any tab read', async t => {
  const f = fixture(t);
  assert.equal((await readFreshForm('no-selection', '966', 1, 'current-draft')).status, 'invalid');
  const response: any = await new Promise(resolve => handleUiMessage({ type: 'CHECK_PP_CONNECTION', entityId: '966', referenceSource: 'current-draft' }, { senderUrl: edit, senderFrameId: 0, sendResponse: resolve }));
  assert.equal(response.status, 'unavailable'); assert.equal(f.state.gets, 0); assert.equal(f.state.injected, 0);
});


test('hung direct extraction expires within the 30-second budget and leaves user tab open', async t => {
  const f = fixture(t); f.state.hang = true;
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_900_000_000_000 });
  const pending = readFreshForm('draft-timeout', '966', 1, 'current-draft', await f.selection());
  await f.waitInjected; assert.equal(f.state.injected, 1);
  t.mock.timers.tick(30_000); await flush();
  const response = await pending;
  assert.equal(response.status, 'unavailable'); assert.equal(response.source, 'current-open-page-draft');
  assert.doesNotMatch(response.reason, /fresh Magento form/);
  assert.equal(response.snapshot, undefined); assert.equal(f.state.removed, 0); assert.equal(freshFormState(1).status, 'idle');
});
