/*
 * Where does the PP live on this product edit page?
 *
 * Paste into the DevTools Console on the product edit page and send me the
 * output. Read-only: it reads values and text, clicks nothing.
 *
 * It prints (a) the Attribute Set field values, and (b) every place on the page
 * that holds a PP-looking string, with the element that holds it.
 */
(() => {
  const squash = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());
  const PP = /PP\s*[-_ ]?\d{2,6}/i;

  const field = (sel) => {
    const node = document.querySelector(sel);
    if (!node) return { found: false };
    return {
      found: true,
      tag: node.tagName,
      value: squash(node.value),
      defaultValue: squash(node.defaultValue),
      readOnly: Boolean(node.readOnly),
      visible: Boolean(node.offsetParent),
    };
  };

  const attributeSet = {
    'attribute-set-name': field('input[name="attribute-set-name"]'),
    'new-attribute-set-name': field('input[name="new-attribute-set-name"]'),
    'affected-attribute-set': [...document.querySelectorAll('[name="affected-attribute-set"]')].map(
      (n) => ({ tag: n.tagName, type: n.type, value: squash(n.value), checked: n.checked }),
    ),
  };

  const hits = [];
  document.querySelectorAll('input, select, textarea').forEach((node) => {
    const value = squash(node.value);
    if (PP.test(value)) {
      hits.push({
        where: 'value',
        tag: node.tagName,
        name: node.getAttribute('name') || '',
        id: node.id || '',
        value: value.slice(0, 140),
      });
    }
    if (node.tagName === 'SELECT') {
      const text = squash(node.options[node.selectedIndex]?.textContent);
      if (PP.test(text)) {
        hits.push({
          where: 'selected-option',
          name: node.getAttribute('name') || '',
          id: node.id || '',
          value: text.slice(0, 140),
        });
      }
    }
  });

  let seen = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && seen < 40) {
    const text = squash(node.nodeValue);
    if (text && PP.test(text)) {
      const el = node.parentElement;
      if (el) {
        hits.push({
          where: 'text',
          tag: el.tagName,
          id: el.id || '',
          class: String(el.className || '').slice(0, 70),
          value: text.slice(0, 140),
        });
        seen += 1;
      }
    }
    node = walker.nextNode();
  }

  // Any dropdown that lists several attribute-set names, whatever its name.
  const setLikeSelects = [...document.querySelectorAll('select')]
    .filter((s) => [...s.options].some((o) => /^(AS>|PP|Default)/i.test(squash(o.textContent))))
    .map((s) => ({
      name: s.getAttribute('name') || '',
      id: s.id || '',
      options: [...s.options].slice(0, 6).map((o) => squash(o.textContent)),
      selected: squash(s.options[s.selectedIndex]?.textContent),
    }));

  const report = {
    url: location.href,
    attributeSet,
    setLikeSelects,
    ppHits: hits,
  };

  console.log('%c[mhx pp probe]', 'font-weight:bold', report);
  const text = JSON.stringify(report, null, 2);
  navigator.clipboard?.writeText(text).then(
    () => console.log('[mhx pp probe] JSON copied to clipboard'),
    () => console.log('[mhx pp probe] copy failed — right-click the object above > Copy object'),
  );
  return report;
})();
