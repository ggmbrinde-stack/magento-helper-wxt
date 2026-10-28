# Work plan: Options / attribute-set companion debugging

## Goal
Make a small companion UI layer appear on the admin page
`https://bestofgifts.pt/admin_L2pZx/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/958/key/d4f019d620f89dc58cbeec24a910a39ffcd99a848a725b4fe4ab12f2dd755f68/#`
and then improve the layout/readability of the existing option fields editor there.

## Current state
- The extension code for this feature is in `src/entrypoints/content.ts`.
- It has a page gate:
  - `isCustomOptionsPage()` returns true when `window.location.href` contains `toogas_attributesetcustomoptions`.
- It has a boot diagnostic:
  - `bootDiag()` logs `onPage`, `ready`, `foreachFieldsets`, `itemFields`, and the hash.
- It has a rewritten companion that no longer assumes `tr.data-row[data-repeat-index]`.
  - It now looks for the repeating editor as:
    - `fieldset.admin__fieldset[data-bind*="foreach"]`
  - and then treats each `div.admin__field[attr*="data-index"]` child as one field item.
- There is also a temporary visibility test block at the bottom:
  - If the code runs, it injects a red `MHX` badge into the top-right of the page.
  - It also logs `[mhx options] vis-test dot injected` plus DOM/host info.

## What the page actually looks like
From the in-page probes run so far:
- The URL matches the token.
- The DOM is `complete` when probed.
- There are 2 matching `fieldset.admin__fieldset[data-bind*="foreach"]`.
- The first one has `data-bind: foreach: {data: elems, as: 'element'}` and 13 child items.
- The child items are mostly `div.admin__field`.
- One child is the real input:
  - `input.admin__control-text`
  - `name="general[option_title]"`
  - value example: `PP_BLOCOS/AGENDAS Tecido - A5 (TS.2C+DTF-4F)`
- Probes also showed no `tr.data-row[data-repeat-index]` and no `options[...]` named inputs on this view.

So the old table-row model is wrong for this page. The companion has been rewritten to match the Knockout fieldset model instead.

## What still is not confirmed
- The code on disk is currently clean under:
  - `npx tsc --noEmit`
  - `scripts/check-ui.mjs` fails only on the temporary vis-test dot block because it hardcodes red/white.
- What is NOT confirmed:
  - whether the browser is actually running this version of the file on this host
  - whether the companion mounts
  - whether the labels read back correctly once mounted

## Immediate verification checklist
After rebuilding/reloading the extension, reload the admin page and check in the console:
1. `[mhx options] vis-test dot injected`
2. the red `MHX` badge in the top-right corner
3. `[mhx options] bootdiag onPage=true ...`
4. whether `document.getElementById('mhx-opt-companion')` becomes non-null
5. whether the companion rows show the expected field labels

If the vis-test dot does not appear, the issue is not the companion logic; it is that the running extension is not executing this content script on this host or is a stale build.

## Known blockers / cautions
- The vis-test dot is intentionally out of style for the UI guard because it is a smoke test.
- Before treating this as a finished feature, remove or rewrite that block through the toolkit and restore the guard checks to green.
- The companion should not be considered “done” until it is verified on the actual loaded page, not just until `tsc` is green.

## Next step
Rebuild/reload the extension, then paste back:
- the `[mhx options] vis-test dot injected` line if present
- whether the red badge appears
- the `[mhx options] bootdiag` line
- whether the companion shell appears and what labels it shows
