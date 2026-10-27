const fs = require('fs');
const colorMap = { '1': 'red', '2': 'orange', '3': 'yellow', '4': 'green', '5': 'blue', '6': 'purple', '7': 'pink', '8': 'brown', '9': 'gray', '10': 'red', '11': 'orange', '12': 'yellow' };
const text = fs.readFileSync('scripts/categorias-source.md', 'utf8');
function cleanName(raw) { return raw.replace(/\*\*/g, ' ').split('(')[0].replace(/\s+/g, ' ').replace(/[\s?:;!.,…'"”]+$/u, '').trim(); }
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
const colored = uniq.map(n => { const cat = n.split('.')[0]; const color = colorMap[cat] || 'default'; return "'" + n.replace(/'/g, "''") + "':" + color; });
const stmt = 'ALTER COLUMN "Sub-subcategoria" SET MULTI_SELECT(' + colored.join(', ') + ')';
fs.writeFileSync('alter_stmt_colored.txt', stmt);
console.log('done, opts:', uniq.length, 'len:', stmt.length);
