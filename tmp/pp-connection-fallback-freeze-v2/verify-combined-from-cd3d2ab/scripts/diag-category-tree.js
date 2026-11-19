// MHX category-tree diagnostic — paste into DevTools Console on the
// Magento "Update Attributes" page (Categories tab open), press Enter,
// then send back the full output text.
//
// Read-only: only inspects the DOM, changes nothing.

(() => {
  const out = [];
  const log = (s) => out.push(s);
  log('=== MHX category-tree diagnostic ===');
  log('url: ' + location.href);

  // 1. Headings — confirms which tab/section is visible.
  const heads = Array.from(
    document.querySelectorAll('h1, h2, h3, h4, legend, label, .admin__page-section-title'),
  )
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 25);
  log('headings(' + heads.length + '): ' + JSON.stringify(heads));

  // 2. Category checkboxes — names/ids tell us the real field names.
  const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  log('checkboxes total: ' + boxes.length);
  boxes.slice(0, 12).forEach((b, i) => {
    log(
      '  box[' + i + ']: name=' + JSON.stringify(b.name) +
      ' id=' + JSON.stringify(b.id) +
      ' value=' + JSON.stringify(b.value) +
      ' class=' + JSON.stringify(b.className) +
      ' outer=' + JSON.stringify(b.outerHTML.slice(0, 220)),
    );
  });

  // 3. For the FIRST category checkbox: walk up and show each ancestor's
  // tag/class until body — reveals the real tree nesting (ul/li? divs?).
  const cat = boxes.find((b) => /categor/i.test(b.name + ' ' + b.id + ' ' + b.className))
    || boxes[0];
  if (cat) {
    log('anchor box: name=' + JSON.stringify(cat.name) + ' id=' + JSON.stringify(cat.id));
    let el = cat.parentElement;
    let depth = 0;
    while (el && el !== document.body && depth < 14) {
      const kids = el.children.length;
      const sibIdx = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : -1;
      log(
        '  up[' + depth + ']: <' + el.tagName.toLowerCase() +
        '> class=' + JSON.stringify(el.className) +
        ' id=' + JSON.stringify(el.id) +
        ' children=' + kids + ' sibIndex=' + sibIdx +
        ' textHead=' + JSON.stringify((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)),
      );
      el = el.parentElement;
      depth += 1;
    }
    // 4. The likely tree root: nearest ancestor that contains 3+ checkboxes.
    let root = cat.parentElement;
    while (root && root !== document.body) {
      if (root.querySelectorAll('input[type="checkbox"]').length >= 3) break;
      root = root.parentElement;
    }
    if (root && root !== document.body) {
      log('tree root: <' + root.tagName.toLowerCase() + '> class=' + JSON.stringify(root.className) + ' id=' + JSON.stringify(root.id));
      log('tree root innerHTML (first 3000 chars):');
      log(root.innerHTML.slice(0, 3000));
    } else {
      log('tree root: NOT FOUND (no ancestor with 3+ checkboxes)');
    }
  } else {
    log('NO checkboxes found on this page at all.');
  }

  // 5. Native toggles present?
  const natives = document.querySelectorAll(
    '.jstree-ocl, .x-tree-ec-icon, .x-tree-elbow-plus, .x-tree-elbow-minus, ' +
    '.x-tree-node-icon, [data-action="toggle"], .action-toggle, .tree-toggle, ' +
    '.jstree, .x-tree-node, [class*="jstree"], [class*="x-tree"]',
  );
  log('native-tree-ish elements: ' + natives.length);
  Array.from(natives).slice(0, 8).forEach((el, i) => {
    log('  nat[' + i + ']: <' + el.tagName.toLowerCase() + '> class=' + JSON.stringify(el.className));
  });

  // 6. Our own markers — tells whether the extension content script ran.
  log('mhx toggles present: ' + document.querySelectorAll('.mhx-cat-toggle').length);
  log('mhx toolbar present: ' + document.querySelectorAll('.mhx-cat-tree-bar').length);
  log('mhx marked nodes: ' + document.querySelectorAll('[data-mhx-cat-node]').length);
  log('mhx theme style: ' + Boolean(document.getElementById('mhx-theme-styles')));
  log('=== END — copy everything between the === lines ===');
  console.log(out.join('\n'));
  return out.join('\n');
})();
