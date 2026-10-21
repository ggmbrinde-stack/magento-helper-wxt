// MHX probe v2 — full current-filters block + real filter fields.
// HOW: grid with ≥1 filter applied → F12 Console → paste → Enter → copy ALL output. Read-only.
(() => {
  const o = [];
  const L = (s) => o.push(s);
  L('=== MHX probe v2 ===');
  // 1. whole current-filters region (title + list together)
  const title = document.querySelector('.admin__current-filters-title');
  L('title found: ' + !!title);
  const region = title?.closest('.admin__current-filters, .admin__data-grid-filters-current, [data-role="filter-current"]')
    ?? title?.parentElement?.parentElement ?? null;
  L('region: ' + (region ? ('<' + region.tagName.toLowerCase() + '> class="' + region.className + '"') : 'NOT FOUND'));
  if (region) L('region html: ' + region.outerHTML.slice(0, 6000));
  // 2. any list items under it
  const lis = region ? [...region.querySelectorAll('li')] : [];
  L('li count: ' + lis.length);
  lis.slice(0,5).forEach((c,i) => L(` li[${i}]: ` + c.outerHTML.slice(0, 800)));
  // 3. Knockout filter fields: Magento renders these with data-bind, names like namespace[field]
  const ko = [...document.querySelectorAll('input[data-bind],select[data-bind]')].slice(0,25);
  L('ko-bound fields: ' + document.querySelectorAll('input[data-bind],select[data-bind]').length + ' (showing 25)');
  ko.forEach((f,i) => {
    const db = (f.getAttribute('data-bind')||'').slice(0,120);
    L(` k[${i}]: <${f.tagName.toLowerCase()} type=${f.type||'-'}> name="${f.name||''}" db="${db}"`);
  });
  L('=== END ===');
  const t = o.join('\n'); console.log(t); return t;
})();
