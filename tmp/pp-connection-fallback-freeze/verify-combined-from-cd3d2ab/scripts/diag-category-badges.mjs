// Category badge coverage.
//
// 1. Self-check: every Notion index row is fed back through `categoryCode`
//    with the path the index itself records. A row that cannot find itself is
//    a row the live admin tree can never badge.
// 2. Live check: pass a file of category names as the admin shows them (one
//    per line, `Parent > Child > Leaf` or just `Name`) and each line is
//    resolved, with the closest index rows printed when it is not.
//
// Usage: node scripts/diag-category-badges.mjs [live-names.txt]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, '.output', '_catdiag');
mkdirSync(outDir, { recursive: true });

const indexPath = resolve(
  root,
  'src/page/features/category-tree/categoryIndex.ts',
).replace(/\\/g, '/');
const jsonPath = resolve(
  root,
  'src/page/features/category-tree/categorias-index.json',
).replace(/\\/g, '/');

const liveArg = process.argv[2];
const livePath = liveArg ? resolve(liveArg).replace(/\\/g, '/') : '';
const liveLiteral = livePath
  ? JSON.stringify(readFileSync(livePath, 'utf8'))
  : 'null';

const probe = `
import {
  categoryCode,
  normalizeCategoryText,
  stemCategoryText,
} from '${indexPath}';
import rawIndex from '${jsonPath}';

const nodes = rawIndex.nodes ?? [];
const byId = new Map(nodes.map((n) => [n.id, n]));

function pathOf(node) {
  const names = [];
  let parentId = node.parent;
  const seen = new Set();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parent;
  }
  return names;
}

/* --- 1. self-check ------------------------------------------------------- */
const missing = [];
const wrong = [];
for (const node of nodes) {
  const ancestors = pathOf(node);
  const code = categoryCode(node.name, ancestors);
  if (code === node.id) continue;
  if (code === null) missing.push({ ...node, ancestors });
  else wrong.push({ ...node, ancestors, got: code });
}

const fmt = (r) => [...r.ancestors, r.name].join(' > ');
console.log('index rows:', nodes.length);
console.log('resolve to null:', missing.length);
console.log('resolve to another row:', wrong.length);
for (const r of missing) console.log('  null  ', r.id, '|', fmt(r));
for (const r of wrong) console.log('  wrong ', r.id, '->', r.got, '|', fmt(r));

/* --- 2. live list -------------------------------------------------------- */
const liveText = ${liveLiteral};
if (liveText === null) process.exit(0);

const lines = liveText
  .split(/\\r?\\n/)
  .map((l) => l.trim())
  .filter((l) => l !== '');

let resolved = 0;
const unresolved = [];
for (const line of lines) {
  const parts = line.split('>').map((p) => p.trim()).filter(Boolean);
  const name = parts.pop() ?? '';
  // Resolve the way the page does: each ancestor in turn, handing the parent's
  // own code down so a differently spelled branch can still be tied by parent.
  let parentCode = null;
  for (let i = 0; i < parts.length; i += 1) {
    parentCode = categoryCode(parts[i], parts.slice(0, i), parentCode);
    if (!parentCode) break;
  }
  const code = categoryCode(name, parts, parentCode);
  if (code) {
    resolved += 1;
    const node = byId.get(code);
    const expected = node ? [...pathOf(node), node.name].join(' > ') : '?';
    if (normalizeCategoryText(node?.name ?? '') !== normalizeCategoryText(name)) {
      console.log('  path  ', line, '->', code, '(index row:', expected + ')');
    }
  } else {
    unresolved.push({ line, name, parts });
  }
}

console.log('live names:', lines.length, '| with a code:', resolved, '| without:', unresolved.length);
for (const { line, name, parts } of unresolved) {
  const key = normalizeCategoryText(name);
  const stem = stemCategoryText(name);
  const near = [];
  for (const node of nodes) {
    const nk = normalizeCategoryText(node.name);
    if (nk === key) near.push(node.id + ' (same name)');
    else if (stem && stemCategoryText(node.name) === stem) near.push(node.id + ' (same stem)');
    else if (nk.startsWith(key) || key.startsWith(nk)) near.push(node.id + ' (prefix)');
  }
  console.log('  MISS ', line);
  if (near.length) console.log('        candidates:', near.slice(0, 6).join(', '));
}
`;

const entry = resolve(outDir, 'probe.ts');
writeFileSync(entry, probe, 'utf8');
const bundlePath = resolve(outDir, 'probe.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
  logLevel: 'silent',
  loader: { '.json': 'json' },
});
await import(pathToFileURL(bundlePath).href);
