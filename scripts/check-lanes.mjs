#!/usr/bin/env node
/**
 * Lane boundaries.
 *
 * The extension is three products that share one build, and they must be able
 * to be worked on at the same time without touching each other's files:
 *
 *   ui          the Magento page features (src/page), the toolkit (src/ui),
 *               the dashboard + side panel (src/dashboard, src/entrypoints)
 *   audit       reads a product and writes a verdict (src/audit)
 *   automation  the moves: batch, mirror tidy, model bridge (src/automation)
 *   shared      the bottom layer every lane may read (src/shared)
 *   core        the message contracts (src/core)
 *
 * Rules:
 *   L1  a lane reaches another lane through its BARREL only
 *       (`../audit`), never a file inside it (`../audit/payload`).
 *       This is what lets a lane be re-cut internally without touching callers.
 *   L2  shared/ and core/ are the bottom: they never import a lane above them.
 *   L3  the background routers are one dispatch chain, not a graph: a router
 *       may not import a sibling router.
 *   L4  src/lib must not exist — the flat bag was the problem.
 *   L5  every module must be reachable from an entrypoint; an unreachable file
 *       is dead code, and this is where the three dead UI modules were found.
 *
 * Run with `npm run check:lanes` (no network, safe anywhere). It is wired into
 * pretypecheck/prebuild next to `sync-toolkit --check`.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, posix, relative, dirname } from 'node:path';

const root = process.cwd();

/** Lane reached by a project-relative posix path. */
function laneOf(p) {
  if (p.startsWith('src/audit/')) return 'audit';
  if (p.startsWith('src/automation/')) return 'automation';
  if (p.startsWith('src/shared/')) return 'shared';
  if (p.startsWith('src/core/')) return 'core';
  return 'ui'; // src/page, src/ui, src/dashboard, src/entrypoints
}

/** Lanes with a public barrel; everything else may be imported directly. */
const BARRELS = {
  audit: 'src/audit/index.ts',
  automation: 'src/automation/index.ts',
  core: 'src/core/messages/index.ts',
};

/** Reachability roots. A module nothing can reach is dead. */
const ENTRYPOINT_DIR = 'src/entrypoints/';

/**
 * Reached only from a manual fixture (`tsconfig.json` excludes it from the
 * build); it is a harness, not dead product code.
 */
const DEAD_ALLOW = new Set(['src/ui/smoke-test.ts', 'src/audit/__tests__/supplier.test.ts',
  'src/audit/__tests__/makitoImages.test.ts',
  'src/audit/__tests__/enableFlow.test.ts',
  'src/audit/__tests__/adminFacts.test.ts',]);

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

const walk = (dir, out = []) => {
  for (const name of readdirSync(join(root, dir))) {
    const p = posix.join(dir, name);
    if (statSync(join(root, p)).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
};

const SPECIFIER = /(?:from|import)\s*\(?\s*(['"])([^'"]+)\1/g;

/** Resolve a relative specifier to a project-relative FILE, or null. */
function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = posix.join(posix.dirname(fromFile), spec);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    const abs = join(root, candidate);
    // Must be a file: `src/core/messages` is also a directory, and treating it
    // as the target would make every path look like a deep import.
    if (existsSync(abs) && statSync(abs).isFile()) return candidate;
  }
  return null;
}

const files = walk('src');
const errors = [];

const edges = new Map();
const importers = new Map();

for (const file of files) {
  const source = readFileSync(join(root, file), 'utf8');
  const targets = [];
  let match;
  while ((match = SPECIFIER.exec(source))) {
    const target = resolveSpec(file, match[2]);
    if (!target) continue;
    targets.push({ spec: match[2], target });
    if (!importers.has(target)) importers.set(target, new Set());
    importers.get(target).add(file);
  }
  edges.set(file, targets);
}

const rel = (p) => relative(root, join(root, p)).split('\\').join('/');

// ---- L1 / L2: lane boundaries ---------------------------------------------
for (const [file, targets] of edges) {
  const fromLane = laneOf(file);
  for (const { spec, target } of targets) {
    const toLane = laneOf(target);

    if (BARRELS[toLane] && toLane !== fromLane && target !== BARRELS[toLane]) {
      errors.push(
        `L1 ${file}: imports "${spec}" — deep inside the ${toLane} lane; import "${barrelSpec(file, toLane)}" instead`,
      );
      continue;
    }

    // `shared` is the true bottom. `core` deliberately describes lane payloads
    // (an audit result, a batch job) as `import type`, so it may point at a
    // lane barrel — L1 still forbids reaching inside one.
    if (fromLane === 'shared' && toLane !== 'shared') {
      errors.push(
        `L2 ${file}: the shared lane may not import the ${toLane} lane ("${spec}")`,
      );
    }
  }
}

// ---- L3: routers are a dispatch chain ------------------------------------
const ROUTER_DIR = 'src/entrypoints/background/routers/';
for (const [file, targets] of edges) {
  if (!file.startsWith(ROUTER_DIR)) continue;
  for (const { target } of targets) {
    if (target.startsWith(ROUTER_DIR) && target !== file) {
      errors.push(
        `L3 ${file}: imports the sibling router ${posix.basename(target)} — routers must not import each other`,
      );
    }
  }
}

// ---- L4: the flat bag stays gone ----------------------------------------
if (existsSync(join(root, 'src/lib'))) {
  errors.push('L4 src/lib exists again — modules belong to a lane, not a bag');
}

// ---- L5: no unreachable module ------------------------------------------
const reachable = new Set();
const queue = files.filter((f) => f.startsWith(ENTRYPOINT_DIR));
for (const f of queue) reachable.add(f);
while (queue.length > 0) {
  const file = queue.pop();
  for (const { target } of edges.get(file) ?? []) {
    if (reachable.has(target)) continue;
    reachable.add(target);
    queue.push(target);
  }
}
for (const file of files) {
  if (reachable.has(file) || DEAD_ALLOW.has(file)) continue;
  errors.push(`L5 ${file}: unreachable from any entrypoint — dead module, delete it`);
}

/** The specifier a file should use to reach a lane's barrel. */
function barrelSpec(fromFile, lane) {
  let spec = relative(dirname(fromFile), BARRELS[lane]).split('\\').join('/');
  spec = spec.replace(/\.ts$/, '').replace(/\/index$/, '');
  return spec.startsWith('.') ? spec : `./${spec}`;
}

// ---- report --------------------------------------------------------------
const counts = { ui: 0, audit: 0, automation: 0, shared: 0, core: 0 };
for (const file of files) counts[laneOf(file)] += 1;

if (errors.length > 0) {
  console.error(`Lane check FAILED (${errors.length} problem(s)):\n`);
  for (const err of errors) console.error(`  ✗ ${err}`);
  console.error('\nsee scripts/check-lanes.mjs for the rules (L1-L5).');
  process.exit(1);
}

console.log(
  `Lane check passed (L1-L5): ${files.length} module(s) — ` +
    `ui ${counts.ui}, audit ${counts.audit}, automation ${counts.automation}, ` +
    `shared ${counts.shared}, core ${counts.core}; all reachable from an entrypoint.`,
);
