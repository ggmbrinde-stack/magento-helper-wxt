# PP layout formatter v2: actual Notion MCP rendered exports

This candidate adds a local adapter for the actual connector representation. The v1 freeze and importer are unchanged. No writer, API token workflow, uploads, properties/schema synchronisation, option transformations or `--aplicar` exist.

## Result and remaining external blocker

28 offline tests pass: 16 retained native-export checks and 12 actual-rendered-format checks. Two freshly fetched pages (PP428 and PP633) and all twenty historical before/after fixtures parse, format and pass visible-content preservation and idempotence checks.

PP428's actual approved structure is now captured, not invented. Its visible body is byte-identical on rerun, including the checked No and the reason `Falta transfer 1 C 126cm`. PP633 uses its own values, unchanged review callout, grouped Old rows, media and source/history. PP428's rejection, options and technical notes are never copied to another profile.

**Not ready for application.** The fetch tool documentation requires checking `truncated`, `unknown_block_count` and `unknown_block_ids`. Both complete received tool responses omit those fields. The adapter records UNKNOWN rather than assuming false/zero. Notion Maintenance independently confirmed it has no additional complete-export evidence or documented option that supplies them. See `captures/notion-maintenance-coverage-confirmation.json` and `reports/external-limit.json`.

All real previews remain BLOCKED and cannot pass application preconditions. They contain `quarantined_visible_content_preview`, never `proposed_content`. These are reviews of the exported visible content, not proof every server-side source block was exported. The smallest missing input is a trustworthy complete export with explicit no-truncation/no-unknown-subtree evidence, or a documented connector capability that supplies that evidence. Adding flags locally, fabricating native trees/UUIDs, or re-fetching all pages without solving this gap is not a fix.

## Local commands

Use a working copy, not the frozen review folder:

```powershell
python -B -m unittest discover -s tests -v
python -B tests/build_rendered_reports.py
python -B rendered_layout.py --input captures/pp428.json captures/pp633.json --template captures/pp428.json --output reports/fresh-two.json
```

These commands are offline. They cannot fetch or apply changes. The captured fetch tool schema and complete Markdown specification are in `captures/`. Current-page captures have actual receive/edit times and exact code/page/request identity checks. The nine other profiles were not re-fetched after the two-page completeness gate failed; their local fixtures are explicitly historical. `reports/real-coverage-table.json` lists all eleven allowed codes, fresh versus historical input counts and the exact gaps.

The old native-block module and its tests are retained unchanged. Its CLI remains separate. The new `rendered_layout.py` consumes actual fetch-result captures; it does not retrofit native IDs or child-coverage fields into rendered exports. Local source spans are character offsets, not Notion block identities.

## Supported rendered input

A capture contains `capture` provenance and the received `response` with matching `structuredContent` and JSON text views. The adapter verifies the actual PP code from the exported properties, exact allowlisted UUID, page-envelope URL, property URL, response/request identities, title, explicit cover/icon and time-zone-aware capture/edit timestamps. It preserves the complete received structure and inspects existing coverage fields; it does not add missing ones.

The saved captures remove signed HTTPS query credentials while retaining raw-response hashes and explicit redaction records. Stable body media references and actual body content were not changed. No credentials are included in the review artifacts. Properties/cover/icon are only fingerprinted as observed metadata; no metadata write payload is generated. Capture redaction is not a claim that the original full raw response can be reconstructed from the saved copy.

Supported visible body syntax includes native/XML-style tables, pipe tables with escaped pipes/backslashes, native callouts and todos, equal columns, nested source/history toggles, inline formatting, stable image references, grouped rows and profiles with no body image. Old uncolumned New/Old sections are parsed as local source spans. Unsupported tags/attributes, unclosed containers/fences, hidden comments, conflicting tables or reviews, unknown content, negative coverage evidence and omitted metadata are blocked rather than silently dropped. Styled third-note columns needing an unimplemented style rule are explicitly refused.

## Layout and preservation

- Images and own description/reference come first. No template image or missing-image placeholder is added.
- Existing review callouts, checked choices and reasons remain verbatim. New unchecked choices are only created when no current native review appears in the observed body; historical previews remain quarantined.
- New stays left and Old right in equal columns. Main tables normally use two columns. Existing two-column XML tables are retained; converted tables use the observed PP428 structure with 80/350 width attributes from the documented MCP format. Actual rendering/API application was not tested.
- Third-column note text moves into technical toggles with exact side, local source span, row index and original location/note values. Grouped locations are not split or remapped.
- Old presentation headings/callouts are preserved in collapsed scoped history. Source/history and all supported visible leaf content remain recoverable.
- Exact New/Old mapping equality, visible-content ledgers, unchanged review-callout hashes and repeat-format equality are checked before any preview is emitted.

The legacy fixture path is a separate adapter function. It never pretends an old file is a fresh fetch, and never attaches fabricated connector coverage. Fixture copies are matched to original hashes with unchanged bodies.

## Future preconditions and limits

`verify_precondition` always rejects real UNKNOWN-coverage results. A synthetic test exercises the explicit-complete branch without altering real captures. In that branch, preconditions bind exact target identity, visible body, observed metadata, edit time and coverage. Receive time and cover-file expiry alone do not invalidate unchanged state. Body/reason/property/identity changes do. This is a local read guard, not an atomic server-side write condition.

Any future application needs independently reviewed immutable artifacts, fresh trustworthy completeness evidence and separate human authorisation for the exact Notion MCP step. No operation here changes properties, cover, icon, approval status, option mappings, source business rules, the importer, Magento or the extension.
