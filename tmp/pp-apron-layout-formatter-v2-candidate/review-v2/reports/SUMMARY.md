# Rendered-export adapter v2

**NOT READY FOR APPLICATION. Independent review pending.**

The adapter works with the actual MCP Markdown representation. Fresh PP428 is byte-identical; fresh PP633 formats with exact visible mappings, review callout, stable media and source/history preserved. All twenty historical before/after exports also parse, format and pass visible-preservation/idempotence checks.

The fetch schema tells callers to check truncation and unknown-block metadata. Both full received responses omit all three fields. Notion Maintenance independently confirmed it has no extra complete-export evidence or documented option for them. Every real preview remains quarantined and fails application preconditions.

| PP | Fresh captures | Historical fixtures | Current content observed | Full-page coverage |
| --- | ---: | ---: | --- | --- |
| 428 | 1 | 0 | Yes | UNKNOWN |
| 429 | 0 | 2 | No | UNKNOWN |
| 430 | 0 | 2 | No | UNKNOWN |
| 467 | 0 | 2 | No | UNKNOWN |
| 558 | 0 | 2 | No | UNKNOWN |
| 612 | 0 | 2 | No | UNKNOWN |
| 633 | 1 | 2 | Yes | UNKNOWN |
| 661 | 0 | 2 | No | UNKNOWN |
| 662 | 0 | 2 | No | UNKNOWN |
| 786 | 0 | 2 | No | UNKNOWN |
| 840 | 0 | 2 | No | UNKNOWN |

No full native block tree or IDs were fabricated. Source spans in note associations are local character offsets, not Notion IDs. No properties, cover, icon, approval status, page or schema writes were proposed/executed.

Signed HTTPS query credentials were removed from saved tool captures; raw-response hashes and original structure are retained. Stable body media references and body content were not redacted. Historical input bodies remain identical to the original files. Captures are read-only evidence, not an operational import plan.
