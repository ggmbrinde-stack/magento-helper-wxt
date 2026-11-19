import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error - jsdom ships no types and is only used by DOM tests.
import { JSDOM } from 'jsdom';
import { applyPpPlanRows, placePpItemRows } from '../src/page/features/pp-scan/apply';
import { removePpItemRows } from '../src/page/features/pp-scan/remove';

const row = (index: number, parent: string, option: string, name: string, sort = ''): string =>
  `<tr><td><select name="groups[0][options][sub_options_items][${index}][parent]">` +
  `<option value="k1">Face 1</option><option value="k2">Face 2</option></select>` +
  `<select name="groups[0][options][sub_options_items][${index}][name_option]">` +
  `<option value="">-- Please Select --</option><option value="1">Tampografia 1 Cor</option><option value="11">Laser Metal</option></select>` +
  `<input name="groups[0][options][sub_options_items][${index}][name]" value="${name}">` +
  `<input name="groups[0][options][sub_options_items][${index}][sort]" value="${sort}">` +
  `<select name="groups[0][options][sub_options_items][${index}][store_view]">` +
  `<option value="0">All Store Views</option><option value="1">PT</option></select></td>` +
  `<td>${index === 0 ? parent : ''}</td><td>${index === 0 ? option : ''}</td></tr>`;

function withPage(run: (dom: any) => Promise<void>, late = false, existingSort = '3'): Promise<void> {
  const dom = new JSDOM(`<!doctype html><ul class="admin__page-nav-items"><li><a id="tab_options" href="#options">Options</a></li></ul>` +
    `<table id="items"><thead><tr><th>Parent</th></tr></thead><tbody id="body">${row(0, 'k1', '1', '1', existingSort)}` +
    `<tr><td><button type="button" id="add">Add Item</button></td></tr></tbody></table>`,
    { url: 'https://bestofgifts.pt/admin/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/42/' });
  const document = dom.window.document;
  // The existing row already carries a technique, exactly as the native select renders it.
  (document.querySelector('select[name*="[sub_options_items][0][name_option]"]') as any).value = '1';
  let index = 1;
  document.querySelector('#add')!.addEventListener('click', () => {
    const body = document.querySelector('#body')!;
    const holder = document.createElement('tbody');
    holder.innerHTML = row(index, 'k1', '1', '');
    // Magento's native Add Item renders the new row first; the apply lane must move it below.
    const added = holder.firstElementChild as any;
    body.insertBefore(added, body.firstElementChild);
    if (late) {
      // Knockout can fill the technique dropdown after the row is already in the table.
      const select = added.querySelector('select[name*="[name_option]"]');
      const option = Array.from(select.options as any[]).find((entry: any) => entry.value === '11') as any;
      option?.remove();
      setTimeout(() => {
        const replacement = document.createElement('option');
        replacement.value = '11';
        replacement.text = 'Laser Metal';
        select.appendChild(replacement);
      }, 400);
    }
    index += 1;
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousEvent = Object.getOwnPropertyDescriptor(globalThis, 'Event');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  // jsdom only accepts its own Event instances; the injected page function uses the page's class.
  Object.defineProperty(globalThis, 'Event', { value: dom.window.Event, configurable: true });
  return run(dom).finally(() => {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousEvent) Object.defineProperty(globalThis, 'Event', previousEvent);
    else Reflect.deleteProperty(globalThis, 'Event');
  });
}

const plan = (catalogueId: string) => [{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId }];

// The live page repeats the items segment, and Magento appends the new row at the bottom. Both
// details decide whether the lane edits the row it just added or an older row of the table.
const doubledRow = (index: number, parent: string, option: string, name = ''): string =>
  `<tr><td><select name="options[sub_options_items][sub_options_items][${index}][parent]">` +
  `<option value="k1"${parent === 'k1' ? ' selected' : ''}>Face 1</option>` +
  `<option value="k2"${parent === 'k2' ? ' selected' : ''}>Caixa</option></select>` +
  `<select name="options[sub_options_items][sub_options_items][${index}][name_option]">` +
  `<option value="1"${option === '1' ? ' selected' : ''}>Tampografia 1 Cor</option>` +
  `<option value="19"${option === '19' ? ' selected' : ''}>Laser CO2 250</option></select>` +
  `<input name="options[sub_options_items][sub_options_items][${index}][name]" value="${name}">` +
  `<input name="options[sub_options_items][sub_options_items][${index}][sort]" value="">` +
  `<select name="options[sub_options_items][sub_options_items][${index}][store_view]"><option value="1">PT</option></select></td></tr>`;

async function withDoubledPage(run: (dom: any) => Promise<void>, addedName?: (index: number) => string): Promise<void> {
  const dom = new JSDOM(`<!doctype html><ul class="admin__page-nav-items"><li><a href="#options">Options</a></li></ul>` +
    `<table id="items"><tbody id="body">${doubledRow(0, 'k2', '1', '1')}` +
    `<tr><td><button type="button" id="add">Add Item</button></td></tr></tbody></table>`);
  const document = dom.window.document;
  let index = 1;
  document.querySelector('#add')!.addEventListener('click', () => {
    const body = document.querySelector('#body')!;
    const holder = document.createElement('tbody');
    if (addedName) holder.innerHTML = addedName(index);
    else holder.innerHTML = doubledRow(index, 'k2', '1');
    body.insertBefore(holder.firstElementChild as Node, body.lastElementChild);
    index += 1;
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousEvent = Object.getOwnPropertyDescriptor(globalThis, 'Event');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  Object.defineProperty(globalThis, 'Event', { value: dom.window.Event, configurable: true });
  return run(dom).finally(() => {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousEvent) Object.defineProperty(globalThis, 'Event', previousEvent);
    else Reflect.deleteProperty(globalThis, 'Event');
  });
}

test('a repeated items segment still edits the row just added, not an older row (PP 963)', async () => {
  await withDoubledPage(async dom => {
    const report = await applyPpPlanRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser CO2 250', catalogueId: '19' }]);
    assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
    const document = dom.window.document;
    const existingOption = document.querySelector('select[name*="[sub_options_items][0][name_option]"]') as any;
    const existingParent = document.querySelector('select[name*="[sub_options_items][0][parent]"]') as any;
    assert.equal(existingOption.value, '1', 'the existing row keeps its technique');
    assert.equal(existingParent.value, 'k2', 'the existing row keeps its face');
    assert.equal((document.querySelector('select[name*="[sub_options_items][1][name_option]"]') as any).value, '19');
    assert.equal((document.querySelector('select[name*="[sub_options_items][1][parent]"]') as any).value, 'k1');
  });
});

test('a new row with no numeric index stops the lane without touching another row', async () => {
  await withDoubledPage(async dom => {
    const report = await applyPpPlanRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser CO2 250', catalogueId: '19' }]);
    assert.equal(report.results[0]!.outcome, 'failed');
    assert.match(report.results[0]!.reason, /no numeric index/);
    const document = dom.window.document;
    assert.equal((document.querySelector('select[name*="[sub_options_items][0][name_option]"]') as any).value, '1');
    assert.equal((document.querySelector('select[name*="[sub_options_items][0][parent]"]') as any).value, 'k2');
  }, () =>
    `<tr><td><select name="options[sub_options_items][parent]">` +
    `<option value="k1">Face 1</option></select>` +
    `<select name="options[sub_options_items][name_option]">` +
    `<option value="1">Tampografia 1 Cor</option><option value="19">Laser CO2 250</option></select></td></tr>`);
});

test('a missing technique is added below the rows of the same face', async () => {
  await withPage(async dom => {
    const report = await applyPpPlanRows(plan('11'));
    assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
    const rows = Array.from(dom.window.document.querySelectorAll('#body tr')) as any[];
    const first = rows[0]!;
    const added = rows[1]!;
    assert.equal(first.querySelector('select[name*="[name_option]"]').value, '1', 'existing row keeps its place');
    assert.equal(added.querySelector('select[name*="[parent]"]').value, 'k1');
    assert.equal(added.querySelector('select[name*="[name_option]"]').value, '11');
    assert.equal(added.querySelector('input[name$="[name]"]').value, '11');
  });
});

test('a technique already on the face is skipped, not duplicated', async () => {
  await withPage(async dom => {
    const before = dom.window.document.querySelectorAll('#body tr').length;
    const report = await applyPpPlanRows(plan('1'));
    assert.equal(report.results[0]!.outcome, 'skipped');
    assert.match(report.results[0]!.reason, /Already on this face/);
    assert.equal(dom.window.document.querySelectorAll('#body tr').length, before);
  });
});

test('a present row claims the stored copy, so the planned second copy is still added', async () => {
  await withPage(async dom => {
    const document = dom.window.document;
    // The face already holds this technique once, and a present plan row accounts for it.
    (document.querySelector('select[name*="[sub_options_items][0][name_option]"]') as any).value = '11';
    const report = await applyPpPlanRows([{ ...plan('11')[0]!, claimed: 1 }]);
    assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
  });
});

test('an unknown catalogue id fails without claiming success', async () => {
  await withPage(async () => {
    const report = await applyPpPlanRows(plan('99'));
    assert.equal(report.results[0]!.outcome, 'failed');
    assert.match(report.reason, /Nothing is saved/);
  });
});

test('a plan without an exact catalogue id is skipped', async () => {
  await withPage(async () => {
    const report = await applyPpPlanRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'x', catalogueId: 'abc' }]);
    assert.equal(report.results[0]!.outcome, 'skipped');
  });
});

test('a Notion-only face label is never used as the Magento parent', async () => {
  await withPage(async dom => {
    const before = dom.window.document.querySelectorAll('#body tr').length;
    const report = await applyPpPlanRows([{ face: 'Face 1', magentoFace: '', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'skipped');
    assert.match(report.results[0]!.reason, /No Magento face label/);
    assert.equal(dom.window.document.querySelectorAll('#body tr').length, before);
  });
});

test('an unknown Magento face is skipped without adding an empty row', async () => {
  await withPage(async dom => {
    const before = dom.window.document.querySelectorAll('#body tr').length;
    const report = await applyPpPlanRows([{ face: '1 Face', magentoFace: 'Face 9', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'skipped');
    assert.match(report.results[0]!.reason, /not in the native parent dropdown/);
    assert.equal(dom.window.document.querySelectorAll('#body tr').length, before);
  });
});

test('duplicate Magento face labels are refused, not guessed', async () => {
  await withPage(async dom => {
    const parent = dom.window.document.querySelector('select[name*="[parent]"]') as any;
    parent.appendChild(parent.options[0].cloneNode(true));
    const before = dom.window.document.querySelectorAll('#body tr').length;
    const report = await applyPpPlanRows(plan('11'));
    assert.equal(report.results[0]!.outcome, 'skipped');
    assert.match(report.results[0]!.reason, /More than one Magento face/);
    assert.equal(dom.window.document.querySelectorAll('#body tr').length, before);
  });
});

test('an appended row gets a Sort value above the rows of its face', async () => {
  await withPage(async dom => {
    const report = await applyPpPlanRows(plan('11'));
    assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
    const rows = Array.from(dom.window.document.querySelectorAll('#body tr')) as any[];
    assert.equal(rows[0]!.querySelector('input[name*="[sort]"]').value, '3', 'the existing row keeps its own sort');
    assert.equal(rows[1]!.querySelector('input[name*="[sort]"]').value, '4');
  });
});

test('a face that keeps blank sorts does not get a number', async () => {
  await withPage(async dom => {
    const report = await applyPpPlanRows(plan('11'));
    assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
    const rows = Array.from(dom.window.document.querySelectorAll('#body tr')) as any[];
    assert.equal(rows[0]!.querySelector('input[name*="[sort]"]').value, '', 'the existing row keeps its blank sort');
    assert.equal(rows[1]!.querySelector('input[name*="[sort]"]').value, '', 'a number would sort above the blank rows');
  }, false, '');
});

test('a re-render during the move does not drop the Sort number of the added row', async () => {
  await withPage(async dom => {
    const records = new Map<any, any>();
    const list: any[] = [];
    const view: any = {};
    view.elems = (next?: unknown[]) => {
      if (Array.isArray(next)) {
        list.splice(0, list.length, ...next);
        // Magento renders the row again from the record list here, dropping the value typed before
        // the move. The existing row is numbered 3, so the added row has to end up as 4 anyway.
        const added = (Array.from(dom.window.document.querySelectorAll('#body tr')) as any[])
          .find((node: any) => node.querySelector('select[name*="[sub_options_items][1][name_option]"]'));
        const input = added?.querySelector('input[name*="[sort]"]') as HTMLInputElement | null;
        if (input) input.value = '1';
        return list;
      }
      return list;
    };
    const recordFor = (node: any) => {
      let record = records.get(node);
      if (!record) { record = { node }; records.set(node, record); list.push(record); }
      return record;
    };
    const ko = { dataFor: recordFor, contextFor: () => ({ $data: view, $parent: null }) };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
    try {
      const report = await applyPpPlanRows(plan('11'));
      assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
      const rows = Array.from(dom.window.document.querySelectorAll('#body tr')) as any[];
      assert.equal(rows[0]!.querySelector('input[name*="[sort]"]').value, '3', 'the existing row keeps its own sort');
      assert.equal(rows[1]!.querySelector('input[name*="[sort]"]').value, '4', 'the added row is numbered again after the re-render');
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});

test('the order report names the plan rows that are in place, not a count', async () => {
  await withPage(async dom => {
    const records = new Map<any, any>();
    const list: any[] = [];
    const view: any = {};
    view.elems = (next?: unknown[]) => {
      if (Array.isArray(next)) { list.splice(0, list.length, ...next); return list; }
      return list;
    };
    const recordFor = (node: any) => {
      let record = records.get(node);
      if (!record) { record = { node }; records.set(node, record); list.push(record); }
      return record;
    };
    // The page already holds a record list for the row that is on the form.
    recordFor(dom.window.document.querySelector('#body tr'));
    const ko = { dataFor: recordFor, contextFor: () => ({ $data: view, $parent: null }) };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
    try {
      const report = await placePpItemRows([
        { face: '1 Face', magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
        { face: 'Face 9', magentoFace: 'Face 9', technique: 'Bordado', catalogueId: '99' },
      ], false, null, 'plan');
      assert.equal(report.total, 2);
      assert.equal(report.ordered, 1, 'only the row whose face is on the form counts as placed: ' + JSON.stringify(report));
      assert.deepEqual(report.orderedRows, [0], 'the placed row is named by its plan index');
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});

test('a repeated technique credits only the copy that is in place', async () => {
  await withPage(async dom => {
    const select = dom.window.document.querySelector('select[name*="[name_option]"]') as any;
    const option = dom.window.document.createElement('option');
    option.value = '19'; option.text = 'Laser CO2 250';
    select.appendChild(option); select.value = '19';
    const records = new Map<any, any>();
    const list: any[] = [];
    const view: any = {};
    view.elems = (next?: unknown[]) => {
      if (Array.isArray(next)) { list.splice(0, list.length, ...next); return list; }
      return list;
    };
    const recordFor = (node: any) => {
      let record = records.get(node);
      if (!record) { record = { node }; records.set(node, record); list.push(record); }
      return record;
    };
    recordFor(dom.window.document.querySelector('#body tr'));
    const ko = { dataFor: recordFor, contextFor: () => ({ $data: view, $parent: null }) };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
    try {
      const report = await placePpItemRows([
        { face: '1 Face', magentoFace: 'Face 1', technique: 'Laser CO2 250', catalogueId: '19' },
        { face: '1 Face', magentoFace: 'Face 1', technique: 'Laser CO2 250', catalogueId: '19' },
      ], false, null, 'plan');
      assert.equal(report.total, 2);
      assert.equal(report.ordered, 1, 'one stored copy satisfies one occurrence');
      assert.deepEqual(report.orderedRows, [0], 'the second copy has no row of its own and is not credited');
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});

test('a repeated technique on one face gets its own Sort value', async () => {
  await withPage(async dom => {
    const document = dom.window.document;
    // Magento's own Add Item gives the page a second row with the same technique on the same face.
    (document.querySelector('#add') as any).click();
    (document.querySelector('select[name*="[sub_options_items][1][name_option]"]') as any).value = '1';
    const report = await placePpItemRows([
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
    ], true, null, 'plan');
    assert.equal(report.total, 2);
    const sorts = Array.from(document.querySelectorAll('input[name*="[sort]"]'))
      .map((input: any) => input.value);
    assert.deepEqual(sorts, ['1', '2'], 'each copy is numbered, not the first copy twice');
  });
});

// The module names its record list itself, so the list is found by shape, not by one name.
for (const key of ['elems', 'items', 'lineItems']) {
  test(`the saved order follows the loaded record list (${key})`, async () => {
    await withPage(async dom => {
      const records = new Map<any, any>();
      const list: any[] = [];
      const view: any = {};
      view[key] = (next?: unknown[]) => {
        if (Array.isArray(next)) { list.splice(0, list.length, ...next); return list; }
        return list;
      };
      const recordFor = (node: any) => {
        let record = records.get(node);
        if (!record) { record = { node }; records.set(node, record); list.push(record); }
        return record;
      };
      const ko = { dataFor: recordFor, contextFor: () => ({ $data: view, $parent: null }) };
      const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
      try {
        const report = await applyPpPlanRows(plan('11'));
        assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
        assert.match(report.results[0]!.reason, /Row order set below its face/);
        const rows = Array.from(dom.window.document.querySelectorAll('#body tr')) as any[];
        assert.equal(list.length, 2, 'both rows are in the record list');
        assert.equal(list[0]!.node, rows[0], 'the existing row stays first in the record list');
        assert.equal(list[1]!.node, rows[1], 'the added row follows it in the record list');
      } finally {
        if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
        else Reflect.deleteProperty(globalThis, 'window');
      }
    });
  });
}

// The dynamic-rows component keeps its record list on the prototype, so an instance-only descriptor
// lookup found no list at all and the added row was left at the top of the table.
test('a saved-order list defined on the component prototype is still found', async () => {
  await withPage(async dom => {
    const records = new Map<any, any>();
    const list: any[] = [];
    const proto: any = {};
    proto.elems = function (next?: unknown[]) {
      if (Array.isArray(next)) { list.splice(0, list.length, ...next); return list; }
      return list;
    };
    const view: any = Object.create(proto);
    const recordFor = (node: any) => {
      let record = records.get(node);
      if (!record) { record = { node }; records.set(node, record); list.push(record); }
      return record;
    };
    const ko = { dataFor: recordFor, contextFor: () => ({ $data: view, $parent: null }) };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
    try {
      const report = await applyPpPlanRows(plan('11'));
      assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
      assert.match(report.results[0]!.reason, /Row order set below its face/);
      const rows = Array.from(dom.window.document.querySelectorAll('#body tr')) as any[];
      assert.equal(list.length, 2, 'both rows are in the record list');
      assert.equal(list[0]!.node, rows[0], 'the existing row stays first in the record list');
      assert.equal(list[1]!.node, rows[1], 'the added row follows it in the record list');
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});

test('a technique dropdown filled late is still set', async () => {
  await withPage(async () => {
    const report = await applyPpPlanRows(plan('11'));
    assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
  }, true);
});

test('the filled form is left showing the Options tab, so opening it needs no click', async () => {
  await withPage(async dom => {
    let clicks = 0;
    dom.window.document.getElementById('tab_options').addEventListener('click', () => { clicks += 1; });
    const report = await applyPpPlanRows(plan('11'));
    assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
    assert.ok(clicks >= 2, `the Options tab was opened ${clicks} time(s)`);
  });
});

test('a panel that shares the Options tab id is never clicked instead of the nav link', async () => {
  const dom = new JSDOM('<!doctype html><ul class="admin__page-nav-items"><li><a id="tab_general" href="#general">General</a></li>' +
    '<li><a href="#options">Options</a></li></ul>' +
    '<div id="toogas_attributesetcustomoptions_attributesetcustomoptions_tabs_options">panel</div>');
  const document = dom.window.document;
  let panel = 0, nav = 0;
  document.getElementById('toogas_attributesetcustomoptions_attributesetcustomoptions_tabs_options')!
    .addEventListener('click', () => { panel += 1; });
  document.querySelector('a[href="#options"]')!.addEventListener('click', () => { nav += 1; });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const response = await import('../src/page/features/pp-scan/page');
    assert.equal(response.activatePpOptionsTab(), true);
    assert.equal(nav, 1);
    assert.equal(panel, 0);
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('the saved order follows a record list exposed through a getter', async () => {
  await withPage(async dom => {
    const list: any[] = [];
    const records = new Map<any, any>();
    const recordFor = (node: any) => {
      let record = records.get(node);
      if (!record) { record = { node }; records.set(node, record); list.push(record); }
      return record;
    };
    const view: any = {};
    Object.defineProperty(view, 'lineRecords', { get: () => list, enumerable: true, configurable: true });
    const ko = { dataFor: recordFor, contextFor: () => ({ $data: view, $parent: null }) };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
    try {
      const report = await applyPpPlanRows(plan('11'));
      assert.equal(report.results[0]!.outcome, 'added', report.results[0]!.reason);
      assert.match(report.results[0]!.reason, /Row order set below its face/);
      const rows = Array.from(dom.window.document.querySelectorAll('#body tr')) as any[];
      assert.equal(list[0]!.node, rows[0], 'the existing row stays first');
      assert.equal(list[1]!.node, rows[1], 'the added row follows it');
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});

test('a row with no delete control is removed from the list the form posts', async () => {
  const dom = new JSDOM('<!doctype html><table><tbody id="body">' +
    '<tr><td><select name="groups[0][options][sub_options_items][0][parent]">' +
    '<option value="k1" selected>Face 1</option></select>' +
    '<select name="groups[0][options][sub_options_items][0][name_option]">' +
    '<option value="11" selected>Laser Metal</option></select>' +
    '<span class="icon">x</span></td></tr>' +
    '<tr><td><select name="groups[0][options][sub_options_items][1][parent]">' +
    '<option value="k1" selected>Face 1</option></select>' +
    '<select name="groups[0][options][sub_options_items][1][name_option]">' +
    '<option value="1" selected>Tampografia</option></select></td></tr>' +
    '</tbody></table>');
  const document = dom.window.document;
  const rows = Array.from(document.querySelectorAll('tr'));
  const record = { name_option: '11' };
  const other = { name_option: '1' };
  const posted = [record, other];
  // Knockout keeps the binding context on the bound node, and the record list on the view model.
  (rows[0] as any).__ko__42 = {
    get: (_target: Element, name: string) => name === 'ko_bindingContext'
      ? { $data: record, $parent: { $data: { elems: posted } } }
      : undefined,
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await removePpItemRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'removed', report.results[0]!.reason);
    assert.deepEqual(posted, [other], 'the posted list no longer holds the chosen row');
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('an icon-only delete control is found inside the row', async () => {
  const dom = new JSDOM('<!doctype html><table><tbody id="body">' +
    '<tr><td><select name="groups[0][options][sub_options_items][0][parent]">' +
    '<option value="k1" selected>Face 1</option></select>' +
    '<select name="groups[0][options][sub_options_items][0][name_option]">' +
    '<option value="11" selected>Laser Metal</option></select>' +
    '<input class="admin__control-text" name="groups[0][options][sub_options_items][0][sort]">' +
    '<span class="admin__field-control"><i class="admin__grid-trash"></i></span></td></tr>' +
    '</tbody></table>');
  const document = dom.window.document;
  const target = document.querySelector('tr')!;
  document.querySelector('i.admin__grid-trash')!.addEventListener('click', () => { target.remove(); });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await removePpItemRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'removed', report.results[0]!.reason);
    assert.equal(document.querySelectorAll('select[name*="[parent]"]').length, 0);
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('a chosen row is removed with its own delete control, never Delete all', async () => {
  const dom = new JSDOM('<!doctype html><table><tbody id="body">' +
    '<tr><td><select name="groups[0][options][sub_options_items][0][parent]">' +
    '<option value="k1" selected>Face 1</option></select>' +
    '<select name="groups[0][options][sub_options_items][0][name_option]">' +
    '<option value="">-- Please Select --</option><option value="1">Tampografia</option>' +
    '<option value="11" selected>Laser Metal</option></select>' +
    '<button type="button" id="del-row" title="Delete">trash</button></td></tr>' +
    '<tr><td><select name="groups[0][options][sub_options_items][1][parent]">' +
    '<option value="k1" selected>Face 1</option></select>' +
    '<select name="groups[0][options][sub_options_items][1][name_option]">' +
    '<option value="1" selected>Tampografia</option></select>' +
    '<button type="button" id="keep-row" title="Delete">trash</button></td></tr>' +
    '</tbody></table><button type="button" id="delete-all">Delete all</button>');
  const document = dom.window.document;
  let deleteAll = 0;
  document.getElementById('delete-all')!.addEventListener('click', () => { deleteAll += 1; });
  const target = document.querySelector('tr')!;
  document.getElementById('del-row')!.addEventListener('click', () => { target.remove(); });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await removePpItemRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'removed', report.results[0]!.reason);
    assert.equal(deleteAll, 0, 'the page-wide Delete all is never pressed');
    assert.equal(document.querySelectorAll('select[name*="[parent]"]').length, 1);
    assert.ok(document.querySelector('select[name*="[0][name_option]"]')!.getAttribute('name'),
      'the remaining row is renumbered so the posted order has no gap');
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('a delete icon that only listens for a mouse press is still pressed', async () => {
  const dom = new JSDOM('<!doctype html><table><tbody id="body">' +
    '<tr><td><select name="groups[0][options][sub_options_items][0][parent]">' +
    '<option value="k1" selected>Face 1</option></select>' +
    '<select name="groups[0][options][sub_options_items][0][name_option]">' +
    '<option value="11" selected>Laser Metal</option></select>' +
    '<td class="admin__delete-cell"><span class="admin__trash-icon" data-bind="click: remove"></span></td></tr>' +
    '</tbody></table>');
  const document = dom.window.document;
  const target = document.querySelector('tr')!;
  // The page listens for the press, not for the click, so a bare click would do nothing.
  document.querySelector('.admin__delete-cell')!.addEventListener('mousedown', () => { target.remove(); });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await removePpItemRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'removed', report.results[0]!.reason);
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('the delete button is pressed, not the label inside it, and a hidden row counts as gone', async () => {
  const dom = new JSDOM('<!doctype html><table><tbody id="body">' +
    '<tr><td><select name="options[sub_options_items][sub_options_items][0][parent]">' +
    '<option value="key_pjupep" selected>Face 1</option></select>' +
    '<select name="options[sub_options_items][sub_options_items][0][name_option]">' +
    '<option value="11" selected>Laser Metal</option></select></td>' +
    '<td class="actionDelete"><button class="action-delete" ' +
    'data-bind="click: function(){ $parent.processingDeleteRecord($record().index, $record().recordId); }">' +
    '<span data-bind="i18n: $parent.deleteButtonLabel"></span></button></td></tr>' +
    '</tbody></table>');
  const document = dom.window.document;
  const target = document.querySelector('tr')!;
  let labelPressed = 0;
  document.querySelector('button.action-delete span')!.addEventListener('click', () => { labelPressed += 1; });
  // Magento hides the row through Knockout instead of removing it from the table.
  document.querySelector('button.action-delete')!.addEventListener('click', () => {
    (target as HTMLElement).style.display = 'none';
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await removePpItemRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'removed', report.results[0]!.reason);
    assert.equal(labelPressed, 0, 'the button is pressed directly, so its label is never the target');
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

// The record list is the only lever the page itself uses, so the order lane writes that list and
// leaves the table nodes alone. A table that only looks reordered is lost on the next render.
test('the order lane rewrites the record list the page posts and leaves the table nodes alone', async () => {
  const row = (index: number, id: string, label: string): string =>
    `<tr data-repeat-index="${index}"><td>` +
    `<select name="options[sub_options_items][sub_options_items][${index}][parent]">` +
    `<option value="key_pjupep" selected>Face 1</option></select>` +
    `<select name="options[sub_options_items][sub_options_items][${index}][name_option]">` +
    `<option value="${id}" selected>${label}</option></select></td></tr>`;
  const dom = new JSDOM('<!doctype html><table><tbody id="body">' +
    row(0, '11', 'Laser Metal') + row(1, '1', 'Tampografia') + '</tbody></table>');
  const document = dom.window.document;
  const records = [{ id: '11' }, { id: '1' }];
  const list: unknown[] = records.slice();
  const component: Record<string, unknown> = {};
  component.elems = (next?: unknown[]) => {
    if (Array.isArray(next)) { list.splice(0, list.length, ...next); return list; }
    return list;
  };
  const ko = { dataFor: () => component, contextFor: () => ({ $data: component, $parent: null }) };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await placePpItemRows([
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Tampografia', catalogueId: '1' },
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' },
    ]);
    assert.equal(report.ordered, 2, report.reason);
    assert.equal(report.modelMoved, true);
    assert.equal(list[0], records[1], 'the record for catalogue id 1 is first in the list');
    assert.equal(list[1], records[0]);
    assert.equal((document.querySelector('select[name*="[0][name_option]"]') as HTMLSelectElement).value, '11',
      'the table nodes are not reordered');
  } finally {
    dom.window.close();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('a row button labelled Delete all is still the control that is pressed', async () => {
  const dom = new JSDOM('<!doctype html><table><tbody id="body">' +
    '<tr><td><select name="options[sub_options_items][sub_options_items][0][parent]">' +
    '<option value="key_pjupep" selected>Face 1</option></select>' +
    '<select name="options[sub_options_items][sub_options_items][0][name_option]">' +
    '<option value="11" selected>Laser Metal</option></select></td>' +
    '<td class="toogas_form.areas.options.sub_options_items.0.actionDelete">' +
    '<button class="action-delete" data-bind="click: function(){ $parent.processingDeleteRecord(0, 7); }">' +
    '<span data-bind="i18n: $parent.deleteButtonLabel">Delete all</span></button></td></tr>' +
    '</tbody></table>');
  const document = dom.window.document;
  const row = document.querySelector('tr')!;
  let pressedTag = '';
  document.querySelector('button.action-delete')!.addEventListener('click', (event: Event) => {
    // The page-wide Delete all sits outside the row, so this label is the row's own button.
    pressedTag = (event.target as HTMLElement).tagName;
    row.remove();
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await removePpItemRows([{ face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' }]);
    assert.equal(report.results[0]!.outcome, 'removed', report.results[0]!.reason);
    assert.equal(pressedTag, 'BUTTON', 'the button is the target, not the cell around it');
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('the order lane reports what it saw', async () => {
  const cell = (index: number, id: string): string =>
    '<td><select name="options[sub_options_items][sub_options_items][' + index + '][parent]">' +
    '<option selected>Face 1</option></select>' +
    '<select name="options[sub_options_items][sub_options_items][' + index + '][name_option]">' +
    '<option value="' + id + '" selected>' + id + '</option></select></td>';
  const dom = new JSDOM('<!doctype html><table><tbody><tr>' + cell(0, '11') + '</tr><tr>' + cell(1, '1') + '</tr></tbody></table>');
  const document = dom.window.document;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await placePpItemRows([
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' },
    ]);
    assert.equal(report.diagnostics?.tableFound, true);
    assert.equal(report.diagnostics?.rowCount, 2);
    assert.deepEqual(report.diagnostics?.modelOrder, [], 'no record list, so no model order');
    assert.deepEqual(Array.from(document.querySelectorAll('select[name*="[name_option]"]'))
      .map(select => (select as HTMLSelectElement).value), ['11', '1'], 'the table nodes are left as they are');
    assert.equal(report.diagnostics?.build, 'pp-order-4');
    assert.equal(report.diagnostics?.listFound, false, 'no page model in this fixture');
    assert.equal(report.ordered, 0, 'no record list means no order is set');
    assert.match(report.reason, /record list that Save posts was not found/);
  } finally {
    dom.window.close();
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('a second copy of a technique already on the face is added', async () => {
  await withPage(async dom => {
    const before = dom.window.document.querySelectorAll('#body tr').length;
    const report = await applyPpPlanRows([
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
      { face: '1 Face', magentoFace: 'Face 1', technique: 'Tampografia 1 Cor', catalogueId: '1' },
    ]);
    // The stored copy satisfies the first plan row, and the second row is a real addition.
    assert.equal(report.results[0]!.outcome, 'skipped');
    assert.match(report.results[0]!.reason, /Already on this face/);
    assert.equal(report.results[1]!.outcome, 'added', report.results[1]!.reason);
    // This fixture has no page model, so only the visible row can be placed; the copy is real.
    assert.match(report.results[1]!.reason, /Added to the form|Row order set below its face/);
    assert.equal(dom.window.document.querySelectorAll('#body tr').length, before + 1);
  });
});

test('the plan arrangement puts a technique Notion lists first at the top of its face', async () => {
  const row = (index: number, id: string): string =>
    `<tr><td><select name="options[sub_options_items][sub_options_items][${index}][parent]">` +
    `<option value="key_pjupep" selected>Face 1</option></select>` +
    `<select name="options[sub_options_items][sub_options_items][${index}][name_option]">` +
    `<option value="${id}" selected>${id}</option></select></td></tr>`;
  const dom = new JSDOM('<!doctype html><table><tbody>' + row(0, '99') + row(1, '11') + row(2, '1') + '</tbody></table>');
  const document = dom.window.document;
  const records = [{ id: '99' }, { id: '11' }, { id: '1' }];
  const list: unknown[] = records.slice();
  const component: Record<string, unknown> = {};
  component.elems = (next?: unknown[]) => {
    if (Array.isArray(next)) { list.splice(0, list.length, ...next); return list; }
    return list;
  };
  const ko = { dataFor: () => component, contextFor: () => ({ $data: component, $parent: null }) };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { value: { ko }, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  try {
    const report = await placePpItemRows([
      { face: 'Face 1', magentoFace: 'Face 1', technique: 'Tampografia', catalogueId: '1' },
      { face: 'Face 1', magentoFace: 'Face 1', technique: 'Laser Metal', catalogueId: '11' },
    ], false, null, 'plan');
    assert.equal(report.ordered, 2, report.reason);
    assert.deepEqual((list as Array<{ id: string }>).map(entry => entry.id), ['1', '11', '99'],
      'the planned rows come first in plan order and the row Notion does not name follows');
  } finally {
    dom.window.close();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
