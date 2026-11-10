import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error - untyped transitive dependency
import { JSDOM } from 'jsdom';
import { enhanceSelect, writeNativeValue } from '../src/page/features/dropdowns';
import { enhanceCategoryTrees } from '../src/page/features/category-tree';

function useDom(html: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://bestofgifts.pt/admin/catalog/product_action_attribute/edit/',
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const key of ['window', 'document', 'location', 'Element', 'HTMLElement',
    'HTMLSelectElement', 'HTMLOptionElement', 'HTMLOptGroupElement',
    'HTMLInputElement', 'HTMLUListElement', 'HTMLLIElement', 'Node',
    'Event', 'MouseEvent', 'MutationObserver']) globals[key] = dom.window[key];
  return dom;
}

for (const presentation of ['search', 'segmented'] as const) {
  test(`${presentation} honours native disabling before and after mounting`, () => {
    const dom = useDom('<select disabled><option value="a">A</option><option value="b">B</option></select>');
    const select = document.querySelector('select')!;
    const events: string[] = [];
    select.addEventListener('input', () => events.push('input'));
    select.addEventListener('change', () => events.push('change'));
    const decorator = enhanceSelect(select, { presentation })!;
    const chooseB = () => {
      if (presentation === 'search') document.querySelector<HTMLButtonElement>('.mhx-nh-trigger')!.click();
      document.querySelector<HTMLElement>('[data-value="b"]')!.click();
    };
    try {
      chooseB();
      assert.equal(select.value, 'a');
      assert.deepEqual(events, []);
      select.disabled = false;
      chooseB();
      assert.equal(select.value, 'b');
      assert.deepEqual(events, ['input', 'change']);
      select.value = 'a';
      select.disabled = true;
      events.length = 0;
      chooseB();
      assert.equal(select.value, 'a');
      assert.deepEqual(events, []);
    } finally {
      decorator.destroy();
      dom.window.close();
    }
  });
}

test('shared write boundary honours a disabled fieldset and its first legend exception', () => {
  const dom = useDom('<fieldset disabled><legend><select id="legend"><option>a</option><option>b</option></select></legend><select id="field"><option>a</option><option>b</option></select></fieldset>');
  try {
    const field = document.querySelector<HTMLSelectElement>('#field')!;
    let changes = 0;
    field.addEventListener('input', () => changes++);
    field.addEventListener('change', () => changes++);
    writeNativeValue(field, 'b');
    assert.equal(field.value, 'a');
    assert.equal(changes, 0);
    const legend = document.querySelector<HTMLSelectElement>('#legend')!;
    writeNativeValue(legend, 'b');
    assert.equal(legend.value, 'b');
  } finally { dom.window.close(); }
});

const branch = (id: string) => `<li><label><input id="${id}" class="category-checkbox" type="checkbox" checked>${id}</label></li>`;
function treeFixture() {
  const dom = useDom(`<div id="add-products-to-category-content"><ul id="tree">${branch('root')}<ul>${branch('parent')}<ul>${branch('middle')}<ul>${branch('leaf')}${branch('sibling')}</ul></ul></ul></ul></div>`);
  document.querySelector('#root')!.parentElement!.lastChild!.textContent = 'Default Category';
  enhanceCategoryTrees();
  const box = (id: string) => document.getElementById(id) as HTMLInputElement;
  const uncheck = (id: string) => {
    box(id).checked = false;
    box(id).dispatchEvent(new Event('change', { bubbles: true }));
  };
  return { dom, box, uncheck };
}

test('last checked descendant clears multiple ancestors but preserves the enabled root', () => {
  const { dom, box, uncheck } = treeFixture();
  try {
    uncheck('sibling');
    assert.equal(box('middle').checked, true);
    uncheck('leaf');
    for (const id of ['leaf', 'sibling', 'middle', 'parent']) assert.equal(box(id).checked, false, id);
    assert.equal(box('root').checked, true);
    assert.equal(box('root').disabled, false);
  } finally { dom.window.close(); }
});

test('checked sibling keeps ancestors, parent removal clears descendants and root events do not cascade', () => {
  const { dom, box, uncheck } = treeFixture();
  try {
    uncheck('leaf');
    assert.equal(box('middle').checked, true);
    assert.equal(box('parent').checked, true);
    uncheck('root');
    assert.equal(box('root').checked, true);
    assert.equal(box('sibling').checked, true);
    uncheck('parent');
    for (const id of ['parent', 'middle', 'leaf', 'sibling']) assert.equal(box(id).checked, false, id);
    box('root').disabled = true;
    enhanceCategoryTrees();
    assert.equal(box('root').checked, true);
    assert.equal(box('root').disabled, false);
  } finally { dom.window.close(); }
});
