// MHX probe v5 — massaction "Actions" toolbar dropdown shape.
// HOW: product grid → F12 Console → paste → Enter → copy ALL output. Read-only.
(() => {
  const o = [];
  const L = (s) => o.push(s);
  L('=== MHX probe v5 ===');
  const marked = [...document.querySelectorAll('[data-role="massaction"],.massaction-wrap')];
  L('marked roots: ' + marked.length);
  marked.slice(0,2).forEach((r,i) => L(` root[${i}]: <${r.tagName.toLowerCase()}> class="${String(r.className).slice(0,100)}" html=${r.outerHTML.slice(0,1200)}`));
  const trigs = [...document.querySelectorAll('[data-toggle="dropdown"],button')].filter(b => (b.textContent||'').trim().toLowerCase() === 'actions');
  L('actions triggers: ' + trigs.length);
  trigs.slice(0,2).forEach((t,i) => {
    L(` trig[${i}]: <${t.tagName.toLowerCase()}> class="${String(t.className).slice(0,100)}"`);
    let n = t.parentElement, d = 0;
    while (n && d < 5) {
      const ul = n.querySelector(':scope > ul, ul');
      L(`  up[${d}]: <${n.tagName.toLowerCase()}> class="${String(n.className).slice(0,80)}" hasUl=${!!ul} liCount=${ul ? ul.querySelectorAll('li').length : 0}`);
      if (ul && ul.querySelector('li')) { L('  menu html: ' + ul.outerHTML.slice(0, 2500)); break; }
      n = n.parentElement; d += 1;
    }
  });
  L('=== END ===');
  const t = o.join('\n'); console.log(t); return t;
})();
