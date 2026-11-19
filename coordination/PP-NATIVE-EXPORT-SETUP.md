# PP native export setup — 19 November 2026

## Result

Read-only authenticated access is available through the existing Notion connector account **Brinde** in workspace **BOG Space** (`4abb6705-ae1f-81fe-a321-0003f14fa31f`). The exact working-copy page is `417b6705ae1f81aabd8bf1130a9b991c`; the shared master data source is `collection://431b6705-ae1f-83db-b71c-0739778f9e1a`.

The supported route exposed on this connection is `notion_fetch` for a page ID or data-source URL. It successfully read all 11 allowlisted pages: **428, 429, 430, 467, 558, 612, 633, 661, 662, 786, 840**. All responses were successful, carried the page ID/title and `page_last_edited_at`, and reported `verification.state: unverified`. No response reported truncation or unknown-block counts.

## Capability evidence

`notion_fetch` returns a connector response envelope with:

- the original response text and `structuredContent`;
- page properties, ancestor/data-source identity, Notion-flavored Markdown content, and `page_last_edited_at`;
- ordered Markdown representations for headings, columns, tables, toggles, callouts, todos and descendants.

The fetched Notion-flavored Markdown specification confirms that tables preserve row/cell order and that toggles, columns and callouts contain nested children. This is sufficient for a lossless **content-oriented** capture, provided the full connector envelope is retained.

It is not sufficient for the frozen PP runner's preservation guard. The connector response does **not** expose the native UUID for every block, child UUID/type, table-cell block identity, or a separately paginated block-children response. The exposed tool inventory contains no read-only `blocks.children`/recursive public-API operation. `query_data_sources` is available only with a plan limit and is not a block-tree export. Browser observations remain partial and must not be relabeled as complete `browser-regions.json`.

Therefore the exact conclusion is:

> Current secure native connector access is available for all 11 pages, but a complete native block-tree export route is not exposed on this connection. Do not claim that the current Markdown captures satisfy the runner's native-region preservation contract.

## Safe persistence route

For the connector route, persist one JSON file per selected entity using the existing bridge format:

```json
{
  "capture": {
    "source": "notion_fetch",
    "workspace_id": "4abb6705-ae1f-81fe-a321-0003f14fa31f",
    "page_id": "<exact page id>",
    "page_last_edited_at": "<connector value>",
    "captured_at": "<UTC time>",
    "scope": "PP allowlist only"
  },
  "response": {
    "content": "<original connector content blocks>",
    "structuredContent": "<original structured content>"
  }
}
```

Keep the original connector response and `structuredContent.text` unchanged inside the capture envelope. Preserve the page ID, data-source identity, response timestamp/edit timestamp, and any pagination metadata if a future connector adds it. Use the existing scrubber to remove expiring signed media URLs; retain stable `notion-file-block://` references. Never substitute browser observations for API metadata, and never infer native IDs from Markdown.

The existing local captures under `coordination/evidence/2026-11-19/current-v2/` already follow this direction for the home page, schema and 11 pages. They are valid connector-response evidence, not native-tree evidence. Keep outputs outside the frozen ZIP/package and do not write to Notion.

## Exact scope verified

| PP | Page ID | Last edited UTC |
| --- | --- | --- |
| 428 | `074b6705ae1f8257a53701d87a64eb32` | `2026-11-18T16:33:16.219Z` |
| 429 | `137b6705ae1f82048ef1810070095cf0` | `2026-11-18T16:33:17.739Z` |
| 430 | `3cab6705ae1f820dab27015d0d5e85ea` | `2026-11-18T21:31:30.258Z` |
| 467 | `f06b6705ae1f82ad871e01420cf67ecb` | `2026-11-18T16:34:35.807Z` |
| 558 | `1dcb6705ae1f83c6bfb181c13c9a7d19` | `2026-11-18T21:34:14.338Z` |
| 612 | `e48b6705ae1f83ddafb501a2ea781406` | `2026-11-18T16:39:50.618Z` |
| 633 | `f7bb6705ae1f826b848d819549bc3c03` | `2026-11-18T16:40:32.962Z` |
| 661 | `4e5b6705ae1f835ea3fc81290bfd0d16` | `2026-11-18T21:35:10.125Z` |
| 662 | `ddbb6705ae1f820cb837013a1864964a` | `2026-11-18T21:36:18.987Z` |
| 786 | `d00b6705ae1f835cb7440191c545e56b` | `2026-11-18T16:46:53.390Z` |
| 840 | `bacb6705ae1f8296839b01585f6e5e8e` | `2026-11-18T16:49:03.810Z` |

## Required next step

No credential setup is missing for the connector route. The only missing capability is a supported read-only native block-tree export that returns block IDs/types/children, table-cell identities and complete pagination. The exact setup request to the Notion/connector owner is:

> Enable or expose a read-only recursive block-children export for these 11 page IDs in the Brinde/BOG Space connection, retaining raw response envelopes, pagination cursors and page edit timestamps. Do not provide browser tokens or paste secrets.

Until that capability exists, the planner may use the current captures for source/property/content analysis, but it must keep the native-region preservation blocker and must not produce an apply-ready conversion plan.

## Safety boundary

No Notion writes, sharing changes, browser-token extraction, full-workspace search, frozen-package edits, or schema bypasses were performed. The only local change is this coordination report.

## Actionable unblock addendum

The blocker is **(c) plus missing local auth**: the connected Notion OAuth tools can read page Markdown, but their exposed read surface omits recursive block retrieval; this PC also exposes no `NOTION_*`, `NOTION_API_*`, or equivalent local credential environment variable. No public-API read was attempted because there is no secure local API credential to use.

The supported mechanism needed by the runner is Notion API `GET /v1/blocks/{block_id}/children`, paginated with `page_size`/`start_cursor` until `has_more` is false, recursively for child blocks. Pair it with `GET /v1/pages/{page_id}` to capture the page `last_edited_time` and identity before/after the tree read. The raw JSON envelopes should be saved outside the frozen package, preserving cursors, `has_more`, block IDs/types, child arrays and timestamps.

**One user setup action:** in the **Brinde / BOG Space** Notion workspace, create or select a read-only internal integration at `notion.so/my-integrations`, grant it read-content access to the working-copy parent (`417b6705ae1f81aabd8bf1130a9b991c`) and its master data source/pages, then place its API secret in this PC's secure environment/secret store for the runner (never paste it into chat). Connecting the Notion plugin alone does **not** provide local API authentication or expose `GET /v1/blocks/.../children`.

After that single setup action, the next run can perform one scoped recursive read of PP428 (`074b6705ae1f8257a53701d87a64eb32`) and verify whether the API returns the required ordered block types, child IDs, table cells, rich text and pagination before expanding to the other ten pages. No page writes or sharing changes should be performed by the runner.

### Local secret handoff prepared

The smallest local mechanism is ready in:

- `coordination/Set-NotionReadOnlySecret.ps1` — prompts locally with masked input and stores only a Windows-DPAPI user-bound value under `%LOCALAPPDATA%\BOG_Studio\notion-readonly-token.dpapi`.
- `coordination/Invoke-NotionReadOnly.ps1` — decrypts that value only for the child exporter process as `NOTION_TOKEN`, then removes the process variable.

The secret never goes into chat, repository files, command arguments, or logs. Run the first script in a private local PowerShell window after the integration has been created and shared by the user; the exporter can then be launched through the second script. This is persistent across later tool calls on this PC and does not rely on a temporary shell-only environment variable.

The helper scripts were syntax-checked and their DPAPI round-trip was self-tested entirely in memory using a non-secret probe value. No real credential was read or stored, and no Notion API request was made. The remaining blocker is user setup: create/select the read-only internal integration in **Brinde / BOG Space** at `https://www.notion.so/my-integrations`, scope it to the working-copy home `417b6705ae1f81aabd8bf1130a9b991c` plus the required master data source/rules/schema pages, then run `Set-NotionReadOnlySecret.ps1` privately on this PC. Do not paste the secret here. Stop until that private setup is complete; after it is complete, perform only the scoped PP428 page/timestamp and recursive children read before expanding scope.
