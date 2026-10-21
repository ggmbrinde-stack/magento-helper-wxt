// MHX active-filters probe — reports the real DOM shape of the "Active
// filters" strip, the grid's filter fields and the Apply control, so the
// pencil editor can be matched to it exactly.
// Paste into Console on a product grid page WITH at least one filter applied
// (strip visible), Enter, send back ALL output. Read-only: changes nothing.

(() => {
  const out = [];
  const log = (s) => out.push(s);
  log('=== MHX active-filters probe ===');
  log('url: ' + location.href);

  // 1. Strip candidates — class-based first, then the heading text.
  const classSel =
    '.filter-current,[data-role="filter-current"],.admin__data-grid-filter-current,.admin__data-grid-filters-current,.admin__current-filters,.admin__current-filters-list,.admin__current-filters-list-wrap,[data-role="filter-list"],.admin__data-grid-active-filters';
  const byClass = Array.from(document.querySelectorAll(classSel));
  log('class-based strips: ' + byClass.length);

  const byText = Array.from(document.querySelectorAll('strong, b, div, span')).filter(
    (el) =>
      el.children.length === 0 &&
      /^active\s+filters?\s*:?\s*$/i.test((el.textContent || '').trim()),
  );
  log('text-heading hits: ' + byText.length);
  byText.slice(0, 5).forEach((el, i) => {
    log(
      '  heading[' +
        i +
        ']: <' +
        el.tagName.toLowerCase() +
        '> class=' +
        JSON.stringify(el.className) +
        ' parentClass=' +
        JSON.stringify((el.parentElement && el.parentElement.className) || ''),
    );
  });

  const strip = byClass[0] || (byText[0] && byText[0].parentElement);
  if (strip) {
    log('strip selector-ish: class=' + JSON.stringify(strip.className));
    log('--- strip HTML (first 4000 chars) ---');
    log(strip.outerHTML.slice(0, 4000));
    log('--- end strip HTML ---');
  } else {
    log('NO strip found — check a filter is applied and the label text above matches.');
  }

  // 2. Filter fields: labels, names, region membership.
  const fields = Array.from(document.querySelectorAll('select, input')).filter(
    (el) =>
      !el.classList.contains('mhx-chip-input') &&
      !el.classList.contains('mhx-chip-select'),
  );
  log('fields total: ' + fields.length);
  fields.slice(0, 60).forEach((el, i) => {
    const labels = [];
    const aria = el.getAttribute('aria-label');
    if (aria) labels.push('aria:' + aria);
    if (el.id) {
      let lab = null;
      try {
        lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      } catch (e) {
        /* ignore */
      }
      if (lab) labels.push('label[for]:' + (lab.textContent || '').trim());
    }
    const wrap = el.closest('label');
    if (wrap) labels.push('closest:' + (wrap.textContent || '').trim());
    const parent = el.parentElement;
    if (parent) {
      const sib = parent.querySelector(':scope > label, :scope > [class*="label"]');
      if (sib && !sib.contains(el)) {
        labels.push('sibling:' + (sib.textContent || '').trim());
      }
    }
    if (el.placeholder) labels.push('ph:' + el.placeholder);
    const inRegion = !!el.closest(
      '[data-role="filter-form"],.admin__data-grid-filters,.admin__data-grid-filter-row,.admin__fieldset,.admin__data-grid-toolbar,form',
    );
    log(
      '  field[' +
        i +
        ']: <' +
        el.tagName.toLowerCase() +
        (el.type ? ' type=' + el.type : '') +
        '> name=' +
        JSON.stringify(el.name || '') +
        ' labels=' +
        JSON.stringify(labels) +
        ' inRegion=' +
        inRegion +
        (el.tagName === 'SELECT' ? ' options=' + el.options.length : ''),
    );
  });

  // 3. Apply-ish controls.
  const controls = Array.from(
    document.querySelectorAll('button, a, input[type="submit"]'),
  ).filter((b) =>
    /\bapply\b/i.test(b.textContent || b.value || b.getAttribute('title') || ''),
  );
  log('apply-ish controls: ' + controls.length);
  controls.forEach((b, i) => {
    const scope = b.closest(
      '[data-role="filter-form"],.admin__data-grid-filters,.admin__data-grid-filter-row,.admin__fieldset,form,.admin__data-grid-toolbar',
    );
    log(
      '  ctrl[' +
        i +
        ']: <' +
        b.tagName.toLowerCase() +
        '> class=' +
        JSON.stringify(b.className) +
        ' text=' +
        JSON.stringify(((b.textContent || b.value || '').trim()).slice(0, 40)) +
        ' inRegion=' +
        !!scope,
    );
  });
  const marked = document.querySelectorAll(
    '[data-role="filter-apply"], .action-apply-filters',
  );
  log('marked apply controls (.action-apply-filters / [data-role=filter-apply]): ' + marked.length);

  // 4. Forms the fields belong to.
  const withInputs = Array.from(document.forms).filter(
    (f) => f.querySelectorAll('input, select').length > 0,
  );
  log('forms with fields: ' + withInputs.length);
  withInputs.forEach((f, i) => {
    log(
      '  form[' +
        i +
        ']: id=' +
        JSON.stringify(f.id) +
        ' method=' +
        f.method +
        ' fields=' +
        f.querySelectorAll('input, select').length,
    );
  });

  // 5. Does Magento apply a filter on Enter inside a field? (native listeners
  // are invisible, but KO-observed widgets expose their data-bind.)
  const firstFilterField = document.querySelector(
    '[data-role="filter-form"] input, .admin__data-grid-filters input, .admin__data-grid-filter-row input',
  );
  if (firstFilterField) {
    log(
      'first filter field data-bind: ' +
        JSON.stringify(firstFilterField.getAttribute('data-bind') || ''),
    );
    log('first filter field outerHTML: ' + firstFilterField.outerHTML.slice(0, 300));
  } else {
    log('no filter field found inside a known filter region');
  }

  log('=== END probe ===');
  const text = out.join('\n');
  console.log(text);
  return text;
})();
