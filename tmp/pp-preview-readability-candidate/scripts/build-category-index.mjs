#!/usr/bin/env node
// Rebuild src/page/features/category-tree/categorias-index.json from the
// consolidated Notion text.
//
// Usage: node scripts/build-category-index.mjs [target.json]
//        (or: npm run index:build)
//
// Without an argument the committed index is overwritten; pass a path to
// rebuild somewhere else and diff first.
//
// Parses `categorias-source.md` next to this script:
//   ## 1. NAME            -> top-level node   (parent null)
//   ### 1.1. NAME         -> section node     (parent "1")
//   **1.1.1.** NAME       -> leaf node        (parent "1.1")
// The "Notas"/"Atributos" columns are never parsed (they carry no category
// numbers). Names are normalized like the previous mirror: markdown emphasis
// and marker emojis (🔸🔹⚠📌) dropped, everything from the first "(" onward
// removed ("Parkas Leves (abaixo da cintura…)" -> "PARKAS LEVES"), trimmed
// and uppercased — matching how Magento spells the tree.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, 'categorias-source.md');
const TARGET = process.argv[2]
  ? resolve(process.argv[2])
  : join(here, '..', 'src', 'page', 'features', 'category-tree', 'categorias-index.json');

const text = readFileSync(SOURCE, 'utf8');

function cleanName(raw) {
  return raw
    .replace(/\*\*/g, ' ')
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{2600}-\u{27BF}\u{FE0F}\u{2000}-\u{206F}]/gu,
      ' ',
    )
    .split('(')[0]
    .replace(/\s+/g, ' ')
    .replace(/[\s?:;!.,…'"”]+$/u, '')
    .trim()
    .toUpperCase();
}

const nodes = [];
const warnings = [];
let top = null;
let second = null;
let nextTop = 1;
let nextSecond = 1;
let nextLeaf = 1;

const lines = text.split(/\r?\n/);

for (let i = 0; i < lines.length; i++) {
  const rawLine = lines[i];
  const line = rawLine.trim();
  if (line === '') continue;

  let m = /^##\s+(\d{1,2})\.\s*(.+)$/.exec(line);
  if (m) {
    if (Number(m[1]) !== nextTop) {
      warnings.push(`top ${m[1]} found, expected ${nextTop}`);
    }
    nextTop = Number(m[1]) + 1;
    top = { id: m[1], name: cleanName(m[2]) };
    second = null;
    nextSecond = 1;
    nodes.push({
      id: top.id,
      name: top.name,
      parent: null,
      notes: extractNotes(i, lines),
    });
    continue;
  }

  m = /^###\s+(\d{1,2}\.\d{1,2})\.\s*(.+)$/.exec(line);
  if (m) {
    if (!top) {
      warnings.push(`section without top: ${line}`);
      continue;
    }
    const [t, s] = m[1].split('.').map(Number);
    if (t !== Number(top.id)) warnings.push(`section ${m[1]} under top ${top.id}`);
    if (s !== nextSecond) warnings.push(`section ${m[1]}, expected ${top.id}.${nextSecond}`);
    nextSecond = s + 1;
    second = { id: m[1], name: cleanName(m[2]) };
    nextLeaf = 1;
    nodes.push({
      id: second.id,
      name: second.name,
      parent: top.id,
      notes: extractNotes(i, lines),
    });
    continue;
  }

  // "**1.1.1.** Name" — also catches the source's broken "11.4.3.** Name".
  m = /^\*{0,2}(\d{1,2}\.\d{1,2}\.\d{1,3})\.\*{0,2}\s*(.+)$/.exec(line);
  if (m) {
    if (!second) {
      warnings.push(`leaf outside a section: ${line}`);
      continue;
    }
    const [t, s, l] = m[1].split('.').map(Number);
    if (String(t) !== top.id || `${t}.${s}` !== second.id) {
      warnings.push(`leaf ${m[1]} not inside ${second.id}`);
      continue;
    }
    if (l !== nextLeaf) warnings.push(`leaf ${m[1]}, expected ${second.id}.${nextLeaf}`);
    nextLeaf = l + 1;
    const name = cleanName(m[2]);
    if (name === '') {
      warnings.push(`empty leaf name: ${line}`);
      continue;
    }
    nodes.push({
      id: m[1],
      name,
      parent: second.id,
      // Leaves don't usually have their own "Notas" section in this MD,
      // they are usually listed under a section's "Notas".
      // But we can check if there's any immediate note if the MD structure allows.
    });
    continue;
  }
}

/**
 * Scan forward from the current node line to find the next "**Notas**" section
 * before the next section-level header (## or ###).
 *
 * For section-level nodes (###), we look through the entire section block
 * until the next ## or ### header.
 */
function extractNotes(index, allLines) {
  const notes = [];
  let foundNotas = false;
  for (let j = index + 1; j < allLines.length; j++) {
    const line = allLines[j].trim();
    // Stop only when we hit a new top-level or section header
    // (NOT at leaf nodes, since notes come after leaf nodes and attributes)
    if (/^##\s+/.test(line) || /^###\s+/.test(line)) {
      break;
    }
    if (line === '**Notas**') {
      foundNotas = true;
      continue;
    }
    if (foundNotas) {
      // Collect everything until the next section header or horizontal rule
      if (line === '---') {
        break;
      }
      if (line !== '' && !line.startsWith('**Atributos**') && !line.startsWith('**Categoria**')) {
        notes.push(line);
      }
    }
  }
  return notes.length > 0 ? notes.join(' ').trim() : undefined;
}

// Post-process: extract cross-category rules from notes
function extractCrossCategoryRules(noteText) {
  const rules = [];
  if (!noteText) return rules;

  // Pattern: 🔹Name tb em 1.2.3. Name or 🔸Name tb em 7. AR LIVRE...
  // Matches patterns like: "🔹Térmicos (interiores) tb em 2. TÊXTIL DESPORTO > ACESSÓRIOS"
  // We need to handle: emoji? source (maybe with parens) tb em dest-id. dest-path
  const regex = /(?:🔹|🔸|⚠)?\s*([^🔹🔸⚠]+?)\s+tb\s+em\s+(?:>|também\s+em\s+)?\s*(\d+(?:\.\d+)*)\.?\s*([^🔹🔸⚠]*)/gi;
  let match;
  while ((match = regex.exec(noteText)) !== null) {
    let source = match[1].trim();
    // Remove trailing emoji or parens content from source
    source = source.replace(/\s*[🔹🔸⚠].*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();

    let targetId = match[2];
    let targetName = match[3].trim();
    // Clean up target name - remove leading > and any "tb em" fragments
    targetName = targetName.replace(/^>\s*/, '').replace(/\s*tb\s+em\s+.*$/i, '').trim();

    // Normalize targetId: remove leading 0 for categories 01-09 -> 1-9
    if (targetId.length === 2 && targetId[0] === '0') {
      targetId = targetId[1];
    }

    if (source && targetId) {
      rules.push({
        source,
        targetId,
        targetName,
      });
    }
  }
  return rules;
}

for (const node of nodes) {
  if (node.notes) {
    const rules = extractCrossCategoryRules(node.notes);
    if (rules.length > 0) {
      node.crossCategory = rules;
    }
  }
}

/* --- validation ---------------------------------------------------------- */
const fatal = [];
const ids = new Set();
for (const node of nodes) {
  if (ids.has(node.id)) fatal.push(`duplicate id ${node.id}`);
  ids.add(node.id);
  if (node.parent && !ids.has(node.parent) && !nodes.some((n) => n.id === node.parent)) {
    fatal.push(`orphan ${node.id} (parent ${node.parent} not defined yet)`);
  }
  if (node.name === '') fatal.push(`empty name for ${node.id}`);
}
const tops = nodes.filter((n) => n.parent === null);
if (tops.length !== 12) fatal.push(`expected 12 top-level nodes, got ${tops.length}`);
for (const w of warnings) console.warn(`WARN  ${w}`);
if (fatal.length) {
  for (const f of fatal) console.error(`FATAL ${f}`);
  process.exit(1);
}

const out = {
  version: '2.1.0',
  source: {
    page: '📚 Categorias - Índice',
    url: 'https://app.notion.com/p/3f8b6705-ae1f-81df-a86d-f175c1637642',
    from: 'scripts/categorias-source.md',
    exported: '2026-11-05',
  },
  nodes,
};
writeFileSync(TARGET, JSON.stringify(out, null, 2) + '\n', 'utf8');

const leaves = nodes.filter((n) => n.id.split('.').length === 3);
const sections = nodes.filter((n) => n.id.split('.').length === 2);
console.log(
  `OK    ${nodes.length} nodes -> ${TARGET} ` +
    `(${tops.length} top, ${sections.length} sections, ${leaves.length} leaves)`,
);
