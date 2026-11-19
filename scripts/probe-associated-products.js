// Console probe v2: what is actually inside "Select Associated Product"?
//
// v1 answers are already in: the modal is
//   aside.modal-slide.product_form_product_form_configurable_associated_product_modal._show
// the grid is a real <table class="data-grid data-grid-draggable"> with 20 rows,
// window.ko is NOT global on this build, there are no data-mage-init configs,
// no hidden id inputs, and 9 checkboxes are pre-ticked (replace flow).
//
// v2 collects what v1 could not print, and works around three obstacles:
//   - DevTools' collapsed object: it uses the console's own copy() first,
//   - window.ko missing: it asks RequireJS for 'ko' and, failing that, lists
//     the loaded modules whose name looks like the listing component,
//   - outerHTML noise: captured markup is sanitised and length-capped.
//
// HOW TO RUN
//   1. /catalog/product/edit/id/110989/  → click "Add Products" / "Select
//      Associated Product", wait for rows.
//   2. Paste this whole file into the DevTools Console, Enter.
//   3. "Select Associated Product" JSON is now in your clipboard (and printed).
//      Paste it back to me. Read-only: it clicks nothing.
//
// OPTIONAL SKU experiment (separate run, mutates only filter state):
//   window.mhxProbeSkuTest = 'SKU-ONE,SKU-TWO'
//   …probe fills the SKU box, clicks Apply Filters, waits 3s, reports the
//   records count and the SKU column. Press Cancel in the modal to discard.
//
// SECRETS: hidden inputs are reported as names only and emptied in captured
// markup; `key/<hash>` admin segments are redacted in every string.
(() => {
  const squash = (v) => (v ?? '').replace(/\s+/g, ' ').trim();
  const attr = (el, name) => (el && el.getAttribute(name)) || '';
  const classes = (el) => (el && el.classList ? [...el.classList].join('.') : '');
  const visible = (el) => Boolean(el && el.getClientRects().length);
  const short = (el, n = 100) => (el ? squash(el.textContent).slice(0, n) : '');
  const redact = (s) => String(s).replace(/(\/key\/)[^/"'\s?]+/g, '$1<redacted>');
  const SECRET_NAME = /(form_key|token|password|secret|csrf)/i;
  const MODAL_TITLE = /select associated product/i;

  const cssPath = (el, depth = 3) => {
    const parts = [];
    let node = el;
    for (let i = 0; i < depth && node && node.nodeType === 1; i += 1) {
      if (node.id) {
        parts.unshift(`#${node.id}`);
        break;
      }
      const cls = classes(node).split('.').filter(Boolean).slice(0, 2).join('.');
      const tag = node.tagName.toLowerCase();
      const sameTag = node.parentElement
        ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName)
        : [];
      const nth = sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(node) + 1})` : '';
      parts.unshift(`${tag}${cls ? `.${cls}` : ''}${nth}`);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };

  // The known class first: 15 modals are open on this page at once.
  const findModal = () => {
    const known = [
      ...document.querySelectorAll('aside[class*="configurable_associated_product_modal"]'),
    ].filter(visible);
    if (known.length > 0) return known[known.length - 1];
    const open = [
      ...document.querySelectorAll(
        '.modal-slide, .modal-popup, .admin__modal, [data-role="modal"]',
      ),
    ].filter(visible);
    return open.find((m) => MODAL_TITLE.test(m.textContent || '')) || open[open.length - 1] || null;
  };

  /** Markup without secrets or inline image payloads, length-capped. */
  const sanitisedHtml = (el, limit = 1500) => {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll('input[type="hidden"], input[name*="key"], input[name*="token"]')
      .forEach((input) => {
        input.removeAttribute('value');
        input.value = '';
      });
    clone.querySelectorAll('img').forEach((img) => img.removeAttribute('src'));
    clone.querySelectorAll('[style]').forEach((node) => node.removeAttribute('style'));
    return squash(clone.outerHTML).replace(/value="[^"]{12,}"/g, 'value="<long>"').slice(0, limit);
  };

  const scope = findModal();
  if (!scope) {
    const hint =
      'No visible modal found. Open "Select Associated Product" (wait for rows), then paste again.';
    console.warn(`[mhx assoc probe] ${hint}`);
    return { error: hint };
  }

  // ---- 1. skeleton -------------------------------------------------------
  const tree = [];
  (function walk(el, depth) {
    if (!el || depth > 6 || tree.length > 400) return;
    if (el !== scope) {
      const notable =
        el.id ||
        attr(el, 'data-role') ||
        attr(el, 'data-index') ||
        attr(el, 'data-bind') ||
        /grid|filter|pager|massaction|checkbox|select-row|modal-footer|fieldset|associated|col-|draggable/i.test(
          `${classes(el)} ${attr(el, 'data-role')}`,
        );
      if (notable) {
        tree.push({
          depth,
          path: cssPath(el, 2),
          tag: el.tagName.toLowerCase(),
          cls: classes(el).slice(0, 110),
          role: attr(el, 'data-role'),
          bind: attr(el, 'data-bind').slice(0, 90),
          text: short(el, 44),
        });
      }
    }
    for (const child of el.children) walk(child, depth + 1);
  })(scope, 0);

  // ---- 2. grid -----------------------------------------------------------
  const table = scope.querySelector('table.data-grid') || scope.querySelector('table');
  const gridBox = table || scope.querySelector('[class*="data-grid"]');
  const headerCells = table
    ? [...table.querySelectorAll('thead th')].map((th) => ({
        text: squash(th.textContent).slice(0, 30),
        cls: classes(th).slice(0, 80),
        index: attr(th, 'data-index'),
      }))
    : [];
  const rowSelector = table ? 'tbody tr' : '[data-role="row"], .data-grid-row';
  const rows = [...(gridBox || scope).querySelectorAll(rowSelector)].filter(
    (row) => row.querySelector('input[type="checkbox"]') || row.children.length > 2,
  );
  const firstRow = rows[0];
  const rowBox = firstRow ? firstRow.querySelector('input[type="checkbox"]') : null;
  const headBox = scope.querySelector('thead input[type="checkbox"]');

  const describeRow = (row) =>
    row
      ? {
          path: cssPath(row, 2),
          cls: classes(row).slice(0, 110),
          dataset: { ...row.dataset },
          cells: [...row.children].map((c) => squash(c.textContent).slice(0, 30)),
          checkbox: row.querySelector('input[type="checkbox"]')
            ? {
                name: attr(row.querySelector('input[type="checkbox"]'), 'name'),
                value: attr(row.querySelector('input[type="checkbox"]'), 'value'),
                id: row.querySelector('input[type="checkbox"]').id,
                cls: classes(row.querySelector('input[type="checkbox"]')).slice(0, 100),
                role: attr(row.querySelector('input[type="checkbox"]'), 'data-role'),
                bind: attr(row.querySelector('input[type="checkbox"]'), 'data-bind').slice(0, 160),
                type: attr(row.querySelector('input[type="checkbox"]'), 'type'),
              }
            : null,
          html: sanitisedHtml(row, 1200),
        }
      : null;

  // ---- 3. filter controls ------------------------------------------------
  const fields = [...scope.querySelectorAll('input[name], select[name], textarea[name]')]
    .map((el) => {
      const name = attr(el, 'name');
      const type = attr(el, 'type') || el.tagName.toLowerCase();
      const secret = SECRET_NAME.test(name) || type === 'hidden';
      return {
        name,
        type,
        secret,
        value: secret ? '<hidden>' : squash(el.value).slice(0, 30),
        id: el.id,
        placeholder: attr(el, 'placeholder'),
        bind: attr(el, 'data-bind').slice(0, 110),
        visible: visible(el),
        path: cssPath(el, 2),
      };
    })
    .slice(0, 30);

  const binds = [...scope.querySelectorAll('[data-bind]')]
    .filter((el) => /filter|search|sku|select|check|row/i.test(attr(el, 'data-bind')))
    .map((el) => ({ path: cssPath(el, 2), bind: attr(el, 'data-bind').slice(0, 150) }))
    .slice(0, 25);

  const headerText = short(scope.querySelector('.admin__data-grid-header') || scope, 260);
  const foundMatch = /([\d.,\s]{1,14})\s*(?:records|registos|registros)\s+found/i.exec(
    scope.textContent || '',
  );

  // ---- 4. buttons --------------------------------------------------------
  const buttons = [...scope.querySelectorAll('button, a.action-, a[data-role], a[data-action]')]
    .map((b) => ({
      path: cssPath(b, 2),
      text: short(b, 40),
      cls: classes(b).slice(0, 110),
      role: attr(b, 'data-role'),
      action: attr(b, 'data-action'),
      tag: b.tagName.toLowerCase(),
    }))
    .slice(0, 40);

  // ---- 5. selection ------------------------------------------------------
  const checkedCells = (scopeEl) =>
    [...scopeEl.querySelectorAll('input[type="checkbox"]:checked')]
      .slice(0, 15)
      .map((box) => {
        const row = box.closest('tr');
        return row
          ? [...row.children].map((c) => squash(c.textContent).slice(0, 26))
          : [attr(box, 'name'), attr(box, 'value')];
      });

  const hiddenIds = [
    ...document.querySelectorAll(
      'input[type="hidden"][name*="associated"], input[type="hidden"][name*="links"], #associated_product_ids',
    ),
  ]
    .map((el) => ({ name: attr(el, 'name'), id: el.id, length: (el.value || '').length }))
    .slice(0, 10);

  const parentScope =
    document.querySelector('#configurable_associated_products') ||
    document.querySelector('[data-index="associated"], .configurable-associated-products');

  // ---- 6. report ---------------------------------------------------------
  const report = {
    url: redact(location.href),
    onEditPage: /\/catalog\/product\/edit(\/|$)/.test(location.pathname),
    capture: {
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      magentoVersion: (() => {
        const m = /Magento\/([\d.]+)/.exec(
          [...document.querySelectorAll('script[src*="magento"]')].map((s) => s.src).join(' '),
        );
        return m ? m[1] : '';
      })(),
    },
    modal: {
      path: cssPath(scope, 2),
      id: scope.id,
      cls: classes(scope).slice(0, 160),
      title: short(scope.querySelector('.modal-title, header, h1, h2') || scope, 50),
      visibleModals: [
        ...document.querySelectorAll('.modal-slide, .modal-popup, .admin__modal'),
      ].filter(visible).length,
      rect: (() => {
        const r = scope.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      })(),
      innerWrapHtml: sanitisedHtml(scope.querySelector('.modal-inner-wrap') || scope, 1800),
    },
    tree,
    grid: {
      renderedAs: table ? 'table' : gridBox ? 'div/other' : 'not found',
      path: gridBox ? cssPath(gridBox, 2) : '',
      cls: gridBox ? classes(gridBox).slice(0, 110) : '',
      headerCells,
      rowCount: rows.length,
      rowSelector,
      headCheckbox: headBox
        ? { name: attr(headBox, 'name'), cls: classes(headBox).slice(0, 100), id: headBox.id }
        : null,
      firstRow: describeRow(firstRow),
      secondRowHtml: sanitisedHtml(rows[1], 900),
    },
    filters: {
      fields,
      binds,
      headerText,
      recordsFound: foundMatch ? squash(foundMatch[0]) : '',
      rawCountText: foundMatch ? squash(foundMatch[1]) : '',
      perPage: (() => {
        const select = [...scope.querySelectorAll('select')].find((s) =>
          [...s.options].some((o) => /^(20|200)$/.test(squash(o.textContent))),
        );
        return select
          ? {
              path: cssPath(select, 2),
              name: attr(select, 'name'),
              options: [...select.options].map((o) => squash(o.textContent)).slice(0, 8),
            }
          : null;
      })(),
      pageInputs: [...scope.querySelectorAll('input.admin__control-text, input[type="number"]')]
        .filter((el) => visible(el) && !attr(el, 'name'))
        .map((el) => ({ path: cssPath(el, 2), value: el.value, bind: attr(el, 'data-bind').slice(0, 90) }))
        .slice(0, 5),
      filterRowHtml: sanitisedHtml(
        scope.querySelector('.admin__data-grid-header-row, .admin__data-grid-filters') || null,
        2000,
      ),
    },
    buttons,
    selection: {
      checkedInModal: [...scope.querySelectorAll('input[type="checkbox"]:checked')].length,
      checkedCells: checkedCells(scope),
      headCheckboxChecked: headBox ? headBox.checked : null,
      hiddenIds,
      parentScope: parentScope
        ? {
            path: cssPath(parentScope, 2),
            rows: parentScope.querySelectorAll('tbody tr').length,
            checked: parentScope.querySelectorAll('input[type="checkbox"]:checked').length,
          }
        : null,
    },
  };

  // ---- 7. RequireJS: ko + the listing component --------------------------
  const requirejs = (names, ok, fail) => {
    if (typeof window.require !== 'function') {
      fail('window.require is missing');
      return;
    }
    try {
      window.require(names, ok, (err) => fail(String((err && err.message) || err)));
    } catch (error) {
      fail(String(error));
    }
  };

  const moduleNames = () => {
    const contexts = window.require && window.require.s && window.require.s.contexts;
    const ctx = contexts && (contexts._ || Object.values(contexts)[0]);
    if (!ctx) return [];
    return [
      ...new Set([...Object.keys(ctx.defined || {}), ...Object.keys(ctx.registry || {})]),
    ].sort();
  };

  const summarise = (vm) => {
    if (!vm || typeof vm !== 'object') return null;
    const keys = Object.keys(vm)
      .slice(0, 60)
      .map((key) => {
        let v;
        try {
          v = vm[key];
        } catch {
          return { key, type: '<throws>' };
        }
        const type = Array.isArray(v) ? 'array' : typeof v;
        const out = { key, type };
        if (type === 'function') {
          const observable = typeof v.peek === 'function';
          out.observable = observable;
          if (observable) {
            try {
              const p = v.peek();
              out.peek = Array.isArray(p)
                ? `array[${p.length}]`
                : p && typeof p === 'object'
                  ? 'object'
                  : String(p).slice(0, 40);
            } catch {
              out.peek = '<throws>';
            }
          }
        } else if (type === 'array') {
          out.length = v.length;
        } else if (type !== 'object') {
          out.value = String(v).slice(0, 40);
        }
        return out;
      });
    return { component: (vm.constructor && vm.constructor.name) || '(anonymous)', keys };
  };

  const koReport = (ko) => {
    const chainOf = (node) => {
      if (!node || typeof ko.contextFor !== 'function') return [];
      const ctx = ko.contextFor(node);
      if (!ctx) return [];
      const out = [];
      const add = (vm, label) => {
        if (!vm || out.length >= 6) return;
        const s = summarise(vm);
        if (s) out.push({ label, component: s.component, keys: s.keys.map((k) => k.key) });
      };
      add(ctx.$data, '$data');
      [...(ctx.$parents || [])].forEach((parent, i) => add(parent, `$parents[${i}]`));
      return out;
    };
    const node = findModal();
    return {
      version: ko.version || '(unknown)',
      rowCheckbox: rowBox ? { data: summarise(ko.dataFor(rowBox)), chain: chainOf(rowBox) } : null,
      grid: gridBox ? { data: summarise(ko.dataFor(gridBox)), chain: chainOf(gridBox) } : null,
      modal: node && summarise(ko.dataFor(node)) ? summarise(ko.dataFor(node)) : null,
      filterBindings: [...(node || document).querySelectorAll('[data-bind]')]
        .filter((el) => /filters|listing/i.test(attr(el, 'data-bind')))
        .slice(0, 5)
        .map((el) => ({ path: cssPath(el, 2), bind: attr(el, 'data-bind').slice(0, 120) })),
    };
  };

  // ---- 8. output ---------------------------------------------------------
  const emit = (result) => {
    const text = JSON.stringify(
      result,
      (key, value) => (typeof value === 'string' ? redact(value) : value),
      2,
    );
    // DevTools' copy() is the reliable path: navigator.clipboard often fails
    // because the console is not the focused document.
    let copied = false;
    if (typeof window.copy === 'function') {
      try {
        window.copy(text);
        copied = true;
      } catch {
        /* fall through */
      }
    }
    console.log(text);
    console.log(
      copied
        ? '[mhx assoc probe] JSON in the clipboard (copy()). Paste it back.'
        : '[mhx assoc probe] clipboard unavailable — right-click the JSON line > Copy string',
    );
    try {
      return JSON.parse(text);
    } catch {
      return result;
    }
  };

  // ---- 9. optional: does one SKU filter accept several SKUs? -------------
  const runSkuTest = (finish) => {
    const testValue =
      typeof window.mhxProbeSkuTest === 'string' ? window.mhxProbeSkuTest.trim() : '';
    if (!testValue) return finish();

    const liveRoot = findModal() || scope;
    const skuInput = liveRoot.querySelector(
      'input[name="sku"], input[name^="filters"][name*="sku"], input[id*="sku" i]',
    );
    const applyButton = [...liveRoot.querySelectorAll('button, a')].find((b) =>
      /^(apply filters|aplicar filtros|filtrar)$/i.test(short(b, 30)),
    );
    if (!skuInput || !applyButton) {
      report.skuTest = {
        attempted: false,
        reason: !skuInput ? 'no SKU filter input inside the modal' : 'no Apply Filters button',
      };
      return finish();
    }

    skuInput.value = testValue;
    skuInput.dispatchEvent(new Event('input', { bubbles: true }));
    skuInput.dispatchEvent(new Event('change', { bubbles: true }));
    applyButton.click();
    console.log(`[mhx assoc probe] applied SKU filter "${testValue}" — waiting 3s…`);

    setTimeout(() => {
      const after = findModal() || liveRoot;
      const afterRows = [...after.querySelectorAll(rowSelector)].filter(
        (row) => row.querySelector('input[type="checkbox"]') || row.children.length > 2,
      );
      const skuCol = [...after.querySelectorAll('thead th')].findIndex((th) =>
        /^sku$/i.test(squash(th.textContent)),
      );
      const found = /([\d.,\s]{1,14})\s*(?:records|registos|registros)\s+found/i.exec(
        after.textContent || '',
      );
      report.skuTest = {
        value: testValue,
        recordsFoundAfter: found ? squash(found[0]) : '',
        rowsAfter: afterRows.length,
        skuColumnIndex: skuCol,
        skuColumnValues: afterRows.slice(0, 12).map((row) => {
          const cells = [...row.children];
          const cell = skuCol >= 0 ? cells[skuCol] : cells[3];
          return cell ? squash(cell.textContent).slice(0, 34) : '';
        }),
        note: 'Press Cancel in the modal to discard the filter; nothing was saved.',
      };
      finish();
    }, 3000);
  };

  const finish = () => {
    runSkuTest(() => emit(report));
  };

  if (window.ko) {
    report.ko = koReport(window.ko);
    report.requirejs = { modules: moduleNames().filter((n) => /associated|configurable|listing/i.test(n)).slice(0, 20) };
    finish();
    return report;
  }

  requirejs(
    ['ko'],
    (ko) => {
      report.ko = koReport(ko);
      report.requirejs = {
        modules: moduleNames().filter((n) => /associated|configurable|listing/i.test(n)).slice(0, 20),
      };
      finish();
    },
    (error) => {
      report.ko = { unavailable: String(error) };
      report.requirejs = {
        note: 'ko load failed; listing component names still useful',
        modules: moduleNames().filter((n) => /associated|configurable|listing/i.test(n)).slice(0, 20),
        totalModules: moduleNames().length,
      };
      finish();
    },
  );

  return 'probe running — ko is loaded through RequireJS, results land in the console.';
})();
