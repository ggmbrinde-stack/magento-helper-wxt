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
// - Every top-level option becomes a button (operator request, 2026-10-22)
//   EXCEPT the four in SKIP_ACTIONS ("Assign / Unassign Inventory Source",
//   "Transfer Inventory To Source", "Regenerate Url" — dropped 2026-10-23;
//   they stay in Magento's dropdown, which is never touched), including the
//   ones that own a submenu ("Change status", "Change attribute
//   set"): those get a caret and their OWN menu anchored to the button
//   (operator request, 2026-10-23). The menu lists the submenu's items right
//   under the button and forwards a pick to Magento's original item, so the
//   native dropdown no longer has to be opened for them. The native dropdown
//   itself is still left exactly as Magento drew it (never hidden), as the
//   fallback for a submenu whose items we cannot read.
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
// and `popover()` from src/ui, one shared stylesheet, no colours written here.
// The old local sheet's `currentColor` rules became the page-adaptive
// primitives.
import { bar, button, ensureUi, popover } from '../ui';

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
 * A menu item is renderable only when it is not hidden by attribute or class.
 * Magento hides bulk actions with the `.hidden` class or `hidden` attribute on
 * the `<li>` itself; items inside a closed dropdown are not individually
 * `display: none` — the parent `<ul>` is. Checking `getComputedStyle` here
 * wrongly rejects every submenu item while the dropdown is closed, which
 * prevented submenus (e.g. "Change attribute set") from ever getting a custom
 * menu.
 */
function isRenderableLi(li: HTMLElement): boolean {
  if (li.hidden || li.classList.contains('hidden')) return false;
  return true;
}

interface MassItem {
  label: string;
  /** The native element to forward clicks to (menu item node). */
  el: HTMLElement;
  danger: boolean;
  /** True when this item opens a submenu instead of acting directly. */
  submenu: boolean;
  /** The submenu list itself, when Magento rendered one. */
  sub: HTMLElement | null;
}

/** Magento's wrap reports the open state on the trigger (aria-expanded) or on
 *  the wrapper (`_active`); a submenu only expands inside an open dropdown. */
function dropdownIsOpen(trigger: HTMLElement): boolean {
  if (trigger.getAttribute('aria-expanded') === 'true') return true;
  const wrap = trigger.closest<HTMLElement>(
    '.admin__action-dropdown-wrap, .action-select-wrap',
  );
  return Boolean(wrap?.classList.contains('_active'));
}

/** The close function of the menu currently open, so another one closes it. */
let openSubmenu: (() => void) | null = null;

/**
 * Draw a submenu as a menu anchored to its own button, instead of opening
 * Magento's dropdown (operator request, 2026-10-23).
 *
 * Only the surface is ours: every item forwards its click to Magento's own
 * submenu element, so the massaction selection check, confirmation modals, KO
 * handlers and ACL filtering keep running exactly as they did from the native
 * menu. The native dropdown is never opened for this pick and is left
 * untouched (still visible) as the fallback for unreadable submenus.
 *
 * The menu is fixed-positioned from the button's rect, appended to the strip
 * so a grid reload that redraws the strip takes it along, and closed by a
 * click outside, Escape, scroll/resize or opening another submenu.
 */
function attachSubmenuMenu(
  btn: HTMLButtonElement,
  options: SubmenuOption[],
  host: HTMLElement,
  name: string,
): void {
  const menu = popover(
    options.map((option) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mhx-pop-item';
      item.setAttribute('role', 'menuitem');
      item.textContent = option.label;
      if (option.danger) item.dataset['variant'] = 'danger';
      item.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        // Magento's own item: its handler, modal and ACL check all run.
        option.el.click();
      });
      return item;
    }),
    { label: name },
  );
  menu.classList.add('mhx-pop--menu');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  host.appendChild(menu);

  let open = false;

  function place(): void {
    // Measure with the surface in the viewport, at a known origin.
    menu.style.left = '0px';
    menu.style.top = '0px';
    const anchor = btn.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    let left = anchor.left;
    if (left + box.width > window.innerWidth - 8) {
      left = Math.max(8, anchor.right - box.width);
    }
    let top = anchor.bottom + 4;
    if (top + box.height > window.innerHeight - 8) {
      const above = anchor.top - box.height - 4;
      if (above >= 8) top = above;
    }
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeMenu(): void {
    if (!open) return;
    open = false;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onViewport, true);
    window.removeEventListener('resize', onViewport);
    if (openSubmenu === closeMenu) openSubmenu = null;
  }

  function onOutside(event: Event): void {
    const target = event.target;
    if (
      target instanceof Node &&
      (menu.contains(target) || btn.contains(target))
    ) {
      return;
    }
    closeMenu();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeMenu();
    btn.focus();
  }

  function onViewport(): void {
    closeMenu();
  }

  function openMenu(focusFirst: boolean): void {
    if (openSubmenu) openSubmenu();
    open = true;
    menu.hidden = false;
    place();
    btn.setAttribute('aria-expanded', 'true');
    // Keyboard open (detail 0): land on the first item instead of leaving
    // focus behind on the button, out of the menu's tab order.
    if (focusFirst) menu.querySelector<HTMLElement>('.mhx-pop-item')?.focus();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onViewport, true);
    window.addEventListener('resize', onViewport);
    openSubmenu = closeMenu;
  }

  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    // The massaction widget binds on the menu; ours must not re-trigger its
    // dropdown toggling - only this menu.
    event.stopPropagation();
    if (open) closeMenu();
    else openMenu(event.detail === 0);
  });
}

function fold(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

const DANGER_RE = /delete|remove|deactivat/i;

/**
 * Bulk actions the strip must NOT turn into buttons (operator request,
 * 2026-10-23: these four are never run from here). Matched on the folded
 * caption, so casing and spacing do not matter. The items are left in
 * Magento's own dropdown, which is untouched, so they stay reachable.
 */
const SKIP_ACTIONS = new Set([
  'assign inventory source',
  'unassign inventory source',
  'transfer inventory to source',
  'regenerate url',
]);

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
  // Magento marks an unavailable action on the <li> (`_disabled`), whether or
  // not it also ships an anchor/span inside it.
  if (li.classList.contains('_disabled') || li.classList.contains('disabled')) {
    return null;
  }
  return node;
}



function submenuOf(li: HTMLElement): HTMLElement | null {
  const sub = li.querySelector<HTMLElement>(':scope > ul');
  return sub && sub.querySelector(':scope > li') ? sub : null;
}

interface SubmenuOption {
  label: string;
  /** Magento's own item, the only thing we ever click. */
  el: HTMLElement;
  danger: boolean;
}

/** Direct items of one submenu, under the same visibility rules as the bar. */
function submenuOptions(sub: HTMLElement): SubmenuOption[] {
  const out: SubmenuOption[] = [];
  sub.querySelectorAll<HTMLElement>(':scope > li').forEach((li) => {
    if (!isRenderableLi(li)) return;
    const el = actionable(li);
    if (!el) return;
    const label = captionOf(li, el);
    if (!label) return;
    out.push({ label, el, danger: DANGER_RE.test(label) });
  });
  return out;
}

/** The item's own caption. For a submenu parent whose element IS the <li>, the
 *  nested list must not leak into the label ("Change status" — never
 *  "Change status Enable Disable"). */
function captionOf(li: HTMLElement, el: HTMLElement): string {
  if (el !== li) return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const own = Array.from(li.childNodes)
    .filter((node) => !(node instanceof HTMLElement && node.tagName === 'UL'))
    .map((node) => node.textContent ?? '')
    .join(' ');
  return own.replace(/\s+/g, ' ').trim();
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

/**
 * Draw the toolbar's bulk actions as inline buttons beside the (kept) native
 * dropdown. Returns how many roots were newly enhanced (idempotent per root).
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

    menu.querySelectorAll<HTMLElement>(':scope > li').forEach((li) => {
      if (!isRenderableLi(li)) return;
      const el = actionable(li);
      if (!el) return;
      // A submenu parent's own text is just its title; the children stay in
      // Magento's menu (we cannot invent their labels safely, and the menu
      // stays visible for them).
      const label = captionOf(li, el);
      if (!label) return;
      if (SKIP_ACTIONS.has(fold(label))) return;
      const sub = submenuOf(li);
      leaves.push({
        label,
        el,
        danger: DANGER_RE.test(label),
        submenu: Boolean(sub),
        sub,
      });
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

    const trigger = root.querySelector<HTMLElement>(
      '[data-toggle="dropdown"], .admin__actions-dropdown, .admin__action-dropdown, .action-select',
    );

    const strip = bar([], 'Bulk actions');
    for (const leaf of leaves) {
      // A submenu we can read becomes a menu owned by its button; an empty or
      // unreadable one keeps Magento's dropdown reachable (`attachSubmenuMenu`
      // is only called with at least one option).
      const options = leaf.sub ? submenuOptions(leaf.sub) : [];
      const ownsMenu = options.length > 0;

      const btn = button({
        label: leaf.submenu ? `${leaf.label} ▾` : leaf.label,
        title: ownsMenu
          ? `${leaf.label} — opens its options below this button`
          : leaf.submenu
            ? `${leaf.label} — opens its submenu in the Actions menu`
            : leaf.label,
        variant: leaf.danger ? 'danger' : 'default',
        onClick: ownsMenu
          ? undefined
          : (event) => {
              event.preventDefault();
              // The massaction widget binds on the menu; ours must not
              // re-trigger its dropdown toggling — only the item's handler.
              event.stopPropagation();
              if (leaf.submenu) {
                // Unreadable submenu: Magento's submenu only expands inside
                // its open dropdown, so open its trigger first, then forward
                // the pick in the same task.
                if (trigger && !dropdownIsOpen(trigger)) trigger.click();
              }
              leaf.el.click();
            },
      });

      if (ownsMenu) attachSubmenuMenu(btn, options, strip, leaf.label);
      else if (leaf.submenu) btn.setAttribute('aria-haspopup', 'true');
      strip.appendChild(btn);
    }
    strip.id = `mhx-mass-strip-${(stripSeq += 1)}`;

    // OUTSIDE the dropdown (operator request, 2026-10-21): the strip becomes
    // its own row above the grid. Inserted inside the dropdown wrap it took
    // the trigger's width and stacked two buttons per line, half covering the
    // menu; here it gets the full row. Magento's own wrap is never restyled —
    // only the strip's host changes.
    const host = stripHost(root);
    if (host) host.parent.insertBefore(strip, host.before);
    else root.insertAdjacentElement('afterend', strip);

    // The native dropdown is still left visible and untouched (operator
    // request, 2026-10-22): submenu buttons now own their menus, but the
    // stock menu remains the fallback for a submenu we cannot read, and
    // nothing Magento renders is hidden or restyled.

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
