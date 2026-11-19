const fs = require('fs');
const opts = JSON.parse(fs.readFileSync('options_json.json', 'utf8'));
const batchSize = 60;
for (let i = 0; i < opts.length; i += batchSize) {
  const batch = opts.slice(i, i + batchSize);
  fs.writeFileSync(`batch_${Math.floor(i/batchSize)}.json`, JSON.stringify(batch));
}
console.log('batches:', Math.ceil(opts.length / batchSize));
