# PP native API evidence design review

**Scope:** Design review of `coordination/PP-API-EVIDENCE-PROPOSAL.md` against the v3 preservation and execution contracts. This does not change v3's code-only GO. It does not approve a v4 implementation, regenerated plan, or live write.

## Decision

**Design GO with a required freshness correction before implementation.** A truthful, complete recursive Notion API block tree can provide page-bound structural preservation evidence for supported regions. The proposal correctly keeps API provenance distinct from browser evidence and limits eligibility to structures the existing renderer can represent losslessly. Notion documents block IDs, parent IDs, native type, child presence, edit timestamps, and rich-text annotations, and documents child retrieval as paginated and potentially recursive. This is enough data to validate supported hierarchy, ordering, content, and native identity, subject to the checks below. [Notion Block object](https://developers.notion.com/reference/block), [Retrieve block children](https://developers.notion.com/reference/get-block-children)

## Required freshness correction

The proposal records page state before and after recursive collection and compares it with the MCP capture. That detects observed disagreement during capture, but does not by itself prove that the native subtree remains current at the point of mutation. The existing `batch_apply.Session` fresh prewrite check and region-evidence comparison operate on the MCP representation and locally retained evidence. It does not re-read the native API tree.

Before implementation, specify that each native-evidence-backed operation performs a fresh read of the affected region immediately before issuing the write, or provide an equivalent API version guarantee that proves the stored subtree is still current. Compare page and affected descendant identities, parent edges, edit timestamps, full supported attributes, ordered structure, and region digest to the plan. If any differ or cannot be read, stop before mutation. Retain that response and its hash in the durable journal. Keep the existing MCP prewrite check too. A page timestamp match alone is insufficient unless the API contract explicitly guarantees it changes for every child-block mutation relevant to the region.

The other required implementation detail is to define canonicalization and the allowed native attributes for each supported block type. Preserve raw responses and compare all relevant fields. Unknown attributes or content that cannot round-trip through the MCP mutation representation must block that region. A declared child-complete flag or flattened text is not enough.

## Preservation and visual limits

For New/Old columns and tables, a complete recursive tree can prove column order, all descendants, row and cell order, IDs, rich-text content and annotations, parentage, and the selected supported layout attributes. The `column_list → column → children` chain and `table → table_row → cells` chain must be recursively retrieved and matched against the parser's exact region. Unsupported descendants, omitted pagination, duplicate IDs, parent mismatches, and lossy inline mappings must fail closed.

Native API evidence cannot prove rendered pixel geometry, responsive column widths in the current viewport, clipping, actual visual placement, or whether content appears visually obscured. Those requirements need browser observation. This review finds no requirement for such pixel-level proof in the existing v3 structural replacement contract. The API path must state that limitation and make no visual-verification claim. It also must not claim that native comments or discussions are empty or preserved. The existing explicit comments policy remains unchanged.

The callout and prefix behavior approved in v3 remains applicable. Existing human review callouts stay byte-for-byte outside replacement ranges, with all child order, checked state, reason, and identity retained. Native evidence must not be converted into synthetic browser child IDs. API IDs serve only as native evidence identifiers.

## Integrity, journal, and cross-PC handoff

The proposed raw-response hashes and separate native-evidence manifest are appropriate. Bind every file to the exact page and region IDs, parent edges, API version, request/cursor chain, collection timestamps, and candidate implementation hash. Verify all file hashes and the manifest before planning and again before a session consumes them. Do not put credentials, authorization headers, or tokens in the bundle or journal.

The existing implementation digest must include the new validator module if one is added. Candidate approval must bind to the v4 digest and plan digest. Existing durable intent-before-write, uncertain outcome reconciliation without blind retry, per-operation target checks, and saved-state readback must remain intact. After an API-backed write, read the native affected region back and compare it with the expected native structure as well as running existing MCP body/metadata readback. If API readback is unavailable or mismatched, leave the page unresolved and halt its continuation.

For the requested other-PC continuation prompt, include only operational prerequisites and hashes, never credentials. The receiving PC needs the immutable v2 archive and its verified SHA-256, the separate v4 candidate source and implementation digest, the exact sanitized API response bundle and hash manifest, the refreshed page captures and no-write plan, and the journal/session files if a session has started. State the tested Python runtime requirement. The current package handoff says Python 3.11 or newer is supported, so use the same bundled Python 3.12.14 runtime for reproducible focused tests. Credentials must be provisioned through that PC's secure secret store and verified locally. Since Setup currently reports OAuth page-read access but no native block-tree tool or local API secret, obtaining an authorized read-only recursive block-tree route and proving its persisted response format remains the concrete implementation dependency.

## Status boundaries

- **v3 code:** Its prior code-only GO and implementation hash `44ed0044f9ffd46048ee27d58e2abb26a4e9456bb5d8df547acad2666f4b5a75` stand.
- **v4 design:** GO once the immediate prewrite native-subtree freshness and postwrite native readback requirements above are explicit. The existing proposal already conditions implementation on Setup demonstrating authorized read access and a durable response format.
- **v4 implementation:** Not reviewed and not approved. No source, adapter, or implementation digest exists yet.
- **AVENTAIS plan and live writes:** NO-GO. Native page evidence is still partial, unresolved mapping/material decisions remain, and no refreshed plan has been independently reviewed or approved.

**Not checked:** No native API read, new tests, implementation, plan generation, or external write was performed for this design review.
