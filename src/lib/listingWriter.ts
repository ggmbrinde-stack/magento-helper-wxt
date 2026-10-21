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

import { createNotionPage, NotionApiError, queryDatabase } from './notion';
import {
  KNOWN_TYPES,
  normalizeType,
  type ListingErrorPayload,
} from './payload';

/** The Notion Listing Errors DB's closed Error Type options. */
export const NOTION_ERROR_TYPE_OPTIONS = [
  'Wrong image order',
  'Remove Model image',
  'Duplicate image',
  'Grey background',
  'Missing image',
  'Translation error',
  'Wrong product information',
  'Wrong category',
  'Other',
  'Model image on simple',
  'Printing instruction sheet',
  'Text on image',
];

/** Error Group is a closed multi-select; anything else must be folded. */
export const NOTION_GROUP_OPTIONS = [
  'Images',
  'Text / Translation',
  'Product Information',
  'Category',
  'Other',
];

export const NOTION_FLAG_OPTIONS = ['Normal', 'Complex'];
export const NOTION_STATUS_OPTIONS = ['To Fix'];
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
  if (!NOTION_GROUP_OPTIONS.includes(payload.group)) {
    throw new PayloadValidationError(
      'group',
      `unknown Error Group "${payload.group}" (expected one of ${NOTION_GROUP_OPTIONS.join(', ')})`,
    );
  }
  const folded = foldErrorType(payload);
  if (!NOTION_ERROR_TYPE_OPTIONS.includes(folded)) {
    throw new PayloadValidationError(
      'type',
      `Error Type "${folded}" is not a DB option`,
    );
  }
  if (!NOTION_FLAG_OPTIONS.includes(payload.flag)) {
    throw new PayloadValidationError(
      'flag',
      `unknown Error Flag "${payload.flag}" (expected ${NOTION_FLAG_OPTIONS.join('/')})`,
    );
  }
  if (!NOTION_STATUS_OPTIONS.includes(payload.status)) {
    throw new PayloadValidationError(
      'status',
      `unexpected Status "${payload.status}" (writer only creates "To Fix")`,
    );
  }
  if (!payload.language.trim()) {
    throw new PayloadValidationError('language', 'Language is empty');
  }
  if (!payload.source.trim()) {
    throw new PayloadValidationError('source', 'Source is empty');
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
  if (payload.supplier) props.Supplier = { select: { name: payload.supplier } };
  if (payload.priority) props.Priority = { select: { name: payload.priority } };
  if (payload.fix_location) {
    props['Fix Location'] = { select: { name: payload.fix_location } };
  }
  if (payload.link) props.Link = { url: payload.link };
  if (payload.fix) props.Fix = { rich_text: richText(payload.fix) };
  if (payload.category) props.Category = { select: { name: payload.category } };
  if (payload.subcategory) {
    props.Subcategory = { select: { name: payload.subcategory } };
  }
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

/**
 * Create-only push with dedup. Duplicates in the batch are dropped locally,
 * existing rows are skipped (never updated), and every failure is reported with
 * its Notion status/code. Returns a per-title report.
 */
export async function pushListingErrorPayloads(
  token: string,
  dbId: string,
  payloads: ListingErrorPayload[],
): Promise<PushReport> {
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

  for (const payload of unique) {
    try {
      assertWritablePayload(payload);
      report.warnings.push(...payloadWarnings(payload));
      if (
        await listingErrorExists(token, dbId, payload.sku, payload.title)
      ) {
        report.skipped.push(payload.title);
        continue;
      }
      const page = await createNotionPage(token, {
        parent: { database_id: dbId },
        properties: payloadToProperties(payload),
      });
      report.created.push(payload.title);
      if (page.id) report.createdPageIds[payload.title] = page.id;
    } catch (err) {
      report.failed.push(toFailure(payload, err));
    }
  }
  return report;
}
