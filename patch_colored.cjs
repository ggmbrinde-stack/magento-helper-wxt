const fs = require('fs');
const https = require('https');
const opts = JSON.parse(fs.readFileSync('options_colored.json','utf8'));
const body = JSON.stringify({
  properties: {
    'Sub-subcategoria': {
      multi_select: {
        options: opts.map(o => ({ name: o.name, color: o.color }))
      }
    }
  }
});
console.log('body length:', body.length);
const req = https.request({
  hostname: 'api.notion.com',
  path: '/v1/databases/b5b3b50e-3650-4325-a28e-b78298e8d06c',
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer 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',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('status:', res.statusCode);
    console.log(data.slice(0, 500));
    fs.writeFileSync('patch_result.json', data);
  });
});
req.on('error', e => console.error(e));
req.write(body);
req.end();
