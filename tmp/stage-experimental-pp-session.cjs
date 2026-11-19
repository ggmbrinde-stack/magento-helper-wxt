const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'tmp', 'pp-preview-readability-candidate', '.output', 'chrome-mv3');
const destination = path.join(root, 'chrome-installs', 'experimental');
const provenancePath = path.join(root, 'chrome-installs', 'experimental.provenance.json');
const now = new Date();
const pad = (value, size) => String(value).padStart(size, '0');
const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}-` +
  `${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}${pad(now.getUTCSeconds(), 2)}-${pad(now.getUTCMilliseconds(), 3)}`;
const backup = path.join(root, 'tmp', `experimental-before-pp-remove-tab-${stamp}`);
const backupProvenance = `${backup}.provenance.json`;

const walk = (directory, prefix = '') => {
  const entries = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) entries.push(...walk(full, relative));
    else if (entry.isFile()) entries.push(relative);
  }
  return entries;
};

if (!fs.existsSync(source)) throw new Error(`Missing build output: ${source}`);
if (!fs.existsSync(destination)) throw new Error(`Missing install folder: ${destination}`);
if (!fs.existsSync(provenancePath)) throw new Error(`Missing provenance: ${provenancePath}`);

fs.cpSync(destination, backup, { recursive: true });
fs.copyFileSync(provenancePath, backupProvenance);

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(source, destination, { recursive: true });

const manifestPath = path.join(destination, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.name = 'BOG Helper Experimental';
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const background = fs.readFileSync(path.join(destination, 'background.js'), 'utf8');
for (const marker of ['ppFilledHelperTab', 'Row order set below its face', 'page-actions-buttons-save',
  'planned item row(s) are not in that helper form', 'No filled helper form is recorded',
  'Its list was reordered but the table did not show it', 'Row shown below its face',
  'Order checked:', 'are not at the end of their face', 'Removed from the form, not saved.']) {
  if (!background.includes(marker)) throw new Error(`Built background is missing: ${marker}`);
}

const files = walk(destination);
const hash = crypto.createHash('sha256');
let bytes = 0;
for (const relative of files) {
  hash.update(relative);
  hash.update(fs.readFileSync(path.join(destination, relative)));
  bytes += fs.statSync(path.join(destination, relative)).size;
}

const previous = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
const provenance = {
  channel: 'experimental',
  name: manifest.name,
  version: manifest.version,
  updatedAtUtc: now.toISOString(),
  destination,
  previousBuildBackup: backup,
  previousProvenance: backupProvenance,
  sourceCandidate: path.join(root, 'tmp', 'pp-preview-readability-candidate'),
  baseCommit: previous.baseCommit,
  fileCount: files.length,
  aggregateSha256: hash.digest('hex'),
  totalBytes: bytes,
  changeScope: 'Order lane readiness. The order attempt failed before touching anything because the lane looked for the Items table once, right after opening a freshly loaded tab; it now waits up to ten seconds for the rows to render before placing them. A successful order apply also reorders the panel immediately, so the visible order matches the helper form without another Magento read. Carries the read-back merge, the focus fix, the save-after-removal fix and the refresh control.',
  changedFiles: [
    'src/core/messages/ui.ts',
    'src/dashboard/sections/ui/PpPreview.tsx',
    'src/dashboard/sections/ui/ppPreviewModel.ts',
    'src/entrypoints/background/ppFreshForm.ts',
    'src/entrypoints/background/routers/ui.ts',
    'src/page/features/pp-scan/apply.ts',
    'src/page/features/pp-scan/page.ts',
    'src/page/features/pp-scan/remove.ts',
    'src/page/features/pp-scan/save.ts',
    'tests/ppApply.test.ts',
    'tests/ppSave.test.ts',
    'tests/ppScan.test.ts',
  ],
  checks: 'typecheck passed; build passed; apply suite 18 pass, save suite 9 pass, preview suite 17 pass, scan suite 23 pass, features suite 14 pass, 0 fail',
  applyEvidence: 'tests/ppApply.test.ts runs the record-list case under three property names and under a getter, counts the Options tab clicks, requires the form to be left on it, asserts that the posted indices are rewritten to the visible order, and asserts that a chosen row is removed through its own delete control while Delete all is never pressed and the remaining row is renumbered. tests/ppSave.test.ts reads the form rows back with the same key the save lane expects and asserts the stored order verdict.',
  nameDeviation: 'Only the manifest name field differs from the candidate build: BOG Helper -> BOG Helper Experimental.',
  approval: previous.approval,
  review: 'Independent review of the candidate is still pending. Experimental is the test channel, not an accepted release.',
  runtime: 'Not yet exercised live. The last order attempt reported that the table was not on the page, which is what the wait fixes.'
};
fs.writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

console.log(JSON.stringify({ files: files.length, aggregateSha256: provenance.aggregateSha256, backup,
  version: manifest.version, name: manifest.name }, null, 2));
