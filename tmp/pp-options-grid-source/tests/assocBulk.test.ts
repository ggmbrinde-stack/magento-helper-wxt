import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error - untyped transitive dependency
import { JSDOM } from 'jsdom';
import { selectAssociatedSkus, type AssocBulkReport } from '../src/page/features/assoc-bulk/page';

function observable<T>(initial: T) {
  let value = initial;
  return Object.assign((next?: T) => {
    if (next !== undefined) value = next;
    return value;
  }, { peek: () => value });
}

function fixture(t: TestContext, options: { silentRegistry?: boolean; stopOnFilter?: boolean; failRestore?: boolean } = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'] });
  const dom = new JSDOM(`<!doctype html><html><body>
    <form><button id="save">Save</button><aside class="configurable_associated_product_modal">
    <input name="sku" value="ORIGINAL"><button type="button" data-action="grid-filter-apply">Apply</button>
    <div class="admin__data-grid-loading-mask" hidden></div>
    <table class="data-grid"><thead><tr><th>Select</th><th>SKU</th></tr></thead><tbody></tbody></table>
    <button id="done" type="button">Done</button></aside></form></body></html>`, {
    url: 'https://bestofgifts.pt/admin/catalog/product/edit/id/1/', runScripts: 'outside-only',
  });
  const win = dom.window;
  win.Date = Date;
  win.setTimeout = setTimeout;
  win.setInterval = setInterval;
  win.clearInterval = clearInterval;
  win.console.log = () => {};
  win.Element.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
  const doc: Document = win.document;
  const initialRows = [{ entity_id: 1, sku: 'VISIBLE' }, { entity_id: 2, sku: 'OTHER' }];
  const col = {
    indexField: 'entity_id', rows: observable(initialRows), selected: observable([90]),
    excluded: observable([41, 99]), excludeMode: observable(true), totalSelected: observable(1),
  };
  const associated = { unionInsertData: observable([{ sku: 'ALREADY' }]) };
  win.ko = {
    dataFor: () => col,
    contextFor: (box: HTMLInputElement) => ({ $col: col, $data: associated,
      $row: col.rows().find(row => String(row.entity_id) === box.value) }),
  };
  win.require = (names: string[], resolve: (value: unknown) => void) => {
    assert.deepEqual(Array.from(names), ['uiRegistry']);
    if (!options.silentRegistry) resolve({ filter: () => [associated] });
  };
  const tbody = doc.querySelector('tbody')!;
  const renderRows = (rows: typeof initialRows) => {
    col.rows(rows);
    tbody.innerHTML = rows.length ? rows.map(row => `<tr><td><input type="checkbox" data-action="select-row" value="${row.entity_id}"></td><td>${row.sku}</td></tr>`).join('') : '<tr class="data-grid-tr-no-data"><td>No records</td></tr>';
    tbody.querySelectorAll<HTMLInputElement>('input').forEach(box => box.addEventListener('click', () => {
      const id = Number(box.value);
      if (!col.selected().includes(id)) col.selected([...col.selected(), id]);
    }));
  };
  renderRows(initialRows);
  const filters: string[] = [];
  doc.querySelector('[data-action="grid-filter-apply"]')!.addEventListener('click', () => {
    const sku = doc.querySelector<HTMLInputElement>('input[name="sku"]')!.value;
    filters.push(sku);
    if (sku === 'ORIGINAL') {
      if (options.failRestore) doc.querySelector<HTMLElement>('.admin__data-grid-loading-mask')!.hidden = false;
      else renderRows(initialRows);
    } else {
      renderRows(sku === 'TARGET' ? [{ entity_id: 41, sku: 'TARGET' }] : []);
      if (options.stopOnFilter) doc.documentElement.setAttribute('data-mhx-assoc-bulk-cancel', '1');
    }
  });
  let mutations = 0;
  doc.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); mutations++; });
  doc.querySelector('#done')!.addEventListener('click', () => mutations++);
  // Match executeScript's source-only bridge, with no access to module closures.
  const injected = win.eval(`(${selectAssociatedSkus.toString()})`) as typeof selectAssociatedSkus;
  let report: AssocBulkReport | undefined;
  const run = (skus: string[]) => { void injected(skus).then(value => { report = value; }); };
  return { doc, col, filters, run, result: () => report, mutations: () => mutations, close: () => { dom.window.close(); t.mock.timers.reset(); } };
}

async function advance(t: TestContext, ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 100) {
    t.mock.timers.tick(100);
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
  }
}

test('silent uiRegistry load times out and uses the existing context fallback', async t => {
  const f = fixture(t, { silentRegistry: true });
  try {
    f.run(['ALREADY']);
    await advance(t, 9200);
    assert.ok(f.result(), 'RequireJS must not leave the run pending');
    assert.equal(f.result()!.ok, true);
    assert.deepEqual(Array.from(f.result()!.already), ['ALREADY']);
    assert.deepEqual(f.col.selected(), [90]);
  } finally { f.close(); }
});

test('Stop cancels a silent registry wait without filtering or changing selection', async t => {
  const f = fixture(t, { silentRegistry: true });
  try {
    f.run(['TARGET']);
    f.doc.documentElement.setAttribute('data-mhx-assoc-bulk-cancel', '1');
    await advance(t, 300);
    assert.ok(f.result(), 'Stop must interrupt the module wait');
    assert.equal(f.result()!.cancelled, true);
    assert.deepEqual(f.filters, []);
    assert.deepEqual(f.col.selected(), [90]);
    assert.deepEqual(f.col.excluded(), [41, 99]);
  } finally { f.close(); }
});

for (const failRestore of [false, true]) {
  test(`Stop with ${failRestore ? 'timed-out' : 'successful'} restoration reports the real outcome`, async t => {
    const f = fixture(t, { stopOnFilter: true, failRestore });
    try {
      f.run(['TARGET']);
      await advance(t, 10200);
      assert.ok(f.result());
      assert.equal(f.result()!.cancelled, true);
      assert.equal(f.result()!.ok, !failRestore);
      if (failRestore) assert.match(f.result()!.reason!, /restor/i);
      assert.deepEqual(f.filters, ['TARGET', 'ORIGINAL']);
      assert.deepEqual(f.col.selected(), [90]);
      assert.deepEqual(f.col.excluded(), [41, 99]);
      assert.equal(f.mutations(), 0);
    } finally { f.close(); }
  });
}

test('normal restore timeout refuses selection instead of reporting success', async t => {
  const f = fixture(t, { failRestore: true });
  try {
    f.run(['TARGET']);
    await advance(t, 10200);
    assert.ok(f.result());
    assert.equal(f.result()!.ok, false);
    assert.match(f.result()!.reason!, /restor/i);
    assert.deepEqual(f.col.selected(), [90]);
    assert.deepEqual(f.col.excluded(), [41, 99]);
    assert.equal(f.mutations(), 0);
  } finally { f.close(); }
});

test('serialised run preserves earlier selection, adds visible/off-page ids and retains unrelated exclusions', async t => {
  const f = fixture(t);
  try {
    f.run(['ALREADY', 'VISIBLE', 'TARGET', 'MISSING']);
    await advance(t, 4000);
    assert.ok(f.result());
    assert.equal(f.result()!.ok, true);
    assert.equal(f.result()!.cancelled, false);
    assert.deepEqual(Array.from(f.result()!.already), ['ALREADY']);
    assert.deepEqual(Array.from(f.result()!.missing), ['MISSING']);
    assert.deepEqual(Array.from(f.col.selected()), [90, 1, 41]);
    assert.deepEqual(Array.from(f.col.excluded()), [99]);
    assert.equal(f.result()!.selectedBefore, 1);
    assert.equal(f.result()!.selectedAfter, 3);
    assert.equal(f.mutations(), 0);
  } finally { f.close(); }
});
