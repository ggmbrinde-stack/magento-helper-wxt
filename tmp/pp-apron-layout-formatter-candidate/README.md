# Offline PP body-layout formatter

Implementation candidate for independent review. This is a local proposal generator, with no writer, API, tokens, uploads or `--aplicar` mode. It does not change the importer or the extension.

## Current real-data blocker

The 20 `before/after` snapshots for the ten non-template apron codes contain rendered Notion text. They do not contain complete expanded native block trees or proof of child coverage. All 20 are therefore BLOCKED. Their page UUID/code pairs are checked from actual properties and page URLs, never file names.

The complete approved PP428 snapshot is also missing from `tmp/pp-apron-layout-template-input` at the time of this candidate. No old after-snapshot or synthetic template substitutes for it. A concrete proposal based on the real PP428 template has not been validated.

`reports/SUMMARY.md` and `reports/per-code-summary.json` disclose all eleven codes and the missing inputs. Synthetic examples are explicitly labelled and are not real-page proposals.

## Local commands

From a working copy of this candidate:

```powershell
python -B -m unittest discover -s tests -v
python -B tests/build_reports.py
python -B format_layout.py --input complete-target.json --template complete-PP428.json --output local-plan.json
```

The last command requires real complete inputs in the supported shape. It produces a BLOCKED report when completeness or identity cannot be established. Output cannot overwrite the input/template snapshot. Regenerate reports in a working copy, not the frozen review folder. No network or full-workbook extraction is needed.

## Supported complete export contract

A snapshot has `blocks`, `coverage` and page metadata. Metadata may be flat at the root or under `page`, without conflicting duplicate representations:

```json
{
  "code": "429",
  "page": {
    "id": "137b6705ae1f82048ef1810070095cf0",
    "properties": {"Código PP": "429", "Estado": "A rever"},
    "cover": null,
    "icon": null
  },
  "coverage": {
    "complete": true,
    "properties_complete": true,
    "truncated": false,
    "has_more": false,
    "omitted_children": [],
    "unsupported_blocks": []
  },
  "blocks": []
}
```

This illustrates the envelope only: an empty body is rejected. Every body block needs its actual UUID, native `type`, matching native payload and `has_children`. A parent must include all children under `block[block.type].children`, with `children_complete: true`. Every descendant is checked. Native table rows carry complete rich-text `cells`. `Código PP` may instead use its native rich-text property object. Page URL and title, if provided, must not contradict the actual identity.

Coverage declarations must come from a verified complete export, not be added to an old snapshot to bypass checks. Rendered `content` is not parsed into an assumed native tree. Mixed rendered/native body representations, missing children, pagination, unsupported blocks/rich-text items, duplicate identities, archived content and conflicting decisions are refused. Unsupported content is never silently discarded.

The approved template must be the exact PP428 page `074b6705ae1f8257a53701d87a64eb32`, with a native review callout, two equal native columns headed New/Old, technical notes and full source/history in the required order. It is used for layout structure only. Its choices, reasons, profile options and technical content are never copied to other PPs.

## Proposal behaviour and preservation

- Images and existing description/reference sections come first. Missing-image PP661 receives no invented image.
- Existing Yes/No choices and the editable `Se não, porquê?` area remain intact. Contradictory, duplicated or unsupported decision placement is blocked. Only a profile with no prior decision gets new unchecked choices.
- Native New (proposta) and Old (original) columns contain the profile's own tables. Two equal columns are intended; table widths around 80/350 are review intent only. No unsupported API/rendered-width guarantee is made.
- Third columns explicitly labelled Nota/Notas move into native technical-note toggles. Reports retain side, table UUID, row UUID, exact location and note rich text. Grouped locations and option text remain unchanged.
- Original headings and old callouts that leave the main layout are retained in collapsed presentation history. Full Excel source/history remains below the comparison. Every supported child and media reference is preserved.
- Properties, cover, icon and status are not proposed for updates. Their complete unchanged values/hash are included as preservation evidence.

Reports compare exact New/Old location/options mappings and retain original rich-text/media counts. Synthetic tests check PP633, grouped/mixed PP662, PP661 without images, existing Yes/No/reasons, deterministic output, semantic idempotence and stale-source refusal.

`verify_precondition(plan, current_snapshot)` checks the exact PP code/page pair and canonical full-snapshot SHA256. Any changed human reason, property, body or snapshot metadata fails the precondition. This strict guard can reject a new export whose metadata alone changed. It is not a server-side atomic write guard.

`proposed_body` is a review representation with existing identities and native objects. It is not an executable REST request or a bulk-write system. Any future application needs separately authorised fresh reads, a reviewed application method and the existing confirmations. This candidate makes no live Notion validation claim.

## Scope

Only codes 428, 429, 430, 467, 558, 612, 633, 661, 662, 786 and 840 are allowed, with the fixed page UUID pairs in the module. This changes layout only: no source repair, option mapping, approval change, schema/property sync, New/Old business transformation, price/PDF rules, DTF renaming or Magento work.
