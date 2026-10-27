const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/user/Videos/BestOfGifts_Master/notion_db.json', 'utf8'));
for (const name of Object.keys(d.properties)) {
  const p = d.properties[name];
  const count = p.multi_select ? p.multi_select.options.length : '-';
  console.log(name + ' => ' + p.type + ' | options: ' + count);
}