# Project handoff — 2026-11-05

## Repository

- GitHub: `ggmbrinde-stack/magento-helper-wxt`
- Active branch: `main`
- Stack: strict TypeScript, WXT, Chrome/Edge Manifest V3, Preact
- Main code lanes: Magento UI (`src/page/`, `src/ui/`, `src/dashboard/`), audit (`src/audit/`), automation (`src/automation/`), shared contracts (`src/shared/`, `src/core/`)
- Notion's `Extention` page is the project overview; the repository is the source of truth for implementation.

## Feature freeze

**No new product features or UI redesigns until the owner explicitly lifts this freeze.** Keep the extension in maintenance mode:

- Allowed: bug fixes, reliability/performance fixes, security fixes, dependency or build fixes, documentation, and release work needed to preserve existing behavior.
- Not allowed without approval: new user-facing capabilities, workflow changes, broad refactors, or expanding automation/write behavior.
- Preserve Magento's native forms, tabs, menus, and save behavior. Do not save or change Magento data during diagnostics.
- If a proposed fix changes user-visible behavior beyond restoring the intended behavior, ask before implementing it.

## Current handoff

- The recent uncommitted work was validated and is being published with this handoff. It includes the Magento facts read path and resolver fallback updates, category cross-rule/UI work, category-tree scanning/performance changes, and a DevTools diagnostic script.
- The category-tree diagnostic found that a broad checkbox selector could mistake Magento's `ul.tabs.admin__page-nav-items` for the category tree. Detection is now scoped to Magento's `#add-products-to-category-content` / `.store-tree` container. The category list is no longer reparented, and its extension controls follow the tree's visibility.
- The DevTools trace recorded two long main-thread tasks of about 5.0 s and 4.1 s, with 10 DOM mutation records in the observation window. That indicates significant main-thread work but does not identify which script caused it.
- **Live confirmation:** the project owner reloaded the extension and confirmed the category menus are displaying correctly. The assistant could not access the authenticated admin (401); this confirmation is from the owner's live check.
- A local `tmp/probe-attribute-set.js` scratch file was intentionally excluded from Git. Do not add temporary probes or credentials to the repository.

## Important existing behavior

- Resolver data comes from storefront evidence when available. Admin-only child labels are partial evidence, not proof of storefront availability.
- Magento facts are read-only and versioned; they include attribute set/PP, categories, tier prices, price/stock, visibility, status, websites, and weight. Reads may inspect an extension-owned background tab; never save the edit form.
- Category selection uses Magento's actual checkboxes. `Default Category` remains selected so Magento submits the required root category.
- Notion writes remain behind the existing explicit confirmation and writer guardrails. Do not widen these permissions as part of maintenance.

## Verification

Latest local validation for the handoff:

- `npm test` — 102 tests passed.
- `npm run typecheck` — passed; lane and feature checks passed.
- `npm run build` — passed.
- `npm run check:ui` — passed.
- `npm run check:notion` — passed.
- `git diff --check` — passed.

For the category-tree issue, prioritize a live-page check after extension reload. If it persists, use `scripts/devtools-page-performance.js` and keep the report read-only; it collects timing, mutation counts, and category-tree visibility/layout without reading form values.

## Starting prompt for the next AI

Continue the existing `magento-helper-wxt` repository from this handoff. The project is feature-frozen: do not add features, redesign UI, or broaden write behavior. First inspect `git status`, read this handoff and the relevant lane documentation, and verify the current `main` branch. Work only on approved maintenance fixes, preserve existing user changes, and run targeted tests plus typecheck/build/guards for the touched code. Do not claim Magento live behavior is verified unless tested in the authenticated admin.
