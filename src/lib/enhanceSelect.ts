// Replace a native Magento admin <select> with a better control, without
// touching Magento's own code.
//
// Which control depends on the list:
//   - `search`    → a searchable picker. For long lists (colours, attribute
//                   sets, store views) where scrolling is the problem.
//   - `segmented` → a row of inline buttons showing every choice at once. For
//                   short lists where the problem is the click-to-open step
//                   rather than scanning. Used for the grid "per page" control.
//
// Why this shape:
// - The native <select> stays in the document and keeps the real value.
//   Magento's UI components (Knockout + RequireJS) hold element references and
//   only react to events, so the value is written through the prototype's
//   native setter followed by `input`/`change` — the same technique
//   `magentoForm.ts` uses for text fields. Assigning `.value` alone is
//   silently ignored by the component listeners.
// - Nothing is saved, no request is made, and no Save button is clicked.
// - Knockout can rebuild the option list or the whole field. `syncFromNative()`
//   re-reads the native select, and `isStale()` reports when the caller should
//   simply re-run the enhance helper.

const WRAP_CLASS = 'mhx-nh';
const NATIVE_CLASS = 'mhx-nh-native';
const STYLE_ID = 'mhx-enhance-select-styles';

/** How the replacement control presents the options. */
export type SelectPresentation = 'search' | 'segmented';

/** Options read from the native select, with optgroups collapsed. */
export interface EnhancedOption {
  value: string;
  label: string;
  disabled: boolean;
}

export interface EnhanceSelectOptions {
  presentation?: SelectPresentation;
  /** Shown when nothing (or an empty value) is selected. */
  placeholder?: string;
  /** Search box placeholder text. */
  searchPlaceholder?: string;
  /** aria-label for the replacement control. */
  label?: string;
  /** Close after picking (searchable picker only). */
  closeOnSelect?: boolean;
}

/** Live decorators, so an idempotent scan can tell it already handled a select. */
const mounted = new WeakMap<HTMLSelectElement, SelectDecorator>();

export function injectEnhancerStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = ENHANCER_STYLES;
  (document.head ?? document.documentElement).appendChild(style);
}

/** Read the native options, skipping empty placeholders and flattening groups. */
export function readOptions(select: HTMLSelectElement): EnhancedOption[] {
  const out: EnhancedOption[] = [];
  const push = (option: HTMLOptionElement): void => {
    const label = (option.textContent ?? '').trim();
    if (option.value === '' && label === '') return;
    out.push({
      value: option.value,
      label: label || option.value,
      disabled: option.disabled,
    });
  };

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      for (const option of Array.from(child.children)) {
        if (option instanceof HTMLOptionElement) push(option);
      }
    } else if (child instanceof HTMLOptionElement) {
      push(child);
    }
  }
  return out;
}

/** Write a value into a native <select> the way its component listeners expect. */
export function writeNativeValue(select: HTMLSelectElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  );
  if (descriptor?.set) {
    descriptor.set.call(select, value);
  } else {
    select.value = value;
  }
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Shared plumbing: wraps the select in place, keeps it in the document, watches
 * for Magento rebuilding its options, and puts everything back on destroy.
 */
abstract class SelectDecorator {
  protected readonly select: HTMLSelectElement;
  protected readonly wrapper: HTMLDivElement;
  protected readonly options: EnhanceSelectOptions;
  private readonly parent: Node | null;
  private readonly nextSibling: Node | null;
  private observer: MutationObserver | null = null;
  private destroyed = false;

  /** Called by the click handler we attach to every replacement control. */
  protected active: boolean;

  constructor(
    select: HTMLSelectElement,
    options: EnhanceSelectOptions,
    wrapperModifier: string,
    showTrigger: boolean,
  ) {
    this.select = select;
    this.options = options;
    this.parent = select.parentNode;
    this.nextSibling = select.nextSibling;

    this.wrapper = document.createElement('div');
    this.wrapper.className = `${WRAP_CLASS} mhx-nh--${wrapperModifier}`;
    this.wrapper.setAttribute('data-mhx-nh', '1');
    this.active = showTrigger;
  }

  /** Build the subclass DOM into `this.wrapper`. Must not touch `this.select`. */
  protected abstract build(): void;

  /** Redraw from the current native state. */
  protected abstract render(): void;

  /** Close any open surface (searchable picker only). */
  protected closeSurface(): void {}

  /** Subclass hook to focus the replacement UI when the native select receives focus. */
  protected focusReplacement(): void {}

  mount(): void {
    if (this.destroyed || mounted.has(this.select)) return;
    injectEnhancerStyles();

    // Insert the wrapper where the select sits, then reparent the select inside
    // it. Reparenting keeps the element in the document; Knockout holds the
    // element reference, and `destroy()` puts it back exactly where it was.
    // Use the select's *current* parent: Magento may have moved the field
    // since this decorator was constructed, and inserting before a node that
    // is no longer a child of `this.parent` throws NotFoundError.
    this.select.parentNode?.insertBefore(this.wrapper, this.select);
    this.select.classList.add(NATIVE_CLASS);
    this.wrapper.appendChild(this.select);

    this.build();
    this.select.addEventListener('change', this.onNativeChange);
    this.select.addEventListener('focus', this.onNativeFocus);

    // Magento rebuilding the <option> list is the common re-render; watch the
    // select itself rather than the whole page.
    this.observer = new MutationObserver(() => this.syncFromNative());
    this.observer.observe(this.select, { childList: true, subtree: true });

    mounted.set(this.select, this);
    this.render();
  }

  /** Re-read the native select and redraw. Safe to call as often as needed. */
  syncFromNative(): void {
    if (this.destroyed) return;
    this.render();
  }

  /** True when Magento replaced the field out from under us. */
  isStale(): boolean {
    return this.destroyed || !this.select.isConnected;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = null;
    this.select.removeEventListener('change', this.onNativeChange);
    this.select.removeEventListener('focus', this.onNativeFocus);
    this.detachSurface();
    mounted.delete(this.select);

    // Put the native select back where Magento originally had it.
    this.select.classList.remove(NATIVE_CLASS);
    if (this.parent) {
      const before =
        this.nextSibling && this.nextSibling.parentNode === this.parent
          ? this.nextSibling
          : null;
      this.parent.insertBefore(this.select, before);
    }
    this.wrapper.remove();
  }

  /** Subclass hook: remove document-level listeners. */
  protected detachSurface(): void {}

  private readonly onNativeChange = (): void => {
    this.render();
  };

  private readonly onNativeFocus = (): void => {
    this.focusReplacement();
  };

  protected get currentValue(): string {
    return this.select.value;
  }
}

/** Searchable picker — for lists too long to scan. */
export class SelectEnhancer extends SelectDecorator {
  private readonly labelEl: HTMLSpanElement;
  private readonly trigger: HTMLButtonElement;
  private readonly popover: HTMLDivElement;
  private readonly search: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private activeIndex = -1;
  private open = false;

  constructor(select: HTMLSelectElement, options: EnhanceSelectOptions) {
    super(select, options, 'search', true);

    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'mhx-nh-trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');
    if (options.label) this.trigger.setAttribute('aria-label', options.label);

    this.labelEl = document.createElement('span');
    this.labelEl.className = 'mhx-nh-label';
    const caret = document.createElement('span');
    caret.className = 'mhx-nh-caret';
    caret.setAttribute('aria-hidden', 'true');
    this.trigger.append(this.labelEl, caret);

    this.popover = document.createElement('div');
    this.popover.className = 'mhx-nh-pop';
    this.popover.hidden = true;

    this.search = document.createElement('input');
    this.search.type = 'text';
    this.search.className = 'mhx-nh-search';
    this.search.placeholder = options.searchPlaceholder ?? 'Search…';
    this.search.setAttribute('autocomplete', 'off');

    this.list = document.createElement('ul');
    this.list.className = 'mhx-nh-list';
    this.list.setAttribute('role', 'listbox');

    this.popover.append(this.search, this.list);
  }

  protected build(): void {
    // The control has to be attached, or the wrapper holds nothing but a
    // hidden select and the field becomes unusable.
    this.wrapper.append(this.trigger, this.popover);
    this.trigger.addEventListener('click', this.onTriggerClick);
    this.search.addEventListener('input', this.onSearchInput);
    this.search.addEventListener('keydown', this.onSearchKeyDown);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  protected detachSurface(): void {
    this.trigger.removeEventListener('click', this.onTriggerClick);
    this.search.removeEventListener('input', this.onSearchInput);
    this.search.removeEventListener('keydown', this.onSearchKeyDown);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
  }

  override syncFromNative(): void {
    super.syncFromNative();
    if (this.open) this.applyFilter();
  }

  protected render(): void {
    const options = readOptions(this.select);
    const selected = options.find((o) => o.value === this.currentValue);
    this.labelEl.textContent =
      selected?.label ?? this.options.placeholder ?? 'Select…';
    this.labelEl.classList.toggle('mhx-nh-label--empty', !selected);

    this.list.textContent = '';
    for (const option of options) {
      const item = document.createElement('li');
      item.className = 'mhx-nh-opt';
      item.setAttribute('role', 'option');
      item.dataset['value'] = option.value;
      item.textContent = option.label;
      if (option.disabled) {
        item.classList.add('mhx-nh-opt--disabled');
        item.setAttribute('aria-disabled', 'true');
      }
      item.classList.toggle('mhx-nh-opt--active', option.value === this.currentValue);
      item.addEventListener('click', () => {
        if (option.disabled) return;
        this.choose(option.value);
      });
      this.list.appendChild(item);
    }
  }

  private choose(value: string): void {
    writeNativeValue(this.select, value);
    if (this.options.closeOnSelect !== false) this.close();
  }

  private openPopover(): void {
    if (this.open) return;
    this.open = true;
    this.popover.hidden = false;
    this.trigger.setAttribute('aria-expanded', 'true');
    this.wrapper.classList.add('mhx-nh--open');
    this.search.value = '';
    this.applyFilter();
    this.search.focus();
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.popover.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.wrapper.classList.remove('mhx-nh--open');
    this.activeIndex = -1;
  }

  protected override closeSurface(): void {
    this.close();
  }

  protected override focusReplacement(): void {
    this.trigger.focus();
  }

  private visibleItems(): HTMLLIElement[] {
    return Array.from(
      this.list.querySelectorAll<HTMLLIElement>('.mhx-nh-opt'),
    ).filter((item) => !item.hidden);
  }

  private applyFilter(): void {
    const needle = this.search.value.trim().toLowerCase();
    const items = Array.from(
      this.list.querySelectorAll<HTMLLIElement>('.mhx-nh-opt'),
    );
    for (const item of items) {
      const label = (item.textContent ?? '').toLowerCase();
      const value = (item.dataset['value'] ?? '').toLowerCase();
      item.hidden =
        needle !== '' && !label.includes(needle) && !value.includes(needle);
    }

    const visible = items.filter((item) => !item.hidden);
    const selected = visible.find(
      (item) => item.dataset['value'] === this.currentValue,
    );
    if (selected) this.activeIndex = visible.indexOf(selected);
    else this.activeIndex = visible.length > 0 ? 0 : -1;
    for (const item of items) item.classList.remove('mhx-nh-opt--cursor');
    visible[this.activeIndex]?.classList.add('mhx-nh-opt--cursor');
    visible[this.activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  private moveCursor(delta: number): void {
    const visible = this.visibleItems();
    if (visible.length === 0) return;
    const next = (this.activeIndex + delta + visible.length) % visible.length;
    visible[this.activeIndex]?.classList.remove('mhx-nh-opt--cursor');
    this.activeIndex = next;
    visible[next]?.classList.add('mhx-nh-opt--cursor');
    visible[next]?.scrollIntoView({ block: 'nearest' });
  }

  private readonly onTriggerClick = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.open) this.close();
    else this.openPopover();
  };

  private readonly onSearchInput = (): void => {
    this.applyFilter();
  };

  private readonly onSearchKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveCursor(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveCursor(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.visibleItems()[this.activeIndex];
      const value = item?.dataset['value'];
      if (value !== undefined && item?.getAttribute('aria-disabled') !== 'true') {
        this.choose(value);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      this.trigger.focus();
    }
  };

  /** Closing on an outside click keeps us from needing a backdrop element. */
  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.open) return;
    const target = event.target;
    if (target instanceof Node && this.wrapper.contains(target)) return;
    this.close();
  };
}

/**
 * Inline segmented control — every choice visible, one click to change.
 * For short lists like the grid "per page" options, where the native dropdown
 * costs a click to open and a scroll-free list gains nothing.
 */
export class SegmentedSelect extends SelectDecorator {
  private readonly row: HTMLDivElement;

  constructor(select: HTMLSelectElement, options: EnhanceSelectOptions) {
    super(select, options, 'seg', false);
    this.row = document.createElement('div');
    this.row.className = 'mhx-nh-seg';
    this.row.setAttribute('role', 'radiogroup');
    if (options.label) this.row.setAttribute('aria-label', options.label);
  }

  protected override focusReplacement(): void {
    const activeOrFirst =
      this.row.querySelector<HTMLButtonElement>('.mhx-nh-seg-btn--active') ??
      this.row.querySelector<HTMLButtonElement>('.mhx-nh-seg-btn:not(:disabled)');
    activeOrFirst?.focus();
  }

  protected build(): void {
    this.row.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest<HTMLButtonElement>('.mhx-nh-seg-btn');
      if (!btn || btn.disabled) return;
      event.preventDefault();
      const value = btn.dataset['value'];
      if (value !== undefined) writeNativeValue(this.select, value);
    });
    this.wrapper.appendChild(this.row);
  }

  protected render(): void {
    this.row.textContent = '';
    for (const option of readOptions(this.select)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mhx-nh-seg-btn';
      btn.textContent = option.label;
      btn.dataset['value'] = option.value;
      btn.disabled = option.disabled;
      const isActive = option.value === this.currentValue;
      btn.classList.toggle('mhx-nh-seg-btn--active', isActive);
      btn.setAttribute('aria-checked', String(isActive));
      btn.setAttribute('role', 'radio');
      btn.title = option.label;
      this.row.appendChild(btn);
    }
  }
}

/**
 * Enhance a select if it is not already enhanced.
 * Idempotent, so an existing debounced scan can call it freely.
 */
export function enhanceSelect(
  select: HTMLSelectElement,
  options: EnhanceSelectOptions = {},
): SelectDecorator | null {
  if (isEnhanced(select)) return null;
  const decorator =
    options.presentation === 'segmented'
      ? new SegmentedSelect(select, options)
      : new SelectEnhancer(select, options);
  decorator.mount();
  return decorator;
}

/** True when this select already has a live decorator. */
export function isEnhanced(select: HTMLSelectElement): boolean {
  const existing = mounted.get(select);
  return Boolean(existing) && !existing?.isStale();
}

/** Enhance every select matching a selector. Returns how many were picked up. */
export function enhanceSelects(
  selector: string,
  options: EnhanceSelectOptions = {},
): number {
  let count = 0;
  document.querySelectorAll<HTMLSelectElement>(selector).forEach((select) => {
    if (enhanceSelect(select, options)) count += 1;
  });
  return count;
}

const ENHANCER_STYLES = `
.mhx-nh{position:relative;display:block;min-width:180px;font:13px/1.4 system-ui,"Segoe UI",Arial,sans-serif;}
/* D8 fix: keep native select in layout & focusable instead of display:none,
   so Magento validation scroll/focus doesn't target a hidden element */
.mhx-nh>select.mhx-nh-native{position:absolute !important;opacity:0 !important;pointer-events:none !important;width:1px !important;height:1px !important;margin:0 !important;border:0 !important;padding:0 !important;}
.mhx-nh-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:6px 10px;border:1px solid #adadad;border-radius:3px;background:#fff;color:#303030;cursor:pointer;text-align:left;font:inherit;}
.mhx-nh-trigger:hover{border-color:#8a8a8a;}
.mhx-nh--open .mhx-nh-trigger{border-color:#007bdb;box-shadow:0 0 0 1px #007bdb;}
.mhx-nh-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mhx-nh-label--empty{color:#8a8a8a;}
.mhx-nh-caret{flex-shrink:0;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid #555;}
.mhx-nh-pop{position:absolute;z-index:100000;top:calc(100% + 2px);left:0;right:0;display:flex;flex-direction:column;max-height:280px;border:1px solid #adadad;border-radius:3px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.18);}
/* Author styles beat the UA sheet's [hidden]{display:none}, so a class-level
   display would keep the closed list laid out and swallowing clicks on
   whatever sits underneath it. Restore the close. */
.mhx-nh-pop[hidden]{display:none;}
.mhx-nh-search{flex-shrink:0;margin:6px;padding:5px 8px;border:1px solid #c8c8c8;border-radius:3px;font:inherit;}
.mhx-nh-search:focus{outline:none;border-color:#007bdb;box-shadow:0 0 0 1px #007bdb;}
.mhx-nh-list{margin:0;padding:0 0 6px;overflow-y:auto;list-style:none;}
.mhx-nh-opt{padding:5px 10px;cursor:pointer;color:#303030;}
.mhx-nh-opt--cursor{background:#e5f2fa;}
.mhx-nh-opt--active{font-weight:700;color:#007bdb;}
.mhx-nh-opt--disabled{color:#adadad;cursor:default;}
/* Two classes so the segmented modifier wins over the block default above. */
.mhx-nh.mhx-nh--seg{display:inline-flex;min-width:0;}
.mhx-nh-seg{display:inline-flex;border:1px solid #adadad;border-radius:3px;overflow:hidden;background:#fff;}
.mhx-nh-seg-btn{padding:5px 10px;min-width:40px;border:0;border-right:1px solid #e3e3e3;background:#fff;color:#303030;cursor:pointer;font:inherit;}
.mhx-nh-seg-btn:last-child{border-right:0;}
.mhx-nh-seg-btn:hover{background:#f0f0f0;}
.mhx-nh-seg-btn--active{background:#007bdb;color:#fff;font-weight:700;}
.mhx-nh-seg-btn--active:hover{background:#00629e;}
.mhx-nh-seg-btn:disabled{color:#adadad;cursor:default;background:#fafafa;}
`;
