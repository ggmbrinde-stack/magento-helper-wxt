import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { freshFormUrl, freshFormIssue, isNativePpReference, readFreshForm, cancelFreshForm, freshFormState } from '../src/entrypoints/background/ppFreshForm';
import { handleUiMessage } from '../src/entrypoints/background/routers/ui';
import type { PpFreshFormResponse } from '../src/core/messages';
import { readPpReadiness } from '../src/page/features/pp-scan/readiness';

const base = 'https://bestofgifts.pt/admin_fixture';
const full = base + '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966/key/PRIVATE_SESSION/';
const globals = globalThis as unknown as Record<string, unknown>;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function settle<T>(t: TestContext, promise: Promise<T>): Promise<T> {
  let done = false; void promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 90 && !done; i++) { await flush(); t.mock.timers.tick(500); }
  await flush(); assert.equal(done, true, 'bounded lifecycle completed'); return promise;
}

function fixture(t: TestContext, config: { scenario?: string; removeFail?: boolean; createWait?: Promise<any>; injectionWait?: Promise<any>; queryWait?: Promise<any>; referenceWait?: Promise<any>; providerReadyAfterMs?: number } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_900_000_000_000 });
  const started = Date.now();
  const previous = globals.chrome, removedListeners = new Set<(id: number) => void>();
  const created: any[] = [], removed: number[] = [], injected: any[] = [], probes: any[] = [], queries: any[] = [], sourceGets: number[] = [], extractionAt: number[] = [];
  let gets = 0, loaderCalls = 0;
  const nativeData: any = { attributesetcustomoptions_id: '966', attribute_set_id: '479', general: { option_title: 'Fresh native form', attribute_set_id: ['479'] },
    options: { sub_options: { sub_options: [] }, sub_options_items: { sub_options_items: [] } } };
  if (config.scenario === 'identity') nativeData.attributesetcustomoptions_id = '49';
  if (config.scenario === 'partial') delete nativeData.options.sub_options_items;
  if (config.scenario === 'missing-id') delete nativeData.attributesetcustomoptions_id;
  if (config.scenario === 'invalid-id') nativeData.attributesetcustomoptions_id = { toString: () => assert.fail('never coerce unknown identity') };
  const provider: any = config.scenario === 'missing-data' ? {} : { data: nativeData };
  const registry = Object.create({ get: () => config.scenario === 'provider' || Date.now() - started < (config.providerReadyAfterMs ?? 0) ? undefined : provider });
  const requireFn = Object.assign(() => { loaderCalls++; }, { s: { contexts: { _: { defined: { 'Magento_Ui/js/lib/registry/registry': registry } } } } });
  if (config.scenario === 'missing-registry') delete (requireFn.s.contexts._.defined as any)['Magento_Ui/js/lib/registry/registry'];
  globals.chrome = { runtime: { getURL: () => 'chrome-extension://fixture/dashboard.html' },
    storage: { local: { get: async (keys: string[]) => { assert.deepEqual(keys, ['adminBaseUrl']); return { adminBaseUrl: config.scenario === 'base' ? 'https://example.org/admin' : config.scenario === 'no-base' ? '' : base }; } } },
    tabs: { create: async (options: any) => { created.push(options); if (config.scenario === 'create') throw new Error('PRIVATE_SESSION'); return config.createWait ?? { id: 77 }; },
      get: async (id: number) => {
        if (id === 88) {
          sourceGets.push(id);
          if (config.scenario === 'source-closed') throw new Error('PRIVATE_SESSION');
          return config.referenceWait ?? { id, status: 'complete', url: config.scenario === 'source-changed' ? full.replace('PRIVATE_SESSION', 'CHANGED_SESSION') : full };
        }
        assert.equal(id, 77); gets++;
        const url = config.scenario === 'login' ? base + '/admin/auth/login/' :
          config.scenario === 'redirect' ? 'https://example.org/admin/' :
          config.scenario === 'entity-route' || (config.scenario === 'stale' && gets > 1) ? full.replace('/966/', '/49/') : full;
        return { id, url, status: config.scenario === 'timeout' ? 'loading' : 'complete' };
      }, remove: async (id: number) => { assert.equal(id, 77); removed.push(id); if (config.removeFail) throw new Error('remove failed');
        for (const listener of [...removedListeners]) listener(id);
      }, onRemoved: { addListener: (fn: (id: number) => void) => removedListeners.add(fn), removeListener: (fn: (id: number) => void) => removedListeners.delete(fn) },
      query: async (options: any) => {
        queries.push(options);
        assert.deepEqual(options, { url: [full.replace('/key/PRIVATE_SESSION/', ''), full.replace('key/PRIVATE_SESSION/', '*')] });
        if (config.queryWait) return config.queryWait;
        if (config.scenario === 'no-source') return [];
        const source = { id: 88, url: full, status: 'complete' };
        if (config.scenario === 'multiple-sources') return [source, { ...source, id: 89 }];
        if (config.scenario === 'source-wrong-record') return [{ ...source, url: full.replace('/966/', '/49/') }];
        if (config.scenario === 'source-wrong-action') return [{ ...source, url: full.replace('/edit/', '/save/') }];
        if (config.scenario === 'source-wrong-host') return [{ ...source, url: full.replace('bestofgifts.pt', 'example.org') }];
        if (config.scenario === 'source-pending') return [{ ...source, pendingUrl: full }];
        return [source];
      }, update: () => { throw new Error('No tab navigation'); } },
    scripting: { executeScript: async (options: any) => {
      const probe = options.func === readPpReadiness;
      (probe ? probes : injected).push(options); assert.deepEqual(options.target, { tabId: 77, frameIds: [0] }); assert.equal(options.world, 'MAIN');
      if (!probe) extractionAt.push(Date.now() - started);
      if (!probe && config.injectionWait) return config.injectionWait;
      if (probe && config.scenario === 'no-checkpoint') return [];
      if (!probe && config.scenario === 'no-result') return [{ frameId: 0 }];
      if (!probe && config.scenario === 'invalid-result') return [{ frameId: 0, result: { unexpected: 'SYNTHETIC_PRIVATE/key/secret' } }];
      if (!probe && config.scenario === 'scan-throws') throw new Error('SYNTHETIC_PRIVATE/key/secret');
      const result = runInNewContext('(' + options.func.toString() + ')(...args)', { args: options.args ?? [], document: { readyState: 'complete' }, window: { location: { pathname: new URL(full).pathname }, require: requireFn } });
      if (probe) result.extraUrl = 'SYNTHETIC_PRIVATE/key/secret';
      if (!probe && config.scenario === 'unknown-warning') { result.status = 'unavailable'; result.warnings = ['SYNTHETIC_PRIVATE/key/secret']; }
      return [{ frameId: config.scenario === 'frame' ? 2 : 0,
        result }];
    } } };
  t.after(() => { globals.chrome = previous; });
  return { config, created, removed, injected, probes, extractionAt, queries, sourceGets, nativeData, elapsed: () => Date.now() - started, loaderCalls: () => loaderCalls, manualClose: () => { for (const fn of [...removedListeners]) fn(77); }, listeners: removedListeners };
}

test('fresh target accepts only a configured allowed HTTPS admin base and exact positive entity', () => {
  assert.equal(freshFormUrl(base, '966'), full.replace('/key/PRIVATE_SESSION/', '/'));
  for (const invalid of ['http://bestofgifts.pt/admin', 'https://example.org/admin', 'https://bestofgifts.pt:444/admin',
    base + '/key/SECRET/', base + '?key=SECRET', base + '#SECRET', 'https://user:pass@bestofgifts.pt/admin', 'https://bestofgifts.pt/']) assert.equal(freshFormUrl(invalid, '966'), null);
  for (const id of ['', '0', '0966', ' 966', '966/49', '-1', 966]) assert.equal(freshFormUrl(base, id), null);
});

test('invalid input reports the exact failing field instead of one shared message', () => {
  assert.equal(freshFormIssue(base, '966'), null);
  for (const id of ['', '0', '0966', ' 966', '966/49', '-1', 'PP0482', 966]) assert.equal(freshFormIssue(base, id), 'entity');
  for (const missing of ['', '   ', undefined, null]) assert.equal(freshFormIssue(missing, '966'), 'missing-base');
  for (const rejected of ['http://bestofgifts.pt/admin', 'https://example.org/admin', 'https://www.bestofgifts.pt/admin',
    'https://bestofgifts.pt:444/admin', base + '/key/SECRET/', base + '?key=SECRET', base + '#SECRET',
    'https://user:pass@bestofgifts.pt/admin', 'https://bestofgifts.pt/', 'not a url']) assert.equal(freshFormIssue(rejected, '966'), 'rejected-base');
  assert.equal(freshFormUrl(base, '966'), full.replace('/key/PRIVATE_SESSION/', '/'));
  assert.equal(freshFormUrl('https://example.org/admin', '966'), null);
});

test('native reference accepts only the entire exact edit address and optional native key segment', () => {
  const target = freshFormUrl(base, '966')!;
  for (const valid of [full, target, target.replace(/\/$/, '')]) assert.equal(isNativePpReference(valid, target), true);
  for (const invalid of [
    full.replace('bestofgifts.pt', 'example.org'), full.replace('https:', 'http:'), full.replace('/966/', '/49/'),
    full.replace('/edit/', '/save/'), full.replace('/edit/', '/delete/'), full.replace('/admin_fixture/', '/other_admin/'),
    full + '?form_key=PRIVATE_QUERY', full + '#PRIVATE_FRAGMENT', full + '?', full + '#',
    full.replace('https://', 'https://user:PRIVATE_PASSWORD@'), full + 'back/edit/',
    full.replace('PRIVATE_SESSION', 'PRIVATE%2FSESSION'), full.replace('PRIVATE_SESSION', 'x'.repeat(257)),
    full.replace('key/PRIVATE_SESSION/', 'key/PRIVATE_SESSION/key/OTHER/'),
  ]) assert.equal(isNativePpReference(invalid, target), false);
});

for (const scenario of ['no-source', 'multiple-sources', 'source-wrong-record', 'source-wrong-action', 'source-wrong-host', 'source-pending', 'source-changed', 'source-closed']) {
  test(`native reference: ${scenario} blocks before opening or inspecting any page`, async t => {
    const f = fixture(t, { scenario });
    const response = await settle(t, readFreshForm('reference-' + scenario, '966', 1));
    assert.equal(response.status, 'unavailable'); assert.equal(response.cleanup, 'not-created');
    assert.equal(f.created.length, 0); assert.equal(f.injected.length, 0); assert.equal(f.removed.length, 0);
    assert.doesNotMatch(JSON.stringify(response), /PRIVATE|admin_fixture|key\//);
    if (scenario === 'no-source') assert.match(response.reason, /Open Magento record 966.*draft remains untouched/);
    if (scenario === 'multiple-sources') assert.match(response.reason, /Keep only one reference/);
    if (scenario === 'source-changed') assert.match(response.reason, /reference tab changed/);
  });
}

test('cancelling during reference discovery or final source recheck creates no helper and touches no draft', async t => {
  let resolveQuery!: (value: any) => void;
  const f = fixture(t, { queryWait: new Promise(resolve => { resolveQuery = resolve; }) });
  const pending = readFreshForm('cancel-query', '966', 1); await flush();
  const stopped = cancelFreshForm('cancel-query', 1);
  resolveQuery([{ id: 88, status: 'complete', url: full }]);
  assert.equal((await settle(t, pending)).status, 'cancelled'); await stopped;
  assert.equal(f.created.length, 0); assert.equal(f.sourceGets.length, 0); assert.equal(f.injected.length, 0);
  let resolveSource!: (value: any) => void;
  f.config.queryWait = Promise.resolve([{ id: 88, status: 'complete', url: full }]);
  f.config.referenceWait = new Promise(resolve => { resolveSource = resolve; });
  const recheck = readFreshForm('cancel-recheck', '966', 1); await flush();
  const stoppedAgain = cancelFreshForm('cancel-recheck', 1);
  resolveSource({ id: 88, status: 'complete', url: full });
  assert.equal((await settle(t, recheck)).status, 'cancelled'); await stoppedAgain;
  assert.equal(f.created.length, 0); assert.equal(f.removed.length, 0); assert.equal(f.injected.length, 0);
});

test('fresh load uses a new inactive tab and serialized inherited-registry reader, then closes only the owned tab', async t => {
  const f = fixture(t);
  const response = await settle(t, readFreshForm('positive', '966', 1));
  assert.equal(response.status, 'ok'); assert.equal(response.source, 'fresh-magento-form-load'); assert.equal(response.cleanup, 'closed');
  assert.equal(response.snapshot!.general.option_title, 'Fresh native form'); assert.equal(f.loaderCalls(), 0);
  assert.equal(f.created.length, 1); assert.equal(f.created[0].active, false); assert.equal(f.created[0].url, full, 'native address copied byte-for-byte without key or entity substitution');
  assert.equal(f.queries.length, 1); assert.deepEqual(f.sourceGets, [88]);
  assert.deepEqual(f.removed, [77]); assert.equal(f.listeners.size, 0); assert.equal(freshFormState(1).status, 'idle');
  assert.doesNotMatch(JSON.stringify(response), /PRIVATE|admin_fixture|key\//);
});

test('a provider initialized after twenty seconds still gets the documented readiness budget', async t => {
  const f = fixture(t, { providerReadyAfterMs: 20_000 });
  const response = await settle(t, readFreshForm('late-provider', '966', 1));
  assert.equal(response.status, 'ok', 'provider became ready inside the thirty-second budget');
  assert.ok(f.elapsed() >= 20_000 && f.elapsed() <= 31_000);
  assert.equal(response.cleanup, 'closed');
});

test('an unavailable provider uses the readiness window rather than stopping after five seconds', async t => {
  const f = fixture(t, { scenario: 'provider' });
  const response = await settle(t, readFreshForm('full-readiness-window', '966', 1));
  assert.equal(response.status, 'unavailable');
  assert.ok(f.elapsed() >= 29_000, 'elapsed readiness time: ' + f.elapsed());
  assert.ok(f.elapsed() <= 31_000); assert.equal(response.cleanup, 'closed');
  assert.ok(f.probes.length <= 61); assert.ok(f.injected.length <= 10);
  assert.ok(f.extractionAt.at(-1)! - f.extractionAt[0]! >= 28_000, 'extraction attempts span the readiness budget');
  assert.equal(response.readiness!.last!.stage, 'provider-unavailable'); assert.equal(response.readiness!.lastScanStatus, 'unavailable');
  assert.ok(response.readiness!.warningCodes.includes('provider-unavailable'));
});

for (const [scenario, stage, scan] of [
  ['missing-registry', 'registry-unavailable', 'unavailable'], ['missing-data', 'data-unavailable', 'unavailable'],
  ['missing-id', 'identity-missing', 'ok'], ['invalid-id', 'identity-invalid', undefined],
  ['no-result', 'ready', 'no-result'], ['invalid-result', 'ready', 'invalid-result'],
  ['scan-throws', 'ready', 'injection-error'], ['unknown-warning', 'ready', 'unavailable'],
] as const) {
  test('safe helper diagnostics distinguish ' + scenario, async t => {
    const f = fixture(t, { scenario });
    const response = await settle(t, readFreshForm('diagnostic-' + scenario, '966', 1));
    assert.equal(response.status, 'unavailable'); assert.equal(response.readiness!.last!.stage, stage); assert.equal(response.readiness!.lastScanStatus, scan);
    assert.equal(response.snapshot, undefined); assert.equal(response.cleanup, 'closed');
    assert.doesNotMatch(JSON.stringify(response), /SYNTHETIC|PRIVATE|key\//);
    if (scenario === 'missing-id') assert.ok(response.readiness!.warningCodes.includes('identity-missing'));
    if (scenario === 'no-result') assert.deepEqual(response.readiness!.warningCodes, ['no-scan-result']);
    if (scenario === 'unknown-warning') assert.deepEqual(response.readiness!.warningCodes, ['scan-error']);
    assert.ok(f.injected.length <= 10);
  });
}

test('a missing diagnostic-probe result does not disable the original full scanner', async t => {
  fixture(t, { scenario: 'no-checkpoint' });
  const response = await settle(t, readFreshForm('probe-unavailable', '966', 1));
  assert.equal(response.status, 'ok'); assert.equal(response.readiness!.last!.stage, 'read-error'); assert.equal(response.readiness!.lastScanStatus, 'ok');
});

test('cancelling a never-settling extraction promptly closes only the helper and releases the reader', async t => {
  const f = fixture(t, { injectionWait: new Promise(() => {}) });
  const pending = readFreshForm('cancel-hung-extraction', '966', 1); await flush();
  const response = await settle(t, cancelFreshForm('cancel-hung-extraction', 1));
  assert.equal(response.status, 'cancelled'); assert.equal(response.cleanup, 'closed'); assert.ok(f.elapsed() < 2000);
  assert.deepEqual(f.removed, [77]); assert.equal((await pending).status, 'cancelled');
});

for (const scenario of ['base', 'no-base', 'create', 'login', 'redirect', 'entity-route', 'identity', 'provider', 'timeout', 'stale', 'frame', 'partial']) {
  test(`fresh lifecycle: ${scenario} is explicit and always cleans up created tabs`, async t => {
    const f = fixture(t, { scenario });
    const response = await settle(t, readFreshForm('case-' + scenario, '966', 1));
    assert.equal(response.status, ['base', 'no-base'].includes(scenario) ? 'invalid' : scenario === 'login' ? 'auth' : scenario === 'partial' ? 'partial' : 'unavailable');
    assert.equal(response.cleanup, ['base', 'no-base', 'create'].includes(scenario) ? 'not-created' : 'closed');
    assert.equal(f.removed.length, ['base', 'no-base', 'create'].includes(scenario) ? 0 : 1);
    assert.ok(f.injected.length <= 10); assert.doesNotMatch(JSON.stringify(response), /PRIVATE|key\//);
    if (scenario === 'base') assert.match(response.reason, /saved admin base URL is not accepted/);
    if (scenario === 'no-base') assert.match(response.reason, /Admin base URL is not set/);
    if (scenario !== 'partial') assert.equal(response.snapshot, undefined);
  });
}

test('cancellation before creation resolves closes the owned tab without injection; duplicate reads are blocked', async t => {
  let resolveCreate!: (value: any) => void;
  const f = fixture(t, { createWait: new Promise(resolve => { resolveCreate = resolve; }) });
  const pending = readFreshForm('cancel-create', '966', 1); await flush();
  assert.equal((await readFreshForm('duplicate', '966', 1)).status, 'busy');
  const cancelled = cancelFreshForm('cancel-create', 1); resolveCreate({ id: 77 });
  const response = await settle(t, pending);
  assert.equal(response.status, 'cancelled'); assert.equal(response.cleanup, 'closed'); assert.equal(f.injected.length, 0);
  assert.deepEqual(f.removed, [77]); assert.equal((await cancelled).cleanup, 'closed');
});

test('cancellation during a pending injection closes immediately and ignores late extraction', async t => {
  let resolveInjection!: (value: any) => void;
  const f = fixture(t, { injectionWait: new Promise(resolve => { resolveInjection = resolve; }) });
  const pending = readFreshForm('cancel-injection', '966', 1); await flush();
  const cancelled = cancelFreshForm('cancel-injection', 1); await flush(); assert.deepEqual(f.removed, [77]);
  resolveInjection([{ frameId: 0, result: {} }]);
  const response = await settle(t, pending); assert.equal(response.status, 'cancelled'); assert.equal(response.snapshot, undefined);
  assert.equal((await cancelled).cleanup, 'closed'); assert.equal(f.removed.length, 1);
});

test('cancel arriving before read prevents an unrequested tab; a different dashboard cannot cancel another job', async t => {
  const f = fixture(t, { scenario: 'timeout' });
  await cancelFreshForm('early-cancel', 1);
  assert.equal((await readFreshForm('early-cancel', '966', 1)).status, 'cancelled'); assert.equal(f.created.length, 0);
  const pending = readFreshForm('owner', '966', 1); await flush();
  assert.equal((await cancelFreshForm('owner', 2)).status, 'unavailable'); assert.equal(f.removed.length, 0);
  const cancelled = cancelFreshForm('owner', 1); await settle(t, pending); await cancelled;
  assert.deepEqual(f.removed, [77]);
});

test('cleanup failure is returned, blocks further reads, and can be retried or manually closed', async t => {
  const f = fixture(t, { removeFail: true });
  const response = await settle(t, readFreshForm('cleanup', '966', 1));
  assert.equal(response.status, 'cleanup-failed'); assert.equal(response.leftoverTabId, 77); assert.equal(response.cleanup, 'failed');
  assert.equal(freshFormState(1).status, 'cleanup-failed');
  assert.equal(freshFormState(2).status, 'cleanup-failed', 'leftover helper remains visible in another own dashboard');
  assert.equal((await readFreshForm('blocked', '966', 1)).status, 'cleanup-failed'); assert.equal(f.created.length, 1);
  assert.equal((await cancelFreshForm('cleanup', 1)).cleanup, 'failed');
  f.config.removeFail = false;
  assert.equal((await cancelFreshForm('cleanup', 2)).cleanup, 'closed'); assert.equal(freshFormState(1).status, 'idle');
  f.config.removeFail = true;
  await settle(t, readFreshForm('manual-cleanup', '966', 1)); f.manualClose();
  assert.equal(freshFormState(1).status, 'idle'); assert.equal(f.listeners.size, 0);
});

test('fresh messages reject non-dashboard senders before browser or settings access', async t => {
  const f = fixture(t);
  for (const type of ['READ_PP_FRESH_FORM', 'CANCEL_PP_FRESH_FORM', 'GET_PP_FRESH_FORM_STATE']) {
    for (const senderUrl of [full, 'chrome-extension://other/dashboard.html', 'chrome-extension://fixture/sidepanel.html']) {
      let response: PpFreshFormResponse | undefined;
      assert.equal(handleUiMessage({ type, requestId: 'guard', entityId: '966' }, { senderUrl, senderFrameId: 0, sendResponse: raw => { response = raw as PpFreshFormResponse; } }), true);
      assert.equal(response?.status, 'unavailable');
    }
  }
  assert.equal(f.created.length, 0); assert.equal(f.removed.length, 0);
});
