# PP connection and explicit draft fallback: implementation handoff

Final review target: `manifest-v2.json`, `source/`, `incremental-v2.patch` and `chrome-mv3/` in this directory. Implementation only, independent review pending. No staging or authenticated browser testing performed. The earlier v1 freeze remains unchanged and is superseded.

## Behaviour

- Default source remains loaded Options Grid followed by an owned fresh helper. The connection check distinguishes absent source, different configured admin base, tab/provider loading, ambiguous sources, changed selections and unsupported/unavailable Grid results.
- Connection controls show sanitized tab numbers, approved hosts and source kind, with explicit choice when needed. No native URL, title, private admin base or session key crosses this connection contract.
- The new CURRENT DRAFT source requires explicit selection of an already-open exact-entity edit tab. It runs the existing scanner once against current provider state, including unsaved edits, without creating a helper or navigating, reloading or closing the user tab.
- Route, configured base, selected URL token, main frame and provider entity are checked. Navigation is rechecked after reading. Cancellation retains owner and single-reader guards; hanging extraction expires within 30 seconds. User tab IDs never enter helper ownership/cleanup.
- Draft heading, notices, details and comparison column distinguish unsaved state from fresh loads. No-read states say MAGENTO NOT READ. Source/entity/tab changes invalidate pairing and prior results. Exact business code, custom entity ID and Attribute Set identities remain separate; Notion pairing remains manual.
- Existing exact-record reference mode still copies only its native address into a fresh helper. An explicit selected reference now disambiguates multiple eligible tabs.

## Changed files against supplied Options Grid snapshot

- `src/core/messages/ui.ts`
- `src/dashboard/sections/ui/PpPreview.tsx`
- `src/entrypoints/background/ppFreshForm.ts`
- `src/entrypoints/background/ppPreview.ts`
- `src/entrypoints/background/routers/ui.ts`
- `tests/ppCatalogSelection.test.ts`
- `tests/ppConnection.test.ts`
- `tests/ppFreshForm.test.ts`

## Verification

184 targeted tests passed: selection/Grid/readiness/fresh-form 104, new connection/draft tests 15, retained preview 14, scanner 16, catalogue 35.

Existing commands: `npm run test:pp-selection`, `npm run test:pp-preview`, `npm run test:pp-scan`, `npm run test:pp-catalog`, `npm run typecheck`, `npm run build`, `npm run check:ui`, `npm run check:notion`. Toolkit, lane and feature checks pass through the pretypecheck/prebuild steps. The new test is intentionally run directly without expanding package.json ownership:

```
node ../../node_modules/esbuild/bin/esbuild tests/ppConnection.test.ts --bundle --platform=node --format=esm --external:node:test --external:jsdom --loader:.json=json --outfile=.output/pp-connection-test.mjs --log-level=warning
node --test .output/pp-connection-test.mjs
```

Run those commands from the candidate directory recorded in the manifest. Existing ancestor dependencies were reused without network installs. Logs are in `checks/`.

Both patches pass strict whitespace forward and reverse checks. Incremental patch applies to the supplied frozen source. Combined patch applies to clean cd3d2abbf4fbb5e4a9f8d5884cf05d753bd08071. Both reproduce every canonical LF source hash in the manifest. Both plain validation trees are retained here. Actual source bytes and canonical LF hashes are recorded separately. All original frozen source hashes still match. All installed Experimental files still match their supplied provenance; no installation files were written.

## Human checks after independent review and approved staging

1. With no eligible Grid open, check Magento connection. Expect clear no-source guidance and no preview/read start. With another admin base, expect base-mismatch guidance. With loading or multiple eligible tabs, expect waiting/explicit choice, never automatic source fallback.
2. Open a supported Options Grid and manually load the exact custom entity. Select it if needed, check connection, select the Notion record, enter the distinct actual Magento entity ID and manually confirm pairing. Preview should use an inactive owned helper, close that helper and retain fresh-load labels. Grid filters/paging must remain unchanged.
3. With an already-open exact PP edit tab containing an unsaved provider change, choose CURRENT DRAFT, check connection to detect it, explicitly choose that tab, check again and confirm the pairing. Preview should show the unsaved provider value and CURRENT OPEN-PAGE DRAFT labels throughout. It must not create a helper or navigate, reload, save or close the user tab. Do not save merely to verify this test.
4. Switch sources, entity or tab while a read is pending, or stop it. Old results must not render; a stopped draft read must leave the user tab open. A wrong provider entity must block comparison.

## Limits

- Independent review and human authenticated Magento test still required before staging.
- Grid uses loaded rows only; freshness and in-flight request state unverified.
- Draft uses existing scanner provider state, including unsaved edits; it does not flush a focused control or certify saved-server state.
- Before/after tab identity checks detect URL changes, not same-URL document continuity or service-worker restart recovery.
- No new labels, auto paging/mapping, Apply/Save, APIs, Notion writes, external messages, commits, merges or installation changes.
- Ancestor dependencies reused; no dependency installation. Unrelated full suite not run.

## Hashes

- Source aggregate (canonical LF): `8032da4e420568cd7c47df8ccc81a37243e3d64f62893295efd24382f9f9b63b`
- Build aggregate: `c6ea04b9178e1e34f156bd72d0f52fed82f97c2bdc02f095509ee2a48698ed0a`
- Manifest SHA256: `213a179d6d7580b84249d590a1f18d4e84fa9e592628e8124b4b2d1a32048526`

The manifest defines the aggregate algorithm and records individual source, build and patch hashes. No commits, integration, external messages, Notion writes, API work or installed-extension changes were performed.
