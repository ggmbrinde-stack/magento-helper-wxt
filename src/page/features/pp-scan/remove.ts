// Remove chosen item rows from an open Magento custom-option form by pressing the row's own
// native delete control, so Magento's handlers, model and validation all run as usual.
// This function is injected into the helper tab's main world, so it must stay self-contained:
// no imports, no module helpers, no references to anything outside its own body.
export interface PpRemovePlanRow { face: string; magentoFace: string; technique: string; catalogueId: string }
export interface PpRemovePlanResult {
  face: string; technique: string; catalogueId: string;
  outcome: 'removed' | 'failed' | 'skipped'; reason: string;
}
export interface PpRemovePlanReport { results: PpRemovePlanResult[]; reason: string }

export function removePpItemRows(plan: PpRemovePlanRow[]): Promise<PpRemovePlanReport> {
  const sleep = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));
  const plain = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const key = (value: unknown): string => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join('');
  const ITEMS = '[sub_options_items]';
  const field = (row: Element, name: string): HTMLSelectElement | null =>
    row.querySelector<HTMLSelectElement>(`select[name*="${ITEMS}"][name*="[${name}]"]`);
  const table = (): HTMLTableElement | null => {
    const found = Array.from(document.querySelectorAll('table'))
      .find(node => node.querySelector(`select[name*="${ITEMS}"]`));
    return (found as HTMLTableElement | undefined) ?? null;
  };
  // Magento renders the Items only once its Options tab opens, and only the nav link does it.
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
  interface KnockoutContext { $data?: unknown; $parent?: KnockoutContext | null }
  // Knockout keeps each binding context on the bound node under __ko__<id>, so the record is
  // reachable without window.ko, which is often absent on these admin pages.
  const directContext = (node: Element): KnockoutContext | null => {
    try {
      for (const name of Object.getOwnPropertyNames(node)) {
        if (name.indexOf('__ko__') !== 0) continue;
        const store = (node as unknown as Record<string, unknown>)[name] as { get?: unknown } | null;
        if (!store || typeof store.get !== 'function') continue;
        const found = (store.get as (target: Element, field: string) => unknown)
          .call(store, node, 'ko_bindingContext');
        if (found && typeof found === 'object' && '$data' in (found as object)) return found as KnockoutContext;
      }
    } catch { return null; }
    return null;
  };
  const contextOf = (node: Element): KnockoutContext | null => {
    const own = directContext(node);
    if (own) return own;
    let seen = 0;
    for (const child of Array.from(node.querySelectorAll('*'))) {
      if (seen++ > 60) break;
      const found = directContext(child);
      if (found) return found;
    }
    return null;
  };
  type ListWriter = { read: () => unknown[]; write: (next: unknown[]) => boolean };
  const listWriters = (holder: unknown): ListWriter[] => {
    const found: ListWriter[] = [];
    if (holder === null || (typeof holder !== 'object' && typeof holder !== 'function')) return found;
    let keys: string[] = [];
    try { keys = Object.getOwnPropertyNames(holder as object); } catch { return found; }
    const seen: unknown[] = [];
    const add = (array: unknown[], write: (next: unknown[]) => boolean): void => {
      if (seen.indexOf(array) !== -1) return;
      seen.push(array);
      found.push({ read: () => array, write });
    };
    const spliceInto = (array: unknown[]) => (next: unknown[]): boolean => {
      try { array.splice(0, array.length, ...next); return true; } catch { return false; }
    };
    for (const name of keys) {
      let descriptor: PropertyDescriptor | undefined;
      try { descriptor = Object.getOwnPropertyDescriptor(holder as object, name); } catch { continue; }
      if (!descriptor) continue;
      if (descriptor.get) {
        let read: unknown;
        try { read = descriptor.get.call(holder); } catch { read = null; }
        if (Array.isArray(read)) add(read as unknown[], spliceInto(read as unknown[]));
        continue;
      }
      const value: unknown = descriptor.value;
      if (Array.isArray(value)) { add(value as unknown[], spliceInto(value as unknown[])); continue; }
      if (typeof value !== 'function' || value.length > 1) continue;
      // Knockout keeps a list as an observable: a call with no argument reads it.
      const read = value as () => unknown;
      const write = value as (next: unknown[]) => unknown;
      let current: unknown;
      try { current = read.call(holder); } catch { continue; }
      if (!Array.isArray(current)) continue;
      add(current as unknown[], next => {
        try {
          write.call(holder, next);
          const after = read.call(holder);
          return Array.isArray(after) && after.length === next.length &&
            after.every((entry, at) => entry === next[at]);
        } catch { return false; }
      });
    }
    return found;
  };
  // Model-level removal: the form posts this very list, so taking the record out of it is the
  // same edit the native delete makes, and the template re-renders without the row.
  const removeFromModel = (row: Element): { record: unknown; writer: ListWriter } | null => {
    let context = contextOf(row);
    const record = context?.$data;
    if (!record || (typeof record !== 'object' && typeof record !== 'function')) return null;
    for (let depth = 0; context && depth < 32; depth += 1) {
      for (const writer of listWriters(context.$data)) {
        const current = writer.read();
        const at = current.indexOf(record);
        if (at === -1) continue;
        const next = current.slice();
        next.splice(at, 1);
        if (writer.write(next)) return { record, writer };
      }
      context = context.$parent ?? null;
    }
    return null;
  };
  // The row's own trash control, which on this page is a bare icon element carrying the word
  // in its class, not a button. The page also has "Delete all" and a header Delete acting on
  // ticked rows, so a control is only pressed when it sits inside the row.
  const marked = (node: Element): boolean => {
    const text = plain(node.textContent).toLowerCase();
    const named = `${
      typeof node.className === 'string' ? node.className : ''
    } ${node.id} ${node.getAttribute('title') ?? ''} ${node.getAttribute('aria-label') ?? ''} ` +
      `${node.getAttribute('data-bind') ?? ''} ${node.getAttribute('data-action') ?? ''} ` +
      `${node.getAttribute('onclick') ?? ''} ${text.length <= 24 ? text : ''}`;
    return /delete|remove|trash/.test(named.toLowerCase());
  };
  const deleteControl = (row: Element): HTMLElement | null => {
    // The native control is a real button carrying the click binding. Its label is the same
    // i18n string the page uses for Delete all, so the text is never used to reject a control
    // that already sits inside this row; the cell is not pressed in its place either.
    const native = Array.from(row.querySelectorAll('button, a, [role="button"]'))
      .filter(node => !/^(input|select|option|optgroup|textarea)$/i.test(node.tagName))
      .filter(node => {
        const named = `${typeof node.className === 'string' ? node.className : ''} ${node.id} ` +
          `${node.getAttribute('title') ?? ''} ${node.getAttribute('aria-label') ?? ''} ` +
          `${node.getAttribute('data-bind') ?? ''} ${node.getAttribute('data-action') ?? ''} ` +
          `${plain(node.textContent).toLowerCase()}`;
        return /delete|remove|trash/.test(named.toLowerCase());
      });
    if (native.length) return native[0] as HTMLElement;
    const nodes = Array.from(row.querySelectorAll('*')).filter(node =>
      !/^(input|select|option|optgroup|textarea|td|th)$/i.test(node.tagName));
    // Children come after their parents, so the scan runs backwards and presses the icon
    // itself rather than a cell or wrapper that happens to carry the same word.
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index]!;
      if (!marked(node)) continue;
      if (nodes.some(other => other !== node && node.contains(other) && marked(other))) continue;
      const holder = node as HTMLElement;
      if (typeof holder.click === 'function') return holder;
      const inner = node.querySelector('button, a, [role="button"], i, span, svg') as HTMLElement | null;
      if (inner) return inner;
    }
    return null;
  };
  // Named so a failed run still says what the row does offer, without needing DevTools.
  const controlReport = (row: Element): string => {
    const nodes = Array.from(row.querySelectorAll('*')).filter(node =>
      node.tagName !== 'TD' && !/^(select|option|optgroup)$/i.test(node.tagName));
    const described = nodes.slice(0, 8).map(node => {
      const name = `${node.tagName.toLowerCase()}` +
        `${node.className && typeof node.className === 'string' ? `.${plain(node.className).split(' ').join('.')}` : ''}` +
        `${node.id ? `#${node.id}` : ''}` +
        `${node.getAttribute('data-bind') ? `[bind=${node.getAttribute('data-bind')}]` : ''}` +
        `${node.getAttribute('title') ? `[title=${node.getAttribute('title')}]` : ''}`;
      return name.slice(0, 80);
    });
    return described.length ? ` Row elements: ${described.join(' | ')}.` : ' The row has no elements at all.';
  };
  // A plain click does not reach handlers bound to pointer or mouse down, so the whole
  // sequence is dispatched before the click itself.
  const press = (node: HTMLElement): void => {
    try {
      // The event classes come from the node's own window, which is the one that dispatches it.
      const view = (node.ownerDocument?.defaultView ?? null) as (Window & typeof globalThis) | null;
      const Mouse = view?.MouseEvent ?? (typeof MouseEvent === 'function' ? MouseEvent : null);
      const Pointer = (view as { PointerEvent?: typeof PointerEvent } | null)?.PointerEvent ??
        (typeof PointerEvent === 'function' ? PointerEvent : null);
      const options: MouseEventInit = { bubbles: true, cancelable: true, view, button: 0 };
      if (Pointer) {
        const PointerCtor = Pointer as unknown as new (type: string, init?: PointerEventInit) => Event;
        node.dispatchEvent(new PointerCtor('pointerdown', { ...options, pointerType: 'mouse', isPrimary: true }));
      }
      if (Mouse) {
        const MouseCtor = Mouse as unknown as new (type: string, init?: MouseEventInit) => Event;
        node.dispatchEvent(new MouseCtor('mousedown', options));
        node.dispatchEvent(new MouseCtor('mouseup', options));
      }
    } catch { /* the click below still runs */ }
    try { node.click(); } catch { /* nothing else to try */ }
  };
  // Computed styles come from the node's own window, which is the one that renders it.
  const styleOf = (node: Element): CSSStyleDeclaration | null => {
    try {
      const view = node.ownerDocument?.defaultView as (Window & typeof globalThis) | null;
      return view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(node) : null;
    } catch { return null; }
  };
  const visible = (node: Element): boolean => {
    const style = styleOf(node);
    return !!style && style.display !== 'none' && style.visibility !== 'hidden';
  };
  // Magento sometimes asks for a confirmation. Only its own accept button is pressed, and only
  // after the dashboard's explicit confirmation listed these very rows.
  const acceptDialog = (): boolean => {
    const modals = Array.from(document.querySelectorAll(
      '.modal-popup, .modal-slide, .admin__modal, [role="dialog"], .modal-inner-wrap',
    ));
    for (const modal of modals) {
      if (!visible(modal)) continue;
      const accept = modal.querySelector(
        'button.action-primary, button.action-accept, button[data-action="accept"], [data-role="action"] button',
      ) as HTMLElement | null;
      if (accept) { accept.click(); return true; }
    }
    return false;
  };
  // Named in a failure so the next report says whether Magento asked something first.
  const dialogReport = (): string => {
    const modals = Array.from(document.querySelectorAll(
      '.modal-popup, .modal-slide, .admin__modal, [role="dialog"]',
    )).filter(modal => visible(modal));
    return modals.length ? ` A dialog is open: ${modals.map(modal => modal.className || modal.tagName).join(' | ')}.` : '';
  };
  // Knockout hides a deleted row through its visible binding instead of detaching it, so a
  // hidden row counts as gone, the same as a removed one.
  // Only the table itself is inspected: a closed tab panel further up hides every row and
  // would otherwise read as a removal that never happened.
  const hiddenRow = (row: Element): boolean => {
    let node: Element | null = row;
    for (let depth = 0; node && depth < 8; depth += 1) {
      const style = styleOf(node);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return true;
      if (node === host) break;
      node = node.parentElement;
    }
    return false;
  };
  const gone = async (row: Element): Promise<boolean> => {
    for (let wait = 0; wait < 8; wait += 1) {
      if (!host || !host.contains(row)) return true;
      if (hiddenRow(row)) return true;
      await sleep(100);
    }
    return false;
  };
  // Deleting a row leaves index gaps, and the posted array follows those indices.
  const renumber = (): void => {
    const rows = itemRows();
    // A row that Magento only hid keeps its old index. Renumbering the visible rows alone would
    // give them the same names, so nothing is renamed while a hidden row is still in the table.
    if (rows.some(row => hiddenRow(row))) return;
    rows.forEach((row, order) => {
      for (const node of Array.from(row.querySelectorAll('input[name], select[name], textarea[name]'))) {
        const name = String(node.getAttribute('name') ?? '');
        if (name.indexOf(ITEMS) === -1) continue;
        // The index is the number that follows the last items segment. This page repeats the
        // segment name, so looking for the first occurrence would rewrite the wrong part.
        const segments = name.split('[');
        let numeric = -1;
        for (let at = 0; at < segments.length - 1; at += 1) {
          if (!/^\d+\]$/.test(segments[at + 1]!) || !/items\]$/.test(segments[at]!)) continue;
          numeric = at + 1;
          break;
        }
        if (numeric === -1) continue;
        segments[numeric] = String(order) + ']';
        node.setAttribute('name', segments.join('['));
      }
    });
  };
  const results: PpRemovePlanResult[] = plan.map(row => ({ face: row.face, technique: row.technique,
    catalogueId: row.catalogueId, outcome: 'failed', reason: 'Not attempted.' }));
  const done = (reason: string): PpRemovePlanReport => ({ results, reason });
  let host: HTMLTableElement | null = null;
  const itemRows = (): HTMLTableRowElement[] => {
    const rows: HTMLTableRowElement[] = [];
    if (!host) return rows;
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
  return (async (): Promise<PpRemovePlanReport> => {
    try {
      openOptionsTab();
      await sleep(200);
      host = table();
      for (let wait = 0; wait < 60 && !host; wait += 1) {
        if (wait % 20 === 0) openOptionsTab();
        await sleep(100);
        host = table();
      }
      if (!host) {
        results.forEach(result => { result.reason = 'The Options tab never showed the Items table.'; });
        return done('No Items table.');
      }
      for (let index = 0; index < plan.length; index += 1) {
        const wanted = plan[index]!, result = results[index]!;
        const face = key(wanted.magentoFace);
        const id = String(wanted.catalogueId ?? '').trim();
        if (!face || !/^[1-9]\d{0,15}$/.test(id)) {
          result.outcome = 'skipped'; result.reason = 'No exact Magento face and catalogue id in the request.';
          continue;
        }
        // A row Magento only hid is still in the table, so it is never chosen or pressed twice.
        // That leaves the next copy of the same technique free for the next plan row.
        const row = itemRows().find(candidate => faceOf(candidate) === face && idOf(candidate) === id &&
          !hiddenRow(candidate));
        if (!row) { result.outcome = 'skipped'; result.reason = 'That row is not in this form.'; continue; }
        // The delete cell is the last one Knockout renders, so the control can appear after
        // the brief wait that follows the tab click.
        let control = deleteControl(row);
        for (let wait = 0; !control && wait < 8; wait += 1) { await sleep(100); control = deleteControl(row); }
        const model = control ? null : removeFromModel(row);
        if (!control && !model) {
          result.reason = 'No delete control and the row is not in a list this page posts.' + controlReport(row);
          continue;
        }
        if (control) {
          // The icon may not be the element that carries the handler, so the press is a full
          // pointer and mouse sequence, repeated on the wrappers inside the row until it goes.
          const targets: HTMLElement[] = [control];
          let above = control.parentElement;
          for (let depth = 0; depth < 3 && above && row.contains(above); depth += 1) {
            targets.push(above);
            above = above.parentElement;
          }
          // The parent cell is only pressed when it holds this very control, so a row whose
          // last cell means something else is never clicked by accident.
          const lastCell = row.lastElementChild as HTMLElement | null;
          if (lastCell && lastCell.contains(control) && targets.indexOf(lastCell) === -1) targets.push(lastCell);
          for (const target of targets) {
            press(target);
            await sleep(250);
            if (acceptDialog()) await sleep(250);
            if (await gone(row)) break;
          }
          if (await gone(row)) {
            result.outcome = 'removed'; result.reason = 'Removed from the form, not saved.';
          } else {
            result.reason = 'Magento did not remove the row. Delete it yourself in the helper tab before saving.' +
              ' Pressed ' + String(control.outerHTML).slice(0, 200) + '.' + dialogReport();
          }
          continue;
        }
        // The list is the posted state, so its contents confirm the removal even before the
        // template re-renders the table.
        if (model!.writer.read().indexOf(model!.record) !== -1) {
          result.reason = 'The row was taken out of the list but Magento put it back. Delete it yourself in the helper tab.';
        } else {
          result.outcome = 'removed';
          result.reason = 'Removed through the form\'s own row list, not saved. Check the row is gone on screen.';
        }
      }
      renumber();
      const removed = results.filter(result => result.outcome === 'removed').length;
      const failed = results.filter(result => result.outcome === 'failed').length;
      return done(`${removed} removed, ${failed} failed, ${results.filter(result => result.outcome === 'skipped').length} skipped. Nothing is saved; review the form and press Save yourself.`);
    } catch {
      return done('The form could not be changed safely. Rows already removed stay removed in this form, so review it before saving.');
    }
  })();
}
