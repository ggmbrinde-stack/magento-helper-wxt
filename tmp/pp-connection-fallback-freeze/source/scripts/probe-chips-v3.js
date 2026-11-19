// MHX probe v3 — the FILTER PANEL fields behind chips (Parent SKU, Type...).
// HOW: grid with ≥1 filter applied → open Filters panel if collapsed → F12 Console → paste → Enter → copy ALL output. Read-only.
(() => {
  const o = [];
  const L = (s) => o.push(s);
  L('=== MHX probe v3 ===');
  // 1. filter panel root?
  const panel = document.querySelector('[data-role="filter-form"],.admin__data-grid-filters,.admin__data-grid-filters-wrap');
  L('panel: ' + (panel ? ('<' + panel.tagName.toLowerCase() + '> class="' + String(panel.className).slice(0,120) + '"') : 'NOT FOUND'));
  if (panel) L('panel html (8k): ' + panel.outerHTML.slice(0, 8000));
  // 2. filter rows: label + field pairs Magento renders per filter
  const rows = [...document.querySelectorAll('.admin__form-field,.admin__field,.admin__data-grid-filter-row [data-role="filter-field"]')].slice(0,10);
  L('labeled rows: ' + rows.length);
  rows.slice(0,5).forEach((r,i) => L(` row[${i}]: ` + r.outerHTML.slice(0, 900)));
  // 3. ALL selects + text inputs that have EITHER a name, id, label, or data-bind mentioning value/filter
  const fields = [...document.querySelectorAll('select,input[type=text],input[type=search],input:not([type])')].filter(f => !f.disabled && !f.closest('.mhx-chip-editing'));
  L('candidate fields: ' + fields.length);
  fields.slice(0,30).forEach((f,i) => {
    const id = f.id || '';
    const lab = document.querySelector(`label[for="${id}"]`)?.textContent?.trim() || f.closest('label')?.textContent?.trim() || f.getAttribute('aria-label') || f.placeholder || '';
    const db = (f.getAttribute('data-bind')||'').replace(/\s+/g,' ').slice(0,140);
    const opts = f.tagName === 'SELECT' ? (' opts=' + [...f.options].slice(0,6).map(x=>`"${x.text.slice(0,20)}"`).join('|')) : '';
    L(` f[${i}]: <${f.tagName.toLowerCase()}> name="${f.name||''}" id="${id.slice(0,40)}" label="${String(lab).slice(0,50)}" db="${db}"${opts}`);
  });
  // 4. apply button exact markup
  const apply = [...document.querySelectorAll('button,a')].find(b => /\bapply\b/i.test(b.textContent||''));
  L('apply html: ' + (apply ? apply.outerHTML.slice(0,400) : 'NOT FOUND'));
  L('=== END ===');
  const t = o.join('\n'); console.log(t); return t;
})();
