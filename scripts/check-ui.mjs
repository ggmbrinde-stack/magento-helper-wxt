import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
};

const stripComments = (s) => {
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  return s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
};

const srcFiles = walk('src');
const errors = [];

const allowedColorOwners = new Set([
  'src/ui/tokens.ts',
  'src/ui/theme.ts',
  'src/page/theme/magentoTheme.ts',
  'src/ui/toolkit.css',
  'src/ui/toolkitCss.ts',
  'src/public/ui/toolkit.css',
  'src/entrypoints/sidepanel/panel.css',
  'src/dashboard/shell/dashboard.css',
  'src/ui/theme.css',
  'src/audit/imageAudit.ts',
]);
const colorDebtAllowlist = new Set([
]);

const colorLiteralRe = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\s*\([^)]*\)|hsla?\s*\([^)]*\)/g;
for (const file of srcFiles) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.includes('src/entrypoints/demo/')) continue;
  if (normalized.includes('src/public/ui/toolkit')) continue;
  if (normalized === 'src/ui/toolkit.css') continue;
  if (normalized.includes('src/ui/toolkitCss.ts')) continue;
  if (allowedColorOwners.has(normalized)) continue;
  if (colorDebtAllowlist.has(normalized)) continue;
  const src = stripComments(readFileSync(file, 'utf8'));
  const matches = src.match(colorLiteralRe);
  if (matches && matches.length > 0) {
    errors.push(`G1: ${file} has ${matches.length} colour literal(s) outside allowed owners`);
  }
}

const primitivePatterns = [
  'mhx-btn',
  'mhx-group',
  'mhx-seg',
  'mhx-chip',
  'mhx-chip-remove',
  'mhx-badge',
  'mhx-field',
  'mhx-field-label',
  'mhx-field-hint',
  'mhx-inline-field',
  'mhx-pop',
  'mhx-pop-item',
  'mhx-bar',
  'mhx-toggle',
  'mhx-toast',
  'mhx-error',
  'mhx-saved',
  'mhx-note',
  'mhx-empty',
  'mhx-icon',
];
const primitiveDefs = new Map();
const allowedPrimitiveFile = new Set([
  'src/ui/toolkit.css',
  'src/ui/toolkitCss.ts',
  'src/public/ui/toolkit.css',
]);
for (const file of srcFiles) {
  if (!/\.css$/.test(file) && !/\.tsx?$/.test(file)) continue;
  const normalized = file.replace(/\\/g, '/');
  if (normalized.includes('src/public/ui/toolkit')) continue;
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const prim of primitivePatterns) {
    const re = new RegExp('\\.' + prim.replace(/-/g, '\\-') + '(?![\\w-])[^\n{}]*\\{', 'g');
    if (re.test(src)) {
      if (!primitiveDefs.has(prim)) primitiveDefs.set(prim, new Set());
      primitiveDefs.get(prim).add(normalized);
    }
  }
}
for (const [prim, files] of primitiveDefs) {
  const nonAllowed = [...files].filter((f) => !allowedPrimitiveFile.has(f));
  if (nonAllowed.length > 0) {
    errors.push(`G2: primitive .${prim} defined outside toolkit in: ${nonAllowed.join(', ')}`);
  }
}

const magentoThemePath = 'src/lib/magentoTheme.ts';
const normalizedThemePath = magentoThemePath.replace(/\\/g, '/');
if (srcFiles.some((f) => f.replace(/\\/g, '/') === normalizedThemePath)) {
  const actualPath = srcFiles.find((f) => f.replace(/\\/g, '/') === normalizedThemePath) || magentoThemePath;
  const src = readFileSync(actualPath, 'utf8');
  const badRe = /mhx-(chip-edit|size-btn|size-bar|cat-toggle|cat-pill|cat-search|cat-no|cat-row|cat-mode|nh-trigger|nh-search|nh-pop|nh-label|nh-opt|nh-seg|nh-caret|nh-list|nh-native)/;
  if (badRe.test(src)) {
    errors.push(`G3: ${magentoThemePath} contains feature-specific class names that should not be styled by theme layer`);
  }
}

const importantBudget = 200;
const generatedToolkitCopies = new Set([
  'src/public/ui/toolkit.css',
  'src/ui/toolkitCss.ts',
]);
const importantCount = srcFiles.reduce((acc, f) => {
  const normalized = f.replace(/\\/g, '/');
  if (generatedToolkitCopies.has(normalized)) return acc;
  return acc + (readFileSync(f, 'utf8').match(/!important/g) ?? []).length;
}, 0);
if (importantCount > importantBudget) {
  errors.push(`G4: total !important in src is ${importantCount}, exceeds budget of ${importantBudget}`);
}

/*
 * G6 — page chrome may read layer 1 ONLY.
 *
 * The seam (toolkit.css header, docs/ui/UI-TOOLKIT.md §2): extension-owned surfaces
 * (side panel, dashboard, theme pickers, the admin theme sheet) read `--mhx-*`.
 * Everything injected onto the operator's Magento page reads `--mhx-pg-*`, because
 * `--mhx-*` is the LIGHT palette unless OUR dark admin is enabled, so on an admin
 * with its own dark theme `var(--mhx-surface)` is white. The single bridge from
 * layer 2 to layer 1 belongs to the toolkit itself —
 * `--mhx-pg-accent: var(--mhx-accent, …)` — so a feature never has to know that a
 * palette exists.
 *
 * The set is DERIVED, not listed. A four-file list is exactly how this guard
 * missed the other page-injected owners (adminNavToggle, messagesToggle,
 * pageActionsToggle, footerToggle, activeFilters, massactionButtons, rowActions,
 * pageHeader): any new feature file is covered the moment it lands, and only the
 * surfaces named below are out of scope.
 */
const extensionSurfaceDir =
  /^src\/(dashboard|entrypoints\/(sidepanel|dashboard|demo))\//;
const layerOwnerFiles = new Set([
  // The toolkit (the bridge lives here) and the palette layers themselves.
  'src/ui/toolkit.css',
  'src/ui/toolkitCss.ts',
  'src/public/ui/toolkit.css',
  // Writes the operator's live overrides: knows both layers by definition.
  'src/ui/tokens.ts',
  'src/ui/theme.ts',
  'src/ui/theme.css',
  'src/page/theme/magentoTheme.ts',
]);
/**
 * Extension surfaces, in three shapes:
 * - the panel/dashboard directories;
 * - their settings components, which live in `src/lib` (ToolkitColors,
 *   ThemePicker) but render only inside those screens;
 * - the layer owners above.
 *
 * `*.tsx` is the derived form of the second rule, and it holds by construction:
 * the content script injects plain DOM through the toolkit's factories, so a
 * Preact component can only ever be an extension surface (UI-TOOLKIT.md §2.3).
 */
const isExtensionSurface = (normalized) =>
  extensionSurfaceDir.test(normalized) ||
  normalized.endsWith('.tsx') ||
  layerOwnerFiles.has(normalized);

const pageTokenRe = /--mhx-(?!pg-)[\w-]+/g;
// Belt-and-braces for the classic mistake: "the page is white, so paint white".
// G1 already rejects every literal outside the allowed owners, so this only ever
// fires for a file that is BOTH page chrome and a colour owner — which the seam
// says cannot be. Caught in every spelling, not just the `white` keyword.
const hardcodedWhiteRe =
  /(?:background(?:-color)?|color|border(?:-color)?|fill|stroke)\s*:\s*(?:white\b|#fff\b|#ffffff\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,[^)]*\))/gi;

let pageChromeFiles = 0;
for (const file of srcFiles) {
  const normalized = file.replace(/\\/g, '/');
  if (isExtensionSurface(normalized)) continue;
  pageChromeFiles += 1;
  const src = stripComments(readFileSync(file, 'utf8'));
  const tokens = [...new Set(src.match(pageTokenRe) ?? [])];
  if (tokens.length > 0) {
    errors.push(
      `G6: page-injected chrome reads extension-surface token(s) in ${normalized}: ${tokens.join(', ')} (use --mhx-pg-*; the palette bridge belongs to toolkit.css)`,
    );
  }
  const whites = [...new Set(src.match(hardcodedWhiteRe) ?? [])];
  if (whites.length > 0) {
    errors.push(
      `G6: page-injected chrome hardcodes white in ${normalized}: ${whites.join(' | ')}`,
    );
  }
}

const ensureUiPath = 'src/ui/index.ts';
const normalizedEnsureUiPath = ensureUiPath.replace(/\\/g, '/');
if (srcFiles.some((f) => f.replace(/\\/g, '/') === normalizedEnsureUiPath)) {
  const actualPath = srcFiles.find((f) => f.replace(/\\/g, '/') === normalizedEnsureUiPath) || ensureUiPath;
  const src = readFileSync(actualPath, 'utf8');
  if (!src.includes('toolkit.css') && !src.includes('mhx-ui')) {
    errors.push(`G5: ${ensureUiPath} does not appear to reference toolkit.css or mhx-ui`);
  }
  if ((src.match(/document\.getElementById\(STYLE_ID\)/g) || []).length < 2) {
    errors.push(`G5: ${ensureUiPath} ensureUi() may not be idempotent (check getElementById(STYLE_ID) checks)`);
  }
}
try {
  execFileSync(process.execPath, ['scripts/sync-toolkit.mjs', '--check'], {
    cwd: root,
    stdio: 'pipe',
  });
} catch (err) {
  const output = err?.stdout?.toString() || err?.stderr?.toString() || '';
  errors.push(`G5: toolkit generated copies are out of sync${output ? `:\n${output.trim()}` : ''}`);
}

const exitCode = errors.length > 0 ? 1 : 0;
if (errors.length > 0) {
  console.error('UI guardrails failed:\n');
  for (const err of errors) {
    console.error(`  ✗ ${err}`);
  }
} else {
  console.log(
    `UI guardrails passed (G1-G6); G6 checked ${pageChromeFiles} page-chrome files`,
  );
}
process.exit(exitCode);
