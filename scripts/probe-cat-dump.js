// MHX category dump — snapshot of the LIVE tree on the Magento page.
//
// Paste this whole file into the DevTools Console with
// Sales → Update Attributes → Categories open (tree visible), press Enter.
// Read-only: reads labels and checkboxes, changes nothing.
//
// It copies a JSON snapshot to the clipboard and prints a row count. Save it
// anywhere and run
//
//   npm run cat:check -- path/to/dump.json
//
// (or just `npm run cat:check` if it is still on the clipboard) to compare the
// page against the Notion sheet: which categories have no code, which ones
// disagree with Notion, and which Notion categories are missing from the admin.
//
// The snapshot is plain data — no token, no admin path, safe to paste back.
(() => {
  const BOX = 'input.category-checkbox, input[name="add_category_ids[]"]';
  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();

  /** One category's own name: label first, else the li minus controls/lists. */
  const labelOf = (li) => {
    const label = li.querySelector(':scope > label');
    if (label) return clean(label.textContent);
    const clone = li.cloneNode(true);
    clone
      .querySelectorAll('ul, ol, button, label input, [data-mhx-cat-node], .mhx-cat-no')
      .forEach((node) => node.remove());
    return clean(clone.textContent);
  };

  /** Parent item, for both tree shapes Magento has shipped. */
  const ownerOf = (li) => {
    const list = li.parentElement;
    if (!list) return null;
    // Sibling model (live): children live in a ul that FOLLOWS the branch li.
    const sibling = list.previousElementSibling;
    if (sibling instanceof HTMLLIElement) return sibling;
    // Nested model (fallback): the branch li contains its own ul.
    const closest = li.parentElement.closest('li');
    return closest instanceof HTMLLIElement ? closest : null;
  };

  const pathOf = (li) => {
    const names = [];
    let node = li;
    for (let hops = 0; node && hops < 50; hops += 1) {
      names.unshift(labelOf(node));
      node = ownerOf(node);
    }
    return names;
  };

  const trees = Array.from(document.querySelectorAll('ul, ol'))
    .map((list) => ({ list, boxes: list.querySelectorAll(BOX).length }))
    .filter((entry) => entry.boxes >= 3)
    .sort((a, b) => b.boxes - a.boxes);
  const tree = trees[0];
  if (!tree) {
    console.log('MHX dump: no category tree found. Is the Categories tab open?');
    return;
  }

  const rows = [];
  for (const li of Array.from(tree.list.querySelectorAll('li'))) {
    const box = li.querySelector(BOX);
    if (!box) continue;
    const name = labelOf(li);
    if (!name) continue;
    const path = pathOf(li);
    // Drop the store root from the path when it only names the tree itself.
    if (/^default category$/i.test(path[0] || '') && path.length > 1) path.shift();
    const badge = li.querySelector('.mhx-cat-no');
    rows.push({
      path: path.slice(0, -1),
      name: path[path.length - 1] || name,
      checked: box.checked === true,
      // Present only when the helper is running; the checker recomputes it too.
      badge: badge ? clean(badge.textContent) : null,
    });
  }

  const dump = {
    version: 1,
    url: location.href,
    capturedAt: new Date().toISOString(),
    rows,
  };
  const json = JSON.stringify(dump);
  try {
    copy(json);
    console.log(`MHX dump: ${rows.length} categories copied to the clipboard.`);
  } catch {
    console.log('MHX dump: clipboard unavailable, JSON follows:');
    console.log(json);
  }
})();
