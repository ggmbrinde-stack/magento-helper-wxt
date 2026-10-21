// Replace the product grid's per-row "Select ▾" dropdown with an inline
// action selector.
//
// Why: a row's menu holds one or two actions. The dropdown therefore costs a
// click to open plus a click to choose, for a list too short to need hiding.
// Showing the actions inline turns two clicks into one and leaves the row's
// available actions readable at a glance.
//
// How it stays safe:
// - Magento's own trigger and <ul> stay in the document; they are only hidden.
//   Every button forwards its click to the original item, so Magento's hrefs,
//   click handlers, confirmation modals and ACL filtering keep working.
//   Nothing is written, no request is made, no form is submitted by us — the
//   control can only click what the operator could already have clicked.
// - Rows the menu does not fit (more than `MAX_INLINE_ACTIONS` actions) are left
//   exactly as Magento drew them.
// - Idempotent: a processed wrapper is marked, so the content script's
//   debounced re-scan and Magento's AJAX grid reloads cannot double-wrap a row.
//
// Styling is the toolkit's (UI-TOOLKIT.md): this module only draws
// `group()` + `button({variant})` and never writes a colour, radius or font.
import { button, ensureUi, group } from '../ui';

const MARK_ATTR = 'data-mhx-row-actions';

/** Beyond this many actions the dropdown is the better control, so leave it. */
const MAX_INLINE_ACTIONS = 4;

interface RowAction {
  label: string;
  el: HTMLElement;
  danger: boolean;
}

/** True when this wrapper already carries our control. */
function isEnhanced(wrap: HTMLElement): boolean {
  return wrap.getAttribute(MARK_ATTR) === '1';
}

/** Read the menu's items, skipping anything Magento has hidden or disabled. */
function readRowActions(menu: HTMLElement): RowAction[] {
  const out: RowAction[] = [];
  menu.querySelectorAll<HTMLElement>('li').forEach((li) => {
    if (li.hidden || li.classList.contains('hidden')) return;
    if (li.classList.contains('_disabled') || li.classList.contains('disabled')) {
      return;
    }
    // Row menus use anchors, but Magento's toolbar menu renders bare
    // `<span class="action-menu-item">` with the handler on the <li>. Falling
    // back to the item element keeps both shapes usable.
    const el =
      li.querySelector<HTMLElement>('a, button, .action-menu-item') ?? li;
    if (!el) return;
    if (
      el.hasAttribute('disabled') ||
      el.getAttribute('aria-disabled') === 'true'
    ) {
      return;
    }
    if (el.hidden || el.classList.contains('hidden')) return;
    const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!label) return;
    out.push({ label, el, danger: /delete|remove|deactivat/i.test(label) });
  });
  return out;
}

function hide(el: HTMLElement): void {
  el.style.setProperty('display', 'none', 'important');
}

/**
 * Turn one row's dropdown into an inline selector.
 * Returns true when this wrapper was newly enhanced.
 */
export function enhanceRowAction(wrap: HTMLElement): boolean {
  if (isEnhanced(wrap)) return false;

  const trigger =
    wrap.querySelector<HTMLElement>(
      '[data-toggle="dropdown"], .admin__action-dropdown, .action-select',
    ) ?? null;
  const menu =
    wrap.querySelector<HTMLElement>(
      'ul.action-menu, ul.admin__action-dropdown-menu',
    ) ?? null;

  // A menu rendered outside this wrapper (or one Magento has not built yet)
  // cannot be safely paired with a trigger, so leave it alone.
  if (!trigger || !menu) return false;

  const actions = readRowActions(menu);
  if (actions.length === 0 || actions.length > MAX_INLINE_ACTIONS) return false;

  ensureUi();

  const cluster = group(
    actions.map((action) =>
      button({
        label: action.label,
        title: action.label,
        variant: action.danger ? 'danger' : 'default',
        onClick: (event) => {
          event.preventDefault();
          // The grid can bind row-level handlers; ours must not trigger them.
          event.stopPropagation();
          action.el.click();
        },
      }),
    ),
    { label: 'Row actions' },
  );

  wrap.insertBefore(cluster, wrap.firstChild);
  // Hidden rather than removed: Magento's dropdown widget still holds these
  // nodes, and destroying them breaks its state on later AJAX reloads.
  hide(trigger);
  hide(menu);
  wrap.setAttribute(MARK_ATTR, '1');
  return true;
}

/**
 * Find every row dropdown on the page and enhance the ones whose action list is
 * short enough to show inline. Idempotent, so the debounced scan can call it on
 * every DOM mutation and after each AJAX reload.
 */
export function enhanceRowActions(): number {
  const seen = new Set<HTMLElement>();
  let count = 0;
  document
    .querySelectorAll<HTMLElement>(WRAP_SELECTOR)
    .forEach((node) => {
      // A row can match twice: the actions cell matches, and so does the
      // dropdown wrapper inside it. Resolve both to the same element so a row
      // never gets two controls.
      const wrap = canonicalWrap(node);
      if (!wrap || seen.has(wrap)) return;
      // Rows only. Magento's toolbar "Actions" dropdown is the same component,
      // but turning bulk destructive actions into always-visible buttons is a
      // different risk and was not asked for, so it is left as Magento drew it.
      if (!wrap.closest('tr, td')) return;
      seen.add(wrap);
      if (enhanceRowAction(wrap)) count += 1;
    });
  return count;
}

const WRAP_SELECTOR =
  '.action-select-wrap, .admin__action-dropdown-wrap, td.data-grid-actions-cell';

/** The element the control belongs in: the dropdown wrapper when there is one. */
function canonicalWrap(node: HTMLElement): HTMLElement | null {
  if (node.matches('.action-select-wrap, .admin__action-dropdown-wrap')) {
    return node;
  }
  return (
    node.querySelector<HTMLElement>(
      '.action-select-wrap, .admin__action-dropdown-wrap',
    ) ?? node
  );
}

// Styling moved to the toolkit (src/ui/toolkit.css): `.mhx-group` +
// `.mhx-btn[data-variant=danger]`, page-adaptive tokens, no local sheet.
