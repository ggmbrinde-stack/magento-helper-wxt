const data = require('./categorias-index.json');
const nodes = data.nodes;
const parentSet = new Set(nodes.filter(n => n.parent).map(n => n.parent));
const leaves = nodes.filter(n => !parentSet.has(n.id));
const natureLeaves = leaves.filter(n => n.name.includes('LINHA NATURA'));
const filteredLeaves = leaves.filter(n => !natureLeaves.includes(n));
const uniqueOptions = [...new Set(filteredLeaves.map(n => n.name))];
require('fs').writeFileSync('./options-count.txt', `Total leaves: ${leaves.length}\nLINHA NATURA: ${natureLeaves.length}\nUnique options: ${uniqueOptions.length}\n`);
console.log('Done');