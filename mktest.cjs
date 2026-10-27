const fs = require('fs');
const opts = JSON.parse(fs.readFileSync('C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/options_colored.json', 'utf8'));
const header = 'Sub-subcategoria';
const csv = [header, opts[0].name, opts[1].name, opts[2].name];
fs.writeFileSync('C:/Users/user/Videos/BestOfGifts_Master/magento-helper-wxt/seed_test.csv', Buffer.from(csv.join('\r\n'), 'utf8'));
console.log('wrote test rows: 3');
