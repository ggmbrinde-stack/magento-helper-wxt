// Prototype: paste a list of SKUs, and they become ticked in
// "Select Associated Product".
//
// Why the console before the extension: the content script runs in Chrome's
// isolated world, so it cannot see Knockout. The modal's selection is a
// Knockout observable (`$col.selected`, the same array `staticChecked` and
// `totalSelected` read), so ticking rows for products that are not on the
// current page can only be done from the page's own JS context. This file
// proves that path on the live modal before any of it becomes extension code.
//
// What it does, in order:
//   1. loads `ko` through RequireJS - `window.ko` is not global on this build;
//   2. finds the modal's multiselect column by asking Knockout for the view
//      model behind a row checkbox (`ko.dataFor`);
//   3. resolves each SKU to an entity_id through the modal's own SKU filter -
//      the same input and "Apply Filters" button an operator uses - so the
//      answer is scoped to products this parent may actually use;
//   4. clears the filter again, so the grid is left as it was found;
//   5. merges every found id into `selected` and clicks the visible rows, so
//      the ticks are on screen as well as in the model.
//
// Nothing is saved. Press Cancel in the modal to discard the selection.
//
// USAGE (open the modal first, wait for rows):
//   window.mhxSkus = `SKU-ONE
//   SKU-TWO`;        // newline, comma, semicolon or space separated
//   ...then paste this whole file into the DevTools console.
//
// With no `window.mhxSkus` it uses the SKUs already visible on the page, which
// is a safe smoke test: those products exist, so every id must resolve.
(() => {
  const T0 = Date.now();
  const say = (msg) => console.log(`[mhx bulk ${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);
  const squash = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el) => Boolean(el && el.getClientRects().length);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** A RequireJS module, or a rejection naming the module. */
  const amd = (names, optional = false) =>
    new Promise((ok, fail) => {
      if (typeof window.require !== 'function') {
        fail(new Error('window.require is missing'));
        return;
      }
      try {
        window.require(
          names,
          ok,
          (err) => (optional ? fail(err) : fail(new Error(String((err && err.message) || err)))),
        );
      } catch (err) {
        fail(err);
      }
    });

  /** `["a", "b"]` from any pasted list; order kept, duplicates dropped. */
  const parseSkus = (raw) => {
    const seen = new Set();
    const out = [];
    for (const piece of String(raw ?? '').split(/[\s,;|]+/)) {
      const sku = piece.trim();
      if (!sku) continue;
      const key = sku.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(sku);
    }
    return out;
  };

  const run = async () => {
    // ---- 1. the modal and its selection model ----------------------------
    const modals = [
      ...document.querySelectorAll('aside[class*="configurable_associated_product_modal"]'),
    ].filter(visible);
    const modal = modals[modals.length - 1];
    if (!modal) {
      say('no visible "Select Associated Product" modal - open it, wait for rows, run again');
      return;
    }

    let ko;
    try {
      ko = await amd(['ko']);
    } catch (err) {
      say(`could not load ko: ${(err && err.message) || err}`);
      return;
    }

    const firstBox =
      modal.querySelector('tbody tr input[data-action="select-row"]') ??
      modal.querySelector('tbody tr input[type="checkbox"]');
    if (!firstBox) {
      say('the modal has no grid rows yet - wait for them, then run again');
      return;
    }

    const col = ko.dataFor(firstBox);
    if (!col || typeof col.selected !== 'function' || typeof col.indexField !== 'string') {
      say(
        `unexpected view model behind the row checkbox (${(col && col.component) || 'none'}) - stopping`,
      );
      return;
    }
    say(`selection model: ${col.component}, indexField=${col.indexField}`);

    const skuInput = modal.querySelector('input[name="sku"]');
    const applyBtn = modal.querySelector('[data-action="grid-filter-apply"]');
    if (!skuInput || !applyBtn) {
      say('the SKU filter or its Apply Filters button is missing - stopping');
      return;
    }
    const initialFilter = skuInput.value.trim();

    // ---- 2. read the grid ------------------------------------------------
    /** Rows the listing currently holds, however they are exposed. */
    const rows = () => {
      const value = typeof col.rows === 'function' ? col.rows.peek() : col.rows;
      return Array.isArray(value) ? value : [];
    };
    const skuOf = (row) => squash(row && (row.sku ?? (row.data && row.data.sku))).toUpperCase();
    const idOf = (row) =>
      squash(
        row &&
          (row[col.indexField] ??
            row.entity_id ??
            row.id ??
            (row.data && (row.data[col.indexField] ?? row.data.entity_id))),
      );

    /** Cheap fingerprint of what the grid shows, to detect a finished reload. */
    const fingerprint = () => {
      const body = modal.querySelectorAll('tbody tr').length;
      return `${rows()
        .map((row) => skuOf(row))
        .join('|')}#${body}`;
    };

    /**
     * Wait until a reload finished: no loading mask, and the rows changed from
     * `prev` and then held still for one poll. A fixed sleep is not enough - the
     * grid can answer in 200ms or in 3s depending on the catalogue.
     */
    const settle = async (prev, cap = 9000) => {
      const start = Date.now();
      let last = '';
      while (Date.now() - start < cap) {
        await sleep(200);
        const busy = [...modal.querySelectorAll('.admin__data-grid-loading-mask')].some(visible);
        if (busy) {
          last = '';
          continue;
        }
        const now = fingerprint();
        if (now !== prev && now === last) return true;
        last = now;
      }
      return false;
    };

    /** Type a SKU into the modal's own filter and press its own button. */
    const applyFilter = async (value) => {
      const before = fingerprint();
      skuInput.value = value;
      skuInput.dispatchEvent(new Event('input', { bubbles: true }));
      skuInput.dispatchEvent(new Event('change', { bubbles: true }));
      applyBtn.click();
      return settle(before);
    };

    /** Matching rows read straight off the rendered table. */
    const domMatches = (sku) => {
      const table = modal.querySelector('table.data-grid');
      if (!table) return [];
      const head = [...table.querySelectorAll('thead th')];
      const skuCol = head.findIndex((th) => /^sku$/i.test(squash(th.textContent)));
      if (skuCol < 0) return [];
      const out = [];
      for (const tr of table.querySelectorAll('tbody tr')) {
        const cell = tr.children[skuCol];
        if (squash(cell && cell.textContent).toUpperCase() !== sku.toUpperCase()) continue;
        const box = tr.querySelector('input[type="checkbox"]');
        const id = box ? squash(box.value) : '';
        if (id) out.push({ id, sku });
      }
      return out;
    };

    // ---- 3. the SKUs to add ----------------------------------------------
    const currentPage = [];
    for (const tr of modal.querySelectorAll('table.data-grid tbody tr')) {
      const table = modal.querySelector('table.data-grid');
      const head = [...table.querySelectorAll('thead th')];
      const skuCol = head.findIndex((th) => /^sku$/i.test(squash(th.textContent)));
      const text = skuCol >= 0 ? squash(tr.children[skuCol] && tr.children[skuCol].textContent) : '';
      if (text) currentPage.push(text);
    }

    const requested = parseSkus(
      typeof window.mhxSkus === 'string' ? window.mhxSkus : currentPage.slice(0, 3).join(' '),
    );
    if (requested.length === 0) {
      say('no SKUs to add - set window.mhxSkus first');
      return;
    }
    if (requested.length > 100) {
      say(`${requested.length} SKUs is too many for one run - split the list`);
      return;
    }
    say(`resolving ${requested.length} SKU(s)${window.mhxSkus ? '' : ' (page sample)'}…`);

    // ---- 4. resolve, one filter pass per SKU ------------------------------
    // An index loop, not `requested.entries()`: something on this admin page
    // replaces `Array.prototype.entries` with a non-iterable, which made the
    // first real run die before resolving a single SKU.
    const found = [];
    const missing = [];
    for (let index = 0; index < requested.length; index += 1) {
      const sku = requested[index];
      let hits = rows()
        .filter((row) => skuOf(row) === sku.toUpperCase())
        .map((row) => ({ id: idOf(row), sku: skuOf(row) }))
        .filter((hit) => hit.id);

      if (hits.length === 0) {
        const changed = await applyFilter(sku);
        hits = rows()
          .filter((row) => skuOf(row) === sku.toUpperCase())
          .map((row) => ({ id: idOf(row), sku: skuOf(row) }))
          .filter((hit) => hit.id);
        if (hits.length === 0) hits = domMatches(sku);
        if (!changed && hits.length === 0) {
          say(`  ${index + 1}/${requested.length} ${sku}: the grid did not answer in time`);
          missing.push(sku);
          continue;
        }
      }

      if (hits.length === 0) {
        say(`  ${index + 1}/${requested.length} ${sku}: no row in this listing`);
        missing.push(sku);
        continue;
      }
      say(`  ${index + 1}/${requested.length} ${sku}: id ${hits.map((h) => h.id).join(', ')}`);
      for (const hit of hits) {
        if (!found.some((f) => f.id === hit.id)) found.push(hit);
      }
    }

    // ---- 5. put the grid back the way it was ------------------------------
    // Whatever filter was there before this run goes back, so an operator who
    // had already narrowed the grid keeps that view. Skipped when this run never
    // moved the filter: re-applying the same value cannot change the rows, so
    // waiting for a reload would sit out the whole timeout for nothing.
    if (skuInput.value.trim() !== initialFilter) {
      await applyFilter(initialFilter);
      say(initialFilter ? `filter restored (${initialFilter})` : 'filter cleared');
    } else {
      say('grid left as it was');
    }

    // ---- 6. the selection itself -----------------------------------------
    // Visible rows first, through the same checkbox an operator would click:
    // that runs Magento's own handler, so the model is written by the page and
    // not only by us. Every id it adds is then redundant with the merge below.
    const wanted = new Set(found.map((hit) => String(hit.id)));
    const before = (col.selected.peek() || []).map(String);
    let ticked = 0;
    modal.querySelectorAll('tbody tr input[type="checkbox"]').forEach((box) => {
      const id = String(box.value);
      if (!wanted.has(id) || box.checked || box.disabled) return;
      box.click();
      ticked += 1;
    });

    const afterClicks = (col.selected.peek() || []).map(String);
    const merged = afterClicks.slice();
    for (const id of wanted) if (!merged.includes(id)) merged.push(id);
    if (merged.length !== afterClicks.length) col.selected(merged);

    // "All selected" mode lists ids to REMOVE instead of ids to keep, so an id
    // that was excluded has to leave that list to become selected.
    let wasExcluded = false;
    if (typeof col.excludeMode === 'function' && col.excludeMode.peek()) {
      const excluded = (col.excluded.peek() || []).map(String);
      const kept = excluded.filter((id) => !merged.includes(id));
      wasExcluded = kept.length !== excluded.length;
      if (wasExcluded) col.excluded(kept);
    }

    // ---- 7. what actually happened ---------------------------------------
    const after = (col.selected.peek() || []).map(String);
    const report = {
      indexField: col.indexField,
      requested: requested.length,
      found: found.length,
      missing,
      selectedBefore: before.length,
      selectedAfter: after.length,
      selectionIsArray: Array.isArray(col.selected.peek()),
      totalSelected: typeof col.totalSelected === 'function' ? col.totalSelected.peek() : null,
      totalRecords: typeof col.totalRecords === 'function' ? col.totalRecords.peek() : null,
      tickedOnScreen: ticked,
      clearedExcludeList: wasExcluded,
      note: 'Press Cancel to discard, Done to apply.',
    };
    console.log('[mhx bulk] result', report);
    say(
      `done: ${found.length}/${requested.length} resolved, selection ${before.length} -> ${after.length}` +
        (missing.length ? `, not found: ${missing.join(', ')}` : ''),
    );
    return report;
  };

  return run().catch((err) => {
    say(`failed: ${(err && err.message) || err}`);
    throw err;
  });
})();
