#!/usr/bin/env node
/**
 * Feature parity.
 *
 * The enable/disable system used to be four lists that had to agree by hand:
 *
 *   defaults   Object.keys(FEATURE_DEFAULTS)        (what can be switched)
 *   mounts     the `if (f.x) safe(...)` chain       (what actually runs)
 *   detection  detectPageFeatures()                 (what the panel lists)
 *   folders    src/page/features/<name>/            (where the code lives)
 *
 * They matched 17/17 — by hand. A rename in any one of them produced a switch
 * that rendered, saved and did nothing, with no failing check. The catalog
 * (`src/shared/featureCatalog.ts`) + registry (`src/page/features/registry.ts`)
 * collapse the first three; this script keeps the fourth and catches the
 * regressions TypeScript cannot see.
 *
 * Rules:
 *   F1  catalog ids are unique, and every entry has label, description, group
 *       and detect.
 *   F2  the registry mounts exactly the catalog's keys minus `extensionEnabled`.
 *       (TypeScript also enforces this; this catches a key typed in the wrong
 *       object or dropped during a merge.)
 *   F3  defaults are derived from the catalog — no second literal list.
 *   F4  every folder in src/page/features is reachable from the registry,
 *       except the documented message-handler-only ones.
 *   F5  content.ts runs the catalog loop; no per-feature `if (f.x) safe()` chain
 *       has grown back.
 *
 * Run with `npm run check:features` (no network, no build).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const CATALOG = 'src/shared/featureCatalog.ts';
const REGISTRY = 'src/page/features/registry.ts';
const SETTINGS = 'src/shared/featureSettings.ts';
const CONTENT = 'src/entrypoints/content.ts';
const FEATURE_DIR = 'src/page/features';

/**
 * Folders that are features but are not mounts: their handlers answer a panel
 * message instead of decorating the page on scan. They have no toggle yet —
 * track them here (and in the pillar page) until they get one.
 */
const UNTETHERED = new Map([
  ['grid-search', 'SEARCH_MAGENTO handler — no toggle yet'],
  ['form-fill', 'APPLY_FIELD handler — gated by WRITES_ENABLED, no toggle yet'],
]);

const errors = [];
const notices = [];

// ---- F1: catalog shape ----------------------------------------------------
const catalog = read(CATALOG);
const ids = [...catalog.matchAll(/^\s{4}id: '([A-Za-z]+)',$/gm)].map((m) => m[1]);

if (ids.length === 0) errors.push('F1 no catalog entries found — did the array shape change?');

const seen = new Set();
for (const id of ids) {
  if (seen.has(id)) errors.push(`F1 duplicate catalog id "${id}"`);
  seen.add(id);
}

const fieldCounts = {
  label: [...catalog.matchAll(/^\s{4}label: /gm)].length,
  description: [...catalog.matchAll(/^\s{4}description:/gm)].length,
  group: [...catalog.matchAll(/^\s{4}group: '/gm)].length,
  detect: [...catalog.matchAll(/^\s{4}detect:/gm)].length,
};
for (const [field, count] of Object.entries(fieldCounts)) {
  if (count !== ids.length) {
    errors.push(`F1 ${count} "${field}" field(s) for ${ids.length} catalog entr(ies)`);
  }
}

const groupsDeclared = new Set(
  [...catalog.matchAll(/^\s{4}group: '([^']+)',$/gm)].map((m) => m[1]),
);
const groupsKnown = new Set(
  [...catalog.matchAll(/^\s{2}'([^']+)',$/gm)].map((m) => m[1]),
);
for (const group of groupsDeclared) {
  if (!groupsKnown.has(group)) {
    errors.push(`F1 group "${group}" is not in FEATURE_GROUPS`);
  }
}

// ---- F2: registry covers the catalog -------------------------------------
const registry = read(REGISTRY);
// Find the object by position rather than by regex: the declaration's type
// annotation contains `() => void`, so any pattern that walks to the first `=`
// stops inside the type.
const mountsStart = registry.indexOf('FEATURE_MOUNTS');
const openBrace = mountsStart === -1 ? -1 : registry.indexOf('{', mountsStart);
const closeBrace = openBrace === -1 ? -1 : registry.indexOf('\n};', openBrace);
const mountsBlock =
  mountsStart !== -1 && openBrace !== -1 && closeBrace !== -1
    ? registry.slice(openBrace + 1, closeBrace)
    : null;
if (mountsBlock === null) {
  errors.push('F2 FEATURE_MOUNTS object not found in the registry');
} else {
  const mountKeys = [...mountsBlock.matchAll(/^\s{2}([A-Za-z]+):/gm)].map((m) => m[1]);
  const expected = ids.filter((id) => id !== 'extensionEnabled');
  const missing = expected.filter((id) => !mountKeys.includes(id));
  const extra = mountKeys.filter((key) => !expected.includes(key));
  if (missing.length > 0) errors.push(`F2 catalog entries with no mount: ${missing.join(', ')}`);
  if (extra.length > 0) errors.push(`F2 mounts with no catalog entry: ${extra.join(', ')}`);
  if (mountKeys.length !== new Set(mountKeys).size) {
    errors.push('F2 duplicate key in FEATURE_MOUNTS');
  }
}

// ---- F3: defaults are derived, not duplicated ----------------------------
const settings = read(SETTINGS);
if (!/import \{ FEATURE_DEFAULTS \} from '\.\/featureCatalog';/.test(settings)) {
  errors.push('F3 featureSettings.ts no longer derives its defaults from the catalog');
}
if (/^\s{2}(selects|rowActions|optionsItems): *(true|false),$/m.test(settings)) {
  errors.push('F3 featureSettings.ts has a second hardcoded defaults list');
}

// ---- F4: every feature folder reaches the registry ----------------------
const folders = readdirSync(join(root, FEATURE_DIR)).filter((name) =>
  statSync(join(root, FEATURE_DIR, name)).isDirectory(),
);
for (const folder of folders) {
  const imported = new RegExp(`from '\\./${folder}(/|')`).test(registry);
  if (imported) continue;
  if (UNTETHERED.has(folder)) {
    notices.push(`${folder}: ${UNTETHERED.get(folder)}`);
    continue;
  }
  errors.push(
    `F4 ${FEATURE_DIR}/${folder} is not imported by the registry and is not in UNTETHERED`,
  );
}

// ---- F5: the scan chain stays a loop ------------------------------------
const content = read(CONTENT);
if (!/for \(const feature of FEATURE_CATALOG\)/.test(content)) {
  errors.push('F5 content.ts no longer loops over FEATURE_CATALOG');
}
const perFeature = [...content.matchAll(/if \(f\.[A-Za-z]+\) safe\(/g)];
if (perFeature.length > 0) {
  errors.push(
    `F5 content.ts has ${perFeature.length} hardcoded "if (f.x) safe(...)" line(s) again — ` +
      'add the feature to the catalog + registry instead',
  );
}
const duplicateMounts = [...content.matchAll(/safe\('([A-Za-z]+)'/g)];
if (duplicateMounts.length > 0) {
  errors.push('F5 content.ts calls safe() with a literal name — the loop supplies it now');
}

// ---- report -------------------------------------------------------------
if (notices.length > 0) {
  for (const notice of notices) console.log(`  · untethered: ${notice}`);
}

if (errors.length > 0) {
  console.error(`Feature check FAILED (${errors.length} problem(s)):\n`);
  for (const err of errors) console.error(`  ✗ ${err}`);
  console.error('\nsee scripts/check-features.mjs for the rules (F1-F5).');
  process.exit(1);
}

console.log(
  `Feature check passed (F1-F5): ${ids.length} catalog entr(ies), ` +
    `${folders.length} feature folder(s), ${notices.length} untethered.`,
);
