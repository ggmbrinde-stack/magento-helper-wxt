import rawIndex from '../src/lib/categorias-index.json' with { type: 'json' };
import { normalizeCategoryText, categoryCode } from '../src/lib/categoryIndex.ts' with { type: 'ts' };

const LIVE = [
  'Viseiras',
  'Polos',
  'Sweatshirts',
  'Calças e Calções',
  'Fatos de Treino',
  'Têxtil Criança 100% MADE4YOU',
  'Conjuntos',
  'Linha Natura',
  'Equipamentos',
  'Fatos de Treino',
  'T-shirts e Singletes',
  'Polos',
  'Sweatshirts',
  'Camisas',
  'Calças e Calções',
  'Cachecóis e Golas',
  'Medalhas e Troféus',
  'Acessórios',
  'Calendários e Plannings',
  'Porta Notas e Post-its',
  'Blocos',
  'Tapetes de Rato',
];

const nodes = rawIndex.nodes ?? [];
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

for (const item of LIVE) {
  const k = normalizeCategoryText(item);
  if (k === '') {
    console.log(`BLANK ${item}`);
    continue;
  }
  const ids = byName.get(k) ?? [];
  if (ids.length === 0) {
    console.log(`NONE ${item}`);
    continue;
  }
  const code = categoryCode(item);
  const resolved = ids.length === 1 ? 'RESOLVED' : `AMBIGUOUS(${ids.length})`;
  console.log(`${resolved} ${item} -> ${code ?? 'NULL'} (${fmt(ids[0])})`);
  if (ids.length === 1) continue;
  console.log('   candidates:', ids.slice(0, 4).map(fmt).join(' | '));
}
