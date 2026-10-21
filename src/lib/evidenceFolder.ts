/**
 * Local evidence folder (File System Access API).
 *
 * The folder is chosen by the user from an extension page (dashboard) because
 * `showDirectoryPicker()` needs a user gesture and is not available in the MV3
 * service worker. The handle is structured-cloneable, so it is kept in
 * IndexedDB and reused across dashboard visits; Chrome re-checks the permission
 * the next time we write.
 *
 * Nothing here touches Notion or the network.
 */

const DB_NAME = 'bog-evidence';
const DB_VERSION = 1;
const STORE = 'handles';
const ROOT_KEY = 'images-root';

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
}

type ShowDirectoryPicker = (
  options?: DirectoryPickerOptions,
) => Promise<FileSystemDirectoryHandle>;

interface PermissionCapableHandle extends FileSystemHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

export interface EvidenceFolder {
  name: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

async function readHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const get = tx.objectStore(STORE).get(ROOT_KEY);
      get.onsuccess = () =>
        resolve((get.result as FileSystemDirectoryHandle | undefined) ?? null);
      get.onerror = () => reject(get.error ?? new Error('IndexedDB read failed'));
    });
  } finally {
    db.close();
  }
}

async function writeHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (handle) store.put(handle, ROOT_KEY);
      else store.delete(ROOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

export function folderPickingSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as {
    showDirectoryPicker?: ShowDirectoryPicker;
  }).showDirectoryPicker === 'function';
}

/** Ask the user for the evidence root and remember it. Must run from a click. */
export async function pickEvidenceFolder(): Promise<EvidenceFolder> {
  const picker = (window as unknown as { showDirectoryPicker?: ShowDirectoryPicker })
    .showDirectoryPicker;
  if (!picker) {
    throw new Error('Folder picking needs Chrome or Edge (File System Access API).');
  }
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ id: 'bog-evidence', mode: 'readwrite' });
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') {
      throw new Error('Folder selection cancelled.');
    }
    throw err;
  }
  if (!(await ensureWritePermission(handle))) {
    throw new Error('Write permission for the selected folder was not granted.');
  }
  await writeHandle(handle);
  return { name: handle.name };
}

/** The remembered folder, if any (permission is checked when writing). */
export async function loadEvidenceFolder(): Promise<EvidenceFolder | null> {
  const handle = await readHandle();
  return handle ? { name: handle.name } : null;
}

export async function evidenceRoot(): Promise<FileSystemDirectoryHandle | null> {
  return readHandle();
}

/** Forget the remembered folder (does not touch the files on disk). */
export async function forgetEvidenceFolder(): Promise<void> {
  await writeHandle(null);
}

/**
 * True when we can write. A `prompt` state triggers `requestPermission`, which
 * Chrome only allows right after a user gesture.
 */
export async function ensureWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const h = handle as PermissionCapableHandle;
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!h.requestPermission) return false;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/**
 * Ask Chrome to re-grant read/write on the remembered folder.
 *
 * The permission is not persisted across page loads, so it returns to `prompt`
 * every time the dashboard is reopened. `requestPermission` only works while
 * the click that led here is still a live user gesture, so call this first in
 * the handler - before any download or storage work.
 */
export async function requestWritePermission(): Promise<
  'granted' | 'denied' | 'no-folder' | 'error'
> {
  const handle = await readHandle();
  if (!handle) return 'no-folder';
  const h = handle as PermissionCapableHandle;
  if (!h.requestPermission) return 'error';
  try {
    const state = await h.requestPermission({ mode: 'readwrite' });
    return state === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'error';
  }
}

/** Current permission for the remembered folder, without prompting. */
export async function folderPermissionState(): Promise<
  'unsupported' | 'none' | 'prompt' | 'granted' | 'denied'
> {
  const handle = await readHandle();
  if (!handle) return 'none';
  const h = handle as PermissionCapableHandle;
  if (!h.queryPermission) return 'granted';
  return (await h.queryPermission({ mode: 'readwrite' })) as
    | 'prompt'
    | 'granted'
    | 'denied';
}

/** Write/read/delete one probe file, then list the folder's top level. */
export async function probeEvidenceFolder(): Promise<{
  ok: boolean;
  folder: string;
  wrote: string;
  readBack: boolean;
  removed: boolean;
  entries: string[];
  error?: string;
}> {
  const handle = await readHandle();
  if (!handle) throw new Error('No folder chosen yet.');
  // `ensureWritePermission` queries first and only prompts when Chrome says
  // `prompt`, so this stays safe to call again right after a grant.
  if (!(await ensureWritePermission(handle))) {
    throw new Error(
      `Write permission not granted (state: ${await folderPermissionState()}) - click "Grant access" or pick the folder again with "Change folder".`,
    );
  }
  const name = '_bog_probe.txt';
  const body = `BOG evidence probe ${new Date().toISOString()}\n`;
  const out = {
    ok: false,
    folder: handle.name,
    wrote: name,
    readBack: false,
    removed: false,
    entries: [] as string[],
    error: undefined as string | undefined,
  };
  try {
    const file = await handle.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(body);
    await writable.close();
    const read = await (await handle.getFileHandle(name)).getFile();
    out.readBack = (await read.text()) === body;
    try {
      await handle.removeEntry(name);
      out.removed = true;
    } catch {
      out.removed = false;
    }
    out.ok = out.readBack;
  } catch (err) {
    out.error = err instanceof Error ? err.message : String(err);
  }
  try {
    const entries: string[] = [];
    for await (const entry of (handle as unknown as {
      values: () => AsyncIterable<FileSystemHandle>;
    }).values()) {
      entries.push(`${entry.name}${entry.kind === 'directory' ? '/' : ''}`);
      if (entries.length >= 20) break;
    }
    out.entries = entries.sort();
  } catch (err) {
    out.error ??= err instanceof Error ? err.message : String(err);
  }
  return out;
}

async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  parts: string[],
): Promise<FileSystemDirectoryHandle> {
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  return dir;
}

/** Create `<root>/<parts...>` (used for the always-present `configure/`). */
export async function ensureEvidenceDir(
  root: FileSystemDirectoryHandle,
  parts: string[],
): Promise<void> {
  await ensureDirectory(root, parts);
}

/** Write one file under `<root>/<parts...>/<name>`, creating folders as needed. */
export async function writeEvidenceFile(
  root: FileSystemDirectoryHandle,
  parts: string[],
  name: string,
  data: BlobPart,
): Promise<void> {
  const dir = await ensureDirectory(root, parts);
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}
