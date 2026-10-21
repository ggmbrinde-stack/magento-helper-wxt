// MHX mini-probe: Active filters strip + chips + fields + Apply.
// HOW: open product grid with ≥1 filter applied → F12 Console → paste → Enter → copy ALL output.
// Read-only: changes nothing.
(() => {
  const o = [];
  const L = (s) => o.push(s);
  L('=== MHX mini probe ===');
  L('url: ' + location.href);
  // 1. strip?
  const strip = document.querySelector('.filter-current,[data-role="filter-current"],.admin__data-grid-filter-current,.admin__data-grid-active-filters');
  L('strip by class: ' + (strip ? ('<' + strip.tagName.toLowerCase() + '> class="' + strip.className + '"') : 'NOT FOUND'));
  if (strip) L('strip html: ' + strip.outerHTML.slice(0, 2000));
  else {
    const heads = [...document.querySelectorAll('strong,b,span,div')].filter(e => e.children.length === 0 && /^active\s+filters?/i.test((e.textContent || '').trim()));
    L('heading fallback hits: ' + heads.length);
    heads.slice(0,3).forEach((h,i) => L(` head[${i}]: <${h.tagName.toLowerCase()}> "${(h.textContent||'').trim()}" parentClass="${(h.parentElement?.className||'').toString().slice(0,120)}"`));
    if (heads[0]?.parentElement) L('parent html: ' + heads[0].parentElement.outerHTML.slice(0, 2000));
  }
  // 2. chips (first 5)
  const chips = strip ? [...strip.querySelectorAll('li,.item')] : [];
  L('chips: ' + chips.length);
  chips.slice(0,5).forEach((c,i) => L(` chip[${i}]: ` + c.outerHTML.slice(0, 600)));
  // 3. fields (first 15 with name/label)
  const fields = [...document.querySelectorAll('input,select')].filter(e => !e.disabled).slice(0,15);
  L('fields: ' + document.querySelectorAll('input,select').length + ' (showing 15)');
  fields.forEach((f,i) => {
    let lab = f.getAttribute('aria-label') || '';
    if (!lab && f.id) lab = document.querySelector(`label[for="${CSS.escape(f.id)}"]`)?.textContent?.trim() || '';
    L(` f[${i}]: <${f.tagName.toLowerCase()} type=${f.type||'-'}> name="${f.name||''}" label="${lab.slice(0,60)}" ph="${f.placeholder||''}"`);
  });
  // 4. apply button?
  const apply = [...document.querySelectorAll('button,a,input[type=submit]')].find(b => /\bapply\b/i.test(b.textContent || b.value || ''));
  L('apply: ' + (apply ? (`<${apply.tagName.toLowerCase()}> class="${apply.className}" text="${((apply.textContent||apply.value||'').trim()).slice(0,40)}"`) : 'NOT FOUND'));
  L('=== END ===');
  const t = o.join('\n'); console.log(t); return t;
})();
