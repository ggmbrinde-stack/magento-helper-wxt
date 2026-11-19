import test from 'node:test';
import assert from 'node:assert/strict';
import type { PpCatalogIndexRow } from '../src/shared/ppCatalog';
import type { PpPlanRow } from '../src/dashboard/sections/ui/ppPreviewModel';
import {
  PP_DUPLICATE_CONTRACT, PP_INVENTORY_UNAVAILABLE, ppCodeKey, ppDuplicateGate, ppPlanFaces, ppReconcile,
  ppSelection, type PpMagentoInventory, type PpReconcileReport,
} from '../src/dashboard/sections/ui/ppReconcileModel';

const notionRow = (n: number, code: string, name = 'PP ' + code): PpCatalogIndexRow => ({
  pageId: '00000000-0000-0000-0000-' + String(n).padStart(12, '0'), code, name, reviewStatus: 'A rever',
});

const inventory = (rows: Array<{ entityId: string; code: string }>, coverage: PpMagentoInventory['coverage'] = 'complete', reason = 'Read from the controlled inventory.'): PpMagentoInventory =>
  ({ coverage, rows, reason });

test('an exact code matches one Magento original, and zero padding is kept', () => {
  const report = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49')], inventory: inventory([{ entityId: '77', code: '49' }]) });
  assert.equal(report.rows[0]!.verdict, 'matched');
  assert.equal(report.rows[0]!.entityId, '77');
  assert.equal(report.absenceAllowed, true);
  assert.deepEqual(report.counts, { matched: 1, skipped: 0, untouched: 0, review: 0 });
  assert.deepEqual(report.entityCollisions, []);
  assert.equal(ppCodeKey('0049'), '0049');
  assert.notEqual(ppCodeKey('0049'), ppCodeKey('49'));
});

test('a padded Magento code and a bare Notion code are Needs review, never a match or a skip', () => {
  const report = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '661')], inventory: inventory([{ entityId: '77', code: '0661' }]) });
  assert.equal(report.rows[0]!.verdict, 'needs-review');
  assert.equal(report.rows[0]!.entityId, '');
  assert.match(report.rows[0]!.reason, /formats differ/);
  assert.match(report.rows[0]!.reason, /0661/);
  // The other format is not reported as an untouched Magento-only record either.
  assert.deepEqual(report.magentoOnly, []);
  assert.deepEqual(report.counts, { matched: 0, skipped: 0, untouched: 0, review: 1 });
});

test('PP48 absent from Notion stays Magento-only and untouched', () => {
  const report = ppReconcile({
    notionCoverage: 'complete',
    notionRows: [notionRow(1, '49')],
    inventory: inventory([{ entityId: '77', code: '49' }, { entityId: '76', code: '48' }]),
  });
  assert.deepEqual(report.magentoOnly, [{ entityId: '76', code: '48' }]);
  assert.equal(report.counts.untouched, 1);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0]!.verdict, 'matched');
});

test('a Notion-only code is skipped and never created', () => {
  const report = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49'), notionRow(2, '50')], inventory: inventory([{ entityId: '77', code: '49' }]) });
  assert.equal(report.rows[1]!.verdict, 'skipped');
  assert.match(report.rows[1]!.reason, /Nothing will be created/);
  assert.equal(report.rows[1]!.entityId, '');
  assert.deepEqual(report.counts, { matched: 1, skipped: 1, untouched: 0, review: 0 });
});

test('a duplicate exact code on either side needs review instead of picking a record', () => {
  const notion = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49'), notionRow(2, '49')], inventory: inventory([{ entityId: '77', code: '49' }]) });
  assert.deepEqual(notion.rows.map(row => row.verdict), ['needs-review', 'needs-review']);
  assert.match(notion.rows[0]!.reason, /Duplicate exact business code in Notion/);

  const magento = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49')], inventory: inventory([{ entityId: '77', code: '49' }, { entityId: '78', code: '49' }]) });
  assert.equal(magento.rows[0]!.verdict, 'needs-review');
  assert.match(magento.rows[0]!.reason, /entity 77, 78/);
  assert.equal(magento.rows[0]!.entityId, '');
  assert.deepEqual(magento.entityCollisions, []);
});

test('an incomplete Magento inventory blocks every absence verdict', () => {
  const partial = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49'), notionRow(2, '50')], inventory: inventory([{ entityId: '77', code: '49' }], 'partial', 'Only the loaded Grid page was read.') });
  assert.equal(partial.absenceAllowed, false);
  assert.deepEqual(partial.rows.map(row => row.verdict), ['needs-review', 'needs-review']);
  assert.match(partial.rows[0]!.reason, /Magento inventory is partial/);
  assert.deepEqual(partial.magentoOnly, []);

  const unavailable = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49')], inventory: PP_INVENTORY_UNAVAILABLE });
  assert.equal(unavailable.coverage, 'unavailable');
  assert.deepEqual(unavailable.counts, { matched: 0, skipped: 0, untouched: 0, review: 1 });
  assert.match(unavailable.rows[0]!.reason, /No proven Magento-wide business-code inventory/);
});

test('a claimed complete inventory with an unreadable row is downgraded', () => {
  const report = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49')], inventory: inventory([{ entityId: '77', code: '49' }, { entityId: '', code: '50' }]) });
  assert.equal(report.coverage, 'partial');
  assert.equal(report.rows[0]!.verdict, 'needs-review');
  assert.match(report.coverageReason, /unreadable row/);
});

test('an incomplete Notion index keeps every code for review', () => {
  const report = ppReconcile({ notionCoverage: 'partial', notionRows: [notionRow(1, '49')], inventory: inventory([{ entityId: '77', code: '49' }]) });
  assert.equal(report.absenceAllowed, false);
  assert.equal(report.rows[0]!.verdict, 'needs-review');
  assert.match(report.rows[0]!.reason, /Notion coverage is partial/);
});

test('a missing page, a prefixed code and an unsupported code are review states', () => {
  const report = ppReconcile({
    notionCoverage: 'complete',
    notionRows: [{ ...notionRow(1, '49'), pageId: null }, notionRow(2, 'PP49'), notionRow(3, '1234567')],
    inventory: inventory([{ entityId: '77', code: '49' }]),
  });
  assert.deepEqual(report.rows.map(row => row.verdict), ['needs-review', 'needs-review', 'needs-review']);
  assert.match(report.rows[1]!.reason, /numeric PP business code/);
});

test('one code and several codes take the same selection path', () => {
  const report = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49'), notionRow(2, '50')], inventory: inventory([{ entityId: '77', code: '49' }]) });
  const empty = ppSelection(report, []);
  assert.equal(empty.ready, false);
  assert.equal(empty.rows.length, 0);
  assert.match(empty.reason, /Select one or more/);

  const one = ppSelection(report, [notionRow(1, '49').pageId!]);
  assert.equal(one.ready, true);
  assert.deepEqual(one.matched.map(row => row.entityId), ['77']);

  const mixed = ppSelection(report, [notionRow(1, '49').pageId!, notionRow(2, '50').pageId!]);
  assert.equal(mixed.ready, true);
  assert.equal(mixed.matched.length, 1);
  assert.equal(mixed.skipped.length, 1);
  assert.equal(mixed.blocked.length, 0);
  assert.match(mixed.reason, /will be skipped/);

  const repeated = ppSelection(report, [notionRow(1, '49').pageId!, notionRow(1, '49').pageId!]);
  assert.equal(repeated.rows.length, 1);
  assert.equal(repeated.ready, true);

  const unknown = ppSelection(report, ['00000000-0000-0000-0000-000000009999']);
  assert.equal(unknown.ready, false);
  assert.match(unknown.blocked[0]!.reason, /not in the reconciliation report/);

  const onlySkipped = ppSelection(report, [notionRow(2, '50').pageId!]);
  assert.equal(onlySkipped.skipped.length, 1);
  assert.equal(onlySkipped.ready, false);
  assert.equal(onlySkipped.blocked.length, 0);
  assert.match(onlySkipped.reason, /nothing to duplicate/);
});

test('the report flags two codes on one Magento entity, and selection refuses it too', () => {
  const report = ppReconcile({
    notionCoverage: 'complete',
    notionRows: [notionRow(1, '49'), notionRow(2, '50')],
    inventory: inventory([{ entityId: '77', code: '49' }, { entityId: '77', code: '50' }]),
  });
  assert.deepEqual(report.entityCollisions, [{ entityId: '77', codes: ['49', '50'] }]);
  assert.deepEqual(report.rows.map(row => row.verdict), ['needs-review', 'needs-review']);
  assert.match(report.rows[0]!.reason, /also the match for code 50/);
  assert.equal(report.counts.matched, 0);

  const selection = ppSelection(report, [notionRow(1, '49').pageId!, notionRow(2, '50').pageId!]);
  assert.equal(selection.ready, false);
  assert.equal(selection.matched.length, 0);
  assert.equal(ppDuplicateGate(report, selection).allowed, false);

  // Defence in depth: a stale report that still calls both rows matched is refused at selection.
  const forged: PpReconcileReport = {
    notionCoverage: 'complete', coverage: 'complete', coverageReason: 'stale', absenceAllowed: true,
    rows: [
      { pageId: notionRow(1, '49').pageId, code: '49', name: 'PP 49', verdict: 'matched', reason: 'stale', entityId: '77' },
      { pageId: notionRow(2, '50').pageId, code: '50', name: 'PP 50', verdict: 'matched', reason: 'stale', entityId: '77' },
    ],
    magentoOnly: [], entityCollisions: [],
    counts: { matched: 2, skipped: 0, untouched: 0, review: 0 },
  };
  const stale = ppSelection(forged, [notionRow(1, '49').pageId!, notionRow(2, '50').pageId!]);
  assert.equal(stale.ready, false);
  assert.match(stale.blocked[0]!.reason, /both resolve to Magento entity 77/);
});

test('an entity collision with a Magento-only code is review, not a match or untouched', () => {
  const report = ppReconcile({
    notionCoverage: 'complete',
    notionRows: [notionRow(1, '49'), notionRow(2, '50')],
    inventory: inventory([{ entityId: '77', code: '49' }, { entityId: '77', code: '99' }]),
  });
  assert.deepEqual(report.entityCollisions, [{ entityId: '77', codes: ['49', '99'] }]);
  assert.equal(report.absenceAllowed, false);
  assert.equal(report.rows[0]!.verdict, 'needs-review');
  assert.equal(report.rows[0]!.entityId, '');
  assert.match(report.rows[0]!.reason, /code 99/);
  assert.equal(report.rows[1]!.verdict, 'needs-review');
  assert.deepEqual(report.magentoOnly, []);
  assert.deepEqual(report.counts, { matched: 0, skipped: 0, untouched: 0, review: 2 });
  assert.equal(ppSelection(report, [notionRow(1, '49').pageId!]).ready, false);
});

test('an unusable Magento entity id is Needs review in the report itself', () => {
  for (const entityId of ['0', '000']) {
    const report = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49')], inventory: inventory([{ entityId, code: '49' }]) });
    // An id of 0 is not a record, so a list holding one cannot be called complete.
    assert.equal(report.coverage, 'partial', 'entity id ' + JSON.stringify(entityId));
    assert.match(report.coverageReason, /unreadable row/);
    assert.equal(report.rows[0]!.verdict, 'needs-review');
    assert.equal(report.rows[0]!.entityId, '');
    assert.match(report.rows[0]!.reason, /Magento inventory is partial/);
    assert.deepEqual(report.magentoOnly, []);
    assert.deepEqual(report.counts, { matched: 0, skipped: 0, untouched: 0, review: 1 });
    const selection = ppSelection(report, [notionRow(1, '49').pageId!]);
    assert.equal(selection.ready, false);
    assert.equal(selection.matched.length, 0);
    assert.equal(ppDuplicateGate(report, selection).allowed, false);
  }

  // Defence in depth: a stale report that still calls the row matched is refused at selection.
  const stale: PpReconcileReport = {
    notionCoverage: 'complete', coverage: 'complete', coverageReason: 'stale', absenceAllowed: true,
    rows: [{ pageId: notionRow(1, '49').pageId, code: '49', name: 'PP 49', verdict: 'matched', reason: 'stale', entityId: '0' }],
    magentoOnly: [], entityCollisions: [], counts: { matched: 1, skipped: 0, untouched: 0, review: 0 },
  };
  const refused = ppSelection(stale, [notionRow(1, '49').pageId!]);
  assert.equal(refused.ready, false);
  assert.match(refused.blocked[0]!.reason, /no usable Magento entity id/);
});

test('the duplicate gate stays blocked even for a proven match', () => {
  const report = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49')], inventory: inventory([{ entityId: '77', code: '49' }]) });
  const selection = ppSelection(report, [notionRow(1, '49').pageId!]);
  const gate = ppDuplicateGate(report, selection);
  assert.equal(gate.allowed, false);
  assert.equal(gate.reason, PP_DUPLICATE_CONTRACT.reason);

  const unavailable = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(1, '49')], inventory: PP_INVENTORY_UNAVAILABLE });
  const blockedSelection = ppSelection(unavailable, [notionRow(1, '49').pageId!]);
  assert.equal(ppDuplicateGate(unavailable, blockedSelection).allowed, false);
  assert.match(ppDuplicateGate(unavailable, blockedSelection).reason, /No proven Magento-wide business-code inventory/);

  const skippedOnly = ppReconcile({ notionCoverage: 'complete', notionRows: [notionRow(2, '50')], inventory: inventory([{ entityId: '77', code: '49' }]) });
  const skippedSelection = ppSelection(skippedOnly, [notionRow(2, '50').pageId!]);
  assert.equal(ppDuplicateGate(skippedOnly, skippedSelection).allowed, false);
  assert.match(ppDuplicateGate(skippedOnly, skippedSelection).reason, /No selected code has a verified Magento original/);
});

test('the plan is grouped by Magento face with per-face counts', () => {
  const row = (magentoFace: string, technique: string, action: PpPlanRow['action']): PpPlanRow =>
    ({ face: magentoFace, magentoFace, technique, catalogueId: '1', action, note: '' });
  const groups = ppPlanFaces([
    row('Face 1', 'Laser', 'add'), row('Face 1', 'Tampografia', 'present'), row('Face 2', 'Laser', 'review'), row('Face 2', 'Laser', 'add'),
  ]);
  assert.deepEqual(groups.map(group => group.face), ['Face 1', 'Face 2']);
  assert.deepEqual([groups[0]!.add, groups[0]!.present, groups[0]!.review], [1, 1, 0]);
  assert.deepEqual([groups[1]!.add, groups[1]!.present, groups[1]!.review], [1, 0, 1]);
  assert.deepEqual(ppPlanFaces([]), []);
});
