import { z } from 'zod';

const DRIME_BASE_URL = 'https://app.drime.cloud/api/v1';

export const DrimeConfigSchema = z.object({
  enabled: z.boolean().default(false),
  apiToken: z.string().default(''),
  workspaceId: z.number().default(0),
  maxFileSize: z.number().default(50 * 1024 * 1024),
});

export type DrimeConfig = z.infer<typeof DrimeConfigSchema>;

export const DrimeFileEntrySchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.enum(['folder', 'image', 'text', 'audio', 'video', 'pdf', 'other']),
  hash: z.string(),
  file_size: z.number(),
  mime: z.string().optional(),
  extension: z.string().optional(),
  parent_id: z.number().nullable(),
  workspace_id: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DrimeFileEntry = z.infer<typeof DrimeFileEntrySchema>;

export const DrimeFolderSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.literal('folder'),
  hash: z.string(),
  file_size: z.number(),
  parent_id: z.number().nullable(),
  workspace_id: z.number(),
  path: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DrimeFolder = z.infer<typeof DrimeFolderSchema>;

export const DrimeListResponseSchema = z.object({
  status: z.literal('success'),
  data: z.array(DrimeFileEntrySchema),
  folder: DrimeFolderSchema.nullable(),
  current_page: z.number(),
  last_page: z.number(),
  per_page: z.number(),
  total: z.number(),
  from: z.number().nullable(),
  to: z.number().nullable(),
});

export type DrimeListResponse = z.infer<typeof DrimeListResponseSchema>;

export const DrimeUploadResponseSchema = z.object({
  status: z.literal('success'),
  fileEntry: DrimeFileEntrySchema,
});

export type DrimeUploadResponse = z.infer<typeof DrimeUploadResponseSchema>;

export const DrimeSpaceUsageSchema = z.object({
  status: z.literal('success'),
  used: z.number(),
  available: z.number(),
  total: z.number().optional(),
  percentage: z.number().optional(),
});

export type DrimeSpaceUsage = z.infer<typeof DrimeSpaceUsageSchema>;

const STORAGE_KEY = 'bog-drime-config';

export async function getDrimeConfig(): Promise<DrimeConfig> {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  const parsed = DrimeConfigSchema.safeParse(result[STORAGE_KEY]);
  return parsed.success ? parsed.data : DrimeConfigSchema.parse({});
}

export async function setDrimeConfig(config: Partial<DrimeConfig>): Promise<void> {
  const current = await getDrimeConfig();
  const merged = { ...current, ...config };
  const parsed = DrimeConfigSchema.parse(merged);
  await chrome.storage.sync.set({ [STORAGE_KEY]: parsed });
}

export async function isDrimeEnabled(): Promise<boolean> {
  const config = await getDrimeConfig();
  return config.enabled && !!config.apiToken;
}

async function drimeRequest<T>(
  config: DrimeConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${DRIME_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
      ...options.headers,
    },
  });
  
  const data = await response.json().catch(() => ({}));
  
  if (!response.ok) {
    const message = data.message || `HTTP ${response.status}`;
    throw new Error(`Drime API error: ${message}`);
  }
  
  if (data.status === 'error') {
    throw new Error(`Drime API error: ${data.message || 'Unknown error'}`);
  }
  
  return data as T;
}

export async function uploadFile(
  file: File,
  options: {
    parentId?: number | null;
    relativePath?: string;
    lastModified?: number;
  } = {}
): Promise<DrimeFileEntry> {
  const config = await getDrimeConfig();
  
  if (!config.enabled) {
    throw new Error('Drime storage is not enabled');
  }
  
  if (file.size > config.maxFileSize) {
    throw new Error(`File exceeds maximum size of ${config.maxFileSize / 1024 / 1024}MB`);
  }
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspaceId', String(config.workspaceId));
  
  if (options.parentId !== undefined) {
    formData.append('parentId', options.parentId === null ? '' : String(options.parentId));
  }
  
  if (options.relativePath) {
    formData.append('relativePath', options.relativePath);
  }
  
  if (options.lastModified) {
    formData.append('lastModified', String(options.lastModified));
  }
  
  const response = await drimeRequest<DrimeUploadResponse>(config, '/uploads', {
    method: 'POST',
    body: formData,
  });
  
  return response.fileEntry;
}

export async function listFiles(options: {
  parentId?: number | null;
  folderId?: string;
  query?: string;
  type?: 'folder' | 'image' | 'text' | 'audio' | 'video' | 'pdf';
  page?: number;
  perPage?: number;
  orderBy?: 'updated_at' | 'created_at' | 'name' | 'file_size';
  orderDir?: 'asc' | 'desc';
} = {}): Promise<{ files: DrimeFileEntry[]; total: number; hasMore: boolean }> {
  const config = await getDrimeConfig();
  
  const params = new URLSearchParams({
    workspaceId: String(config.workspaceId),
    page: String(options.page || 1),
    perPage: String(options.perPage || 50),
    orderBy: options.orderBy || 'updated_at',
    orderDir: options.orderDir || 'desc',
  });
  
  if (options.parentId !== undefined) {
    params.set('parentIds', String(options.parentId === null ? '' : options.parentId));
  }
  
  if (options.folderId) {
    params.set('folderId', options.folderId);
  }
  
  if (options.query) {
    params.set('query', options.query);
  }
  
  if (options.type) {
    params.set('type', options.type);
  }
  
  const response = await drimeRequest<DrimeListResponse>(config, `/drive/file-entries?${params.toString()}`);
  
  return {
    files: response.data,
    total: response.total,
    hasMore: response.current_page < response.last_page,
  };
}

export async function getFileEntry(entryId: number): Promise<DrimeFileEntry> {
  const config = await getDrimeConfig();
  
  const response = await drimeRequest<{ status: 'success'; data: DrimeFileEntry }>(
    config,
    `/file-entries/${entryId}`
  );
  
  return response.data;
}

export async function downloadFile(hash: string): Promise<Blob> {
  const config = await getDrimeConfig();
  
  const response = await fetch(`${DRIME_BASE_URL}/file-entries/download/${hash}`, {
    headers: {
      'Authorization': `Bearer ${config.apiToken}`,
    },
  });
  
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Download failed: ${data.message || response.statusText}`);
  }
  
  return response.blob();
}

export async function downloadFileAsUrl(hash: string): Promise<string> {
  const blob = await downloadFile(hash);
  return URL.createObjectURL(blob);
}

export async function deleteFiles(entryIds: number[], deleteForever = false): Promise<void> {
  const config = await getDrimeConfig();
  
  await drimeRequest(config, '/file-entries/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryIds, deleteForever }),
  });
}

export async function createFolder(name: string, parentId: number | null = null): Promise<DrimeFolder> {
  const config = await getDrimeConfig();
  
  const response = await drimeRequest<{ status: 'success'; folder: DrimeFolder }>(
    config,
    `/folders?workspaceId=${config.workspaceId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    }
  );
  
  return response.folder;
}

export async function getOrCreateFolderByPath(path: string): Promise<DrimeFolder> {
  const parts = path.split('/').filter(Boolean);
  let currentParentId: number | null = null;
  let currentFolder: DrimeFolder | null = null;
  
  for (const part of parts) {
    const { files } = await listFiles({ parentId: currentParentId, query: part, type: 'folder' });
    const existing = files.find(f => f.name === part && f.type === 'folder');
    
    if (existing) {
      currentParentId = existing.id;
      currentFolder = {
        id: existing.id,
        name: existing.name,
        type: 'folder',
        hash: existing.hash,
        file_size: 0,
        parent_id: existing.parent_id,
        workspace_id: existing.workspace_id,
        path: '',
        created_at: existing.created_at,
        updated_at: existing.updated_at,
      };
    } else {
      currentFolder = await createFolder(part, currentParentId);
      currentParentId = currentFolder.id;
    }
  }
  
  return currentFolder!;
}

export async function getSpaceUsage(): Promise<{ used: number; total: number; available: number; percentage: number }> {
  const config = await getDrimeConfig();
  
  const response = await drimeRequest<DrimeSpaceUsage>(config, `/user/space-usage?workspaceId=${config.workspaceId}`);
  
  // API returns: { used, available, status } - no total or percentage
  const total = response.total ?? (response.used + response.available);
  const percentage = response.percentage ?? (total > 0 ? Math.round((response.used / total) * 100) : 0);
  
  return {
    used: response.used,
    total,
    available: response.available,
    percentage,
  };
}

export async function testConnection(): Promise<boolean> {
  try {
    const config = await getDrimeConfig();
    if (!config.enabled || !config.apiToken) return false;
    
    await drimeRequest(config, '/users/me');
    return true;
  } catch {
    return false;
  }
}

export function sanitizeSku(sku: string): string {
  return sku.replace(/[^a-zA-Z0-9-_]/g, '_');
}

export function getFolderPathForSku(sku: string, variant?: string): string {
  const sanitized = sanitizeSku(sku);
  return variant ? `BOG Studio/${sanitized}/${variant}` : `BOG Studio/${sanitized}`;
}

export const VALID_VARIANTS = ['base', 'thumbnail', 'gallery', 'swatch'] as const;
export type ImageVariant = typeof VALID_VARIANTS[number];

export async function uploadProductImage(
  sku: string,
  file: File,
  variant?: ImageVariant
): Promise<DrimeFileEntry> {
  const folderPath = getFolderPathForSku(sku, variant);
  const folder = await getOrCreateFolderByPath(folderPath);
  
  return uploadFile(file, {
    parentId: folder.id,
    lastModified: Date.now(),
  });
}

export async function listProductImages(
  sku: string,
  variant?: ImageVariant
): Promise<DrimeFileEntry[]> {
  const folderPath = getFolderPathForSku(sku, variant);
  const folder = await getOrCreateFolderByPath(folderPath);
  
  const { files } = await listFiles({ parentId: folder.id, type: 'image' });
  return files;
}

export async function getAllProductImages(sku: string): Promise<DrimeFileEntry[]> {
  const basePath = getFolderPathForSku(sku);
  const baseFolder = await getOrCreateFolderByPath(basePath);
  
  const allImages: DrimeFileEntry[] = [];
  
  const { files: baseFiles } = await listFiles({ parentId: baseFolder.id, type: 'image' });
  allImages.push(...baseFiles);
  
  for (const variant of VALID_VARIANTS) {
    const variantPath = getFolderPathForSku(sku, variant);
    const variantFolder = await getOrCreateFolderByPath(variantPath);
    const { files } = await listFiles({ parentId: variantFolder.id, type: 'image' });
    allImages.push(...files);
  }
  
  return allImages;
}

export async function deleteProductImages(
  sku: string,
  variant?: ImageVariant,
  deleteForever = false
): Promise<void> {
  const folderPath = getFolderPathForSku(sku, variant);
  const folder = await getOrCreateFolderByPath(folderPath);
  
  const { files } = await listFiles({ parentId: folder.id });
  const entryIds = files.map(f => f.id);
  
  if (entryIds.length > 0) {
    await deleteFiles(entryIds, deleteForever);
  }
}

export function getImageDisplayUrl(hash: string): string {
  return `${DRIME_BASE_URL}/file-entries/download/${hash}`;
}