const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/user/Videos/BestOfGifts_Master/notion_db.json', 'utf8'));
console.log(Object.keys(d.properties).join('\n'));
