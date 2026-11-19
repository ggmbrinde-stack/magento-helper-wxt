/*
 * Why does "Magento facts" come back as "not read"?
 *
 * Paste this whole file into the DevTools Console on the product edit page that
 * shows the wrong facts, press Enter, and send me the JSON it prints (it also
 * copies it to the clipboard).
 *
 * Read-only: it queries the DOM, clicks nothing, changes nothing.
 *
 * It answers four questions at once:
 *   1. Is this really the product edit page?      -> bodyClass / bodyId / url
 *   2. Does the form use the field names the reader expects?  -> checks[]
 *   3. What names does the form actually use?     -> controls (sample)
 *   4. What does the Attribute Set control say?   -> attributeSet
 */
(() => {
  const squash = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());
  const count = (sel) => {
    try {
      return document.querySelectorAll(sel).length;
    } catch (e) {
      return -1;
    }
  };
  const present = (sel) => count(sel) > 0;

  // Exactly the selectors adminFacts.ts asks for.
  const checks = [
    ['attribute_set_id', 'select[name="product[attribute_set_id]"], select[name="attribute_set_id"], select#attribute_set_id'],
    ['price', 'input[name="product[price]"], input#price'],
    ['special_price', 'input[name="product[special_price]"], input#special_price'],
    ['cost', 'input[name="product[cost]"], input#cost'],
    ['tax_class', 'select[name="product[tax_class_id]"], select#tax_class_id'],
    ['qty', 'input[name="product[quantity_and_stock_status][qty]"], input[name="product[qty]"], input#inventory_qty'],
    ['is_in_stock', 'select[name="product[quantity_and_stock_status][is_in_stock]"], select#inventory_is_in_stock'],
    ['backorders', 'select[name="product[stock_data][backorders]"], select#backorders'],
    ['visibility', 'select[name="product[visibility]"], select#visibility'],
    ['status', 'select[name="product[status]"], select#status'],
    ['weight', 'input[name="product[weight]"], input#weight'],
    ['websites', 'input[name="product[website_ids][]"], #website_ids input[type="checkbox"]'],
    ['tier_price', 'input[name^="tier_price["]'],
    ['category_boxes', 'input[type="checkbox"][name*="categor" i]'],
    ['product_form', '#product_form, .product-edit, [data-ui-id="product-form"]'],
  ].map(([field, sel]) => ({ field, selector: sel, count: count(sel) }));

  // What the form really calls its controls: name -> sample count.
  const names = new Map();
  document.querySelectorAll('input, select, textarea').forEach((node) => {
    const name = node.getAttribute('name');
    if (!name) return;
    names.set(name, (names.get(name) || 0) + 1);
  });
  const controls = [...names.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 120)
    .map(([name, n]) => (n > 1 ? name + ' x' + n : name));

  // The Attribute Set control, from the select and from its labelled field.
  const asSelect = document.querySelector(
    'select[name="product[attribute_set_id]"], select[name="attribute_set_id"], select#attribute_set_id',
  );
  let asFieldText = '';
  if (asSelect) {
    const field = asSelect.closest('.admin__field, .field') || asSelect.parentElement;
    if (field) {
      asFieldText = squash(
        field.querySelector('.admin__field-label, label')?.textContent,
      );
    }
  }
  const asHidden = document.querySelector(
    'input[type="hidden"][name="product[attribute_set_id]"], input[type="hidden"][name="attribute_set_id"]',
  );

  // Is there any *other* labelled "Attribute Set" field we might be matching?
  const asLabels = [...document.querySelectorAll('.admin__field-label, th.label, label')]
    .filter((node) => /attribute\s*set|conjunto\s+de\s+atributos/i.test(squash(node.textContent)))
    .map((node) => {
      const field = node.closest('.admin__field, .field, tr, fieldset') || node.parentElement;
      return {
        label: squash(node.textContent),
        fieldText: field ? squash(field.textContent).slice(0, 200) : '',
      };
    });

  // Tabs and collapsibles, to tell an edit page from anything else.
  const tabs = [...document.querySelectorAll('.admin__page-nav-link, [role="tab"], .admin__collapsible-title')]
    .map((node) => squash(node.textContent))
    .filter(Boolean)
    .slice(0, 30);

  const report = {
    url: location.href,
    bodyId: document.body.id,
    bodyClass: document.body.className,
    readyState: document.readyState,
    controlCount: document.querySelectorAll('input, select, textarea').length,
    checks,
    attributeSet: {
      selectFound: Boolean(asSelect),
      selectName: asSelect?.getAttribute('name') || '',
      selectedValue: asSelect?.value || '',
      selectedText: asSelect ? squash(asSelect.options[asSelect.selectedIndex]?.textContent) : '',
      optionCount: asSelect ? asSelect.options.length : 0,
      firstOptions: asSelect
        ? [...asSelect.options].slice(0, 8).map((o) => squash(o.textContent))
        : [],
      hiddenFound: Boolean(asHidden),
      hiddenValue: asHidden?.value || '',
      labelledField: asFieldText,
      labelsMatching: asLabels,
    },
    tabs,
    controls,
  };

  const text = JSON.stringify(report, null, 2);
  console.log(text);
  return report;
})();
