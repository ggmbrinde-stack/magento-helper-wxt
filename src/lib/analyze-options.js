const data = require('./categorias-index.json');
const nodes = data.nodes;

// Find leaf nodes (those not appearing as parent)
const parentSet = new Set(nodes.filter(n => n.parent).map(n => n.parent));
const leaves = nodes.filter(n => !parentSet.has(n.id));

console.log('Total nodes:', nodes.length);
console.log('Leaf nodes:', leaves.length);

// Check for LINHA NATURA duplicates
const natureLeaves = leaves.filter(n => n.name.includes('LINHA NATURA'));
console.log('LINHA NATURA leaves:', natureLeaves.length);
natureLeaves.forEach(n => console.log(' -', n.id, n.name, 'parent:', n.parent));

// Check category counts by top-level category
const topLevel = nodes.filter(n => !n.parent);
console.log('Top-level categories:', topLevel.length);
topLevel.forEach(c => {
  const children = leaves.filter(n => n.parent === c.id);
  console.log(' -', c.name, '(' + c.id + '):', children.length, 'leaves');
});

// Extract leaf node names as options
const leafOptions = leaves.map(n => n.name);
console.log('\nFirst 10 leaf options:');
leafOptions.slice(0, 10).forEach((opt, i) => console.log(' ', i + 1, ':', opt));

console.log('\nLast 10 leaf options:');
leafOptions.slice(-10).forEach((opt, i) => console.log(' ', i + 1, ':', opt));

// Count unique options (remove duplicates)
const uniqueOptions = [...new Set(leafOptions)];
console.log('\nUnique leaf options:', uniqueOptions.length);