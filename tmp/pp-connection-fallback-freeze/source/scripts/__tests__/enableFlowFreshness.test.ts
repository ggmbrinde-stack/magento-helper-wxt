import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
// @ts-expect-error - untyped transitive dependency used by existing DOM tests
import { JSDOM } from 'jsdom';

const key = 'mhx:enable:TEST1';
const otherKey = 'mhx:enable:OTHER';
const manualIds = ['images', 'size-order', 'visibility', 'new-colours', 'attribute-translations', 'text-translations'];
const confirmations = { items: Object.fromEntries(manualIds.map((id) => [id, '2026-11-10T10:00:00Z'])) };
const stored: Record<string, unknown> = {};
let removeFails = false;
let deferred: ((value: unknown) => void) | undefined;
let delayFresh = false;
const requests: Array<{ force: boolean }> = [];

function resolution() {
  return { ok: true, resolution: { ok: true, resolver: {
    sku: 'TEST1', product_type: 'simple', child_count: 0, children: [], children_detail: [],
    simple_product_id: 1,
    magento_facts: {
      ppCode: '123', attributeSet: 'AS>PP0123', categoryRead: true, categoryPaths: [['Outros artigos']],
      tierRead: true, tierPrices: [200, 500, 1000, 5000].map((qty, i) => ({ qty, valueType: 'percent', value: [5, 8, 10, 12][i] })),
      priceRead: true, price: { price: 1 }, stockRead: true, stock: { qty: 10, isInStock: true },
      visibilityRead: true, visibility: 'Catalog, Search', status: 'Disabled',
    },
  } } };
}

const api = {
  runtime: {
    id: 'test-extension',
    sendMessage: async (message: { force: boolean }) => {
      requests.push(message);
      if (message.force && delayFresh) return new Promise((resolve) => { deferred = resolve; });
      return resolution();
    },
  },
  storage: {
    local: {
      get: async (name: string) => structuredClone({ [name]: stored[name] }),
      set: async (values: Record<string, unknown>) => { Object.assign(stored, structuredClone(values)); },
      remove: async (name: string) => {
        if (removeFails) throw new Error('Local confirmations could not be cleared');
        delete stored[name];
      },
    },
    session: {
      get: async () => ({ 'mhx:dashboard:workspace': { sku: 'TEST1' } }),
      set: async () => {},
    },
  },
};
const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, chrome: api, browser: api });
const { EnableFlow } = await import('../../src/dashboard/sections/ui/EnableFlow');

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  assert.ok(found, `button ${label} exists`);
  return found;
}

async function step(action: () => void) {
  await act(async () => { action(); await setImmediate(); });
  await act(async () => { await setImmediate(); });
}

async function mount() {
  for (const name of Object.keys(stored)) delete stored[name];
  stored[key] = structuredClone(confirmations);
  stored[otherKey] = structuredClone(confirmations);
  removeFails = false;
  delayFresh = false;
  deferred = undefined;
  requests.length = 0;
  const host = document.createElement('div');
  document.body.append(host);
  await step(() => { render(h(EnableFlow, { onOpen: () => {} }), host); });
  await step(() => { button(host, 'Load checklist').click(); });
  assert.match(host.textContent ?? '', /Ready to enable\./);
  return host;
}

async function unmount(host: HTMLElement) {
  await step(() => { render(null, host); });
  host.remove();
}

test('normal reload preserves per-SKU manual confirmations', async () => {
  const host = await mount();
  try {
    await step(() => { button(host, 'Load checklist').click(); });
    assert.match(host.textContent ?? '', /Ready to enable\./);
    assert.deepEqual(stored[key], confirmations);
    assert.deepEqual(stored[otherKey], confirmations);
  } finally { await unmount(host); }
});

test('same-SKU Re-check clears stored and visible confirmations before a fresh response', async () => {
  const host = await mount();
  try {
    delayFresh = true;
    // The operator may type the same canonical SKU with different casing.
    await step(() => {
      const input = host.querySelector<HTMLInputElement>('input[type=text]')!;
      input.value = 'test1';
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await step(() => { button(host, 'Re-check').click(); });
    assert.doesNotMatch(host.textContent ?? '', /Ready to enable\./);
    assert.equal(stored[key], undefined);
    assert.deepEqual(stored[otherKey], confirmations);
    assert.ok(deferred, 'fresh request is waiting');
    await step(() => { deferred!(resolution()); });
    assert.doesNotMatch(host.textContent ?? '', /Ready to enable\./);
    assert.equal(host.querySelectorAll('input[type=checkbox]:checked').length, 0);
    assert.equal(host.querySelectorAll('input[type=checkbox]').length, manualIds.length);
    await unmount(host);
    await step(() => { render(h(EnableFlow, { onOpen: () => {} }), host); });
    await step(() => { button(host, 'Load checklist').click(); });
    assert.doesNotMatch(host.textContent ?? '', /Ready to enable\./, 'old confirmations cannot return after reopening');
  } finally { await unmount(host); }
});

test('Re-check fails closed when persisted confirmations cannot be removed', async () => {
  const host = await mount();
  try {
    removeFails = true;
    await step(() => { button(host, 'Re-check').click(); });
    assert.doesNotMatch(host.textContent ?? '', /Ready to enable\./);
    assert.match(host.textContent ?? '', /Local confirmations could not be cleared/);
    assert.equal(requests.length, 1, 'no fresh load can reuse uncleared confirmations');
  } finally { await unmount(host); }
});
