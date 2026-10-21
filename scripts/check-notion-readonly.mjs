#!/usr/bin/env node
// Static enforcement of the create-only rule (board direction 2026-10-19):
// "Notion is create-only: never update, delete, or append."
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

// Narrow, file-scoped exception (board direction 2026-10-19): create-only is
// lifted for the SKU Library ONLY. The single PATCH endpoint and the single
// update helper are permitted in exactly one file — the guarded writer — and
// nowhere else. Listing Errors stays create-only.
const PATCH_ALLOWED_FILES = new Set(['src/lib/skuLibraryWriter.ts']);
const PATCH_PATH = /^\/v1\/pages\/[^/]+$/;
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
    const path = m[1] ?? '';
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
    const declaredMethod = /method:\s*['"`]([A-Z]+)['"`]/i.exec(after);
    const method = (declaredMethod?.[1] ?? 'GET').toUpperCase();

    // The one allowed PATCH: SKU Library page-property updates.
    if (method === 'PATCH' && PATCH_PATH.test(path) && patchFileAllowed) continue;

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
  console.error(`Notion create-only check FAILED (${problems.length} problem(s)):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `Notion create-only check passed: ${files} file(s) scanned, no update/delete/append endpoints or unguarded fetches.`,
);
