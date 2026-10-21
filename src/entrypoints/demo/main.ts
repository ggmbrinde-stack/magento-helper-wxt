// Dropdown feasibility harness.
//
// Purpose: prove, on a page that imitates Magento 2 admin markup, that the
// extension can replace a native <select> with a better control while the
// native element keeps the real value and Magento's re-renders do not break it.
//
// Everything here is local scaffolding: no Magento install, no host access.
// The reusable part under test is `src/lib/enhanceSelect.ts`, which the content
// script can call on real admin pages.

import { enhanceSelect, isEnhanced } from '../../lib/enhanceSelect';
import './demo.css';

const STORE_VIEWS: Array<[string, string]> = [
  ['0', 'All Store Views'],
  ['1', 'BestOfGifts EN'],
  ['2', 'BestOfGifts PT'],
  ['3', 'BestOfGifts ES'],
  ['4', 'BestOfGifts FR'],
  ['5', 'BestOfGifts DE'],
  ['6', 'BestOfGifts IT'],
  ['7', 'QA Sandbox'],
  ['8', 'B2B Wholesale EN'],
  ['9', 'Marketplace Partners'],
  ['10', 'Newsletter Segment'],
  ['11', 'Staff Preview'],
];

const COLOURS: Array<[string, string]> = [
  ['black', 'Black'],
  ['white', 'White'],
  ['navy', 'Navy Blue'],
  ['royal', 'Royal Blue'],
  ['sky', 'Sky Blue'],
  ['teal', 'Teal'],
  ['mint', 'Mint Green'],
  ['forest', 'Forest Green'],
  ['olive', 'Olive'],
  ['lime', 'Lime'],
  ['mustard', 'Mustard'],
  ['amber', 'Amber'],
  ['orange', 'Orange'],
  ['coral', 'Coral'],
  ['red', 'Red'],
  ['crimson', 'Crimson'],
  ['burgundy', 'Burgundy'],
  ['plum', 'Plum'],
  ['purple', 'Purple'],
  ['lavender', 'Lavender'],
  ['mauve', 'Mauve'],
  ['pink', 'Pink'],
  ['blush', 'Blush'],
  ['champagne', 'Champagne'],
  ['beige', 'Beige'],
  ['taupe', 'Taupe'],
  ['charcoal', 'Charcoal'],
  ['silver', 'Silver'],
];

const ATTRIBUTE_SETS: Array<[string, string]> = [
  ['4', 'Default'],
  ['9', 'Apparel'],
  ['10', 'Footwear'],
  ['11', 'Bags'],
  ['12', 'Accessories'],
  ['15', 'Jewellery'],
  ['18', 'Home & Living'],
  ['22', 'Gift Sets'],
];

function optionsMarkup(list: Array<[string, string]>): string {
  return list
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}

const app = document.getElementById('app');
if (!app) throw new Error('demo harness: #app host is missing');

app.innerHTML = `
  <header class="admin__header">
    <strong>BOG Helper — dropdown feasibility harness</strong>
    <span><span class="store-switcher-label">Store View:</span></span>
    <div class="store-switcher">
      <select id="store-select" name="store_switcher" title="Store View">${optionsMarkup(STORE_VIEWS)}</select>
    </div>
  </header>

  <main>
    <h1>Can the extension upgrade a Magento admin dropdown?</h1>
    <p class="lede">
      Magento-shaped markup, enhanced entirely from the client. The native
      <code>&lt;select&gt;</code> stays in the page and keeps the real value.
    </p>

    <section class="panel">
      <h2>Side by side — same markup, one untouched</h2>
      <div class="cols">
        <div class="admin__field">
          <label class="admin__field-label" for="attr-raw">
            Attribute Set <span class="tag tag--before">Magento default</span>
          </label>
          <div class="admin__field-control">
            <select id="attr-raw" name="product[attribute_set_id]" class="admin__control-select raw">${optionsMarkup(ATTRIBUTE_SETS)}</select>
          </div>
        </div>
        <div class="admin__field">
          <label class="admin__field-label" for="attr-enhanced">
            Attribute Set <span class="tag tag--after">Enhanced</span>
          </label>
          <div class="admin__field-control">
            <select id="attr-enhanced" name="product[attribute_set_id]" class="admin__control-select">${optionsMarkup(ATTRIBUTE_SETS)}</select>
          </div>
        </div>
      </div>
      <p class="hint">Both hold the same eight values. Only one is searchable.</p>
    </section>

    <section class="panel">
      <h2>Product form fields, on the same page as the header switcher</h2>
      <div class="cols">
        <div class="admin__field">
          <label class="admin__field-label" for="colour-select">Color</label>
          <div class="admin__field-control" id="colour-field">
            <select id="colour-select" name="product[color]" class="admin__control-select">${optionsMarkup(COLOURS)}</select>
          </div>
        </div>
        <div class="admin__field">
          <label class="admin__field-label" for="status-select">Status</label>
          <div class="admin__field-control">
            <select id="status-select" name="product[status]" class="admin__control-select">
              <option value="1">Enabled</option>
              <option value="2">Disabled</option>
            </select>
          </div>
        </div>
      </div>
      <p class="hint">
        Twenty-eight colours is where a plain dropdown stops being usable. A two-option
        field is left as-is on purpose — enhancement should be opt-in per field.
      </p>
    </section>

    <section class="panel">
      <h2>Proof panel</h2>
      <div class="status-line" id="status">Building…</div>
      <div class="controls">
        <button type="button" id="btn-magento-set">Set value from the Magento side</button>
        <button type="button" id="btn-knockout-options" class="secondary">Simulate Knockout rebuilding the option list</button>
        <button type="button" id="btn-rerender-field" class="secondary">Simulate Knockout re-rendering the whole field</button>
        <button type="button" id="btn-read" class="secondary">Read native values</button>
        <button type="button" id="btn-reset" class="secondary">Reset</button>
      </div>
      <ul class="log" id="log"></ul>
      <p class="hint">
        Green lines are <code>input</code>/<code>change</code> events received by the
        native selects — that is what Magento's components listen to. Amber lines are
        the harness reporting something unexpected.
      </p>
    </section>
  </main>
`;

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');

function log(message: string, kind: 'plain' | 'event' | 'warn' = 'plain'): void {
  if (!logEl) return;
  const item = document.createElement('li');
  if (kind === 'event') item.className = 'is-event';
  if (kind === 'warn') item.className = 'is-warn';
  item.textContent = message;
  logEl.appendChild(item);
  logEl.scrollTop = logEl.scrollHeight;
}

function selectById(id: string): HTMLSelectElement {
  const el = document.querySelector<HTMLSelectElement>(`#${id}`);
  if (!el) throw new Error(`demo harness: #${id} is missing`);
  return el;
}

const storeSelect = selectById('store-select');
const colourSelect = selectById('colour-select');
const attrEnhanced = selectById('attr-enhanced');
const statusSelect = selectById('status-select');

/** The label our control is showing, or null when the select is not enhanced. */
function controlLabel(select: HTMLSelectElement): string | null {
  const wrapper = select.closest('.mhx-nh');
  const label = wrapper?.querySelector('.mhx-nh-label');
  return label?.textContent?.trim() ?? null;
}

function nativeLabel(select: HTMLSelectElement): string {
  return select.selectedOptions[0]?.textContent?.trim() ?? '(nothing selected)';
}

/** Assert the visible control agrees with the native select Magento will save. */
function checkSync(select: HTMLSelectElement, name: string): boolean {
  const label = controlLabel(select);
  if (label === null) {
    log(`${name}: not enhanced (left as Magento rendered it)`);
    return true;
  }
  const native = nativeLabel(select);
  const ok = label === native;
  log(
    `${name}: native="${native}" · control="${label}" · ${ok ? 'IN SYNC' : 'OUT OF SYNC'}`,
    ok ? 'event' : 'warn',
  );
  return ok;
}

function refreshStatus(): void {
  if (!statusEl) return;
  const changed = storeSelect.dataset['mhxChanges'] ?? '0';
  statusEl.innerHTML =
    `store_switcher=<b>${storeSelect.value}</b> (${nativeLabel(storeSelect)})` +
    ` · product[color]=<b>${colourSelect.value}</b>` +
    ` · change events seen: <b>${changed}</b>`;
}

// Prove the native selects still receive the events Magento listens for.
for (const evt of ['input', 'change'] as const) {
  document.addEventListener(
    evt,
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const seen = Number(target.dataset['mhxChanges'] ?? '0') + 1;
      target.dataset['mhxChanges'] = String(seen);
      log(`${evt} → ${target.name || target.id} = "${target.value}"`, 'event');
      refreshStatus();
    },
    true,
  );
}

// --- Enhance the fields that are worth enhancing -----------------------------
enhanceSelect(storeSelect, {
  searchPlaceholder: 'Search store views…',
  label: 'Store View',
});
enhanceSelect(attrEnhanced, { searchPlaceholder: 'Search attribute sets…' });
const colourEnhancer = enhanceSelect(colourSelect, {
  searchPlaceholder: 'Search 28 colours…',
});
// Status has two options and is deliberately left alone.
if (isEnhanced(statusSelect)) {
  log('Status field was enhanced, but it should have been left alone.', 'warn');
}

log(`Enhanced: store switcher, colour, and the "after" attribute set.`);
log(`Left alone: Status (2 options) and the "before" attribute set.`);
checkSync(storeSelect, 'store switcher');
checkSync(colourSelect, 'color');
refreshStatus();

// --- Proof actions ----------------------------------------------------------
document.getElementById('btn-read')?.addEventListener('click', () => {
  log('--- native state ---');
  for (const [select, name] of [
    [storeSelect, 'store_switcher'],
    [colourSelect, 'product[color]'],
    [attrEnhanced, 'product[attribute_set_id]'],
    [statusSelect, 'product[status]'],
  ] as Array<[HTMLSelectElement, string]>) {
    log(
      `${name}: value="${select.value}" · optionCount=${select.options.length}` +
        ` · still in DOM=${select.isConnected}` +
        ` · enhanced=${isEnhanced(select)}`,
    );
  }
  checkSync(storeSelect, 'store switcher');
  checkSync(colourSelect, 'color');
});

document.getElementById('btn-magento-set')?.addEventListener('click', () => {
  const next = storeSelect.value === '3' ? '5' : '3';
  // Exactly what a Magento component does: write the value, announce it.
  storeSelect.value = next;
  storeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  log(`Magento side set store_switcher to "${next}" and fired change.`);
  checkSync(storeSelect, 'store switcher');
  refreshStatus();
});

document.getElementById('btn-knockout-options')?.addEventListener('click', () => {
  // Knockout rebuilding the <option> list. No change event is fired, which is
  // exactly the case that would leave a naive replacement control stale.
  const extra: Array<[string, string]> = [['12', 'BestOfGifts NL']];
  storeSelect.textContent = '';
  for (const [value, label] of [...STORE_VIEWS, ...extra]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    storeSelect.appendChild(option);
  }
  storeSelect.value = '12';
  log('Rebuilt the option list and selected "BestOfGifts NL" (no change event).');
  setTimeout(() => {
    checkSync(storeSelect, 'store switcher');
    refreshStatus();
  }, 0);
});

document.getElementById('btn-rerender-field')?.addEventListener('click', () => {
  const field = document.getElementById('colour-field');
  if (!field) return;
  const preserved = colourSelect.value;

  // The harsher case: Knockout replaces the whole field, taking our wrapper with
  // it. The old enhancer is left pointing at a detached select.
  const fresh = document.createElement('select');
  fresh.id = 'colour-select';
  fresh.name = 'product[color]';
  fresh.className = 'admin__control-select';
  for (const [value, label] of COLOURS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    fresh.appendChild(option);
  }
  fresh.value = preserved;
  field.textContent = '';
  field.appendChild(fresh);

  log(`Knockout replaced the colour field; preserved value="${preserved}".`);
  if (colourEnhancer?.isStale()) {
    log('Old enhancer reported isStale() — as expected, its select is detached.', 'event');
  }
  const re = enhanceSelect(fresh, { searchPlaceholder: 'Search 28 colours…' });
  log(re ? 'Re-enhanced the fresh select (idempotent scan would do this).' : 'Re-enhance was skipped.', re ? 'plain' : 'warn');
  checkSync(fresh, 'color (fresh)');
  refreshStatus();
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  location.reload();
});
