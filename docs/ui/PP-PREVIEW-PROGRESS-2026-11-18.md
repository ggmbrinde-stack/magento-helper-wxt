# PP Preview: progress and context, 18 November 2026

Working document for the PP Preview lane. It records what was built, what was
verified against a real admin session, what is still open, and how to pick the
work up. Source code is authoritative; this file records intent, evidence and
limits.

Lane: `src/page/features/pp-scan/**`, `src/entrypoints/background/ppFreshForm.ts`,
`src/entrypoints/background/routers/ui.ts`, `src/dashboard/sections/ui/PpPreview.tsx`,
`src/dashboard/sections/ui/ppPreviewModel.ts`, `src/core/messages/ui.ts`.

The work itself lives in the candidate tree `tmp/pp-preview-readability-candidate`
and is staged into `chrome-installs/experimental` as **BOG Helper Experimental**.
The repository root `src/` is the untouched baseline. Nothing has been committed,
pushed or published.

## What the lane does

1. Choose one Notion V2 PP from the loaded catalogue.
2. Point at the exact Magento custom-option entity, using either an already
   loaded Options Grid row or one exact-record admin tab.
3. Pair manually, then preview: the Notion reference and a fresh Magento form
   are read in parallel and compared read-only.
4. Optional write lanes, each with its own confirmation:
   - add missing technique rows to an unsaved helper form,
   - remove ticked existing rows,
   - set the existing rows to the Notion order.
5. Save with Magento's own Save, then read the record back and verify the write.

Nothing is ever written to Notion. Existing Magento rows are only changed
through a lane the operator confirms, and no row is ever removed because it is
missing from Notion.

## Current state

Works live and was confirmed in this session:

- Fresh form read, plan table, order verdict per face, catalogue mapping.
- Removal through the row's own delete button, with renumbering and a per-row
  report: `1 removed, 0 failed, 0 skipped`.
- Save of a removal, followed by a read-back that reports the stored state.
- Order verdict wording, for example
  `1 row(s) not in Notion order` and
  `Face 1: Notion Tampografia 1 Cor → Laser Metal. Form Laser Metal → Tampografia 1 Cor.`
- The order lane now reaches the page's own record list, reports it as found,
  and writes it. The write is the only remaining lever, see below.
- The order lane's Sort write and DOM reorder were confirmed to change nothing
  stored, and were removed.

Not yet confirmed live:

- Whether writing the record list changes the order Magento stores. The last run
  that reached the list wrote the same order back because of a mapping bug, and
  the run after that only saved. This is the one open question.
- Save after a removal with an empty planned-row list.
- Panel refresh from the save read-back, with the earlier catalogue and labels
  kept.

## The Magento page: what it really is

Captured from the live admin with DevTools snippets, because several attempts
failed against assumptions. Entity 42, page
`toogas_attributesetcustomoptions/attributesetcustomoptions/edit`, a custom
module rather than the native product options tab.

- The Items table is Magento's `admin__dynamic-rows` UI component:
  `class="admin__dynamic-rows admin__control-table"`, `data-role="grid"`,
  `data-index="sub_options_items"`, and the rows carry `class="data-row"` plus
  `data-repeat-index`.
- `window.ko` does not exist on the page. Knockout is only reachable through
  RequireJS, `require(['ko'], ...)`, which works.
- `ko.contextFor(row).$data` is the component itself, named
  `toogas_attributesetcustomoptions_attributesetcustomoptions_f`, not the row
  record. Its keys include `modules: {storage, dnd, parentComponent}`,
  `_elems: array(2)`, `recordData: array(1)` and
  `_requested: ...options.sub_options_dnd` / `...sub_options_items_dnd`.
- The record array the component posts is `elems`, inherited from the component
  prototype, so it never shows up in the instance's own property names. The
  component also carries a `dnd` module, which means the page's own order
  control is drag and drop over that same array.
- The page has no edit form. The only `form` element is `form-search`, so
  Magento's Save is an AJAX post. A hook on `HTMLFormElement.prototype.submit`
  and on the `submit` event captured nothing.
- Item fields, per row:
  `options[sub_options_items][sub_options_items][N][parent]` (select, value
  `key_pjupep`, label `Face 1`),
  `[N][name_option]` (select, the catalogue id),
  `[N][name]` (hidden, holds the same id, but empty on one live row),
  `[N][name][1]` and the other store views, `[N][price]`, `[N][sort]`,
  `[N][store_view]`.
- The row's delete control is
  `<button class="action-delete" data-bind="click: function(){ $parent.processingDeleteRecord($record().index, $record().recordId); }">`
  inside `<td class="...actionDelete">`, and its label span carries
  `i18n: $parent.deleteButtonLabel`, the same string the page-wide `Delete all`
  uses, so text cannot be used to tell them apart.
- Knockout removes a row by hiding it through its `visible` binding, so a row can
  be present in the DOM and still be deleted.
- The helper panels the extension injects (`#mhx-pp-catalog`,
  `#mhx-pp-draft-scan`) sit in normal page flow, have no fixed positioning, no
  named fields and `type="button"` controls, and their stylesheet is namespaced
  with `mhx-` classes. They cannot cover, submit or restyle the Magento form,
  and the save lane skips them when it reads fields.

## Timeline of the stored-order investigation

All times are from the operator's pastes on 18 November, entity 42, catalogue
ids 1 (Tampografia 1 Cor) and 11 (Laser Metal). Notion order is 1 then 11.

- 12:08. First order attempt failed before touching anything: `The Items table is
  not on the page.` The readiness probe read the page's embedded data, which
  lists rows before the table renders. Placement became async and opened the
  Options tab itself.
- 12:14. Read shows stored order 11 then 1.
- 12:16, 12:26. Add lane reports `Row shown below its face, but its list was not
  found`, the table shows the added row last, and the stored order is still 11
  then 1. First evidence that the table order is not what is stored.
- 13:33 to 13:34. Same again: one row, then two rows with 11 first.
- 13:47. Sort values were typed by the lane on the rows and the table showed the
  plan order. The read at 13:47:01, taken while that unsaved helper table was on
  screen, reported 1 then 11; the read at 13:47:57, after a fresh form load,
  reported 11 then 1 again. Conclusion: a read from the same unsaved helper tab
  is not proof of the stored order.
- 13:47 diagnostics, first real payload: `record list not found`, `window.ko
  absent`, every row `Bound no` and `Record no`, `Context chain none`, and both
  rows carried a blank `sort`.
- 14:11. After loading Knockout through RequireJS, the lane reported `record list
  found as elems` and `model moved yes`, the table still showed 11 first, and the
  page order equalled 11 then 1. This was a no-op write, see defect 18.
- 14:18:58. After Save, the stored read shows `11` with Sort 2 and `1` with Sort
  1. The Sort values landed, and the stored order did not change.
- 14:19 onwards. Three rules fit the evidence: Sort descending, server-side id
  descending, or the posted array never being changed. The two hand experiments
  below discriminate them.

## Defects found and fixed in this session

Each one was found from a live report or from reading the lane end to end.

1. Removal found no Items table. The helper tab was still on General; Magento
   renders the Items only after the Options tab opens. The remover now opens the
   tab itself and waits for the table.
2. Removal found no delete control. The scan only looked at interactive tags.
   It now scans every descendant for a delete, remove or trash marker.
3. Removal pressed the icon and nothing happened. A plain `click()` does not
   reach handlers bound to pointer or mouse down, so the press now dispatches
   pointerdown, mousedown, mouseup and click from the element's own window.
4. Removal still pressed the cell. The row button's label is the same
   `deleteButtonLabel` string as the page-wide `Delete all`, and a guard was
   rejecting it on text. Text no longer rejects a control inside the row, table
   cells are never pressed in place of a control, and the control is re-scanned
   for up to three seconds because the delete cell renders last.
5. A face whose rows are all in the plan was never reordered: the placement
   needed an unplanned row to anchor against. It reordered from the face's first
   row. Superseded: the DOM reorder was removed in the review, see defect 20.
6. Field indices were never renumbered. The lookup used the first
   `sub_options_items]` segment, but the live names repeat it, so the intent
   silently did nothing in both the apply and removal lanes. Superseded: the
   index rewrite was removed in the review, see defect 21.
7. The order mode never reached the worker: the router mapped everything except
   `remove` to `add`, so the order button would have run the add lane.
8. Save after a removal was blocked with "planned item row(s) are not in that
   helper form any more". The save lane was always given the plan's add rows.
   It now gets only what the apply handled: none after a removal, the added rows
   after an add, the whole ordered list after an order.
9. The save section disappeared with the apply report on Dismiss, leaving an
   unsaved helper form with no dashboard action. It is now rendered on its own.
10. A removal-only save claimed `0 of 0 rows read back` and `Order confirmed`.
    Both are gated, and the confirmation is named `Added rows confirmed`.
11. The stored order was never compared with Notion after a save. The read-back
    now reports it per face.
12. Stale state crossed records: removal ticks and the removal record survived a
    new selection, and the apply report survived a successful save. Both are
    cleared.
13. The save read-back ran with the Options tab closed, so it returned no
    catalogue and no labels. Every plan row then became "needs review" and the
    order verdict and order button disappeared. The read-back now opens the
    Options tab, and the panel keeps the earlier catalogue and labels when a
    read-back still lacks them.
14. An apply brought the Magento helper tab to the front and left it there. It
    now stays in the background and the dashboard is activated.
15. An added row saved first even though the page showed it last. The read-back
    proved the stored order follows Magento's own state rather than the table,
    and the record lookup had taken the bound cell, so the list was never
    touched. The lookup now walks up to the holder with an `elems` list and tries
    every candidate until the list actually holds both records.
16. The order action still reported `The Items table is not on the page.` at
    12:08. Its readiness probe read the page's embedded data, which lists the
    rows before the table is rendered, so placement ran too early. The placement
    lane is async: it opens the Options tab itself and waits up to twelve
    seconds for the real table, and the background probe was removed.
17. The record list still could not be found after 16. Cause: the list is
    `elems` on the `admin__dynamic-rows` component prototype, and the search
    walked own properties only. Its shape test also required every entry to
    carry its own `elems`, which a leaf item record never does. Fixed by reading
    `elems` directly through the prototype chain, matching the list by length
    plus objects, loading Knockout through RequireJS when `window.ko` is absent,
    and walking the prototype levels in both the list search and the list writer.
18. `model moved yes` was reported while the order had not changed. Cause: the
    mapping into the record list was built from `data-repeat-index` read after
    the table had been reordered, and that index travels with its row, so the
    write rebuilt the order the list already had and the equality check passed.
    Fixed by capturing every record's identity, catalogue id and face, before
    anything moves, and applying the plan through that identity.
19. The Sort write did not control the stored order. Sort 1 and 2 were stored and
    the order stayed 11 then 1. Worse, dispatching `change` re-rendered the rows
    back into the model order, discarding the DOM move. The Sort write was
    removed.
20. The DOM row reorder never survived. It was discarded on the next render, and
    it hid whether the record write had worked, because the table looked right
    while the model was untouched. Removed.
21. Rewriting the posted field indices changed nothing stored, across two live
    runs, and it mutates `name` attributes that Knockout owns. Removed.
22. The order lane carried four levers at once. Under review it was reduced to
    one, the record list write, with the diagnostics rebuilt around it.

## Order lane as it stands now

`placePpItemRows(plan)` in `src/page/features/pp-scan/apply.ts`, build id
`pp-order-4`, runs for the order lane and again inside the save lane just before
Magento's Save is pressed.

1. Opens the Options tab and waits up to about twelve seconds for the table that
   holds a `select[name*="[sub_options_items]"]`.
2. Reads the rows and captures each record's identity: catalogue id and face.
3. Loads Knockout through `window.ko` or RequireJS, walks the context chain from
   the first row, and finds the component's `elems` array.
4. Computes the plan order per face. Records outside the plan keep their relative
   position, plan records are placed at the tail of their face in plan order.
5. Writes the array once, re-reads it, and counts how many plan rows now sit in
   place in the record list itself.
6. Reports `record list in plan order yes` or a named failure: list not found, or
   list refused the order.

It does not reorder table nodes, does not type into Sort, and does not rename
posted fields. Nothing is written to Magento until the operator confirms Save.

## Diagnostics: current payload

Returned by the order lane and by the save lane's placement step, rendered in PP
Preview as one verdict line plus a details block called `Record list
diagnostics`.

Fields:

| Field | Meaning |
|---|---|
| `build` | `pp-order-4`, names the code that produced the report |
| `url` | source page the payload came from |
| `tableFound` | whether the Items table appeared |
| `rowCount` | rows found in the table |
| `waitedMs` | how long the lane waited for the table |
| `listFound` | whether the record list was found |
| `listKey` | the property it lives under, normally `elems` |
| `listLength` | how many entries that list holds |
| `modelOrder` | catalogue ids in the order the record list holds |
| `modelMoved` | whether the record list is now in the plan order |
| `ordered` / `total` | plan rows in place, out of plan rows requested |

The payload comes from the same injection that does the write, so it describes
the exact page the write touched. It reads only.

Removed in the trim, along with the code that produced them: the binding context
chain, the hidden field dump, the per-row field and attribute dump, the row table
with repeat index, bound and record, the `window.ko` flag, the page order line and
the form count. They belonged to the abandoned avenue and made the panel hard to
read.

## The one open question and how to settle it

The record list is written, but the stored order has never been shown to change
as a result of that write. Three rules still fit every observation:

1. The module orders items by Sort descending. 2 before 1 fits, and before any
   Sort existed both were blank so the tie went to the record created last.
2. The module orders by the item's own record id, newest first, so no field can
   move it.
3. The module keeps the array order it was given, and the write that reached the
   page did not reach the array that is posted, which leaves the save posting the
   order it loaded with. This is now less likely, since `elems` is the component's
   own record array and `dnd` rewrites the same one, but it is not excluded.

Two hand experiments settle it, both done in Magento with the helper out of the
way:

A. Set Sort 9 on Tampografia and Sort 1 on Laser, press Magento's Save, reload.
   If Tampografia comes first, rule 1 holds and the lane only needs to number the
   rows in reverse.
B. Drag Tampografia above Laser with the page's own drag and drop, Save, reload.
   If the order sticks, rule 3 holds and the posted array is the lever. If it does
   not stick, the server decides, which is rule 2.

Path per outcome: reverse numbering (A), keep the record list write and drop Sort
for good (B sticks), rebuild the face by removing and re-adding its rows in
reverse so the server's own rule produces the plan order (B does not stick). The
rebuild is last because it changes rows and needs explicit approval.

## Open risks

1. Stored order unproven. The record list write has not been shown to change
   what Magento stores. Until experiment A or B runs, the lane can report
   success while the record comes back unchanged.
2. Reads are not always proof. A read taken from the same unsaved helper tab
   reflects that tab, not the server. Only a read after a fresh form load, or the
   save read-back, counts.
3. The empty `name` field. On one live row, Tampografia had `[N][name]` empty
   while its `name_option` was `1` and Laser had both set. That is unexplained
   and is the next suspect if the record list write proves ineffective.
4. The order verdict compares only rows the plan can identify. An unplanned row
   sitting between two planned rows is not reported, which is deliberate.
5. The save lane caps a request at 25 planned rows; larger plans are refused.
6. No unit test covers the background wiring of the order mode end to end. The
   record list write, the router pass-through, the read-back merge and the
   instant order update are covered at their own level.
7. The add lane still moves a freshly added record through the same list writer
   and, if that fails, falls back to a visible move that will not be stored. Its
   per-row reason names which happened.

## How to test

On `bestofgifts.pt`, with an admin session:

1. Reload **BOG Helper Experimental** in `chrome://extensions`.
2. Load the PP catalogue, tick PP 42, pair it with entity 42.
3. Preview. Expect 0 to add, 2 already present, and a line saying
   `1 row(s) not in Notion order` naming Laser Metal.
4. Press `Set the row order from Notion`, confirm. The browser stays on the
   dashboard. Read the verdict line: `record list found as elems` and
   `record list in plan order yes` means the write took.
5. Look at the helper tab. If Magento re-renders from its record list, the table
   should now show Tampografia above Laser Metal without the lane touching the
   nodes. If it still shows Laser first, do not save, and report it.
6. If the table does show the plan order, Save from PP Preview. Expect a stored
   order line and a fresh read.
7. For a removal, preview again, tick one row, confirm the removal, then save.
   Expect `N of M removed row(s) gone`.

## DevTools probes used

Read-only console snippets, run on the Magento tab with the Options Items table
open. Kept here because they produced the facts above and will be needed again if
the record write proves ineffective.

Round one, page shape:

```js
(() => {
  const rows = [...document.querySelectorAll('tr')]
    .filter(tr => tr.querySelector('[name*="sub_options_items"][name*="[parent]"]'));
  const table = rows[0] && rows[0].closest('table');
  console.log(JSON.stringify({
    url: location.href,
    forms: [...document.forms].map(f => ({ id: f.id, action: f.getAttribute('action'), method: f.method })),
    tableAttrs: table ? Object.fromEntries([...table.attributes].map(a => [a.name, a.value])) : null,
    rows: rows.map((tr, index) => ({
      index,
      attrs: Object.fromEntries([...tr.attributes].map(a => [a.name, a.value])),
      fields: [...tr.querySelectorAll('[name]')].map(el => [
        el.getAttribute('name'),
        el.tagName === 'SELECT' ? el.value + ' :: ' + (el.selectedOptions[0] || {}).text : el.value
      ])
    })),
    hidden: [...document.querySelectorAll('input[type="hidden"][name]')]
      .map(el => [el.name, el.value.length > 120 ? el.value.slice(0, 120) + '...' : el.value])
  }, null, 1));
})();
```

That probe showed `admin__dynamic-rows`, `data-role="grid"`,
`data-index="sub_options_items"`, rows with `data-repeat-index`, only
`form-search` as a form, and an empty `[N][name]` on the Tampografia row.

Round two, the model:

```js
require(['ko'], function (ko) {
  const rows = [...document.querySelectorAll('tr.data-row')];
  const describe = data => {
    if (!data) return null;
    const out = {};
    Object.keys(data).slice(0, 40).forEach(key => {
      try {
        const value = typeof data[key] === 'function' ? data[key]() : data[key];
        out[key] = typeof value === 'object' && value !== null
          ? (Array.isArray(value) ? 'array(' + value.length + ')' : '{' + Object.keys(value).slice(0, 8).join(',') + '}')
          : String(value).slice(0, 60);
      } catch (e) { out[key] = 'throws'; }
    });
    return out;
  };
  console.log(JSON.stringify(rows.map((tr, i) => {
    const chain = [];
    let ctx = ko.contextFor(tr);
    for (let depth = 0; ctx && depth < 8; depth += 1) {
      chain.push(describe(ctx.$data));
      ctx = ctx.$parent;
    }
    return { i, repeatIndex: tr.getAttribute('data-repeat-index'), data: describe(ko.dataFor(tr)), chain };
  }), null, 1));
});
```

That probe produced the component description, `_elems`, `recordData` and the
`dnd` module, and proved `ko.contextFor(row).$data` is the component rather than
the row record.

Save payload capture, still unused because no native submit exists. It may be
needed if the record write proves ineffective:

```js
(() => {
  const store = (how, url, body) => {
    try {
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      if (!text || text.indexOf('sub_options_items') === -1) return;
      localStorage.setItem('ppSave', JSON.stringify({ at: new Date().toISOString(), how, url, body: text.slice(0, 20000) }, null, 1));
      console.log('ppSave captured via ' + how + ', length ' + text.length);
    } catch (e) {}
  };
  const xsend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (body instanceof FormData) store('xhr-formdata', this.__u || '', JSON.stringify([...body]));
      else store('xhr', this.__u || '', body);
    } catch (e) {}
    return xsend.call(this, body);
  };
  const xopen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__u = String(url);
    return xopen.call(this, method, url, ...rest);
  };
  if (window.fetch) {
    const nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      try { store('fetch', typeof input === 'string' ? input : (input && input.url) || '', init && init.body); } catch (e) {}
      return nativeFetch.apply(this, arguments);
    };
  }
  console.log('capture on. Press Magento Save once, then run: copy(localStorage.ppSave || "none")');
})();
```

## Commands

All commands run in `tmp/pp-preview-readability-candidate`.

```bash
export PATH="$PWD/../../node_modules/.bin:$PATH"
node ../../node_modules/typescript/bin/tsc --noEmit
npm run test:pp-apply      # record list write, placement, removal presses
npm run test:pp-preview    # plan, order verdict, read-back merge, removals
npm run test:pp-save       # save lane helpers
npm run test:pp-scan       # scan model
npm run test:features
npm run build
```

Staging into the Experimental install, from the repository root:

```bash
node tmp/stage-experimental-pp-session.cjs
```

It copies the candidate build into `chrome-installs/experimental`, backs up the
previous install to `tmp/experimental-before-pp-remove-tab-<stamp>`, writes
provenance to `chrome-installs/experimental.provenance.json`, and forces the
manifest name to **BOG Helper Experimental**.

Current staged build:
`d24d4df0b49a16ae279bdf505fe64552365aead66a6b19eadbe270bd1410223a`,
backup `tmp/experimental-before-pp-remove-tab-20261118-143133-102`, version
0.2.1, name `BOG Helper Experimental`. The build id inside the payload is
`pp-order-4`, because the panel footer only carries the version.

Checks at that stage: typecheck 0, `test:pp-apply` 24, `test:pp-preview` 21,
`test:pp-save` 9, `test:pp-scan` 23, `test:features` 14, build 0. Three tests for
the removed levers were deleted and one was added: it drives a fake
`admin__dynamic-rows` component, asserts the record array is reordered, that the
count is read from the record list, and that the table nodes are left alone.

## File map

| File | Role |
|---|---|
| `src/page/features/pp-scan/apply.ts` | plan rows into the form, record list order, add lane |
| `src/page/features/pp-scan/remove.ts` | row removal through the native delete button |
| `src/page/features/pp-scan/save.ts` | native Save press, outcome read, item pairs |
| `src/page/features/pp-scan/index.ts` | injected read-only panels in the Magento page |
| `src/entrypoints/background/ppFreshForm.ts` | helper tab lifecycle, apply/read/save lanes, read-back |
| `src/entrypoints/background/routers/ui.ts` | message routing, including the apply mode |
| `src/dashboard/sections/ui/PpPreview.tsx` | the panel: preview, plan, removal, order, save |
| `src/dashboard/sections/ui/ppPreviewModel.ts` | plan, order check, save and removal verification |
| `src/core/messages/ui.ts` | apply request and response contracts |
| `tmp/pp-devtools-probes.md` | round one DevTools probes, page shape and save capture |
| `tmp/pp-devtools-probes-round2.md` | round two probes, Knockout model and AJAX save capture |

## Constraints held

- Magento native controls, handlers, tabs, menus and save behaviour preserved.
- No Notion writes, no commits, pushes, merges or releases.
- Every write lane is manual and confirmed; Save is never pressed implicitly.
- The actual `Default Category` root and existing guards were not touched.
