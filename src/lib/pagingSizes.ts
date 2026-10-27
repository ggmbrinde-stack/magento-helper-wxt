// Replace the grid's "per page" size widget with a segmented control plus a
// type-a-number box.
//
// This is not a <select>, which is why a selector tuned for selects never
// matched it. Magento renders `Magento_Ui/templates/grid/paging/sizes.html`:
//
//   <div class="selectmenu">
//     <div class="selectmenu-value"><input type="text" ko-value="_value"></div>
//     <button class="selectmenu-toggle">Select</button>
//     <div class="selectmenu-items"><ul>
//       <li><div class="selectmenu-item">
//         <button class="selectmenu-item-action">30</button>
//         <button class="action-edit">Edit</button>
//       </div></li>
//       ...
//       <li><button class="selectmenu-item-action">Custom</button>
//           <div class="selectmenu-item-edit">
//             <input ko-value="customValue"><button class="action-save">Save</button>
//           </div></li>
//     </ul></div>
//   </div>
//
// That is the "500 Select per page" text an operator sees.
//
// What this module does:
// - Numeric sizes become a segmented control (.mhx-seg), one click each.
// - A number box accepts any size the grid allows, committed with Enter. It
//   uses Magento's own custom-size path (show it, write the bound input, press
//   its Save button), so `applyCustom` → `addSize` → `setSize` runs and the
//   store's own min/max still applies.
// - Magento's white panel stays in the document but is stripped visually, so
//   no pale frame is left around the control in a dark admin.
//
// This module still needs its own small style for two reasons:
// 1. The .selectmenu reset is pager-specific and is intentionally !important
//    because Magento paints .selectmenu as a white panel and we are hiding it.
// 2. The pager wraps the segmented control + the custom-size box into a single
//    inline flow; the wrapped layout is pager-owned, not a generic primitive.
//
// The segmented control itself now uses the toolkit primitive directly, so the
// pager is no longer maintaining its own button + segmented vocabulary.
//
// Nothing is saved and no request is made by this code; Magento's own widget
// does the work. Idempotent, so the debounced re-scan and Knockout re-renders
// cannot stack two controls.

import { segmented } from '../ui';

const MARK_ATTR = 'data-mhx-paging-sizes';
const WIDGET_CLASS = 'mhx-size-widget';
const STYLE_ID = 'mhx-paging-sizes-styles';

interface SizeChoice {
  label: string;
  button: HTMLButtonElement;
}

/** The size the widget is currently showing, e.g. "500". */
function currentValue(root: HTMLElement): string {
  const input = root.querySelector<HTMLInputElement>('.selectmenu-value input');
  return (input?.value ?? '').trim();
}

/** Numeric choices; "Custom" is driven by our own box instead of a segment. */
function readSizes(root: HTMLElement): SizeChoice[] {
  const out: SizeChoice[] = [];
  root.querySelectorAll<HTMLElement>('.selectmenu-items li').forEach((li) => {
    const button = li.querySelector<HTMLButtonElement>('.selectmenu-item-action');
    if (!button) return;
    const label = (button.textContent ?? '').trim();
    if (!/^\d+$/.test(label)) return;
    out.push({ label, button });
  });
  return out;
}

/** The list item holding Magento's "Custom" entry, with its input and Save. */
function findCustomItem(root: HTMLElement): HTMLElement | null {
  for (const li of Array.from(
    root.querySelectorAll<HTMLElement>('.selectmenu-items li'),
  )) {
    const button = li.querySelector('.selectmenu-item-action');
    if (!button) continue;
    if (!/^\d+$/.test((button.textContent ?? '').trim())) return li;
  }
  return null;
}

/**
 * Commit an arbitrary page size through Magento's own custom-size flow.
 * Its `normalize()` clamps to the store's configured min/max, which is the
 * behaviour we want — we must not invent a limit of our own.
 */
export function applyCustomSize(root: HTMLElement, raw: string): boolean {
  const value = raw.trim();
  if (!/^\d+$/.test(value) || Number(value) < 1) return false;

  const li = findCustomItem(root);
  if (!li) return false;
  const opener = li.querySelector<HTMLButtonElement>('.selectmenu-item-action');
  const input = li.querySelector<HTMLInputElement>('.selectmenu-item-edit input');
  const save = li.querySelector<HTMLButtonElement>('.selectmenu-item-edit .action-save');
  if (!input || !save) return false;

  opener?.click(); // showCustom()
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  save.click(); // applyCustom()
  return true;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAGING_STYLES;
  (document.head ?? document.documentElement).appendChild(style);
}

function hide(el: Element | null): void {
  if (!(el instanceof HTMLElement)) return;
  el.style.setProperty('display', 'none', 'important');
}

/** Mark the segment matching the widget's current value. */
function syncActive(root: HTMLElement, row: HTMLElement): void {
  const value = currentValue(root);
  row.querySelectorAll<HTMLButtonElement>('.mhx-seg-btn').forEach((btn) => {
    const on = btn.dataset['value'] === value;
    btn.classList.toggle('mhx-seg-btn--active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

/** Mirror the current size into the number box unless it is being typed in. */
function syncInput(root: HTMLElement, input?: HTMLInputElement): void {
  if (!input) return;
  if (document.activeElement === input) return;
  const value = currentValue(root);
  if (value) input.value = value;
}

/**
 * Build the page-size control from the toolkit primitive.
 *
 * Numeric sizes are one-of-N choices, so they are now a `.mhx-seg` with
 * `.mhx-seg-btn` buttons. The active state mirrors the widget's current value
 * (not the toolkit factory's initial `active`), because Magento can change the
 * size from elsewhere and we must follow it.
 *
 * Custom sizes are intentionally left out of the segmented control: they are
 * handled by our own number box through Magento's custom-size path, so a
 * committed custom value becomes a real segment on the next scan.
 */
function buildSegments(
  root: HTMLElement,
  row: HTMLElement,
  choices: SizeChoice[],
): void {
  row.replaceChildren();
  const seg = segmented({
    label: 'Results per page',
    options: choices.map((c) => ({ label: c.label, value: c.label })),
    active: currentValue(root),
    onPick: (value) => {
      // The segment is a UI preview. The real commit still runs through
      // Magento's own button so its setSize / Knockout handling runs.
      const choice = choices.find((c) => c.label === value);
      choice?.button.click();
      syncInput(
        root,
        row
          .closest<HTMLElement>(`.${WIDGET_CLASS}`)
          ?.querySelector<HTMLInputElement>('.mhx-size-input') ?? undefined,
      );
    },
  });
  row.appendChild(seg);
  row.dataset['sizes'] = choices.map((c) => c.label).join(',');
}

function buildBar(root: HTMLElement): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'mhx-size-bar';

  const row = document.createElement('div');
  row.className = 'mhx-size-row';
  bar.appendChild(row);

  const field = document.createElement('span');
  field.className = 'mhx-inline-field mhx-size-input-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.className = 'mhx-size-input';
  input.setAttribute('aria-label', 'Set a page size');
  input.title = 'Type a page size and press Enter';
  input.size = 4;
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (applyCustomSize(root, input.value)) syncActive(root, row);
  });
  input.addEventListener('blur', () => syncInput(root, input));
  field.appendChild(input);
  bar.appendChild(field);

  return bar;
}

/** Convert one widget. Returns true when it was newly enhanced. */
export function enhancePagingSize(root: HTMLElement): boolean {
  if (root.getAttribute(MARK_ATTR) === '1') {
    const row = root.querySelector<HTMLElement>('.mhx-size-row');
    const input = root.querySelector<HTMLInputElement>('.mhx-size-input');
    // A partial re-render can drop our bar while leaving the widget element
    // (and therefore the marker) in place. Rebuild rather than leave an empty
    // control that every later scan would skip.
    if (row && input) {
      // Magento may add a size (a committed custom value becomes a real
      // choice) or change the current size silently. Re-read both on every
      // scan; only rebuild the buttons when the list actually changed, so
      // typing survives.
      const choices = readSizes(root);
      if (row.dataset['sizes'] !== choices.map((c) => c.label).join(',')) {
        buildSegments(root, row, choices);
      }
      syncActive(root, row);
      syncInput(root, input);
      return false;
    }
    root.removeAttribute(MARK_ATTR);
    root.classList.remove(WIDGET_CLASS);
  }

  const choices = readSizes(root);
  if (choices.length < 2) return false;

  injectStyles();

  const bar = buildBar(root);
  root.insertBefore(bar, root.firstChild);
  buildSegments(root, root.querySelector<HTMLElement>('.mhx-size-row')!, choices);

  // Hide Magento's own value box, toggle and menu. The nodes stay so their
  // Knockout handlers keep working; only the presentation is removed.
  hide(root.querySelector('.selectmenu-value'));
  hide(root.querySelector('.selectmenu-toggle'));
  hide(root.querySelector('.selectmenu-items'));
  root.classList.add(WIDGET_CLASS);
  root.setAttribute(MARK_ATTR, '1');

  const row = bar.querySelector<HTMLElement>('.mhx-size-row')!;
  const input = bar.querySelector<HTMLInputElement>('.mhx-size-input')!;
  syncActive(root, row);
  syncInput(root, input);

  // Knockout can change the size from elsewhere (pager, filters). Mirror it.
  const native = root.querySelector<HTMLInputElement>('.selectmenu-value input');
  if (native) {
    const resync = (): void => {
      syncActive(root, row);
      syncInput(root, input);
    };
    native.addEventListener('change', resync);
    native.addEventListener('input', resync);
  }
  return true;
}

/**
 * Find every paging-size widget on the page. Idempotent, so the debounced scan
 * can run it after each AJAX grid reload.
 */
export function enhancePagingSizes(): number {
  let count = 0;
  document
    .querySelectorAll<HTMLElement>('.admin__data-grid-pager-wrap .selectmenu, .selectmenu')
    .forEach((root) => {
      // The pager wrapper is the reliable scope; outside it, require the
      // numeric-size shape so unrelated selectmenus are not touched.
      const inPager = Boolean(root.closest('.admin__data-grid-pager-wrap'));
      if (!inPager && readSizes(root).length < 2) return;
      if (enhancePagingSize(root)) count += 1;
    });
  return count;
}

// Page-size control styles.
//
// Two reasons this stays a pager-owned sheet rather than moving wholesale into
// the toolkit:
// 1. The .selectmenu reset is pager-specific and is intentionally !important
//    because Magento paints .selectmenu as a white panel and this module hides
//    it. That reset is not a generic primitive — it is the pager's own
//    presentation cleanup for a Magento widget it does not replace.
// 2. The wrapped layout is pager-owned: the segmented control and the custom
//    size box are arranged as one inline toolbar, and that arrangement is not
//    a shared primitive.
//
// What changed: the segmented control itself now uses the toolkit primitive
// (.mhx-seg + .mhx-seg-btn), so the pager is no longer maintaining its own
// segmented-button vocabulary. The custom-size input is still pager-owned
// because it is a narrow typed box wired to Magento's custom-size flow, not a
// generic inline field.

const PAGING_STYLES = `
/* Magento paints .selectmenu as a white panel. Strip it so no pale frame is
   left around the control, and keep the box in the toolbar's flow. */
.selectmenu.mhx-size-widget{background:transparent !important;border:0 !important;padding:0 !important;margin:0 !important;box-shadow:none !important;min-width:0 !important;min-height:0 !important;display:inline-flex !important;align-items:center !important;vertical-align:middle;}
.selectmenu.mhx-size-widget:before,.selectmenu.mhx-size-widget:after{content:none !important;display:none !important;border:0 !important;}
.mhx-size-bar{display:inline-flex;align-items:stretch;gap:6px;}
.mhx-size-row{display:inline-flex;align-items:center;gap:6px;}
.mhx-size-input-wrap input{width:64px;text-align:center;}
`;
