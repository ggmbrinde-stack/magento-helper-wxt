import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const INDEX = JSON.parse(readFileSync(join(__dirname, '../src/lib/categorias-index.json'), 'utf8'));

const mod = await import('../src/lib/categoryIndex.ts');
const { normalizeCategoryText, categoryCode } = mod;

const LIVE = [
  ['Viseiras', ['BONÉS E CHAPÉUS']],
  ['Polos', ['POLOS']],
  ['Sweatshirts', ['SWEATSHIRTS']],
  ['Calças e Calções', ['CALÇAS E CALÇÕES']],
  ['Fatos de Treino', ['FATOS DE TREINO']],
  ['Têxtil Criança 100% MADE4YOU', ['TÊXTIL CRIANÇA']],
  ['Conjuntos', ['CONJUNTOS']],
  ['Linha Natura', ['LINHA NATURA']],
  ['Equipamentos', ['EQUIPAMENTOS']],
  ['Fatos de Treino', ['FATOS DE TREINO']],
  ['T-shirts e Singletes', ['T-SHIRTS E SINGLETES']],
  ['Polos', ['POLOS']],
  ['Sweatshirts', ['SWEATSHIRTS']],
  ['Camisas', ['CAMISAS']],
  ['Calças e Calções', ['CALÇAS E CALÇÕES']],
  ['Cachecóis e Golas', ['CACHECÓIS E GOLAS']],
  ['Medalhas e Troféus', ['MEDALHAS E TROFÉUS']],
  ['Acessórios', ['ACESSÓRIOS']],
  ['Calendários e Plannings', ['CALENDÁRIOS E PLANNINGS']],
  ['Porta Notas e Post-its', ['PORTA NOTAS E POST-ITS']],
  ['Blocos', ['BLOCOS']],
  ['Tapetes de Rato', ['TAPETES DE RATO']],
];

const nodes = INDEX.nodes ?? [];
const byName = new Map();
for (const n of nodes) {
  const k = normalizeCategoryText(n.name);
  if (k === '') continue;
  const list = byName.get(k) ?? [];
  list.push(n.id);
  byName.set(k, list);
}

function fmt(id) {
  const n = nodes.find((z) => z.id === id);
  return n ? n.name : id;
}

for (const [item, path] of LIVE) {
  const k = normalizeCategoryText(item);
  const ids = byName.get(k) ?? [];
  const code = categoryCode(item, path);
  const status = ids.length === 1 ? 'RESOLVED' : ids.length === 0 ? 'NONE' : `AMBIGUOUS(${ids.length})`;
  console.log(`${status} ${item} ${path.join(' > ')} -> ${code ?? 'NULL'} (${fmt(ids[0] ?? '')})`);
  if (ids.length > 1 && ids.length <= 4) {
    console.log('   candidates:', ids.map(fmt).join(' | '));
  }
}
