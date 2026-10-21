const data = require('./categorias-index.json');
const nodes = data.nodes;

// Find leaf nodes (those not appearing as parent)
const parentSet = new Set(nodes.filter(n => n.parent).map(n => n.parent));
const leaves = nodes.filter(n => !parentSet.has(n.id));

// Remove LINHA NATURA duplicates from Category 7
// Category 7 has IDs starting with "7." and LINHA NATURA nodes under it
const naturaPrefixes = ['7.6.11', '7.7.10', '7.8.8']; // LINHA NATURA leaf node IDs
const filteredLeaves = leaves.filter(n => {
  // Check if this leaf is a LINHA NATURA duplicate from Category 7
  const isNaturaDuplicate = naturaPrefixes.some(prefix => n.id.startsWith(prefix));
  return !isNaturaDuplicate;
});

const uniqueOptions = [...new Set(filteredLeaves.map(n => n.name))];
console.log('Total leaf nodes:', leaves.length);
console.log('LINHA NATURA duplicates removed:', leaves.length - filteredLeaves.length);
console.log('Unique options after filtering:', uniqueOptions.length);

// Output the options in the format needed for Notion API
console.log('\nFirst 5 options:');
uniqueOptions.slice(0, 5).forEach((opt, i) => console.log(` ${i + 1}. ${opt}`));

console.log('\nLast 5 options:');
uniqueOptions.slice(-5).forEach((opt, i) => console.log(` ${uniqueOptions.length - 5 + i + 1}. ${opt}`));

// Save options to a file for later use
const fs = require('fs');
fs.writeFileSync('./subsubcategoria-options.json', JSON.stringify(uniqueOptions, null, 2));
console.log('\nOptions saved to subsubcategoria-options.json');