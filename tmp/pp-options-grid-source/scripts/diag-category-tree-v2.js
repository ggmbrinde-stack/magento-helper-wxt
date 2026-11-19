// MHX category-tree diagnostic v2 — paste into DevTools Console on the
// Magento "Update Attributes" page with the CATEGORIES TAB OPEN
// (the tab showing "Add Product To Categories"), press Enter, then send
// back the full output text. Read-only: inspects the DOM, changes nothing.

(() => {
  const out = [];
  const log = (s) => out.push(s);
  const head = (t) => (t || '').replace(/\s+/g, ' ').trim();
  log('=== MHX category-tree diagnostic v2 ===');
  log('url: ' + location.href);

  const tabItems = Array.from(
    document.querySelectorAll('.admin__page-nav-item, .ui-tabs-tab'),
  ).map((el) => ({
    text: head(el.textContent).slice(0, 40),
    active:
      el.classList.contains('active') || el.classList.contains('_active'),
  }));
  log('nav tabs: ' + JSON.stringify(tabItems.slice(0, 15)));

  const bodyHtml = document.body ? document.body.innerHTML.slice(0, 5000) : '';
  log('body mentions categories heading: ' +
    /add product to categor/i.test(bodyHtml));

  const allBoxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  const toggles = allBoxes.filter((b) => /^toggle_/i.test(b.name));
  const treeBoxes = allBoxes.filter((b) => !/^toggle_/i.test(b.name));
  log('checkboxes total: ' + allBoxes.length +
    ' (toggle_*=' + toggles.length + ', others=' + treeBoxes.length + ')');
  treeBoxes.slice(0, 15).forEach((b, i) => {
    log('  tree[' + i + ']: name=' + JSON.stringify(b.name) +
      ' id=' + JSON.stringify(b.id) +
      ' value=' + JSON.stringify(b.value) +
      ' outer=' + JSON.stringify(b.outerHTML.slice(0, 240)));
  });
  const cat = treeBoxes[0];
  if (cat) {
    log('anchor: name=' + JSON.stringify(cat.name));
    let el = cat.parentElement;
    let depth = 0;
    while (el && el !== document.body && depth < 16) {
      const sib = el.parentElement
        ? Array.prototype.indexOf.call(el.parentElement.children, el) : -1;
      log('  up[' + depth + ']: <' + el.tagName.toLowerCase() +
        '> class=' + JSON.stringify(el.className) +
        ' kids=' + el.children.length + ' sib=' + sib +
        ' head=' + JSON.stringify(head(el.textContent).slice(0, 90)));
      el = el.parentElement;
      depth += 1;
    }
    let root = cat.parentElement;
    while (root && root !== document.body) {
      const n = Array.from(root.querySelectorAll('input[type="checkbox"]'))
        .filter((b) => !/^toggle_/i.test(b.name)).length;
      if (n >= 3) break;
      root = root.parentElement;
    }
    if (root && root !== document.body) {
      log('root: <' + root.tagName.toLowerCase() +
        '> class=' + JSON.stringify(root.className));
      log(root.innerHTML.slice(0, 4000));
    } else {
      log('root: NOT FOUND (tab content maybe not loaded)');
    }
  } else {
    log('NO non-toggle checkboxes — click Categories tab, wait, re-run.');
  }
  const natives = document.querySelectorAll(
    '.jstree-ocl, .x-tree-ec-icon, .x-tree-node, .jstree');
  log('native-tree elements: ' + natives.length);
  log('mhx toggles: ' + document.querySelectorAll('.mhx-cat-toggle').length);
  log('mhx toolbar: ' + document.querySelectorAll('.mhx-cat-tree-bar').length);
  log('=== END v2 ===');
  console.log(out.join('\n'));
})();
