import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DRIME_BASE_URL = 'https://app.drime.cloud/api/v1';
const API_TOKEN = process.env.DRIME_API_TOKEN;
const WORKSPACE_ID = process.env.DRIME_WORKSPACE_ID || '0';
const SOURCE_DIR = 'C:\\Users\\user\\Videos\\GGM\\Image_Correction';

if (!API_TOKEN) {
  console.error('Set DRIME_API_TOKEN environment variable');
  process.exit(1);
}

const REQUEST_DELAY = 200; // ms between requests
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function drimeRequest(endpoint, options = {}, retry = 0) {
  await sleep(REQUEST_DELAY);
  
  const url = `${DRIME_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      ...options.headers,
    },
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (response.status === 429 && retry < MAX_RETRIES) {
    const waitTime = 1000 * (retry + 1);
    console.log(`  Rate limited, waiting ${waitTime}ms... (retry ${retry + 1}/${MAX_RETRIES})`);
    await sleep(waitTime);
    return drimeRequest(endpoint, options, retry + 1);
  }
  
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${data.message || response.statusText}`);
  if (data.status === 'error') throw new Error(`API error: ${data.message || 'Unknown error'}`);
  return data;
}

async function getOrCreateFolder(path) {
  const parts = path.split('/').filter(Boolean);
  let currentParentId = null;
  let currentFolder = null;

  for (const part of parts) {
    const data = await drimeRequest(`/drive/file-entries?workspaceId=${WORKSPACE_ID}&perPage=100&query=${encodeURIComponent(part)}&type=folder`);
    const existing = data.data?.find(f => f.name === part && f.type === 'folder' && f.parent_id === currentParentId);

    if (existing) {
      currentParentId = existing.id;
      currentFolder = existing;
    } else {
      const created = await drimeRequest(`/folders?workspaceId=${WORKSPACE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: part, parentId: currentParentId }),
      });
      currentParentId = created.folder.id;
      currentFolder = created.folder;
    }
  }
  return currentFolder;
}

async function uploadFile(filePath, parentId, fileName) {
  const buffer = readFileSync(filePath);
  const blob = new Blob([buffer]);
  const file = new File([blob], fileName, { type: 'image/' + extname(fileName).slice(1) });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', WORKSPACE_ID);
  formData.append('parentId', String(parentId));

  const data = await drimeRequest('/uploads', {
    method: 'POST',
    body: formData,
  });
  return data.fileEntry;
}

function walkDir(dir, prefix = '') {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkDir(fullPath, join(prefix, entry)));
    } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(entry)) {
      files.push({ fullPath, relPath: join(prefix, entry), name: entry });
    }
  }
  return files;
}

async function main() {
  console.log('Scanning:', SOURCE_DIR);
  const allFiles = walkDir(SOURCE_DIR);
  console.log(`Found ${allFiles.length} image files`);

  // Group by brand/model/color
  const groups = new Map();
  for (const file of allFiles) {
    const parts = file.relPath.split('\\');
    if (parts.length < 3) continue;
    const brand = parts[0];
    const model = parts[1];
    const color = parts[2];
    const sku = `${brand}-${model}`;
    const variant = color.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const key = `${sku}/${variant}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }

  console.log(`\nUploading to ${groups.size} SKU/variant folders...`);

  let uploaded = 0;
  let errors = 0;
  let folderCount = 0;

  for (const [key, files] of groups) {
    folderCount++;
    const [sku, variant] = key.split('/');
    const folderPath = `BOG Studio/${sku}/${variant}`;
    
    try {
      const folder = await getOrCreateFolder(folderPath);
      console.log(`\n[${folderCount}/${groups.size}] ${sku}/${variant} (${files.length} files) -> folder ID: ${folder.id}`);

      for (const file of files) {
        try {
          await uploadFile(file.fullPath, folder.id, file.name);
          uploaded++;
          if (uploaded % 25 === 0) console.log(`  ${uploaded} uploaded...`);
        } catch (e) {
          errors++;
          console.error(`  ✗ ${file.name}: ${e.message}`);
        }
      }
    } catch (e) {
      errors++;
      console.error(`  ✗ Folder ${folderPath}: ${e.message}`);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Folders: ${groups.size}`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Errors: ${errors}`);
}

main().catch(e => { console.error(e); process.exit(1); });