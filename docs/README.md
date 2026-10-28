# Docs — one folder per lane

The extension is three products in one build. A document lives in the folder of
the lane that owns the code it describes, so an agent working on the audit lane
never has to read a UI doc to find out what it may touch.

| Folder | Lane | Code it describes |
|---|---|---|
| [`ui/`](ui/) | Magento UI improvements | `src/page/**` (page features), `src/ui/**` (toolkit), `src/dashboard/**`, `src/entrypoints/**` |
| [`audit/`](audit/) | Audit | `src/audit/**` — resolver, image/text audits, Notion reads + the two writers |
| [`automation/`](automation/) | Automation | `src/automation/**` — batch pipeline, mirror tidy, model bridge |
| [`shared/`](shared/) | Cross-lane | `src/shared/**`, `src/core/messages/**`, plus analysis that spans all three |

## Index

**ui/**
- [UI-TOOLKIT.md](ui/UI-TOOLKIT.md) — the token contract, delivery and primitives. Read before styling anything.
- [UI-MIGRATION-REMAINING.md](ui/UI-MIGRATION-REMAINING.md) — what is still on the old styling.

**audit/**
- [AUDIT-FULL-RUN.md](audit/AUDIT-FULL-RUN.md) — running a full audit pass.
- [AUDIT-SUMMARY.md](audit/AUDIT-SUMMARY.md) — what an audit produces.
- [RUN-AUDIT-OPTIMIZATION-SINGLE-SKU.md](audit/RUN-AUDIT-OPTIMIZATION-SINGLE-SKU.md) — single-SKU run.

**automation/**
- [RUN-AUDIT-OPTIMIZATION-BATCH-AUTO.md](automation/RUN-AUDIT-OPTIMIZATION-BATCH-AUTO.md) — the batch/auto pipeline.
- [RUN-AUDIT-OPTIMIZATION-VISION.md](automation/RUN-AUDIT-OPTIMIZATION-VISION.md) — the vision (model) stage.

**shared/**
- [PROJECT-STATE-ANALYSIS-2026-10-27.md](shared/PROJECT-STATE-ANALYSIS-2026-10-27.md) — whole-project state.
- [PERFORMANCE-CODE-AUDIT.md](shared/PERFORMANCE-CODE-AUDIT.md) — cross-cutting performance review.
- [RUN-AUDIT-OPTIMIZATION-PLAN.md](shared/RUN-AUDIT-OPTIMIZATION-PLAN.md) — the plan spanning audit + automation.

## Rules

1. A doc that is only true for one lane does not belong in `shared/`.
2. `shared/` may describe all lanes; `ui/`, `audit/` and `automation/` may not
   describe each other's internals — link to the other lane's doc instead.
3. Code-level boundaries are enforced, not documented: `npm run check:lanes`
   (`scripts/check-lanes.mjs`). This folder follows the same split.
