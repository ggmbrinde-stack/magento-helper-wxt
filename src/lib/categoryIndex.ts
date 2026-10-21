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
// - Duplicated leaf names are common ("LINHA NATURA" appears under T-shirts,
//   polos and sweatshirts), so the ancestor path decides. The Magento root
//   ("Default Category") is not part of the index, hence the path is matched
//   from the deepest ancestor outwards.
// - When a name matches several index rows and no ancestor path resolves it,
//   the answer is `null`: a wrong number is worse than no number.

import rawIndex from './categorias-index.json';

export interface CategoryIndexNode {
  id: string;
  name: string;
  parent: string | null;
}

const NODES: CategoryIndexNode[] = (rawIndex as { nodes: CategoryIndexNode[] })
  .nodes;

/** Fold case, accents and punctuation so both spellings compare equal. */
export function normalizeCategoryText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

for (const node of NODES) {
  const name = normalizeCategoryText(node.name);
  if (name === '') continue;
  const path = [...indexPath(node), node.name]
    .map(normalizeCategoryText)
    .join('>');
  // First writer wins on duplicate paths, so the file stays the single source
  // of truth and the result is stable between loads.
  if (!byPath.has(path)) byPath.set(path, node.id);
  const list = byName.get(name);
  if (list) list.push(node.id);
  else byName.set(name, [node.id]);
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
 */
export function categoryCode(
  name: string,
  ancestors: readonly string[] = [],
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
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

/** Number of rows in the mirrored index (used by the fixture checks). */
export const CATEGORY_INDEX_SIZE = NODES.length;
