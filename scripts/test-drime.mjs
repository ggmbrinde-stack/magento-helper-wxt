const DRIME_BASE_URL = 'https://app.drime.cloud/api/v1';
const API_TOKEN = process.env.DRIME_API_TOKEN || '';
const WORKSPACE_ID = process.env.DRIME_WORKSPACE_ID || '0';

async function drimeRequest(endpoint, options = {}) {
  const url = `${DRIME_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.message || response.statusText}`);
  }
  
  if (data.status === 'error') {
    throw new Error(`API error: ${data.message || 'Unknown error'}`);
  }
  
  return data;
}

async function testConnection() {
  console.log('Testing connection...');
  const data = await drimeRequest('/users/me');
  console.log('✓ Connected as:', data.user?.email || data.user?.display_name);
  return data.user;
}

async function testSpaceUsage() {
  console.log('\nTesting space usage...');
  const data = await drimeRequest(`/user/space-usage?workspaceId=${WORKSPACE_ID}`);
  console.log('Raw response:', JSON.stringify(data, null, 2));
  const usage = data.data || data;
  const used = (usage.used / 1024 / 1024).toFixed(1);
  const total = (usage.total / 1024 / 1024).toFixed(1);
  const avail = (usage.available / 1024 / 1024).toFixed(1);
  console.log(`✓ Storage: ${used} MB / ${total} MB (${avail} MB free, ${usage.percentage}% used)`);
  return usage;
}

async function testListFiles() {
  console.log('\nTesting list files (root)...');
  const data = await drimeRequest(`/drive/file-entries?workspaceId=${WORKSPACE_ID}&perPage=10`);
  console.log(`✓ Found ${data.total} entries in root`);
  data.data.forEach(f => console.log(`  - ${f.name} (${f.type}, ${f.file_size} bytes, hash: ${f.hash})`));
  return data.data;
}

async function testCreateFolder() {
  console.log('\nTesting create folder...');
  const folderName = `BOG Studio Test ${Date.now()}`;
  const data = await drimeRequest(`/folders?workspaceId=${WORKSPACE_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, parentId: null }),
  });
  console.log('✓ Created folder:', data.folder.name, '(ID:', data.folder.id, ')');
  return data.folder;
}

async function testUploadFile(folderId) {
  console.log('\nTesting upload file...');
  
  // Create a small test PNG (1x1 pixel)
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBuffer = Buffer.from(pngBase64, 'base64');
  const blob = new Blob([pngBuffer], { type: 'image/png' });
  const file = new File([blob], 'test-image.png', { type: 'image/png' });
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', WORKSPACE_ID);
  formData.append('parentId', String(folderId));
  
  const data = await drimeRequest('/uploads', {
    method: 'POST',
    body: formData,
  });
  
  console.log('✓ Uploaded:', data.fileEntry.name, '(ID:', data.fileEntry.id, ', hash:', data.fileEntry.hash, ')');
  return data.fileEntry;
}

async function testDownloadFile(hash) {
  console.log('\nTesting download file...');
  const url = `${DRIME_BASE_URL}/file-entries/download/${hash}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${API_TOKEN}` },
  });
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }
  
  const blob = await response.blob();
  console.log('✓ Downloaded:', blob.size, 'bytes, type:', blob.type);
  return blob;
}

async function testDeleteFile(entryId) {
  console.log('\nTesting delete file (move to trash)...');
  await drimeRequest('/file-entries/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryIds: [entryId], deleteForever: false }),
  });
  console.log('✓ Moved to trash');
}

async function runTests() {
  if (!API_TOKEN) {
    console.error('ERROR: Set DRIME_API_TOKEN environment variable');
    console.log('Get it from: https://app.drime.cloud/account-settings#developers');
    process.exit(1);
  }
  
  console.log('='.repeat(50));
  console.log('Drime Cloud API Test');
  console.log('='.repeat(50));
  
  try {
    await testConnection();
    await testSpaceUsage();
    await testListFiles();
    
    const folder = await testCreateFolder();
    const file = await testUploadFile(folder.id);
    await testDownloadFile(file.hash);
    await testDeleteFile(file.id);
    
    console.log('\n' + '='.repeat(50));
    console.log('All tests passed! ✓');
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  }
}

runTests();