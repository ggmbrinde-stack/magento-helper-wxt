#!/usr/bin/env node
// Generate the two delivery copies of the single toolkit stylesheet.
//
//   src/ui/toolkit.css  (the ONLY source — edit this)
//     -> public/ui/toolkit.css   served as a <link> via web_accessible_resources
//     -> src/ui/toolkitCss.ts    inline <style id="mhx-ui"> fallback string
//
// Usage:
//   node scripts/sync-toolkit.mjs          regenerate (idempotent)
//   node scripts/sync-toolkit.mjs --check  exit 1 if a copy is out of date
//
// Keeping both copies generated from one file is what makes "one sheet per
// page" enforceable: `npm run check:ui` fails on drift, so a hand edit to a
// generated copy cannot silently become the real stylesheet.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'ui', 'toolkit.css');
const PUBLIC = join(root, 'public', 'ui', 'toolkit.css');
const TS = join(root, 'src', 'ui', 'toolkitCss.ts');

const check = process.argv.includes('--check');

const css = readFileSync(SRC, 'utf8');

/** Escape a CSS body for a TypeScript template literal. */
const literal = css
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

const ts = `// GENERATED from src/ui/toolkit.css by scripts/sync-toolkit.mjs — do not edit.
// Inline fallback copy of the toolkit sheet (the <link> copy is
// public/ui/toolkit.css). Regenerate with \`npm run ui:sync\`.
export const TOOLKIT_CSS = \`${literal}\`;
`;

const targets = [
  [PUBLIC, css],
  [TS, ts],
];

let drift = false;
for (const [path, content] of targets) {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === content) continue;
  if (check) {
    drift = true;
    console.error(`out of date: ${path.slice(root.length + 1)}`);
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  console.log(`wrote ${path.slice(root.length + 1)} (${content.length} bytes)`);
}

if (drift) {
  console.error('\nrun `npm run ui:sync` and commit the generated copies.');
  process.exit(1);
}
if (!check && targets.every(([p]) => existsSync(p))) {
  console.log('toolkit copies in sync.');
}
