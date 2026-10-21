// Pencil-to-edit on the product grid's "Active filters" chips.
//
// Why: changing one applied filter (Status, Parent SKU, Manufacturer, …)
// currently means opening the filter menu, finding that field among every
// filter, changing it and pressing Apply — for a value the strip already
// shows on screen. A pencil on the chip turns that trip into: click, type,
// Enter. For selects the single pick applies immediately, so the filter menu
// is never opened at all.
//
// How it stays safe:
// - Forwards to Magento's own controls. The editor only writes into the
//   native filter field that already holds this value (native setter +
//   input/change events, so Knockout bindings see it) and then clicks the
//   panel's own Apply button — falling back to submitting that field's form,
//   or dispatching Enter on the field (Magento's own binding). That request
//   is the exact re-query "Apply filters" already sends: a grid search, never
//   a data write, and no different from the operator doing it by hand.
// - A pencil appears only when the chip's filter resolves to exactly ONE
//   editable field (matched by label text, or by form-parameter slug as a
//   fallback) — ambiguous shapes (date ranges spanning two fields, labels we
//   cannot resolve, non-editable control types) are left as Magento rendered
//   them.
// - Nothing applies without confirmation: text edits need Enter or ✓ (Esc,
//   ✕ or blur cancel); a select applies on its own change, which is the one
//   gesture the operator already expects from a menu pick.
// - Idempotent: each chip is marked once, so the content script's debounced
//   re-scan and Magento's AJAX grid reloads cannot stack pencils or editors.

const ITEM_MARK = 'data-mhx-chip-edit';
const EDITING_MARK = 'data-mhx-chip-editing';
const STYLE_ID = 'mhx-chip-edit-styles';
const PENCIL_CLASS = 'mhx-chip-edit';
const EDITING_CLASS = 'mhx-chip-editing';
const INPUT_CLASS = 'mhx-chip-input';
const SELECT_CLASS = 'mhx-chip-select';
const OK_CLASS = 'mhx-chip-ok';
const X_CLASS = 'mhx-chip-x';

const REMOVE_SEL =
  '.action-remove, [data-role="remove-filter"], .admin__filter-remove, a[title*="remove" i]';

/** Grid filter field types we can safely round-trip through a text editor. */
const TEXTISH = new Set(['', 'text', 'search', 'number', 'email', 'url', 'tel']);

/** Regions a grid filter field or its Apply button can live in. */
const FILTER_REGION =
  '[data-role="filter-form"], .admin__data-grid-filters, .admin__data-grid-filter-row, .admin__fieldset, .admin__data-grid-toolbar, form';

interface Chip {
  label: string;
  value: string;
  /** Element carrying the value text, when the markup splits it out. */
  valueEl: HTMLElement | null;
  removeEl: HTMLElement | null;
}

type Field = HTMLInputElement | HTMLSelectElement;
/** One pass may claim a field for only one chip, so two chips never share it. */
type Claimed = Set<Field>;

/* --- text helpers --------------------------------------------------------- */

/** Case/accent/space-folded comparison text (chips and labels say the same
 *  thing in the operator's locale: "Parent SKU" vs "Parent sku"). */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[:：]+$/, '')
    .trim()
    .toLowerCase();
}

/** Slug for parameter matching: "Parent SKU" -> "parent_sku". */
function slug(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** `filters[parent_sku]` -> `parent_sku`; flat names pass through slugged.
 *  Only the FIRST bracket group counts, so a date range's `…[from]`/`…[to]`
 *  fields collapse to one root and stay ambiguous (→ no pencil). */
function paramRoot(name: string): string {
  const match = /\[([^\]]+)\]/.exec(name);
  return match?.[1] ? slug(match[1]) : slug(name);
}

/* --- strip discovery ------------------------------------------------------ */

function findStrips(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const push = (el: HTMLElement | null | undefined): void => {
    if (!el || !el.isConnected || out.includes(el)) return;
    out.push(el);
  };

  document
    .querySelectorAll<HTMLElement>(
      '.filter-current, [data-role="filter-current"], .admin__data-grid-filter-current, .admin__data-grid-filters-current, .admin__current-filters, .admin__current-filters-list, .admin__current-filters-list-wrap, [data-role="filter-list"], .admin__data-grid-active-filters',
    )
    .forEach(push);

  // Text fallback: the strip's own heading ("Active filters:") when Magento
  // ships it under a class we do not know. Only leaf elements, so the strip
  // itself can never match. Magento 2.4 renders the heading as a SPAN
  // (.admin__current-filters-title), not strong/b — so match those too, then
  // climb to the whole strip (not just the title wrapper, which holds no
  // chips).
  document.querySelectorAll<HTMLElement>('strong, b, span, div').forEach((el) => {
    if (el.children.length > 0) return;
    if (/^active\s+filters?\s*:?\s*$/i.test(el.textContent ?? '')) {
      push(
        el.closest<HTMLElement>(
          '.admin__data-grid-filters-current, .admin__current-filters, .admin__current-filters-list-wrap, .admin__current-filters-list, .filter-current, [data-role="filter-current"]',
        ) ??
          el.parentElement?.parentElement ??
          el.parentElement,
      );
    }
  });

  return out;
}

function itemsOf(strip: HTMLElement): HTMLElement[] {
  const items = Array.from(strip.querySelectorAll<HTMLElement>('li, .item'));
  if (items.length > 0) return items;

  // Shape without list items: a chip is whatever wraps its remove control.
  const out: HTMLElement[] = [];
  strip.querySelectorAll<HTMLElement>(REMOVE_SEL).forEach((remove) => {
    const chip =
      remove.closest<HTMLElement>('li, .item, .filter-current-item, div, span') ??
      remove.parentElement;
    if (chip && strip.contains(chip) && !out.includes(chip)) out.push(chip);
  });
  return out;
}

/** Item text minus the remove control and our own injected bits. */
function textWithout(item: HTMLElement, removeEl: HTMLElement | null): string {
  let out = '';
  item.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (removeEl && el === removeEl) return;
    if (el.classList.contains(PENCIL_CLASS) || el.closest(`.${EDITING_CLASS}`)) {
      return;
    }
    out += el.textContent ?? '';
  });
  return out;
}

function parseChip(item: HTMLElement): Chip | null {
  const removeEl = item.querySelector<HTMLElement>(REMOVE_SEL);
  const inside = (el: HTMLElement | null): boolean =>
    !!el && !!removeEl && (el === removeEl || removeEl.contains(el));

  const pick = (selector: string): HTMLElement | null => {
    const found = item.querySelector<HTMLElement>(selector);
    return inside(found) ? null : found;
  };

  const labelEl = pick('.filter-label, [class*="filter-label"], [class*="-label"]');
  const valueEl = pick('.filter-value, [class*="filter-value"], [class*="-value"]');

  let label = '';
  let value = '';
  if (labelEl && valueEl && !labelEl.contains(valueEl) && !valueEl.contains(labelEl)) {
    label = labelEl.textContent ?? '';
    value = valueEl.textContent ?? '';
  }

  if (!fold(label) || !value.trim()) {
    // Text fallback: "Label: Value" in one blob. Split on the FIRST colon —
    // values may contain colons ("10:00"), labels normally may not.
    const raw = textWithout(item, removeEl)
      .replace(/\s+/g, ' ')
      .trim();
    const idx = raw.indexOf(':');
    if (idx <= 0) return null;
    label = raw.slice(0, idx);
    value = raw.slice(idx + 1);
  }

  label = label.replace(/[:：]+\s*$/, '').trim();
  value = value.replace(/^[:：]+\s*/, '').trim();
  if (!fold(label) || !value) return null;

  return { label, value, valueEl, removeEl };
}

/* --- field resolution ----------------------------------------------------- */

function editableFields(): Field[] {
  const out: Field[] = [];
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((el) => {
    if (el.classList.contains(INPUT_CLASS) || el.classList.contains(SELECT_CLASS)) return;
    if (el.closest(`.${EDITING_CLASS}`)) return;
    // Hidden/disabled look real on a KO grid: the filter panel keeps its
    // fields in the DOM while collapsed, so offsetParent would wrongly
    // discard them. Only `disabled`/`hidden`/hidden-type disqualify.
    if (el.disabled || el.hidden) return;
    if (el instanceof HTMLSelectElement) {
      if (el.options.length >= 1) out.push(el);
      return;
    }
    if (el.type.toLowerCase() === 'hidden') return;
    if (TEXTISH.has((el.type || 'text').toLowerCase())) out.push(el);
  });
  return out;
}

/** Every plausible label for a field: aria, <label for>, wrapping, sibling,
 *  and (Magento KO grid) the enclosing fieldset's legend ("Type", "Status",
 *  "Store View" live on the fieldset, while the field's own <label> says
 *  nothing useful or the field has no label at all). */
function labelCandidates(el: Field): string[] {
  const found: string[] = [];
  const aria = el.getAttribute('aria-label');
  if (aria) found.push(aria);
  if (el.id) {
    try {
      const lab = document.querySelector<HTMLElement>(
        `label[for="${CSS.escape(el.id)}"]`,
      );
      if (lab) found.push(lab.textContent ?? '');
    } catch {
      /* CSS.escape unavailable — other candidates still apply. */
    }
  }
  const wrapping = el.closest('label');
  if (wrapping) found.push(wrapping.textContent ?? '');
  const parent = el.parentElement;
  if (parent && !parent.contains(wrapping)) {
    const sibling = parent.querySelector<HTMLElement>(
      ':scope > label, :scope > [class*="label"]',
    );
    if (sibling && !sibling.contains(el)) found.push(sibling.textContent ?? '');
  }
  // KO filter panel: fieldset > legend carries the filter name. Closest
  // fieldset wins; an outer fieldset (the whole "Advanced filter" form) is a
  // fallback only.
  const fieldsets = el.closest('fieldset') ? [el.closest('fieldset') as HTMLElement] : [];
  let outer: HTMLElement | null = el.parentElement;
  while (outer && fieldsets.length < 2) {
    const fs = outer.closest('fieldset');
    if (fs && !fieldsets.includes(fs as HTMLElement)) fieldsets.push(fs as HTMLElement);
    outer = (fs as HTMLElement | null)?.parentElement ?? outer.parentElement;
    if (outer === document.body) break;
  }
  for (const fs of fieldsets) {
    const legend = fs.querySelector<HTMLElement>(':scope > legend');
    if (legend) found.push(legend.textContent ?? '');
  }
  if (el instanceof HTMLInputElement && el.placeholder) found.push(el.placeholder);
  return found.map((t) => fold(t)).filter((t) => t.length > 0);
}

/**
 * Resolve a chip to its one native field.
 *
 * Score: exact label match beats parameter-slug match; a field inside a
 * filter region wins ties with one outside. Two fields sharing the best
 * score mean we cannot know which one the chip means → null (no pencil).
 */
function resolveField(chip: Chip, claimed: Claimed): Field | null {
  const wanted = fold(chip.label);
  const wantedSlug = slug(chip.label);

  let best: { field: Field; score: number } | null = null;
  let tied = false;

  for (const field of editableFields()) {
    if (claimed.has(field)) continue;
    let score = 0;
    if (labelCandidates(field).includes(wanted)) score = 3;
    else {
      const name = field.getAttribute('name') ?? '';
      if (!name) continue;
      const root = paramRoot(name);
      if (
        root === wantedSlug ||
        slug(name) === wantedSlug ||
        root === wantedSlug.replace(/_id$/, '') ||
        wantedSlug === `${root}_id`
      ) {
        score = 2;
      }
      // Known Magento product-grid aliases: chip label vs input name.
      else if (
        (wantedSlug === 'type' && root === 'type_id') ||
        (wantedSlug === 'status' && root === 'status') ||
        (wantedSlug === 'store_view' && root === 'store_id') ||
        (wantedSlug === 'id' && root === 'entity_id')
      ) {
        score = 2;
      }
    }
    if (score === 0) continue;
    if (field.closest(FILTER_REGION)) score += 0.25;
    if (!best || score > best.score) {
      best = { field, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }

  if (!best || tied) return null;
  return best.field;
}

/* --- apply ---------------------------------------------------------------- */

function findApplyButton(field: Field): HTMLElement | null {
  const ok = (el: HTMLElement): boolean => {
    // Never our own controls: the editor's ✓ has an "Apply" title.
    if (
      el.classList.contains(PENCIL_CLASS) ||
      el.classList.contains(OK_CLASS) ||
      el.classList.contains(X_CLASS) ||
      el.closest(`.${EDITING_CLASS}`)
    ) {
      return false;
    }
    const text = fold(
      (el instanceof HTMLInputElement ? el.value : el.textContent) ||
        el.getAttribute('title') ||
        '',
    );
    if (!/\bapply\b/.test(text)) return false;
    if (/\b(reset|clear|cancel|remove|delete)\b/.test(text)) return false;
    if (el instanceof HTMLButtonElement && el.disabled) return false;
    return true;
  };
  const scan = (root: ParentNode): HTMLElement | null =>
    Array.from(root.querySelectorAll<HTMLElement>('button, a, input[type="submit"]')).find(ok) ??
    null;

  // The field's own region first (the filter panel), …
  const scope = field.closest<HTMLElement>(FILTER_REGION);
  if (scope) {
    const inScope = scan(scope);
    if (inScope) return inScope;
  }
  // … then the panel's Apply marker, …
  const marked = document.querySelector<HTMLElement>(
    '[data-role="filter-apply"], [data-action="grid-filter-apply"], .action-apply-filters',
  );
  if (marked && ok(marked)) return marked;
  // … then any Apply control on the page: on some grids the button sits in
  // the toolbar while the fields live in a detached panel.
  return scan(document);
}

interface EnterInit extends KeyboardEventInit {
  keyCode?: number;
  which?: number;
}

/**
 * Run the filter with `field`'s new value: the panel's own Apply button,
 * else its form submit, else Enter on the field (Magento's binding).
 * Returns which path fired, for diagnostics.
 */
function triggerApply(field: Field): 'button' | 'form' | 'key' {
  const button = findApplyButton(field);
  if (button) {
    button.click();
    return 'button';
  }
  const form = field.form;
  if (form) {
    try {
      const submit = form.querySelector<HTMLInputElement>(
        'button[type="submit"], input[type="submit"]',
      );
      if (submit && typeof form.requestSubmit === 'function') {
        form.requestSubmit(submit);
      } else {
        form.submit();
      }
      return 'form';
    } catch {
      /* fall through to the key path */
    }
  }
  const init: EnterInit = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };
  for (const type of ['keydown', 'keypress', 'keyup']) {
    field.dispatchEvent(new KeyboardEvent(type, init));
  }
  return 'key';
}

/** Write through the native setter + events, so Knockout/KO bindings see it. */
function writeFieldValue(field: Field, value: string): boolean {
  if (field instanceof HTMLSelectElement) {
    // Never write a value no option carries — that would silently clear the
    // filter instead of changing it.
    if (!Array.from(field.options).some((o) => o.value === value)) return false;
  }
  const proto: object =
    field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/* --- editor --------------------------------------------------------------- */

const PENCIL_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>';

/**
 * Hide the chip's current text while the editor is open.
 * Returns a restore function that puts every node back exactly as it was.
 */
function maskForEditor(
  item: HTMLElement,
  chip: Chip,
  pencil: HTMLElement,
): () => void {
  if (chip.valueEl) {
    const valueEl = chip.valueEl; // narrowed into the closure below
    const prev = valueEl.style.display;
    valueEl.style.display = 'none';
    return () => {
      valueEl.style.display = prev;
    };
  }

  // No dedicated value element: wrap non-empty text nodes so they can be
  // hidden, and hide element children (keeping the remove link and pencil).
  const restores: Array<() => void> = [];
  Array.from(item.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!(node.textContent ?? '').trim()) return;
      const span = document.createElement('span');
      node.parentNode?.insertBefore(span, node);
      span.appendChild(node);
      span.style.display = 'none';
      restores.push(() => {
        span.replaceWith(...Array.from(span.childNodes));
      });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el === chip.removeEl || el === pencil || el === item) return;
    const prev = el.style.display;
    el.style.display = 'none';
    restores.push(() => {
      el.style.display = prev;
    });
  });
  return () => restores.forEach((fn) => fn());
}

function startEdit(chip: Chip, item: HTMLElement): void {
  if (item.getAttribute(EDITING_MARK) === '1') return;

  // Resolve fresh: an AJAX reload may have replaced the field since the
  // pencil was drawn, and writing into a detached node silently does nothing.
  const claimed: Claimed = new Set();
  const field = resolveField(chip, claimed);
  if (!field || !field.isConnected) return;

  const pencil = item.querySelector<HTMLElement>(`.${PENCIL_CLASS}`);
  item.setAttribute(EDITING_MARK, '1');

  let closed = false;
  const restore = maskForEditor(item, chip, pencil ?? item);

  const editing = document.createElement('span');
  editing.className = EDITING_CLASS;

  const close = (): void => {
    if (closed) return;
    closed = true;
    editing.remove();
    restore();
    item.removeAttribute(EDITING_MARK);
  };

  const applyNow = (value: string): void => {
    if (closed) return;
    if (!writeFieldValue(field, value)) {
      close();
      return;
    }
    closed = true; // close()s from blur/blur-ish events must not undo this
    editing.remove();
    restore();
    item.removeAttribute(EDITING_MARK);
    triggerApply(field);
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = X_CLASS;
  cancelBtn.title = 'Cancel';
  cancelBtn.setAttribute('aria-label', 'Cancel edit');
  cancelBtn.textContent = '✕';
  cancelBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    close();
  });

  if (field instanceof HTMLSelectElement) {
    // One gesture, like picking from the menu the chip replaces: choosing an
    // option applies it. Esc / ✕ cancel before that.
    const select = document.createElement('select');
    select.className = SELECT_CLASS;
    select.setAttribute('aria-label', `${chip.label} filter value`);
    for (const opt of Array.from(field.options)) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.text = opt.text;
      option.disabled = opt.disabled;
      select.appendChild(option);
    }
    select.value = field.value;
    if (!select.value && chip.value) {
      const match = Array.from(select.options).find(
        (o) => fold(o.text) === fold(chip.value),
      );
      if (match) select.value = match.value;
    }
    select.addEventListener('change', () => applyNow(select.value));
    select.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    });
    editing.append(select, cancelBtn);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = INPUT_CLASS;
    input.value = field.value || chip.value;
    input.setAttribute('aria-label', `${chip.label} filter value`);
    input.placeholder = chip.label;

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = OK_CLASS;
    okBtn.title = 'Apply filter (Enter)';
    okBtn.setAttribute('aria-label', 'Apply filter');
    okBtn.textContent = '✓';
    // mousedown, not click: otherwise blurring the input would cancel first.
    okBtn.addEventListener('mousedown', (event) => event.preventDefault());
    okBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyNow(input.value);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyNow(input.value);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    // Clicking away abandons a half-typed value — never applies it.
    input.addEventListener('blur', () => close());

    editing.append(input, okBtn, cancelBtn);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  if (chip.valueEl) chip.valueEl.after(editing);
  else if (chip.removeEl) item.insertBefore(editing, chip.removeEl);
  else item.appendChild(editing);
}

/* --- entry point ---------------------------------------------------------- */

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PENCIL_STYLES;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Add a pencil to every Active-filters chip whose filter can be resolved to
 * one editable field. Idempotent per chip, so the debounced scan can call it
 * on every DOM mutation and after each AJAX grid reload.
 */
export function enhanceActiveFilters(): number {
  let count = 0;
  for (const strip of findStrips()) {
    const claimed: Claimed = new Set();
    for (const item of itemsOf(strip)) {
      if (item.getAttribute(ITEM_MARK) === '1') continue;
      const chip = parseChip(item);
      if (!chip) continue;
      const field = resolveField(chip, claimed);
      if (!field) continue;

      injectStyles();

      const pencil = document.createElement('button');
      pencil.type = 'button';
      pencil.className = PENCIL_CLASS;
      pencil.title = `Edit ${chip.label} filter`;
      pencil.setAttribute('aria-label', `Edit ${chip.label} filter`);
      pencil.innerHTML = PENCIL_ICON;
      pencil.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        startEdit(chip, item);
      });

      if (chip.valueEl) chip.valueEl.after(pencil);
      else if (chip.removeEl) item.insertBefore(pencil, chip.removeEl);
      else item.appendChild(pencil);

      item.setAttribute(ITEM_MARK, '1');
      claimed.add(field);
      count += 1;
    }
  }
  return count;
}

// `--mhx-*` are set by the theme layer when the operator opts into theming the
// admin; the fallbacks are Magento's own admin colours, so the control looks
// native when theming is off.
const PENCIL_STYLES = `
.mhx-chip-edit{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin:0 0 0 4px;padding:0;border:1px solid transparent;border-radius:3px;background:transparent;color:var(--mhx-muted,#757575);cursor:pointer;vertical-align:middle;line-height:1;}
.mhx-chip-edit:hover{background:var(--mhx-tint,#e5f2fa);border-color:var(--mhx-border-2,#adadad);color:var(--mhx-ink,#303030);}
.mhx-chip-edit:focus-visible{outline:2px solid var(--mhx-accent,#007bdb);outline-offset:1px;}
.mhx-chip-editing{display:inline-flex;align-items:center;gap:4px;margin:0 0 0 4px;vertical-align:middle;}
.mhx-chip-input,.mhx-chip-select{margin:0;padding:2px 6px;max-width:240px;font:13px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-ink,#303030);background:var(--mhx-surface,#fff);border:1px solid var(--mhx-accent,#007bdb);border-radius:3px;vertical-align:middle;}
.mhx-chip-input{width:150px;}
.mhx-chip-input:focus,.mhx-chip-select:focus{outline:2px solid var(--mhx-accent,#007bdb);outline-offset:1px;}
.mhx-chip-ok,.mhx-chip-x{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;margin:0;padding:0;border:1px solid var(--mhx-border-2,#adadad);border-radius:3px;background:var(--mhx-surface,#fff);color:var(--mhx-ink,#303030);font:12px/1 system-ui,"Segoe UI",Arial,sans-serif;cursor:pointer;vertical-align:middle;}
.mhx-chip-ok:hover{background:var(--mhx-ok-bg,#e6f4ea);border-color:var(--mhx-ok-border,#b7dfc2);color:var(--mhx-ok,#0b6e4f);}
.mhx-chip-x:hover{background:var(--mhx-bad-bg,#fdecea);border-color:var(--mhx-bad-border,#f5b7b1);color:var(--mhx-bad,#912018);}
.mhx-chip-ok:focus-visible,.mhx-chip-x:focus-visible{outline:2px solid var(--mhx-accent,#007bdb);outline-offset:1px;}
`;
