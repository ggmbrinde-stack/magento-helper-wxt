const fs = require('fs');
const text = fs.readFileSync('scripts/categorias-source.md', 'utf8');

function cleanName(raw) {
  return raw
    .replace(/\*\*/g, ' ')
    .split('(')[0]
    .replace(/\s+/g, ' ')
    .replace(/[\s?:;!.,…'\"”]+$/u, '')
    .trim();
}

const nd = ['7.6.11', '7.7.10'];
const options = [];
let top = null, second = null;

for (const rawLine of text.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (line === '') continue;
  let m = /^##\s+(\d{1,2})\.\s*(.+)$/.exec(line);
  if (m) { top = m[1]; second = null; continue; }
  m = /^###\s+(\d{1,2}\.\d{1,2})\.\s*(.+)$/.exec(line);
  if (m) { second = m[1]; continue; }
  m = /^\*{0,2}(\d{1,2}\.\d{1,2}\.\d{1,3})\.\*{0,2}\s*(.+)$/.exec(line);
  if (m) {
    if (!second) continue;
    const id = m[1];
    if (nd.some(p => id.startsWith(p))) continue;
    const name = cleanName(m[2]);
    if (name === '') continue;
    if (id.split('.').length !== 3) continue;
    options.push(id + '. ' + name);
    continue;
  }
}

const uniq = [...new Set(options)];
console.log('total leaf options:', options.length);
console.log('unique:', uniq.length);
fs.writeFileSync('options_list2.txt', uniq.join('\n'));
fs.writeFileSync('options_json2.json', JSON.stringify(uniq));
const escaped = uniq.map(n => "'" + n.replace(/'/g, "''") + "'");
const stmt = 'ALTER COLUMN "Sub-subcategoria" SET MULTI_SELECT(' + escaped.join(', ') + ')';
fs.writeFileSync('alter_stmt3.txt', stmt);
console.log('stmt length:', stmt.length);
// show a few with emoji
console.log('sample:', uniq.filter(n=>n.includes('🔹')||n.includes('🔸')).slice(0,5));
