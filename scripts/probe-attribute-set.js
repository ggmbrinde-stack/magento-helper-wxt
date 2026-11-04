// Console probe: what does the extension see for PP on a product edit page?
//
// Paste this whole file into the DevTools Console on an open product edit page
// (the page with the "Attribute Set" dropdown). It prints one JSON object and
// copies it to the clipboard:
//
//   {
//     "url": "...",                  page it ran on
//     "matchedSelector": "...",      which lookup found the control
//     "attributeSetName": "AS>PP0957_...",
//     "attributeSetId": "12",
//     "ppCode": "0957",              what the reader would report
//     "candidates": [ ... ]          every attribute-set control on the page
//   }
//
// Read-only: it queries the DOM, clicks nothing, changes nothing.
(() => {
  const squash = (v) => (v ?? '').replace(/\s+/g, ' ').trim();
  const SELECTS = [
    'select[name="product[attribute_set_id]"]',
    'select[name="attribute_set_id"]',
    'select#attribute_set_id',
  ];

  let matchedSelector = '';
  let select = null;
  for (const selector of SELECTS) {
    const found = document.querySelector(selector);
    if (found) {
      select = found;
      matchedSelector = selector;
      break;
    }
  }

  const option = select ? select.options[select.selectedIndex] : null;
  const fromSelect = squash(option?.textContent) || squash(option?.value);
  const hidden = document.querySelector(
    'input[name="product[attribute_set_id]"], input[name="attribute_set_id"]',
  );

  // Static value form: Magento locks the field and prints the name as text.
  let fromLabel = '';
  for (const label of document.querySelectorAll(
    '.admin__field-label, .admin__field-label span, label, th.label',
  )) {
    const text = squash(label.textContent)
      .replace(/\s*\((?:global|store view|website|all store views)\)\s*$/i, '')
      .replace(/\s*\*+\s*$/, '');
    if (!/\battribute\s*set\b|conjunto\s+de\s+atributos/i.test(text)) continue;
    const field = label.closest('.admin__field, .field, tr, fieldset') ?? label.parentElement;
    if (!field) continue;
    const clone = field.cloneNode(true);
    clone
      .querySelectorAll('input, select, textarea, button, script, style, [class*="mhx-"]')
      .forEach((node) => node.remove());
    fromLabel = squash(clone.textContent);
    if (fromLabel) break;
  }

  const attributeSetName = fromSelect || fromLabel;
  const pp = /(?:^|[^A-Za-z0-9])[\s>_:.-]*PP\s*[-_ ]?(\d{1,6})(?!\d)/i.exec(attributeSetName);

  const result = {
    url: location.href,
    matchedSelector,
    attributeSetName,
    attributeSetId: squash(select?.value) || squash(hidden?.value),
    ppCode: pp?.[1] ?? '',
    fromStaticLabel: fromLabel,
    candidates: Array.from(
      document.querySelectorAll(
        'select[name*="attribute_set" i], select[id*="attribute_set" i], input[name*="attribute_set" i]',
      ),
    ).map((el) => ({
      tag: el.tagName.toLowerCase(),
      name: el.getAttribute('name'),
      id: el.id || null,
      value: el.value,
      text:
        el.tagName === 'SELECT'
          ? squash(el.options[el.selectedIndex]?.textContent)
          : null,
      options: el.tagName === 'SELECT' ? el.options.length : null,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    })),
  };

  const text = JSON.stringify(result, null, 2);
  // eslint-disable-next-line no-console
  console.log(text);
  try {
    copy(text);
  } catch {
    // clipboard is a convenience; the console output is the result
  }
  return result;
})();
