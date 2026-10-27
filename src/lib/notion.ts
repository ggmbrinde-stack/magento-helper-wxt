// Notion client — service-worker-only. The token must never reach a content
// script, page, log, or committed source (Build Plan rules).

const NOTION_VERSION = '2022-06-28';
export const DEFAULT_SKU_LIBRARY_DB = 'a14943ff-001c-471a-b5c5-9737060f7903';
export const DEFAULT_LISTING_ERRORS_DB = 'b66b7bba-175c-4460-b1e4-455334ec7141';

const NOTION_HOST = 'api.notion.com';
const NOTION_REQUEST_TIMEOUT_MS = 20_000;

/** Fetch with a hard per-request ceiling so one hung call cannot stall the queue. */
async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTION_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new NotionApiError(
        408,
        'timeout',
        `Notion request timed out after ${NOTION_REQUEST_TIMEOUT_MS / 1000}s`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Rule (board direction, updated 2026-10-19; body completion 2026-10-27):
// Listing Errors is CREATE-ONLY. The SKU Library has one separate, explicitly
// gated property-update path in skuLibraryWriter.ts, plus body completion for
// a newly created page or an existing page whose body is empty. Deletes and
// overwrites of non-empty pages are never allowed. Every Notion call goes
// through a guarded fetch:
//
//   readOnlyNotionFetch    - query / search / GET endpoints only.
//   createOnlyNotionFetch  - the above + POST /v1/pages (page creation).
//
// All other property updates, deletes, or block appends fail fast. Dedup BEFORE
// Listing Errors creation is the caller's job (see listingWriter.ts). The
// matching static guard lives in scripts/check-notion-readonly.mjs.
// ---------------------------------------------------------------------------

export class NotionWriteBlockedError extends Error {
  constructor(method: string, url: string) {
    super(`Notion request is not allowed: blocked ${method} ${url}`);
    this.name = 'NotionWriteBlockedError';
  }
}

/**
 * A non-OK Notion response, carrying the API's own `status` / `code` /
 * `message` (and `Retry-After` for 429s). Callers use `status` to decide
 * whether a failure is worth retrying and to surface a precise reason.
 */
export class NotionApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number;

  constructor(status: number, code: string, message: string, retryAfter = 0) {
    super(message || `Notion API error ${status}`);
    this.name = 'NotionApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/** Parse Notion's error body (`{ code, message }`) plus the Retry-After header. */
export async function notionApiError(
  response: Response,
  context: string,
): Promise<NotionApiError> {
  const retryHeader = Number(response.headers.get('retry-after'));
  const retryAfter = Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : 0;
  const text = await response.text().catch(() => '');
  let code = '';
  let message = '';
  try {
    const body = JSON.parse(text) as { code?: unknown; message?: unknown };
    if (typeof body.code === 'string') code = body.code;
    if (typeof body.message === 'string') message = body.message;
  } catch {
    message = text.slice(0, 300);
  }
  return new NotionApiError(
    response.status,
    code,
    message || `${context} failed (${response.status})`,
    retryAfter,
  );
}

/** True when a failed response is transient and worth retrying. */
function isRetryable(error: unknown): boolean {
  if (error instanceof NotionApiError) {
    return (
      error.status === 408 ||
      error.status === 429 ||
      (error.status >= 500 && error.status <= 599)
    );
  }
  const status =
    typeof error === 'object' && error !== null
      ? (error as { status?: unknown }).status
      : undefined;
  return (
    status === 408 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500)
  );
}

function notionPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/**
 * True only for the read endpoints this project deliberately uses.
 *
 * Notion's database query and search are POST endpoints that *read*, so the
 * method alone says nothing; the allowlist is by path plus method.
 */
function isReadOnlyNotionRequest(method: string, url: string): boolean {
  const upper = method.toUpperCase();
  const path = notionPath(url);
  if (upper === 'POST') {
    return (
      /^\/v1\/databases\/[^/]+\/query$/.test(path) ||
      /^\/v1\/search$/.test(path)
    );
  }
  if (upper === 'GET') {
    return /^\/v1\/(pages|blocks|databases|users)(\/[^/]+)*$/.test(path);
  }
  return false;
}

/** True for the read endpoints plus exactly one write: create a page. */
function isCreateOnlyNotionRequest(method: string, url: string, path: string): boolean {
  if (isReadOnlyNotionRequest(method, url)) return true;
  // Create-only: POST /v1/pages is the ONE allowed write.
  return method.toUpperCase() === 'POST' && path === '/v1/pages';
}

/** Fetch a Notion read endpoint, refusing anything that would write. */
export async function readOnlyNotionFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (
    !input.startsWith(`https://${NOTION_HOST}/`) ||
    !isReadOnlyNotionRequest(method, input)
  ) {
    throw new NotionWriteBlockedError(method, input);
  }
  return fetchWithTimeout(input, init);
}

/** Fetch a Notion read endpoint or create a page; refuse every other write. */
export async function createOnlyNotionFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (
    !input.startsWith(`https://${NOTION_HOST}/`) ||
    !isCreateOnlyNotionRequest(method, input, notionPath(input))
  ) {
    throw new NotionWriteBlockedError(method, input);
  }
  return fetchWithTimeout(input, init);
}

/**
 * Fetch a Notion read endpoint, create a page, or PATCH one page's properties.
 *
 * The PATCH allowance exists ONLY for the SKU Library writer
 * (src/lib/skuLibraryWriter.ts): property updates on an existing row, and body
 * completion for a newly created page or an existing page whose body is empty.
 * The static guard permits those paths only in that file. Every other write
 * (delete, schema edit, overwriting a non-empty page) still fails fast.
 */
export async function patchOnlyNotionFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const path = notionPath(input);
  const allowed =
    input.startsWith(`https://${NOTION_HOST}/`) &&
    (isCreateOnlyNotionRequest(method, input, path) ||
      (method === 'PATCH' && /^\/v1\/pages\/[^/]+$/.test(path)) ||
      (method === 'PATCH' && /^\/v1\/blocks\/[^/]+\/children$/.test(path)));
  if (!allowed) {
    throw new NotionWriteBlockedError(method, input);
  }
  return fetchWithTimeout(input, init);
}

export interface StoredSettings {
  notionToken: string;
  skuLibraryDb: string;
  listingErrorsDb: string;
  adminBaseUrl: string;
}

export async function loadSettings(): Promise<StoredSettings> {
  const data = await chrome.storage.local.get([
    'notionToken',
    'skuLibraryDb',
    'listingErrorsDb',
    'adminBaseUrl',
  ]);
  return {
    notionToken: (data.notionToken as string) || '',
    skuLibraryDb:
      (data.skuLibraryDb as string) || DEFAULT_SKU_LIBRARY_DB,
    listingErrorsDb:
      (data.listingErrorsDb as string) || DEFAULT_LISTING_ERRORS_DB,
    adminBaseUrl: (data.adminBaseUrl as string) || '',
  };
}

// ---------------------------------------------------------------------------
// Rate-limited queue. Notion allows ~3 requests/second; every call waits at
// least 400ms after the previous one, and 429s are retried with backoff.
// ---------------------------------------------------------------------------

interface QueueItem {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  retries: number;
}

const queue: QueueItem[] = [];
let pumping = false;
let lastCallAt = 0;

function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = (): void => {
    const item = queue.shift();
    if (!item) {
      pumping = false;
      return;
    }
    const wait = Math.max(0, 400 - (Date.now() - lastCallAt));
    setTimeout(() => {
      lastCallAt = Date.now();
      item
        .run()
        .then((v) => {
          item.resolve(v);
          step();
        })
        .catch((err: unknown) => {
          const retryAfter =
            err instanceof NotionApiError ? err.retryAfter : 0;
          if (isRetryable(err) && item.retries < 5) {
            item.retries += 1;
            queue.unshift(item);
            const base = Math.min(
              30_000,
              1000 * 2 ** (item.retries - 1),
            );
            const jitter = Math.floor(Math.random() * 250);
            const backoff = Math.max(retryAfter * 1000, base + jitter);
            setTimeout(step, backoff);
          } else {
            item.reject(err);
            step();
          }
        });
    }, wait);
  };
  step();
}

function enqueue(run: () => Promise<unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject, retries: 0 });
    pump();
  });
}

export function queued<T>(run: () => Promise<T>): Promise<T> {
  return enqueue(run) as Promise<T>;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface DatabaseQueryPage {
  results: unknown[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** One query page, including the cursor needed to continue (dedup safety). */
export async function queryDatabasePage(
  token: string,
  dbId: string,
  filter: unknown,
  pageSize = 20,
  startCursor?: string,
): Promise<DatabaseQueryPage> {
  const body: Record<string, unknown> = { page_size: pageSize };
  if (filter !== undefined) body.filter = filter;
  if (startCursor) body.start_cursor = startCursor;
  return queued(async () => {
    const response = await readOnlyNotionFetch(
      `https://api.notion.com/v1/databases/${dbId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw await notionApiError(response, 'queryDatabase');
    const json = (await response.json()) as {
      results?: unknown[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    return {
      results: json.results ?? [],
      hasMore: json.has_more === true,
      nextCursor: typeof json.next_cursor === 'string' ? json.next_cursor : null,
    };
  });
}

/** Single query page (callers that only need the first page). */
export async function queryDatabase(
  token: string,
  dbId: string,
  filter: unknown,
  pageSize = 20,
): Promise<unknown[]> {
  const page = await queryDatabasePage(token, dbId, filter, pageSize);
  return page.results;
}

/**
 * Read all pages, up to a visible ceiling. Callers that need completeness must
 * surface `truncated`; it is never silently treated as a full result.
 */
export async function queryAllDatabase(
  token: string,
  dbId: string,
  filter: unknown,
  pageSize = 100,
  maxPages = 10,
): Promise<{ results: unknown[]; truncated: boolean }> {
  const results: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await queryDatabasePage(
      token,
      dbId,
      filter,
      pageSize,
      cursor ?? undefined,
    );
    results.push(...batch.results);
    if (!batch.hasMore) return { results, truncated: false };
    if (!batch.nextCursor) return { results, truncated: true };
    cursor = batch.nextCursor;
  }
  return { results, truncated: true };
}

/** Read every top-level child block of a page (read-only, paginated). */
export async function listBlockChildren(
  token: string,
  blockId: string,
): Promise<unknown[]> {
  const results: unknown[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const batch = await queued(async () => {
      const url = new URL(
        `https://api.notion.com/v1/blocks/${blockId}/children`,
      );
      url.searchParams.set('page_size', '100');
      if (cursor) url.searchParams.set('start_cursor', cursor);
      const response = await readOnlyNotionFetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
        },
      });
      if (!response.ok) throw await notionApiError(response, 'listBlocks');
      return (await response.json()) as {
        results?: unknown[];
        has_more?: boolean;
        next_cursor?: string | null;
      };
    });
    results.push(...(batch.results ?? []));
    if (batch.has_more !== true) return results;
    if (typeof batch.next_cursor !== 'string') return results;
    cursor = batch.next_cursor;
  }
  return results;
}

/** Delete exactly one block; used only by the explicit body-repair path. */
export async function deleteBlockOnlyNotionFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const path = notionPath(input);
  const allowed =
    input.startsWith(`https://${NOTION_HOST}/`) &&
    method === 'DELETE' &&
    /^\/v1\/blocks\/[^/]+$/.test(path);
  if (!allowed) throw new NotionWriteBlockedError(method, input);
  return fetchWithTimeout(input, init);
}

/**
 * Read one database's schema (property names, types, select options). Read-only
 * GET; used by the connection health panel to validate the write contract before
 * any row is created. Never mutates the database.
 */
export async function getDatabase(
  token: string,
  dbId: string,
): Promise<unknown> {
  return queued(async () => {
    const response = await readOnlyNotionFetch(
      `https://api.notion.com/v1/databases/${dbId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
        },
      },
    );
    if (!response.ok) throw await notionApiError(response, 'getDatabase');
    return (await response.json()) as unknown;
  });
}

/**
 * Create ONE page (create-only write). The caller must dedup first. Returns the
 * created page id. Never updates or appends: the body carries `properties` (and
 * optionally `children`, kept blank by the Listing Errors contract).
 */
export async function createNotionPage(
  token: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = (await queued(async () => {
    const response = await createOnlyNotionFetch(
      'https://api.notion.com/v1/pages',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw await notionApiError(response, 'createPage');
    return (await response.json()) as { id?: string };
  })) as { id?: string };
  return { id: res.id ?? '' };
}

// ---------------------------------------------------------------------------
// Notion property extraction. Mirrors the property shapes the two live
// databases use today (title / rich_text / select / multi_select / url / date).
// ---------------------------------------------------------------------------

type Prop = Record<string, unknown> | undefined;

function joinPlainText(arr: unknown): string {
  if (!Array.isArray(arr)) return '';
  return arr
    .map((t) => {
      const text = (t as { plain_text?: string }).plain_text;
      return typeof text === 'string' ? text : '';
    })
    .join('');
}

export function extractTitle(prop: Prop): string {
  if (!prop || !Array.isArray(prop.title)) return '';
  return joinPlainText(prop.title);
}

export function extractRichText(prop: Prop): string {
  if (!prop || !Array.isArray(prop.rich_text)) return '';
  return joinPlainText(prop.rich_text);
}

export function extractSelect(prop: Prop): string {
  const select = prop?.select as { name?: string } | null | undefined;
  return select && typeof select.name === 'string' ? select.name : '';
}

export function extractMultiSelect(prop: Prop): string[] {
  if (!prop || !Array.isArray(prop.multi_select)) return [];
  return prop.multi_select
    .map((s) => (s as { name?: string }).name)
    .filter((n): n is string => typeof n === 'string');
}

export function extractUrl(prop: Prop): string {
  const url = prop?.url;
  return typeof url === 'string' ? url : '';
}

export function extractDate(prop: Prop): string {
  const date = prop?.date as { start?: string } | null | undefined;
  return date && typeof date.start === 'string' ? date.start : '';
}

export type NotionPage = { properties: Record<string, Prop> };

function propsOf(page: unknown): Record<string, Prop> {
  const props = (page as { properties?: Record<string, unknown> })
    .properties;
  if (!props) return {};
  const out: Record<string, Prop> = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = value as Prop;
  }
  return out;
}

/** Raw (unvalidated) row for the SKU Library database. */
export function mapSkuLibraryPage(page: unknown): Record<string, unknown> {
  const p = propsOf(page);
  return {
    id: (page as { id?: string }).id ?? '',
    sku: extractTitle(p.SKU),
    backend: extractUrl(p.Backend),
    frontend: extractUrl(p.Frontend),
    category: extractSelect(p.Category),
    subcategory: extractSelect(p.Subcategory),
    supplier: extractSelect(p.Supplier),
    supplierLink: extractUrl(p['Supplier Link']),
    supplierProduct: extractUrl(p['Supplier Product']),
    colors: extractRichText(p.Colors),
    sizes: extractRichText(p.Sizes),
    missingCombos: extractRichText(p['Missing combos']),
    status: extractSelect(p.Status),
    lastAudit: extractDate(p['Last audit']),
  };
}

/** Raw (unvalidated) row for the Listing Errors database. */
export function mapListingErrorPage(page: unknown): Record<string, unknown> {
  const p = propsOf(page);
  return {
    id: (page as { id?: string }).id ?? '',
    title: extractTitle(p.Error),
    sku: extractRichText(p.SKU),
    errorGroup: extractMultiSelect(p['Error Group']),
    errorType: extractMultiSelect(p['Error Type']),
    field: extractSelect(p.Field),
    language: extractSelect(p.Language),
    fixLocation: extractSelect(p['Fix Location']),
    priority: extractSelect(p.Priority),
    status: extractSelect(p.Status),
    link: extractUrl(p.Link),
    notes: extractRichText(p.Notes),
    source: extractSelect(p.Source),
    supplier: extractSelect(p.Supplier),
    brand: extractSelect(p.Brand),
    csvRow: extractRichText(p['CSV Row']),
  };
}
