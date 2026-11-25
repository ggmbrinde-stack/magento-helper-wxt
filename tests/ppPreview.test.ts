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
import { attributeSetConsistency, ppCell, ppExtraCopies, ppFaceRows, ppHandledRows, ppSaveRows, ppLanguage, ppMatchesSearch, ppLocationRows, ppNotionLists, ppApplyPlannedOrder, ppDropRemovedRows, ppMergeReadBack, ppOptionRows, ppOrderCheck, ppPartialMatches, ppPreviewRows, ppSearchMode, ppSearchRows, PP_SEARCH_CAP, ppSnapshotSummary, ppStoreValues, ppUpdatePlan, readPreviewResponses } from '../src/dashboard/sections/ui/ppPreviewModel';
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
  assert.equal(rows.length, 5); assert.deepEqual(rows.map(row => row.field), ['Title', 'Faces (locations)', 'Option rows', 'Techniques', 'Languages and other fields']);
  assert.equal(rows[0]!.magento, 'Unsaved current title'); assert.match(rows[0]!.notion, /img src=x/);
  assert.equal(rows[1]!.magento, '(no face rows)'); assert.equal(rows[1]!.notion, 'Face 1 · Face 2');
  assert.equal(rows[2]!.notion, 'Laser Metal'); assert.equal(rows[3]!.magento, '(no native Magento field)');
  assert.equal(rows[3]!.notion, '(not supplied)'); assert.ok(rows.every(row => !('reason' in row)));
  assert.equal(current.items.state, 'missing');
  assert.equal(current.general.sort_order, ''); assert.equal(current.general.price, 0);
  assert.equal('assignments' in rows[2]!, false); assert.equal('changes' in rows[0]!, false);
  for (const status of ['not-found', 'multiple', 'network', 'auth', 'access', 'unavailable'] as const) assert.deepEqual(ppPreviewRows(desired('49', status), current), []);
  assert.equal(ppPreviewRows(desired('49', 'partial'), current).length, 5);
  assert.equal(attributeSetConsistency(current), 'matching');
  current.generalAttributeSetId = ['480']; assert.equal(attributeSetConsistency(current), 'different');
  current.generalAttributeSetId = []; assert.equal(attributeSetConsistency(current), 'unknown');
  current.generalAttributeSetId = undefined; assert.equal(attributeSetConsistency(current), 'unknown');
  current.status = 'unavailable'; assert.deepEqual(ppPreviewRows(desired(), current), []);
  assert.throws(() => readPreviewResponses('49', target, desired('0049'), draftResponse()), /exact business code/);
  assert.throws(() => readPreviewResponses(' 0049 ', target, desired(), { ...draftResponse(), tab: { ...target, entityId: '49' } }), /selected tab/);
});

test('faces and options render as readable rows with language columns and explicit blanks', () => {
  const current = snapshot();
  current.locations = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { key_id: 'key_pjupep', name: '{"1":"Face 1","2":"Side 1","4":"Cara 1"}', sort: '', price: '' },
      translations: { name: { raw: '{"1":"Face 1","2":"Side 1","4":"Cara 1"}', parsed: { 1: 'Face 1', 2: 'Side 1', 4: 'Cara 1' } } } },
  ] };
  current.items = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { record_id: 0, parent: 'key_pjupep', name_option: 1, name: '1', sort: '', store_view: '1' }, translations: {} },
    { position: 1, values: { record_id: 1, parent: 'key_missing', name_option: '', sort: '', store_view: '1' }, translations: {} },
  ] };
  current.itemLabels = { 0: 'Tampografia 1 Cor' };
  const faces = ppFaceRows(current), options = ppOptionRows(current), summary = ppSnapshotSummary(current);
  assert.equal(faces.length, 1); assert.equal(faces[0]!.name, 'Face 1');
  assert.deepEqual(faces[0]!.translations, { 1: 'Face 1', 2: 'Side 1', 4: 'Cara 1' });
  assert.equal(options[0]!.face, 'Face 1'); assert.equal(options[1]!.face, '(face key_missing)');
  assert.equal(options[0]!.label, 'Tampografia 1 Cor'); assert.equal(options[1]!.label, '');
  assert.equal(ppCell(options[0]!.catalogueId), '1'); assert.equal(ppCell(options[1]!.catalogueId), '(blank)');
  assert.equal(ppCell(undefined), '(not supplied)'); assert.equal(ppCell(null), '(not supplied)');
  assert.deepEqual(summary.languages, ['PT', 'EN', 'ES']);
  assert.equal(summary.faces, 1); assert.equal(summary.options, 2); assert.equal(summary.attributeSet, '479');
  assert.equal(ppLanguage('5'), 'FR'); assert.equal(ppLanguage('9'), 'store 9'); assert.equal(ppLanguage(''), '');
  const side = ppPreviewRows(desired(), current);
  assert.match(side[1]!.magento, /Face 1: PT Face 1, EN Side 1, ES Cara 1/);
  assert.match(side[2]!.magento, /#0 Tampografia 1 Cor, catalogue id 1, parent Face 1/);
  assert.match(side[2]!.magento, /#1 \(label not read\), catalogue id \(blank\), parent \(face key_missing\)/);
  assert.deepEqual(ppNotionLists(desired().definition!), { faces: 'Face 1 · Face 2', options: 'Laser Metal', techniques: '(not supplied)' });
  assert.equal(Object.keys(ppStoreValues('not json')).length, 0);
  assert.equal(ppStoreValues('{"1":"Face 1"}')['1'], 'Face 1');
});

test('digit search matches the exact business code and hides partial matches', () => {
  const rows = [
    { code: '42', name: '42 — Tampografia (1C-1F)' },
    { code: '742', name: '742 — Conjunto' },
    { code: '344', name: '344 — Sacos 38/42cm' },
    { code: ' 0049 ', name: '0049 — Outro' },
  ] as unknown as Parameters<typeof ppMatchesSearch>[0][];
  assert.equal(ppSearchMode(''), 'all'); assert.equal(ppSearchMode('42'), 'exact-code'); assert.equal(ppSearchMode('tampo'), 'text');
  assert.deepEqual(rows.filter(row => ppMatchesSearch(row, '42')).map(row => row.code), ['42']);
  assert.deepEqual(rows.filter(row => ppMatchesSearch(row, '0049')).map(row => row.code), [' 0049 ']);
  assert.equal(ppPartialMatches(rows, '42'), 1);
  assert.equal(ppPartialMatches(rows, 'tampo'), 0);
  assert.deepEqual(rows.filter(row => ppMatchesSearch(row, '38/42')).map(row => row.code), ['344']);
  assert.equal(rows.filter(row => ppMatchesSearch(row, '')).length, 4);
  assert.equal(ppMatchesSearch(rows[1]!, 'conjunto'), true);
  assert.equal(ppMatchesSearch(rows[1]!, '42'), false);
});

test('the search draws a bounded head and still counts the whole match set', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ pageId: 'page-' + i, code: String(i), name: 'PP ' + i, reviewStatus: null }));
  const result = ppSearchRows(many as unknown as Parameters<typeof ppSearchRows>[0], 'PP', PP_SEARCH_CAP);
  assert.equal(result.matches, 5000);
  assert.equal(result.shown.length, PP_SEARCH_CAP);
  assert.equal(result.shown[PP_SEARCH_CAP - 1]!.position, PP_SEARCH_CAP - 1);
  assert.equal(ppSearchRows(many as unknown as Parameters<typeof ppSearchRows>[0], '4999', PP_SEARCH_CAP).shown.length, 1);
});

test('read-only update plan pairs Notion locations with Magento faces and catalogue ids', () => {
  const current = snapshot();
  current.locations = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { key_id: 'key_pjupep', name: '{"1":"Face 1"}', sort: '', price: '' },
      translations: { name: { raw: '{"1":"Face 1"}', parsed: { 1: 'Face 1' } } } },
  ] };
  current.items = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { record_id: 0, parent: 'key_pjupep', name_option: 1, name: '1', sort: '', store_view: '1' }, translations: {} },
  ] };
  current.catalogue = [
    { id: '1', label: 'Tampografia 1 Cor' },
    { id: '6', label: 'Laser Metal - Até 7 cm2' },
  ];
  const notion = desired();
  notion.definition = { ...notion.definition!, body: [
    'Face / local | Opções completas e especificações | Notas',
    'Face 1 | Laser Metal | ',
    'Face 1 | Tampografia 1 Cor | ',
    'Face 3 | Bordado | ',
  ] };
  assert.deepEqual(ppLocationRows(notion.definition!), [
    { face: 'Face 1', options: ['Laser Metal', 'Tampografia 1 Cor'] },
    { face: 'Face 3', options: ['Bordado'] },
  ]);
  const twoLines = { ...notion.definition!, body: ['Face / local | Opções completas e especificações | Notas',
    'Face 1 | Tampografia 1 Cor; Tampografia 2 Cores | '] };
  assert.deepEqual(ppLocationRows(twoLines), [{ face: 'Face 1', options: ['Tampografia 1 Cor', 'Tampografia 2 Cores'] }]);
  const plan = ppUpdatePlan(notion, current)!;
  assert.equal(plan.rows.length, 3); assert.equal(plan.locations, 2);
  const laser = plan.rows.find(row => row.technique === 'Laser Metal')!;
  assert.equal(laser.action, 'review'); assert.equal(laser.catalogueId, '6');
  assert.match(laser.note, /extra text/);
  const tampo = plan.rows.find(row => row.technique === 'Tampografia 1 Cor')!;
  assert.equal(tampo.action, 'present'); assert.equal(tampo.catalogueId, '1');
  assert.equal(plan.rows.find(row => row.technique === 'Tampografia 1 Cor')!.magentoFace, 'Face 1');
  const bordado = plan.rows.find(row => row.technique === 'Bordado')!;
  assert.equal(bordado.action, 'review'); assert.equal(bordado.magentoFace, '(not found)');
  assert.match(bordado.note, /no catalogue label/);
  assert.match(bordado.note, /face not found in Magento/);
  assert.equal(plan.add, 0); assert.equal(plan.present, 1); assert.equal(plan.review, 2);
  assert.equal(JSON.stringify(plan).toLowerCase().includes('delete'), false);
  assert.equal(ppUpdatePlan(desired(), current), null);
});

test('a Notion face label with the number first still matches the Magento face', () => {
  const notion = desired();
  notion.definition = { ...notion.definition!, body: [
    'Face / local | Opções completas e especificações | Notas',
    '1 Face | Tampografia 1 Cor | ',
    '1 Face | Laser Metal - Até 360 cm2 | ',
  ] };
  const current = {
    status: 'ok',
    general: { option_title: 'PP 42', sort_order: '', price: 0 },
    providerAttributeSetId: '37', generalAttributeSetId: ['37'], warnings: [],
    locations: { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [],
      rows: [{ position: 0, values: { key_id: 'key_pjupep' }, translations: { name: { parsed: 'Face 1' } } }] },
    items: { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [],
      rows: [{ position: 0, values: { record_id: 0, parent: 'key_pjupep', name_option: '1', name: '1', sort: '1', store_view: '1' }, translations: {} }] },
    catalogue: [{ id: '1', label: 'Tampografia 1 Cor' }, { id: '11', label: 'Laser Metal - Até 360 cm2' }],
  } as unknown as ScanPpDraftResponse;
  const plan = ppUpdatePlan(notion, current)!;
  assert.deepEqual(plan.rows.map(row => row.magentoFace), ['Face 1', 'Face 1']);
  assert.deepEqual(plan.rows.map(row => row.action), ['present', 'add']);
  assert.equal(plan.review, 0);
  // With the face resolved the order check has something to compare, which is what shows the tools.
  assert.equal(ppOrderCheck(plan.rows, current).faces.length, 1);
});

test('only a moved number is a face match; a word permutation stays unresolved', () => {
  const notion = desired();
  notion.definition = { ...notion.definition!, body: [
    'Face / local | Opções completas e especificações | Notas',
    'Artigo de Escrita Face 1 | Laser 250 | ',
  ] };
  const current = {
    status: 'ok',
    general: { option_title: '', sort_order: '', price: 0 },
    providerAttributeSetId: '1', generalAttributeSetId: ['1'], warnings: [],
    locations: { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [],
      rows: [{ position: 0, values: { key_id: 'key_pjupep' }, translations: { name: { parsed: 'Face 1 Artigo de Escrita' } } }] },
    items: { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [] },
    catalogue: [{ id: '19', label: 'Laser 250' }],
  } as unknown as ScanPpDraftResponse;
  const plan = ppUpdatePlan(notion, current)!;
  assert.equal(plan.rows[0]!.magentoFace, '(not found)');
  assert.equal(plan.rows[0]!.action, 'review');
  assert.match(plan.rows[0]!.note, /face not found in Magento/);
});

test('a filled Notes column is not read as a technique', () => {
  const definition = { ...desired().definition!, body: [
    'Face / local | Opções completas e especificações | Notas',
    'Caixa | UV - Até 100 cm2 (BLOCOS PEQUENOS | OUTROS)\nLaser CO2 250 | checked by MJ',
  ] };
  assert.deepEqual(ppLocationRows(definition), [{ face: 'Caixa', options: [
    'UV - Até 100 cm2 (BLOCOS PEQUENOS | OUTROS)', 'Laser CO2 250'] }]);
});

test('the rows a change handled survive the read-back that re-bases the plan', () => {
  const rows = [
    { face: 'Caixa', magentoFace: 'Caixa', technique: 'Laser 250', catalogueId: '19' },
    { face: 'Caixa', magentoFace: 'Caixa', technique: 'Laser 250', catalogueId: '19' },
    { face: 'Face 1', magentoFace: 'Face 1', technique: 'Laser 250', catalogueId: '19' },
    { face: 'Face 1', magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
  ];
  const results = [
    { face: 'Caixa', catalogueId: '19', outcome: 'added' },
    { face: 'Caixa', catalogueId: '19', outcome: 'skipped' },
    { face: 'Face 1', catalogueId: '19', outcome: 'skipped' },
    { face: 'Face 1', catalogueId: '1', outcome: 'added' },
  ];
  // One stored copy satisfies one plan row, so only the copies the form actually took are kept.
  assert.deepEqual(ppHandledRows(rows, results).map(row => row.face + '|' + row.catalogueId),
    ['Caixa|19', 'Face 1|1']);
  assert.deepEqual(ppHandledRows(rows, []), []);
  // Nothing handled means nothing to save, whatever the rows were.
  assert.deepEqual(ppHandledRows(rows, rows.map(row => ({ face: row.face, catalogueId: row.catalogueId, outcome: 'failed' }))), []);
});

test('an order apply keeps every row it sent, even the rows the lane did not move', () => {
  const rows = [
    { face: 'Face 1', magentoFace: 'Face 1', technique: 'Laser', catalogueId: '1' },
    { face: 'Face 1', magentoFace: 'Face 1', technique: 'UV', catalogueId: '2' },
  ];
  const results = [
    { face: 'Face 1', catalogueId: '1', outcome: 'ordered' },
    { face: 'Face 1', catalogueId: '2', outcome: 'failed' },
  ];
  // The save writes the plan order of the whole list, so a row the placement report called failed
  // must still travel with it; keeping only the moved rows would shorten the stored arrangement.
  assert.deepEqual(ppSaveRows('order', rows, results), rows);
  // An addition or a rebuild only saves what the lane put in the form, and a removal saves none.
  assert.deepEqual(ppSaveRows('add', rows, results).map(row => row.catalogueId), ['1']);
  assert.deepEqual(ppSaveRows('rebuild', rows, results).map(row => row.catalogueId), ['1']);
  assert.deepEqual(ppSaveRows('remove', rows, results), []);
});

test('extra stored copies are offered for a trim, and an unresolved Notion row justifies nothing', () => {
  const rows = [
    { magentoFace: 'Caixa', catalogueId: '19' },
    { magentoFace: 'Caixa', catalogueId: '19' },
    { magentoFace: 'Caixa', catalogueId: '58' },
    { magentoFace: 'Face 1', catalogueId: '2' },
  ];
  const stored = [
    { face: 'Caixa', catalogueId: '19', position: 0 },
    { face: 'Caixa', catalogueId: '58', position: 1 },
    { face: 'Caixa', catalogueId: '19', position: 2 },
    { face: 'Face 1', catalogueId: '1', position: 3 },
    { face: 'Face 1', catalogueId: '2', position: 4 },
  ];
  // Caixa lists 19 twice and 58 once, so all three copies stay. Face 1 does not list 1 at all.
  assert.deepEqual(ppExtraCopies({ rows }, stored).map(option => option.face + '|' + option.catalogueId + '|' + option.position),
    ['Face 1|1|3']);
  // A third copy of a technique Notion lists twice is the extra one.
  const third = [...stored, { face: 'Caixa', catalogueId: '19', position: 5 }];
  assert.deepEqual(ppExtraCopies({ rows }, third).map(option => option.catalogueId + '|' + option.position),
    ['1|3', '19|5']);
  // An unresolved Notion row stands the whole helper down: its technique looks absent, so a tick
  // could delete a copy Notion does ask for.
  assert.deepEqual(ppExtraCopies({ rows: [...rows, { magentoFace: 'Face 1', catalogueId: '' }] }, stored), []);
  // A review row is not a claim either, so it also stands the helper down.
  assert.deepEqual(ppExtraCopies({ rows: [{ magentoFace: 'Face 1', catalogueId: '1', action: 'review' }] }, stored), []);
});

test('an option label containing a pipe does not cut the rest of its Notion row (PP 963)', () => {
  const current = snapshot();
  current.locations = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { key_id: 'key_pjupep', name: '{"1":"Caixa"}', sort: '', price: '' },
      translations: { name: { raw: '{"1":"Caixa"}', parsed: { 1: 'Caixa' } } } },
  ] };
  current.items = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { record_id: 0, parent: 'key_pjupep', name_option: 19, name: '19', sort: '', store_view: '1' }, translations: {} },
  ] };
  current.catalogue = [
    { id: '19', label: 'Laser CO2 (Madeira) - Até 250 cm2' },
    { id: '35', label: 'UV - Até 100 cm2 (Aprox. 10x10cm - BLOCOS PEQUENOS | OUTROS)' },
  ];
  const notion = desired();
  notion.definition = { ...notion.definition!, body: [
    'Face / local | Opções completas e especificações | Notas',
    'Caixa | UV - Até 100 cm2 (Aprox. 10x10cm - BLOCOS PEQUENOS | OUTROS)\nLaser CO2 (Madeira) - Até 250 cm2\nLaser CO2 (Madeira) - Até 250 cm2 | ',
  ] };
  const locations = ppLocationRows(notion.definition!);
  assert.equal(locations.length, 1);
  assert.deepEqual(locations[0]!.options, [
    'UV - Até 100 cm2 (Aprox. 10x10cm - BLOCOS PEQUENOS | OUTROS)',
    'Laser CO2 (Madeira) - Até 250 cm2',
    'Laser CO2 (Madeira) - Até 250 cm2',
  ]);
  // One stored copy satisfies the first occurrence; the repeated one is still proposed.
  const plan = ppUpdatePlan(notion, current)!;
  assert.deepEqual(plan.rows.map(row => row.action), ['add', 'present', 'add']);
  assert.deepEqual(plan.rows.map(row => row.catalogueId), ['35', '19', '19']);
  assert.equal(plan.add, 2); assert.equal(plan.present, 1); assert.equal(plan.review, 0);
});

test('the preview says whether the form order follows the Notion list', () => {
  const snapshot = (ids: string[]): ScanPpDraftResponse => ({
    locations: { rows: [{ values: { key_id: 'key_pjupep' }, translations: { name: { parsed: 'Face 1' } } }] },
    items: { rows: ids.map((id, position) => ({ position, values: {
      record_id: position, parent: 'key_pjupep', name_option: id, name: id, sort: '', store_view: '1',
    }, translations: {} })) },
    itemLabels: Object.fromEntries(ids.map((id, at) => [String(at), id === '1' ? 'Tampografia 1 Cor' : 'Laser Metal'])),
  } as unknown as ScanPpDraftResponse);
  const rows = [
    { magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
    { magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' },
  ];
  const ordered = ppOrderCheck(rows, snapshot(['1', '11']));
  assert.equal(ordered.ordered, true);
  assert.deepEqual(ordered.faces[0]!.wanted, ['Tampografia 1 Cor', 'Laser Metal']);
  assert.deepEqual(ordered.faces[0]!.actual, ['Tampografia 1 Cor', 'Laser Metal']);
  const swapped = ppOrderCheck(rows, snapshot(['11', '1']));
  assert.equal(swapped.ordered, false);
  assert.deepEqual(swapped.outOfPlace, ['Laser Metal → move down']);
  assert.deepEqual(swapped.faces[0]!.actual, ['Laser Metal', 'Tampografia 1 Cor']);
  // A row that is not in the plan sitting between two planned rows is not an order problem.
  const between = ppOrderCheck(rows, snapshot(['1', '99', '11']));
  assert.equal(between.ordered, true);
  assert.deepEqual(between.faces[0]!.outOfPlace, []);
});

test('a removed row leaves the panel straight away, without another Magento read', () => {
  const snapshot = {
    locations: { rows: [{ values: { key_id: 'key_pjupep' }, translations: { name: { parsed: 'Face 1' } } }] },
    items: { rows: [
      { position: 0, values: { record_id: 0, parent: 'key_pjupep', name_option: '11', name: '11', sort: '', store_view: '1' }, translations: {} },
      { position: 1, values: { record_id: 0, parent: 'key_pjupep', name_option: '1', name: '1', sort: '', store_view: '1' }, translations: {} },
    ] },
    itemLabels: { '0': 'Laser Metal' },
  } as unknown as ScanPpDraftResponse;
  const after = ppDropRemovedRows(snapshot, [{ magentoFace: 'Face 1', catalogueId: '11' }]);
  assert.deepEqual(ppOptionRows(after).map(option => option.catalogueId), ['1']);
  assert.equal(after.items.rows.length, 1);
  assert.equal(after.items.rows[0]!.position, 0, 'the remaining row is renumbered');
  // A row that is not on that face leaves the snapshot untouched.
  assert.equal(ppDropRemovedRows(snapshot, [{ magentoFace: 'Face 2', catalogueId: '11' }]), snapshot);
});

test('a read-back keeps the catalogue and labels of the earlier read', () => {
  const base = {
    locations: { rows: [] }, items: { rows: [] },
    catalogue: [{ id: '1', label: 'Tampografia 1 Cor' }], itemLabels: { '0': 'Tampografia 1 Cor' },
  } as unknown as ScanPpDraftResponse;
  const stored = { locations: { rows: [] }, items: { rows: [] }, catalogue: [], itemLabels: {} } as unknown as ScanPpDraftResponse;
  const merged = ppMergeReadBack(base, stored);
  assert.deepEqual(merged.catalogue, base.catalogue);
  assert.deepEqual(merged.itemLabels, base.itemLabels);
  // A read-back that did carry its own catalogue and labels wins.
  const own = { locations: { rows: [] }, items: { rows: [] },
    catalogue: [{ id: '2', label: 'Bordado' }], itemLabels: { '1': 'Bordado' } } as unknown as ScanPpDraftResponse;
  assert.deepEqual(ppMergeReadBack(base, own).catalogue, own.catalogue);
});

test('the panel shows the plan order as soon as it is set', () => {
  const snapshot = {
    locations: { rows: [{ values: { key_id: 'key_pjupep' }, translations: { name: { parsed: 'Face 1' } } }] },
    items: { rows: [
      { position: 0, values: { record_id: 0, parent: 'key_pjupep', name_option: '11', name: '11', sort: '', store_view: '1' }, translations: {} },
      { position: 1, values: { record_id: 1, parent: 'key_pjupep', name_option: '1', name: '1', sort: '', store_view: '1' }, translations: {} },
    ] },
  } as unknown as ScanPpDraftResponse;
  const rows = [
    { magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
    { magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' },
  ];
  const after = ppApplyPlannedOrder(snapshot, rows);
  assert.deepEqual(ppOptionRows(after).map(option => option.catalogueId), ['1', '11']);
  assert.deepEqual(after.items.rows.map(row => row.position), [0, 1]);
  // A plan that already matches leaves the snapshot object untouched.
  assert.equal(ppApplyPlannedOrder(after, rows), after);
});

test('a technique the Notion list repeats is proposed a second time', () => {
  const current = snapshot();
  current.locations = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { key_id: 'key_pjupep', name: '{"1":"Caixa"}', sort: '', price: '' },
      translations: { name: { raw: '{"1":"Caixa"}', parsed: { 1: 'Caixa' } } } },
  ] };
  current.items = { state: 'available', truncated: false, identifierGaps: 0, skippedPositions: [], rows: [
    { position: 0, values: { record_id: 0, parent: 'key_pjupep', name_option: '19', name: '19', sort: '', store_view: '1' }, translations: {} },
  ] };
  current.catalogue = [
    { id: '19', label: 'Laser CO2 (Madeira) - Até 250 cm2' },
    { id: '5', label: 'Bordado' },
  ];
  const notion = desired();
  notion.definition = { ...notion.definition!, body: [
    'Face / local | Opções completas e especificações | Notas',
    'Caixa | Laser CO2 (Madeira) - Até 250 cm2; Bordado; Laser CO2 (Madeira) - Até 250 cm2 | ',
  ] };
  const plan = ppUpdatePlan(notion, current)!;
  // The stored copy satisfies the first occurrence only, so the second one is an addition.
  assert.deepEqual(plan.rows.map(row => [row.catalogueId, row.action]),
    [['19', 'present'], ['5', 'add'], ['19', 'add']]);
  assert.equal(plan.add, 2);
  assert.equal(plan.present, 1);
  assert.equal(plan.review, 0);
  // The same technique listed twice with no stored copy needs both copies.
  current.items.rows = [];
  const empty = ppUpdatePlan(notion, current)!;
  assert.deepEqual(empty.rows.map(row => row.action), ['add', 'add', 'add']);
});

const caixa = (ids: string[]): ScanPpDraftResponse => ({
  locations: { rows: [{ values: { key_id: 'key_pjupep' }, translations: { name: { parsed: 'Caixa' } } }] },
  items: { rows: ids.map((id, position) => ({
    position,
    values: { record_id: position, parent: 'key_pjupep', name_option: id, name: id, sort: '', store_view: '1' },
    translations: {},
  })) },
} as unknown as ScanPpDraftResponse);

test('the order check reads a repeated technique as two occurrences', () => {
  const plan = [
    { magentoFace: 'Caixa', technique: 'Laser', catalogueId: '19' },
    { magentoFace: 'Caixa', technique: 'Bordado', catalogueId: '5' },
    { magentoFace: 'Caixa', technique: 'Vinil', catalogueId: '7' },
    { magentoFace: 'Caixa', technique: 'Laser', catalogueId: '19' },
  ];
  const follows = ppOrderCheck(plan, caixa(['19', '5', '7', '19']));
  assert.equal(follows.ordered, true);
  assert.deepEqual(follows.faces[0]!.wanted, ['Laser', 'Bordado', 'Vinil', 'Laser']);
  const swapped = ppOrderCheck(plan, caixa(['19', '5', '19', '7']));
  assert.equal(swapped.ordered, false);
  // The second copy sits before Vinil, so it is the one that has to move down.
  assert.deepEqual(swapped.outOfPlace, ['Laser → move down']);
  // One stored copy cannot satisfy both occurrences, so the missing one is not called out of place.
  assert.equal(ppOrderCheck(plan, caixa(['19', '5', '7'])).outOfPlace.length, 0);
});

test('removing one copy leaves the other copy on the face', () => {
  const stored = caixa(['19', '5', '19']);
  const one = ppDropRemovedRows(stored, [{ magentoFace: 'Caixa', catalogueId: '19' }]);
  assert.deepEqual(ppOptionRows(one).map(option => option.catalogueId), ['5', '19']);
  assert.deepEqual(one.items.rows.map(row => row.position), [0, 1]);
  const both = ppDropRemovedRows(stored, [
    { magentoFace: 'Caixa', catalogueId: '19' },
    { magentoFace: 'Caixa', catalogueId: '19' },
  ]);
  assert.deepEqual(ppOptionRows(both).map(option => option.catalogueId), ['5']);
});

test('the panel places a repeated technique as often as the plan names it', () => {
  const rows = [
    { magentoFace: 'Caixa', technique: 'Laser', catalogueId: '19' },
    { magentoFace: 'Caixa', technique: 'Bordado', catalogueId: '5' },
    { magentoFace: 'Caixa', technique: 'Laser', catalogueId: '19' },
  ];
  const twice = ppApplyPlannedOrder(caixa(['7', '5', '19', '19']), rows);
  assert.deepEqual(ppOptionRows(twice).map(option => option.catalogueId), ['19', '5', '19', '7']);
  // With one stored copy the second occurrence has nowhere to go; the other rows keep their order.
  const once = ppApplyPlannedOrder(caixa(['7', '5', '19']), rows);
  assert.deepEqual(ppOptionRows(once).map(option => option.catalogueId), ['19', '5', '7']);
});
