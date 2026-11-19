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

function useDom(
  html: string,
  url = 'https://bestofgifts.pt/admin_L2pZx/catalog/product/edit/id/1/',
): void {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
  });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = dom.window;
  globals.document = dom.window.document;
  globals.location = dom.window.location;
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

test('skips concatenated attribute set list with multiple AS>PP patterns', async () => {
  // This is what the UI shows when there's a bug: a concatenated list of all sets
  // instead of the single product's attribute set
  useDom(`
    <div class="product-header">
      <div class="product-header-item">
        <span>Attribute Set</span>
        <span class="value">Attribute Set Default ALLBEST ALMOFADAS SIMPLES AS>PP0049_TÊXTIL ADULTO Manga Curta AS>PP0050_OUTRO_SET</span>
      </div>
    </div>
  `);
  const { readAttributeSetName } = await reader();
  // Should return empty string, skipping the concatenated list
  assert.equal(readAttributeSetName(), '');
});

test('reads correct attribute set with AS>PP in non-header location', async () => {
  // Simulate a case where the attribute set value appears in a different selector pattern
  useDom(`
    <div class="product-header">
      <div class="product-header-item">
        <span class="label">Attribute Set</span>
        <span class="value">AS>PP0253_GARRAFAS/COPOS Metal/Vidro até 250/300ML</span>
      </div>
    </div>
  `);
  const { readAttributeSetProfile } = await reader();
  const profile = readAttributeSetProfile();
  assert.equal(profile.ppCode, '0253');
  assert.equal(profile.name, 'AS>PP0253_GARRAFAS/COPOS Metal/Vidro até 250/300ML');
});

test('ignores an "All Options" placeholder and reads the field beside the label', async () => {
  // The live form shows the set as text, while a picker in a modal lists every
  // set and can sit on a placeholder. The placeholder describes no product.
  useDom(`
    <div class="admin__field field-attribute_set" data-index="attribute_set_id">
      <div class="admin__field-label"><span>Attribute Set</span></div>
      <div class="admin__field-control">
        <span class="admin__field-value">AS>PP0471_BRINDES Transf. Ser. (2C.57m2.2F) + DTF (A7-2F)</span>
        <button type="button">Change</button>
      </div>
    </div>
    <div class="admin__modal" data-role="modal">
      <div class="admin__field">
        <label>Attribute Set</label>
        <select name="attribute-set-name">
          <option selected>All Options</option>
          <option>AS>PP0000_Seleção</option>
        </select>
      </div>
    </div>
  `);
  const { readAttributeSetProfile } = await reader();
  const profile = readAttributeSetProfile();
  assert.equal(
    profile.name,
    'AS>PP0471_BRINDES Transf. Ser. (2C.57m2.2F) + DTF (A7-2F)',
  );
  assert.equal(profile.ppCode, '0471');
});

test('a picker showing only a placeholder yields no value', async () => {
  useDom(`
    <div class="admin__field">
      <div class="admin__field-label"><span>Attribute Set</span></div>
      <div class="admin__field-control">
        <select name="attribute-set-name">
          <option selected>All Options</option>
          <option>AS>PP0471_BRINDES</option>
        </select>
      </div>
    </div>
  `);
  const { readAttributeSetName } = await reader();
  assert.equal(readAttributeSetName(), '');
});

test('does not read facts on a product grid page', async () => {
  // The grid has its own "Attribute Set" text and placeholder pickers; a read
  // there used to be cached as the product's facts.
  useDom(
    `
    <div class="admin__data-grid-wrap">
      <div class="admin__field"><span>Attribute Set</span><span>All Options</span></div>
    </div>
  `,
    'https://bestofgifts.pt/admin_L2pZx/catalog/product/index/',
  );
  const { readProductFacts } = await reader();
  assert.equal(await readProductFacts(), null);
});

test('still reads facts on the product edit page', async () => {
  useDom(
    `
    <form id="product_form">
      <input name="product[price]" value="9.99">
      <div class="admin__field" data-index="attribute_set_id">
        <div class="admin__field-label"><span>Attribute Set</span></div>
        <div class="admin__field-control">
          <span class="admin__field-value">AS>PP0471_BRINDES Transf. Ser. (2C.57m2.2F) + DTF (A7-2F)</span>
        </div>
      </div>
    </form>
  `,
    'https://bestofgifts.pt/admin_L2pZx/catalog/product/edit/id/363665/',
  );
  const { readProductFacts } = await reader();
  const facts = await readProductFacts();
  assert.equal(
    facts?.attributeSet,
    'AS>PP0471_BRINDES Transf. Ser. (2C.57m2.2F) + DTF (A7-2F)',
  );
  assert.equal(facts?.ppCode, '0471');
});
