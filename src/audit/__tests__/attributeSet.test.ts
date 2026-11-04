/**
 * The Attribute Set value has to come from the product's own field, never from
 * the "change attribute set" dialog that lists every set in the store.
 *
 * The live admin shows it as static header text (`Attribute Set ARTIGOS SEM
 * PERSONALIZAÇÃO`), next to a hidden dialog whose select is named
 * `attribute-set-name` and starts on `Default`. Reading the dialog produced a
 * value that exists on the page but describes no product.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
// jsdom ships no types and is only used by these DOM tests.
// @ts-expect-error - untyped transitive dependency
import { JSDOM } from 'jsdom';

function useDom(html: string): void {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = dom.window;
  globals.document = dom.window.document;
  globals.CSS = dom.window.CSS;
  globals.Element = dom.window.Element;
  globals.HTMLElement = dom.window.HTMLElement;
  globals.HTMLInputElement = dom.window.HTMLInputElement;
  globals.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  globals.HTMLSelectElement = dom.window.HTMLSelectElement;
  globals.HTMLOptionElement = dom.window.HTMLOptionElement;
}

const reader = () => import('../../page/features/grid-search/productFacts');

/** The dialog every newer build ships: a select of every set, sitting on Default. */
const SET_DIALOG = `
  <div class="no-display affected-attribute-set" data-role="affected-attribute-set-selector">
    <div class="field field-choose-affected-attribute-set">
      <label class="admin__field-label" for="choose-affected-attribute-set">Choose existing Attribute Set</label>
      <select id="choose-affected-attribute-set" name="attribute-set-name">
        <option value="4" selected>Default</option>
        <option value="97">AS>PP0049_TÊXTIL ADULTO Manga Curta</option>
      </select>
    </div>
  </div>
`;

test('reads the header value of the newer product form', async () => {
  useDom(`
    <div class="product-header">
      <div class="product-header-item">
        <span class="label">Attribute Set</span>
        <span class="value">AS>PP0049_TÊXTIL ADULTO Manga Curta - T-shirts/Polos</span>
      </div>
      <div class="product-header-item">
        <span class="label">Product Name</span>
        <span class="value">Tshirt Toogas</span>
      </div>
    </div>
    ${SET_DIALOG}
  `);
  const { readAttributeSetProfile } = await reader();
  const profile = readAttributeSetProfile();
  assert.equal(profile.name, 'AS>PP0049_TÊXTIL ADULTO Manga Curta - T-shirts/Polos');
  assert.equal(profile.ppCode, '0049');
});

test('never takes the value from the change-attribute-set dialog', async () => {
  useDom(`
    <div class="product-header">
      <div class="product-header-item">
        <span class="label">Attribute Set</span>
        <span class="value">ARTIGOS SEM PERSONALIZAÇÃO</span>
      </div>
    </div>
    ${SET_DIALOG}
  `);
  const { readAttributeSetName, ppCodeFromAttributeSet } = await reader();
  const name = readAttributeSetName();
  assert.equal(name, 'ARTIGOS SEM PERSONALIZAÇÃO');
  assert.notEqual(name, 'Default');
  // No PP in this set: an empty code, never a guessed one.
  assert.equal(ppCodeFromAttributeSet(name), '');
});

test('a dialog with no product field yields no value at all', async () => {
  useDom(SET_DIALOG);
  const { readAttributeSetName } = await reader();
  assert.equal(readAttributeSetName(), '');
});

test('still reads the classic dropdown', async () => {
  useDom(`
    <select name="product[attribute_set_id]">
      <option value="4">Default</option>
      <option value="957" selected>AS>PP0957_CONJ ESCRITA 2 Peças</option>
    </select>
  `);
  const { readAttributeSetProfile } = await reader();
  const profile = readAttributeSetProfile();
  assert.equal(profile.name, 'AS>PP0957_CONJ ESCRITA 2 Peças');
  assert.equal(profile.id, '957');
  assert.equal(profile.ppCode, '0957');
});
