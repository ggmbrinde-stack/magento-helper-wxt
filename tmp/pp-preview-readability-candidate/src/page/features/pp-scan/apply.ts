// Fill an already-open Magento custom-option form with the techniques the plan says are missing.
// This function is injected into the helper tab's main world, so it must stay self-contained:
// no imports, no module helpers, no references to anything outside its own body.
export interface PpApplyPlanRow { face: string; magentoFace: string; technique: string; catalogueId: string; claimed?: number }
export type PpApplyOutcome = 'added' | 'failed' | 'skipped';
export interface PpApplyPlanResult { face: string; technique: string; catalogueId: string; outcome: PpApplyOutcome; reason: string }
export interface PpApplyPlanReport {
  results: PpApplyPlanResult[]; reason: string; diagnostics?: PpOrderDiagnostics;
}

export function applyPpPlanRows(plan: PpApplyPlanRow[]): Promise<PpApplyPlanReport> {
  const sleep = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));
  const plain = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const faceKey = (value: unknown): string => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join('');
  const ITEMS = '[sub_options_items]';
  const field = (row: Element, name: string): HTMLSelectElement | null =>
    row.querySelector<HTMLSelectElement>(`select[name*="${ITEMS}"][name*="[${name}]"]`);
  const itemsTable = (): HTMLTableElement | null => {
    const found = Array.from(document.querySelectorAll('table')).find(node => node.querySelector(`select[name*="${ITEMS}"]`));
    return (found as HTMLTableElement | undefined) ?? null;
  };
  // Magento keeps the Items panel hidden until its Options tab opens, and only the nav link
  // opens it. The same id can also sit on the panel, and a click there does nothing, so the
  // click is limited to the page nav. Repeating it on an open tab is a harmless no-op.
  const openOptionsTab = (): boolean => {
    const nav = Array.from(document.querySelectorAll(
      '.admin__page-nav-items a, .admin__page-nav-items button, .admin__page-nav-link, a[href="#options"]',
    ));
    const words = (value: unknown): string[] =>
      String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const named = (node: Element): string[] => [
      ...words((node as HTMLElement).id),
      ...words(node.getAttribute('data-tab')),
      ...words(String(node.getAttribute('href') ?? '').replace(/^#/, '')),
    ];
    const letters = (node: Element): string => String(node.textContent ?? '').toLowerCase()
      .split('').filter(char => char >= 'a' && char <= 'z').join('');
    const link = nav.find(node => named(node).indexOf('options') !== -1)
      ?? nav.find(node => letters(node) === 'options');
    if (!link) return false;
    (link as HTMLElement).click();
    return true;
  };
  const itemRows = (table: HTMLTableElement): HTMLTableRowElement[] => {
    const rows: HTMLTableRowElement[] = [];
    for (const select of Array.from(table.querySelectorAll(`select[name*="${ITEMS}"][name*="[parent]"]`))) {
      const row = select.closest('tr');
      if (row && rows.indexOf(row as HTMLTableRowElement) === -1) rows.push(row as HTMLTableRowElement);
    }
    return rows;
  };
  const addButton = (table: HTMLTableElement): HTMLElement | null => {
    for (const node of Array.from(table.querySelectorAll('button, input[type="button"], input[type="submit"], a'))) {
      const label = plain(node.textContent || (node as HTMLInputElement).value).toLowerCase();
      if (label.indexOf('add item') !== -1) return node as HTMLElement;
    }
    return null;
  };
  const rowNumber = (row: Element): string => {
    const select = row.querySelector(`select[name*="${ITEMS}"]`);
    const name = String((select as HTMLSelectElement | null)?.name ?? '');
    const segments = name.split('[').map(segment => segment.split(']')[0] ?? '');
    // The page repeats the items segment: options[sub_options_items][sub_options_items][6][parent].
    // The index is the last items segment followed by a number. Taking the first one returned the
    // word itself, and the lookup below then matched the first row of the table.
    let number = '';
    for (let at = 0; at < segments.length - 1; at += 1) {
      if (segments[at] === 'sub_options_items' && /^\d+$/.test(segments[at + 1] ?? '')) number = segments[at + 1]!;
    }
    return number;
  };
  const setSelect = (select: HTMLSelectElement | null, value: string): boolean => {
    if (!select || !Array.from(select.options).some(option => option.value === value)) return false;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const faceMatches = (select: HTMLSelectElement | null, wanted: string): number => select
    ? Array.from(select.options).filter(option => faceKey(option.text) === wanted).length : 0;
  const selectByText = (select: HTMLSelectElement | null, wanted: string): 'set' | 'missing' | 'ambiguous' => {
    const matches = faceMatches(select, wanted);
    if (matches === 0) return 'missing';
    if (matches > 1) return 'ambiguous';
    const option = Array.from(select!.options).find(candidate => faceKey(candidate.text) === wanted)!;
    return setSelect(select, option.value) ? 'set' : 'missing';
  };
  const rowByNumber = (table: HTMLTableElement, number: string): HTMLTableRowElement | null => {
    if (!number) return null;
    const select = table.querySelector(`select[name*="${ITEMS}[${number}]["]`);
    return (select?.closest('tr') as HTMLTableRowElement | null) ?? null;
  };
  const setInput = (input: HTMLInputElement | null, value: string): boolean => {
    if (!input) return false;
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    return true;
  };
  const sameFaceRows = (table: HTMLTableElement, row: Element, face: string): HTMLTableRowElement[] =>
    itemRows(table).filter(candidate => {
      if (candidate === row) return false;
      const parent = field(candidate, 'parent');
      return parent !== null && faceKey(parent.options[parent.selectedIndex]?.text) === face;
    });
  const sortInput = (row: Element): HTMLInputElement | null =>
    row.querySelector<HTMLInputElement>('input[name*="[sort]"]');
  // The saved order follows the native Sort values, and this page keeps blank values last,
  // so a number would lift the new row above every row of the face. Mirror the face instead:
  // blank stays blank, and a numbered face gets the next number. Existing rows are only read.
  const setPlacementSort = (row: HTMLTableRowElement, same: HTMLTableRowElement[]): void => {
    const input = sortInput(row);
    if (!input) return;
    let highest = 0;
    let numbered = false;
    for (const candidate of same) {
      const value = Number((sortInput(candidate)?.value ?? '').trim());
      if (Number.isFinite(value) && value > 0 && value < 1e6) {
        numbered = true;
        if (value > highest) highest = value;
      }
    }
    setInput(input, numbered ? String(highest + 1) : '');
  };
  interface KnockoutContext { $data?: unknown; $parent?: KnockoutContext | null }
  interface KnockoutLike {
    dataFor: (node: Element) => unknown;
    contextFor: (node: Element) => KnockoutContext | null;
  }
  // Knockout keeps each binding context on the bound node under __ko__<id>. Reading that needs
  // no global, so the record list is reachable even when window.ko and require are absent.
  const directContext = (node: Element): KnockoutContext | null => {
    try {
      for (const key of Object.getOwnPropertyNames(node)) {
        if (key.indexOf('__ko__') !== 0) continue;
        const store = (node as unknown as Record<string, unknown>)[key] as { get?: unknown } | null;
        if (!store || typeof store.get !== 'function') continue;
        const found = (store.get as (target: Element, name: string) => unknown).call(store, node, 'ko_bindingContext');
        if (found && typeof found === 'object' && '$data' in (found as object)) return found as KnockoutContext;
      }
    } catch { return null; }
    return null;
  };
  // The bound node can sit inside the row, so the first bound descendant is used as well.
  const contextOf = (node: Element): KnockoutContext | null => {
    const own = directContext(node);
    if (own) return own;
    let seen = 0;
    for (const child of Array.from(node.querySelectorAll('*'))) {
      if (seen++ > 40) break;
      const found = directContext(child);
      if (found) return found;
    }
    return null;
  };
  const loadKnockout = (): Promise<KnockoutLike | null> => new Promise(resolve => {
    const usable = (candidate: unknown): candidate is KnockoutLike => {
      const value = candidate as KnockoutLike | null;
      return !!value && typeof value.dataFor === 'function' && typeof value.contextFor === 'function';
    };
    const page = (typeof window === 'undefined' ? null : window) as unknown as
      { ko?: unknown; require?: unknown } | null;
    if (page && usable(page.ko)) { resolve(page.ko); return; }
    const requireFn = page?.require ?? (page as { requirejs?: unknown } | null)?.requirejs;
    if (typeof requireFn !== 'function') { resolve(null); return; }
    let settled = false;
    const finish = (value: unknown): void => {
      if (settled) return;
      settled = true;
      resolve(usable(value) ? value : null);
    };
    setTimeout(() => finish(null), 1500);
    try {
      (requireFn as (deps: string[], callback: (module: unknown) => void, errback: () => void) => void)
        (['ko'], finish, () => finish(null));
    } catch { finish(null); }
  });
  let knockoutLoad: Promise<KnockoutLike | null> | null = null;
  const knockout = (): Promise<KnockoutLike | null> => {
    if (!knockoutLoad) knockoutLoad = loadKnockout();
    return knockoutLoad;
  };
  // Save sends the loaded component's record list, not the table nodes, so moving the node
  // alone is lost. That list is not always called elems, so every own property of the view
  // models above the row is tested by shape: it must return the array holding both records.
  type ListWriter = { read: () => unknown[]; write: (next: unknown[]) => boolean };
  const listWriters = (holder: unknown): ListWriter[] => {
    const found: ListWriter[] = [];
    if (holder === null || (typeof holder !== 'object' && typeof holder !== 'function')) return found;
    const seen: unknown[] = [];
    const add = (array: unknown[], write: (next: unknown[]) => boolean): void => {
      if (seen.indexOf(array) !== -1) return;
      seen.push(array);
      found.push({ read: () => array, write });
    };
    const spliceInto = (array: unknown[]) => (next: unknown[]): boolean => {
      try { array.splice(0, array.length, ...next); return true; } catch { return false; }
    };
    // Knockout keeps a list as an observable: a call with no argument reads it.
    const readList = (value: unknown): unknown[] | null => {
      if (Array.isArray(value)) return value as unknown[];
      if (typeof value !== 'function' || value.length > 1) return null;
      try {
        const current = (value as () => unknown).call(holder);
        return Array.isArray(current) ? current as unknown[] : null;
      } catch { return null; }
    };
    const writeList = (value: unknown, array: unknown[], next: unknown[]): boolean => {
      if (Array.isArray(value)) return spliceInto(array)(next);
      try {
        (value as (next: unknown[]) => unknown).call(holder, next);
        const after = (value as () => unknown).call(holder);
        return Array.isArray(after) && after.length === next.length &&
          after.every((entry, at) => entry === next[at]);
      } catch { return false; }
    };
    // The dynamic-rows component keeps its record list as elems, often on its prototype, so that
    // one name is read through the chain. Probing every inherited property would offer unrelated
    // arrays as the posted list, and the caller only accepts one that holds both records.
    let elems: unknown;
    try { elems = (holder as { elems?: unknown }).elems; } catch { elems = null; }
    const direct = readList(elems);
    if (direct) add(direct, next => writeList(elems, direct, next));
    let keys: string[] = [];
    try { keys = Object.getOwnPropertyNames(holder); } catch { return found; }
    for (const key of keys) {
      let descriptor: PropertyDescriptor | undefined;
      try { descriptor = Object.getOwnPropertyDescriptor(holder as object, key); } catch { continue; }
      if (!descriptor) continue;
      let value: unknown;
      try { value = descriptor.get ? descriptor.get.call(holder) : descriptor.value; } catch { continue; }
      const array = readList(value);
      if (array) add(array, next => writeList(value, array, next));
    }
    return found;
  };
  // A row's own bound node is a cell template, so its data is the cell, not the record. Walking
  // up to the first data with an elems list finds the record that Save actually stores; using
  // the cell left the record list unreachable and the added row was saved first.
  const recordOf = (ko: KnockoutLike | null, node: Element): unknown => {
    try {
      let context: KnockoutContext | null = contextOf(node) ?? (ko ? ko.contextFor(node) : null);
      for (let depth = 0; context && depth < 8; depth += 1) {
        const data: unknown = context.$data;
        if (data !== null && (typeof data === 'object' || typeof data === 'function')) {
          let elems: unknown;
          try { elems = (data as { elems?: unknown }).elems; } catch { elems = null; }
          const list = typeof elems === 'function' ? (elems as () => unknown).call(data) : elems;
          if (Array.isArray(list)) return data;
        }
        context = context.$parent ?? null;
      }
    } catch { return null; }
    return null;
  };
  const moveRecordAfter = (ko: KnockoutLike | null, record: unknown, target: unknown, starts: Element[]): boolean => {
    if (!record || !target || record === target) return false;
    try {
      for (const start of starts) {
        let context = contextOf(start) ?? (ko ? ko.contextFor(start) : null);
        for (let depth = 0; context && depth < 32; depth += 1) {
          for (const writer of listWriters(context.$data)) {
            const current = writer.read();
            const at = current.indexOf(record), pivot = current.indexOf(target);
            if (at === -1 || pivot === -1) continue;
            const next = current.slice();
            next.splice(at, 1);
            next.splice(next.indexOf(target) + 1, 0, record);
            if (writer.write(next)) return true;
          }
          context = context.$parent ?? null;
        }
      }
      return false;
    } catch { return false; }
  };
  const faceRows = (table: HTMLTableElement, face: string): HTMLTableRowElement[] =>
    itemRows(table).filter(candidate => {
      const parent = field(candidate, 'parent');
      return parent !== null && faceKey(parent.options[parent.selectedIndex]?.text) === face;
    });
  // A model write re-renders the table, so the order is judged on the live rows, not the node.
  const waitForOrder = async (table: HTMLTableElement, face: string, catalogueId: string): Promise<boolean> => {
    for (let wait = 0; wait < 10; wait += 1) {
      const rows = faceRows(table, face);
      const last = rows[rows.length - 1];
      // The row just added has to be the last one of its face. Looking for the first row that
      // carries the id would find an older copy of the same technique and fail on a duplicate.
      if (last && field(last, 'name_option')?.value === catalogueId) return true;
      await sleep(100);
    }
    return false;
  };
  // Magento's native Add Item puts the new row first. Move it after the last row of the
  // same face so the saved order follows the plan, without changing any other row.
  const placeAfterFace = async (
    table: HTMLTableElement, row: HTMLTableRowElement, face: string, catalogueId: string,
  ): Promise<'none' | 'model' | 'model-unconfirmed' | 'screen' | 'no-ko' | 'no-list'> => {
    const same = sameFaceRows(table, row, face);
    setPlacementSort(row, same);
    const last = same[same.length - 1];
    if (!last) return 'none';
    const ko = await knockout();
    // The record comes from the row's own binding context first, so a missing window.ko no
    // longer hides the list that Save actually reads.
    // The row's bound data can be the cell, the record, or the holder of the list itself, so every
    // candidate is tried and the first pair the record list actually holds wins.
    const candidates = (node: Element): unknown[] => {
      const found: unknown[] = [];
      for (const value of [contextOf(node)?.$data, ko ? ko.dataFor(node) : null, recordOf(ko, node)]) {
        if (value !== null && value !== undefined && found.indexOf(value) === -1) found.push(value);
      }
      return found;
    };
    let moved = false;
    for (const record of candidates(row)) {
      for (const anchor of candidates(last)) {
        if (moved) break;
        moved = moveRecordAfter(ko, record, anchor, [row, last, table]);
      }
      if (moved) break;
    }
    if (moved && await waitForOrder(table, face, catalogueId)) return 'model';
    // Only live nodes are moved: a model write can replace them, and a stale node would duplicate.
    const body = row.parentElement;
    if (body && body.contains(row) && last.parentElement === body && body.contains(last) &&
      !(last.compareDocumentPosition(row) & 4)) {
      body.insertBefore(row, last.nextSibling);
    }
    if (await waitForOrder(table, face, catalogueId)) return moved ? 'model' : 'screen';
    if (moved) return 'model-unconfirmed';
    return ko || candidates(row).length ? 'no-list' : 'no-ko';
  };

  return (async (): Promise<PpApplyPlanReport> => {
    const results: PpApplyPlanResult[] = plan.map(row => ({ face: row.face, technique: row.technique,
      catalogueId: row.catalogueId, outcome: 'failed', reason: 'Not attempted.' }));
    const done = (reason: string, diagnostics?: PpOrderDiagnostics): PpApplyPlanReport => ({ results, reason, diagnostics });
    try {
      openOptionsTab();
      await sleep(150);
      let table: HTMLTableElement | null = null;
      for (let wait = 0; wait < 60 && !table; wait++) {
        table = itemsTable();
        if (!table) {
          if (wait % 20 === 0) openOptionsTab();
          await sleep(100);
        }
      }
      if (!table) { results.forEach(result => { result.reason = 'The Options tab never showed the Items table.'; }); return done('No Items table.'); }
      const button = addButton(table);
      if (!button) { results.forEach(result => { result.reason = 'The native Add Item button was not found.'; }); return done('No Add Item button.'); }
      // Each row is counted, not merely noted: a face that already holds one copy of a technique
      // still has to receive a second copy that the Notion list asks for.
      const pairs = new Map<string, number>();
      for (const row of itemRows(table)) {
        const parent = field(row, 'parent'), option = field(row, 'name_option');
        if (!parent || !option) continue;
        const pair = faceKey(parent.options[parent.selectedIndex]?.text) + '|' + option.value;
        pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
      }
      // A technique Notion lists twice arrives as two plan rows: one present, one add. Only the add
      // rows are sent to the page, so the stored copy the present row already accounts for must be
      // subtracted first, or the add row mistakes it for the copy it has to add.
      const claims = new Map<string, number>();
      const add = addButton(table);
      for (let index = 0; index < plan.length; index++) {
        const wanted = plan[index]!, result = results[index]!;
        if (!/^[1-9]\d{0,15}$/.test(wanted.catalogueId)) { result.outcome = 'skipped'; result.reason = 'No exact catalogue id in the plan.'; continue; }
        // Only a Magento face label may be used. Falling back to the Notion label could pick a
        // different face that happens to share words with it.
        const face = faceKey(wanted.magentoFace);
        if (!face) { result.outcome = 'skipped'; result.reason = 'No Magento face label in the plan.'; continue; }
        // One stored copy satisfies one plan row, so the next copy of the same technique is added.
        const pair = face + '|' + wanted.catalogueId;
        let onFaceNow = pairs.get(pair) ?? 0;
        const claim = typeof wanted.claimed === 'number' && Number.isFinite(wanted.claimed)
          ? Math.max(0, Math.floor(wanted.claimed)) : 0;
        if (claim > 0 && !claims.has(pair)) {
          claims.set(pair, claim);
          onFaceNow = Math.max(0, onFaceNow - claim);
          pairs.set(pair, onFaceNow);
        }
        if (onFaceNow > 0) {
          pairs.set(pair, onFaceNow - 1);
          result.outcome = 'skipped'; result.reason = 'Already on this face.';
          continue;
        }
        const sample = itemRows(table).map(candidate => field(candidate, 'parent')).find(select => select !== null) ?? null;
        const sampleMatches = faceMatches(sample, face);
        if (sampleMatches > 1) { result.outcome = 'skipped'; result.reason = 'More than one Magento face uses this label. No row was added.'; continue; }
        if (sample && sampleMatches === 0) { result.outcome = 'skipped'; result.reason = 'The face is not in the native parent dropdown. No row was added.'; continue; }
        if (!add) { result.reason = 'The native Add Item button disappeared before this row.'; continue; }
        const beforeRows = itemRows(table);
        add.click();
        let row: HTMLTableRowElement | undefined;
        for (let wait = 0; wait < 30 && !row; wait++) {
          await sleep(100);
          const rows = itemRows(table);
          if (rows.length > beforeRows.length) row = rows.find(candidate => beforeRows.indexOf(candidate) === -1) ?? rows[rows.length - 1];
        }
        if (!row) { result.reason = 'Magento did not add an item row.'; continue; }
        const number = rowNumber(row);
        if (!/^\d+$/.test(number)) {
          // Without the row's own index every lookup below falls back to the first row, which
          // would edit a row this lane never created.
          result.reason = 'The new item row has no numeric index. The lane stopped so no other row is edited; delete the new empty row before saving.';
          for (const rest of results.slice(index + 1)) if (rest.reason === 'Not attempted.') rest.reason = 'Stopped after a row could not be identified.';
          break;
        }
        let facePick: 'set' | 'missing' | 'ambiguous' = 'missing';
        for (let wait = 0; wait < 10 && facePick === 'missing'; wait++) {
          facePick = selectByText(field(rowByNumber(table, number) ?? row, 'parent'), face);
          if (facePick === 'missing') await sleep(100);
        }
        if (facePick !== 'set') {
          result.reason = facePick === 'ambiguous'
            ? 'More than one Magento face uses this label. The new row was left empty; delete it before saving.'
            : 'The face was not in the native parent dropdown. The new row was left empty; delete it before saving.';
          continue;
        }
        await sleep(300);
        let live = rowByNumber(table, number) ?? row;
        let optionSet = false;
        // Knockout can fill the technique dropdown after the row appears, so retry briefly.
        for (let wait = 0; wait < 20 && !optionSet; wait++) {
          live = rowByNumber(table, number) ?? live;
          optionSet = setSelect(field(live, 'name_option'), wanted.catalogueId);
          if (!optionSet) await sleep(100);
        }
        if (!optionSet) {
          result.reason = 'The catalogue id was not in the native technique dropdown. The new row was left empty; delete it before saving.';
          continue;
        }
        setInput(live.querySelector<HTMLInputElement>('input[name$="[name]"]'), wanted.catalogueId);
        const store = field(live, 'store_view');
        if (store && store.value === '' && Array.from(store.options).some(option => option.value === '1')) setSelect(store, '1');
        await sleep(250);
        const settled = rowByNumber(table, number) ?? live;
        const parent = field(settled, 'parent'), option = field(settled, 'name_option');
        const parentText = parent ? faceKey(parent.options[parent.selectedIndex]?.text) : '';
        if (parentText === face && option?.value === wanted.catalogueId) {
          const placed = await placeAfterFace(table, settled, face, wanted.catalogueId);
          result.outcome = 'added';
          result.reason = placed === 'model'
            ? 'Added to the form, not saved. Row order set below its face.'
            : placed === 'screen'
              ? 'Added to the form, not saved. Row shown below its face, but its list was not found; check the order before saving.'
              : placed === 'model-unconfirmed'
                ? 'Added to the form, not saved. Its list was reordered but the table did not show it; check the order before saving.'
                : placed === 'no-ko'
                  ? 'Added to the form, not saved. Row moved on screen only: the page model was not reachable. Check the order before saving.'
                  : placed === 'no-list'
                    ? 'Added to the form, not saved. Row moved on screen only: its list was not found. Check the order before saving.'
                    : 'Added to the form, not saved.';
          pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
        } else {
          result.reason = 'The form did not keep the face and catalogue id that were set.';
        }
      }
      // Leave the filled Items visible, so opening the helper tab does not need a click, then
      // normalise the order and the posted indices on the whole table.
      openOptionsTab();
      const placement = await placePpItemRows(plan, false, table);
      const added = results.filter(result => result.outcome === 'added').length;
      const failed = results.filter(result => result.outcome === 'failed').length;
      const order = placement.total
        ? ` Order checked: ${placement.ordered} of ${placement.total} at the end of their face.` : '';
      return done(`${added} added, ${failed} failed, ${results.filter(result => result.outcome === 'skipped').length} skipped. Nothing is saved; review the form and press Save yourself.${order}`, placement.diagnostics);
    } catch {
      return done('The form could not be filled safely. Rows already added stay in the form, so review it before saving.');
    }
  })();
}

/** Read-only account of what the order lane sees, so a failure names its cause. */
export interface PpOrderDiagnostics {
  build: string;
  url: string;
  tableFound: boolean;
  rowCount: number;
  waitedMs: number;
  listFound: boolean;
  listKey: string;
  listLength: number;
  modelOrder: string[];
  modelMoved: boolean;
  ordered: number;
  total: number;
}
export interface PpPlacementReport {
  total: number; ordered: number; modelMoved?: boolean;
  diagnostics?: PpOrderDiagnostics; reason: string;
}

/**
 * Put the planned rows at the end of their face and rewrite the posted field indices to the
 * visible order. Magento sends the item array by index, so a row that only looks moved still
 * saves where its index says. This runs on its own so the save lane can repeat it just before
 * the press, after any re-render. It never edits a value and never deletes a row.
 */
export async function placePpItemRows(plan: PpApplyPlanRow[], assignSort = false,
  providedHost?: HTMLTableElement | null, arrangement: 'append' | 'plan' = 'append'): Promise<PpPlacementReport> {
  // Kept in step with PP_ORDER_BUILD so a report names the code that produced it.
  const build = 'pp-order-4';
  const url = String((typeof location === 'undefined' ? null : location.href) ?? '');
  const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
  // A fresh form does not render the Items until the Options tab opens, so the lane opens it and
  // waits for the real table here. Readiness taken from the page data is not enough: the rows
  // exist in the model before the table is on screen.
  const hasOptionsLink = (): boolean => {
    const nav = Array.from(document.querySelectorAll(
      '.admin__page-nav-items a, .admin__page-nav-items button, .admin__page-nav-link, a[href="#options"]',
    ));
    const words = (value: unknown): string[] =>
      String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const named = (node: Element): string[] => [
      ...words((node as HTMLElement).id),
      ...words(node.getAttribute('data-tab')),
      ...words(String(node.getAttribute('href') ?? '').replace(/^#/, '')),
    ];
    const letters = (node: Element): string => String(node.textContent ?? '').toLowerCase()
      .split('').filter(char => char >= 'a' && char <= 'z').join('');
    return nav.some(node => named(node).indexOf('options') !== -1) || nav.some(node => letters(node) === 'options');
  };
  const openOptionsTab = (): boolean => {
    const nav = Array.from(document.querySelectorAll(
      '.admin__page-nav-items a, .admin__page-nav-items button, .admin__page-nav-link, a[href="#options"]',
    ));
    const words = (value: unknown): string[] =>
      String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const named = (node: Element): string[] => [
      ...words((node as HTMLElement).id),
      ...words(node.getAttribute('data-tab')),
      ...words(String(node.getAttribute('href') ?? '').replace(/^#/, '')),
    ];
    const letters = (node: Element): string => String(node.textContent ?? '').toLowerCase()
      .split('').filter(char => char >= 'a' && char <= 'z').join('');
    const link = nav.find(node => named(node).indexOf('options') !== -1)
      ?? nav.find(node => letters(node) === 'options');
    if (!link) return false;
    (link as HTMLElement).click();
    return true;
  };
  const plain = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const key = (value: unknown): string => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join('');
  const ITEMS = '[sub_options_items]';
  const field = (row: Element, name: string): HTMLSelectElement | null =>
    row.querySelector<HTMLSelectElement>(`select[name*="${ITEMS}"][name*="[${name}]"]`);
  const tableNow = (): HTMLTableElement | null => (Array.from(document.querySelectorAll('table'))
    .find(node => node.querySelector(`select[name*="${ITEMS}"]`)) as HTMLTableElement | undefined) ?? null;
  const startedAt = Date.now();
  let host: HTMLTableElement | null = null;
  let waitedMs = 0;
  if (providedHost && providedHost.isConnected) {
    host = providedHost;
  } else {
    for (let wait = 0; !host && wait < 48; wait += 1) {
      if (wait % 8 === 0) openOptionsTab();
      await sleep(100);
      host = tableNow();
    }
    waitedMs = Date.now() - startedAt;
  }
  const report: PpPlacementReport = { total: plan.length, ordered: 0, reason: '' };
  if (!host) {
    report.reason = 'The Options Items table did not appear, so the order was not set.';
    report.diagnostics = { build, url, tableFound: false, rowCount: 0, waitedMs,
      listFound: false, listKey: '', listLength: 0, modelOrder: [], modelMoved: false,
      ordered: 0, total: report.total };
    return report;
  }
  const itemRows = (): HTMLTableRowElement[] => {
    const rows: HTMLTableRowElement[] = [];
    for (const select of Array.from(host.querySelectorAll(`select[name*="${ITEMS}"][name*="[parent]"]`))) {
      const row = select.closest('tr');
      if (row && rows.indexOf(row as HTMLTableRowElement) === -1) rows.push(row as HTMLTableRowElement);
    }
    return rows;
  };
  const faceOf = (row: Element): string => {
    const parent = field(row, 'parent');
    return parent ? key(parent.options[parent.selectedIndex]?.text) : '';
  };
  const idOf = (row: Element): string => String(field(row, 'name_option')?.value ?? '').trim();
  const sortInput = (row: Element): HTMLInputElement | null =>
    row.querySelector<HTMLInputElement>('input[name*="[sort]"]');
  const setInput = (input: HTMLInputElement | null, value: string): boolean => {
    if (!input) return false;
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
    return true;
  };
  // The model list is ordered by its records, and each row carries the index it was bound at, so
  // the identity of every record is captured before anything moves. Reading those indices after a
  // move only repeats the order the table already shows, which made an unchanged write look like
  // a successful one.
  const seeded = itemRows().map(row => ({ id: idOf(row), face: faceOf(row) }));
  let modelIds: string[] = [];
  const groups: [string, string[]][] = [];
  for (const row of plan) {
    const face = key(row.magentoFace), id = String(row.catalogueId ?? '').trim();
    if (!face || !/^[1-9]\d{0,15}$/.test(id)) continue;
    const group = groups.find(entry => entry[0] === face);
    // Every plan row is kept, including a second row for the same technique on the same face.
    if (!group) groups.push([face, [id]]);
    else group[1].push(id);
  }
  // One lever is left: the dynamic-rows component's own record list, which is the array the page
  // posts and the same array its drag and drop rewrites. Reordering the table nodes, retyping Sort
  // and renaming the posted field indices were each tried live and left the stored order unchanged;
  // the Sort write also re-rendered the rows back into the model order and so undid the move.
  // Save posts the page model, not the table nodes, so a visible order alone is always lost.
  interface Ctx { $data?: unknown; $parent?: Ctx | null }
  const ctxOf = (node: Element): Ctx | null => {
    try {
      for (const key of Object.getOwnPropertyNames(node)) {
        if (key.indexOf('__ko__') !== 0) continue;
        const store = (node as unknown as Record<string, unknown>)[key] as { get?: unknown } | null;
        if (!store || typeof store.get !== 'function') continue;
        const found = (store.get as (target: Element, name: string) => unknown).call(store, node, 'ko_bindingContext');
        if (found && typeof found === 'object' && '$data' in (found as object)) return found as Ctx;
      }
    } catch { return null; }
    return null;
  };
  const levelsOf = (holder: unknown): object[] => {
    const levels: object[] = [];
    try {
      levels.push(holder as object);
      let proto = Object.getPrototypeOf(holder as object) as object | null;
      for (let depth = 0; proto && proto !== Object.prototype && depth < 6; depth += 1) {
        levels.push(proto);
        proto = Object.getPrototypeOf(proto) as object | null;
      }
    } catch { /* an exotic object is treated as having no levels */ }
    return levels;
  };
  // Magento exposes Knockout through requirejs and not as window.ko, so the page module is used
  // when the global is absent. This is how the dynamic-rows component is reached at all.
  interface KnockoutCtx { contextFor: (node: Element) => Ctx | null; dataFor: (node: Element) => unknown }
  let ko: KnockoutCtx | null = null;
  try {
    ko = await new Promise<KnockoutCtx | null>(resolve => {
      const usable = (value: unknown): value is KnockoutCtx =>
        !!value && typeof (value as KnockoutCtx).contextFor === 'function';
      const page = (typeof window === 'undefined' ? null : window) as unknown as
        { ko?: unknown; require?: unknown; requirejs?: unknown } | null;
      if (page && usable(page.ko)) { resolve(page.ko as KnockoutCtx); return; }
      const requireFn = page?.require ?? page?.requirejs;
      if (typeof requireFn !== 'function') { resolve(null); return; }
      let settled = false;
      const finish = (value: unknown): void => { if (settled) return; settled = true; resolve(usable(value) ? value : null); };
      setTimeout(() => finish(null), 2000);
      try {
        (requireFn as (deps: string[], callback: (module: unknown) => void, errback: () => void) => void)
          (['ko'], finish, () => finish(null));
      } catch { finish(null); }
    });
  } catch { ko = null; }
  const itemList = (starter: Element, count: number): { read: () => unknown[]; write: (next: unknown[]) => boolean; key: string } | null => {
    // The records are leaf items, so they carry no `elems` list of their own; the list is matched
    // by length and by holding objects, which is what the component's record array is.
    const wanted = (array: unknown[]): boolean => array.length === count &&
      array.every(entry => entry !== null && (typeof entry === 'object' || typeof entry === 'function'));
    let context: Ctx | null = ctxOf(starter) ?? (ko ? ko.contextFor(starter) : null);
    for (let depth = 0; context && depth < 32; depth += 1) {
      const holder: unknown = context.$data;
      if (holder !== null && (typeof holder === 'object' || typeof holder === 'function')) {
        // Dynamic rows keep the list as `elems`, inherited from the component prototype, so the
        // property is read directly before the own property walk that used to miss it.
        try {
          const direct = (holder as { elems?: unknown }).elems;
          const readDirect = (): unknown => (typeof direct === 'function' ? (direct as () => unknown).call(holder) : direct);
          const current = readDirect();
          if (Array.isArray(current) && wanted(current as unknown[])) {
            return { key: 'elems', read: () => current as unknown[], write: next => {
              try {
                if (typeof direct === 'function') (direct as (next: unknown[]) => unknown).call(holder, next);
                else (current as unknown[]).splice(0, (current as unknown[]).length, ...next);
                const after = readDirect();
                return Array.isArray(after) && after.length === next.length && after.every((entry, at) => entry === next[at]);
              } catch { return false; }
            } };
          }
        } catch { /* a throwing getter is not the list */ }
        let keys: string[] = [];
        try { for (const level of levelsOf(holder)) keys.push(...Object.getOwnPropertyNames(level)); } catch { keys = []; }
        for (const key of keys) {
          let descriptor: PropertyDescriptor | undefined;
          try { descriptor = Object.getOwnPropertyDescriptor(holder as object, key); } catch { continue; }
          if (!descriptor) continue;
          const value: unknown = descriptor.get ? (() => { try { return descriptor.get!.call(holder); } catch { return null; } })() : descriptor.value;
          if (Array.isArray(value)) {
            if (wanted(value)) return { key, read: () => value, write: next => { try { value.splice(0, value.length, ...next); return true; } catch { return false; } } };
            continue;
          }
          if (typeof value !== 'function' || value.length > 1) continue;
          const read = value as () => unknown;
          let current: unknown;
          try { current = read.call(holder); } catch { continue; }
          if (!Array.isArray(current) || !wanted(current as unknown[])) continue;
          const write = value as (next: unknown[]) => unknown;
          return { key, read: () => current as unknown[], write: next => {
            try { write.call(holder, next); const after = read.call(holder); return Array.isArray(after) && after.every((entry, at) => entry === next[at]); } catch { return false; }
          } };
        }
      }
      context = context.$parent ?? null;
    }
    return null;
  };
  // The plan is applied to the record list itself, which is the order the page posts. Records are
  // identified by the catalogue id and face captured before the move, so a record keeps its
  // identity however the table is currently arranged.
  const modelOrder = (): 'none' | 'in-order' | 'moved' | 'refused' => {
    const rows = itemRows();
    if (!rows.length || seeded.length !== rows.length) return 'none';
    const list = itemList(rows[0]!, rows.length);
    if (!list) return 'none';
    const current = list.read();
    if (current.length !== seeded.length) return 'none';
    modelIds = seeded.map(entry => entry.id);
    const order = seeded.map((_, at) => at);
    // 'append' moves the planned rows to the end of their face, in plan order, which is where a
    // newly added row belongs. 'plan' puts them first, so a technique Notion lists first is placed
    // first instead of being pushed behind rows Notion does not name. Both match each plan entry
    // to its own row, so a technique listed twice on a face is moved twice.
    const planFirst = (here: number[], ids: string[]): number[] => {
      const used: number[] = [];
      const arranged: number[] = [];
      for (const id of ids) {
        const match = here.find(original => used.indexOf(original) === -1 && seeded[original]?.id === id);
        if (match === undefined) continue;
        used.push(match);
        arranged.push(match);
      }
      for (const original of here) if (used.indexOf(original) === -1) arranged.push(original);
      return arranged;
    };
    const appendLast = (here: number[], ids: string[]): number[] => {
      const planned = here.filter(original => ids.indexOf(seeded[original]?.id ?? '') !== -1);
      const unplanned = here.filter(original => ids.indexOf(seeded[original]?.id ?? '') === -1);
      // The planned rows still keep the plan order inside the tail they form.
      return [...unplanned, ...planFirst(planned, ids)];
    };
    for (const [face, ids] of groups) {
      const positions = order.map((_, at) => at).filter(at => seeded[order[at]!]?.face === face);
      if (!positions.length) continue;
      const here = positions.map(at => order[at]!);
      const arranged = arrangement === 'plan' ? planFirst(here, ids) : appendLast(here, ids);
      if (arranged.length !== positions.length) continue;
      positions.forEach((at, sequence) => { order[at] = arranged[sequence]!; });
    }
    const next = order.map(original => current[original]);
    if (next.some(entry => entry === undefined)) return 'refused';
    if (next.every((entry, at) => entry === current[at])) return 'in-order';
    // The ids are reported in the order the list now holds, so the count below reads the model
    // that is posted rather than the table, which re-renders a moment later.
    if (!list.write(next)) return 'refused';
    modelIds = order.map(original => seeded[original]?.id ?? '');
    return 'moved';
  };
  const placement = modelOrder();
  report.modelMoved = placement === 'moved' || placement === 'in-order';
  // When requested, assign Sort values per face according to the plan order (1, 2, 3...)
  // so the frontend customer dropdown renders in the correct order.
  if (assignSort) {
    for (const [face, ids] of groups) {
      ids.forEach((id, index) => {
        const wantedSort = String(index + 1);
        const match = itemRows().find(r => {
          if (faceOf(r) !== face) return false;
          if (idOf(r) === id) return true;
          const nameInput = r.querySelector<HTMLInputElement>('input[name*="[name]"]');
          return !!nameInput && nameInput.value.trim() === id;
        });
        if (match) {
          const input = sortInput(match);
          if (input) {
            setInput(input, wantedSort);
            try {
              const ctx = ctxOf(input) ?? (ko ? ko.contextFor(input) : null);
              if (ctx && ctx.$data) {
                const d = ctx.$data as Record<string, unknown>;
                if (typeof d.value === 'function') (d.value as (val: unknown) => void)(wantedSort);
                if (typeof d.sort === 'function') (d.sort as (val: unknown) => void)(wantedSort);
              }
            } catch { /* events already dispatched */ }
          }
        }
      });
    }
  }
  // The plan has to be the tail of its face, in plan order, in the record list that is posted.
  for (const [face, ids] of groups) {
    const order = modelIds.map((id, at) => ({ id, face: seeded[at]?.face ?? '' }))
      .filter(entry => entry.face === face).map(entry => entry.id);
    if (!order.length) continue;
    // The plan has to be the head of its face in plan order, or its tail when the lane appends.
    const placed = arrangement === 'plan'
      ? order.slice(0, ids.length)
      : order.slice(Math.max(0, order.length - ids.length));
    report.ordered += placed.filter((id, at) => id === ids[at]).length;
  }
  const all = itemRows();
  const list = all.length ? itemList(all[0]!, all.length) : null;
  const entries = list ? list.read() : [];
  // Only the three things that decide the outcome are reported: the record list, the order it
  // holds, and how much of the plan that order satisfies.
  report.diagnostics = {
    build, url, tableFound: true, rowCount: all.length, waitedMs,
    listFound: !!list, listKey: list ? list.key : '', listLength: entries.length,
    modelOrder: modelIds.length ? modelIds.slice() : [], modelMoved: report.modelMoved === true,
    ordered: report.ordered, total: report.total,
  };
  if (report.ordered < report.total) {
    report.reason = placement === 'none'
      ? 'The record list that Save posts was not found, so the order was not set.'
      : placement === 'refused'
        ? 'The record list refused the new order, so nothing was changed.'
        : `${report.total - report.ordered} of ${report.total} planned row(s) are not at the end of their face in the record list.`;
  }
  return report;
}
