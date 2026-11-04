/*
 * Which node shows the CURRENT Attribute Set on this page?
 *
 * Paste on the product edit page and send me the printed lines. Read-only.
 *
 * The earlier probe proved the page holds all attribute-set names as spans, so
 * the open question is only where the product's own value is rendered.
 */
(() => {
  const sq = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());
  const out = [];

  // 1. Anything the markup itself calls an attribute set.
  const widgets = [
    ...document.querySelectorAll(
      '[name*="attribute-set" i], [id*="attribute-set" i], [class*="attribute-set" i]',
    ),
  ];
  out.push('WIDGET_COUNT=' + widgets.length);
  widgets.slice(0, 12).forEach((el) => {
    out.push(
      'WIDGET <' + el.tagName + '> id=' + (el.id || '') +
        ' name=' + (el.getAttribute('name') || '') +
        ' class=' + String(el.className || '').slice(0, 60) +
        ' value=' + sq(el.value).slice(0, 60) +
        ' text=' + sq(el.textContent).slice(0, 80),
    );
  });

  // 2. Every "selected" marker on the page.
  [...document.querySelectorAll('option:checked, [aria-selected="true"], [aria-checked="true"], .selected')]
    .slice(0, 12)
    .forEach((el) => {
      out.push(
        'SELECTED <' + el.tagName + '> id=' + (el.id || '') +
          ' class=' + String(el.className || '').slice(0, 50) +
          ' = ' + sq(el.textContent).slice(0, 80),
      );
    });

  // 3. What the page says right next to the words "Attribute Set".
  const text = sq(document.body.innerText);
  const at = text.search(/attribute\s*set|conjunto\s+de\s+atributos/i);
  if (at >= 0) {
    out.push('AROUND_LABEL=' + text.slice(Math.max(0, at - 40), at + 240));
  } else {
    out.push('AROUND_LABEL=(no "Attribute Set" text on the page)');
  }

  // 4. The biggest attribute-set container's markup, so I can see the structure.
  const biggest = widgets
    .map((el) => ({ el, spans: el.querySelectorAll('span').length }))
    .sort((a, b) => b.spans - a.spans)[0];
  if (biggest) {
    out.push('MARKUP=' + sq(biggest.el.outerHTML).slice(0, 900));
  }

  console.log(out.join('\n'));
  return out;
})();
