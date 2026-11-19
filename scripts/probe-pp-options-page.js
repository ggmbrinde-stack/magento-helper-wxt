/**
 * Reads the Options tab of a Toogas custom-option edit page, in the browser, and prints what the
 * page holds. Paste it into the DevTools console of the Magento admin edit page:
 *
 *   https://<admin host>/toogas/customoption/edit/id/<entity id>/
 *
 * It is read-only. It opens the Options tab (a native UI action that changes no data) and reads
 * the rendered Items rows. It never saves, deletes, moves, hides, reloads or posts anything.
 * The extension's own reads are unchanged by this file; it is a support probe for operators.
 *
 * Prints a table (face, catalogue option, label, sort, store), a summary with per-face counts and
 * repeated technique pairs, and the full JSON, copied to the clipboard when the console allows it.
 */
(async () => {
  const ITEMS = '[sub_options_items]';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const plain = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const words = value => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const letters = node => String(node.textContent ?? '').toLowerCase().split('').filter(c => c >= 'a' && c <= 'z').join('');

  const navLinks = () => Array.from(document.querySelectorAll(
    '.admin__page-nav-link, .admin__page-nav-items a, .admin__page-nav-items button, a[href="#options"]'));
  const names = node => [
    ...words(node.id),
    ...words(node.getAttribute('data-tab')),
    ...words(String(node.getAttribute('href') ?? '').replace(/^#/, '')),
  ];
  const openOptions = () => {
    const link = navLinks().find(node => names(node).indexOf('options') !== -1)
      ?? navLinks().find(node => letters(node) === 'options');
    if (!link) return false;
    link.click();
    return true;
  };
  const itemsTable = () => Array.from(document.querySelectorAll('table'))
    .find(table => table.querySelector(`select[name*="${ITEMS}"]`)) ?? null;

  openOptions();
  let host = itemsTable();
  for (let attempt = 0; attempt < 60 && !host; attempt += 1) {
    await sleep(100);
    if (attempt % 20 === 0) openOptions();
    host = itemsTable();
  }
  if (!host) {
    console.warn('No Items table found. Open the custom-option Edit page for the exact entity, '
      + 'confirm the Options tab exists, then run this again.');
    return;
  }
  // Knockout renders the rows right after the tab opens.
  await sleep(300);
  host = itemsTable() ?? host;

  const field = (row, name) => row.querySelector(`select[name*="${ITEMS}"][name*="[${name}]"]`);
  const index_of = name => {
    const segments = String(name).split('[').map(part => part.split(']')[0]);
    let index = '';
    for (let at = 0; at < segments.length - 1; at += 1) {
      if (segments[at] === 'sub_options_items' && /^\d+$/.test(segments[at + 1])) index = segments[at + 1];
    }
    return index;
  };

  const rows = [];
  const seen = new Set();
  for (const parent of Array.from(host.querySelectorAll(`select[name*="${ITEMS}"][name*="[parent]"]`))) {
    const row = parent.closest('tr');
    if (!row || seen.has(row)) continue;
    seen.add(row);
    const option = field(row, 'name_option');
    const name = row.querySelector('input[name*="[name]"]');
    const sort = row.querySelector('input[name*="[sort]"]');
    const store = field(row, 'store_view');
    rows.push({
      row: index_of(parent.name),
      face: plain(parent.options[parent.selectedIndex]?.text),
      face_value: plain(parent.value),
      option_id: plain(option?.value),
      option: plain(option?.options[option.selectedIndex]?.text),
      label: plain(name?.value),
      sort: plain(sort?.value),
      store: plain(store?.value),
      posted_name: plain(parent.name),
    });
  }

  const perFace = {};
  const pairs = new Map();
  for (const entry of rows) {
    const face = entry.face || '(no face)';
    perFace[face] = (perFace[face] ?? 0) + 1;
    const key = `${face} | ${entry.option_id}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  const repeated = Array.from(pairs).filter(([, count]) => count > 1).map(([key, count]) => `${key} x${count}`);
  const out = {
    url: location.pathname,
    read_at: new Date().toISOString(),
    items_table: true,
    rows: rows.length,
    per_face: perFace,
    repeated_pairs: repeated,
    items: rows,
  };

  console.table(rows.map(({ posted_name, ...rest }) => rest));
  console.log(JSON.stringify(out, null, 2));
  console.log(`${rows.length} item row(s), ${Object.keys(perFace).length} face(s), `
    + `${repeated.length} repeated technique pair(s).`);
  if (typeof copy === 'function') {
    copy(JSON.stringify(out));
    console.log('The JSON is copied to the clipboard.');
  }
  return out;
})();
