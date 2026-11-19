// Local receipts for SKU Library page bodies. These are deliberately stored in
// chrome.storage.local, not in Notion: they let a later push resume a body that
// was only partly appended without adding a schema property or overwriting a
// non-empty page.

export const NOTION_BODY_RECEIPTS_KEY = 'notionBodyReceipts';
export const NOTION_BODY_BACKUPS_KEY = 'notionBodyBackups';

export interface BodyReceipt {
  sku: string;
  pageId: string;
  /** FNV-1a hash of the block payload, so a changed dossier is not resumed. */
  bodyHash: string;
  totalChunks: number;
  appendedChunks: number;
  status: 'partial' | 'complete';
  updatedAt: string;
}

export type BodyReceiptMap = Record<string, BodyReceipt>;

export interface BodyBackup {
  sku: string;
  pageId: string;
  blocks: unknown[];
  at: string;
}

export type BodyBackupMap = Record<string, BodyBackup>;

export function bodyHash(blocks: unknown[]): string {
  const text = JSON.stringify(blocks);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export async function loadBodyReceipts(): Promise<BodyReceiptMap> {
  try {
    const stored = await chrome.storage.local.get([NOTION_BODY_RECEIPTS_KEY]);
    return (
      (stored[NOTION_BODY_RECEIPTS_KEY] as BodyReceiptMap | undefined) ?? {}
    );
  } catch {
    return {};
  }
}

export async function loadBodyReceipt(
  sku: string,
): Promise<BodyReceipt | null> {
  const map = await loadBodyReceipts();
  return map[sku] ?? null;
}

export async function saveBodyReceipt(receipt: BodyReceipt): Promise<void> {
  const map = await loadBodyReceipts();
  map[receipt.sku] = receipt;
  await chrome.storage.local.set({ [NOTION_BODY_RECEIPTS_KEY]: map });
}

/** Keep the latest pre-repair body so an operator can inspect/restore it. */
export async function saveBodyBackup(backup: BodyBackup): Promise<void> {
  const stored = await chrome.storage.local.get([NOTION_BODY_BACKUPS_KEY]);
  const map =
    (stored[NOTION_BODY_BACKUPS_KEY] as BodyBackupMap | undefined) ?? {};
  map[backup.sku] = backup;
  await chrome.storage.local.set({ [NOTION_BODY_BACKUPS_KEY]: map });
}
