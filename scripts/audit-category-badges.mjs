// Category badge audit: run every index row through `categoryCode` in the
// spellings the live admin can plausibly show, and report how each one fares.
//
// The resolver's rule is "a wrong number is worse than no number", so the table
// below separates three outcomes for every variant:
//   ok      resolved to the row itself            (badge correct)
//   wrong   resolved to a DIFFERENT row           (badge lies — never acceptable)
//   blank   not resolved                          (no badge; only acceptable)
//
// Variants (all 618 rows are exercised for each):
//   sheet     the index's own spelling, with its own ancestors
//   upper     UPPERCASE, accents stripped (the admin's own casing/typing)
//   typoLeaf  one character removed from the leaf name, ancestors exact
//   typoTop   one character removed from the top group name, rest exact
//   noPath    leaf name only, no ancestors (a branch above it was unresolvable)
//
// `wrong` must stay at 0 for every variant. `sheet` and `upper` must be 100%.
//
// Usage: node scripts/audit-category-badges.mjs [--verbose]
import { mkdirSync, writeFileSync } from 'node:fs';
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
const verbose = process.argv.includes('--verbose');

const probe = `
import { categoryCode } from '${indexPath}';
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

const strip = (text) =>
  text.normalize('NFD').replace(/\\p{Diacritic}/gu, '').toUpperCase();

/** Drop the middle character: a realistic slip, not a random scramble. */
function dropOne(text) {
  if (text.length < 6) return text;
  const at = Math.floor(text.length / 2);
  return text.slice(0, at) + text.slice(at + 1);
}

const rows = nodes.map((node) => ({ node, ancestors: pathOf(node) }));

const variants = {
  sheet: (row) => [row.ancestors, row.node.name],
  upper: (row) => [row.ancestors.map(strip), strip(row.node.name)],
  typoLeaf: (row) => [row.ancestors, dropOne(row.node.name)],
  typoTop: (row) => [
    row.ancestors.map((name, i) => (i === 0 ? dropOne(name) : name)),
    row.node.name,
  ].flat(),
  withRoot: (row) => [['Default Category', ...row.ancestors], row.node.name],
};

/**
 * Resolve exactly the way the page does: each ancestor in turn, handing the
 * parent's own code down to the next level. Auditing with a bare name and a
 * name list is not the same question — the page always knows the parent code
 * when the branch above resolved, and that is what breaks name collisions.
 */
function resolveAsPage(parts) {
  let parentCode = null;
  for (let i = 0; i < parts.length - 1; i += 1) {
    parentCode = categoryCode(parts[i], parts.slice(0, i), parentCode);
    if (!parentCode) break;
  }
  const leaf = parts[parts.length - 1] ?? '';
  return categoryCode(leaf, parts.slice(0, -1), parentCode);
}

const results = {};
for (const [name, build] of Object.entries(variants)) {
  const misses = [];
  const wrong = [];
  for (const row of rows) {
    // Each builder returns [ancestors, leaf]; flat() above keeps typoTop honest
    // when a row's own ancestor list is what gets mutated.
    const built = build(row);
    const ancestors = built.slice(0, -1).flat();
    const leaf = built[built.length - 1];
    const code = resolveAsPage([...ancestors, leaf]);
    if (code === row.node.id) continue;
    if (code === null) misses.push({ row, ancestors, leaf });
    else wrong.push({ row, ancestors, leaf, got: code });
  }
  results[name] = { misses, wrong, total: rows.length };
}

globalThis.__audit = {
  total: rows.length,
  verbose: ${verbose ? 'true' : 'false'},
  results: Object.fromEntries(
    Object.entries(results).map(([name, r]) => [
      name,
      {
        ok: r.total - r.misses.length - r.wrong.length,
        blank: r.misses.length,
        wrong: r.wrong.length,
        detail: {
          misses: r.misses.slice(0, 40).map(({ row, ancestors, leaf }) =>
            [row.node.id, [...ancestors, leaf].join(' > ')]),
          wrong: r.wrong.slice(0, 40).map(({ row, ancestors, leaf, got }) =>
            [row.node.id, [...ancestors, leaf].join(' > '), '->', got]),
        },
      },
    ]),
  ),
};
`;

const entry = resolve(outDir, 'audit.ts');
writeFileSync(entry, probe, 'utf8');
const bundlePath = resolve(outDir, 'audit.mjs');
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

const audit = globalThis.__audit;
const pad = (text, width) => String(text).padEnd(width);
console.log(`index rows: ${audit.total}`);
console.log(`${pad('variant', 10)} ${pad('ok', 6)} ${pad('blank', 6)} wrong`);
for (const [name, r] of Object.entries(audit.results)) {
  console.log(`${pad(name, 10)} ${pad(r.ok, 6)} ${pad(r.blank, 6)} ${r.wrong}`);
}

const problems = Object.entries(audit.results).filter(([, r]) => r.wrong > 0);
if (problems.length > 0) {
  console.log('\nWRONG ANSWERS (a badge that lies):');
  for (const [name, r] of problems) {
    console.log(` ${name}:`);
    for (const line of r.detail.wrong) console.log('   ', line.join(' '));
  }
}

const gaps = ['sheet', 'upper'].filter((name) => audit.results[name].blank > 0);
if (gaps.length > 0) {
  console.log('\nEXACT-SPELLING GAPS (rows that cannot badge themselves):');
  for (const name of gaps) {
    console.log(` ${name}: ${audit.results[name].blank}`);
    for (const line of audit.results[name].detail.misses) console.log('   ', line.join(' | '));
  }
}

if (audit.verbose) {
  for (const name of ['typoLeaf', 'typoTop', 'noPath']) {
    const r = audit.results[name];
    console.log(`\n${name}: ${r.blank} blank of ${audit.total}`);
    for (const line of r.detail.misses) console.log('   ', line.join(' | '));
  }
}

const failed = problems.length > 0 || gaps.length > 0;
console.log(failed ? '\nFAIL' : '\nPASS');
process.exit(failed ? 1 : 0);
