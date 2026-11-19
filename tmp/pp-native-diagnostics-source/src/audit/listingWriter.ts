/**
 * Listing Errors writer — create-only Notion writes with dedup.
 *
 * Implements the writer rules from doc 10: dedup by `SKU + Error title` first,
 * then create. Status "To Fix", Error Flag Normal/Complex, blank page content.
 * Never updates, deletes, or appends. The Error Type is folded to the DB's
 * closed multi-select (unknowns -> "Translation error" for text, else "Other").
 *
 * Hardening (2026-10-19): payloads are validated against the closed option sets
 * BEFORE any API call, duplicate rows inside one batch are skipped locally
 * (Notion's index can lag right after a create), rich-text is chunked safely,
 * and failures carry Notion's status/code so the operator can tell a bad payload
 * from a rate limit or an auth problem.
 */

import {
  createNotionPage,
  mapListingErrorPage,
  NotionApiError,
  queryAllDatabase,
  queryDatabase,
} from '../shared/notion/client';
import {
  KNOWN_TYPES,
  normalizeType,
  type ListingErrorPayload,
} from './payload';
import {
  CATEGORY_OPTIONS,
  ERROR_FLAG_OPTIONS,
  ERROR_GROUP_OPTIONS,
  ERROR_TYPE_OPTIONS,
  FIELD_OPTIONS,
  FIX_LOCATION_OPTIONS,
  LANGUAGE_OPTIONS,
  LISTING_ERROR_SUPPLIER_OPTIONS,
  LISTING_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  SOURCE_OPTIONS,
  SUBCATEGORY_OPTIONS,
  canonicalCategory,
  canonicalSubcategory,
  canonicalSupplier,
  isOption,
} from '../shared/notion/contract';

// Backwards-compatible aliases for callers that imported the old names.
export const NOTION_ERROR_TYPE_OPTIONS = ERROR_TYPE_OPTIONS;
export const NOTION_GROUP_OPTIONS = ERROR_GROUP_OPTIONS;
export const NOTION_FLAG_OPTIONS = ERROR_FLAG_OPTIONS;
export const NOTION_STATUS_OPTIONS = LISTING_STATUS_OPTIONS;
export const NOTES_MAX = 1000;
const MAX_RICH_TEXT_ITEMS = 100;

/**
 * Closed-option lookup by normalized type. A payload whose type already names a
 * Notion option (e.g. "Duplicate image", "Missing image", "Remove Model image")
 * is written verbatim rather than folded away to "Other" (doc 10 §Error Type).
 */
const OPTION_BY_KEY = new Map(
  NOTION_ERROR_TYPE_OPTIONS.map((option) => [normalizeType(option), option]),
);

/** A payload that cannot be written as-is (bad/closed value or too long). */
export class PayloadValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'PayloadValidationError';
    this.field = field;
  }
}

/**
 * Fold a payload's raw type onto the DB's closed multi-select. Text findings
 * always fold to "Translation error"; a type that already names a closed option
 * is kept verbatim; other known types fold to "Wrong product information";
 * anything else folds to "Other" (doc 10 §Error Type). Unknown option values
 * reject the whole create, which is exactly what this avoids.
 */
export function foldErrorType(payload: ListingErrorPayload): string {
  if (payload.group === 'Text / Translation') return 'Translation error';
  const norm = normalizeType(payload.type);
  const option = OPTION_BY_KEY.get(norm);
  if (option) return option;
  if (KNOWN_TYPES.includes(norm)) return 'Wrong product information';
  return 'Other';
}

/**
 * Chunk rich_text so no item exceeds Notion's 2000-char limit. Notion also caps
 * a rich_text property at 100 items; exceeding that is a contract error rather
 * than something we silently truncate.
 */
export function richText(
  text: string,
): { type: 'text'; text: { content: string } }[] {
  if (!text) return [];
  const out: { type: 'text'; text: { content: string } }[] = [];
  let rest = text;
  while (rest.length > 2000) {
    let cut = rest.lastIndexOf(' ', 2000);
    if (cut < 1000) cut = 2000;
    const chunk = rest.slice(0, cut).trimEnd();
    if (chunk) out.push({ type: 'text', text: { content: chunk } });
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push({ type: 'text', text: { content: rest } });
  if (out.length > MAX_RICH_TEXT_ITEMS) {
    throw new PayloadValidationError(
      'rich_text',
      `rich_text needs ${out.length} segments (Notion allows ${MAX_RICH_TEXT_ITEMS})`,
    );
  }
  return out;
}

/**
 * Fail fast before a network call when a payload cannot map onto the DB's
 * closed options. Keeps a malformed candidate out of the write path entirely.
 */
export function assertWritablePayload(payload: ListingErrorPayload): void {
  if (!payload.title.trim()) {
    throw new PayloadValidationError('title', 'Error title is empty');
  }
  if (payload.title.length > 2000) {
    throw new PayloadValidationError('title', 'Error title exceeds 2000 chars');
  }
  if (!payload.sku.trim()) {
    throw new PayloadValidationError('sku', 'SKU is empty');
  }
  if (!isOption(payload.group, ERROR_GROUP_OPTIONS)) {
    throw new PayloadValidationError(
      'group',
      `unknown Error Group "${payload.group}" (expected one of ${NOTION_GROUP_OPTIONS.join(', ')})`,
    );
  }
  const folded = foldErrorType(payload);
  if (!isOption(folded, ERROR_TYPE_OPTIONS)) {
    throw new PayloadValidationError(
      'type',
      `Error Type "${folded}" is not a DB option`,
    );
  }
  if (!isOption(payload.flag, ERROR_FLAG_OPTIONS)) {
    throw new PayloadValidationError(
      'flag',
      `unknown Error Flag "${payload.flag}" (expected ${NOTION_FLAG_OPTIONS.join('/')})`,
    );
  }
  if (!isOption(payload.status, LISTING_STATUS_OPTIONS)) {
    throw new PayloadValidationError(
      'status',
      `unexpected Status "${payload.status}" (writer only creates "To Fix")`,
    );
  }
  if (!isOption(payload.language, LANGUAGE_OPTIONS)) {
    throw new PayloadValidationError(
      'language',
      `unknown Language "${payload.language}" (expected ${LANGUAGE_OPTIONS.join(', ')})`,
    );
  }
  if (!isOption(payload.source, SOURCE_OPTIONS)) {
    throw new PayloadValidationError(
      'source',
      `unknown Source "${payload.source}" (expected ${SOURCE_OPTIONS.join(', ')})`,
    );
  }
  if (payload.priority && !isOption(payload.priority, PRIORITY_OPTIONS)) {
    throw new PayloadValidationError(
      'priority',
      `unknown Priority "${payload.priority}"`,
    );
  }
  if (payload.fix_location && !isOption(payload.fix_location, FIX_LOCATION_OPTIONS)) {
    throw new PayloadValidationError(
      'fix_location',
      `unknown Fix Location "${payload.fix_location}"`,
    );
  }
  if (payload.category && !canonicalCategory(payload.category)) {
    throw new PayloadValidationError(
      'category',
      `unknown Category "${payload.category}" (expected ${CATEGORY_OPTIONS.join(', ')})`,
    );
  }
  if (payload.subcategory && !canonicalSubcategory(payload.subcategory)) {
    throw new PayloadValidationError(
      'subcategory',
      `unknown Subcategory "${payload.subcategory}"`,
    );
  }
  const supplier = canonicalSupplier(payload.supplier);
  if (supplier && !isOption(supplier, LISTING_ERROR_SUPPLIER_OPTIONS)) {
    throw new PayloadValidationError(
      'supplier',
      `unknown Supplier "${payload.supplier}" (expected ${LISTING_ERROR_SUPPLIER_OPTIONS.join(', ')})`,
    );
  }
  if (payload.field && !isOption(payload.field, FIELD_OPTIONS)) {
    throw new PayloadValidationError(
      'field',
      `unknown Field "${payload.field}"`,
    );
  }
}

/** Soft checks that do not block a write but should be shown to the operator. */
export function payloadWarnings(payload: ListingErrorPayload): string[] {
  const warnings: string[] = [];
  if (payload.notes.length > NOTES_MAX) {
    warnings.push(
      `${payload.title}: notes are ${payload.notes.length} chars (contract max ${NOTES_MAX})`,
    );
  }
  if (payload.page_content.trim()) {
    warnings.push(`${payload.title}: page_content is not blank`);
  }
  if (payload.dedup_key && payload.dedup_key !== `${payload.sku}|${payload.title}`) {
    warnings.push(
      `${payload.title}: dedup_key does not match "<SKU>|<title>"`,
    );
  }
  return warnings;
}

/** Map a payload to the Listing Errors DB property shapes (create-only). */
export function payloadToProperties(
  payload: ListingErrorPayload,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Error: { title: richText(payload.title) },
    'Error Group': { multi_select: [{ name: payload.group }] },
    'Error Type': { multi_select: [{ name: foldErrorType(payload) }] },
    'Error Flag': { select: { name: payload.flag } },
    Status: { select: { name: payload.status } },
    Notes: { rich_text: richText(payload.notes) },
    SKU: { rich_text: richText(payload.sku) },
    Source: { select: { name: payload.source } },
    Language: { select: { name: payload.language } },
  };
  const supplier = canonicalSupplier(payload.supplier);
  if (supplier) props.Supplier = { select: { name: supplier } };
  if (payload.priority) props.Priority = { select: { name: payload.priority } };
  if (payload.fix_location) {
    props['Fix Location'] = { select: { name: payload.fix_location } };
  }
  if (payload.link) props.Link = { url: payload.link };
  if (payload.fix) props.Fix = { rich_text: richText(payload.fix) };
  const category = canonicalCategory(payload.category);
  const subcategory = canonicalSubcategory(payload.subcategory);
  if (category) props.Category = { select: { name: category } };
  if (subcategory) props.Subcategory = { select: { name: subcategory } };
  if (payload.field) props.Field = { select: { name: payload.field } };
  return props;
}

export interface PushFailure {
  title: string;
  error: string;
  /** Notion HTTP status, when the failure came from the API. */
  status?: number;
  /** Notion error code, e.g. `validation_error` / `rate_limited`. */
  code?: string;
  /** Payload field that failed local validation. */
  field?: string;
}

export interface PushReport {
  created: string[];
  createdPageIds: Record<string, string>;
  /** Rows with the same SKU + title that already exist in Notion. */
  skipped: string[];
  /** Duplicate rows inside this batch (never sent to Notion). */
  skippedInBatch: string[];
  failed: PushFailure[];
  warnings: string[];
}

export interface ListingPreflight {
  total: number;
  unique: number;
  duplicates: number;
  warnings: string[];
  failures: PushFailure[];
}

/** Split a batch into first-seen payloads and later duplicates. */
export function dedupePayloadsInBatch(payloads: ListingErrorPayload[]): {
  unique: ListingErrorPayload[];
  duplicates: ListingErrorPayload[];
} {
  const seen = new Set<string>();
  const unique: ListingErrorPayload[] = [];
  const duplicates: ListingErrorPayload[] = [];
  for (const payload of payloads) {
    const key =
      payload.dedup_key || `${payload.sku.trim().toUpperCase()}|${payload.title.trim()}`;
    if (seen.has(key)) {
      duplicates.push(payload);
      continue;
    }
    seen.add(key);
    unique.push(payload);
  }
  return { unique, duplicates };
}

export function preflightListingPayloads(
  payloads: ListingErrorPayload[],
): ListingPreflight {
  const { unique, duplicates } = dedupePayloadsInBatch(payloads);
  const warnings: string[] = [];
  const failures: PushFailure[] = [];
  for (const payload of unique) {
    try {
      assertWritablePayload(payload);
      warnings.push(...payloadWarnings(payload));
    } catch (err) {
      failures.push(toFailure(payload, err));
    }
  }
  return {
    total: payloads.length,
    unique: unique.length,
    duplicates: duplicates.length,
    warnings,
    failures,
  };
}

/** Load one SKU's existing titles; used as the truncation fallback. */
async function loadTitlesForSku(
  token: string,
  dbId: string,
  sku: string,
): Promise<{ titles: Set<string>; truncated: boolean }> {
  const key = sku.trim().toUpperCase();
  const page = await queryAllDatabase(
    token,
    dbId,
    { property: 'SKU', rich_text: { equals: key } },
    100,
    10,
  );
  const titles = new Set<string>();
  for (const row of page.results) {
    const mapped = mapListingErrorPage(row);
    const title = String(mapped.title ?? '').trim();
    if (title) titles.add(title);
  }
  return { titles, truncated: page.truncated };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Load existing Listing Errors titles in batches of 50 SKUs. */
async function loadExistingListingTitles(
  token: string,
  dbId: string,
  skus: string[],
): Promise<{
  titles: Map<string, Set<string>>;
  truncated: Set<string>;
}> {
  const titles = new Map<string, Set<string>>();
  const truncated = new Set<string>();
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
          rich_text: { equals: sku },
        })),
      },
      100,
      10,
    );
    for (const row of page.results) {
      const mapped = mapListingErrorPage(row);
      const sku = String(mapped.sku ?? '').trim().toUpperCase();
      const title = String(mapped.title ?? '').trim();
      if (!sku || !title) continue;
      if (!titles.has(sku)) titles.set(sku, new Set());
      titles.get(sku)?.add(title);
    }
    if (page.truncated) {
      for (const sku of chunk) {
        const exact = await loadTitlesForSku(token, dbId, sku);
        titles.set(sku, exact.titles);
        if (exact.truncated) truncated.add(sku);
      }
    } else {
      for (const sku of chunk) {
        if (!titles.has(sku)) titles.set(sku, new Set());
      }
    }
  }
  return { titles, truncated };
}

function toFailure(payload: ListingErrorPayload, err: unknown): PushFailure {
  if (err instanceof NotionApiError) {
    return {
      title: payload.title,
      error: err.message,
      status: err.status,
      code: err.code,
    };
  }
  if (err instanceof PayloadValidationError) {
    return {
      title: payload.title,
      error: err.message,
      field: err.field,
    };
  }
  return {
    title: payload.title,
    error: err instanceof Error ? err.message : String(err),
  };
}

/** True when a row with the same SKU + Error title already exists (dedup). */
export async function listingErrorExists(
  token: string,
  dbId: string,
  sku: string,
  title: string,
): Promise<boolean> {
  const filter = {
    and: [
      {
        property: 'SKU',
        rich_text: { equals: sku.trim().toUpperCase() },
      },
      { property: 'Error', title: { equals: title.trim() } },
    ],
  };
  const pages = await queryDatabase(token, dbId, filter, 1);
  return pages.length > 0;
}

// The dedup query and the create must be one critical section. Without this,
// two pushes (single-SKU and batch) can both see "missing" and both create.
let listingWriteChain: Promise<unknown> = Promise.resolve();

function withListingWriteLock<T>(run: () => Promise<T>): Promise<T> {
  const next = listingWriteChain.then(run, run);
  listingWriteChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Create-only push with dedup. Duplicates in the batch are dropped locally,
 * existing rows are skipped (never updated), and every failure is reported with
 * its Notion status/code. Returns a per-title report.
 */
export function pushListingErrorPayloads(
  token: string,
  dbId: string,
  payloads: ListingErrorPayload[],
): Promise<PushReport> {
  return withListingWriteLock(async () => {
  const report: PushReport = {
    created: [],
    createdPageIds: {},
    skipped: [],
    skippedInBatch: [],
    failed: [],
    warnings: [],
  };
  const { unique, duplicates } = dedupePayloadsInBatch(payloads);
  report.skippedInBatch = duplicates.map((p) => p.title);

  // Validate the whole batch before the first create. A bad payload must not
  // leave earlier rows written.
  const preflight = preflightListingPayloads(unique);
  report.warnings.push(...preflight.warnings);
  if (preflight.failures.length > 0) {
    report.failed.push(...preflight.failures);
    return report;
  }

  const skus = [...new Set(unique.map((p) => p.sku.trim().toUpperCase()))];
  const existing = await loadExistingListingTitles(token, dbId, skus);

  for (const payload of unique) {
    try {
      const sku = payload.sku.trim().toUpperCase();
      const title = payload.title.trim();
      const known = existing.titles.get(sku);
      if (
        known?.has(title) ||
        (existing.truncated.has(sku) &&
          (await listingErrorExists(token, dbId, payload.sku, payload.title)))
      ) {
        report.skipped.push(payload.title);
        continue;
      }
      const page = await createNotionPage(token, {
        parent: { database_id: dbId },
        properties: payloadToProperties(payload),
      });
      known?.add(title);
      report.created.push(payload.title);
      if (page.id) report.createdPageIds[payload.title] = page.id;
    } catch (err) {
      report.failed.push(toFailure(payload, err));
    }
  }
  return report;
  });
}
