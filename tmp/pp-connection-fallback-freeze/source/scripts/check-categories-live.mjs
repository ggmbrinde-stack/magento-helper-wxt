// Compare the LIVE Magento category tree with the Notion sheet.
//
// Three sources, compared in one pass:
//   page    a snapshot of the admin tree (scripts/probe-cat-dump.js, pasted in
//           the DevTools Console on Sales → Update Attributes → Categories)
//   notion  scripts/categorias-source.md — the exported Notion page the index
//           is generated from (pass --notion <file> to use a fresher export)
//   index   src/page/features/category-tree/categorias-index.json, what the
//           extension actually numbers the tree with
//
// It answers the questions the tree cannot answer by looking at it:
//   - which categories on the page have NO code (the operator's "words without
//     codes"), with their full path, so the index can be extended;
//   - which codes DISAGREE with the Notion number for the same category
//     (a wrong badge — the one outcome the resolver must never produce);
//   - which categories are spelled differently on the page than in Notion but
//     were still numbered (typos worth fixing at the source);
//   - which Notion categories do not exist in the admin tree at all.
//
// Usage:
//   npm run cat:check                       (dump on the clipboard)
//   npm run cat:check -- path/to/dump.json  (dump from a file)
//   npm run cat:check -- --notion fresh.md  (fresher Notion export)
//   npm run cat:check -- --json             (machine-readable report)
//
// Exit 1 when a page category has no code, a code disagrees with Notion, the
// committed index is stale against the Notion sheet, or the page's own badges
// disagree with this resolver (a stale extension build).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flagValue = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : null;
};
const wantsJson = args.includes('--json');
const notionPath = resolve(
  root,
  flagValue('--notion') ?? 'scripts/categorias-source.md',
);
const dumpArg = args.find((a) => !a.startsWith('--') && a !== flagValue('--notion'));
const indexPath = resolve(root, 'src/page/features/category-tree/categorias-index.json');

/* --- resolver ------------------------------------------------------------- */

/**
 * The page's own resolver, bundled the same way the extension builds it, so
 * this check cannot drift from what the tree does.
 */
async function loadResolver() {
  const outDir = resolve(root, '.output', '_catdiag');
  mkdirSync(outDir, { recursive: true });
  const source = resolve(root, 'src/page/features/category-tree/categoryIndex.ts').replace(
    /\\/g,
    '/',
  );
  const entry = resolve(outDir, 'liveCheckEntry.ts');
  writeFileSync(
    entry,
    `export { categoryCode, normalizeCategoryText } from '${source}';\n`,
    'utf8',
  );
  const bundle = resolve(outDir, 'liveCheckResolver.mjs');
  await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundle,
    logLevel: 'silent',
    loader: { '.json': 'json' },
  });
  return import(pathToFileURL(bundle).href);
}

/* --- Notion sheet ---------------------------------------------------------- */

/**
 * Parse the exported Notion page exactly like `build-category-index.mjs` does
 * (## 1. / ### 1.1. / **1.1.1.**), so "the Notion number" here is the same
 * number the index was built from. Any drift between this parse and the
 * committed index is reported: that is a stale build, not a page problem.
 */
function parseNotion(text) {
  const cleanName = (raw) =>
    raw
      .replace(/\*\*/g, ' ')
      .replace(
        /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{2000}-\u{206F}]/gu,
        ' ',
      )
      .split('(')[0]
      .replace(/\s+/g, ' ')
      .replace(/[\s?:;!.,…'"”]+$/u, '')
      .trim()
      .toUpperCase();

  const nodes = [];
  let top = null;
  let second = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    let m = /^##\s+(\d{1,2})\.\s*(.+)$/.exec(line);
    if (m) {
      top = { id: m[1], name: cleanName(m[2]), parent: null };
      second = null;
      nodes.push(top);
      continue;
    }
    m = /^###\s+(\d{1,2}\.\d{1,2})\.\s*(.+)$/.exec(line);
    if (m && top) {
      second = { id: m[1], name: cleanName(m[2]), parent: top.id };
      nodes.push(second);
      continue;
    }
    m = /^\*{0,2}(\d{1,2}\.\d{1,2}\.\d{1,3})\.\*{0,2}\s*(.+)$/.exec(line);
    if (m && second) {
      const name = cleanName(m[2]);
      if (name === '') continue;
      nodes.push({ id: m[1], name, parent: second.id });
    }
  }
  return nodes;
}

function withPaths(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const path = [node.name];
    let parentId = node.parent;
    for (let hops = 0; parentId && hops < 10; hops += 1) {
      const parent = byId.get(parentId);
      if (!parent) break;
      path.unshift(parent.name);
      parentId = parent.parent;
    }
    return { ...node, path };
  });
}

/* --- live dump ------------------------------------------------------------- */

/** Clipboard is how the dump usually arrives on Windows; harmless elsewhere. */
function readClipboard() {
  if (process.platform !== 'win32') return null;
  try {
    return execFileSync(
      'powershell',
      ['-NoProfile', '-Command', 'Get-Clipboard', '-Raw'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
}

function readDump() {
  if (dumpArg) {
    if (!existsSync(dumpArg)) fail(`dump file not found: ${dumpArg}`);
    return readFileSync(dumpArg, 'utf8');
  }
  if (!process.stdin.isTTY) {
    try {
      const piped = readFileSync(0, 'utf8');
      if (piped.trim() !== '') return piped;
    } catch {
      // Fall through to the clipboard.
    }
  }
  const clipped = readClipboard();
  if (clipped && clipped.trim().startsWith('{')) return clipped;
  return null;
}

function fail(message) {
  console.error(`cat:check — ${message}`);
  process.exit(2);
}

/* --- compare --------------------------------------------------------------- */

const { categoryCode, normalizeCategoryText } = await loadResolver();

const dumpText = readDump();
if (!dumpText) {
  console.error(
    'cat:check — no live dump.\n' +
      '  1. Open Sales → Update Attributes → Categories (tree visible).\n' +
      '  2. Paste scripts/probe-cat-dump.js into the DevTools Console.\n' +
      '  3. Run npm run cat:check  (reads the clipboard), or save the JSON and\n' +
      '     run npm run cat:check -- path/to/dump.json',
  );
  process.exit(2);
}

let dump;
try {
  dump = JSON.parse(dumpText.replace(/^\uFEFF/, ''));
} catch (error) {
  fail(`the dump is not JSON (${error.message})`);
}
const liveRows = Array.isArray(dump?.rows) ? dump.rows : [];
if (liveRows.length === 0) fail('the dump has no rows — was the tree open?');

const notionNodes = withPaths(parseNotion(readFileSync(notionPath, 'utf8')));
if (notionNodes.length === 0) fail(`no categories parsed from ${notionPath}`);

const indexNodes = JSON.parse(readFileSync(indexPath, 'utf8')).nodes ?? [];

const keyOf = (path) => path.map((name) => normalizeCategoryText(name)).join(' > ');

const notionByPath = new Map(notionNodes.map((node) => [keyOf(node.path), node]));
const notionById = new Map(notionNodes.map((node) => [node.id, node]));
const indexById = new Map(indexNodes.map((node) => [node.id, node]));

/* index vs Notion: a stale index makes every other number suspect */
const indexDrift = [];
for (const node of notionNodes) {
  const built = indexById.get(node.id);
  if (!built) indexDrift.push(`${node.id} ${node.name} — missing from the index`);
  else if (built.name !== node.name) {
    indexDrift.push(`${node.id} index "${built.name}" vs Notion "${node.name}"`);
  }
}
for (const node of indexNodes) {
  if (!notionById.has(node.id)) indexDrift.push(`${node.id} ${node.name} — not in Notion`);
}

/* resolve the page exactly as the tree does: ancestor by ancestor */
const resolved = new Map();
function codeForPath(names) {
  const key = keyOf(names);
  if (resolved.has(key)) return resolved.get(key);
  const parents = names.slice(0, -1);
  const parentCode = parents.length > 0 ? codeForPath(parents) : null;
  const code = categoryCode(names[names.length - 1], parents, parentCode);
  resolved.set(key, code);
  return code;
}

const noCode = [];
const disagrees = [];
const spelling = [];
const badgeStale = [];
const liveKeys = new Set();

for (const row of liveRows) {
  const path = Array.isArray(row.path) ? row.path.filter(Boolean) : [];
  // "Default Category" is the store root: the page shows it, the sheet never
  // has it, and the resolver ignores it. Keeping it would make every top-level
  // row look misspelled.
  while (path.length > 0 && normalizeCategoryText(path[0]) === 'default category') {
    path.shift();
  }
  const name = String(row.name ?? '').trim();
  if (name === '') continue;
  const names = [...path, name];
  liveKeys.add(keyOf(names));

  const code = codeForPath(names);
  const expected = notionByPath.get(keyOf(names));

  if (!code) {
    noCode.push({ path: names.join(' > '), notion: expected?.id ?? null });
    continue;
  }
  if (expected && expected.id !== code) {
    disagrees.push({
      path: names.join(' > '),
      notion: expected.id,
      got: code,
      gotPath: notionById.get(code)?.path.join(' > ') ?? '',
    });
    continue;
  }
  if (!expected) {
    // Numbered, but the page's path is not a Notion path: either the name or an
    // ancestor is spelled differently. The number itself is what Notion gives
    // that row, so the fix belongs in the sheet (or in Magento's spelling).
    spelling.push({
      path: names.join(' > '),
      code,
      notionPath: notionById.get(code)?.path.join(' > ') ?? '(unknown row)',
    });
  }
  // A dump taken with the extension running carries its own badge: if it is
  // not what this resolver says, the loaded build is not this code.
  const badge = typeof row.badge === 'string' ? row.badge.trim() : '';
  if (badge !== '' && badge !== code) {
    badgeStale.push({ path: names.join(' > '), badge, expected: code });
  }
}

const notionOnly = notionNodes.filter((node) => !liveKeys.has(keyOf(node.path)));

/* --- report ---------------------------------------------------------------- */

const report = {
  page: {
    url: dump?.url ?? '(unknown)',
    capturedAt: dump?.capturedAt ?? '(unknown)',
    rows: liveRows.length,
  },
  notion: { source: notionPath, rows: notionNodes.length },
  index: { rows: indexNodes.length, inSync: indexDrift.length === 0 },
  counts: {
    numbered: liveRows.length - noCode.length,
    noCode: noCode.length,
    disagrees: disagrees.length,
    spelling: spelling.length,
    notionOnly: notionOnly.length,
    badgeStale: badgeStale.length,
  },
  noCode,
  disagrees,
  spelling,
  notionOnly: notionOnly.map((node) => `${node.id} ${node.path.join(' > ')}`),
  badgeStale,
  indexDrift,
};

const failed =
  noCode.length > 0 ||
  disagrees.length > 0 ||
  indexDrift.length > 0 ||
  badgeStale.length > 0;

if (wantsJson) {
  console.log(JSON.stringify({ ...report, failed }, null, 2));
  process.exit(failed ? 1 : 0);
}

const pad = (text, width) => String(text).padEnd(width);
const list = (title, rows, format) => {
  if (rows.length === 0) return;
  console.log(`\n${title} (${rows.length}):`);
  for (const row of rows.slice(0, 60)) console.log(`  ${format(row)}`);
  if (rows.length > 60) console.log(`  … ${rows.length - 60} more (use --json)`);
};

console.log(`page    ${report.page.url}`);
console.log(`        ${report.page.capturedAt} · ${report.page.rows} categories`);
console.log(`notion  ${report.notion.source} · ${report.notion.rows} categories`);
console.log(
  `index   ${report.index.rows} rows · ${report.index.inSync ? 'in sync with Notion' : 'OUT OF SYNC'}`,
);
console.log('');
console.log(`${pad('numbered', 12)}${report.counts.numbered}`);
console.log(`${pad('no code', 12)}${report.counts.noCode}   <- the tree shows these without a number`);
console.log(`${pad('disagrees', 12)}${report.counts.disagrees}   <- badge says something else than Notion`);
console.log(`${pad('spelling', 12)}${report.counts.spelling}   <- numbered, but the path is not Notion's`);
console.log(`${pad('notion only', 12)}${report.counts.notionOnly}   <- in the sheet, not in the admin tree`);

list('NO CODE ON THE PAGE', noCode, (row) =>
  row.notion ? `${row.path}  (Notion: ${row.notion})` : row.path,
);
list('CODE DISAGREES WITH NOTION', disagrees, (row) =>
  `${row.path}  page badge ${row.got} (${row.gotPath}) · Notion ${row.notion}`,
);
list('SPELLED DIFFERENTLY, STILL NUMBERED', spelling, (row) =>
  `${row.path}  -> ${row.code} (${row.notionPath})`,
);
list('IN NOTION, NOT IN THE ADMIN TREE', notionOnly, (row) => `${row.id} ${row.path.join(' > ')}`);
list('BADGE IS NOT THIS BUILD', badgeStale, (row) =>
  `${row.path}  page ${row.badge} · resolver ${row.expected}`,
);
list('INDEX OUT OF SYNC (run npm run index:build)', indexDrift, (row) => row);

console.log(failed ? '\nFAIL' : '\nPASS');
process.exit(failed ? 1 : 0);
