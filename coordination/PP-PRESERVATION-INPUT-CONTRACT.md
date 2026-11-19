# V3 preservation input contract

19 November 2026. Read-only contract analysis for Setup, Notion and Review. Candidate v3 remains stable.

Source root is `C:/Users/gonca/Documents/ChatGPT/BOG_Studio/coordination/pp-candidate-preserve-review-v3-20261119-01/source`. Scope is PP428,429,430,467,558,612,633,661,662,786,840. PP601 is excluded.

## Required handoff

Keep the existing current MCP capture envelopes, home/schema, inventory bindings and manifest. Native evidence supplements these inputs; raw public API responses cannot replace the MCP response schema consumed by `batch_plan.page_state`.

For each page, supply the observed native subtree of every container that a proposed operation would replace, with ordered descendants, exact IDs, all table rows/cells and original rich-text data. Preserve retrieval provenance and raw responses separately. V3 leaves a recognized top-level review callout and its preceding content untouched, and excludes the source toggle from replacement. Those blocks do not require replacement eligibility evidence, although current full-page state checks still cover their observed content. New/Old columns and any other mutable container do require evidence.

The existing input filename is `<captures>/browser-regions.json`. Its consumed shape is:

```text
pages[PP_CODE]
  page_id             exact normalized page ID from the MCP capture
  source_edited_at     exact page_last_edited_at from that capture
  regions[]           observed containers described below
```

`full_conversion.py:384` loads the file if present; lines 418-422 compare page ID/edit time and attach the current page-state hash with `global_export_claimed: false`. Do not manually invent that hash or claim global export completeness. Missing evidence leaves unsupported edited containers blocked.

| Region | Fields checked by full_regions.py:34-65 |
| --- | --- |
| All | `kind`, valid native UUID `id`, ordered `children` UUIDs. Page binding and `global_export_claimed: false` must match. |
| `columns` | Exactly two column children. `tables` is the ordered list of table matrices, including header and every row/cell. `column_children` has two ordered lists whose entries contain `kind` and, for headings, `text`. Kinds must match every parsed direct child in order; heading text and all table cells must match. |
| `toggle` | `title`, ordered `paragraphs`, ordered child UUIDs and `child_types`. Current support requires every child type to be `bulleted_list`, with matching bullet text/count and no other parsed child structure. Nested or mixed toggles remain blocked. |
| `callout` being replaced | `text`, native ID and children. Current support accepts exactly one parsed paragraph with matching text. V3 does not use this replacement path for the preserved five-child human-review callout. |

Retain direct-child IDs and types even where the current comparator does not inspect them. The column comparator checks kind order and heading text, but does not compare every paragraph's text, image fields, nested subtree, or native table-row identity. UUID validation checks syntax, not an authenticated parent relationship. Consequently constructing the minimum JSON that passes these comparisons is insufficient evidence that an omitted nested block was preserved. The raw observed hierarchy must support the intended replacement, and unfamiliar/omitted data must remain a blocker.

For capture consistency, retain requested page/parent IDs, ordered paginated responses, pagination termination for every fetched parent, retrieval time and source/API version, and page edit state before/after retrieval. Match the current MCP page identity and edit state. A changed edit state or incomplete subtree invalidates that observation. These are collection acceptance requirements for truthful evidence; the existing runner does not itself verify a raw API crawl or its pagination.

## Can the public API supply the evidence?

Yes, it can supply native block IDs, parent/type information, ordered children, columns and table rows/cells through recursive paginated block reads. A single children response contains one level, so every relevant `has_children` node requires its own completed traversal. Unsupported block types and inaccessible/truncated branches must remain explicit failures. This can establish native structure, but does not prove visual rendering or API-unsupported content is absent. [Retrieve block children](https://developers.notion.com/reference/get-block-children), [Block object](https://developers.notion.com/reference/block).

However, v3 cannot truthfully label an API-only observation as its existing browser proof. Its policy says `PRESERVE_OR_EXACT_REVIEWED_UI_REGION` (`full_regions.py:11`), and an operation with bounded proof is emitted with basis `EXACT_REVIEWED_BROWSER_REGION` (line 94). Neither `verified_container` nor preparation validates an evidence provenance discriminator. A top-level `source` narrative is ignored. Therefore the code might mechanically accept API-derived JSON in this file, but doing so unchanged would mislabel its proof. Do not feed API-derived fields as browser observations or silently translate the schema while Review examines v3.

There is also a type-name mismatch to handle explicitly in any later reviewed translation: public API `column_list`, `heading_1/2/3` and `bulleted_list_item` correspond to the candidate's `columns`, `heading` and `bulleted_list` evidence labels. A public API callout's own rich text and descendants must not be fabricated into browser-style child identities.

## Minimum later change if API evidence is selected

In a separately versioned candidate after Review, add an explicit evidence source kind for browser versus native API, bind native evidence to the retained raw-response manifest and verified page/edit state, and emit a truthful source-specific operation basis. Keep the current exact scope, unique replacement, state-change and saved-content guards. Validate recursive completeness and unsupported descendants at that native-input boundary, including fields which the present normalized text comparator does not cover, before granting region eligibility. This is a small bounded contract extension, not permission to accept an arbitrary JSON tree with a completeness flag. Its precise implementation should follow the actual export Setup can produce.

No browser-only measurement is used in the existing comparator, so the technical obstacle is truthful provenance and validation of complete native input, rather than a requirement to operate the browser. Until that extension is reviewed, Setup can collect and persist raw native evidence now, but v3 should retain its browser-proof blocker for API-only evidence.

The existing checks that remain mandatory are `full_conversion.py:418-422` page/edit binding; `full_regions.py:68-97` unique exact replacement and supported nodes; `batch_apply.py:200-232` reviewed/prewrite state and evidence equality; and `full_regions.py:100-109` saved block/inline equality. None was changed.

No tests, candidate edits, adapter implementation or live writes were performed for this contract.
