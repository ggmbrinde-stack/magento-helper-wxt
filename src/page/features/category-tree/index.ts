// The Categories checkbox tree on the mass "Update Attributes" page
// (Categories tab, "Add Product To Categories").
//
// Same logic as the other page-UI replacements (rowActions, pagingSizes):
// detect the DOM shape, wire toggles, mark processed nodes, stay idempotent
// for the debounced re-scan. No hard URL gate and no heading-tag or
// checkbox-name assumptions â€” exact-route gating already missed the real
// route once (product_action_attribute, no trailing slash), and the live DOM
// shows the tree is a plain nested ul/li checkbox list.
//
// What the operator gets, all display-only except the checkbox clicks they
// make themselves:
// - Number badges. Every category carries the code from the Notion index
//   ("1", "1.2.3") so the admin matches the sheet the operator works from
//   (`categoryIndex.ts`).
// - "Selected only" filter, and a Selected panel that shows the chosen
//   categories as an indented tree (unchecked parents kept as grey context),
//   (click a pill to remove it), so the selection is visible at a glance
//   instead of being buried in a 200-row tree. It sits directly beside the
//   tree, in the tree's own column width, not pinned to the far right.
// - Search filter ("Filter categoriesâ€¦", accent-insensitive, narrows matches
//   and keeps their ancestor path on screen).
// - Collapse all / Expand all.
// - "Tick Linha Natura": one click ticks the LINHA NATURA counterpart of
//   every category the operator has already ticked (same parent list), so a
//   multi-category pick does not need a second pass down the tree.
// - The filter text and "Selected only" survive navigation and reloads
//   (localStorage, per browser).
//
// How it stays safe:
// - Display-only: flips `display` of lists/items and inserts spans/buttons.
//   The operator's own checkbox clicks are the only writers, forwarded
//   through Magento's own boxes + a native `change` â€” the reverse cascade
//   and the locked root below click those same boxes, so the Selected panel and
//   form state stay in sync. No request is made and nothing is saved.
// - Idempotent: processed nodes/trees are marked, so the content script's
//   debounced re-scan and AJAX reloads cannot stack duplicate controls.
// - Colours come from the toolkit's page layer (`--mhx-pg-*`), never from the
//   extension palette: this is page chrome, so it follows whatever the admin is
//   â€” light, our own dark theme, or Magento's own â€” and `check-ui.mjs` G6 fails
//   the build if a palette token creeps back in.

import {
  categoryCode,
  categoryNotes,
  categoryOrderIssues,
  compareCategoryCodes,
  type CategoryNote,
  type CrossCategoryRule,
  type OrderedCategoryRow,
} from './categoryIndex';
import { button, badge } from '../../../ui';

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

/* --- Toolbar -------------------------------------------------------------- */
const ONLY_CLASS = 'mhx-cat-only';
const NATURA_CLASS = 'mhx-cat-natura';
const RULES_CLASS = 'mhx-cat-rules-btn';
const UNTICK_CLASS = 'mhx-cat-untick';

/** The counterpart category this action adds, accent/case-insensitive. */
const NATURA_NAME = 'linha natura';

/** View preferences survive navigation; one admin origin, one set. */
const PREFS_KEY = 'mhx.catTree.prefs.v1';

interface TreePrefs {
  query: string;
  selectedOnly: boolean;
}

const DEFAULT_PREFS: TreePrefs = { query: '', selectedOnly: false };

function readPrefs(): TreePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<TreePrefs>;
    return {
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
    query: state.ui?.search.value ?? '',
    selectedOnly: state.selectedOnly,
  };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience, never a requirement.
  }
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
  selectedOnly: boolean;
  ui: TreeUi | null;
  /** Last rendered pill set, so a re-scan cannot rebuild it into a loop. */
  pillSig: string;
}

const treeStates = new WeakMap<Element, TreeState>();

/**
 * Re-entrancy guard: cascade ticks dispatch `change`, which re-enters the
 * tree's delegated listener. Without this, Phase 1 unticking N descendants
 * fires N nested cascades, each re-walking the same subtree (O(nÂ²) on a
 * 606-box tree) and â€” worse â€” Phase 2 of a nested call can untick an
 * ancestor the outer call still needs. While set, the listener skips its own
 * cascade entry and only refreshes pills/filters.
 */
let cascading = false;
const rootClickGuards = new WeakSet<HTMLInputElement>();

/**
 * Magento renders this tree as SIBLINGS, not nested children (live DOM,
 * probe v3): each branch item is an li followed by its child list as the
 * NEXT SIBLING ul â€” never a child ul. Leaf items are followed by an empty
 * `<ul></ul>`. That is why `li ul` selectors found zero branches.
 *
 *   <ul>
 *     <li><input class="category-checkbox">Default Category</li>
 *     <ul>                          <!-- children of the li above -->
 *       <li>â€¦TÃªxtil Promocionalâ€¦</li>
 *       <ul> â€¦ </ul>
 *       <li>â€¦leafâ€¦</li>
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
 * The tree's root item â€” the first li of the root list ("Default Category"
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
  toggle.textContent = collapsed ? 'â–¸' : 'â–¾';
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
  const toggle = button({ label: 'â–¾', title: 'Collapse', variant: 'icon', className: TOGGLE_CLASS });
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
 * of its parent's â€” the sub-subcategory boxes read as a separate, shallower
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
// `null` until the first scan: an empty report ("nothing wrong") must still be
// logged once, so it cannot share the initial value.
let lastOrderReport: string | null = null;

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
    console.info(`[category-tree] ${summary} categories numbered â€” no gaps.`);
    return;
  }
  // eslint-disable-next-line no-console
  console.info(
    `[category-tree] ${summary} categories numbered â€” ${total - numbered} without a Notion index code. ` +
      'Copy the list below to extend categoryIndex.ts:',
    Array.from(UNRESOLVED).sort(),
  );
}

/**
 * One item and the child list that belongs to it. Magento renders a branch as
 * `li` followed by its children in the NEXT SIBLING `ul`, so the two have to
 * move together or the hierarchy breaks.
 */
interface SiblingGroup {
  item: HTMLLIElement;
  childList: HTMLUListElement | null;
}

/**
 * Reorder every sibling list so the numbers ascend: 6.1 before 6.2, and 3.4.9
 * before 3.4.10.
 *
 * The admin keeps its own category order, which is not the sheet's order â€”
 * "AcessÃ³rios SecretÃ¡ria" (6.1) sits at the END of Escrita e EscritÃ³rio there,
 * so a column of numbers read 6.2, 6.3, 6.4, 6.5, 6.1 even though every badge
 * was right. Display-only: items, their child lists, toggles, badges and the
 * real checkboxes all move as they are, so form state and Save are untouched.
 * Rows without a number keep their relative order at the end of their list, and
 * the store root is never moved (it is the only child of the tree's own list).
 */
function sortSiblingsByNumber(tree: Element): void {
  const lists: Element[] = [tree, ...Array.from(tree.querySelectorAll('ul'))];
  for (const list of lists) {
    // Pair each item with the sibling list that follows it.
    const groups: SiblingGroup[] = [];
    let paired = true;
    for (const child of Array.from(list.children)) {
      if (child instanceof HTMLLIElement) {
        groups.push({ item: child, childList: null });
        continue;
      }
      if (child instanceof HTMLUListElement) {
        const last = groups[groups.length - 1];
        // A list with no item before it is not this model; leave it alone.
        if (!last || last.childList) {
          paired = false;
          break;
        }
        last.childList = child;
      }
    }
    if (!paired || groups.length < 2) continue;
    if (groups.every((group) => !codeOf(group.item, false))) continue;

    const sorted = [...groups].sort((a, b) => {
      const left = codeOf(a.item, false);
      const right = codeOf(b.item, false);
      if (left && right) return compareCategoryCodes(left, right);
      if (left) return -1;
      if (right) return 1;
      return 0;
    });
    if (sorted.every((group, index) => group === groups[index])) continue;

    for (const group of sorted) {
      list.append(group.item);
      if (group.childList) list.append(group.childList);
    }
  }
}

/**
 * Check that the badges read 1, 1.1, 1.1.1 â€¦ in the order the rows are drawn.
 *
 * Every number can be right and the column still look wrong: a category the
 * admin lists mid-section gets a high number there, and a child the admin nests
 * under a category the sheet files elsewhere shows a number from another branch.
 * Neither is a resolver bug, so neither can be fixed by guessing â€” the page
 * names the rows instead, once per distinct finding, and the fix goes to the
 * sheet or to the admin tree.
 */
function logBadgeOrder(tree: Element): void {
  const root = rootItemOf(tree);
  const rows: OrderedCategoryRow[] = [];
  let numbered = 0;
  for (const li of Array.from(tree.querySelectorAll<HTMLLIElement>('li'))) {
    const code = li === root ? '' : (li.dataset['mhxCatNo'] ?? '');
    if (code) numbered += 1;
    const name = itemLabel(li);
    rows.push({
      code,
      name,
      depth: depthOf(li),
      path: [...ancestorNames(li), name].filter(Boolean).join(' > '),
    });
  }
  const issues = categoryOrderIssues(rows);
  const report = issues.join('\n');
  if (report === lastOrderReport) return;
  lastOrderReport = report;
  if (issues.length === 0) {
    // eslint-disable-next-line no-console
    console.info(
      `[category-tree] ${numbered} numbers in reading order â€” no branch runs backwards.`,
    );
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[category-tree] ${issues.length} number${issues.length === 1 ? '' : 's'} out of reading order: ` +
      'fix the sheet row or the admin tree (not the resolver):',
    issues,
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
  // from the nesting â€” the item pad is the only thing that separates levels.
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
 * The `:checked` filter is applied per element with matches() â€” appending
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
 * collapsed state. Matching is accent-insensitive ("textil" finds "TÃªxtil")
 * and also matches the index number ("1.1").
 * Display-only: only li visibility flips â€” checkboxes, values, handlers and
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

function applyTreeFilter(tree: Element): void {
  const state = treeStates.get(tree);
  const ui = state?.ui;
  if (!state || !ui) return;

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
 * T-shirts and the other of Sweatshirts. Keeping the branch in the list â€”
 * indented, greyed and marked as not selected â€” makes the strip the family tree
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
 * operator). Clicking a greyed row selects that branch too; âœ• on a chosen row
 * unchecks it â€” both go through the real box, so form state stays Magento's.
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
      'Grey rows are the branches above a selected category. Grey means not selected â€” click one to select it too.';
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
      ? `${node.name}${node.code ? ` (${node.code})` : ''} â€” selected`
      : `${node.name}${node.code ? ` (${node.code})` : ''} is NOT selected â€” click to select this branch too`;

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
        label: 'Ã—',
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
    selectedOnly: prefs.selectedOnly,
    ui: null,
    pillSig: '',
  };
  treeStates.set(tree, state);

  const shell = document.createElement('div');
  shell.className = SHELL_CLASS;

  const bar = document.createElement('div');
  bar.className = BAR_CLASS;

  // Search box, same idea as the searchable picker: instant narrowing as
  // you type. Enter must never submit the mass-attributes form.
  const search = document.createElement('input');
  search.type = 'search';
  search.className = SEARCH_CLASS;
  search.placeholder = 'Filter categoriesâ€¦';
  search.setAttribute('aria-label', 'Filter categories');
  search.value = prefs.query;

  const counter = document.createElement('span');
  counter.className = COUNT_CLASS;

  // "Selected only": hide everything that is not checked.
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

  // "Apply Rules": ticks cross-category targets based on "tb em" patterns.
  const applyRulesBtn = button({
    label: 'Apply Rules',
    title: 'Apply cross-category rules based on "tb em" patterns',
    variant: 'accent',
    className: RULES_CLASS,
  });
  let rulesState: {
    pending: number;
    resetTimer: ReturnType<typeof setTimeout> | undefined;
  } = { pending: 0, resetTimer: undefined };
  applyRulesBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const ticked = applyRules(tree);
    applyRulesBtn.textContent = ticked > 0 ? `Applied ${ticked}` : 'No rules to apply';
    clearTimeout(rulesState.resetTimer);
    rulesState.resetTimer = setTimeout(() => {
      applyRulesBtn.textContent = 'Apply Rules';
    }, 1800);
  });

  // "Untick all": clears the selection in one click. Every box goes through
  // Magento's own checkbox + a native `change`, and the locked root
  // ("Default Category") is never touched â€” it must stay checked or Save would
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

  bar.append(search, counter, only, naturaBtn, applyRulesBtn, untickBtn, collapseBtn, expandBtn);

  // Selected panel: the selection at a glance, in its own column to the RIGHT
  // of the tree (it used to sit above it and pushed the first rows down).
  const pills = document.createElement('div');
  pills.className = PILLS_CLASS;
  pills.setAttribute('aria-live', 'polite');

  shell.append(bar);

  // Two columns: the tree and the Selected panel immediately beside it. The
  // tree column is sized to its own content (CSS), so the panel follows the
  // rows instead of being pushed out to the far right of a wide fieldset.
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
  // It is the store root, not a real choice â€” a mass update with the root
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
    // Cascade ticks dispatch `change` too â€” while a cascade runs, skip
    // re-entry (see `cascading`) and only refresh the renders.
    if (!cascading && target instanceof HTMLInputElement) {
      // First, so this render already reflects the cascades: checking a leaf
      // also checks its whole path up ("BONÃ‰S" ticks BONÃ‰S E CHAPÃ‰US and the
      // section above); unchecking a parent also unchecks its whole subtree,
      // and a parent left with no checked children unchecks too (up to, but
      // excluding, the locked root). The root itself is re-locked on every
      // change â€” see `ensureRootChecked`.
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
    else if (target instanceof HTMLInputElement) {
      const li = target.closest<HTMLLIElement>('li');
      if (li && target.checked) revealBranchOf(li);
      // Show rules panel on selection change
      renderRulesPanel(tree, li);
    }
  });

  // Also handle clicks on rows to show rules panel
  tree.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target instanceof Element && !target.closest(`.${TOGGLE_CLASS}`) && !target.closest('input[type="checkbox"]')) {
      const li = target.closest<HTMLLIElement>('li');
      if (li) {
        renderRulesPanel(tree, li);
      }
    }
  });

  // Lock the root from the first render â€” see `ensureRootChecked`.
  ensureRootChecked(tree);
  renderPills(tree);
  applyTreeFilter(tree);
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
 * O(nÂ²) on a 600-box tree and â€” worse â€” would re-enter the listener hundreds of
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
 * the root item: picking "BONÃ‰S" ticks BONÃ‰S E CHAPÃ‰US and its section, so a
 * leaf pick never saves a half-selected path. The walk uses the tree's own
 * parent link (`parentBranchItem`, the sibling-model shape Magento ships), and
 * each tick goes through the real checkbox + a native change event, so pills,
 * list view and Magento's own state stay in sync. The root item ("Default
 * Category") is deliberately skipped â€” it is locked checked by
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
 * whole subtree (every descendant box), then walks UP â€” any ancestor left
 * with no checked children unchecks too, up to but excluding the locked
 * root. So unchecking a section clears its leaves, and unchecking the last
 * checked child clears the parent; a parent that still holds another checked
 * child stays checked. Every untick goes through the real checkbox + a
 * native `change`, like the check path. A disabled box is left alone rather
 * than forced.
 *
 * NOTE the sibling model: Magento nests children as the branch li's NEXT
 * SIBLING ul, not inside the li â€” so descendants are collected with
 * `descendantLis` (walk into `childListOf`), never with
 * `li.querySelectorAll`. The old version used querySelectorAll and found
 * zero descendants on the live DOM, which is why unchecking did nothing.
 */
function cascadeDescendantUnchecks(box: HTMLInputElement, tree: Element): void {
  const root = rootItemOf(tree);
  const startLi = box.closest<HTMLLIElement>('li');
  if (!startLi) return;
  // Phase 1 â€” DOWN: untick every checked descendant of the unchecked item.
  for (const item of descendantLis(startLi)) {
    const child = item.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (!child || child === box || child.disabled || !child.checked) continue;
    child.checked = false;
    child.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // Phase 2 â€” UP: any ancestor left with no checked children unchecks too.
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
 * branch li â†’ next-sibling ul â†’ its li children â†’ their own child lists).
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
 * any box in a descendant li (sibling model â€” see `descendantLis`).
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

/* --- Apply Rules ----------------------------------------------------------- */

/**
 * Normalise a text fragment for loose matching: strip emojis, punctuation, accents,
 * collapse whitespace, lowercase. Used to match source names from crossCategory rules
 * against live tree labels.
 */
function normalizeRuleText(text: string): string {
  return text
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Resolve a cross-category rule's target leaf in the live tree.
 *
 * The `targetId` stored in the rule is the **section-level** code (e.g. "7"),
 * not the leaf. The full path to the leaf is in `targetName`
 * (e.g. "AR LIVRE E EVENTOS > ACESSÓRIOS DESPORTO > Toalhas Desporto").
 *
 * Strategy (most-specific first):
 *  1. Walk the `targetName` segments as a path: find the section by `targetId`,
 *     then descend level by level matching names.
 *  2. If path walk fails, search descendants of the `targetId` section for the
 *     last path segment by fuzzy match.
 *  3. As a last resort tick the section itself (the `targetId` node).
 */
function findBoxesByRule(tree: Element, rule: CrossCategoryRule): HTMLInputElement[] {
  const allLis = Array.from(tree.querySelectorAll<HTMLLIElement>('li'));

  // ---- Step 1: path-walk from the targetId section ----
  // Parse path segments from targetName (separated by " > " or ">")
  const pathSegments = rule.targetName
    .split(/\s*>\s*/)
    .map((s) => normalizeRuleText(s))
    .filter(Boolean);

  // Find the root section (by targetId code)
  let currentLi: HTMLLIElement | null =
    allLis.find((l) => l.dataset['mhxCatNo'] === rule.targetId) ?? null;

  if (currentLi && pathSegments.length > 0) {
    // The first segment in targetName is typically the section name itself —
    // skip it if it matches the already-found section.
    const sectionLabel = normalizeRuleText(itemLabel(currentLi));
    let segStart = pathSegments[0] === sectionLabel ? 1 : 0;
    // Also skip if the first segment is a prefix/partial match of the section name
    if (segStart === 0 && sectionLabel.startsWith(pathSegments[0] ?? '')) segStart = 1;

    for (let i = segStart; i < pathSegments.length; i++) {
      const seg = pathSegments[i];
      if (!seg) continue;
      const childList = childListOf(currentLi);
      if (!childList) { currentLi = null; break; }
      const kids = childItems(childList);
      const match = kids.find((kid) => {
        const kidLabel = normalizeRuleText(itemLabel(kid));
        return kidLabel === seg || kidLabel.startsWith(seg) || seg.startsWith(kidLabel);
      });
      if (!match) { currentLi = null; break; }
      currentLi = match;
    }
  }

  if (currentLi) {
    const box = currentLi.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (box && !box.checked && !box.disabled) return [box];
    // Already checked or disabled — still found it, nothing to tick.
    return [];
  }

  // ---- Step 2: fuzzy search under the targetId section ----
  const sectionLi = allLis.find((l) => l.dataset['mhxCatNo'] === rule.targetId);
  const lastSeg = normalizeRuleText(pathSegments[pathSegments.length - 1] ?? rule.source);

  if (sectionLi) {
    const descendants = descendantLis(sectionLi);
    const match = descendants.find((li) => {
      const lbl = normalizeRuleText(itemLabel(li));
      return lbl === lastSeg || lbl.startsWith(lastSeg) || lastSeg.startsWith(lbl);
    });
    if (match) {
      const box = match.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
      if (box && !box.checked && !box.disabled) return [box];
      return [];
    }
    // ---- Step 3: tick the section itself as fallback ----
    const sectionBox = sectionLi.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
    if (sectionBox && !sectionBox.checked && !sectionBox.disabled) return [sectionBox];
  }

  return [];
}

function applyRules(tree: Element): number {
  const ticked: HTMLInputElement[] = [];

  // Collect all checked categories and their associated rules
  const checked = Array.from(
    tree.querySelectorAll<HTMLInputElement>(`${TREE_BOX_SELECTOR}:checked`),
  );

  for (const box of checked) {
    const li = box.closest<HTMLLIElement>('li');
    if (!li || !li.dataset['mhxCatNo']) continue;

    const rules = getCrossCategoryRules(li.dataset['mhxCatNo']);
    if (!rules) continue;

    for (const rule of rules) {
      const targetBoxes = findBoxesByRule(tree, rule);
      for (const targetBox of targetBoxes) {
        if (!ticked.includes(targetBox)) ticked.push(targetBox);
      }
    }
  }

  // Tick them all (cascade handles ancestors)
  for (const box of ticked) {
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return ticked.length;
}

/* --- Rules Panel ----------------------------------------------------------- */

const RULES_PANEL_CLASS = 'mhx-cat-rules-panel';
const RULES_HEADER_CLASS = 'mhx-cat-rules-header';
const RULES_CONTENT_CLASS = 'mhx-cat-rules-content';
const RULES_CLEAR_CLASS = 'mhx-cat-rules-clear';

/** Get cross-category rules for a category code. */
function getCrossCategoryRules(code: string): CrossCategoryRule[] | null {
  const notes = categoryNotes(code);
  return notes?.crossCategory ?? null;
}

/**
 * Parse the raw notes string into two parts:
 *  - `intro`: the leading plain text before the first emoji rule line
 *  - `ruleLines`: each emoji-prefixed line (🔹 / 🔸 / ⚠) as its own string
 *
 * Source notes look like:
 *   "Usar LABELS... 🔹Térmicos tb em 2. TÊXTIL... 🔸Chinelos tb em 7. ..."
 * We split on the emoji boundary so the intro and each rule get separate
 * visual treatment instead of being piled into one text blob.
 */
function parseNotesLines(raw: string): { intro: string; ruleLines: string[] } {
  // The emoji bullet characters used in the source: 🔹 (\u{1F539}), 🔸 (\u{1F538}), ⚠ (\u26A0)
  // Split just before each emoji bullet that starts a rule.
  const parts = raw.split(/(?=[\u{1F538}\u{1F539}\u26A0])/u).map((s) => s.trim()).filter(Boolean);
  const BULLET_RE = /^[\u{1F538}\u{1F539}\u26A0]/u;
  const firstIsBullet = BULLET_RE.test(parts[0] ?? '');
  const intro = firstIsBullet ? '' : (parts[0] ?? '');
  const ruleLines = firstIsBullet ? parts : parts.slice(1);
  return { intro, ruleLines };
}

function renderRulesPanel(tree: Element, li: HTMLLIElement | null): void {
  // The panel lives in `shell` (a sibling above the tree wrapper),
  // NOT inside `tree` — always search shell, never tree itself.
  const main = tree.closest(`.${MAIN_CLASS}`);
  const shell = main?.previousElementSibling?.classList.contains(SHELL_CLASS)
    ? main.previousElementSibling
    : null;
  if (shell) {
    shell.querySelector(`.${RULES_PANEL_CLASS}`)?.remove();
  }

  if (!li || !li.dataset['mhxCatNo']) {
    // Show placeholder panel ??? no category selected yet
    insertPanel(tree, buildPanel(null, null));
    return;
  }

  const code = li.dataset['mhxCatNo'];
  const notes = categoryNotes(code);
  insertPanel(tree, buildPanel(li, notes ?? null));
}

/**
 * Build the rules panel DOM for a given li/notes pair.
 * Both null = initial "click a category" state.
 */
function buildPanel(
  li: HTMLLIElement | null,
  notes: { notes?: string; crossCategory?: CrossCategoryRule[] } | null,
): HTMLElement {
  const code = li?.dataset['mhxCatNo'];
  const catName = li ? itemLabel(li) : '';
  const hasNotes = !!(notes?.notes?.trim());

  const panel = document.createElement('div');
  panel.className = RULES_PANEL_CLASS;

  // Header: "Notas: CategoryName (code)" or just "Notas e Regras"
  const header = document.createElement('div');
  header.className = RULES_HEADER_CLASS;
  const titleSpan = document.createElement('span');
  titleSpan.textContent = code ? `Notas: ${catName} (${code})` : 'Notas e Regras';
  const closeBtn = document.createElement('span');
  closeBtn.className = RULES_CLEAR_CLASS;
  closeBtn.textContent = '✕ Fechar';
  closeBtn.addEventListener('click', () => panel.remove());
  header.append(titleSpan, closeBtn);

  const content = document.createElement('div');
  content.className = RULES_CONTENT_CLASS;

  if (!code) {
    const hint = document.createElement('p');
    hint.className = 'mhx-cat-rules-hint';
    hint.textContent = 'Clique numa categoria para ver as notas e regras “tb em”.';
    content.appendChild(hint);
  } else if (!hasNotes) {
    const hint = document.createElement('p');
    hint.className = 'mhx-cat-rules-hint';
    hint.textContent = 'Sem notas ou regras para esta categoria.';
    content.appendChild(hint);
  } else {
    // Parse the notes string into intro text + emoji bullet lines
    const { intro, ruleLines } = parseNotesLines(notes!.notes!);
    if (intro) {
      const introEl = document.createElement('p');
      introEl.className = 'mhx-cat-rules-intro';
      introEl.textContent = intro;
      content.appendChild(introEl);
    }
    if (ruleLines.length > 0) {
      const ul = document.createElement('ul');
      ul.className = 'mhx-cat-rules-list';
      for (const line of ruleLines) {
        const item = document.createElement('li');
        item.textContent = line;
        ul.appendChild(item);
      }
      content.appendChild(ul);
    }
  }

  panel.append(header, content);
  return panel;
}

function insertPanel(tree: Element, panel: HTMLElement): void {
  // The shell is the PREVIOUS sibling of the .mhx-cat-main wrapper.
  const main = tree.closest(`.${MAIN_CLASS}`);
  const prevSibling = main?.previousElementSibling;
  const shell = prevSibling?.classList.contains(SHELL_CLASS) ? prevSibling : null;
  if (!shell) return;
  // Belt-and-suspenders: remove any stale panel.
  shell.querySelector(`.${RULES_PANEL_CLASS}`)?.remove();
  const bar = shell.querySelector(`.${BAR_CLASS}`);
  if (bar?.nextSibling) {
    shell.insertBefore(panel, bar.nextSibling);
  } else {
    shell.appendChild(panel);
  }
}
/**
 * "Default Category" is the store root, not a real choice â€” a mass update
 * with it unchecked saves a broken category set. So it stays checked,
 * always: every render, every operator change, every re-scan, even when
 * nothing else is checked. The tick goes through Magento's own checkbox + a
 * native `change` (same as the cascades). The box remains enabled so Magento
 * includes it in form submission; clicks are intercepted to keep it checked.
 */
function ensureRootChecked(tree: Element): void {
  const root = rootItemOf(tree);
  if (!root) return;
  const box = root.querySelector<HTMLInputElement>(TREE_BOX_SELECTOR);
  if (!box) return;
  if (box.disabled) box.disabled = false;
  if (!rootClickGuards.has(box)) {
    rootClickGuards.add(box);
    box.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        if (!box.checked) {
          box.checked = true;
          box.dispatchEvent(new Event('change', { bubbles: true }));
        }
      },
      true,
    );
  }
  box.title = 'Default Category is always selected (store root).';
  box.setAttribute('aria-label', 'Default Category (always selected)');
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
 * Category" â€” always open, no toggle) and branches holding a checked box.
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
    // Every number is assigned now, so the rows can be put in that order.
    sortSiblingsByNumber(tree);
    logBadgeCoverage();
    logBadgeOrder(tree);
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
 * Every colour is a layer-1 page token (`--mhx-pg-*`) â€” never one from the
 * extension palette, which describes the side panel and stays the LIGHT palette
 * unless our own dark admin is enabled. These tokens derive from the page
 * (`currentColor`/`color-mix`, plus the measured `data-mhx-page` floors), so the
 * toolbar follows a light admin, Magento's own dark one and our themed dark one
 * alike instead of staying a light island. G6 enforces the distinction.
 * The selectors are our own classes only â€” nothing Magento renders is styled
 * from here except the tree's item labels.
 */
const CATEGORY_TREE_STYLES = `
.mhx-cat-shell{display:flex;flex-direction:column;gap:8px;margin:8px 0 10px;}
.mhx-cat-main{display:flex;gap:14px;align-items:flex-start;}
.mhx-cat-main > *{min-width:0;}
/* The tree takes its own content width, so the Selected panel sits right
   beside it instead of at the far right of the fieldset. */
.mhx-cat-main > :not(.mhx-cat-pills){flex:0 1 auto;max-width:min(560px,100%);}
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
.mhx-cat-rules-panel{margin-top:8px;padding:10px 12px;border:1px solid var(--mhx-pg-line);border-radius:4px;background:var(--mhx-pg-fill);font:12px/1.4 system-ui,"Segoe UI",Arial,sans-serif;color:var(--mhx-pg-ink);display:block !important;}
.mhx-cat-rules-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-weight:600;font-size:12px;color:var(--mhx-pg-ink);}
.mhx-cat-rules-content p{margin:0 0 6px 0;line-height:1.45;}
.mhx-cat-rules-intro{color:var(--mhx-pg-ink);font-weight:500;}
.mhx-cat-rules-hint{color:var(--mhx-pg-muted);font-style:italic;}
.mhx-cat-rules-list{margin:4px 0 0 0;padding:0;list-style:none;}
.mhx-cat-rules-list li{margin-bottom:5px;line-height:1.4;padding:4px 8px;border-radius:3px;background:var(--mhx-pg-fill-hover);border-left:3px solid var(--mhx-pg-accent);}
.mhx-cat-rules-clear{cursor:pointer;color:var(--mhx-pg-muted);font-weight:bold;font-size:11px;padding:2px 6px;border-radius:3px;background:var(--mhx-pg-fill-hover);line-height:1;}
.mhx-cat-rules-clear:hover{color:var(--mhx-pg-accent);background:var(--mhx-pg-line);}
`;
