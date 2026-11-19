import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
// @ts-expect-error - jsdom ships no types and is only used by DOM tests.
import { JSDOM } from 'jsdom';

import type { ScanPpDraftResponse } from '../src/core/messages/ui';
import { mountPpScan, unmountPpScan } from '../src/page/features/pp-scan';
import { mountPpCatalog, unmountPpCatalog } from '../src/page/features/pp-catalog';
import { scanCurrentPpDraft } from '../src/page/features/pp-scan/page';
import { handleUiMessage } from '../src/entrypoints/background/routers/ui';
import type { PpCatalogResponse } from '../src/shared/ppCatalog';

const ROUTE =
  'https://bestofgifts.pt/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966/key/session';
const SAFE_ROUTE = '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966';
const REGISTRY_MODULE = 'Magento_Ui/js/lib/registry/registry';
const PROVIDER_NAME =
  'toogas_attributesetcustomoptions_attributesetcustomoptions_form.attributesetcustomoptions_form_data_source';

function withProvider<T>(data: unknown, run: (dom: any, getterCalls: () => number) => T, present = true, getPlacement: 'own' | 'inherited' | 'accessor' = 'own'): T {
  const dom = new JSDOM('<!doctype html><main id="root"></main>', { url: ROUTE });
  let getterCallsCount = 0;
  const get = (name: string) => present && name === PROVIDER_NAME ? { data } : undefined;
  const prototype = Object.create(null);
  if (getPlacement === 'inherited') Object.defineProperty(prototype, 'get', { value: get });
  if (getPlacement === 'accessor') Object.defineProperty(prototype, 'get', { get: () => { getterCallsCount += 1; return get; } });
  const registry = getPlacement === 'own' ? { get } : Object.create(prototype);
  const requireFn = Object.assign(() => undefined, {
    s: { contexts: { _: { defined: { [REGISTRY_MODULE]: registry } } } },
  });
  Object.defineProperty(dom.window, 'require', { value: requireFn, configurable: true });
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  try { return run(dom, () => getterCallsCount); }
  finally {
    dom.window.close();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

function liveData(): Record<string, unknown> {
  return {
    attributesetcustomoptions_id: '966',
    attribute_set_id: '479',
    secret: 'must not leave the provider',
    general: {
      option_title: 'PP profile',
      attribute_set_id: ['479'],
      option_type: 6,
      sort_order: '',
      translationsData: '{"1":{"option_title":"PT"}}',
    },
    options: {
      sub_options: { sub_options: [
        { record_id: 0, key_id: 'face-key', name: '{"1":"Face 1"}', sort: '', visible: false, hidden: true, disabled: true, delete: true, secret: 'strip' },
        { record_id: 1, key_id: 'face-key-2', name: '{"1":"Face 2"}', sort: 0 },
      ] },
      sub_options_items: { sub_options_items: [
        { record_id: 0, parent: 'face-key', name: '', name_option: '6', price: 0, sort: 0, disabled: true, delete: false },
      ] },
    },
  };
}

test('reads allowlisted provider fields even when option tables are not rendered', () => {
  withProvider(liveData(), (dom) => {
    dom.window.document.body.innerHTML += '<table data-index="sub_options"><tbody><tr><td>DOM-only false row</td></tr></tbody></table><div class="mhx-items-panel">clone</div>';
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'ok');
    assert.equal(result.entityId, '966');
    assert.equal(result.routePath, SAFE_ROUTE);
    assert.equal(result.providerAttributeSetId, '479');
    assert.deepEqual(result.generalAttributeSetId, ['479']);
    assert.equal(result.locations.rows.length, 2);
    assert.equal(result.locations.rows[0]?.values.sort, '');
    assert.equal(result.locations.rows[1]?.values.sort, 0);
    assert.equal(result.locations.rows[0]?.values.disabled, true);
    assert.equal(result.locations.rows[0]?.values.visible, false);
    assert.equal(result.locations.rows[0]?.values.hidden, true);
    assert.equal(result.locations.rows[0]?.values.delete, true);
    assert.deepEqual(result.locations.rows[0]?.translations.name?.parsed, { '1': 'Face 1' });
    assert.equal(result.items.rows[0]?.values.parent, 'face-key');
    assert.equal(result.items.rows[0]?.values.name, '');
    assert.equal(result.items.rows[0]?.values.price, 0);
    assert.equal(result.items.rows[0]?.values.disabled, true);
    assert.equal(result.items.rows[0]?.values.delete, false);
    assert.ok(result.warnings.some((warning) => warning.includes('does not infer')));
    assert.ok(!JSON.stringify(result).includes('must not leave'));
    assert.ok(!JSON.stringify(result).includes('strip'));
  });
});

test('reads the trusted registry get method from its prototype without invoking accessors', () => {
  withProvider(liveData(), (dom) => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'ok');
    assert.equal(result.locations.rows.length, 2);
  }, true, 'inherited');
  withProvider(liveData(), (_dom, getterCalls) => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'unavailable');
    assert.equal(getterCalls(), 0);
    assert.deepEqual(result.general, {});
  }, true, 'accessor');
  const data = liveData() as any;
  let fieldGetterCalls = 0;
  Object.defineProperty(data.general, 'option_title', { get: () => { fieldGetterCalls += 1; return 'unsafe'; } });
  withProvider(data, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'partial');
    assert.equal(fieldGetterCalls, 0);
    assert.equal(Object.hasOwn(result.general, 'option_title'), false);
  });
});

test('serialized MAIN-world function runs standalone with inherited registry get and safe route', () => {
  const dom = new JSDOM('', { url: ROUTE });
  const data = liveData();
  const registry = Object.create({
    get(name: string) { return name === PROVIDER_NAME ? { data } : undefined; },
  });
  const requireFn = Object.assign(() => undefined, {
    s: { contexts: { _: { defined: { [REGISTRY_MODULE]: registry } } } },
  });
  try {
    const injected = runInNewContext(`(${scanCurrentPpDraft.toString()})()`, {
      window: { location: dom.window.location, require: requireFn },
    }) as ScanPpDraftResponse;
    assert.equal(injected.status, 'ok');
    assert.equal(injected.routePath, SAFE_ROUTE);
    assert.equal(injected.general.option_title, 'PP profile');
    assert.equal(injected.locations.rows.length, 2);
  } finally {
    dom.window.close();
  }
});

test('distinguishes missing collections from present empty collections', () => {
  withProvider({ ...liveData(), options: { sub_options: { sub_options: [] } } }, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.locations.state, 'available');
    assert.deepEqual(result.locations.rows, []);
    assert.equal(result.items.state, 'missing');
    assert.equal(result.status, 'partial');
  });
});

test('rejects provider identity mismatch without returning provider rows', () => {
  withProvider({ ...liveData(), attributesetcustomoptions_id: '967' }, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'identity-mismatch');
    assert.equal(result.entityId, '966');
    assert.equal(result.providerEntityId, '967');
    assert.deepEqual(result.locations.rows, []);
  });
});

test('reports a missing provider and duplicate identifiers without guessing parents', () => {
  withProvider({}, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'unavailable');
    assert.ok(result.warnings.some((warning) => warning.includes('provider is not loaded')));
  }, false);
  const data = liveData() as any;
  data.options.sub_options.sub_options[1].key_id = 'face-key';
  withProvider(data, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'partial');
    assert.ok(result.warnings.some((warning) => warning.includes('Duplicate row identifiers')));
    assert.equal(result.items.rows[0]?.values.parent, 'face-key');
    assert.ok(result.warnings.some((warning) => warning.includes('does not infer location assignments')));
  });
});

test('reports missing identity and parent fields while preserving explicit blanks', () => {
  const data = liveData() as any;
  delete data.options.sub_options.sub_options[0].key_id;
  delete data.options.sub_options_items.sub_options_items[0].parent;
  withProvider(data, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'partial');
    assert.equal(result.locations.identifierGaps, 1);
    assert.equal(result.items.identifierGaps, 1);
    assert.equal(result.locations.rows[0]?.values.sort, '');
    assert.ok(result.warnings.some((warning) => warning.includes('locations 1, items 1')));
  });
});

test('reports malformed translation JSON and bounds oversized collections', () => {
  const data = liveData() as any;
  data.general.translationsData = '{invalid';
  data.options.sub_options.sub_options[0].name = '{invalid';
  data.options.sub_options.sub_options.push(...Array.from({ length: 110 }, (_, i) => ({ record_id: i + 2, key_id: `k${i}` })));
  withProvider(data, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'partial');
    assert.equal(result.locations.rows.length, 100);
    assert.equal(result.locations.truncated, true);
    assert.equal(result.generalTranslations?.parseError, 'Invalid translation JSON.');
    assert.equal(result.locations.rows[0]?.translations.name?.parseError, 'Invalid translation JSON.');
  });
});

test('marks unrecognized provider rows as partial and reports their positions', () => {
  const data = liveData() as any;
  data.options.sub_options.sub_options = [null, 'bad row', {}, { record_id: 7, key_id: 'valid', name: 'Face' }];
  withProvider(data, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.locations.skippedPositions, [0, 1, 2]);
    assert.deepEqual(result.locations.rows.map((row) => row.values.key_id), ['valid']);
    assert.ok(result.warnings.some((warning) => warning.includes('locations [0, 1, 2]')));
  });
});

test('sanitizes non-JSON provider values inside allowlisted fields', () => {
  const data = liveData() as any;
  const cycle: any = {};
  cycle.self = cycle;
  data.general.placeholder = cycle;
  data.general.translations = { '1': { option_title: 'PT', unsafe: () => 'secret' } };
  withProvider(data, () => {
    const result = scanCurrentPpDraft();
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.general.placeholder, { self: '[Circular]' });
    assert.deepEqual(result.general.translations, { '1': { option_title: 'PT', unsafe: null } });
    assert.ok(!JSON.stringify(result).includes('secret'));
  });
});

test('rejects non-top-frame and unsupported-host requests before tab access or injection', async () => {
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  let tabLookups = 0;
  let injections = 0;
  const responses: unknown[] = [];
  Object.defineProperty(globalThis, 'chrome', {
    value: {
      tabs: { get: async () => { tabLookups += 1; throw new Error('must not read this tab'); } },
      scripting: { executeScript: async () => { injections += 1; return []; } },
    },
    configurable: true,
  });
  try {
    for (const context of [
      { senderTabId: 5, senderUrl: ROUTE, senderFrameId: 2 },
      { senderTabId: 5, senderUrl: ROUTE.replace('bestofgifts.pt', 'evil.example'), senderFrameId: 0 },
    ]) {
      assert.equal(handleUiMessage(
        { type: 'SCAN_PP_DRAFT' },
        { ...context, sendResponse: (value) => { responses.push(value); } },
      ), true);
    }
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(responses.length, 2);
    assert.ok(responses.every((response) => (response as ScanPpDraftResponse).status === 'unavailable'));
    assert.ok(responses.every((response) => (response as ScanPpDraftResponse).routePath === SAFE_ROUTE));
    assert.equal(tabLookups, 0);
    assert.equal(injections, 0);
  } finally {
    if (oldChrome) Object.defineProperty(globalThis, 'chrome', oldChrome);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});

test('dispatches a validated scan to the sender tab main world', async () => {
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  let script: any;
  const result: ScanPpDraftResponse = {
    version: 1, status: 'ok', entityId: '966', routePath: SAFE_ROUTE,
    general: {},
    locations: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
    items: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
    warnings: [],
  };
  Object.defineProperty(globalThis, 'chrome', {
    value: {
      tabs: { get: async () => ({ url: ROUTE }) },
      scripting: { executeScript: async (input: unknown) => { script = input; return [{ result }]; } },
    }, configurable: true,
  });
  try {
    const response = await new Promise<unknown>((resolve) => {
      assert.equal(handleUiMessage(
        { type: 'SCAN_PP_DRAFT' },
        { senderTabId: 5, senderUrl: ROUTE, senderFrameId: 0, sendResponse: resolve },
      ), true);
    });
    assert.equal(script.world, 'MAIN');
    assert.deepEqual(script.target, { tabId: 5 });
    assert.equal(script.func, scanCurrentPpDraft);
    assert.deepEqual(response, result);
    assert.ok(!JSON.stringify(response).includes('session'));
  } finally {
    if (oldChrome) Object.defineProperty(globalThis, 'chrome', oldChrome);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});

test('rejects malformed results returned by the main-world scan', async () => {
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  Object.defineProperty(globalThis, 'chrome', {
    value: {
      tabs: { get: async () => ({ url: ROUTE }) },
      scripting: { executeScript: async () => [{ result: { version: 1, status: 'ok', entityId: '966', routePath: SAFE_ROUTE, general: {}, locations: { state: 'available', rows: [], truncated: false, identifierGaps: 0 }, items: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] }, warnings: [] } }] },
    }, configurable: true,
  });
  try {
    const response = await new Promise<unknown>((resolve) => {
      handleUiMessage({ type: 'SCAN_PP_DRAFT' },
        { senderTabId: 5, senderUrl: ROUTE, senderFrameId: 0, sendResponse: (value) => resolve(value) });
    });
    assert.equal((response as ScanPpDraftResponse).status, 'unavailable');
    assert.equal((response as ScanPpDraftResponse).entityId, '966');
  } finally {
    if (oldChrome) Object.defineProperty(globalThis, 'chrome', oldChrome);
    else Reflect.deleteProperty(globalThis, 'chrome');
  }
});

test('keeps the Notion and draft-scan panels stable across repeated mounts', async () => {
  const dom = new JSDOM(
    '<form><div id="native" data-bind="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"><input name="general[option_title]" value="Unsaved"></div></form>',
    { url: ROUTE },
  );
  const globals = globalThis as unknown as Record<string, unknown>;
  const keys = ['window', 'document', 'location', 'Element', 'HTMLElement', 'Event', 'KeyboardEvent', 'chrome'];
  const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const pending: { message: { type: string; code: string }; resolve: (value: unknown) => void }[] = [];
  Object.assign(globals, {
    window: dom.window, document: dom.window.document, location: dom.window.location,
    Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent,
    chrome: { runtime: { sendMessage: (message: { type: string; code: string }) => new Promise((resolve) => pending.push({ message, resolve })) } },
  });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  try {
    mountPpCatalog();
    mountPpScan();
    for (let i = 0; i < 3; i++) { mountPpScan(); mountPpCatalog(); }
    assert.equal(document.querySelectorAll('#mhx-pp-catalog').length, 1);
    assert.equal(document.querySelectorAll('#mhx-pp-draft-scan').length, 1);
    const input = document.querySelector<HTMLInputElement>('#mhx-pp-catalog input')!;
    input.value = '49';
    document.querySelector<HTMLButtonElement>('#mhx-pp-catalog button')!.click();
    assert.deepEqual(pending[0]?.message, { type: 'FETCH_PP_CATALOG', code: '49' });
    const response: PpCatalogResponse = {
      status: 'found', code: '49', checkedAt: '2026-11-14T10:00:00Z', reason: 'Reference read',
      definition: { pageId: 'cbbb6705-ae1f-8227-90c6-01b6be542afc', code: '49', name: 'PP 49',
        reviewStatus: 'Validado', faces: ['Face 1'], options: ['Tampografia'], techniques: ['Tampografia'],
        faceCount: 1, locationCount: 1, body: [], warnings: [], lastEditedAt: null },
    };
    pending[0]!.resolve(response);
    await flush();
    const rendered = document.querySelector('#mhx-pp-catalog')!.textContent;
    for (let i = 0; i < 3; i++) { mountPpCatalog(); mountPpScan(); }
    assert.equal(document.querySelectorAll('#mhx-pp-catalog').length, 1);
    assert.equal(document.querySelectorAll('#mhx-pp-draft-scan').length, 1);
    assert.equal(document.querySelector<HTMLInputElement>('#mhx-pp-catalog input'), input);
    assert.equal(input.value, '49');
    assert.equal(document.querySelector('#mhx-pp-catalog')!.textContent, rendered);

    const native = document.querySelector<HTMLElement>('#native')!;
    native.replaceWith(native.cloneNode(true));
    mountPpCatalog();
    mountPpScan();
    assert.equal(document.querySelectorAll('#mhx-pp-catalog').length, 1);
    assert.equal(document.querySelectorAll('#mhx-pp-draft-scan').length, 1);
    assert.equal(document.querySelector('#mhx-pp-draft-scan')!.nextElementSibling?.id, 'mhx-pp-catalog');
    assert.equal(document.querySelector('#mhx-pp-catalog')!.nextElementSibling?.id, 'native');
  } finally {
    unmountPpScan();
    unmountPpCatalog();
    dom.window.close();
    for (const key of keys) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('shows an unavailable scan reason without rendering an empty snapshot', async () => {
  const dom = new JSDOM(
    '<form><div data-bind="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"></div></form>',
    { url: ROUTE },
  );
  const globals = globalThis as unknown as Record<string, unknown>;
  const keys = ['window', 'document', 'chrome'];
  const saved = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globals, {
    window: dom.window,
    document: dom.window.document,
    chrome: { runtime: { sendMessage: async () => ({
      version: 1, status: 'unavailable', entityId: '966', routePath: SAFE_ROUTE, general: {},
      locations: { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
      items: { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
      warnings: ['The already-loaded Magento registry is unavailable.'],
    } satisfies ScanPpDraftResponse) } },
  });
  try {
    mountPpScan();
    document.querySelector<HTMLButtonElement>('#mhx-pp-draft-scan button')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelector('#mhx-pp-draft-scan [role="status"]')?.textContent,
      'The already-loaded Magento registry is unavailable.');
    assert.equal(document.querySelector('#mhx-pp-draft-scan pre')?.textContent, '');
    assert.equal(document.querySelector<HTMLDetailsElement>('#mhx-pp-draft-scan details')?.open, false);
  } finally {
    unmountPpScan();
    dom.window.close();
    for (const key of keys) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('does not auto-scan and drops responses after draft or native anchor changes', async () => {
  const dom = new JSDOM(
    '<form><div data-bind="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"><input></div></form>',
    { url: ROUTE },
  );
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  let submitCount = 0;
  Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  let resolveMessage!: (value: unknown) => void;
  const sent: unknown[] = [];
  Object.defineProperty(globalThis, 'chrome', {
    value: { runtime: { sendMessage: (message: unknown) => {
      sent.push(message);
      return new Promise((resolve) => { resolveMessage = resolve; });
    } } },
    configurable: true,
  });
  try {
    dom.window.document.querySelector('form')?.addEventListener('submit', () => { submitCount += 1; });
    mountPpScan();
    assert.equal(sent.length, 0);
    const button = dom.window.document.querySelector('button');
    assert.ok(button);
    assert.equal(button.type, 'button');
    button.click();
    assert.equal(submitCount, 0);
    assert.equal(sent.length, 1);
    dom.window.document.querySelector('input')?.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    resolveMessage({ version: 1, status: 'ok', entityId: '966', routePath: SAFE_ROUTE, general: {}, locations: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] }, items: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] }, warnings: [] } satisfies ScanPpDraftResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dom.window.document.querySelector('pre')?.textContent, '');
    assert.match(dom.window.document.querySelector('[role="status"]')?.textContent ?? '', /draft changed/i);

    const secondButton = dom.window.document.querySelector<HTMLButtonElement>(`#mhx-pp-draft-scan button`);
    assert.ok(secondButton);
    secondButton.click();
    dom.window.document.querySelector('[data-bind*="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"]')?.remove();
    mountPpScan();
    resolveMessage({ version: 1, status: 'ok', entityId: '966', routePath: SAFE_ROUTE, general: {}, locations: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] }, items: { state: 'available', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] }, warnings: [] } satisfies ScanPpDraftResponse);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(dom.window.document.querySelector('#mhx-pp-draft-scan'), null);
  } finally {
    unmountPpScan();
    dom.window.close();
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (oldChrome) Object.defineProperty(globalThis, 'chrome', oldChrome); else Reflect.deleteProperty(globalThis, 'chrome');
  }
});
