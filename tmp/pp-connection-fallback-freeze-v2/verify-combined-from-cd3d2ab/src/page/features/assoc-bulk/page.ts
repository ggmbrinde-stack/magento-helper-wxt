// The page-world half of the bulk-SKU feature.
//
// This function is injected with `chrome.scripting.executeScript({ world:
// 'MAIN' })`, which is the only way to reach the modal's Knockout model: the
// content script lives in an isolated world and cannot see `ko`, `window.require`
// or the observables behind the grid. Because `executeScript` serialises the
// function by its source text, THIS FUNCTION MUST BE SELF-CONTAINED — no imports,
// no module helpers, no closures over module scope, nothing but its own body and
// its arguments. (Types are fine: they are erased.)
//
// Why not simply click rows: the listing holds 200k products and shows 20 at a
// time, so a SKU is usually not on the page. The modal's multiselect keeps its
// selection in `$col.selected` (`staticChecked`, `totalSelected` and the parent
// insert-listing all read that array), so that array is what "selected" means.
// We resolve each pasted SKU through the modal's OWN SKU filter — the input and
// Apply button an operator uses — so the answer is scoped to products this
// parent may actually use, then push the ids into `selected` and tick whatever
// rows are visible so the screen agrees with the model.
//
// Nothing is saved: the operator still presses Done (or Cancel) in the modal.

/** One SKU that resolved to a product id in this listing. */
export interface AssocBulkHit {
  /** Kept as the model stores it: the grid may use numbers or strings. */
  id: string | number;
  sku: string;
}

/** What the injected run reports back, for the panel's status line. */
export interface AssocBulkReport {
  ok: boolean;
  /** Set when the run could not start; the message is operator-facing. */
  reason?: string;
  requested: number;
  found: number;
  /** SKUs the listing never answered with a row. */
  missing: string[];
  /** SKUs that are already children of this configurable, so they were skipped. */
  already: string[];
  /** True when the operator stopped the run before the selection step. */
  cancelled: boolean;
  /** Ids added to the selection by this run. */
  added: number;
  selectedBefore: number;
  selectedAfter: number;
  totalSelected: number | null;
  /** Boxes clicked on screen, so the visible page matches the model. */
  tickedOnScreen: number;
  /** SKUs that needed a filter round-trip (the ones not already on screen). */
  filterPasses: number;
}

/**
 * Resolve `skus` in the open "Select Associated Product" modal and select them.
 *
 * Returns a report instead of throwing for expected dead ends (modal not open,
 * `ko` unavailable, no rows yet) so the panel can say what to do next.
 */
export async function selectAssociatedSkus(skus: string[]): Promise<AssocBulkReport> {
  const T0 = Date.now();
  const log = (msg: string): void => {
    console.log(`[mhx bulk ${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);
  };
  const squash = (v: unknown): string =>
    String(v === null || v === undefined ? '' : v)
      .replace(/\s+/g, ' ')
      .trim();
  const visible = (el: Element | null): boolean => Boolean(el && el.getClientRects().length);
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const empty = (reason: string): AssocBulkReport => ({
    ok: false,
    reason,
    requested: skus.length,
    found: 0,
    missing: [],
    already: [],
    cancelled: false,
    added: 0,
    selectedBefore: 0,
    selectedAfter: 0,
    totalSelected: null,
    tickedOnScreen: 0,
    filterPasses: 0,
  });

  // Shared DOM attribute, because the isolated-world panel and this MAIN-world
  // function cannot share variables. The panel sets it on Stop.
  const stopped = (): boolean =>
    document.documentElement.getAttribute('data-mhx-assoc-bulk-cancel') === '1';

  // ---- 1. the modal, its rows and its selection model ---------------------
  const modals: Element[] = [];
  document
    .querySelectorAll('aside[class*="configurable_associated_product_modal"]')
    .forEach((el) => {
      if (visible(el)) modals.push(el);
    });
  const modal = modals.length > 0 ? modals[modals.length - 1] : null;
  if (!modal) {
    return empty('The "Select Associated Product" window is not open.');
  }

  const requireFn = (window as unknown as { require?: unknown }).require;
  if (typeof requireFn !== 'function') {
    return empty('This page did not load RequireJS, so the grid cannot be read.');
  }

  const firstBox =
    modal.querySelector('tbody tr input[data-action="select-row"]') ??
    modal.querySelector('tbody tr input[type="checkbox"]');
  if (!firstBox) {
    return empty('The product grid in that window has no rows yet.');
  }

  // `ko` is usually only reachable through RequireJS on this build, but take the
  // global when a module happens to expose it.
  const globalKo = (window as unknown as { ko?: Record<string, any> }).ko;
  let ko: Record<string, any> | null =
    globalKo && typeof globalKo['dataFor'] === 'function' ? globalKo : null;
  if (!ko) {
    ko = await new Promise<Record<string, any> | null>((resolve) => {
      try {
        (
          requireFn as (names: string[], ok: (m: any) => void, fail: (e: any) => void) => void
        )(
          ['ko'],
          (mod: any) => resolve(mod),
          () => resolve(null),
        );
      } catch (err) {
        resolve(null);
      }
    });
  }
  if (!ko) return empty('Knockout did not load, so the selection cannot be reached.');

  /**
   * The multiselect column behind the row checkbox.
   *
   * `ko.dataFor` is not reliable here: Magento renders the cell with the
   * `fastForEach` binding (`as: '$col'`) inside `repeat` (`item: '$row'`), so
   * `$data` can be the listing or the row. The binding that actually owns the
   * checkbox is `staticChecked: $col.selected`, so the column is in the binding
   * context as `$col`; read that first and fall back to the contexts above it.
   */
  const asColumn = (value: any): Record<string, any> | null => {
    if (!value) return null;
    if (typeof value.selected === 'function' && typeof value.indexField === 'string') {
      return value;
    }
    if (typeof value === 'function') {
      try {
        const inner = value();
        if (
          inner &&
          typeof inner.selected === 'function' &&
          typeof inner.indexField === 'string'
        ) {
          return inner;
        }
      } catch (err) {
        // A getter that throws is not the column.
      }
    }
    return null;
  };

  let col: Record<string, any> | null = null;
  const context =
    typeof ko['contextFor'] === 'function' ? ko['contextFor'](firstBox) : null;
  if (context) {
    col = asColumn(context.$col) ?? asColumn(context.$data);
    for (let node = context.$parent; !col && node; node = node.$parent) {
      col = asColumn(node.$col) ?? asColumn(node.$data);
    }
  }
  if (!col && typeof ko['dataFor'] === 'function') {
    col = asColumn(ko['dataFor'](firstBox));
  }
  if (!col) {
    return empty('The grid behind this window is not the expected Magento listing.');
  }

  const skuInput = modal.querySelector<HTMLInputElement>('input[name="sku"]');
  const applyBtn = modal.querySelector<HTMLElement>('[data-action="grid-filter-apply"]');
  if (!skuInput || !applyBtn) {
    return empty('The SKU filter in that window was not found.');
  }
  // Put back whatever the operator had narrowed the grid to.
  const initialFilter = squash(skuInput.value);

  const rows = (): any[] => {
    const value = typeof col.rows === 'function' ? col.rows.peek() : col.rows;
    return Array.isArray(value) ? value : [];
  };
  const skuOf = (row: any): string =>
    squash(row && (row.sku ?? (row.data && row.data.sku))).toUpperCase();
  const idOf = (row: any): string | number | null => {
    if (!row) return null;
    const raw =
      row[col.indexField] ??
      row.entity_id ??
      row.id ??
      (row.data && (row.data[col.indexField] ?? row.data.entity_id));
    if (raw === null || raw === undefined || raw === '') return null;
    return raw as string | number;
  };
  /** The selection array, whether the component exposes it as an observable. */
  const selection = (): any[] => {
    const value = typeof col.selected === 'function' ? col.selected.peek() : col.selected;
    return Array.isArray(value) ? value : [];
  };
  const excluded = (): any[] => {
    const value = typeof col.excluded === 'function' ? col.excluded.peek() : col.excluded;
    return Array.isArray(value) ? value : [];
  };
  const isExcludeMode = (): boolean =>
    typeof col.excludeMode === 'function' ? Boolean(col.excludeMode.peek()) : false;

  const fingerprint = (): string => {
    const body = modal.querySelectorAll('tbody tr').length;
    const parts: string[] = [];
    rows().forEach((row) => {
      parts.push(skuOf(row));
    });
    return `${parts.join('|')}#${body}`;
  };

  /** True once the grid itself says this filter found nothing. */
  const noRecords = (): boolean => {
    if (modal.querySelector('.data-grid-tr-no-data')) return true;
    return /(^|\D)0\s+(records|registos|registros)\s+found/i.test(
      modal.textContent ?? '',
    );
  };

  /**
   * Wait for a finished reload: not busy, rows changed, then held still.
   *
   * A filter that matches nothing never changes the row list, so it would
   * otherwise sit here for the full cap. When the grid says "0 records found"
   * after the loading mask has cleared, the answer is final: there is no row
   * to wait for. `cancelable` is false for the restore pass, which must finish
   * even after the operator pressed Stop.
   */
  const settle = async (
    prev: string,
    cap = 9000,
    cancelable = true,
  ): Promise<boolean> => {
    const start = Date.now();
    let last = '';
    while (Date.now() - start < cap) {
      if (cancelable && stopped()) return false;
      await sleep(200);
      let busy = false;
      modal.querySelectorAll('.admin__data-grid-loading-mask').forEach((mask) => {
        if (visible(mask)) busy = true;
      });
      if (busy) {
        last = '';
        continue;
      }
      // Give the request a moment to start before believing an empty grid.
      if (Date.now() - start >= 900 && noRecords()) return true;
      const now = fingerprint();
      if (now !== prev && now === last) return true;
      last = now;
    }
    return false;
  };

  /** Drive the modal's own SKU filter, exactly as an operator would. */
  const applyFilter = async (value: string, cancelable = true): Promise<boolean> => {
    const before = fingerprint();
    skuInput.value = value;
    skuInput.dispatchEvent(new Event('input', { bubbles: true }));
    skuInput.dispatchEvent(new Event('change', { bubbles: true }));
    applyBtn.click();
    return settle(before, 9000, cancelable);
  };

  /** Matching rows read straight off the rendered table (model-free fallback). */
  const domMatches = (sku: string): AssocBulkHit[] => {
    const table = modal.querySelector('table.data-grid');
    if (!table) return [];
    const head: Element[] = [];
    table.querySelectorAll('thead th').forEach((th) => {
      head.push(th);
    });
    let skuCol = -1;
    for (let i = 0; i < head.length; i += 1) {
      const th = head[i];
      if (!th) continue;
      const text = squash(th.textContent ?? '');
      if (/^sku$/i.test(text)) {
        skuCol = i;
        break;
      }
    }
    if (skuCol < 0) return [];
    const out: AssocBulkHit[] = [];
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const cell = tr.children[skuCol];
      if (squash(cell && cell.textContent).toUpperCase() !== sku.toUpperCase()) return;
      const box = tr.querySelector<HTMLInputElement>('input[type="checkbox"]');
      if (!box) return;
      // Prefer the row's own id from the binding context: `box.value` is always
      // a string, while the selection array may hold numbers.
      let id: string | number = box.value;
      try {
        const boxContext =
          typeof ko['contextFor'] === 'function' ? ko['contextFor'](box) : null;
        const rowValue = boxContext && boxContext.$row;
        const rowObj = typeof rowValue === 'function' ? rowValue() : rowValue;
        const raw = rowObj && rowObj[col.indexField];
        if (raw !== null && raw !== undefined && raw !== '') id = raw as string | number;
      } catch (err) {
        // Fall back to the DOM value.
      }
      out.push({ id: id, sku: sku });
    });
    return out;
  };

  // ---- 2. what is already a child of this configurable ---------------------
  // Selecting an already-associated product again does not fail, but it is a
  // pointless filter round-trip per SKU and can look like the run is stuck. The
  // matrix component holds the truth in `unionInsertData`; read it through the
  // UI registry first, then the Knockout contexts, then the rendered matrix.
  const readAssociated = async (): Promise<string[]> => {
    const keys: string[] = [];
    const keyOf = (value: unknown): string => squash(value).toUpperCase();
    const unwrapRows = (value: any): any[] | null => {
      try {
        const inner =
          typeof value === 'function' && typeof value.peek === 'function'
            ? value.peek()
            : value;
        return Array.isArray(inner) ? inner : null;
      } catch (err) {
        return null;
      }
    };
    const collect = (rows: any[] | null): void => {
      if (!rows) return;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const key = keyOf(row && (row.sku ?? (row.data && row.data.sku)));
        if (key) keys.push(key);
      }
    };

    // 2a. the variations matrix component, wherever it is registered.
    try {
      const registry = await new Promise<any>((resolve) => {
        const start = Date.now();
        const finish = (value: any): void => {
          clearInterval(timer);
          resolve(value);
        };
        const timer = setInterval(() => {
          if (stopped() || Date.now() - start >= 9000) finish(null);
        }, 100);
        try {
          (
            requireFn as (names: string[], ok: (m: any) => void, fail: (e: any) => void) => void
          )(
            ['uiRegistry'],
            (mod: any) => finish(mod),
            () => finish(null),
          );
        } catch (err) {
          finish(null);
        }
      });
      if (registry && typeof registry.filter === 'function') {
        const matrices = registry.filter(
          (item: any) => item && typeof item.unionInsertData === 'function',
        );
        for (let i = 0; i < matrices.length && keys.length === 0; i += 1) {
          collect(unwrapRows(matrices[i].unionInsertData));
        }
        if (keys.length === 0) {
          const variations = registry.filter(
            (item: any) =>
              item &&
              typeof item.getVariationKey === 'function' &&
              (Array.isArray(item.variations) ||
                typeof item.value === 'function'),
          );
          for (let i = 0; i < variations.length && keys.length === 0; i += 1) {
            collect(variations[i].variations);
            collect(unwrapRows(variations[i].value));
          }
        }
      }
    } catch (err) {
      // The registry is optional: the context walk below still works.
    }

    // 2b. the same component through the binding contexts around the grid.
    if (keys.length === 0) {
      const seen: any[] = [];
      const inspect = (obj: any): void => {
        if (!obj || typeof obj !== 'object' || seen.indexOf(obj) !== -1) return;
        seen.push(obj);
        collect(unwrapRows(obj.unionInsertData));
      };
      if (context) {
        inspect(context.$data);
        const parents = context.$parents;
        if (parents && parents.length) {
          for (let i = 0; i < parents.length; i += 1) inspect(parents[i]);
        }
      }
    }

    // 2c. the rendered matrix, when neither model path answered.
    if (keys.length === 0) {
      const scopes = [
        document.querySelector('#product-variations-matrix'),
        document.querySelector('#configurable_associated_products'),
        document.querySelector('[data-index="associated"]'),
      ];
      for (let i = 0; i < scopes.length && keys.length === 0; i += 1) {
        const scope = scopes[i];
        if (!scope) continue;
        const tables = scope.querySelectorAll('table');
        for (let t = 0; t < tables.length && keys.length === 0; t += 1) {
          const table = tables[t];
          if (!table) continue;
          const heads = table.querySelectorAll('thead th');
          let skuCol = -1;
          for (let c = 0; c < heads.length; c += 1) {
            const th = heads[c];
            if (!th) continue;
            const column = (th.getAttribute('data-column') ?? '').toLowerCase();
            if (column === 'sku' || squash(th.textContent).toUpperCase() === 'SKU') {
              skuCol = c;
              break;
            }
          }
          if (skuCol < 0) continue;
          table.querySelectorAll('tbody tr').forEach((tr) => {
            const cell = tr.children[skuCol];
            if (!cell) return;
            const input = cell.querySelector('input');
            const key = keyOf(
              input instanceof HTMLInputElement ? input.value : cell.textContent,
            );
            if (key) keys.push(key);
          });
        }
      }
    }

    return keys;
  };

  // ---- 3. resolve ---------------------------------------------------------
  const found: AssocBulkHit[] = [];
  const missing: string[] = [];
  const already: string[] = [];
  const associated = new Set<string>(await readAssociated());
  let filterPasses = 0;
  let cancelled = false;

  /** Tell the panel which SKU is being resolved, across the world boundary. */
  const emitProgress = (index: number, sku: string): void => {
    try {
      // Literal, not the module constant: `executeScript` serialises only this
      // function's source, so module-scope names do not exist in the page.
      document.dispatchEvent(
        new CustomEvent('mhx-assoc-bulk-progress', {
          detail: JSON.stringify({ done: index + 1, total: skus.length, sku: sku }),
        }),
      );
    } catch (err) {
      // Another world refusing the event must never stop the run.
    }
  };

  // An index loop, not `skus.entries()`: this admin page replaces
  // `Array.prototype.entries` with something that is not iterable.
  for (let index = 0; index < skus.length; index += 1) {
    if (stopped()) {
      cancelled = true;
      break;
    }
    const sku = skus[index] ?? '';

    // Already a child: selecting it again adds nothing, and filtering for it
    // would spend a round-trip only to land on the same row. Skip it.
    if (associated.has(squash(sku).toUpperCase())) {
      already.push(sku);
      log(`  ${index + 1}/${skus.length} ${sku}: already associated, skipped`);
      emitProgress(index, sku);
      continue;
    }

    let hits: AssocBulkHit[] = [];
    const onGrid = rows();
    for (let i = 0; i < onGrid.length; i += 1) {
      const row = onGrid[i];
      if (skuOf(row) === sku.toUpperCase()) {
        const id = idOf(row);
        if (id) hits.push({ id: id, sku: skuOf(row) });
      }
    }

    let changed = false;
    if (hits.length === 0) {
      filterPasses += 1;
      changed = await applyFilter(sku);
      if (stopped()) {
        cancelled = true;
        emitProgress(index, sku);
        break;
      }
      const after = rows();
      for (let i = 0; i < after.length; i += 1) {
        if (skuOf(after[i]) === sku.toUpperCase()) {
          const id = idOf(after[i]);
          if (id) hits.push({ id: id, sku: skuOf(after[i]) });
        }
      }
      if (hits.length === 0) hits = domMatches(sku);
      if (!changed && hits.length === 0 && !noRecords()) {
        log(`  ${index + 1}/${skus.length} ${sku}: the grid did not answer in time`);
        missing.push(sku);
        emitProgress(index, sku);
        continue;
      }
    }

    if (hits.length === 0) {
      log(`  ${index + 1}/${skus.length} ${sku}: no row in this listing`);
      missing.push(sku);
    } else {
      log(`  ${index + 1}/${skus.length} ${sku}: id ${hits.map((h) => h.id).join(', ')}`);
      for (let i = 0; i < hits.length; i += 1) {
        const hit = hits[i];
        if (!hit) continue;
        let seen = false;
        for (let j = 0; j < found.length; j += 1) {
          const foundHit = found[j];
          if (foundHit && String(foundHit.id) === String(hit.id)) {
            seen = true;
            break;
          }
        }
        if (!seen) found.push(hit);
      }
    }

    emitProgress(index, sku);
  }

  // ---- 4. leave the grid as it was found ----------------------------------
  // Pressing Stop while the grid works must still put the filter back, so the
  // restore pass ignores the cancel flag.
  if (cancelled || stopped()) cancelled = true;
  if (squash(skuInput.value) !== initialFilter) {
    if (!(await applyFilter(initialFilter, false))) {
      return {
        ...empty('Could not confirm the grid filter was restored. No selection was applied; check the grid before retrying.'),
        found: found.length,
        missing,
        already,
        filterPasses,
        cancelled: cancelled || stopped(),
        selectedBefore: selection().length,
        selectedAfter: selection().length,
        totalSelected:
          typeof col.totalSelected === 'function' ? col.totalSelected.peek() : null,
      };
    }
    log(initialFilter ? `filter restored (${initialFilter})` : 'filter cleared');
  }

  // ---- 5. a stopped run changes nothing ------------------------------------
  if (cancelled || stopped()) {
    const stillSelected = selection().length;
    const report: AssocBulkReport = {
      ok: true,
      cancelled: true,
      requested: skus.length,
      found: found.length,
      missing: missing,
      already: already,
      added: 0,
      selectedBefore: stillSelected,
      selectedAfter: stillSelected,
      totalSelected:
        typeof col.totalSelected === 'function' ? col.totalSelected.peek() : null,
      tickedOnScreen: 0,
      filterPasses: filterPasses,
    };
    log(`stopped: ${found.length}/${skus.length} resolved, selection unchanged`);
    return report;
  }

  // ---- 6. select ----------------------------------------------------------
  // Visible rows first, through the checkbox an operator would click, so the
  // page's own handler runs too. Ids for off-page products then go straight
  // into `selected`, which is the array `totalSelected` counts.
  //
  // Ids keep the type the grid uses (often numbers from JSON, always strings
  // in `box.value`). Mixing the two silently breaks `staticChecked`, which
  // compares with strict `indexOf`, so the ticks would disappear again.
  const wanted: Array<string | number> = [];
  for (let i = 0; i < found.length; i += 1) {
    const hit = found[i];
    if (hit && hit.id !== null && hit.id !== undefined && hit.id !== '') {
      wanted.push(hit.id);
    }
  }
  const sameId = (a: unknown, b: unknown): boolean => String(a) === String(b);
  const isWanted = (id: unknown): boolean => {
    for (let i = 0; i < wanted.length; i += 1) if (sameId(wanted[i], id)) return true;
    return false;
  };

  const before = selection().slice();

  let tickedOnScreen = 0;
  modal.querySelectorAll<HTMLInputElement>('tbody tr input[type="checkbox"]').forEach((box) => {
    if (!isWanted(box.value) || box.checked || box.disabled) return;
    box.click();
    tickedOnScreen += 1;
  });

  const afterClicks = selection();
  const merged: any[] = afterClicks.slice();
  let added = 0;
  for (let i = 0; i < wanted.length; i += 1) {
    const wid = wanted[i];
    if (wid === undefined) continue;
    let present = false;
    for (let j = 0; j < merged.length; j += 1) {
      if (sameId(merged[j], wid)) {
        present = true;
        break;
      }
    }
    if (present) continue;
    merged.push(wid);
    added += 1;
  }
  if (added > 0) {
    if (typeof col.selected === 'function') {
      col.selected(merged);
    } else if (Array.isArray(col.selected)) {
      for (let i = afterClicks.length; i < merged.length; i += 1) {
        col.selected.push(merged[i]);
      }
    }
  }

  // "Select all" mode lists ids to REMOVE, so an id that was excluded has to
  // leave that list before it can count as selected.
  if (isExcludeMode()) {
    const current = excluded();
    const kept: any[] = [];
    for (let i = 0; i < current.length; i += 1) {
      const id = current[i];
      let selectedNow = false;
      for (let j = 0; j < merged.length; j += 1) {
        if (sameId(merged[j], id)) {
          selectedNow = true;
          break;
        }
      }
      if (!selectedNow) kept.push(id);
    }
    if (kept.length !== current.length) {
      if (typeof col.excluded === 'function') {
        col.excluded(kept);
      } else if (Array.isArray(col.excluded)) {
        col.excluded.length = 0;
        for (let i = 0; i < kept.length; i += 1) col.excluded.push(kept[i]);
      }
    }
  }

  const selectedAfter = selection();

  const report: AssocBulkReport = {
    ok: true,
    cancelled: false,
    requested: skus.length,
    found: found.length,
    missing: missing,
    already: already,
    added: added,
    selectedBefore: before.length,
    selectedAfter: selectedAfter.length,
    totalSelected:
      typeof col.totalSelected === 'function' ? col.totalSelected.peek() : null,
    tickedOnScreen: tickedOnScreen,
    filterPasses: filterPasses,
  };
  log(
    `done: ${found.length}/${skus.length} resolved, selection ${before.length} -> ${selectedAfter.length}` +
      (already.length ? `, already associated: ${already.join(', ')}` : '') +
      (missing.length ? `, not found: ${missing.join(', ')}` : ''),
  );
  return report;
}
