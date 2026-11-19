// Console probe: what does the extension see for the Attribute Set / PP?
//
// Paste this whole file into the DevTools Console on the product edit page and
// send the JSON it prints (it also copies it to the clipboard). Read-only: it
// queries the DOM, clicks nothing, changes nothing.
//
// It mirrors the reader in src/page/features/grid-search/productFacts.ts:
//
//   { url, onEditPage, attributeSetName, ppCode,
//     candidates: [ { source, raw, accepted, reason } ],
//     labels: [ { label, fieldHtml } ],      blocks that carry the value
//     selects: [ { name, id, selected, options, inModal } ] }
//
// "All Options" is a picker placeholder, never a set name; a concatenation of
// several "AS>PP" names is a <select> listing every set, also not a value.
(() => {
  const squash = (v) => (v ?? '').replace(/\s+/g, ' ').trim();
  const NOT_A_SET_NAME =
    /^(?:all options|all|any|none|no|yes|select\.{0,3}|--\s*please select\s*--|please select(?:\s+\w+)*|choose(?:\s+\w+)*|all store views|all websites|-+|—|–)\s*:?\s*$/i;
  const MODAL = '.admin__modal, [data-role="modal"], .modal-slide, .modal-popup, .ui-dialog';
  const inModal = (node) => Boolean(node && node.closest(MODAL));

  const staticText = (node) => {
    const clone = node.cloneNode(true);
    clone
      .querySelectorAll('input, select, textarea, button, script, style, [class*="mhx-"]')
      .forEach((child) => child.remove());
    return squash(clone.textContent);
  };
  const candidateText = (node) => {
    const input =
      node.matches('input, textarea')
        ? node
        : node.querySelector(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
          );
    if (input && squash(input.value)) return squash(input.value);
    return staticText(node);
  };
  const clean = (raw) => {
    const text = squash(raw)
      .replace(
        /^(?:attribute\s*set|conjunto\s+de\s+atributos|jeu\s+d'?attributs)\s*[:\-–]?\s*/i,
        '',
      )
      .replace(/\s+(?:change|alterar|editar|modifier|ändern)$/i, '')
      .trim();
    if (!text) return { value: '', reason: 'empty' };
    if (NOT_A_SET_NAME.test(text)) return { value: '', reason: 'placeholder' };
    if (/^(?:attribute\s*set|conjunto\s+de\s+atributos|jeu\s+d'?attributs)$/i.test(text)) {
      return { value: '', reason: 'label only' };
    }
    if (text.length > 200) return { value: '', reason: 'too long (container)' };
    const pp = text.match(/AS>PP/gi);
    if (pp && pp.length > 1) return { value: '', reason: 'list of sets' };
    return { value: text, reason: 'ok' };
  };
  const optionsText = (select) => {
    const option = select.options[select.selectedIndex];
    return squash(option?.textContent) || squash(option?.value);
  };
  const controlValue = (node) => {
    if (node.tagName === 'SELECT') return optionsText(node);
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      return squash(node.value) || squash(node.defaultValue);
    }
    return squash(node.textContent);
  };

  const candidates = [];
  const trySource = (source, raw) => {
    const verdict = clean(raw);
    candidates.push({ source, raw: squash(raw).slice(0, 200), ...verdict });
    return verdict.value;
  };

  let attributeSetName = '';

  // 1. Named controls (`attribute-set-name`), skipping any picker modal.
  for (const node of document.querySelectorAll(
    '[name="attribute-set-name"], #attribute-set-name, [name="attribute_set_name"], [id$="attribute-set-name" i]',
  )) {
    if (inModal(node)) continue;
    if (attributeSetName) break;
    attributeSetName = trySource('named control', controlValue(node));
  }

  // 2. The classic dropdown.
  if (!attributeSetName) {
    const select = document.querySelector(
      'select[name="product[attribute_set_id]"], select[name="attribute_set_id"], select#attribute_set_id',
    );
    if (select && !inModal(select)) {
      attributeSetName = trySource('classic select', optionsText(select) || select.value);
    }
  }

  // 3. The product field container.
  if (!attributeSetName) {
    for (const field of document.querySelectorAll(
      '[data-index="attribute_set_id"], [data-index="attribute-set-name"], .field-attribute_set_id, .field-attribute-set-name',
    )) {
      if (inModal(field) || attributeSetName) continue;
      const control =
        field.querySelector(
          '.admin__field-value, [data-role="field-value"], .admin__field-control',
        ) ?? field;
      attributeSetName = trySource('attribute field', candidateText(control));
    }
  }

  // 4. Static text beside the "Attribute Set" label.
  const labels = [];
  if (!attributeSetName) {
    for (const label of document.querySelectorAll(
      '.admin__field-label, label, dt, th, span, div, strong',
    )) {
      if (label.children.length > 0) continue;
      const text = squash(label.textContent)
        .replace(/\s*\((?:global|store view|website|all store views)\)\s*$/i, '')
        .replace(/\s*\[[^\]]*\]\s*$/g, '')
        .replace(/\s*\*+\s*$/, '');
      if (!/^(?:attribute\s*set|conjunto\s+de\s+atributos|jeu\s+d'?attributs)\s*:?\s*$/i.test(text)) {
        continue;
      }
      if (inModal(label)) continue;
      const row = label.parentElement;
      if (!row) continue;
      const field = label.closest('.admin__field, .field, fieldset, tr') ?? row;
      labels.push({
        label: text,
        fieldHtml: (field.outerHTML || '').slice(0, 700),
      });
      const list = [
        label.nextElementSibling,
        row.nextElementSibling,
        field.querySelector('.admin__field-value, [data-role="field-value"]'),
        field.querySelector('.admin__field-control'),
        row,
      ];
      for (const node of list) {
        if (!node || node.contains(label) || attributeSetName) continue;
        if (node.matches('a, button') || inModal(node)) continue;
        attributeSetName = trySource('label neighbour', candidateText(node));
      }
    }
  }

  // 5. A custom picker that marks the chosen option.
  if (!attributeSetName) {
    for (const option of document.querySelectorAll(
      '[aria-selected="true"], [aria-checked="true"], option:checked',
    )) {
      if (option.tagName === 'OPTION' && !option.selected) continue;
      if (inModal(option)) continue;
      let inside = false;
      let current = option;
      for (let depth = 0; depth < 6 && current; depth += 1) {
        if (/attribute[_-]?set/i.test(`${current.id} ${current.className}`)) {
          inside = true;
          break;
        }
        current = current.parentElement;
      }
      if (!inside) continue;
      attributeSetName = trySource('aria-selected option', option.textContent);
      if (attributeSetName) break;
    }
  }

  const pp = /(?:^|[^A-Za-z0-9])[\s>_:.-]*PP\s*[-_ ]?(\d{1,6})(?!\d)/i.exec(
    attributeSetName,
  );

  const result = {
    url: location.href,
    onEditPage: /\/catalog\/product\/edit(\/|$)/i.test(location.pathname),
    attributeSetName,
    ppCode: pp?.[1] ?? '',
    candidates,
    labels,
    selects: [...document.querySelectorAll('select')]
      .filter(
        (select) =>
          /attribute/i.test(
            `${select.getAttribute('name') || ''} ${select.id}`,
          ) ||
          /^all options$/i.test(squash(select.options[select.selectedIndex]?.textContent)),
      )
      .map((select) => ({
        name: select.getAttribute('name') || '',
        id: select.id || '',
        selected: squash(select.options[select.selectedIndex]?.textContent),
        selectedValue: select.value,
        options: select.options.length,
        inModal: inModal(select),
      })),
  };

  const text = JSON.stringify(result, null, 2);
  console.log(text);
  navigator.clipboard?.writeText(text).then(
    () => console.log('[mhx attribute-set probe] JSON copied to clipboard'),
    () => console.log('[mhx attribute-set probe] copy failed — right-click the log > Copy string'),
  );
  return result;
})();
