import {
  getDatabase, loadSettings, queryDatabasePage, listBlockChildrenPage, NotionApiError,
} from '../shared/notion/client';
import {
  PP_CATALOG_DATABASE, type PpCatalogDefinition, type PpCatalogResponse,
  type PpCatalogIndexPage,
} from '../shared/ppCatalog';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

function text(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const parts = value.map(item => {
    const part = record(item);
    return typeof part.plain_text === 'string' ? part.plain_text : record(part.text).content;
  });
  return parts.every(part => typeof part === 'string') ? parts.join('') : null;
}

/** Summaries only. The dashboard schedules bounded pages after an explicit click. */
export async function loadPpCatalogIndexPage(cursor?: unknown): Promise<PpCatalogIndexPage> {
  const failure = (status: PpCatalogIndexPage['status'], reason: string): PpCatalogIndexPage =>
    ({ status, rows: [], hasMore: false, nextCursor: null, checkedAt: new Date().toISOString(), reason });
  if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 512)) {
    return failure('invalid', 'The catalogue cursor is invalid. Reload the catalogue.');
  }
  try {
    const { notionToken } = await loadSettings();
    if (!notionToken) return failure('auth', 'Configure the existing Notion integration in Settings.');
    const properties = record(record(await getDatabase(notionToken, PP_CATALOG_DATABASE)).properties);
    if (record(properties['Código PP']).type !== 'rich_text' || record(properties.PP).type !== 'title') {
      return failure('unavailable', 'Catalogue schema incompatible: Código PP must be rich text and PP must be title.');
    }
    const page = await queryDatabasePage(notionToken, PP_CATALOG_DATABASE, undefined, 100, cursor as string | undefined);
    if (page.results.length > 100) return failure('unavailable', 'The catalogue page exceeded the supported page size.');
    return { status: 'page', rows: page.results.map(value => {
      const row = record(value), props = record(row.properties), review = record(props.Estado);
      const reviewName = record(review[review.type === 'status' ? 'status' : 'select']).name;
      return { pageId: typeof row.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) ? row.id : null,
        code: text(record(props['Código PP']).rich_text), name: text(record(props.PP).title),
        reviewStatus: typeof reviewName === 'string' ? reviewName : null };
    }), hasMore: page.hasMore, nextCursor: page.nextCursor, checkedAt: new Date().toISOString(),
    reason: 'Summary page read. Uniqueness and completeness depend on the remaining pages.' };
  } catch (error) {
    if (error instanceof NotionApiError) {
      if (error.status === 401) return failure('auth', 'Notion authentication failed. Check Settings.');
      if (error.status === 403 || error.status === 404) return failure('access', 'The integration cannot access PP Catalog V2.');
      if (error.status === 400 || error.code === 'invalid_response') return failure('unavailable', 'Catalogue API or schema response is incompatible.');
    }
    return failure('network', 'The catalogue read failed. Loaded rows remain incomplete; retry explicitly.');
  }
}

function labels(value: unknown): string[] | null {
  const prop = record(value);
  if (prop.type !== 'multi_select' || !Array.isArray(prop.multi_select)) return null;
  const values = prop.multi_select.map(item => record(item).name);
  return values.every(item => typeof item === 'string') ? values as string[] : null;
}

function count(value: unknown): number | null {
  const prop = record(value);
  return prop.type === 'number' && typeof prop.number === 'number' && Number.isFinite(prop.number)
    ? prop.number : null;
}

/** Only the selected page's body, with explicit coverage limits and no inference. */
async function readBody(token: string, pageId: string): Promise<{ lines: string[]; partial: boolean }> {
  const lines: string[] = [];
  let requests = 0;
  let blocks = 0;
  let characters = 0;
  let partial = false;
  const visit = async (id: string, depth: number): Promise<void> => {
    let cursor: string | undefined;
    do {
      if (requests >= 8 || blocks >= 400 || characters >= 12000) { partial = true; return; }
      const page = await listBlockChildrenPage(token, id, cursor);
      requests++;
      for (const raw of page.results) {
        if (++blocks > 400 || characters >= 12000) { partial = true; return; }
        const block = record(raw);
        const value = record(block[String(block.type)]);
        let line = text(value.rich_text);
        if (typeof block.type !== 'string' || ('rich_text' in value && line === null)) partial = true;
        // Only known containers and dividers can legitimately omit readable text.
        if (block.type === 'unsupported' || (line === null && block.type !== 'table_row' &&
          !['table', 'column_list', 'column', 'divider'].includes(String(block.type)))) partial = true;
        if (block.type === 'table_row' && !Array.isArray(value.cells)) partial = true;
        if (block.type === 'table_row' && Array.isArray(value.cells)) {
          const cells = value.cells.map(text);
          if (cells.some(cell => cell === null)) partial = true;
          line = cells.map(cell => cell ?? '[Unreadable cell]').join(' | ');
        }
        if (line) {
          const remaining = 12000 - characters;
          lines.push(line.slice(0, remaining));
          characters += Math.min(line.length, remaining);
          if (line.length > remaining) partial = true;
        }
        if (block.has_children === true) {
          if (depth >= 3 || typeof block.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(block.id)) partial = true;
          else await visit(block.id, depth + 1);
        }
      }
      if (!page.hasMore) return;
      if (!page.nextCursor || page.nextCursor === cursor) { partial = true; return; }
      cursor = page.nextCursor;
    } while (true);
  };
  await visit(pageId, 0);
  return { lines, partial };
}

/** User-triggered reference lookup. Uses the existing worker-only credential path. */
export async function loadPpCatalog(code: unknown): Promise<PpCatalogResponse> {
  const rawCode = typeof code === 'string' ? code : '';
  const result = (status: PpCatalogResponse['status'], reason: string, definition?: PpCatalogDefinition): PpCatalogResponse => ({
    status, code: rawCode, checkedAt: new Date().toISOString(), reason,
    ...(definition ? { definition } : {}),
  });
  if (typeof code !== 'string' || !code.trim() || code.length > 128) {
    return result('invalid', 'Enter the exact business PP text (1 to 128 characters).');
  }
  let definition: PpCatalogDefinition | undefined;
  try {
    const { notionToken } = await loadSettings();
    if (!notionToken) return result('auth', 'Configure the existing Notion integration token in Settings first.');
    const database = record(await getDatabase(notionToken, PP_CATALOG_DATABASE));
    const properties = record(database.properties);
    const codeSchema = record(properties['Código PP']);
    if (codeSchema.type !== 'rich_text' || record(properties.PP).type !== 'title') {
      return result('unavailable', 'The catalogue schema is unavailable or incompatible: Código PP must be rich text and PP must be the title.');
    }
    const page = await queryDatabasePage(notionToken, PP_CATALOG_DATABASE,
      { property: 'Código PP', rich_text: { equals: code } }, 2);
    if (page.results.length > 1) return result('multiple', 'Multiple catalogue records matched. No reference was selected.');
    if (page.hasMore) return result('partial', 'The exact lookup was incomplete. A unique match cannot be established.');
    const candidate = page.results[0];
    if (!candidate) return result('not-found', 'No catalogue record matched this exact text. No aliases were tried.');
    const row = record(candidate);
    const props = record(row.properties);
    const matchedCode = text(record(props['Código PP']).rich_text);
    const name = text(record(props.PP).title);
    if (matchedCode !== code || name === null || typeof row.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)) {
      return result('partial', 'The returned identity or title could not be verified exactly. No reference was selected.');
    }
    const review = record(props.Estado);
    const reviewName = record(review[review.type === 'status' ? 'status' : 'select']).name;
    definition = {
      pageId: row.id, code, name,
      reviewStatus: typeof reviewName === 'string' ? reviewName : null,
      faces: labels(props.Faces), options: labels(props['Opções de personalização']),
      techniques: labels(props['Técnicas']),
      faceCount: count(props['Número de faces']), locationCount: count(props['Número de locais possíveis']),
      body: [],
      warnings: [
        'Global faces, techniques and options do not establish assignments to each location.',
        'Missing, blank or unclear fields are unknown, never instructions to remove or overwrite Magento data.',
      ],
      lastEditedAt: typeof row.last_edited_time === 'string' ? row.last_edited_time : null,
    };
    const body = await readBody(notionToken, row.id);
    definition.body = body.lines;
    if (!body.lines.length) definition.warnings.push('No readable body text was available; location-specific details remain unknown.');
    if (body.partial) definition.warnings.push('Body coverage is incomplete: unreadable content or a coverage limit was encountered.');
    return result(body.partial ? 'partial' : 'found', body.partial
      ? 'Reference loaded with incomplete body coverage.' : 'Reference loaded from Notion. Review its status and uncertainties.', definition);
  } catch (error) {
    if (error instanceof NotionApiError) {
      if (error.status === 401) return result('auth', 'Notion authentication failed. Check the existing integration in Settings.', definition);
      if (error.status === 403 || error.status === 404) return result('access', 'The integration cannot access the copied catalogue or its page body. Connector access does not grant extension access.', definition);
      if (error.status === 400 || error.code === 'invalid_response') return result('unavailable', 'The catalogue API or schema is incompatible with the existing client.', definition);
    }
    return result('network', 'The Notion lookup could not complete. Retry explicitly; no Magento data was changed.', definition);
  }
}
