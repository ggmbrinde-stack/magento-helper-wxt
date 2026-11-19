import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error - untyped transitive dependency
import { JSDOM } from 'jsdom';
import { mountPpCatalog, unmountPpCatalog } from '../src/page/features/pp-catalog';
import { ppCatalogEntity, type PpCatalogResponse } from '../src/shared/ppCatalog';

const url = 'https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966/key/not-a-real-key/';
const reply = (code: string): PpCatalogResponse => ({
  status: 'found', code, checkedAt: '2026-11-13T10:01:00.000Z', reason: 'Reference read',
  definition: { pageId: 'cbbb6705-ae1f-8227-90c6-01b6be542afc', code,
    name: '<img src=x onerror=alert(1)>', reviewStatus: 'A rever', faces: ['Face 1', 'Face 2'],
    options: ['Tampografia 1 Cor'], techniques: null, faceCount: null, locationCount: 6,
    body: ['Face 1 / Face 2 | distribution unconfirmed'], warnings: ['No per-location mapping is established.'], lastEditedAt: null },
});

function fixture() {
  const dom = new JSDOM(`<!doctype html><html><body><form>
    <button id="native-save">Save</button><div id="native" data-bind="scope: 'toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas'">
    <input name="general[option_title]" value="Unsaved native draft"><table data-index="sub_options"><tbody><tr><td>Face 1</td></tr></tbody></table></div>
    </form></body></html>`, { url });
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const key of ['window', 'document', 'location', 'Element', 'HTMLElement', 'Event', 'KeyboardEvent']) globals[key] = dom.window[key];
  const pending: { message: { type: string; code: string }; resolve: (value: unknown) => void; reject: () => void }[] = [];
  globals.chrome = { runtime: { sendMessage: (message: { type: string; code: string }) => new Promise((resolve, reject) => pending.push({ message, resolve, reject: () => reject(new Error('fixture')) })) } };
  let changes = 0, submissions = 0;
  const native = document.querySelector<HTMLElement>('#native')!;
  const before = native.outerHTML;
  native.addEventListener('input', () => changes++);
  native.addEventListener('change', () => changes++);
  document.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); submissions++; });
  mountPpCatalog();
  const input = () => document.querySelector<HTMLInputElement>('#mhx-pp-catalog input')!;
  const load = (code: string) => { input().value = code; document.querySelector<HTMLButtonElement>('#mhx-pp-catalog button')!.click(); };
  return { dom, pending, native, before, input, load, changes: () => changes, submissions: () => submissions,
    close: () => { unmountPpCatalog(); dom.window.close(); delete globals.chrome; } };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('connected panel sends exact text, renders safe reference details and leaves the native draft untouched', async () => {
  const f = fixture();
  try {
    mountPpCatalog();
    assert.equal(document.querySelectorAll('#mhx-pp-catalog').length, 1);
    assert.equal(f.pending.length, 0, 'no automatic lookup on mount');
    f.load(' 0049 ');
    assert.deepEqual(f.pending[0]!.message, { type: 'FETCH_PP_CATALOG', code: ' 0049 ' });
    f.pending[0]!.resolve(reply(' 0049 ')); await flush();
    const panel = document.querySelector<HTMLElement>('#mhx-pp-catalog')!;
    assert.match(panel.textContent!, /A rever/);
    assert.match(panel.textContent!, /Tampografia 1 Cor/);
    assert.match(panel.textContent!, /Number of faces: unknown/);
    assert.match(panel.textContent!, /does not establish/);
    assert.match(panel.textContent!, /Checked: 2026-11-13/);
    assert.equal(panel.querySelector('img, script'), null);
    const link = panel.querySelector<HTMLAnchorElement>('a')!;
    assert.equal(link.href, 'https://www.notion.so/cbbb6705ae1f822790c601b6be542afc');
    assert.equal(link.href.includes('key'), false);
    assert.equal(f.native.outerHTML, f.before);
    assert.equal(f.changes(), 0);
    assert.equal(f.submissions(), 0);
    assert.ok(Array.from(panel.querySelectorAll('button')).every(button => button.type === 'button'));
    assert.equal(new f.dom.window.FormData(document.querySelector('form')).get('general[option_title]'), 'Unsaved native draft');
    assert.equal(Array.from(new f.dom.window.FormData(document.querySelector('form')).keys()).length, 1);
  } finally { f.close(); }
});

test('new requests and input edits invalidate older responses', async () => {
  const f = fixture();
  try {
    f.load('49'); f.load('50');
    f.pending[1]!.resolve(reply('50')); await flush();
    f.pending[0]!.resolve(reply('49')); await flush();
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /Exact requested code: 50/);
    f.load('51');
    f.input().value = '52'; f.input().dispatchEvent(new Event('input', { bubbles: true }));
    f.pending[2]!.resolve(reply('51')); await flush();
    assert.doesNotMatch(document.querySelector('#mhx-pp-catalog')!.textContent!, /Exact requested code: 51/);
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /Code changed/);
  } finally { f.close(); }
});

test('route replacement and explicit cleanup discard pending responses without touching native controls', async () => {
  const f = fixture();
  try {
    f.load('49');
    f.dom.window.history.replaceState({}, '', '/admin/catalog/product/edit/id/1/');
    f.pending[0]!.resolve(reply('49')); await flush();
    assert.doesNotMatch(document.querySelector('#mhx-pp-catalog')!.textContent!, /A rever/);
    mountPpCatalog();
    assert.equal(document.querySelector('#mhx-pp-catalog'), null);
    assert.equal(f.native.outerHTML, f.before);
    f.dom.window.history.replaceState({}, '', url);
    mountPpCatalog(); f.load('49');
    unmountPpCatalog();
    f.pending[1]!.resolve(reply('49')); await flush();
    assert.equal(document.querySelector('#mhx-pp-catalog'), null);
  } finally { f.close(); }
});

test('native replacement discards old lookup and completes a fresh lookup without submitting Magento', async () => {
  const f = fixture();
  try {
    const oldPanel = document.querySelector('#mhx-pp-catalog')!;
    f.load('old-anchor');
    f.native.replaceWith(f.native.cloneNode(true)); mountPpCatalog(); mountPpCatalog();
    assert.equal(oldPanel.isConnected, false, 'replace the panel bound to the old native anchor');
    assert.equal(document.querySelectorAll('#mhx-pp-catalog').length, 1);
    f.input().value = '49';
    const enter = new f.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    f.input().dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    assert.equal(f.pending.length, 2);
    assert.equal(f.submissions(), 0);
    f.pending[0]!.resolve(reply('old-anchor')); await flush();
    assert.doesNotMatch(document.querySelector('#mhx-pp-catalog')!.textContent!, /Exact requested code: old-anchor/);
    f.pending[1]!.resolve(reply('49')); await flush();
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /Exact requested code: 49/);
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /A rever/);
  } finally { f.close(); }
});

test('invalid, mismatched and failed responses are explicit rather than a reference match', async () => {
  const f = fixture();
  try {
    f.load('49'); f.pending[0]!.resolve(reply('PP49')); await flush();
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /invalid or mismatched/);
    f.load('49'); f.pending[1]!.resolve({ status: 'found', definition: { name: 'unsafe' } }); await flush();
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /invalid or mismatched/);
    f.load('49'); f.pending[2]!.reject(); await flush();
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /could not complete/);
    f.load('49'); f.pending.at(-1)!.resolve({ status: 'found', code: '49', checkedAt: 'now', reason: 'Missing definition' }); await flush();
    assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, /invalid or mismatched/);
    for (const status of ['not-found', 'multiple', 'auth', 'access', 'network', 'partial', 'unavailable'] as const) {
      f.load('49'); f.pending.at(-1)!.resolve({ status, code: '49', checkedAt: 'now', reason: 'Explicit fixture state' }); await flush();
      assert.match(document.querySelector('#mhx-pp-catalog')!.textContent!, new RegExp(status));
      assert.equal(document.querySelector('#mhx-pp-catalog a'), null);
    }
  } finally { f.close(); }
});

test('page scope excludes storefronts, other hosts, unrelated routes and records without identity', () => {
  assert.equal(ppCatalogEntity(url), '966');
  for (const other of ['https://example.com'+new URL(url).pathname, 'https://bestofgifts.pt/a-product.html',
    'https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/new/',
    'https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/', 'invalid']) {
    assert.equal(ppCatalogEntity(other), null);
  }
});
