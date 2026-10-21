// Inline buttons for the grid toolbar's bulk "Actions" dropdown (massaction).
//
// Why: every bulk action costs a menu-open plus a pick from a nine-item list,
// for actions the operator runs repeatedly ("Update attributes", "Delete",
// "Regenerate Url"). Buttons put them one click away, exactly where the menu
// sits — and the list stops being a scroll.
//
// How it stays safe (same contract as rowActions):
// - Forwarding only. Each button clicks Magento's OWN menu element — the very
//   element the operator would have clicked — so the massaction selection
//   check, confirmation modals ("Are you sure?"), KO handlers, hrefs and ACL
//   filtering all keep running. Nothing is submitted, written or requested by
//   the extension; with no rows selected Magento replies exactly as it would
//   for the stock menu.
// - Submenus are preserved inside the native dropdown (operator request,
//   2026-10-20): only top-level leaf actions become buttons; anything with
//   a submenu ("Change status", "Change attribute set", "AI Translate")
//   stays reachable through the native dropdown, which remains visible
//   whenever any submenu exists.
// - Placement (2026-10-21): the strip is its OWN row above the grid, never
//   inside the dropdown wrap — inside it the buttons inherited the trigger's
//   narrow width and stacked two per line. Magento's wrap is now left
//   completely untouched (no classes, no layout overrides), so its widget
//   keeps sizing itself.
// - Disabled or hidden items are never rendered (same rules as row actions).
// - Idempotent: the root is marked, so the content script's debounced re-scan
//   and Magento's AJAX grid reloads cannot stack duplicate buttons.
// - Row-level menus are not touched (`tr, td` guard): the per-row "Select ▾"
//   dropdowns are enhanced by rowActions, never twice.
//
// Look & feel is the toolkit's (UI-TOOLKIT.md): `bar()` + `button({variant})`
// from src/ui, one shared stylesheet, no colours written here. The old local
// sheet's `currentColor` rules became the page-adaptive primitives.
import { bar, button, ensureUi } from '../ui';

const MARK = 'data-mhx-mass';
/** The strip's id, remembered on the root AND on the menu: the menu is the
 *  identity (one toolbar menu can be reached from several candidate roots),
 *  and a missing element means Magento rebuilt that part of the toolbar. */
const STRIP_ATTR = 'data-mhx-mass-strip';
let stripSeq = 0;

// (Submenu flattening removed 2026-10-20 — submenus stay in the native
// dropdown; only top-level leaves become buttons.)

/**
 * Safety cap on flattened top-level buttons. The live grid's menu reported
 * ~1070 li (hidden actions shipped by extensions render as real `<li>`s);
 * past this the menu is not the small bulk list this control was built for,
 * so it is left exactly as Magento drew it.
 */
const MAX_TOP_ITEMS = 40;

/**
 * A menu item is renderable only when it is not hidden by attribute/class
 * AND its OWN computed display is not `none`. Magento hides bulk actions
 * with CSS classes; `display` is not inherited, so this catches li-level
 * hiding even while the parent menu itself is closed.
 */
function isRenderableLi(li: HTMLElement): boolean {
  if (li.hidden || li.classList.contains('hidden')) return false;
  if (getComputedStyle(li).display === 'none') return false;
  return true;
}

interface MassItem {
  label: string;
  /** The native element to forward clicks to (menu item node). */
  el: HTMLElement;
  danger: boolean;
}

function fold(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

const DANGER_RE = /delete|remove|deactivat/i;

/** The node inside a menu item that carries the click (a > button > span > li). */
function actionable(li: HTMLElement): HTMLElement | null {
  const found = li.querySelector<HTMLElement>('a, button, .action-menu-item');
  const node = found ?? li;
  if (
    node.hasAttribute('disabled') ||
    node.getAttribute('aria-disabled') === 'true' ||
    node.hidden ||
    node.classList.contains('hidden')
  ) {
    return null;
  }
  if (
    !found &&
    (li.classList.contains('_disabled') || li.classList.contains('disabled'))
  ) {
    return null;
  }
  return node;
}



function submenuOf(li: HTMLElement): HTMLElement | null {
  const sub = li.querySelector<HTMLElement>(':scope > ul');
  return sub && sub.querySelector(':scope > li') ? sub : null;
}

/**
 * Locate the massaction roots: `[data-role="massaction"]` first, then a
 * dropdown labelled exactly "Actions" whose holder contains a menu — the
 * fallback for markup versions we have not seen (the probe script reports
// the real shape when that happens).
 *
 * The live product grid (Magento 2.4, dark admin theme) renders the
 * trigger as `.admin__action-dropdown` WITHOUT `data-toggle="dropdown"`,
 * and the wrap as `.admin__action-dropdown-wrap` (not `.massaction-wrap`),
 * so both are matched here. The label check folds case/space, and the
 * climb goes 6 levels (the wrap can sit deeper than 4).
 */
function findRoots(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const push = (el: HTMLElement | null | undefined): void => {
    if (!el || !el.isConnected || out.includes(el)) return;
    out.push(el);
  };

  // Standard markers only. `.action-select-wrap` is deliberately NOT here:
  // it is shared by every dropdown in the admin (saved views, Filters, row
  // Selects) and pass-1 blind-matching it turned buttons on for components
  // the operator never asked about. The toolbar Actions dropdown is found
  // via its "Actions" trigger below, then double-checked by the
  // massaction signature in the enhance loop.
  document
    .querySelectorAll<HTMLElement>('[data-role="massaction"], .massaction-wrap')
    .forEach(push);

  document
    .querySelectorAll<HTMLElement>(
      '[data-toggle="dropdown"], .admin__action-dropdown, .admin__actions-dropdown, .action-select',
    )
    .forEach((trigger) => {
      if (fold(trigger.textContent ?? '') !== 'actions') return;
      // Climb until an ancestor holds a menu (a ul with at least one li).
      let node: HTMLElement | null = trigger.parentElement;
      for (let hops = 0; node && hops < 6; hops += 1) {
        const menu = node.querySelector<HTMLElement>('ul');
        if (menu && menu.querySelector('li')) {
          push(node);
          return;
        }
        node = node.parentElement;
      }
    });

  return out;
}

function findMenu(root: HTMLElement): HTMLElement | null {
  const menu = root.querySelector<HTMLElement>(
    'ul.massaction-menu, ul.admin__action-dropdown-menu, [data-role="menu"], ul',
  );
  return menu && menu.querySelector(':scope > li') ? menu : null;
}

function hide(el: HTMLElement): void {
  el.style.setProperty('display', 'none', 'important');
}

/**
 * Replace each toolbar massaction dropdown with inline forwarded buttons.
 * Returns how many roots were newly enhanced (idempotent per root).
 */
export function enhanceMassactionButtons(): number {
  let count = 0;
  for (const root of findRoots()) {
    // Row-level menus belong to rowActions (and never get two controls).
    if (root.closest('tr, td')) continue;

    let menu = findMenu(root);
    if (!menu) continue;

    // The MENU is the identity: it remembers which strip belongs to it, so a
    // second root reaching the same menu never draws a duplicate.
    const menuStripId = menu.getAttribute(STRIP_ATTR) ?? '';
    if (menuStripId && document.getElementById(menuStripId)) {
      root.setAttribute(MARK, '1');
      root.setAttribute(STRIP_ATTR, menuStripId);
      continue;
    }

    // A root that is marked but whose menu no longer carries its strip means
    // Magento rebuilt the dropdown under a surviving root: the old strip now
    // points at detached items, so drop it and draw against the new menu.
    if (root.getAttribute(MARK) === '1') {
      const staleId = root.getAttribute(STRIP_ATTR);
      const stale = staleId ? document.getElementById(staleId) : null;
      stale?.remove();
      root.removeAttribute(MARK);
    }

    // Wrapper shape: a single top-level li that only holds the real menu.
    const topLis = menu.querySelectorAll<HTMLElement>(':scope > li');
    if (topLis.length === 1) {
      const wrapped = topLis[0] && submenuOf(topLis[0]);
      if (wrapped) menu = wrapped;
    }

    // Scope lock: this must be the grid toolbar's BULK Actions menu. Other
    // `.action-select` dropdowns on the page (saved views, Filters, …) share
    // the exact markup, so require the massaction signature — a top-level
    // item labelled "Delete" or "Update attributes". Checked AFTER the
    // wrapper unwrap so a wrapped shape is judged on its real items.
    const signature = Array.from(
      menu.querySelectorAll<HTMLElement>(':scope > li'),
    ).some((li) => {
      const label = fold(actionable(li)?.textContent ?? '');
      return label === 'delete' || label === 'update attributes';
    });
    if (!signature) continue;

    const leaves: MassItem[] = [];
    let nativeNeeded = false;

    menu.querySelectorAll<HTMLElement>(':scope > li').forEach((li) => {
      if (!isRenderableLi(li)) return;
      if (submenuOf(li)) {
        // Submenus stay INSIDE the native dropdown — never flattened
        // (operator request, 2026-10-20). Their children ("Enable /
        // Disable", "EN / ES / FR", the attribute-set list) remain exactly
        // where Magento put them, and keeping them reachable also keeps the
        // native trigger visible next to the button strip.
        nativeNeeded = true;
        return;
      }
      const el = actionable(li);
      if (!el) return;
      const label = (li.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!label) return;
      leaves.push({ label, el, danger: DANGER_RE.test(label) });
    });

    const total = leaves.length;
    // Nothing to show, or (past the cap) a menu that is not the small bulk
    // list we expect — the native dropdown is left untouched either way.
    if (total === 0 || total > MAX_TOP_ITEMS) continue;

    // Rows only belong to rowActions: a toolbar root must NOT sit inside a
    // grid row/cell (the "Select ▾" per-row menus share this markup shape).
    // Without this, a grid reload can double-enhance rows as bulk buttons.
    if (root.closest('tr, td.data-grid-actions-cell')) continue;

    ensureUi();

    const strip = bar(
      leaves.map((leaf) =>
        button({
          label: leaf.label,
          title: leaf.label,
          variant: leaf.danger ? 'danger' : 'default',
          onClick: (event) => {
            event.preventDefault();
            // The massaction widget binds on the menu; ours must not re-trigger
            // its dropdown toggling — only the item's own handler.
            event.stopPropagation();
            leaf.el.click();
          },
        }),
      ),
      'Bulk actions',
    );
    strip.id = `mhx-mass-strip-${(stripSeq += 1)}`;

    const trigger = root.querySelector<HTMLElement>(
      '[data-toggle="dropdown"], .admin__actions-dropdown, .admin__action-dropdown, .action-select',
    );

    // OUTSIDE the dropdown (operator request, 2026-10-21): the strip becomes
    // its own row above the grid. Inserted inside the dropdown wrap it took
    // the trigger's width and stacked two buttons per line, half covering the
    // menu; here it gets the full row. Magento's own wrap is never restyled —
    // only the strip's host changes.
    const host = stripHost(root);
    if (host) host.parent.insertBefore(strip, host.before);
    else root.insertAdjacentElement('afterend', strip);

    if (!nativeNeeded) {
      if (trigger) hide(trigger);
      hide(menu);
    }

    root.setAttribute(MARK, '1');
    root.setAttribute(STRIP_ATTR, strip.id);
    menu.setAttribute(STRIP_ATTR, strip.id);
    count += 1;
  }
  return count;
}

/**
 * Where the strip belongs: the parent of the grid header rows, right after the
 * last one — the full-width line between the toolbar and the table. Falls back
 * to just outside the dropdown's own cell so the buttons never land inside a
 * narrow wrapper.
 */
function stripHost(
  root: HTMLElement,
): { parent: HTMLElement; before: ChildNode | null } | null {
  const row = root.closest<HTMLElement>(
    '.admin__data-grid-header-row, .admin__data-grid-toolbar',
  );
  let target: { parent: HTMLElement; before: ChildNode | null } | null = null;
  if (row?.parentElement) {
    const rows = row.parentElement.querySelectorAll<HTMLElement>(
      ':scope > .admin__data-grid-header-row',
    );
    const last = rows[rows.length - 1] ?? row;
    target = { parent: row.parentElement, before: last.nextSibling };
  } else {
    // Unknown toolbar shape: step outside every single-child wrapper around the
    // dropdown, then sit beside it.
    let cell: HTMLElement = root;
    while (
      cell.parentElement &&
      cell.parentElement.children.length === 1 &&
      cell.parentElement !== document.body
    ) {
      cell = cell.parentElement;
    }
    const parent = cell.parentElement;
    if (parent) {
      target = { parent, before: cell.nextSibling };
    }
  }

  if (!target) return null;

  // D5 fix: prevent the strip from being inserted after the grid table on themes
  // where the header row's parent also hosts the table/wrap.
  const gridDirectChild = target.parent.querySelector<HTMLElement>(
    ':scope > .admin__data-grid-wrap, :scope > table.data-grid, :scope > [data-role="grid"]',
  );
  if (gridDirectChild) {
    target.before = gridDirectChild;
  } else {
    let curr = target.before;
    while (curr) {
      if (
        curr instanceof HTMLElement &&
        (curr.matches('.admin__data-grid-wrap, table.data-grid, [data-role="grid"]') ||
          curr.querySelector('.admin__data-grid-wrap, table.data-grid'))
      ) {
        target.before = curr;
        break;
      }
      curr = curr.nextSibling;
    }
  }

  return target;
}

// Styling lives in the toolkit now (src/ui/toolkit.css): `.mhx-bar` +
// `.mhx-btn[data-variant=danger]`, all derived from `currentColor`, so the
// strip follows the admin's own colours (light or dark) instead of our
// extension palette — the fix for the white-box-on-dark-toolbar bug.
