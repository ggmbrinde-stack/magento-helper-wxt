// MHX probe — the left rail (grey band) of the admin.
// HOW: open any admin grid → F12 Console → paste → Enter → copy ALL output.
// Read-only: nothing is written, no request is made.
(() => {
  const o = [];
  const L = (s) => o.push(s);
  const cls = (el) => `<${el.tagName.toLowerCase()}> class="${String(el.className).slice(0, 90)}" id="${el.id}"`;
  const bg = (el) => {
    const cs = getComputedStyle(el);
    return `${cs.backgroundColor} / bg-image:${cs.backgroundImage.slice(0, 40)}`;
  };
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return `x=${Math.round(b.left)} w=${Math.round(b.width)} h=${Math.round(b.height)}`;
  };

  L('=== MHX rail probe ===');
  const nav = document.querySelector('nav.admin__menu, #menu, .admin__menu');
  L('nav: ' + (nav ? `${cls(nav)} ${r(nav)} display:${getComputedStyle(nav).display}` : 'NOT FOUND'));
  L('body class: "' + document.body.className + '"');

  if (nav) {
    let el = nav;
    for (let i = 0; i < 6 && el && el !== document.documentElement; i += 1) {
      L(`up[${i}]: ${cls(el)} ${r(el)} ${bg(el)} display:${getComputedStyle(el).display}`);
      el = el.parentElement;
    }
  }

  // What paints the left edge right now?
  [120, 300, 500].forEach((y) => {
    const hit = document.elementFromPoint(10, y);
    L(`elementFromPoint(10,${y}): ${hit ? `${cls(hit)} ${r(hit)}` : 'none'}`);
  });

  // Rail-shaped boxes anywhere on the page (narrow, tall, hugging x=0).
  const cands = [...document.querySelectorAll('body *')].filter((el) => {
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (
      b.width > 20 &&
      b.width < 320 &&
      b.height > 250 &&
      b.left <= 4 &&
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none')
    );
  });
  L('rail candidates: ' + cands.length);
  cands.slice(0, 12).forEach((el, i) => {
    L(` cand[${i}]: ${cls(el)} ${r(el)} ${bg(el)} position:${getComputedStyle(el).position}`);
  });

  // Horizontal room the content gives up to the band.
  ['.page-wrapper', '#page-wrapper', '.page-main', 'main', '#html-body', 'body'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const cs = getComputedStyle(el);
    L(`${sel}: ${r(el)} margin-left:${cs.marginLeft} padding-left:${cs.paddingLeft}`);
  });

  L('=== END ===');
  const text = o.join('\n');
  console.log(text);
  return text;
})();
