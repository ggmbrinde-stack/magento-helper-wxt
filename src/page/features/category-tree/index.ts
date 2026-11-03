// The Categories checkbox tree on the mass "Update Attributes" page
// (Categories tab, "Add Product To Categories").
//
// Same logic as the other page-UI replacements (rowActions, pagingSizes):
// detect the DOM shape, wire toggles, mark processed nodes, stay idempotent
// for the debounced re-scan. No hard URL gate and no heading-tag or
// checkbox-name assumptions — exact-route gating already missed the real
// route once (product_action_attribute, no trailing slash), and the live DOM
// shows the tree is a plain nested ul/li checkbox list.
//
// What the operator gets, all display-only except the checkbox clicks they
// make themselves:
// - Number badges. Every category carries the code from the Notion index
//   ("1", "1.2.3") so the admin matches the sheet the operator works from
//   (`categoryIndex.ts`).
// - Tree | List view toggle. The flat list is depth-indented and drives the
//   SAME checkboxes by forwarding clicks.
// - "Selected only" filter, and a Selected panel that shows the chosen
//   categories as an indented tree (unchecked parents kept as grey context),
//   (click a pill to remove it), so the selection is visible at a glance
//   instead of being buried in a 200-row tree.
// - Search filter ("Filter categories…", accent-insensitive, narrows matches
//   and keeps their ancestor path on screen).
// - Collapse all / Expand all (tree view).
// - "Tick Linha Natura": one click ticks the LINHA NATURA counterpart of
//   every category the operator has already ticked (same parent list), so a
//   multi-category pick does not need a second pass down the tree.
// - The chosen view, filter text and "Selected only" survive navigation and
//   reloads (localStorage, per browser).
//
// How it stays safe:
// - Display-only: flips `display` of lists/items and inserts spans/buttons.
//   The operator's own checkbox clicks are the only writers, forwarded
//   through Magento's own boxes + a native `change` — the reverse cascade
//   and the locked root below click those same boxes, so the Selected panel, list view
//   and form state stay in sync. No request is made and nothing is saved.
// - Idempotent: processed nodes/trees are marked, so the content script's
//   debounced re-scan and AJAX reloads cannot stack duplicate controls.
// - Colours come from the toolkit's page layer (`--mhx-pg-*`), never from the
//   extension palette: this is page chrome, so it follows whatever the admin is
//   — light, our own dark theme, or Magento's own — and `check-ui.mjs` G6 fails
//   the build if a palette token creeps back in.

import { categoryCode } from './categoryIndex';
import { button, segmented, badge } from '../../../ui';

const TREE_MARK = 'data-mhx-cat-tree';
const NODE_MARK = 'data-mhx-cat-node';
const COLLAPSED = 'data-mhx-collapsed';
const TOGGLE_CLASS = 'mhx-cat-toggle';
/** Empty box that holds a toggle's place on rows that have no children. */
const SLOT_CLASS = 'mhx-cat-slot';
const STYLE_ID = 'mhx-cat-tree-styles';
const SHELL_CLASS = 'mhx-cat-shell';
/** Tree + Selected panel side by side. */
const MAIN_CLASS = 'mhx-cat-main';
const BAR_CLASS = 'mhx-cat-tree-bar';
const SEARCH_CLASS = 'mhx-cat-search';
const COUNT_CLASS = 'mhx-cat-tree-count';
const NO_CLASS = 'mhx-cat-no';
const PILLS_CLASS = 'mhx-cat-pills';
const PILL_NO_CLASS = 'mhx-cat-pill-no';
const SEL_LIST_CLASS = 'mhx-cat-sel';
const SEL_ROW_CLASS = 'mhx-cat-sel-row';
const SEL_CONTEXT_CLASS = 'mhx-cat-sel-row--context';
const SEL_NAME_CLASS = 'mhx-cat-sel-name';
const SEL_X_CLASS = 'mhx-cat-sel-x';

/* --- Tree | List view toggle ---------------------------------------------- */
// The flat "List" view never owns form fields: every row forwards its click
// to the tree's real checkbox (the enhanceSelect contract — the native
// control stays the source of truth, so values, handlers and Save are safe).
const LIST_CLASS = 'mhx-cat-list';
const ROW_CLASS = 'mhx-cat-row';
const BOX_CLASS = 'mhx-cat-row-box';
const BOX_CHECKED_CLASS = 'mhx-cat-row--checked';
const ONLY_CLASS = 'mhx-cat-only';
const NATURA_CLASS = 'mhx-cat-natura';
const UNTICK_CLASS = 'mhx-cat-untick';

/** The counterpart category this action adds, accent/case-insensitive. */
const NATURA_NAME = 'linha natura';

/** View preferences survive navigation; one admin origin, one set. */
const PREFS_KEY = 'mhx.catTree.prefs.v1';

type TreeMode = 'tree' | 'list';

interface TreePrefs {
  mode: TreeMode;
  query: string;
  selectedOnly: boolean;
}

const DEFAULT_PREFS: TreePrefs = { mode: 'tree', query: '', selectedOnly: false };

function readPrefs(): TreePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<TreePrefs>;
    return {
      mode: parsed.mode === 'list' ? 'list' : 'tree',
      query: typeof parsed.query === 'string' ? parsed.query : '',
      selectedOnly: parsed.selectedOnly === true,
    };
  } catch {
    // Storage blocked or corrupt: fall back to the stock view silently.
    return { ...DEFAULT_PREFS };
  }
}

function writePrefs(state: TreeState): void {
  const prefs: TreePrefs = {
    mode: state.mode,
    query: state.ui?.search.value ?? '',
    selectedOnly: state.selectedOnly,
  };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience, never a requirement.
  }
}

interface FlatRow {
  row: HTMLLIElement;
  box: HTMLSpanElement;
  real: HTMLInputElement;
  name: string;
  code: string;
}

interface TreeUi {
  shell: HTMLDivElement;
  bar: HTMLDivElement;
  pills: HTMLDivElement;
  counter: HTMLSpanElement;
  search: HTMLInputElement;
  only: HTMLButtonElement;
}

interface TreeState {
  mode: TreeMode;
  selectedOnly: boolean;
  list: HTMLUListElement | null;
  rows: FlatRow[];
  ui: TreeUi | null;
  /** Last rendered pill set, so a re-scan cannot rebuild it into a loop. */
  pillSig: string;
}

const treeStates = new WeakMap<Element, TreeState>();

/**
 * Re-entrancy guard: cascade ticks dispatch `change`, which re-enters the
 * tree's delegated listener. Without this, Phase 1 unticking N descendants
 * fires N nested cascades, each re-walking the same subtree (O(n²) on a
 * 606-box tree) and — worse — Phase 2 of a nested call can untick an
 * ancestor the outer call still needs. While set, the listener skips its own
 * cascade entry and only refreshes pills/filters.
 */
let cascading = false;

/**
 * Magento renders this tree as SIBLINGS, not nested children (live DOM,
 * probe v3): each branch item is an li followed by its child list as the
 * NEXT SIBLING ul — never a child ul. Leaf items are followed by an empty
 * `<ul></ul>`. That is why `li ul` selectors found zero branches.
 *
 *   <ul>
 *     <li><input class="category-checkbox">Default Category</li>
 *     <ul>                          <!-- children of the li above -->
 *       <li>…Têxtil Promocional…</li>
 *       <ul> … </ul>
 *       <li>…leaf…</li>
 *       <ul></ul>                   <!-- empty: leaf, nothing to collapse -->
 */
const TREE_BOX_SELECTOR =
  'input.category-checkbox, input[name="add_category_ids[]"]';

/** Nearest section text around a candidate tree (fieldset / tab panel). */
function sectionText(el: Element): string {
  const section =
    el.closest(
      'fieldset, .fieldset-wrapper, .ui-tabs-panel, form, .entry-edit',
    ) ?? el.parentElement;
  return section?.textContent ?? '';
}

/** The mass-attributes categories context (tab heading text or route). */
function hasCategoryContext(el: Element): boolean {
  if (/add product to categor/i.test(sectionText(el))) return true;
  return /\/catalog\/product_action/.test(location.href);
}

/**
 * The child list of one branch item: its next-sibling ul, when that ul
 * actually holds items (empty `<ul></ul>` markers on leaves are skipped).
 */
function childListOf(li: HTMLLIElement): HTMLUListElement | null {
  const next = li.nextElementSibling;
  if (
    next instanceof HTMLUListElement &&
    next.querySelector(':scope > li') !== null
  ) {
    return next;
  }
  return null;
}

/** Direct li children of a sibling child list. */
function childItems(list: HTMLUListElement): HTMLLIElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLLIElement => child instanceof HTMLLIElement,
  );
}

/** Branch items: li elements owning a non-empty next-sibling child list. */
function branchNodesIn(tree: Element): HTMLLIElement[] {
  const out: HTMLLIElement[] = [];
  tree.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
    if (childListOf(li)) out.push(li);
  });
  return out;
}

/**
 * The tree's root item — the first li of the root list ("Default Category"
 * here). It stays open at all times and gets NO toggle: with no toggle it
 * could never be re-opened, so collapsing it would strand the operator.
 */
function rootItemOf(tree: Element): HTMLLIElement | null {
  const first = Array.from(tree.children).find(
    (child): child is HTMLLIElement => child instanceof HTMLLIElement,
  );
  return first ?? null;
}

/**
 * The branch item owning the list an li sits in (null at the tree root).
 * Parents are found through the sibling structure: list -> previous li.
 */
function parentBranchItem(li: HTMLLIElement): HTMLLIElement | null {
  const list = li.parentElement;
  if (!(list instanceof HTMLUListElement)) return null;
  const owner = list.previousElementSibling;
  return owner instanceof HTMLLIElement ? owner : null;
}

/**
 * A category tree: a list holding several category checkboxes with at least
 * one sibling-structured branch, inside the mass-attributes categories
 * context. The checkbox selector comes from the live DOM (probe v3):
 * `input.category-checkbox` / `input[name="add_category_ids[]"]`.
 */
function isCategoryTree(ul: Element): boolean {
  if (ul.querySelectorAll(TREE_BOX_SELECTOR).length < 3) return false;
  if (branchNodesIn(ul).length === 0) return false;
  return hasCategoryContext(ul);
}

/** Topmost category trees; trees nested inside another tree are dropped. */
function findCategoryTrees(): Element[] {
  const candidates = Array.from(document.querySelectorAll<Element>('ul')).filter(
    isCategoryTree,
  );
  return candidates.filter(
    (ul) => !candidates.some((other) => other !== ul && other.contains(ul)),
  );
}

/** True when the branch's child list is currently hidden. */
function branchHidden(node: HTMLLIElement): boolean {
  if (node.hasAttribute(COLLAPSED)) return true;
  const list = childListOf(node);
  if (!list) return true;
  const style = window.getComputedStyle(list);
  return style.display === 'none' || list.hidden;
}

function paintToggle(node: HTMLLIElement, collapsed: boolean): void {
  const toggle = node.querySelector<HTMLElement>(`:scope > .${TOGGLE_CLASS}`);
  if (!toggle) return;
  toggle.textContent = collapsed ? '▸' : '▾';
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  toggle.title = collapsed ? 'Expand' : 'Collapse';
}

function setCollapsed(node: HTMLLIElement, collapsed: boolean): void {
  const list = childListOf(node);
  if (!list) return;
  if (collapsed) node.setAttribute(COLLAPSED, '1');
  else node.removeAttribute(COLLAPSED);
  list.style.setProperty('display', collapsed ? 'none' : '', 'important');
  paintToggle(node, collapsed);
}

function isCollapsed(node: HTMLLIElement): boolean {
  return branchHidden(node);
}

function addToggle(node: HTMLLIElement): void {
  if (node.getAttribute(NODE_MARK) === '1') return;
  if (!childListOf(node)) {
    node.setAttribute(NODE_MARK, '1');
    return;
  }
  const toggle = button({ label: '▾', title: 'Collapse', variant: 'icon', className: TOGGLE_CLASS });
  toggle.setAttribute('aria-expanded', 'true');
  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setCollapsed(node, !isCollapsed(node));
  });
  node.insertBefore(toggle, node.firstChild);
  node.setAttribute(NODE_MARK, '1');
}

/**
 * Give every row the same left gutter.
 *
 * Only branches carry a toggle, so a leaf's checkbox started ~38px to the LEFT
 * of its parent's — the sub-subcategory boxes read as a separate, shallower
 * tree (the operator's complaint: "move checkboxes more to the right, the
 * sub-sub categorie"). A branch keeps its toggle; a leaf gets an empty slot of
 * the same width, which is what makes the boxes line up in one column per
 * depth instead of drifting.
 */
function addToggleSlot(li: HTMLLIElement): void {
  if (li.querySelector(`:scope > .${TOGGLE_CLASS}, :scope > .${SLOT_CLASS}`)) return;
  const slot = document.createElement('span');
  slot.className = SLOT_CLASS;
  slot.setAttribute('aria-hidden', 'true');
  li.insertBefore(slot, li.firstChild);
}

/* --- Labels, numbers, ancestors ------------------------------------------- */

/**
 * The category name of one item, excluding our own controls and nested lists.
 * The number badge is stripped too, otherwise "1.2.3" would leak into the
 * search text and into the number lookup itself.
 */
function itemLabel(li: HTMLLIElement): string {
  const label = li.querySelector(':scope > label');
  if (label?.textContent) return label.textContent.trim();
  const clone = li.cloneNode(true) as HTMLLIElement;
  clone
    .querySelectorAll(`ul, ol, button, .${NO_CLASS}, .${SEL_ROW_CLASS}`)
    .forEach((n) => n.remove());
  return (clone.textContent ?? '').trim();
}

/** Ancestor category names of one item, root first. */
function ancestorNames(li: HTMLLIElement): string[] {
  const names: string[] = [];
  let node = parentBranchItem(li);
  while (node) {
    names.unshift(itemLabel(node));
    node = parentBranchItem(node);
  }
  return names;
}

/**
 * Categories the index cannot number, keyed by their full path. Collected so
 * one console line can list them: "some categories have no number" is
 * otherwise invisible (a missing badge looks like a category that never had
 * one), and the fix belongs in the index, not in a guess on the page.
 */
const UNRESOLVED = new Set<string>();
const badgeStats = { numbered: 0, total: 0 };
let lastCoverage = '';

/**
 * One console line per selection of the tree, in both directions: "all
 * numbered" is the confirmation, a gap count is the work list. Logged once per
 * distinct count so the debounced scan cannot spam the console.
 */
function logBadgeCoverage(): void {
  const { numbered, total } = badgeStats;
  if (total === 0) return;
  const summary = `${numbered}/${total}`;
  if (summary === lastCoverage) return;
  lastCoverage = summary;
  if (numbered === total) {
    // eslint-disable-next-line no-console
    console.info(`[category-tree] ${summary} categories numbered — no gaps.`);
    return;
  }
  // eslint-disable-next-line no-console
  console.info(
    `[category-tree] ${summary} categories numbered — ${total - numbered} without a Notion index code. ` +
      'Copy the list below to extend categoryIndex.ts:',
    Array.from(UNRESOLVED).sort(),
  );
}

/** The index number for one tree item, or null when it cannot be resolved. */
function codeOf(li: HTMLLIElement, report = true): string | null {
  const cached = li.dataset['mhxCatNo'];
  if (cached) return cached;
  const name = itemLabel(li);
  if (!name) return null;
  const ancestors = ancestorNames(li);
  // The parent's own code disambiguates a leaf whose branch the admin spells
  // differently from the index (see pickByParent in categoryIndex.ts).
  const parent = parentBranchItem(li);
  const parentCode = parent ? codeOf(parent, false) : null;
  const code = categoryCode(name, ancestors, parentCode);
  if (code) {
    li.dataset['mhxCatNo'] = code;
    return code;
  }
  // Only real categories are worth reporting; the store root has no index row.
  if (report) UNRESOLVED.add([...ancestors, name].join(' > '));
  return null;
}

/**
 * Insert the number badge once, right before the item's own label, so it reads
 * as a prefix of the category name instead of a separate ornament.
 */
function depthOf(li: HTMLLIElement): number {
  let depth = 0;
  let ancestor = parentBranchItem(li);
  while (ancestor) {
    depth += 1;
    ancestor = parentBranchItem(ancestor);
  }
  return depth;
}

/** Extra left pad per nesting level, in px. */
const INDENT_STEP = 18;

/**
 * Push each nesting level further right than Magento's own indent does.
 *
 * The native tree adds only a few pixels per level, so a leaf at 4.8.6 sat almost
 * flush with its section and the numbers were hard to read as a hierarchy. The
 * pad is set on the item itself, so nested lists accumulate it (each level is one
 * step further right) and the operator's own drag/drop is untouched. Idempotent:
 * the debounced scan can run it as often as it likes.
 */
function indentItem(li: HTMLLIElement): void {
  const depth = depthOf(li);
  // One step per level, measured from the item's own list: Magento puts a
  // branch's child list in the SAME ul as the branch, so the step cannot come
  // from the nesting — the item pad is the only thing that separates levels.
  li.style.setProperty('padding-left', `${depth * INDENT_STEP}px`);
}
function addCodeBadge(li: HTMLLIElement): void {
  if (li.querySelector(`:scope > .${NO_CLASS}`)) return;
  const code = codeOf(li);
  if (!code) return;
  const badgeEl = badge(code, { title: `Category ${code} (Notion index)` });
  badgeEl.classList.add(NO_CLASS);
  const label = li.querySelector(':scope > label');
  if (label) {
    label.before(badgeEl);
    return;
  }
  const box = li.querySelector(TREE_BOX_SELECTOR);
  if (box) box.after(badgeEl);
  else li.insertBefore(badgeEl, li.firstChild);
}

/* --- Collapse / expand ---------------------------------------------------- */

/** Open every branch between an item and the root, so it is reachable. */
function revealBranchOf(li: HTMLLIElement): void {
  let node = parentBranchItem(li);
  while (node) {
    if (childListOf(node)) setCollapsed(node, false);
    node = parentBranchItem(node);
  }
}

/**
 * Expand ancestor branches of checked boxes, so selections stay visible.
 * The `:checked` filter is applied per element with matches() — appending
 * it to the comma-joined TREE_BOX_SELECTOR only qualifies the LAST part,
 * which matched every box and re-expanded the whole tree right after each
 * collapse (that is what made "Collapse all" look dead).
 */
function revealChecked(tree: Element): void {
  tree
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')
    .forEach((box) => {
      if (!box.matches(TREE_BOX_SELECTOR)) return;
      const node = box.closest<HTMLLIElement>('li');
      if (node) revealBranchOf(node);
    });
}

/**
 * Collapse every branch EXCEPT the root item ("Default Category"): it is
 * always open and carries no toggle, so collapsing it would strand the
 * operator with no way back.
 */
function collapseTree(tree: Element): void {
  const root = rootItemOf(tree);
  for (const node of branchNodesIn(tree)) {
    if (node === root) continue;
    setCollapsed(node, true);
  }
}

function expandTree(tree: Element): void {
  for (const node of branchNodesIn(tree)) setCollapsed(node, false);
}

/* --- Filtering ------------------------------------------------------------ */

/**
 * Search filter (same idea as the searchable picker in enhanceSelect.ts,
 * adapted to a checkbox tree): type in the bar's search box and the tree
 * narrows to matching categories plus their ancestor branches, which are
 * auto-expanded so every match is reachable. Clearing restores the default
 * collapsed state. Matching is accent-insensitive ("textil" finds "Têxtil")
 * and also matches the index number ("1.1").
 * Display-only: only li visibility flips — checkboxes, values, handlers and
 * Save are untouched, and hidden checkboxes still submit with the form.
 */
function normalizeFilterText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function setLiVisible(li: HTMLLIElement, visible: boolean): void {
  if (visible) li.style.removeProperty('display');
  else li.style.setProperty('display', 'none', 'important');
}

/**
 * Flat "List" view: every category as one row (depth-indented), built ONCE
 * per tree. Rows own no form fields — clicking a row (or its box) forwards
 * to the tree's real checkbox via .click(), so Magento's own change
 * handling runs and the form state stays exactly what Save would expect.
 * Checked state is mirrored from the real input on every change.
 */
function buildFlatList(tree: Element, state: TreeState): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = LIST_CLASS;

  // The locked root ("Default Category") gets no List row: it is always on
  // and its box is disabled, so a row would only confuse (click = no-op).
  const root = rootItemOf(tree);
  for (const li of Array.from(tree.querySelectorAll<HTMLLIElement>('li'))) {
    if (root && li === root) continue;
    const real = li.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (!real) continue;
    const label = itemLabel(li);
    if (!label) continue;
    const code = codeOf(li) ?? '';

    // Depth = number of ancestor branches, for indentation.
    let depth = 0;
    let ancestor = parentBranchItem(li);
    while (ancestor) {
      depth += 1;
      ancestor = parentBranchItem(ancestor);
    }

    const row = document.createElement('li');
    row.className = ROW_CLASS;
    row.style.setProperty('padding-left', `${8 + depth * 16}px`);
    row.tabIndex = 0;
    row.setAttribute('role', 'checkbox');

    const box = document.createElement('span');
    box.className = BOX_CLASS;
    row.appendChild(box);

    if (code) {
      const badgeEl = badge(code, { title: `Category ${code} (Notion index)` });
      badgeEl.classList.add(NO_CLASS, PILL_NO_CLASS);
      row.appendChild(badgeEl);
    }

    const name = document.createElement('span');
    name.className = 'mhx-cat-row-label';
    name.textContent = label;
    row.appendChild(name);

    const sync = (): void => {
      row.classList.toggle(BOX_CHECKED_CLASS, real.checked);
      row.setAttribute('aria-checked', String(real.checked));
    };
    const toggle = (): void => {
      // Forward to the real checkbox — the only writer of form state.
      real.click();
      sync();
    };
    row.addEventListener('click', (e) => {
      e.preventDefault();
      toggle();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    // The tree checkbox can change from the tree view, Magento, or the
    // operator — keep the row mirror in step either way.
    real.addEventListener('change', sync);
    sync();

    list.appendChild(row);
    state.rows.push({ row, box, real, name: label, code });
  }
  return list;
}

/** Flat-view filter: substring over the row name and its number. */
function applyListFilter(tree: Element): void {
  const state = treeStates.get(tree);
  const ui = state?.ui;
  if (!state || !ui) return;
  const needle = normalizeFilterText(ui.search.value.trim());
  let shown = 0;
  for (const row of state.rows) {
    const label = normalizeFilterText(row.name);
    const matchesNeedle =
      needle === '' ||
      label.includes(needle) ||
      row.code.toLowerCase().includes(needle);
    const show = matchesNeedle && (!state.selectedOnly || row.real.checked);
    row.row.style.setProperty('display', show ? '' : 'none', 'important');
    if (show) shown += 1;
  }
  ui.counter.textContent =
    needle === '' && !state.selectedOnly ? '' : `${shown} shown`;
}

/** Switch a tree between the collapsible "Tree" and flat "List" views. */
function setTreeMode(tree: Element, mode: TreeMode): void {
  const state = treeStates.get(tree);
  const ui = state?.ui;
  if (!state || !ui || state.mode === mode) return;
  state.mode = mode;

  ui.bar.querySelectorAll<HTMLButtonElement>('.mhx-seg-btn').forEach((b) => {
    const active = b.dataset['value'] === mode;
    b.classList.toggle('mhx-seg-btn--active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  // Collapse/Expand only mean something in tree view.
  ui.bar.querySelectorAll<HTMLButtonElement>('.mhx-cat-tree-btn').forEach((b) => {
    b.style.setProperty('display', mode === 'tree' ? '' : 'none', 'important');
  });
  const treeEl = tree as HTMLElement;
  if (mode === 'list') {
    if (!state.list) {
      state.list = buildFlatList(tree, state);
      if (tree.parentElement) {
        tree.parentElement.insertBefore(state.list, tree);
      }
    }
    treeEl.style.setProperty('display', 'none', 'important');
    state.list.style.removeProperty('display');
    applyListFilter(tree);
  } else {
    state.list?.style.setProperty('display', 'none', 'important');
    treeEl.style.removeProperty('display');
    // Re-run the tree filter so the current search still applies.
    applyTreeFilter(tree);
  }
  writePrefs(state);
}

function applyTreeFilter(tree: Element): void {
  const state = treeStates.get(tree);
  const ui = state?.ui;
  if (!state || !ui) return;
  // Active view decides which surface the search narrows.
  if (state.mode === 'list') {
    applyListFilter(tree);
    return;
  }

  const needle = normalizeFilterText(ui.search.value.trim());
  const onlySelected = state.selectedOnly;

  if (needle === '' && !onlySelected) {
    // Restore the default view: root open, rest collapsed, checked revealed.
    for (const li of Array.from(tree.querySelectorAll<HTMLLIElement>('li'))) {
      setLiVisible(li, true);
    }
    const root = rootItemOf(tree);
    if (root) setCollapsed(root, false);
    collapseTree(tree);
    revealChecked(tree);
    ui.counter.textContent = '';
    return;
  }

  // Bottom-up pass (reverse document order = children before parents):
  // an item survives the search when its own label/number matches OR any
  // child item matches, so every match keeps its full ancestor path on
  // screen. The same pass records whether a subtree holds a checked item,
  // which is what "Selected only" needs.
  const items = Array.from(tree.querySelectorAll<HTMLLIElement>('li'));
  const visible = new Map<HTMLLIElement, boolean>();
  const hasChecked = new Map<HTMLLIElement, boolean>();
  let matches = 0;

  for (let i = items.length - 1; i >= 0; i -= 1) {
    const li = items[i];
    if (!li) continue;
    const list = childListOf(li);
    const kids = list ? childItems(list) : [];
    const real = li.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);

    hasChecked.set(
      li,
      real?.checked === true || kids.some((kid) => hasChecked.get(kid) === true),
    );

    if (needle === '') {
      visible.set(li, true);
      continue;
    }

    const label = normalizeFilterText(itemLabel(li));
    const code = (li.dataset['mhxCatNo'] ?? '').toLowerCase();
    const self = label.includes(needle) || code.includes(needle);
    if (self) matches += 1;
    visible.set(
      li,
      self || kids.some((kid) => visible.get(kid) === true),
    );
  }

  const root = rootItemOf(tree);
  for (const li of items) {
    const matchesFilter = visible.get(li) === true;
    const matchesSelection = hasChecked.get(li) === true;
    const show =
      (matchesFilter && (!onlySelected || matchesSelection)) || li === root;
    setLiVisible(li, show);
    // Reveal matches by forcing their ancestor branches open.
    if (show && li !== root && childListOf(li)) setCollapsed(li, false);
  }

  ui.counter.textContent =
    needle === ''
      ? ''
      : `${matches} ${matches === 1 ? 'match' : 'matches'}`;
}

/* --- Selected tree -------------------------------------------------------- */

interface SelectionNode {
  real: HTMLInputElement;
  name: string;
  code: string;
  selected: boolean;
  depth: number;
}

/**
 * The rows the strip has to show, in document (tree) order: every checked
 * category plus the unchecked ancestors above it.
 *
 * Those ancestors are the point. A flat chip list said *which* categories were
 * checked but not *where they live*, so "T-shirts Manga Comprida" and
 * "Sweatshirts com Fecho" read as unrelated names even though one is a leaf of
 * T-shirts and the other of Sweatshirts. Keeping the branch in the list —
 * indented, greyed and marked as not selected — makes the strip the family tree
 * the operator is building up. The root ("Default Category") is skipped: always
 * checked, no index row, nothing to explain.
 */
function selectionNodes(tree: Element): SelectionNode[] {
  const out: SelectionNode[] = [];
  const root = rootItemOf(tree);
  for (const li of Array.from(tree.querySelectorAll<HTMLLIElement>('li'))) {
    if (root && li === root) continue;
    const real = li.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (!real) continue;
    const name = itemLabel(li);
    if (!name) continue;
    const selected = real.checked;
    if (!selected) {
      const checkedBelow = Array.from(
        li.querySelectorAll<HTMLInputElement>(TREE_BOX_SELECTOR),
      ).some((box) => box.checked);
      if (!checkedBelow) continue;
    }
    out.push({ real, name, code: codeOf(li) ?? '', selected, depth: depthOf(li) });
  }
  return out;
}

/**
 * The Selected panel: the checked categories as an indented tree, with their
 * unchecked branch above them for context. Rebuilt from the real checkboxes, so
 * it is correct no matter who changed them (tree, list, Magento, or the
 * operator). Clicking a greyed row selects that branch too; ✕ on a chosen row
 * unchecks it — both go through the real box, so form state stays Magento's.
 */
function renderPills(tree: Element): void {
  const state = treeStates.get(tree);
  const ui = state?.ui;
  if (!state || !ui) return;

  const nodes = selectionNodes(tree);
  // Rebuilding on every debounced scan would itself be a childList mutation,
  // so the scan would schedule the next one forever. Only redraw when the
  // selection actually changed (or the strip was thrown away by a re-render).
  const sig = nodes
    .map((node) => `${node.selected ? '1' : '0'}${node.code}\u0001${node.name}`)
    .join('\u0002');
  if (sig === state.pillSig && ui.pills.childElementCount > 0) return;
  state.pillSig = sig;

  ui.pills.replaceChildren();

  const chosen = nodes.filter((node) => node.selected);
  const context = nodes.length - chosen.length;

  const head = document.createElement('div');
  head.className = 'mhx-cat-pills-head';
  const title = document.createElement('span');
  title.className = 'mhx-cat-pills-title';
  title.textContent = `Selected (${chosen.length})`;
  head.appendChild(title);
  if (context > 0) {
    const hint = document.createElement('span');
    hint.className = 'mhx-cat-pills-hint';
    hint.textContent = `+${context} parent ${context === 1 ? 'branch' : 'branches'} for context`;
    hint.title =
      'Grey rows are the branches above a selected category. Grey means not selected — click one to select it too.';
    head.appendChild(hint);
  }
  ui.pills.appendChild(head);

  if (chosen.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'mhx-cat-pills-empty';
    empty.textContent = 'No category selected';
    ui.pills.appendChild(empty);
    return;
  }

  const list = document.createElement('ul');
  list.className = SEL_LIST_CLASS;

  for (const node of nodes) {
    const row = document.createElement('li');
    row.className = `${SEL_ROW_CLASS}${node.selected ? '' : ` ${SEL_CONTEXT_CLASS}`}`;
    row.style.setProperty('padding-left', `${node.depth * 14}px`);
    row.title = node.selected
      ? `${node.name}${node.code ? ` (${node.code})` : ''} — selected`
      : `${node.name}${node.code ? ` (${node.code})` : ''} is NOT selected — click to select this branch too`;

    if (node.code) {
      const no = badge(node.code, { title: `Category ${node.code} (Notion index)` });
      no.classList.add(NO_CLASS, PILL_NO_CLASS);
      row.appendChild(no);
    }
    const label = document.createElement('span');
    label.className = SEL_NAME_CLASS;
    label.textContent = node.name;
    row.appendChild(label);

    if (node.selected) {
      const remove = button({
        label: '×',
        title: `Remove ${node.name}`,
        variant: 'icon',
        className: SEL_X_CLASS,
      });
      remove.setAttribute('aria-label', `Remove ${node.name}`);
      remove.addEventListener('click', () => node.real.click());
      row.appendChild(remove);
      list.appendChild(row);
      continue;
    }

    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    const selectBranch = (): void => node.real.click();
    row.addEventListener('click', selectBranch);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectBranch();
    });
    list.appendChild(row);
  }

  ui.pills.appendChild(list);
}

/* --- Toolbar -------------------------------------------------------------- */

function addToolbar(tree: Element): void {
  if (tree.getAttribute(TREE_MARK) === '1') return;
  tree.setAttribute(TREE_MARK, '1');

  const prefs = readPrefs();

  const state: TreeState = {
    mode: 'tree',
    selectedOnly: prefs.selectedOnly,
    list: null,
    rows: [],
    ui: null,
    pillSig: '',
  };
  treeStates.set(tree, state);

  const shell = document.createElement('div');
  shell.className = SHELL_CLASS;

  const bar = document.createElement('div');
  bar.className = BAR_CLASS;

  // Tree | List view toggle (segmented, same idiom as the select enhancer).
  const seg = segmented({
    label: 'Category view',
    options: [
      { label: 'Tree', value: 'tree' },
      { label: 'List', value: 'list' },
    ],
    active: prefs.mode,
    onPick: (value) => {
      if (value === 'tree' || value === 'list') setTreeMode(tree, value);
    },
  });

  // Search box, same idea as the searchable picker: instant narrowing as
  // you type. Enter must never submit the mass-attributes form.
  const search = document.createElement('input');
  search.type = 'search';
  search.className = SEARCH_CLASS;
  search.placeholder = 'Filter categories…';
  search.setAttribute('aria-label', 'Filter categories');
  search.value = prefs.query;

  const counter = document.createElement('span');
  counter.className = COUNT_CLASS;

  // "Selected only": hide everything that is not checked, in either view.
  const only = button({
    label: 'Selected only',
    variant: prefs.selectedOnly ? 'accent' : 'default',
    className: ONLY_CLASS,
  });
  only.setAttribute('aria-pressed', String(prefs.selectedOnly));

  // "Tick Linha Natura": ticks the LINHA NATURA counterpart of every
  // category that is already ticked, in the same parent list (see
  // `tickLinhaNatura`). An action, not a filter - nothing is hidden and no
  // category is ever unticked, so a mistaken press costs a few extra ticks.
  const naturaBtn = button({
    label: 'Tick Linha Natura',
    title: 'Also tick LINHA NATURA for every sub-subcategory that is checked',
    variant: 'accent',
    className: NATURA_CLASS,
  });
  let naturaResetTimer: ReturnType<typeof setTimeout> | undefined;
  naturaBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const ticked = tickLinhaNatura(tree);
    // Feedback on the button itself, so it cannot clobber the match counter.
    naturaBtn.textContent = ticked > 0 ? `Ticked ${ticked}` : 'Nothing to tick';
    clearTimeout(naturaResetTimer);
    naturaResetTimer = setTimeout(() => {
      naturaBtn.textContent = 'Tick Linha Natura';
    }, 1800);
  });

  // "Untick all": clears the selection in one click. Every box goes through
  // Magento's own checkbox + a native `change`, and the locked root
  // ("Default Category") is never touched — it must stay checked or Save would
  // store a category set with no root.
  const untickBtn = button({
    label: 'Untick all',
    title: 'Uncheck every selected category (Default Category stays checked)',
    variant: 'ghost',
    className: UNTICK_CLASS,
  });
  let untickResetTimer: ReturnType<typeof setTimeout> | undefined;
  untickBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const cleared = untickAll(tree);
    untickBtn.textContent = cleared > 0 ? `Unticked ${cleared}` : 'Nothing ticked';
    clearTimeout(untickResetTimer);
    untickResetTimer = setTimeout(() => {
      untickBtn.textContent = 'Untick all';
    }, 1800);
  });

  const collapseBtn = button({
    label: 'Collapse all',
    variant: 'ghost',
    className: 'mhx-cat-tree-btn',
  });
  collapseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    collapseTree(tree);
  });

  const expandBtn = button({
    label: 'Expand all',
    variant: 'ghost',
    className: 'mhx-cat-tree-btn',
  });
  expandBtn.addEventListener('click', (e) => {
    e.preventDefault();
    expandTree(tree);
  });

  bar.append(seg, search, counter, only, naturaBtn, untickBtn, collapseBtn, expandBtn);

  // Selected panel: the selection at a glance, in its own column to the RIGHT
  // of the tree (it used to sit above it and pushed the first rows down).
  const pills = document.createElement('div');
  pills.className = PILLS_CLASS;
  pills.setAttribute('aria-live', 'polite');

  shell.append(bar);

  // Two columns: the tree (or the flat list) and the Selected panel beside it.
  // The tree is moved into the row, so the panel sits next to the rows the
  // operator is reading instead of above them.
  const main = document.createElement('div');
  main.className = MAIN_CLASS;
  if (tree.parentElement) {
    tree.parentElement.insertBefore(shell, tree);
    tree.parentElement.insertBefore(main, tree);
  }
  main.append(tree, pills);

  const ui: TreeUi = { shell, bar, pills, counter, search, only };
  state.ui = ui;

  // Board direction (2026-10-20): "Default Category" stays checked, always.
  // It is the store root, not a real choice — a mass update with the root
  // unchecked saves a broken category set, so lock it on every render, on
  // every operator change, and on every re-scan. The tick goes through
  // Magento's own checkbox + a native `change`, like every cascade tick.

  // F15 fix: debounce the prefs write on keystrokes -- localStorage.setItem is
  // synchronous; on a 618-node tree a fast typist was triggering a JSON
  // stringify + write per character. Click-driven writes (mode, selectedOnly)
  // remain immediate because they fire at most once per gesture.
  let prefWriteTimer: ReturnType<typeof setTimeout> | undefined;
  const debouncedWritePrefs = (): void => {
    clearTimeout(prefWriteTimer);
    prefWriteTimer = setTimeout(() => writePrefs(state), 250);
  };

  search.addEventListener('input', () => {
    applyTreeFilter(tree);
    debouncedWritePrefs();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.preventDefault();
    if (e.key === 'Escape') {
      search.value = '';
      applyTreeFilter(tree);
      debouncedWritePrefs();
    }
  });

  only.addEventListener('click', (e) => {
    e.preventDefault();
    state.selectedOnly = !state.selectedOnly;
    only.dataset['variant'] = state.selectedOnly ? 'accent' : 'default';
    only.setAttribute('aria-pressed', String(state.selectedOnly));
    applyTreeFilter(tree);
    writePrefs(state);
  });

  // One delegated listener keeps the pills and the filter honest for every
  // change: our list rows, our pills, the operator in the tree, Magento.
  tree.addEventListener('change', (event) => {
    const target = event.target;
    // Cascade ticks dispatch `change` too — while a cascade runs, skip
    // re-entry (see `cascading`) and only refresh the renders.
    if (!cascading && target instanceof HTMLInputElement) {
      // First, so this render already reflects the cascades: checking a leaf
      // also checks its whole path up ("BONÉS" ticks BONÉS E CHAPÉUS and the
      // section above); unchecking a parent also unchecks its whole subtree,
      // and a parent left with no checked children unchecks too (up to, but
      // excluding, the locked root). The root itself is re-locked on every
      // change — see `ensureRootChecked`.
      // The locked root must never drive a cascade: a stray uncheck event
      // on it would otherwise clear the whole tree before the re-lock.
      cascading = true;
      try {
        if (target === rootBoxOf(tree)) {
          ensureRootChecked(tree);
        } else if (target.checked) {
          cascadeAncestorChecks(target, tree);
        } else {
          cascadeDescendantUnchecks(target, tree);
        }
      } finally {
        cascading = false;
      }
    }
    ensureRootChecked(tree);
    renderPills(tree);
    if (state.selectedOnly) applyTreeFilter(tree);
    else if (state.mode === 'tree' && target instanceof HTMLInputElement) {
      const li = target.closest<HTMLLIElement>('li');
      if (li && target.checked) revealBranchOf(li);
    }
  });

  // Lock the root from the first render — see `ensureRootChecked`.
  ensureRootChecked(tree);
  renderPills(tree);
  if (prefs.mode === 'list') setTreeMode(tree, 'list');
  else applyTreeFilter(tree);
}

/** True when the item's own name is the LINHA NATURA counterpart. */
function isLinhaNatura(li: HTMLLIElement): boolean {
  return normalizeFilterText(itemLabel(li)).includes(NATURA_NAME);
}

/**
 * "Tick Linha Natura": for every CHECKED category, tick the LINHA NATURA
 * item that shares its parent list - e.g. ticking "Casacos Softshell" also
 * ticks the section's "Linha Natura" line category. Only checked boxes act
 * as sources, and nothing is ever unticked, so the action is additive and
 * safe to press twice (the second press reports "Nothing to tick").
 *
 * Each tick goes through the real checkbox + a native `change`, exactly like
 * the cascades, so Magento's own state, the pills and the list view all
 * follow; the bubbling change also runs the ancestor cascade for the newly
 * ticked category. The locked root ("Default Category") is skipped as a
 * source and never touched.
 *
 * Returns how many boxes this press ticked.
 */
function tickLinhaNatura(tree: Element): number {
  const root = rootItemOf(tree);
  const pending: HTMLInputElement[] = [];

  for (const li of Array.from(tree.querySelectorAll<HTMLLIElement>('li'))) {
    if (li === root) continue;
    const box = li.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    // Sources are the operator's own active checks; disabled boxes (the
    // locked root) and LINHA NATURA itself have no counterpart to add.
    if (!box || !box.checked || box.disabled) continue;
    if (isLinhaNatura(li)) continue;
    const parent = parentBranchItem(li);
    const list = parent ? childListOf(parent) : null;
    if (!list) continue;
    const natura = childItems(list).find((kid) => isLinhaNatura(kid));
    if (!natura) continue;
    const naturaBox = natura.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (!naturaBox || naturaBox.disabled || naturaBox.checked) continue;
    if (!pending.includes(naturaBox)) pending.push(naturaBox);
  }

  for (const box of pending) {
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return pending.length;
}

/**
 * "Untick all": uncheck every selected category except the locked root.
 *
 * The bulk walk runs inside the cascade guard: each change event would
 * otherwise walk the subtree and the ancestors of every box it clears, which is
 * O(n²) on a 600-box tree and — worse — would re-enter the listener hundreds of
 * times for a result we already know. The guard only skips OUR cascades;
 * Magento's own change handling still runs, so form state is exactly what the
 * operator would get by unticking each box by hand. The root is skipped (it is
 * disabled and re-locked), and pills/filter are refreshed once at the end.
 *
 * Returns how many boxes this press cleared.
 */
function untickAll(tree: Element): number {
  const root = rootItemOf(tree);
  const boxes = Array.from(
    tree.querySelectorAll<HTMLInputElement>(TREE_BOX_SELECTOR),
  ).filter((box) => {
    if (!box.checked || box.disabled) return false;
    const li = box.closest<HTMLLIElement>('li');
    return li !== root;
  });

  cascading = true;
  try {
    for (const box of boxes) {
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } finally {
    cascading = false;
  }
  ensureRootChecked(tree);
  renderPills(tree);
  applyTreeFilter(tree);
  return boxes.length;
}

/**
 * Checking a category also checks every ancestor up to (but not including)
 * the root item: picking "BONÉS" ticks BONÉS E CHAPÉUS and its section, so a
 * leaf pick never saves a half-selected path. The walk uses the tree's own
 * parent link (`parentBranchItem`, the sibling-model shape Magento ships), and
 * each tick goes through the real checkbox + a native change event, so pills,
 * list view and Magento's own state stay in sync. The root item ("Default
 * Category") is deliberately skipped — it is locked checked by
 * `ensureRootChecked`, and the tree treats it as special everywhere else
 * too. A disabled box stops the walk rather than producing a path with a
 * gap.
 */
function cascadeAncestorChecks(box: HTMLInputElement, tree: Element): void {
  const root = rootItemOf(tree);
  let li = box.closest<HTMLLIElement>('li');
  for (let hops = 0; li && hops < 50; hops += 1) {
    const parent = parentBranchItem(li);
    if (!parent || parent === root) return;
    const parentBox = parent.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (parentBox && parentBox.disabled) return;
    if (parentBox && !parentBox.checked) {
      parentBox.checked = true;
      parentBox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    li = parent;
  }
}

/**
 * The reverse of the check cascade: unchecking a category also unchecks its
 * whole subtree (every descendant box), then walks UP — any ancestor left
 * with no checked children unchecks too, up to but excluding the locked
 * root. So unchecking a section clears its leaves, and unchecking the last
 * checked child clears the parent; a parent that still holds another checked
 * child stays checked. Every untick goes through the real checkbox + a
 * native `change`, like the check path. A disabled box is left alone rather
 * than forced.
 *
 * NOTE the sibling model: Magento nests children as the branch li's NEXT
 * SIBLING ul, not inside the li — so descendants are collected with
 * `descendantLis` (walk into `childListOf`), never with
 * `li.querySelectorAll`. The old version used querySelectorAll and found
 * zero descendants on the live DOM, which is why unchecking did nothing.
 */
function cascadeDescendantUnchecks(box: HTMLInputElement, tree: Element): void {
  const root = rootItemOf(tree);
  const startLi = box.closest<HTMLLIElement>('li');
  if (!startLi) return;
  // Phase 1 — DOWN: untick every checked descendant of the unchecked item.
  for (const item of descendantLis(startLi)) {
    const child = item.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (!child || child === box || child.disabled || !child.checked) continue;
    child.checked = false;
    child.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Phase 2 — UP: any ancestor left with no checked children unchecks too.
  // The walk stops at (and never unticks) the locked root.
  let li: HTMLLIElement | null = startLi;
  for (let hops = 0; li && hops < 50; hops += 1) {
    const parent = parentBranchItem(li);
    if (!parent || parent === root) return;
    if (subtreeHasChecked(parent)) return;
    const parentBox = parent.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (!parentBox || parentBox.disabled || !parentBox.checked) {
      li = parent;
      continue;
    }
    parentBox.checked = false;
    parentBox.dispatchEvent(new Event('change', { bubbles: true }));
    li = parent;
  }
}

/**
 * Every li under a branch item's child list, recursively (sibling model:
 * branch li → next-sibling ul → its li children → their own child lists).
 * The branch item itself is NOT included.
 */
function descendantLis(branch: HTMLLIElement): HTMLLIElement[] {
  const out: HTMLLIElement[] = [];
  const queue: HTMLLIElement[] = [branch];
  for (let hops = 0; queue.length > 0 && hops < 2000; hops += 1) {
    const current = queue.shift();
    if (!current) break;
    const list = childListOf(current);
    if (!list) continue;
    for (const kid of childItems(list)) {
      out.push(kid);
      queue.push(kid);
    }
  }
  return out;
}

/**
 * True when the branch item's subtree holds any checked box: its own box, or
 * any box in a descendant li (sibling model — see `descendantLis`).
 */
function subtreeHasChecked(branch: HTMLLIElement): boolean {
  const own = branch.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
  if (own?.checked) return true;
  for (const item of descendantLis(branch)) {
    const box = item.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (box?.checked) return true;
  }
  return false;
}

/** The locked root's checkbox, for identity checks against stray events. */
function rootBoxOf(tree: Element): HTMLInputElement | null {
  const root = rootItemOf(tree);
  return root?.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR) ?? null;
}

/**
 * "Default Category" is the store root, not a real choice — a mass update
 * with it unchecked saves a broken category set. So it stays checked,
 * always: every render, every operator change, every re-scan, even when
 * nothing else is checked. The tick goes through Magento's own checkbox + a
 * native `change` (same as the cascades), and the box is disabled + labelled
 * so the operator cannot uncheck it by hand — it would silently re-tick on
 * the next change event anyway.
 */
function ensureRootChecked(tree: Element): void {
  const root = rootItemOf(tree);
  if (!root) return;
  const box = root.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
  if (!box) return;
  if (box.disabled === false) {
    box.disabled = true;
    box.title = 'Default Category is always selected (store root).';
    box.setAttribute('aria-disabled', 'true');
    box.setAttribute('aria-label', 'Default Category (always selected)');
  }
  if (!box.checked) {
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CATEGORY_TREE_STYLES;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Collapse Update Attributes trees; idempotent for the debounced scan.
 * First sight: everything collapsed except the root item ("Default
 * Category" — always open, no toggle) and branches holding a checked box.
 * "Collapse all" is a pure collapse: it stays collapsed, checked or not.
 */
export function enhanceCategoryTrees(): number {
  let count = 0;
  for (const tree of findCategoryTrees()) {
    const root = rootItemOf(tree);
    const isNew = tree.getAttribute(TREE_MARK) !== '1';
    for (const node of branchNodesIn(tree)) {
      if (node === root) continue; // root item gets no toggle
      addToggle(node);
    }
    // Numbers for every item that has one, including leaves (that is where the
    // operator most needs the code).
    let numbered = 0;
    let total = 0;
    tree
      .querySelectorAll<HTMLLIElement>('li')
      .forEach((li) => {
        // Same gutter as every other row, so the locked root's box lines up
        // with the level below it instead of sitting far to the left.
        addToggleSlot(li);
        // The store root ("Default Category") has no row in the index, so it is
        // left alone instead of being reported as a gap.
        if (li === root) return;
        if (!li.querySelector(TREE_BOX_SELECTOR)) return;
        total += 1;
        addCodeBadge(li);
        addToggleSlot(li);
        indentItem(li);
        if (li.dataset['mhxCatNo']) numbered += 1;
      });
    badgeStats.numbered = numbered;
    badgeStats.total = total;
    logBadgeCoverage();
    if (isNew) {
      if (root) setCollapsed(root, false);
      collapseTree(tree);
      revealChecked(tree);
      count += 1;
    }
    addToolbar(tree);
    renderPills(tree);
  }
  if (count > 0) injectStyles();
  return count;
}

/**
 * Every colour is a layer-1 page token (`--mhx-pg-*`) — never one from the
 * extension palette, which describes the side panel and stays the LIGHT palette
 * unless our own dark admin is enabled. These tokens derive from the page
 * (`currentColor`/`color-mix`, plus the measured `data-mhx-page` floors), so the
 * toolbar follows a light admin, Magento's own dark one and our themed dark one
 * alike instead of staying a light island. G6 enforces the distinction.
 * The selectors are our own classes only — nothing Magento renders is styled
 * from here except the tree's item labels.
 */
const CATEGORY_TREE_STYLES = `
.mhx-cat-shell{display:flex;flex-direction:column;gap:8px;margin:8px 0 10px;}
.mhx-cat-main{display:flex;gap:14px;align-items:flex-start;}
.mhx-cat-main > *{min-width:0;}
.mhx-cat-main > :not(.mhx-cat-pills){flex:1 1 auto;}
.mhx-cat-tree-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
.mhx-cat-toggle{width:22px;height:22px;margin:0 14px 0 2px;vertical-align:middle;flex-shrink:0;}
.mhx-cat-slot{display:inline-block;width:22px;height:22px;margin:0 14px 0 2px;vertical-align:middle;flex-shrink:0;}
.mhx-cat-no{width:46px;box-sizing:border-box;margin:0 6px 0 0;padding:1px 0;border-radius:3px;background:var(--mhx-pg-fill-hover);color:var(--mhx-pg-muted);font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:center;vertical-align:middle;}
.mhx-cat-search{width:200px;margin:0 4px 0 0;padding:5px 10px;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill);color:var(--mhx-pg-ink);font:12px/1.3 system-ui,"Segoe UI",Arial,sans-serif;}
.mhx-cat-search::placeholder{color:var(--mhx-pg-ink);}
.mhx-cat-search:focus{outline:none;border-color:var(--mhx-pg-accent);box-shadow:0 0 0 1px var(--mhx-pg-accent);}
.mhx-cat-tree-count{margin-right:4px;font:11px/1.3 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-muted);white-space:nowrap;}
.mhx-cat-pills{display:flex;flex:0 0 clamp(230px,24vw,330px);flex-direction:column;gap:4px;padding:8px 10px;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill-hover);max-height:480px;overflow-y:auto;position:sticky;top:8px;}
.mhx-cat-pills-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;}
.mhx-cat-pills-title{font:11px/1.4 system-ui,"Segoe UI",Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--mhx-pg-muted);}
.mhx-cat-pills-hint{font:11px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-muted);font-style:italic;}
.mhx-cat-pills-empty{font:12px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-ink);font-style:italic;}
.mhx-cat-sel{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:1px;}
.mhx-cat-sel-row{display:flex;align-items:center;gap:6px;padding:2px 6px;border-left:2px solid var(--mhx-pg-accent);border-radius:2px;font:12px/1.5 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-ink);}
.mhx-cat-sel-row:hover{background:var(--mhx-pg-fill);}
.mhx-cat-sel-row--context{border-left-color:var(--mhx-pg-line);color:var(--mhx-pg-muted);cursor:pointer;font-style:italic;}
.mhx-cat-sel-row--context:focus-visible{outline:2px solid var(--mhx-pg-accent);outline-offset:-2px;}
.mhx-cat-sel-row--context:hover{color:var(--mhx-pg-ink);}
.mhx-cat-pill-no{width:38px;box-sizing:border-box;padding:0;border-radius:2px;color:var(--mhx-pg-muted);font:10px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:center;}
.mhx-cat-sel-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;}
.mhx-cat-sel-x{padding:0 4px;border:0;background:transparent;color:var(--mhx-pg-muted);cursor:pointer;border-radius:2px;line-height:1;}
.mhx-cat-sel-x:hover{background:var(--mhx-pg-fill);color:var(--mhx-pg-accent-strong);}
.mhx-cat-list{margin:0;max-height:480px;overflow-y:auto;padding:4px 0;border:1px solid var(--mhx-pg-line);border-radius:3px;background:var(--mhx-pg-fill);}
.mhx-cat-list[hidden]{display:none !important;}
.mhx-cat-row{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;font:13px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-ink);}
.mhx-cat-row:hover{background:var(--mhx-pg-fill-hover);}
.mhx-cat-row:focus-visible{outline:2px solid var(--mhx-pg-accent);outline-offset:-2px;}
.mhx-cat-row-box{width:14px;height:14px;border:1px solid var(--mhx-pg-line);border-radius:2px;background:var(--mhx-pg-fill);flex-shrink:0;position:relative;}
.mhx-cat-row--checked .mhx-cat-row-box{background:var(--mhx-pg-accent);border-color:var(--mhx-pg-accent);}
.mhx-cat-row--checked .mhx-cat-row-box::after{content:"✓";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mhx-pg-on-accent);font-size:11px;line-height:1;}
`;
