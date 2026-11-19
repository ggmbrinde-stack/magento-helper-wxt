import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const tsPath = resolve(projectRoot, 'src/lib/categoryIndex.ts');
const jsonPath = resolve(projectRoot, 'src/lib/categorias-index.json');
const tmpDir = resolve(projectRoot, '.output', '_catverify');
mkdirSync(tmpDir, { recursive: true });
const tmpTs = resolve(tmpDir, 'categoryIndex.ts');
const tmpJson = resolve(tmpDir, 'rawindex.json');

const ts = readFileSync(tsPath, 'utf8');
const json = readFileSync(jsonPath, 'utf8');
writeFileSync(tmpJson, json, 'utf8');

const sanitized = `import rawIndex from './rawindex.json';
${ts.replace(/^import\s+rawIndex\s+from\s+['"][^'"]*['"]\s*;?\s*\n/gm, '')}
export { categoryCode, CATEGORY_INDEX_SIZE, stemForCategory } from './categoryIndex.js';

const print = (...xs) => console.log(...xs.map(String));

const lid = (name, ...anc) => categoryCode(name, anc);

print('index size', CATEGORY_INDEX_SIZE);
print('--- stem sanity ---');
print('stemForCategory("Casacos Leves")', JSON.stringify(stemForCategory('Casacos Leves')));
print('stemForCategory("Casacos Acolchoados")', JSON.stringify(stemForCategory('Casacos Acolchoados')));
print('stemForCategory("Casacos Softshell")', JSON.stringify(stemForCategory('Casacos Softshell')));
print('--- exact path still works ---');
print('SW1', lid('SWEATSHIRTS'));
print('1.3.4', lid('SWEATSHIRTS POLARES', ['TÊXTIL PROMOCIONAL']));
print('1.4.1', lid('CASACOS POLARES', ['TÊXTIL PROMOCIONAL']));
print('1.4.3', lid('PARKAS LEVES', ['TÊXTIL PROMOCIONAL','CASACOS']));
print('--- the bug: on live admin spellings (wrong nesting) ---');
print('Casacos Softshell (under Casacos Polares)', lid('Casacos Softshell', ['TÊXTIL PROMOCIONAL','CASACOS','CASACOS POLARES']));
print('Casacos Leves (under Casacos Polares)', lid('Casacos Leves', ['TÊXTIL PROMOCIONAL','CASACOS','CASACOS POLARES']));
print('Casacos Acolchoados (under Casacos Polares)', lid('Casacos Acolchoados', ['TÊXTIL PROMOCIONAL','CASACOS','CASACOS POLARES']));
print('Parkas Leves under Casacos Polares', lid('Parkas Leves', ['TÊXTIL PROMOCIONAL','CASACOS','CASACOS POLARES']));
print('--- also: bare name with stem when path fails ---');
print('Casacos Softshell (no good parent)', lid('Casacos Softshell', ['TÊXTIL PROMOCIONAL','CASACOS']));
print('Casacos Leves (no good parent)', lid('Casacos Leves', ['TÊXTIL PROMOCIONAL','CASACOS']));
print('Casacos Acolchoados (no good parent)', lid('Casacos Acolchoados', ['TÊXTIL PROMOCIONAL','CASACOS']));
`;

writeFileSync(tmpTs, sanitized, 'utf8');

await build({
  entryPoints: [tmpTs],
  outdir: tmpDir,
  platform: 'node',
  format: 'cjs',
  bundle: true,
  write: true,
  external: [],
  logLevel: 'silent',
});

import { existsSync } from 'node:fs';
const produced = resolve(tmpDir, 'categoryIndex.bundle.cjs');
if (!existsSync(produced)) {
  const list = (await import('node:fs/promises')).readdir(tmpDir, { withFileTypes: true }).map((d) => d.name);
  throw new Error('esbuild did not produce categoryIndex.bundle.cjs; tmpDir entries: ' + JSON.stringify(list));
}

