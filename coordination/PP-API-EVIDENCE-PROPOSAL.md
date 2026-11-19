# Proposed v4 native API evidence support

19 November 2026. Proposal only. V3 implementation `44ed0044f9ffd46048ee27d58e2abb26a4e9456bb5d8df547acad2666f4b5a75` remains stable and has code-only GO. Implementation is conditional on Setup demonstrating a real authorized native API read and its persistable response format. No v4 source, adapter or execution plan exists.

## Smallest change

Accept a second, explicit preservation evidence source, `NOTION_NATIVE_API`, alongside existing browser observations. Bind it to a complete retained native read bundle, validate it, and emit `EXACT_REVIEWED_NATIVE_API_REGION`. Do not label API evidence as browser or visual evidence. Retain the existing browser path and all content, page, approval, prewrite, journal and readback guards.

Limit this extension to native regions the existing renderer can model losslessly. API access does not expand the supported mutation types. V3's preserved human-review callout and prefix remain outside replacements; the source toggle remains untouched. Missing evidence continues to block conversion.

## Read bundle contract

Use the actual response format Setup can obtain. The minimum durable bundle must retain:

- Explicit API provenance, API version, capture times, requested page/block IDs and raw response-file hashes. No credentials or authorization headers.
- Page identity, parent collection and PP identity consistent with the existing MCP capture and inventory. Record page edit state before and after traversal and bind both to the MCP capture's current edit state.
- For every requested parent, all paginated child responses in request order, cursor sequence and terminal completion. Every returned child's native ID, parent relationship, type, last edit time and `has_children` flag remains inspectable.
- Recursively completed descendants for every region proposed for replacement. Preserve sibling order and exact child counts, including column-list → columns → all column children, table → all table rows → ordered rich-text cells, and toggle descendants. Retain rich-text annotations, links and supported block attributes, not merely flattened text.
- A manifest binding each region to its exact page/container IDs, ordered descendant IDs, raw files and hashes. A declared completeness Boolean alone is insufficient.

Reject failed reads, permission failures, missing pages/cursors/children, nonterminal pagination, duplicate or conflicting IDs, inconsistent parent edges, unsupported block types/attributes, or any unresolved `has_children` branch in the affected region. An incomplete affected subtree must never become an empty subtree.

Page edit times before/after collection must agree with the current MCP state. Reject observed changes in page or descendant versions. Because separate API calls do not supply a transactionally locked snapshot, retain the before/after read evidence and refuse inconsistent observations. Subsequent edits remain covered by the existing fresh prewrite state check; neither matching timestamps nor hashes claim an atomic snapshot.

## Exact proposed component changes

Paths below are relative to the eventual new candidate's `source/`, based on stable v3.

1. `full_conversion.py:384-422`: load a separate native-evidence manifest when explicitly supplied. Keep current browser input compatibility. Require one unambiguous evidence source for a given planned region. Validate the native bundle against the existing page ID/edit state and source-state hash before attaching bounded evidence. Bind the plan to the raw manifest hash and referenced response hashes. Do not merge conflicting browser/API observations.
2. `full_regions.py:10-16,34-65,68-109`: add the native-evidence validation branch. Verify native parentage, completed descendant coverage and exact supported structure before comparison with the current MCP-parsed region. Preserve the existing unique replacement, supported leaf/container and saved-content comparisons. Native comparisons must include every affected descendant's content and relevant supported attributes; the browser branch's normalized table/heading comparisons alone are insufficient. Emit a source-specific proof containing native region ID, manifest/response-tree digest, source-region digest and page-state digest. Unknown or unrepresentable fields block the affected region.
3. `batch_apply.py:55-65`: extend source verification to check the native manifest and response-file hashes referenced by the plan, just as workbook/index/inventory evidence is checked. Retain `batch_apply.py:200-232` fresh page/prewrite state checks and exact recomputed operation-evidence equality. The plan-local journal stores the resulting bound proof through the existing plan/state mechanism.
4. `batch_plan.py:305-308`: keep implementation digest coverage complete. Prefer implementing the small validation branch in the existing region module; if actual response handling warrants one dedicated module, include it in the implementation digest immediately. Avoid changing session dispatch/version semantics solely for candidate naming.

The exact CLI spelling and raw-file layout should be selected after Setup's successful response example. A new renderer, writer, API mutation client, generic export framework or replacement journal is outside this proposal.

## Mapping and preservation constraints

Public API `column_list` maps to parsed `columns`, heading variants to `heading`, and `bulleted_list_item` to the existing evidence type `bulleted_list`. Retain original native types alongside any normalized representation. Derive cell text from retained rich-text arrays in row/cell order, preserving supported formatting and links. Only grant eligibility where the native subtree and the MCP representation agree without dropping content or unsupported attributes.

Mixed/nested toggles stay blocked unless already represented and supported by the existing mutation guard. Native API callout fields must not be fabricated into browser child identities. Exact native IDs bind observed regions; text similarity does not establish identity or justify selecting the first matching container.

The native proof should address preservation of the affected structure. It must not set `EXPLICIT_COMPLETE_EXPORT` for the whole page, invent global absence of comments, or alter the existing explicit policy for native comments.

## What API evidence cannot establish

Native block data can establish supported content and hierarchy. It does not establish actual pixel rendering, responsive geometry, clipping, visual placement, or the absence of API-unsupported content. The current region comparator uses structure/content rather than measured browser geometry, so a truthful native path can cover that contract where representations agree.

The New/Old layout check still verifies the supported parsed layout. Any requirement for actual visual fidelity needs a separate browser observation. An API export alone cannot supply it, and v4 must not claim it.

## Focused acceptance checks

Use recorded, sanitized native fixtures from Setup's confirmed read route. Run only tests affected by this contract.

- Complete two-column subtree with multiple paginated tables produces native provenance and the exact expected region proof; no browser claim appears.
- Changed row/cell order, missing child, unresolved cursor, failed page, duplicate ID, wrong parent, wrong page/container ID, unsupported descendant/attribute or lossy rich-text mapping fails closed.
- Nested/mixed toggle outside current support remains blocked; a supported complete toggle passes.
- Changed capture manifest/raw response bytes fail source verification before any issued mutation.
- Page/edit-state mismatch between MCP and API, or a changed state during traversal/prewrite, is refused. Source-state hash and operation evidence remain exact.
- Existing browser evidence remains supported; ambiguous competing evidence is refused.
- Preserved five-child human-review callout remains outside mutation ranges. Concurrent review edits and unexpected saved-body changes still fail existing readback checks.
- Fake-connector journal test shows evidence persisted before issuing a write, uncertain outcomes never blindly replayed, and no success status after a failed preservation/readback check.

Independent Review should assess the final implementation digest and focused results before regenerating an AVENTAIS plan. Code approval does not authorize live application.

No source/candidate edits, tests, API writes or planning runs were performed for this proposal.
