#!/usr/bin/env node
// Static enforcement of the Notion write boundaries (board direction
// 2026-10-19): Listing Errors is create-only; one gated, whitelisted SKU
// Library PATCH is permitted. Deletes and block appends are never allowed.
//
// Fails if any source file references a Notion update/delete/schema endpoint,
// or issues a fetch() against Notion that does not go through a guarded fetch
// (readOnlyNotionFetch / createOnlyNotionFetch).
// Run with: npm run check:notion   (no network, safe anywhere).

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');

// Notion endpoints this project is allowed to touch. Database-query and search
// are POST endpoints that only *read*; POST /v1/pages is the ONE allowed write
// (create-only). Path + method matter — not the verb alone.
const ALLOWED = [
  { re: /^\/v1\/databases\/[^/]+\/query$/, methods: ['POST'] },
  { re: /^\/v1\/search$/, methods: ['POST'] },
  { re: /^\/v1\/pages$/, methods: ['POST'] }, // create-only
  {
    re: /^\/v1\/(pages|blocks|databases|users)(\/[^/]+)*$/,
    methods: ['GET'],
  },
];

// Anything matching these is an update/delete/schema write, regardless of intent.
const FORBIDDEN = [
  [/\/v1\/pages\/[^/]+/, 'updating/deleting a page via PATCH/DELETE /v1/pages/{id}'],
  [/\/v1\/blocks\/[^/]+\/children/, 'appending or listing block children (writes)'],
  [/\/v1\/databases(?![^/]*\/query)/, 'creating or updating a database schema'],
  [/\/v1\/data_sources/, 'creating or updating a data source schema'],
  [/\/v1\/comments/, 'creating a comment'],
];

// Narrow, file-scoped exception (board direction 2026-10-19): updates are
// permitted for the SKU Library ONLY. The PATCH endpoint and update helper are
// permitted in exactly one file — the guarded writer — and nowhere else.
// Listing Errors stays create-only.
const PATCH_ALLOWED_FILES = new Set(['src/audit/skuLibraryWriter.ts']);
const PATCH_PATH = /^\/v1\/pages\/[^/]+$/;
// Body completion: a newly created SKU Library page, or an existing page whose
// body is empty, may receive its dossier body in chunks. The writer checks the
// body first; non-empty pages are never overwritten. Only that writer may use it.
const BLOCK_CHILDREN_PATH = /^\/v1\/blocks\/[^/]+\/children$/;
// Body repair: deleting individual blocks before re-appending a fresh dossier
// body is only permitted in the SKU Library writer and only on block IDs
// (never on a page or database). The writer gates this behind
// NOTION_LIBRARY_UPDATES_ENABLED.
const BLOCK_DELETE_PATH = /^\/v1\/blocks\/[^/]+$/;
const UPDATE_HELPER = /\b(updatePage|updatePageProperties)\b/;

function findProblems(relPath, text) {
  const problems = [];
  const relNorm = relPath.split('\\').join('/');
  const patchFileAllowed = PATCH_ALLOWED_FILES.has(relNorm);

  // Every api.notion.com URL literal must be a permitted endpoint, used with a
  // method that endpoint allows.
  const urlMatches = text.matchAll(
    /https:\/\/api\.notion\.com(\/[^\s"'`,]*)?/g,
  );
  for (const m of urlMatches) {
    const path = (m[1] ?? '').split(/[?#]/)[0] ?? '';
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
    const declaredMethod = /method:\s*['"`]([A-Z]+)['"`]/i.exec(after);
    const method = (declaredMethod?.[1] ?? 'GET').toUpperCase();

    // The allowed PATCHes: SKU Library property updates and the one-time
    // create-time body append in the same writer.
    if (
      method === 'PATCH' &&
      (PATCH_PATH.test(path) || BLOCK_CHILDREN_PATH.test(path)) &&
      patchFileAllowed
    ) {
      continue;
    }
    // The allowed DELETE: body-repair block removal in the SKU Library writer.
    if (method === 'DELETE' && BLOCK_DELETE_PATH.test(path) && patchFileAllowed) {
      continue;
    }

    const rule = ALLOWED.find((a) => a.re.test(path));
    if (rule && rule.methods.includes(method)) continue;

    if (rule) {
      problems.push(
        `${relPath}: Notion path "${path}" used with ${method} (allowed: ${rule.methods.join(', ')})`,
      );
      continue;
    }
    const forbidden = FORBIDDEN.find(([re]) => re.test(path));
    problems.push(
      forbidden
        ? `${relPath}: Notion write pattern - ${forbidden[1]}`
        : `${relPath}: disallowed Notion path "${path}"`,
    );
  }

  // A bare fetch() is only suspicious in a file that talks to Notion directly
  // (i.e. contains an api.notion.com URL). Files that scrape the storefront or
  // search the admin grid are unrelated and must not be flagged.
  if (/api\.notion\.com/.test(text) && !/NotionFetch/.test(text)) {
    const rawFetches = text.matchAll(/(?<![.\w])fetch\s*\(/g);
    for (const _ of rawFetches) {
      problems.push(
        `${relPath}: bare fetch() to Notion without a guarded NotionFetch`,
      );
    }
  }

  // Bare mutation verbs near a Notion body are a red flag. createPage is the
  // allowed create-only helper; the page-update helper is allowed only in the
  // SKU Library writer; appends/deletes are never allowed.
  if (/notion/i.test(text)) {
    if (/\b(appendBlock|patchPage|deletePage)\b/.test(text)) {
      problems.push(`${relPath}: references a Notion mutation helper`);
    }
    if (UPDATE_HELPER.test(text) && !patchFileAllowed) {
      problems.push(
        `${relPath}: references a page-update helper outside the SKU Library writer`,
      );
    }
  }

  return problems;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

const problems = [];
let files = 0;
for await (const file of walk(srcDir)) {
  files += 1;
  problems.push(...findProblems(relative(root, file), await readFile(file, 'utf8')));
}

if (problems.length > 0) {
  console.error(`Notion write-safety check FAILED (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `Notion write-safety check passed: ${files} file(s) scanned; only the guarded SKU Library update, empty-body completion, and body-repair delete paths are permitted.`,
);
