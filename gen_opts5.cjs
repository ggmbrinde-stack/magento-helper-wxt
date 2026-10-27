const fs = require('fs');
const opts = JSON.parse(fs.readFileSync('options_json3.json', 'utf8'));
const escaped = opts.map(n => "  '" + n.replace(/'/g, "''") + "'");
const stmt = 'ALTER COLUMN "Sub-subcategoria" SET MULTI_SELECT(\n' + escaped.join(',\n') + '\n)';
fs.writeFileSync('alter_stmt5.txt', stmt);
console.log('lines:', stmt.split('\n').length);
console.log('written');
