// Category numbering from the Notion index ("📚 Categorias - Índice").
//
// The operator works with the numbers — 1, 1.1, 1.1.3 — so the Update
// Attributes category tree shows the same code next to each category. The data
// is a straight mirror of the consolidated Notion text (`categorias-index.json`,
// 618 nodes: 12 top-level, 77 sections, 529 leaves); rebuild it with
// `npm run index:build` (scripts/build-category-index.mjs parses
// scripts/categorias-source.md). Re-exporting it through one resolver keeps
// the page code free of matching rules.
//
// Matching is deliberately conservative:
// - Names are compared accent- and case-insensitively, with punctuation folded
//   away, because the admin spells them "TÊXTIL PROMOCIONAL" and the index may
//   not match byte for byte.
// - Portuguese administrative names are a moving target: the index spells a
//   group once ("CASACOS SOFTSHELL", "CASACOS LEVE", "CASACOS ACOLCHOADAS"),
//   the live admin spells them with plural/feminine/masculine endings in the
//   same group ("Casacos Softshell", "Casacos Leves", "Casacos Acolchoados"), and the
//   live tree sometimes nests a child under the wrong visible parent (e.g.
//   "Parkas Leves" listed directly under "Casacos Polares" even though the
//   index keeps it in the same CASACOS group as "Parkas Acolchoadas"). When a
//   name matches several index rows the ancestor path decides; when the live
//   parent is wrong the answer is still the row whose spelled parent is the
//   closest live ancestor the index already holds.
// - When a name matches several index rows and no ancestor path resolves it,
//   the parent's already-resolved code decides (same name under the same
//   parent is the same category), then a word-boundary prefix — the admin adds
//   qualifiers the sheet leaves out ("Têxtil Criança 100% MADE4YOU" for
//   "TÊXTIL CRIANÇA").
// - When none of that resolves a name, the answer is `null`: a wrong number is
//   worse than no number. The page logs the unresolved paths once per scan
//   (see `reportUnresolved` in ./index.ts) so a gap can be closed in the index
//   instead of guessed at.

import rawIndex from './categorias-index.json';

export interface CategoryIndexNode {
  id: string;
  name: string;
  parent: string | null;
}

const NODES: CategoryIndexNode[] = (rawIndex as { nodes: CategoryIndexNode[] })
  .nodes;

/**
 * English storefront category slugs and SKU Library English names mapped to
 * their Portuguese counterparts in the Notion "Categorias - Índice" tree.
 */
const EN_TO_PT_CATEGORY_MAP: Record<string, string> = {
  // Top-level categories (1..12)
  'promotional textile': 'textil promocional',
  'promotional textiles': 'textil promocional',
  'promotional-textile': 'textil promocional',
  'promotional-textiles': 'textil promocional',
  'sports textile': 'textil desporto',
  'sports textiles': 'textil desporto',
  'sports-textile': 'textil desporto',
  'sports-textiles': 'textil desporto',
  'workwear textile': 'textil trabalho',
  'workwear textiles': 'textil trabalho',
  'workwear-textile': 'textil trabalho',
  'workwear-textiles': 'textil trabalho',
  technology: 'tecnologia',
  'bags and backpacks': 'sacos e mochilas',
  'bags-and-backpacks': 'sacos e mochilas',
  'writing and office': 'escrita e escritorio',
  'writing-and-office': 'escrita e escritorio',
  'outdoors and events': 'outdoor e eventos',
  'outdoors-and-events': 'outdoor e eventos',
  'outdoor and events': 'outdoor e eventos',
  "children's and pets": 'crianca e animais',
  'childrens and pets': 'crianca e animais',
  'children-and-pets': 'crianca e animais',
  'house and wine': 'casa e bebidas',
  'house-and-wine': 'casa e bebidas',
  personal: 'cuidado pessoal',
  'diy and auto': 'bricolage e auto',
  'diy-and-auto': 'bricolage e auto',
  '100% made4you': '100% made 4 you',
  '100-made4you': '100% made 4 you',

  // Common subcategories & leaf sections
  'pants and shorts': 'calcas e calcoes',
  'pants-and-shorts': 'calcas e calcoes',
  leggings: 'leggins',
  'polo shirts': 'polos',
  'polo-shirts': 'polos',
  't shirts': 't-shirts',
  't-shirts': 't-shirts',
  sweatshirts: 'sweatshirts',
  jackets: 'casacos',
  vests: 'coletes',
  tracksuits: 'fatos de treino',
  'caps and hats': 'bones e gorros',
  'caps-and-hats': 'bones e gorros',
  'caps and beanies': 'bones e gorros',
  'sports accessories': 'acessorios de desporto',
  'sports-accessories': 'acessorios de desporto',
  backpacks: 'mochilas',
  bags: 'sacos',
  bottles: 'garrafas',
  'mugs and cups': 'canecas',
  'mugs-and-cups': 'canecas',
  umbrellas: 'guarda-chuvas',
  towels: 'toalhas',
  stationery: 'papelaria',
  keychains: 'porta-chaves',
  lanyards: 'fitas e lanyards',
  tools: 'ferramentas',
  'kitchen accessories': 'cozinha',
  'wine accessories': 'acessorios de vinho',
  'travel accessories': 'acessorios de viagem',
};

/**
 * Fold case, accents and punctuation so both spellings compare equal.
 *
 * The source document sometimes embeds a trailing note inside parentheses
 * ("Parkas Leves (abaixo da cintura…)"); that fragment is never part of what
 * the operator types in the live tree, so it is dropped before folding.
 */
export function normalizeCategoryText(text: string): string {
  const stripped = stripParentheticalNote(text);
  const folded = foldCategoryText(stripped);
  return EN_TO_PT_CATEGORY_MAP[folded] ?? folded;
}

/**
 * Drop a trailing `(...)` note so "Parkas Leves (abaixo da cintura…)"
 * becomes "Parkas Leves" before the fold.
 */
function stripParentheticalNote(text: string): string {
  const paren = text.indexOf('(');
  return paren === -1 ? text : text.slice(0, paren).trimEnd();
}

/**
 * The actual fold applied to a name whose note fragment has already been
 * dropped. Kept separate so the startup builder can re-use the same logic
 * without a redundant paren scan.
 */
function foldCategoryText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * A stem both a source row and a live admin name are more likely to share
 * than any single normalised form. Used only as the *last* tie-breaker for
 * duplicate-named groups, so a plural/feminine live name still resolves to the
 * matching source row instead of giving up.
 *
 * Deep enough to cover the Portuguese endings the source document already
 * chose not to spell out ("casacos leve" vs "casacos leves",
 * "casacos acolchoada" vs "casacos acolchoados", "t-shirt" vs
 * "t-shirts"), shallow enough that a wrong stem match would rather give up.
 */
export function stemCategoryText(text: string): string {
  const core = stripParentheticalNote(text);
  const folded = foldCategoryText(core);
  if (!folded) return '';

  return folded
    .split(/\s+/)
    .map((w) => stemWord(w))
    .join(' ');
}

function stemWord(word: string): string {
  if (!word) return word;
  let core = word;
  // Drop a redundant plural marker the source leaves unpluralised.
  if (core.endsWith('s') && core.length > 2) {
    const singular = core.slice(0, -1);
    // Do not stem an already-short form into something worse
    // ("cas" is not a word). Keep "s" when the remaining form is tiny.
    if (singular.length >= 3) core = singular;
  }
  // Drop the gender vowel so the live masculine and the index feminine share
  // a stem ("Casacos Acolchoados" against the row "CASACOS ACOLCHOADAS",
  // "Coletes Acolchoados" against "COLETES ACOLCHOADAS"). Short words keep
  // their vowel — "polo"/"pola" is not a gender pair, it is a different word.
  if (core.length >= 5 && (core.endsWith('a') || core.endsWith('o'))) {
    core = core.slice(0, -1);
  }
  return core;
}

/** Full ancestor chain (root first) of one index node, as names. */
function indexPath(node: CategoryIndexNode): string[] {
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const names: string[] = [];
  let parentId = node.parent;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parent;
  }
  return names;
}

const byPath = new Map<string, string>();
const byName = new Map<string, string[]>();
const byStem = new Map<string, string[]>();
/** Row lookup by id, so prefix/parent tie-breakers do not rebuild a map. */
const BY_ID = new Map(NODES.map((n) => [n.id, n]));
/** Every row's normalised name, kept in index order for the prefix fallback. */
const NAME_KEYS: [string, string][] = [];

for (const node of NODES) {
  const name = normalizeCategoryText(node.name);
  if (name === '') continue;
  NAME_KEYS.push([node.id, name]);
  const path = [...indexPath(node), node.name]
    .map(normalizeCategoryText)
    .join('>');
  // First writer wins on duplicate paths, so the file stays the single source
  // of truth and the result is stable between loads.
  if (!byPath.has(path)) byPath.set(path, node.id);
  const list = byName.get(name);
  if (list) list.push(node.id);
  else byName.set(name, [node.id]);

  // Stems are *not* unique: several source rows share a stem
  // ("casacos leve" and "casacos leves" both stem to "casacos leve"). The
  // stem map is only a tie-breaker, used after path info has failed.
  const stem = stemCategoryText(node.name);
  if (stem) {
    const stemList = byStem.get(stem);
    if (stemList) stemList.push(node.id);
    else byStem.set(stem, [node.id]);
  }
}

/**
 * The index code for one category, given its ancestor names (root first, and
 * the Magento "Default Category" root may or may not be included).
 *
 * Tries the deepest ancestor suffix first, so "LINHA NATURA" under POLOS gets
 * 1.2.3 rather than one of its namesakes. The last of those attempts is the
 * bare name on its own, which is how a top-level category resolves even when
 * its name is also used deeper down ("SACOS E MOCHILAS" is both 5 and 12.2.8;
 * Magento's root, "Default Category", is not in the index, so the ancestor
 * path alone would never peel back to the top-level entry). Only when no path
 * matches does it accept a name that is unique in the index.
 *
 * When the name collides across sections but the live ancestor path cannot be
 * honoured verbatim (e.g. a leaf listed under the wrong visible parent), the
 * tie is broken by the closest ancestor pair the index already holds for a
 * matching row, then — as a last resort only — by a stem comparison so a
 * plural/feminine live name still lands on the row the source named without
 * that ending.
 */
export function categoryCode(
  name: string,
  ancestors: readonly string[] = [],
  parentCode: string | null = null,
): string | null {
  const key = normalizeCategoryText(name);
  if (key === '') return null;

  const path = ancestors.map((ancestor) => normalizeCategoryText(ancestor));

  for (let depth = path.length; depth >= 0; depth -= 1) {
    const suffix = depth === 0 ? [] : path.slice(path.length - depth);
    const hit = byPath.get([...suffix, name].map(normalizeCategoryText).join('>'));
    if (hit) return hit;
  }

  const candidates = byName.get(key) ?? [];

  // No index row carries this exact normalized name. The live admin spells
  // some names with endings the source left out ("Casacos Leves" vs the index
  // row "CASACOS LEVE"), so use the rows sharing this name's stem as the
  // candidate set. NOTE: this branch used to filter the *empty* exact-name
  // list by those stem hits, so it could never return a row and the stem map
  // was unreachable whenever the exact-name lookup missed.
  if (candidates.length === 0) {
    const stem = stemCategoryText(name);
    const stemmed = stem ? (byStem.get(stem) ?? []) : [];
    return (
      pickByPath(stemmed, path) ??
      pickByParent(stemmed, parentCode) ??
      pickByPrefix(key, path, parentCode)
    );
  }

  if (candidates.length === 1) return candidates[0] ?? null;

  // The path above could not be honoured verbatim — the live parent is wrong
  // or is missing from the index. Try each candidate whose own recorded
  // ancestors overlap with the live path; the row whose recorded path already
  // contains the most leading live segments is the closest real parent.
  const picked = pickByPath(candidates, path) ?? pickByParent(candidates, parentCode);
  if (picked) return picked;

  // Absolute last resort: stem so a plural/feminine live name still resolves
  // to the matching row, but only when exactly one candidate shares that stem.
  // A stem collision is not resolved — picking the wrong section is worse than
  // giving up.
  const stem = stemCategoryText(name);
  if (!stem) return pickByPrefix(key, path, parentCode);
  return (
    pickByPath(
      candidates.filter((id) => (byStem.get(stem) ?? []).includes(id)),
      path,
    ) ?? pickByPrefix(key, path, parentCode)
  );
}

/**
 * Pick one row out of several candidates using the live ancestor path: rows
 * whose recorded ancestors overlap the live path are scored, and only a
 * unique best survives. One candidate is accepted as-is; an empty set, a tie
 * or a scoreless set returns null, because a wrong number is worse than none.
 */
function pickByPath(
  ids: readonly string[],
  path: readonly string[],
): string | null {
  const unique = Array.from(new Set(ids));
  if (unique.length === 1) return unique[0] ?? null;
  if (unique.length === 0) return null;

  const scored = unique
    .map((id) => ({ id, score: pathOverlap(id, path) }))
    .filter(({ score }) => score > 0);

  if (scored.length === 1) return scored[0]?.id ?? null;
  if (scored.length > 1) {
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    const onlyBest = scored.filter(({ score }) => score === best.score);
    if (onlyBest.length === 1) return onlyBest[0]?.id ?? null;
  }
  return null;
}

/**
 * Export the stem used as the last tie-breaker so diagnostic scripts can
 * explain *why* a live name resolved to a particular index row without
 * re-deriving the matching logic from the source build.
 */export { stemCategoryText as stemForCategory };
/**
 * How many leading live-path segments match the start of an index row's own
 * recorded ancestor chain, when both are normalised. A longer match wins; on
 * ties the caller breaks them further downstream (or gives up).
 */
function pathOverlap(nodeId: string, livePath: readonly string[]): number {
  const node = BY_ID.get(nodeId);
  if (!node) return 0;

  const nodePath = indexPath(node).map(normalizeCategoryText);
  if (nodePath.length === 0 || livePath.length === 0) return 0;

  // The live tree starts above the index — "Default Category" is Magento's
  // store root and has no index row — and the operator can open the tree at
  // any depth. So align the row's chain against every suffix of the live
  // path and keep the longest leading match. A strict position-by-position
  // compare returned 0 for every real leaf whenever that root was in the
  // path, which silently disabled the duplicate-name tie-breaker.
  let best = 0;
  for (let start = 0; start < livePath.length; start += 1) {
    let matches = 0;
    while (
      matches < nodePath.length &&
      start + matches < livePath.length &&
      livePath[start + matches] === nodePath[matches]
    ) {
      matches += 1;
    }
    if (matches > best) best = matches;
  }
  return best;
}

/**
 * Pick the one candidate that sits directly under a parent whose code the page
 * already resolved.
 *
 * This covers what the name path cannot: the live tree resolves the parent
 * fine, but spells the branch above it differently ("Têxtil Criança 100%
 * MADE4YOU" against the index row "TÊXTIL CRIANÇA"), so the live ancestor list
 * never matches the recorded one segment by segment. A matching parent code is
 * the strongest signal available — the same name under the same parent is the
 * same category — so only a unique hit counts.
 */
function pickByParent(ids: readonly string[], parentCode: string | null): string | null {
  if (!parentCode) return null;
  const unique = Array.from(new Set(ids)).filter(
    (id) => BY_ID.get(id)?.parent === parentCode,
  );
  return unique.length === 1 ? (unique[0] ?? null) : null;
}

/**
 * Pick a row whose name is a word-boundary prefix (either direction) of the
 * live name, when nothing better matched.
 *
 * The admin adds qualifiers the source sheet leaves out ("Têxtil Criança 100%
 * MADE4YOU" for the row "TÊXTIL CRIANÇA"), which no exact or stem lookup can
 * bridge. Only a unique candidate survives: with several prefix matches the
 * parent code has to break the tie, and without one the answer stays `null`.
 */
function pickByPrefix(
  key: string,
  path: readonly string[],
  parentCode: string | null,
): string | null {
  const ids: string[] = [];
  for (const [id, nodeKey] of NAME_KEYS) {
    if (nodeKey === key) continue;
    if (nodeKey.startsWith(`${key} `) || key.startsWith(`${nodeKey} `)) ids.push(id);
  }
  if (ids.length === 0) return null;
  return pickByParent(ids, parentCode) ?? (ids.length === 1 ? (ids[0] ?? null) : pickByPath(ids, path));
}
/** Number of rows in the mirrored index (used by the fixture checks). */
export const CATEGORY_INDEX_SIZE = NODES.length;
