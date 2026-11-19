# Persistent agent chats

This registry records the project chats available for direct user assignments. It complements the [agent workflow](AGENT-WORKFLOW.md) and [project handoff](PROJECT-HANDOFF-2026-11-05.md).

## Coordinator

| Role | Chat ID | Host |
|---|---|---|
| Coordinator | `01a1b047-ae6e-7372-8182-6124e964e552` | `local` |

## Specialist chats

| Role | Chat title | Chat ID | Host | Model | Reasoning |
|---|---|---|---|---|---|
| `ui_engineer` | BOG Helper · UI | `01a1b055-6e77-7dd1-a03c-3c8bd9bc8ce1` | `local` | `gpt-6.1-sol` | medium |
| `audit_engineer` | BOG Helper · Audit | `01a1b055-817f-7900-aa02-a37c2931d026` | `local` | `gpt-6.1-sol` | medium |
| `automation_engineer` | BOG Helper · Automation | `01a1b055-899f-7ab0-8468-dec38393f3f9` | `local` | `gpt-6.1-sol` | medium |
| `docs_notion` | BOG Helper · Docs and Notion | `01a1b055-9205-7f22-9e69-6755bbdb3e81` | `local` | `gpt-6-luna` | high |
| `reviewer` | BOG Helper · Reviewer | `01a1b055-9b7c-7040-9381-abe87bb9b07c` | `local` | `gpt-6.1-sol` | low |
| `release_checker` | BOG Helper · Release Checks | `01a1b055-a4fb-74f2-9fc3-813093f7dc28` | `local` | `gpt-6-luna` | high |

The model and reasoning settings above are the values supplied when these chats were created. This registry does not claim live inspection of their current settings.

## Operating boundaries

- These persistent chats share the local checkout. The initial code audit is read-only. Allow only one source-code writer at a time unless separate worktrees are explicitly established.
- Record each direct user assignment's scope in its chat. The coordinator reads specialist summaries and reconciles the results.
- Do not assume a durable task lock, automatic cross-chat synchronization, or external AI integration. Automatic cross-chat messages require direct human authorization and inherited permission.

## Assignment snapshot, 2026-11-06

This is a point-in-time snapshot, not live status or a task lock. The four-pillar map, setup and independent source-map review are complete as of 2026-11-06. Review does not certify runtime behavior or tests. Approved model and reasoning settings are unchanged from the values recorded above.

| Chat role | Snapshot status |
|---|---|
| `ui_engineer` | Initial candidate findings handed off; pillar mapping complete |
| `audit_engineer` | Initial candidate findings handed off; pillar mapping complete |
| `automation_engineer` | Checking batch lifecycle; pillar mapping complete |
| `reviewer` | Independent source-map review complete, 2026-11-06; no runtime/test certification |
| `release_checker` | RTK 1.1.0 repaired; explicit commands and direct hook check passed; automatic dispatch in this running session unverified |
| `docs_notion` | Four-pillar map and setup complete |

RTK 1.1.0 was repaired locally with the Scoop manifest and cached package; hashes matched and the shim was restored. Explicit commands and direct hook check passed. Automatic dispatch in this running Codex session remains unverified; do not claim token savings.
