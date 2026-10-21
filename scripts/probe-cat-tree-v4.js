// MHX probe v4 — category tree shape: does the sibling model hold?
// HOW: Update Attributes → Categories tab open → F12 Console → paste → Enter → copy ALL output. Read-only.
(() => {
  const o = [];
  const L = (s) => o.push(s);
  L('=== MHX probe v4 ===');
  L('url: ' + location.href);
  const boxes = [...document.querySelectorAll('input.category-checkbox, input[name="add_category_ids[]"]')];
  L('cat boxes: ' + boxes.length);
  if (!boxes.length) { L('NO tree boxes — wrong tab/page?'); }
  const first = boxes.find(b => (b.closest('li')?.textContent || '').trim().length > 0);
  if (first) {
    const li = first.closest('li');
    L('first li html: ' + (li?.outerHTML ?? '').slice(0, 900));
    const list = li?.parentElement;
    L('parent list: <' + list?.tagName.toLowerCase() + '> class="' + String(list?.className).slice(0,80) + '"');
    L('list.previousElementSibling: ' + (list?.previousElementSibling ? ('<' + list.previousElementSibling.tagName.toLowerCase() + '> "' + (list.previousElementSibling.textContent||'').trim().slice(0,80) + '"') : 'NONE'));
    // walk 3 levels up with the sibling model
    let node = li, d = 0;
    while (node && d < 4) {
      const l = node.parentElement;
      const owner = (l instanceof HTMLUListElement) ? l.previousElementSibling : null;
      L(` up[${d}]: owner=` + (owner ? ('<'+owner.tagName.toLowerCase()+'> "'+((owner.textContent||'').trim().slice(0,60))+'"') : 'NONE'));
      node = (owner instanceof HTMLLIElement) ? owner : null;
      d += 1;
    }
    // checked state sample
    const checked = boxes.filter(b => b.checked).length;
    L('checked boxes: ' + checked);
    boxes.filter(b => b.checked).slice(0,8).forEach((b,i) => L(` c[${i}]: "${(b.closest('li')?.textContent||'').trim().slice(0,60)}"`));
  }
  // root guess: first li of the topmost ul
  const uls = [...document.querySelectorAll('ul')].filter(u => u.querySelectorAll('input.category-checkbox, input[name="add_category_ids[]"]').length >= 3);
  L('candidate trees: ' + uls.length);
  const top = uls.filter(u => !uls.some(o => o !== u && o.contains(u)))[0];
  if (top) {
    const kids = [...top.children].slice(0,4).map(c => '<'+c.tagName.toLowerCase()+'> "'+((c.textContent||'').trim().slice(0,50))+'"');
    L('top children: ' + JSON.stringify(kids));
  }
  L('=== END ===');
  const t = o.join('\n'); console.log(t); return t;
})();
