// SKU Library writer — the ONE place create-only is lifted.
//
// Board direction (2026-10-19): the SKU Library database may be CREATED and
// UPDATED, but only for a fixed whitelist of cells. The Listing Errors database
// stays strictly create-only (see listingWriter.ts). This file is also the only
// file the static guard (scripts/check-notion-readonly.mjs) lets hold the
// `/v1/pages/{id}` and create-time/empty-body `/v1/blocks/{id}/children`
// literals.
//
// Rules:
//  - match an existing row by EXACT SKU title (never fuzzy);
//  - missing row  -> create it with whitelisted properties + dossier body;
//  - existing row -> fill empty + fix whitelisted differences, log old -> new;
//  - existing body -> fill only when empty; never overwrite non-empty content;
//  - body chunks resume from a local receipt after a partial append;
//  - updates require NOTION_LIBRARY_UPDATES_ENABLED;
//  - read back after writing and report the diff.

import {
  createNotionPage,
  deleteBlockOnlyNotionFetch,
  listBlockChildren,
  mapSkuLibraryPage,
  NotionApiError,
  notionApiError,
  patchOnlyNotionFetch,
  queryAllDatabase,
  queryDatabase,
  readOnlyNotionFetch,
  queued,
} from '../shared/notion/client';
import { NOTION_LIBRARY_UPDATES_ENABLED } from '../shared/flags';
import { richText } from './listingWriter';
import {
  BODY_CHUNK_BLOCKS,
  MAX_BLOCKS_PER_REQUEST,
  chunkBlocks,
  countBlockObjects,
  type Block,
} from '../shared/notion/blocks';
import {
  bodyHash,
  loadBodyReceipt,
  saveBodyBackup,
  saveBodyReceipt,
  type BodyReceipt,
} from '../shared/notion/receipts';
import {
  CATEGORY_OPTIONS,
  LIBRARY_STATUS_OPTIONS,
  SKU_LIBRARY_SUPPLIER_OPTIONS,
  SUBCATEGORY_OPTIONS,
  canonicalCategory,
  canonicalSubcategory,
  canonicalSupplier,
  isOption,
} from '../shared/notion/contract';
import type { MagentoBuild } from '../shared/magento';
import type { ResolverJson } from '../shared/resolver';
import type { VariantSummary } from './variants';

const NOTION_VERSION = '2022-06-28';

/**
 * Update a page's properties (PATCH). The ONLY property-mutating call in the
 * extension; the static guard permits it in this file alone. Matched by an
 * exact SKU title, diffed before the call, and read back afterwards.
 */
async function updatePageProperties(
  token: string,
  pageId: string,
  properties: Record<string, unknown>,
): Promise<{ id: string }> {
  return queued(async () => {
    const response = await patchOnlyNotionFetch(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      },
    );
    if (!response.ok) {
      const retry = Number(response.headers.get('retry-after'));
      throw new NotionApiError(
        response.status,
        '',
        `SKU Library update failed (${response.status})`,
        Number.isFinite(retry) && retry > 0 ? retry : 0,
      );
    }
    return (await response.json()) as { id: string };
  });
}

/** The only properties this writer may ever touch. */
export const LIBRARY_WHITELIST = [
  'Status',
  'Last audit',
  'Frontend',
  'Backend',
  'Sizes',
  'Colors',
  'Missing combos',
  'Category',
  'Subcategory',
  'Supplier',
  'Supplier Link',
  'Supplier Product',
] as const;

export type LibraryField = (typeof LIBRARY_WHITELIST)[number];

export interface LibraryCells {
  frontend: string;
  backend: string;
  sizes: string;
  colors: string;
  missingCombos: string;
  /** 'To Fix' when the pipeline found error payloads, else 'Audited'. */
  status: string;
  /** ISO yyyy-MM-dd. */
  lastAudit: string;
  /** Optional so cells stored by older runs stay valid. */
  category?: string;
  subcategory?: string;
  supplier?: string;
  /** Official supplier site (url property). */
  supplierLink?: string;
  /** Deep catalog page; blank until an agent resolves it. */
  supplierProduct?: string;
}

export interface LibraryRowRef {
  id: string;
  cells: Record<string, unknown>;
}

export interface LibraryChange {
  field: LibraryField;
  from: string;
  to: string;
}

export interface LibrarySkuResult {
  sku: string;
  action: 'created' | 'updated' | 'unchanged' | 'failed';
  pageId?: string;
  changes: LibraryChange[];
  error?: string;
  /** Body state after the create; partial means the page row exists. */
  bodyStatus?: 'complete' | 'partial' | 'none';
}

export interface LibraryPreflight {
  sku: string;
  ok: boolean;
  error?: string;
  bodyBlocks: number;
  bodyChunks: number;
}

export interface LibraryPreview {
  sku: string;
  action: 'create' | 'update' | 'unchanged' | 'invalid';
  changes: LibraryChange[];
  bodyBlocks: number;
  bodyChunks: number;
  bodyAction:
    | 'create-with-body'
    | 'create-with-chunks'
    | 'fill-if-empty'
    | 'skip-nonempty'
    | 'none'
    | 'invalid';
  pageId?: string;
  error?: string;
}

export interface BodyRepairResult {
  sku: string;
  pageId?: string;
  backupBlocks: number;
  deleted: number;
  appended: number;
  error?: string;
}

export interface LibraryReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: LibrarySkuResult[];
  /** Created/updated rows whose dossier body could not be fully appended. */
  bodyIncomplete: string[];
  /** Why each incomplete body failed, keyed by SKU. */
  bodyErrors: Record<string, string>;
  changes: Record<string, LibraryChange[]>;
}

/** Derive the whitelisted cells for one audited SKU. */
export function libraryCellsFor(
  resolver: ResolverJson,
  magento: MagentoBuild,
  variants: VariantSummary,
  errorCount: number,
  auditDate = new Date(),
  extra: {
    category?: string | null;
    subcategory?: string | null;
    supplier?: string | null;
    supplierLink?: string | null;
    supplierProduct?: string | null;
  } = {},
): LibraryCells {
  const simple = variants.isSimple;
  const missing =
    variants.missing.length > 0
      ? `${variants.missing.length} - ${variants.missingDisplay.join(', ')}`
      : 'none (full matrix)';
  return {
    frontend: resolver.frontend_url,
    backend: magento.configurableUrl,
    sizes: simple ? 'n/a (simple product)' : variants.sizes.join(', '),
    colors: simple ? 'n/a (simple product)' : variants.colors.join(', '),
    missingCombos: missing,
    status: errorCount > 0 ? 'To Fix' : 'Audited',
    lastAudit: auditDate.toISOString().slice(0, 10),
    category:
      canonicalCategory(extra.category) ?? extra.category?.trim() ?? '',
    subcategory:
      canonicalSubcategory(extra.subcategory) ??
      extra.subcategory?.trim() ??
      '',
    supplier: canonicalSupplier(extra.supplier ?? ''),
    supplierLink: extra.supplierLink?.trim() ?? '',
    supplierProduct: extra.supplierProduct?.trim() ?? '',
  };
}

/** Notion property payload for one cell (whitelist-typed). */
function propertyFor(field: LibraryField, value: string): Record<string, unknown> {
  switch (field) {
    case 'Status':
    case 'Category':
    case 'Subcategory':
    case 'Supplier':
      return { select: { name: value } };
    case 'Last audit':
      return { date: { start: value } };
    case 'Frontend':
    case 'Backend':
    case 'Supplier Link':
    case 'Supplier Product':
      return { url: value || null };
    default:
      return { rich_text: richText(value) };
  }
}

function readCell(current: Record<string, unknown>, field: LibraryField): string {
  switch (field) {
    case 'Status':
      return String(current.status ?? '');
    case 'Last audit':
      return String(current.lastAudit ?? '');
    case 'Frontend':
      return String(current.frontend ?? '');
    case 'Backend':
      return String(current.backend ?? '');
    case 'Sizes':
      return String(current.sizes ?? '');
    case 'Colors':
      return String(current.colors ?? '');
    case 'Missing combos':
      return String(current.missingCombos ?? '');
    case 'Category':
      return String(current.category ?? '');
    case 'Subcategory':
      return String(current.subcategory ?? '');
    case 'Supplier':
      return String(current.supplier ?? '');
    case 'Supplier Link':
      return String(current.supplierLink ?? '');
    case 'Supplier Product':
      return String(current.supplierProduct ?? '');
    default:
      return '';
  }
}

function cellValue(cells: LibraryCells, field: LibraryField): string {
  switch (field) {
    case 'Status':
      return cells.status;
    case 'Last audit':
      return cells.lastAudit;
    case 'Frontend':
      return cells.frontend;
    case 'Backend':
      return cells.backend;
    case 'Sizes':
      return cells.sizes;
    case 'Colors':
      return cells.colors;
    case 'Missing combos':
      return cells.missingCombos;
    case 'Category':
      return cells.category ?? '';
    case 'Subcategory':
      return cells.subcategory ?? '';
    case 'Supplier':
      return cells.supplier ?? '';
    case 'Supplier Link':
      return cells.supplierLink ?? '';
    case 'Supplier Product':
      return cells.supplierProduct ?? '';
    default:
      return '';
  }
}

/**
 * Supplier URLs are allowed to stay blank (ALLBEST is internal, the catalog
 * deep link is agent-resolved), so they never count as a filter-safety gap.
 */
const OPTIONAL_EMPTY: LibraryField[] = ['Supplier Link', 'Supplier Product'];

/** Local validation + body plan; never makes a Notion call. */
export function preflightLibraryEntry(
  sku: string,
  cells: LibraryCells,
  children?: unknown[],
): LibraryPreflight {
  const blocks = (children ?? []) as Block[];
  const bodyBlocks = countBlockObjects(blocks);
  const bodyChunks =
    blocks.length > 0 ? chunkBlocks(blocks, BODY_CHUNK_BLOCKS).length : 0;
  const missing = missingLibraryFields(cells);
  if (missing.length > 0) {
    return {
      sku,
      ok: false,
      error: `incomplete row: missing ${missing.join(', ')}`,
      bodyBlocks,
      bodyChunks,
    };
  }
  const invalid = validateLibraryCells(cells);
  if (invalid.length > 0) {
    return {
      sku,
      ok: false,
      error: `invalid Notion option(s): ${invalid.join('; ')}`,
      bodyBlocks,
      bodyChunks,
    };
  }
  return { sku, ok: true, bodyBlocks, bodyChunks };
}

/** Every whitelisted cell that is still empty — the row is not filter-safe. */
export function missingLibraryFields(cells: LibraryCells): LibraryField[] {
  return LIBRARY_WHITELIST.filter(
    (field) => !OPTIONAL_EMPTY.includes(field) && !cellValue(cells, field).trim(),
  );
}

function validHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Validate every closed-select cell before a live Notion call. */
export function validateLibraryCells(cells: LibraryCells): string[] {
  const errors: string[] = [];
  if (!isOption(cells.status, LIBRARY_STATUS_OPTIONS)) {
    errors.push(`unknown Status "${cells.status}"`);
  }
  if (!isOption(cells.category ?? '', CATEGORY_OPTIONS)) {
    errors.push(`unknown Category "${cells.category ?? ''}"`);
  }
  if (!isOption(cells.subcategory ?? '', SUBCATEGORY_OPTIONS)) {
    errors.push(`unknown Subcategory "${cells.subcategory ?? ''}"`);
  }
  if (!isOption(cells.supplier ?? '', SKU_LIBRARY_SUPPLIER_OPTIONS)) {
    errors.push(`unknown Supplier "${cells.supplier ?? ''}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cells.lastAudit)) {
    errors.push(`invalid Last audit "${cells.lastAudit}"`);
  }
  for (const [field, value] of [
    ['Frontend', cells.frontend],
    ['Backend', cells.backend],
    ['Supplier Link', cells.supplierLink ?? ''],
    ['Supplier Product', cells.supplierProduct ?? ''],
  ] as const) {
    if (!validHttpUrl(value)) errors.push(`invalid ${field} URL "${value}"`);
  }
  return errors;
}

/**
 * Fill empty + fix differences. Returns the change list and the (whitelisted)
 * property payload. Fields that already match are skipped entirely.
 */
export function planLibraryUpdate(
  current: Record<string, unknown> | null,
  cells: LibraryCells,
): { changes: LibraryChange[]; properties: Record<string, unknown> } {
  const changes: LibraryChange[] = [];
  const properties: Record<string, unknown> = {};
  for (const field of LIBRARY_WHITELIST) {
    const next = cellValue(cells, field).trim();
    if (!next) continue;
    const prev = current ? readCell(current, field).trim() : '';
    if (prev === next) continue;
    changes.push({ field, from: prev, to: next });
    properties[field] = propertyFor(field, next);
  }
  return { changes, properties };
}

/** All property payload for a brand-new row (create-only). */
export function createLibraryProperties(
  sku: string,
  cells: LibraryCells,
): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    SKU: { title: [{ text: { content: sku } }] },
  };
  for (const field of LIBRARY_WHITELIST) {
    const value = cellValue(cells, field).trim();
    if (!value) continue;
    properties[field] = propertyFor(field, value);
  }
  return properties;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Find the single row whose SKU title equals `sku` (exact match only). */
async function findLibraryRow(
  token: string,
  dbId: string,
  sku: string,
): Promise<LibraryRowRef | null> {
  const filter = { property: 'SKU', title: { equals: sku } };
  const pages = await queryDatabase(token, dbId, filter, 2);
  const page = pages[0] as { id?: string } | undefined;
  if (!page?.id) return null;
  return { id: page.id, cells: mapSkuLibraryPage(page) };
}

/**
 * Load existing Library rows in batches of 50 SKUs. This turns a preview/write
 * of N SKUs from N queries into ceil(N/50), with a per-SKU fallback only when
 * a batch query is truncated.
 */
export async function loadLibraryRowsBySkus(
  token: string,
  dbId: string,
  skus: string[],
): Promise<Map<string, LibraryRowRef>> {
  const rows = new Map<string, LibraryRowRef>();
  const unique = [
    ...new Set(
      skus
        .map((sku) => sku.trim().toUpperCase())
        .filter((sku) => sku.length > 0),
    ),
  ];
  for (const chunk of chunkArray(unique, 50)) {
    const page = await queryAllDatabase(
      token,
      dbId,
      {
        or: chunk.map((sku) => ({
          property: 'SKU',
          title: { equals: sku },
        })),
      },
      100,
      10,
    );
    for (const row of page.results) {
      const cells = mapSkuLibraryPage(row);
      const sku = String(cells.sku ?? '').trim().toUpperCase();
      const id = (row as { id?: string }).id;
      if (sku && id && !rows.has(sku)) rows.set(sku, { id, cells });
    }
    if (page.truncated) {
      for (const sku of chunk) {
        if (rows.has(sku)) continue;
        const exact = await findLibraryRow(token, dbId, sku);
        if (exact) rows.set(sku, exact);
      }
    }
  }
  return rows;
}

/** GET one page (read-only) and map it, for the post-write read-back. */
async function readBackPage(
  token: string,
  pageId: string,
): Promise<Record<string, unknown>> {
  const page = await queued(async () => {
    const response = await readOnlyNotionFetch(
      `https://api.notion.com/v1/pages/${pageId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
        },
      },
    );
    if (!response.ok) {
      throw new Error(`read-back failed (${response.status})`);
    }
    return (await response.json()) as unknown;
  });
  return mapSkuLibraryPage(page);
}

function plainText(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => {
      const t = item as {
        plain_text?: unknown;
        text?: { content?: unknown };
      };
      if (typeof t.plain_text === 'string') return t.plain_text;
      if (typeof t.text?.content === 'string') return t.text.content;
      return '';
    })
    .join('');
}

/** A blank paragraph is not a body; every other real block counts as content. */
function blockHasContent(block: unknown): boolean {
  if (!block || typeof block !== 'object') return false;
  const b = block as {
    type?: unknown;
    has_children?: unknown;
    paragraph?: { rich_text?: unknown };
  };
  if (b.has_children === true) return true;
  if (b.type === 'paragraph') {
    return plainText(b.paragraph?.rich_text).trim().length > 0;
  }
  // An unsupported block is still content we must not overwrite.
  return true;
}

/** Read the first page of a page's body; only an empty/blank body is fillable. */
async function pageHasContent(token: string, pageId: string): Promise<boolean> {
  const body = await queued(async () => {
    const response = await readOnlyNotionFetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
        },
      },
    );
    if (!response.ok) throw await notionApiError(response, 'readPageBody');
    return (await response.json()) as {
      results?: unknown[];
      has_more?: boolean;
    };
  });
  if (body.has_more === true) return true;
  return (body.results ?? []).some(blockHasContent);
}

async function recordBodyReceipt(receipt: BodyReceipt): Promise<void> {
  try {
    await saveBodyReceipt(receipt);
  } catch {
    // The body still exists; a later read can recover the receipt.
  }
}

async function appendBodyChunks(
  token: string,
  pageId: string,
  sku: string,
  chunks: Block[][],
  hash: string,
  startAt = 0,
): Promise<{ ok: boolean; appended: number; error?: string }> {
  let appended = Math.min(startAt, chunks.length);
  await recordBodyReceipt({
    sku,
    pageId,
    bodyHash: hash,
    totalChunks: chunks.length,
    appendedChunks: appended,
    status: appended === chunks.length ? 'complete' : 'partial',
    updatedAt: new Date().toISOString(),
  });
  for (let i = appended; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk) break;
    try {
      await appendPageBlocks(token, pageId, chunk);
      appended = i + 1;
      await recordBodyReceipt({
        sku,
        pageId,
        bodyHash: hash,
        totalChunks: chunks.length,
        appendedChunks: appended,
        status: appended === chunks.length ? 'complete' : 'partial',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      return {
        ok: false,
        appended,
        error: `body incomplete after ${appended}/${chunks.length} chunk(s): ${(err as Error).message}`,
      };
    }
  }
  return { ok: true, appended };
}

/** Append one body chunk to a page created or repaired by this push. */
async function appendPageBlocks(
  token: string,
  pageId: string,
  blocks: Block[],
): Promise<void> {
  await queued(async () => {
    const response = await patchOnlyNotionFetch(
      `https://api.notion.com/v1/blocks/${pageId}/children`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ children: blocks }),
      },
    );
    if (!response.ok) throw await notionApiError(response, 'appendPageBlocks');
  });
}

async function deleteBlock(token: string, blockId: string): Promise<void> {
  await queued(async () => {
    const response = await deleteBlockOnlyNotionFetch(
      `https://api.notion.com/v1/blocks/${blockId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
        },
      },
    );
    if (!response.ok) throw await notionApiError(response, 'deleteBlock');
  });
}

/**
 * Apply one SKU to the SKU Library: create when missing, update when different.
 * Returns what actually happened, including the old -> new change list.
 */
export async function pushSkuLibrary(
  token: string,
  dbId: string,
  sku: string,
  cells: LibraryCells,
  children?: unknown[],
  existingRow?: LibraryRowRef | null,
): Promise<LibrarySkuResult> {
  // A row with empty cells breaks every filtered view, so an incomplete row is
  // never written (and an existing complete row is never blanked).
  const pre = preflightLibraryEntry(sku, cells, children);
  if (!pre.ok) {
    return {
      sku,
      action: 'failed',
      changes: [],
      error: pre.error ?? 'preflight failed',
    };
  }

  const blocks = (children ?? []) as Block[];
  const blockCount = pre.bodyBlocks;
  const chunks = blocks.length > 0 ? chunkBlocks(blocks, BODY_CHUNK_BLOCKS) : [];
  const hash = blocks.length > 0 ? bodyHash(blocks) : '';
  const existing =
    existingRow === undefined
      ? await findLibraryRow(token, dbId, sku)
      : existingRow;

  if (!existing) {
    const body: Record<string, unknown> = {
      parent: { database_id: dbId },
      properties: createLibraryProperties(sku, cells),
    };
    const fitsInCreate = blockCount <= MAX_BLOCKS_PER_REQUEST;
    if (blocks.length > 0 && fitsInCreate) body.children = blocks;

    const created = await createNotionPage(token, body);
    if (!created.id) {
      return {
        sku,
        action: 'failed',
        changes: [],
        error: 'Notion returned no page id for the created row',
      };
    }
    if (blocks.length === 0) {
      return {
        sku,
        action: 'created',
        pageId: created.id,
        changes: [],
        bodyStatus: 'none',
      };
    }
    if (fitsInCreate) {
      await recordBodyReceipt({
        sku,
        pageId: created.id,
        bodyHash: hash,
        totalChunks: 1,
        appendedChunks: 1,
        status: 'complete',
        updatedAt: new Date().toISOString(),
      });
      return {
        sku,
        action: 'created',
        pageId: created.id,
        changes: [],
        bodyStatus: 'complete',
      };
    }

    const run = await appendBodyChunks(token, created.id, sku, chunks, hash, 0);
    if (!run.ok) {
      return {
        sku,
        action: 'created',
        pageId: created.id,
        changes: [],
        bodyStatus: 'partial',
        error: `page created but ${run.error ?? 'body incomplete'}`,
      };
    }
    return {
      sku,
      action: 'created',
      pageId: created.id,
      changes: [],
      bodyStatus: 'complete',
    };
  }

  const { changes, properties } = planLibraryUpdate(existing.cells, cells);

  // Existing rows are still update/correct only within the whitelist. The body
  // is repaired only when it is empty; non-empty bodies are never overwritten.
  if (!NOTION_LIBRARY_UPDATES_ENABLED) {
    return {
      sku,
      action: 'unchanged',
      pageId: existing.id,
      changes,
      bodyStatus: 'none',
      error: 'SKU Library updates are disabled',
    };
  }

  let action: 'updated' | 'unchanged' = 'unchanged';
  let confirmed: LibraryChange[] = [];
  if (changes.length > 0) {
    await updatePageProperties(token, existing.id, properties);

    const verified = await readBackPage(token, existing.id);
    const unverified: LibraryChange[] = [];
    for (const change of changes) {
      const now = readCell(verified, change.field).trim();
      if (now === change.to) confirmed.push(change);
      else unverified.push(change);
    }
    if (unverified.length > 0) {
      return {
        sku,
        action: 'failed',
        pageId: existing.id,
        changes: confirmed,
        bodyStatus: 'none',
        error: `read-back mismatch on ${unverified
          .map((c) => c.field)
          .join(', ')}`,
      };
    }
    action = 'updated';
  }

  let bodyStatus: 'complete' | 'partial' | 'none' = 'none';
  let bodyError: string | undefined;
  if (blocks.length > 0) {
    const receipt = await loadBodyReceipt(sku);
    const receiptMatches = receipt?.pageId === existing.id;
    if (receiptMatches && receipt.status === 'complete') {
      bodyStatus = 'complete';
    } else if (receiptMatches && receipt.status === 'partial') {
      if (receipt.bodyHash !== hash) {
        bodyStatus = 'partial';
        bodyError =
          'body receipt belongs to a different dossier; manual repair needed';
      } else {
        const run = await appendBodyChunks(
          token,
          existing.id,
          sku,
          chunks,
          hash,
          receipt.appendedChunks,
        );
        bodyStatus = run.ok ? 'complete' : 'partial';
        bodyError = run.error;
      }
    } else {
      try {
        if (await pageHasContent(token, existing.id)) {
          bodyStatus = 'complete';
          await recordBodyReceipt({
            sku,
            pageId: existing.id,
            bodyHash: hash,
            totalChunks: 0,
            appendedChunks: 0,
            status: 'complete',
            updatedAt: new Date().toISOString(),
          });
        } else {
          const run = await appendBodyChunks(
            token,
            existing.id,
            sku,
            chunks,
            hash,
            0,
          );
          bodyStatus = run.ok ? 'complete' : 'partial';
          bodyError = run.error;
        }
      } catch (err) {
        bodyStatus = 'partial';
        bodyError = `body check failed: ${(err as Error).message}`;
      }
    }
  }

  return {
    sku,
    action,
    pageId: existing.id,
    changes: confirmed,
    bodyStatus,
    ...(bodyError ? { error: bodyError } : {}),
  };
}

/**
 * Explicit malformed-body repair. Backs up the old top-level blocks, deletes
 * them, then writes the current dossier. Never called by normal push.
 */
export async function repairSkuLibraryBody(
  token: string,
  dbId: string,
  sku: string,
  cells: LibraryCells,
  children?: unknown[],
): Promise<BodyRepairResult> {
  if (!NOTION_LIBRARY_UPDATES_ENABLED) {
    return {
      sku,
      backupBlocks: 0,
      deleted: 0,
      appended: 0,
      error: 'SKU Library updates are disabled',
    };
  }
  const pre = preflightLibraryEntry(sku, cells, children);
  if (!pre.ok) {
    return {
      sku,
      backupBlocks: 0,
      deleted: 0,
      appended: 0,
      error: pre.error ?? 'preflight failed',
    };
  }
  const blocks = (children ?? []) as Block[];
  if (blocks.length === 0) {
    return {
      sku,
      backupBlocks: 0,
      deleted: 0,
      appended: 0,
      error: 'no dossier body available',
    };
  }

  const existing = await findLibraryRow(token, dbId, sku);
  if (!existing) {
    return {
      sku,
      backupBlocks: 0,
      deleted: 0,
      appended: 0,
      error: 'SKU Library row not found',
    };
  }

  const oldBlocks = await listBlockChildren(token, existing.id);
  const unsafe = oldBlocks.find((block) => {
    const type = (block as { type?: unknown }).type;
    return (
      type === 'child_page' ||
      type === 'child_database' ||
      type === 'synced_block'
    );
  });
  if (unsafe) {
    return {
      sku,
      pageId: existing.id,
      backupBlocks: oldBlocks.length,
      deleted: 0,
      appended: 0,
      error: `body contains an unsupported block (${(unsafe as { type?: string }).type}); manual repair required`,
    };
  }
  const ids = oldBlocks.map((block) => (block as { id?: unknown }).id);
  if (ids.some((id) => typeof id !== 'string' || !id)) {
    return {
      sku,
      pageId: existing.id,
      backupBlocks: oldBlocks.length,
      deleted: 0,
      appended: 0,
      error: 'could not read every block id; nothing deleted',
    };
  }

  try {
    await saveBodyBackup({
      sku,
      pageId: existing.id,
      blocks: oldBlocks,
      at: new Date().toISOString(),
    });
  } catch (err) {
    return {
      sku,
      pageId: existing.id,
      backupBlocks: oldBlocks.length,
      deleted: 0,
      appended: 0,
      error: `backup failed; nothing deleted: ${(err as Error).message}`,
    };
  }

  let deleted = 0;
  try {
    for (const id of ids) {
      await deleteBlock(token, String(id));
      deleted += 1;
    }
  } catch (err) {
    return {
      sku,
      pageId: existing.id,
      backupBlocks: oldBlocks.length,
      deleted,
      appended: 0,
      error: `delete failed after ${deleted}/${ids.length} block(s): ${(err as Error).message}`,
    };
  }

  const hash = bodyHash(blocks);
  const chunks = chunkBlocks(blocks, BODY_CHUNK_BLOCKS);
  const run = await appendBodyChunks(token, existing.id, sku, chunks, hash, 0);
  return {
    sku,
    pageId: existing.id,
    backupBlocks: oldBlocks.length,
    deleted,
    appended: run.appended,
    ...(run.error ? { error: run.error } : {}),
  };
}

/** Preview one existing row without writing properties or body. */
export async function previewSkuLibrary(
  token: string,
  dbId: string,
  sku: string,
  cells: LibraryCells,
  children?: unknown[],
  existingRow?: LibraryRowRef | null,
): Promise<LibraryPreview> {
  const pre = preflightLibraryEntry(sku, cells, children);
  const blocks = (children ?? []) as Block[];
  if (!pre.ok) {
    return {
      sku,
      action: 'invalid',
      changes: [],
      bodyBlocks: pre.bodyBlocks,
      bodyChunks: pre.bodyChunks,
      bodyAction: 'invalid',
      error: pre.error,
    };
  }

  const existing =
    existingRow === undefined
      ? await findLibraryRow(token, dbId, sku)
      : existingRow;
  if (!existing) {
    return {
      sku,
      action: 'create',
      changes: [],
      bodyBlocks: pre.bodyBlocks,
      bodyChunks: pre.bodyChunks,
      bodyAction:
        blocks.length === 0
          ? 'none'
          : pre.bodyBlocks <= MAX_BLOCKS_PER_REQUEST
            ? 'create-with-body'
            : 'create-with-chunks',
    };
  }

  const { changes } = planLibraryUpdate(existing.cells, cells);
  if (!NOTION_LIBRARY_UPDATES_ENABLED) {
    return {
      sku,
      action: 'unchanged',
      pageId: existing.id,
      changes,
      bodyBlocks: pre.bodyBlocks,
      bodyChunks: pre.bodyChunks,
      bodyAction: 'none',
      error: 'SKU Library updates are disabled',
    };
  }
  const receipt = await loadBodyReceipt(sku);
  return {
    sku,
    action: changes.length > 0 ? 'update' : 'unchanged',
    pageId: existing.id,
    changes,
    bodyBlocks: pre.bodyBlocks,
    bodyChunks: pre.bodyChunks,
    bodyAction:
      blocks.length === 0
        ? 'none'
        : receipt?.pageId === existing.id && receipt.status === 'complete'
          ? 'skip-nonempty'
          : 'fill-if-empty',
  };
}

/** Push many SKUs, collecting a report with the full old -> new change log. */
export async function pushSkuLibraryBatch(
  token: string,
  dbId: string,
  entries: { sku: string; cells: LibraryCells; children?: unknown[] }[],
): Promise<LibraryReport> {
  const report: LibraryReport = {
    created: [],
    updated: [],
    unchanged: [],
    failed: [],
    bodyIncomplete: [],
    bodyErrors: {},
    changes: {},
  };
  let existingRows: Map<string, LibraryRowRef>;
  try {
    existingRows = await loadLibraryRowsBySkus(
      token,
      dbId,
      entries.map((entry) => entry.sku),
    );
  } catch (err) {
    const error = `library row preload failed: ${(err as Error).message}`;
    for (const entry of entries) {
      report.failed.push({
        sku: entry.sku,
        action: 'failed',
        changes: [],
        error,
      });
    }
    return report;
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.sku)) continue;
    seen.add(entry.sku);
    try {
      const result = await pushSkuLibrary(
        token,
        dbId,
        entry.sku,
        entry.cells,
        entry.children,
        existingRows.get(entry.sku.trim().toUpperCase()) ?? null,
      );
      if (result.changes.length > 0) report.changes[entry.sku] = result.changes;
      if (result.bodyStatus === 'partial') {
        report.bodyIncomplete.push(entry.sku);
        if (result.error) report.bodyErrors[entry.sku] = result.error;
      }
      if (result.action === 'created') report.created.push(entry.sku);
      else if (result.action === 'updated') report.updated.push(entry.sku);
      else if (result.action === 'unchanged')
        report.unchanged.push(entry.sku);
      else report.failed.push(result);
    } catch (err) {
      report.failed.push({
        sku: entry.sku,
        action: 'failed',
        changes: [],
        error: (err as Error).message ?? 'library push failed',
      });
    }
  }
  return report;
}
