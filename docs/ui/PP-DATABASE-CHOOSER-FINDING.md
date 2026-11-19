# Notion database chooser (PP vs PP v2) — decision

**Decision: not built.** It stays a new product feature, and it is not needed for the bug work
that was approved on 2026-11-19.

## Why it is not a maintenance change

There is only one hardcoded `PP_CATALOG_DATABASE` (`src/shared/ppCatalog.ts:3`); "V2" appears
only as UI text (`src/dashboard/sections/ui/PpPreview.tsx`). A chooser would need:

1. a second database constant, or a setting;
2. a chooser control in `PpPreview.tsx`, and a persisted choice;
3. threading the selected database through `loadPpCatalogIndexPage` / `loadPpCatalog`
   (`src/audit/ppCatalog.ts`);
4. the audit router handlers, which currently take only a business code;
5. new message contract fields on the catalogue index and detail requests.

That is a new lane with new failure states (which database was this plan read from, what happens
when the two disagree, how a saved choice survives a reload). It is not a clarity fix inside the
existing flow.

## Why it is not needed now

The duplicate-technique work in `docs/ui/PP-PREVIEW-KNOWN-LIMITATIONS.md` reads whatever database
the extension already points at. Nothing in those fourteen fixes depends on a second database,
and the PP 963 case is read from the current one without a chooser.

## If it is wanted later

Ask for it as its own approved change, and settle three questions first: whether the choice is
per-tab or persisted, whether a record may exist in both databases, and what the dashboard shows
when the same business code resolves to different definitions in each.
