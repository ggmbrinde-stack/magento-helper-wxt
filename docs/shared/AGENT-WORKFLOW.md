# Agent workflow

The persistent project chat IDs, recorded model settings, and dated assignment snapshot are in the [agent chat registry](AGENT-CHATS.md). The current business workflow mapping is in [FOUR-PILLAR-MAP.md](FOUR-PILLAR-MAP.md). Recorded settings are not a live inspection of current chat configuration.

The designated coordinator chat is not an additional spawned role. It defines tasks, assigns ownership, resolves dependencies, obtains independent review, and reports results. Specialist persistent chats and workers execute their assigned role, including implementation or investigation, and do not delegate recursively. A specialist's own main chat is not the coordinator. Use chat by default; never switch modes automatically.

The six persistent project chats are listed in the registry. They are user-owned chats, distinct from transient subagents and native role definitions, and share the local checkout. The current code audit is read-only; permit only one source-code writer at a time unless separate worktrees are explicitly established. Each specialist checks its task brief and reports relevant decisions or overlapping work to the coordinator. Automatic cross-chat replies require direct human authorization and inherited permission; a coordinator message alone does not authorize them. The registry is a snapshot, not a task lock or live activity monitor.

Source code is authoritative for implemented behavior. Documentation records intent and contracts; verify it against the current code when evidence conflicts.

## Shared working policy

- The coordinator states the task scope, allowed files, base commit, mode, and checks before dispatch. Ask the user before expanding scope. The already approved agent setup and four-pillar mapping do not need repeated confirmation; this is not blanket approval for product fixes.
- Apply Ponytail full to engineer changes. Keep the change minimal and check its callers and relevant tests. Reviewers use evidence-first, minimal-fix review and do not implement fixes. Release checkers run only assigned, relevant checks. Documentation changes stay small and reuse the existing structure.
- RTK 1.1.0 was repaired locally: the Scoop manifest/package hash matched, the shim is restored, `rtk --version`, `rtk git status --short`, and `rtk hook codex` checks succeeded. Automatic hook dispatch in this already-running Codex session remains unverified; do not claim token savings. If automatic integration is not observed, use supported RTK commands explicitly and do not double-wrap output. Follow `RTK.md`; preserve failure/truncation signals and use `rtk bypass <command>` only when output is unusable.
- Use REA on demand when runtime or shipped-artifact evidence is needed for UI, Audit, Automation, Reviewer, or a specific release investigation. Do not use REA for routine source-repository mapping. Docs work normally does not need REA. Do not add tools or automatic diagnostics for this purpose.

## Business pillars

Business pillars describe product workflows; they do not replace technical lane ownership or enforcement.

| Pillar | Existing owner and boundary |
|---|---|
| Magento UI | `ui_engineer` owns assigned presentation and interaction work. |
| Audit | `audit_engineer` owns assigned audit evidence and audit behavior. |
| Automation | `automation_engineer` owns sequencing in the automation lane where that behavior is implemented. |
| Disable -> Enable | Reuses existing `src/audit/enableFlow.ts`. `audit_engineer` owns business-readiness logic, `ui_engineer` owns presentation, and `automation_engineer` owns sequencing only where implemented. This mapping does not mean the whole workflow is automated. |

## Roles on demand

| Role | Scope | Default model / reasoning |
|---|---|---|
| `ui_engineer` | Magento UI, page features, toolkit, dashboard, entrypoints | `gpt-6.1-sol` / `medium` |
| `audit_engineer` | Resolver, audit evidence, image/text checks, audit-side reads and guarded writers | `gpt-6.1-sol` / `medium` |
| `automation_engineer` | Batch pipeline, mirror tidy, model bridge | `gpt-6.1-sol` / `medium` |
| `docs_notion` | Repository documentation and read-only Notion context | `gpt-6-luna` / `high` |
| `reviewer` | Independent review of changes or candidate findings | `gpt-6.1-sol` / `low` |
| `release_checker` | Acceptance checks, build/guard results, release readiness | `gpt-6-luna` / `high` |

Engineers may implement only within an explicitly assigned maintenance task. During an audit, all roles inspect and report without product fixes. `reviewer` and `release_checker` do not edit source. `docs_notion` writes only allowed repository documents; Notion writes require separate explicit authorization and existing confirmation guards.

The coordinator must not silently substitute models. Only an explicit user selection can change a persistent chat's model or reasoning setting. An unresolved review reports uncertainty rather than silently escalating to heavier reasoning. If stronger reasoning is needed, obtain explicit user selection before dispatching a separately configured role with the model and effort stated in its brief. If a requested model is unavailable, report it and agree a replacement first. These defaults do not change the parent chat model or guarantee cost savings.

## Dispatch and integration

1. Inspect branch, current commit, and dirty files. Read the handoff and lane index. Preserve scratch files and unrelated work.
2. Use a named role when the current runtime exposes it. If it does not, use an explicit scoped prompt as the fallback. Prefer one or two active workers; the project cap is three spawned workers, excluding the coordinator. Workers report back rather than spawning children. Reviewers count toward that cap.
3. Use `fork_turns = "none"` where supported. Supply the brief, relevant instruction paths, and narrow context, rather than copying the whole conversation. Ask for more context if evidence is insufficient.
4. Give simultaneous code writers separate worktrees and disjoint ownership. If worktree isolation is unavailable, use one writer at a time. Read-only reviewers can share the checkout; generated check outputs also need a single owner when checks could collide.
5. Name one owner for each shared contract in `src/shared/**` or `src/core/**`, including messages, exports, and fixtures. Dependent workers wait for the owner; integrate sequentially and rerun affected checks. Do not edit another worker's files or resolve conflicts by discarding user work.
6. Have a different worker review the final diff, or validate candidate audit findings against connected code. Record reproducible triggers, evidence, severity, and uncertainty. The coordinator reconciles disagreements; unverified suspicions stay separate from confirmed findings.
7. Assign acceptance checks once. For code maintenance, use targeted tests and relevant lane/feature/UI/Notion guards, typecheck, and build as appropriate. `package.json` lists current commands. Documentation/config-only setup needs link, diff, TOML, and configuration checks, not the extension test suite. No commits, pushes, releases, external writes, or live data changes are implied.

Messages should be compact: assignment accepted, a material blocker or changed assumption, and final evidence. Summarize findings, checks, and risks with file/line references and the smallest relevant error excerpt. Save evidence files only when they have durable value. Avoid full logs, repeated status polls, duplicated research, and extra workers for trivial steps. After one focused attempt at an unresolved failure, report missing input or request a stronger reasoning assignment rather than entering a retry loop.

## Portable task brief

```text
Task ID / role:
Goal and deliverable:
Base commit / branch / checkout or worktree:
Working changes to preserve:
Mode: audit-read-only | maintenance-implementation | docs-only | verification
Scope and relevant entry points / instruction paths:
Allowed files (empty for read-only; generated check outputs listed separately):
Forbidden actions: product changes during audits; Magento saves; unapproved Notion writes;
                   commits, pushes, merges, releases, external messages; recursive delegation
Notion scope: development documentation or operational database; exact target; reads/writes
              authorized by the user (default read-only; existing writer guards still apply)
Model / reasoning effort:
Acceptance checks and check owner:
Dependencies / shared-contract owner / integration order:
Independent reviewer and review target:
Return: findings or changed files, file/line evidence, checks, omissions, risks
```

Use the same brief for an external AI, with only necessary sanitized context and no secrets or customer data. Return its evidence to the coordinator for review. This document does not connect external services, route tools automatically, or authorize external writes.

## Native configuration and limits

Project configuration lives in `.codex/config.toml`; the six standalone definitions live in `.codex/agents/<role>.toml`. [Official OpenAI documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents) describes this format and inherited permissions. The project config sets only agent defaults and concurrency. It does not change global settings or the coordinator model.

Role instructions constrain the task by policy, not by technical isolation. Roles inherit parent permissions, provider, and connectors. A role file cannot impose a separate sandbox or approval policy. Use actual session permissions and isolated worktrees where needed.

The current runtime exposes the six named roles. Tool support can vary by session, so use a named role when available and an explicit scoped prompt otherwise. Native configuration or role discovery does not prove model behavior or live task execution. Record that distinction in validation results; do not start model work merely to test installation.
