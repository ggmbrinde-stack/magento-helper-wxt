// Factories for the toolkit primitives (UI-TOOLKIT.md §2.3).
//
// Every factory returns a plain DOM node built from the classes in
// toolkit.css — no framework in the content script, so the Preact boundary in
// the panel/dashboard stays where it is (those surfaces can simply write
// class="mhx-btn" themselves).
//
// Rule for callers (UI-TOOLKIT.md §2, rule 1): pass a modifier, never a
// colour. A feature may set `variant`/`tone`, but colours, radii, paddings and
// fonts belong to toolkit.css alone.

export type ButtonVariant = 'default' | 'danger' | 'accent' | 'ghost' | 'icon';
export type IconName = 'close' | 'check' | 'copy' | 'chevronDown' | 'chevronRight';

import { ICONS } from './icons';

export interface ButtonOptions {
  label: string;
  title?: string;
  variant?: ButtonVariant;
  /** Extra classes for layout-only hooks (never colour). */
  className?: string;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  /** Icon to render inside the button (only for icon variant). */
  icon?: IconName;
}

/** A single button: `.mhx-btn[data-variant=…]`. */
export function button(options: ButtonOptions): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = options.className
    ? `mhx-btn ${options.className}`
    : 'mhx-btn';
  const variant = options.variant ?? 'default';
  if (variant !== 'default') el.dataset['variant'] = variant;
  el.textContent = options.label;
  if (options.title) el.title = options.title;
  if (options.disabled) el.disabled = true;
  if (options.onClick) {
    el.addEventListener('click', options.onClick as EventListener);
  }
  if (options.icon && variant === 'icon') {
    const iconSvg = iconEl(options.icon);
    el.appendChild(iconSvg);
  }
  return el;
}

function iconEl(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'currentColor');
  svg.style.display = 'inline-block';
  svg.style.flexShrink = '0';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.appendChild(path);
  return svg;
}

export interface GroupOptions {
  /** Accessible name for the cluster (role="group"). */
  label?: string;
  wrap?: boolean;
}

/** An inline cluster of buttons: `.mhx-group` (row actions, header actions). */
export function group(
  children: Node[],
  options: GroupOptions = {},
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = options.wrap ? 'mhx-group mhx-group--wrap' : 'mhx-group';
  if (options.label) {
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', options.label);
  }
  el.append(...children);
  return el;
}

/**
 * A full-width strip of buttons: `.mhx-bar` (bulk-actions strip, toolbars).
 * Same button treatment as `group()`, but it owns its own row (margin +
 * clear) like the massaction strip always has.
 */
export function bar(children: Node[], label?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'mhx-bar';
  if (label) {
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', label);
  }
  el.append(...children);
  return el;
}

export interface ChipOptions {
  label: string;
  title?: string;
  /** When given, renders the removable × (`.mhx-chip-remove`). */
  onRemove?: () => void;
}

/** A pill, optionally removable: `.mhx-chip`. */
export function chip(options: ChipOptions): HTMLElement {
  const el = document.createElement('span');
  el.className = 'mhx-chip';
  const text = document.createElement('span');
  text.textContent = options.label;
  if (options.title) el.title = options.title;
  el.append(text);
  if (options.onRemove) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'mhx-chip-remove';
    x.textContent = '×';
    x.title = 'Remove';
    x.setAttribute('aria-label', `Remove ${options.label}`);
    x.addEventListener('click', () => options.onRemove?.());
    el.append(x);
  }
  return el;
}

/** A count / status pill: `.mhx-badge`. */
export function badge(
  text: string,
  options: { title?: string; tone?: 'ok' | 'danger' } = {},
): HTMLElement {
  const el = document.createElement('span');
  el.className = 'mhx-badge';
  if (options.tone) el.dataset['tone'] = options.tone;
  el.textContent = text;
  if (options.title) el.title = options.title;
  return el;
}

export interface SegmentedOption {
  label: string;
  value: string;
  title?: string;
}

export interface SegmentedOptions {
  /** Accessible name for the control (role="group"). */
  label: string;
  options: SegmentedOption[];
  active: string;
  onPick: (value: string) => void;
}

/** A one-of-N switch: `.mhx-seg` + `.mhx-seg-btn`. */
export function segmented(options: SegmentedOptions): HTMLElement {
  const el = document.createElement('div');
  el.className = 'mhx-seg';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', options.label);
  for (const option of options.options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mhx-seg-btn';
    const active = option.value === options.active;
    if (active) btn.classList.add('mhx-seg-btn--active');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.textContent = option.label;
    if (option.title) btn.title = option.title;
    btn.addEventListener('click', () => options.onPick(option.value));
    el.append(btn);
  }
  return el;
}

/**
 * A popover *surface* (`.mhx-pop`) with optional item rows — positioning is
 * the caller's job, because only the feature knows its anchor. Kept for the
 * enhanceSelect port (phase 5); not yet used by a shipped feature.
 */
export function popover(
  children: Node[],
  options: { label?: string } = {},
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'mhx-pop';
  if (options.label) el.setAttribute('aria-label', options.label);
  el.append(...children);
  return el;
}
