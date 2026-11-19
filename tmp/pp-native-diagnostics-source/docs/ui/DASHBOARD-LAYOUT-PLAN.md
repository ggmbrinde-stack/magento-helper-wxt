# Dashboard layout — stage host plan

Status: **steps 1, 2 and 4 implemented** (2026-10-30); step 3 (Batch → stage
chain) is still open. Written after reading `src/dashboard/**` (5,000 lines
across 14 files).

## What landed

| Piece | File | Notes |
|---|---|---|
| Shared workspace | `shell/workspace.ts` | `{sku, url, langs, hashImages, background}` in `storage.session`; Resolver writes back the canonical SKU it proved, Image/Text/Push read it |
| Stage contract | `shell/stage.ts` | `Stage<O>` + statuses; `blocked`, `writes`, `errorOf` |
| Stage host | `shell/StageHost.tsx` | single stage = today's tab, `chain` = stepper + Run remaining + per-step retry |
| Image audit | `sections/audit/ImageAudit.tsx` | now `StageHost stages={[stage]}`, no local SKU state |
| Text audit | `sections/audit/TextAudit.tsx` | same, EN baseline enforced in the toggle |
| Push errors | `sections/audit/Push.tsx` | reads the workspace SKU |
| Nav + routes | `shell/Dashboard.tsx` | 4 groups, `#/<section>` hash routes, reload-safe |

Still open: **step 3**. `Batch.tsx` keeps its own orchestration until the
contract has run in production; nothing else duplicates a stage now.

## What existed before this change


```
Dashboard.tsx  (101 lines)
├─ aside.db-side
│   ├─ brand
│   ├─ nav — 10 flat items, no grouping
│   │    Overview · Run audit · Resolve SKU · Image audit · Text audit
│   │    Push errors · Notion health · Model bridge · Settings · Resolver Cache
│   └─ foot (version + write-mode banner)
└─ main.db-main
    ├─ header  <h1>{label}</h1> <p>{hint}</p>
    └─ body    exactly one component:
               {section === 'batch'    ? <Batch />     : null}
               {section === 'images'   ? <ImageAudit /> : null}
               {section === 'text'     ? <TextAudit />  : null}
               {section === 'push'     ? <Push />       : null}
               … resolver, notion health, bridge, settings, cache
```

Selection is one `useState<SectionId>`. Consequences:

- **No URL state.** No deep link, no reload persistence, no back button.
- **No shared state.** Switching tabs unmounts the section, so the SKU you just
  resolved is gone when you open Image audit.
- **No steps outside Batch.** The pipeline only exists as a monolith.

## Where logic is duplicated

| Stage | Standalone tab | Inside `Batch.tsx` (1,837 lines) |
|---|---|---|
| Subject (SKU, url, langs) | own `useState` per tab | own `useState`, inlined |
| Resolve | `Resolver.tsx` (944) | own resolve call |
| Images | `ImageAudit.tsx` (255) | own run + progress |
| Text | `TextAudit.tsx` (285) | own run + progress |
| Errors → push | `Push.tsx` (250) | Review & push section |

Same message types (`AUDIT_IMAGES`, `AUDIT_TEXT`, `PUSH_LISTING_ERRORS`), same
result shapes, four renderings of each.

## Proposal: one stage contract, two hosts

A stage is defined once — logic plus one renderer — and knows nothing about
whether it runs alone or in a chain.

```ts
export type StageId = 'resolve' | 'images' | 'text' | 'errors' | 'push';

export interface StageResult<O> {
  ok: boolean;
  data?: O;
  error?: string;
  warnings: string[];
  ms: number;
}

export interface AuditStage<I, O> {
  id: StageId;
  title: string;
  /** Stages whose output this one consumes; drives skip / rerun. */
  needs?: StageId[];
  run(input: I, ctx: StageCtx): Promise<StageResult<O>>;
  Card(props: { result: StageResult<O> }): ComponentChildren;
}
```

`StageHost` renders any list of stages:

- `stages={['images']}` — what a tab is today: one card, no stepper chrome.
- `stages={['resolve','images','text','errors','push']}` — a stepper with
  per-step status (idle / running / done / failed / skipped), Run, Run
  remaining, Retry this step, and each stage's output passed to the next.

The tabs become thin wrappers; `Batch.tsx` becomes a stage list instead of
orchestration.

## Supporting pieces

**Workspace state, not per-tab state.** `useWorkspace()` holding
`{ sku, url, langs, results }`, persisted to `chrome.storage.session`. This
matters more than the stepper: it is what makes "resolve here, inspect there"
possible.

**Hash routes.** `#/run`, `#/audit/images`, `#/audit/text`, `#/audit/push`.
Cheap, makes a screen addressable and reload-safe.

**Grouped nav**, because ten flat items hide the pipeline:

```
WORKSPACE     Run audit · Resolve SKU
STAGES        Image audit · Text audit · Push errors
CATALOGUE     Notion health · Resolver cache
EXTENSION     Model bridge · Settings
```

## What is *not* a stage

`Batch.tsx` also owns evidence folders, tidy, dry-run and the gate lines. Those
are **workspace concerns of the batch host**, not pipeline stages. They belong
in host chrome (a "Workspace" panel beside the stepper). Modelling them as
stages would add a special case per item and the contract would rot.

## Migration order

1. ~~Extract `useWorkspace` + `StageHost`, convert **one** stage (Image audit) to
   prove the shape without touching Batch.~~ **done 2026-10-30**
2. ~~Convert Text and Push the same way. Batch keeps its own code meanwhile.~~
   **done 2026-10-30**
3. Rewrite `Batch` as `stages={[...]}` on the same host and delete the
   duplicated branches. **open**
4. ~~Regroup the nav and add hash routes.~~ **done 2026-10-30**

Step 3 is the risky one: it touches 1,837 lines at once. Do it only after two
stages have proven the contract in production.

## Open questions

- Does a stage own its inputs, or receive them from the workspace? Proposal:
  the workspace owns `sku`/`url`/`langs`; a stage declares what it needs.
- Should `push` be a stage or a deliberate action? It writes to Notion, so it
  is the one step that must never run unattended in a chain.
- Do standalone tabs keep a local SKU override, or is the workspace the only
  source? Proposal: workspace only, with the field rendered in both places.
