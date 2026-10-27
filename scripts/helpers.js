import { readFileSync } from 'node:fs';

const src = readFileSync(process.argv[2] || './src/lib/theme.ts', 'utf8');
const RE = /\/\/\s*Helper[:)]\s+([A-Za-z0-9_]+)\s+[:=]\s+([\s\S]*?)(?=\n\/\/\s*\S|\n\n|\n\/\/)/g;
const out = [];
let m;
while ((m = RE.exec(src))) {
  const name = m[1].trim();
  const body = m[2].trim();
  if (!name || !body) continue;
  out.push(`export function ${name}() { throw new Error('stub: ${name}'); }`);
}
process.stdout.write(out.join('\n') + '\n');
