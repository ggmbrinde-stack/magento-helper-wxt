// MHX category probe v3 — runs the BUILT extension logic step by step on the
// live page and reports which check rejects the tree.
// Paste into Console with the Categories tab OPEN (tree visible), Enter,
// send back ALL output. Read-only: changes nothing.

(() => {
  const out = [];
  const log = (s) => out.push(s);
  log('=== MHX probe v3 ===');
  log('url: ' + location.href);

  // Step 1: list candidates — every ul/ol with 3+ checkboxes.
  const lists = Array.from(document.querySelectorAll('ul, ol')).filter(
    (ul) => ul.querySelectorAll('input[type="checkbox"]').length >= 3,
  );
  log('lists with 3+ boxes: ' + lists.length);
  lists.slice(0, 10).forEach((ul, i) => {
    const boxes = ul.querySelectorAll('input[type="checkbox"]').length;
    const lis = ul.querySelectorAll(':scope > li').length;
    const nested = ul.querySelectorAll('li ul, li ol').length;
    const cls = (ul.className || '').toString().slice(0, 80);
    log('  list[' + i + ']: <' + ul.tagName.toLowerCase() +
      '> class=' + JSON.stringify(cls) +
      ' boxes=' + boxes + ' directLi=' + lis + ' nestedLists=' + nested);
  });

  // Step 2: for the biggest candidate, check branch shape with LOOSE nesting
  // (li containing ANY descendant ul, not just direct child).
  const big = lists.sort((a, b) =>
    b.querySelectorAll('input[type="checkbox"]').length -
    a.querySelectorAll('input[type="checkbox"]').length)[0];
  if (big) {
    const strict = Array.from(big.querySelectorAll('li')).filter(
      (li) => li.querySelector(':scope > ul, :scope > ol'),
    ).length;
    const loose = Array.from(big.querySelectorAll('li')).filter(
      (li) => li.querySelector('ul, ol'),
    ).length;
    log('biggest list: strict branches=' + strict + ' loose branches=' + loose);
    const section = big.closest(
      'fieldset, .fieldset-wrapper, .ui-tabs-panel, form, .entry-edit',
    );
    const txt = (section ? section.textContent : big.parentElement.textContent) || '';
    log('section mentions categories heading: ' + /add product to categor/i.test(txt));
    log('route mentions product_action: ' + /\/catalog\/product_action/.test(location.href));
    log('first 1500 chars of biggest list HTML:');
    log(big.outerHTML.slice(0, 1500));
  } else {
    log('NO list with 3+ checkboxes — tree markup differs; send screenshot of Elements panel.');
  }
  log('=== END v3 ===');
  const text = out.join('\n');
  console.log(text);
  return text;
})();
