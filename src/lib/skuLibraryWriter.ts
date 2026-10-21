// SKU Library writer — the ONE place create-only is lifted.
//
// Board direction (2026-10-19): the SKU Library database may be CREATED and
// UPDATED, but only for a fixed whitelist of cells. The Listing Errors database
// stays strictly create-only (see listingWriter.ts). This file is also the only
// file the static guard (scripts/check-notion-readonly.mjs) lets hold the
// `/v1/pages/{id}` literal.
//
// Rules:
//  - match an existing row by EXACT SKU title (never fuzzy);
//  - missing row  -> create it (create-only, properties only);
//  - existing row -> fill empty + fix differences, and log every old -> new;
//  - only whitelisted properties are ever included in the payload;
//  - updates require NOTION_LIBRARY_UPDATES_ENABLED;
//  - read back after writing and report the diff.

import {
  createNotionPage,
  mapSkuLibraryPage,
  NotionApiError,
  patchOnlyNotionFetch,
  queryDatabase,
  readOnlyNotionFetch,
  queued,
} from './notion';
import { NOTION_LIBRARY_UPDATES_ENABLED } from './flags';
import { richText } from './listingWriter';
import type { MagentoBuild } from './magento';
import type { ResolverJson } from './resolver';
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
}

export interface LibraryReport {
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: LibrarySkuResult[];
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
    category: extra.category?.trim() ?? '',
    subcategory: extra.subcategory?.trim() ?? '',
    supplier: extra.supplier?.trim() ?? '',
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

/** Every whitelisted cell that is still empty — the row is not filter-safe. */
export function missingLibraryFields(cells: LibraryCells): LibraryField[] {
  return LIBRARY_WHITELIST.filter(
    (field) => !OPTIONAL_EMPTY.includes(field) && !cellValue(cells, field).trim(),
  );
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

/** Find the single row whose SKU title equals `sku` (exact match only). */
async function findLibraryRow(
  token: string,
  dbId: string,
  sku: string,
): Promise<{ id: string; cells: Record<string, unknown> } | null> {
  const filter = { property: 'SKU', title: { equals: sku } };
  const pages = await queryDatabase(token, dbId, filter, 2);
  const page = pages[0] as { id?: string } | undefined;
  if (!page?.id) return null;
  return { id: page.id, cells: mapSkuLibraryPage(page) };
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
): Promise<LibrarySkuResult> {
  // A row with empty cells breaks every filtered view, so an incomplete row is
  // never written (and an existing complete row is never blanked).
  const missing = missingLibraryFields(cells);
  if (missing.length > 0) {
    return {
      sku,
      action: 'failed',
      changes: [],
      error: `incomplete row, not written: missing ${missing.join(', ')}`,
    };
  }

  const existing = await findLibraryRow(token, dbId, sku);

  if (!existing) {
    const body: Record<string, unknown> = {
      parent: { database_id: dbId },
      properties: createLibraryProperties(sku, cells),
    };
    if (children && children.length > 0) body.children = children;
    const created = await createNotionPage(token, body);
    return { sku, action: 'created', pageId: created.id, changes: [] };
  }

  // Existing rows are property-only: the body is create-only and cannot be
  // appended to, so children are only written on create. Updates leave the body
  // untouched.
  const { changes, properties } = planLibraryUpdate(existing.cells, cells);
  if (changes.length === 0) {
    return { sku, action: 'unchanged', pageId: existing.id, changes: [] };
  }

  if (!NOTION_LIBRARY_UPDATES_ENABLED) {
    return {
      sku,
      action: 'unchanged',
      pageId: existing.id,
      changes,
      error: 'SKU Library updates are disabled',
    };
  }

  await updatePageProperties(token, existing.id, properties);

  const verified = await readBackPage(token, existing.id);
  const confirmed: LibraryChange[] = [];
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
      error: `read-back mismatch on ${unverified
        .map((c) => c.field)
        .join(', ')}`,
    };
  }
  return {
    sku,
    action: 'updated',
    pageId: existing.id,
    changes: confirmed,
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
    changes: {},
  };
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
    );
      if (result.changes.length > 0) report.changes[entry.sku] = result.changes;
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
