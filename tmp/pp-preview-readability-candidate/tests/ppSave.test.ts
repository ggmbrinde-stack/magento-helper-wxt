import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error - jsdom ships no types and is only used by DOM tests.
import { JSDOM } from 'jsdom';
import { pressPpSave, readPpItemPairs, readPpSaveOutcome, ppItemPair } from '../src/page/features/pp-scan/save';
import { isPpHelperEditUrl } from '../src/entrypoints/background/ppFreshForm';
import { ppSavedVerification } from '../src/dashboard/sections/ui/ppPreviewModel';
import type { ScanPpDraftResponse } from '../src/core/messages';

function withPage(html: string, run: (document: any) => void): void {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/42/',
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
  try {
    run(dom.window.document);
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
}

// chrome.scripting serialises the function alone, so any module-scope name is undefined.
const detach = (fn: unknown): (() => any) => new Function(`return (${String(fn)})`)();

test('the injected Save helpers need no module scope', () => {
  withPage('<button id="save" type="button">Save</button><div class="message-success">Saved.</div>', (document: any) => {
    let clicks = 0;
    document.querySelector('#save').addEventListener('click', () => { clicks += 1; });
    const pressed = detach(pressPpSave)();
    assert.equal(pressed.clicked, true);
    assert.equal(clicks, 1);
    const outcome = detach(readPpSaveOutcome)();
    assert.deepEqual(outcome.success, ['Saved.']);
  });
});

test('the helper address is matched by record, not by key or query', () => {
  const base = 'https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/';
  assert.equal(isPpHelperEditUrl(`${base}42/key/abc123/`, '42'), true);
  assert.equal(isPpHelperEditUrl(`${base}42/?SID=xyz`, '42'), true);
  assert.equal(isPpHelperEditUrl(`${base}42/`, '42'), true);
  assert.equal(isPpHelperEditUrl(`${base}43/key/abc123/`, '42'), false);
  assert.equal(isPpHelperEditUrl('https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/index/', '42'), false);
  assert.equal(isPpHelperEditUrl(undefined, '42'), false);
});

test('the native Save is pressed, never Save and Continue', () => {
  withPage('<div class="page-actions"><button id="save" type="button">Save</button>' +
    '<button id="save_and_continue" type="button">Save and Continue Edit</button></div>', (document: any) => {
    const clicked: string[] = [];
    document.querySelector('#save').addEventListener('click', () => clicked.push('save'));
    document.querySelector('#save_and_continue').addEventListener('click', () => clicked.push('continue'));
    const result = pressPpSave();
    assert.equal(result.clicked, true);
    assert.equal(result.label, 'Save');
    assert.deepEqual(clicked, ['save']);
  });
});

test('a disabled Save is refused, not clicked', () => {
  withPage('<button id="save" type="button" disabled>Save</button>', (document: any) => {
    let clicks = 0;
    document.querySelector('#save').addEventListener('click', () => { clicks += 1; });
    const result = pressPpSave();
    assert.equal(result.clicked, false);
    assert.match(result.reason, /disabled/);
    assert.equal(clicks, 0);
  });
});

test('a missing Save is reported instead of guessed', () => {
  withPage('<div class="page-actions"><a href="#">Back</a></div>', () => {
    const result = pressPpSave();
    assert.equal(result.clicked, false);
    assert.match(result.reason, /not found/);
  });
});

test('a Save inside a modal is never used', () => {
  withPage('<div class="modal-popup"><button id="save" type="button">Save</button></div>' +
    '<button data-ui-id="page-actions-buttons-save" type="button">Save</button>', (document: any) => {
    const clicked: string[] = [];
    for (const node of Array.from(document.querySelectorAll('button')) as any[]) {
      node.addEventListener('click', () => clicked.push(node.closest('.modal-popup') ? 'modal' : 'page'));
    }
    const result = pressPpSave();
    assert.equal(result.clicked, true);
    assert.deepEqual(clicked, ['page']);
  });
});

test('Magento success and validation messages are read back', () => {
  withPage('<div class="message-success">You saved the custom option.</div>' +
    '<div class="admin__field-error">Name is required.</div>' +
    '<div id="mhx-pp-catalog"><div class="message-error">extension note</div></div>', (document: any) => {
    const outcome = readPpSaveOutcome();
    assert.deepEqual(outcome.success, ['You saved the custom option.']);
    assert.deepEqual(outcome.errors, ['Name is required.']);
  });
});

test('the read-back compares the written rows with the stored ones', () => {
  const snapshot = {
    version: 1,
    status: 'ok',
    entityId: '42',
    routePath: '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/42',
    general: {},
    locations: {
      state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [],
      rows: [{ position: 0, values: { key_id: 'k1', name: { '1': 'Face 1' } }, translations: {} }],
    },
    items: {
      state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [],
      rows: [
        { position: 0, values: { parent: 'k1', name_option: '1', record_id: '0' }, translations: {} },
        { position: 1, values: { parent: 'k1', name_option: '11', record_id: '1' }, translations: {} },
      ],
    },
    warnings: [],
  } as unknown as ScanPpDraftResponse;
  const result = ppSavedVerification([
    { magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
    { magentoFace: 'face 1', technique: 'Laser Metal', catalogueId: '11' },
    { magentoFace: 'Face 2', technique: 'Laser Metal', catalogueId: '11' },
  ], snapshot);
  assert.equal(result.checked, 3);
  assert.equal(result.found.length, 2);
  assert.equal(result.missing.length, 1);
  assert.deepEqual(result.misplaced, [], 'the stored rows keep the planned order');
  assert.match(result.missing[0]!, /Face 2/);
});

test('the injected row reader uses the same keys as the plan, so a reloaded form is caught', () => {
  withPage('<table><tr><td>' +
    '<select name="groups[0][options][sub_options_items][0][parent]"><option value="k1" selected>Face 1</option></select>' +
    '<select name="groups[0][options][sub_options_items][0][name_option]"><option value="">-- Please Select --</option>' +
    '<option value="11" selected>Laser Metal</option></select>' +
    '</td></tr></table>', () => {
    const read = detach(readPpItemPairs);
    assert.deepEqual(read(), [ppItemPair('Face 1', '11')]);
    assert.deepEqual(read(), [ppItemPair('face  1', '11')]);
    assert.notDeepEqual(read(), [ppItemPair('Face 2', '11')]);
  });
});

test('the save pre-check reader reports a repeated pair once per row', () => {
  withPage('<table><tr><td>' +
    '<select name="groups[0][options][sub_options_items][0][parent]"><option value="k1" selected>Caixa</option></select>' +
    '<select name="groups[0][options][sub_options_items][0][name_option]"><option value="19" selected>Laser</option></select>' +
    '</td></tr><tr><td>' +
    '<select name="groups[0][options][sub_options_items][1][parent]"><option value="k1" selected>Caixa</option></select>' +
    '<select name="groups[0][options][sub_options_items][1][name_option]"><option value="19" selected>Laser</option></select>' +
    '</td></tr></table>', () => {
    const read = detach(readPpItemPairs);
    assert.deepEqual(read(), [ppItemPair('Caixa', '19'), ppItemPair('Caixa', '19')]);
  });
});

test('the read-back needs one stored copy for each written row', () => {
  const stored = (ids: string[]): ScanPpDraftResponse => ({
    version: 1, status: 'ok', entityId: '42',
    routePath: '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/42',
    general: {},
    locations: { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [],
      rows: [{ position: 0, values: { key_id: 'k1', name: { '1': 'Caixa' } }, translations: {} }] },
    items: { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [],
      rows: ids.map((id, position) => ({ position, values: { parent: 'k1', name_option: id, record_id: String(position) }, translations: {} })) },
    warnings: [],
  } as unknown as ScanPpDraftResponse);
  const rows = [
    { magentoFace: 'Caixa', technique: 'Laser', catalogueId: '19' },
    { magentoFace: 'Caixa', technique: 'Laser', catalogueId: '19' },
  ];
  const two = ppSavedVerification(rows, stored(['19', '19']));
  assert.equal(two.found.length, 2); assert.equal(two.missing.length, 0);
  assert.deepEqual(two.misplaced, []);
  // One stored copy can only answer for one written row.
  const one = ppSavedVerification(rows, stored(['19']));
  assert.equal(one.found.length, 1); assert.equal(one.missing.length, 1);
});
