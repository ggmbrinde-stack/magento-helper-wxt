import type { PpPreviewTab, ScanPpDraftResponse, ReadPpPreviewDraftResponse } from '../../../core/messages';
import { ppCatalogEntity, PpCatalogResponseSchema, type PpCatalogResponse } from '../../../shared/ppCatalog';
import { PpCatalogIndexPageSchema, type PpCatalogIndexRow } from '../../../shared/ppCatalog';

export function isPpPreviewTab(value: unknown): value is PpPreviewTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as PpPreviewTab;
  return Number.isInteger(tab.tabId) && tab.tabId >= 0 && typeof tab.host === 'string' &&
    typeof tab.entityId === 'string' && /^\d+$/.test(tab.entityId) &&
    tab.routePath === `/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/${tab.entityId}` &&
    ppCatalogEntity(`https://${tab.host}${tab.routePath}`) === tab.entityId &&
    typeof tab.selectionToken === 'string' && /^[a-f0-9]{64}$/.test(tab.selectionToken);
}

export function catalogProblems(rows: PpCatalogIndexRow[]): (string | null)[] {
  const counts = new Map<string, number>();
  for (const row of rows) if (row.code !== null) counts.set(row.code, (counts.get(row.code) ?? 0) + 1);
  return rows.map(row => {
    if (!row.pageId) return 'Missing or invalid Notion page ID';
    if (row.code === null || !row.code.trim()) return 'Missing business code';
    if (row.code.length > 128) return 'Unsupported business code length';
    if ((counts.get(row.code) ?? 0) > 1) return 'Duplicate exact business code';
    if (row.name === null) return 'Unreadable title';
    return null;
  });
}

export interface PpIndexLoad {
  rows: PpCatalogIndexRow[];
  coverage: 'complete' | 'partial' | 'cancelled' | 'error';
  reason: string;
  checkedAt?: string;
}

/** One page at a time; stopping never schedules another queued Notion request. */
export async function loadPpIndex(
  fetchPage: (cursor?: string) => Promise<unknown>,
  progress: (rows: PpCatalogIndexRow[], checkedAt: string) => void,
  stopped: () => boolean,
): Promise<PpIndexLoad> {
  const rows: PpCatalogIndexRow[] = [], cursors = new Set<string>(), ids = new Set<string>();
  let cursor: string | undefined, checkedAt: string | undefined;
  const deadline = Date.now() + 60_000;
  const result = (coverage: PpIndexLoad['coverage'], reason: string): PpIndexLoad => ({ rows, coverage, reason, checkedAt });
  try {
    for (let page = 0; page < 50; page++) {
      if (stopped()) return result('cancelled', 'Catalogue load stopped. An in-flight request may finish; no further pages will be requested.');
      if (Date.now() >= deadline) return result('partial', 'Catalogue time limit reached. Coverage is incomplete.');
      const raw = await fetchPage(cursor);
      if (stopped()) return result('cancelled', 'Catalogue load stopped. Coverage is incomplete.');
      if (Date.now() >= deadline) return result('partial', 'Catalogue time limit reached. Coverage is incomplete.');
      const parsed = PpCatalogIndexPageSchema.safeParse(raw);
      if (!parsed.success) return result('partial', 'Invalid catalogue page. Coverage is incomplete.');
      const response = parsed.data;
      if (response.status !== 'page') return result(rows.length ? 'partial' : 'error', response.reason);
      for (const row of response.rows) {
        if (row.pageId && ids.has(row.pageId)) return result('partial', 'Repeated Notion record identity. Reload the incomplete catalogue.');
        if (row.pageId) ids.add(row.pageId);
        rows.push(row);
      }
      checkedAt = response.checkedAt; progress([...rows], checkedAt);
      if (!response.hasMore) return result('complete', 'All catalogue pages were read. Duplicate and missing identities still require review.');
      if (!response.nextCursor || cursors.has(response.nextCursor)) return result('partial', 'Missing or repeated catalogue cursor. Coverage is incomplete.');
      cursors.add(response.nextCursor); cursor = response.nextCursor;
    }
    return result('partial', 'Catalogue coverage limit reached (50 pages / 5,000 rows). The list is incomplete.');
  } catch { return result(rows.length ? 'partial' : 'error', 'Catalogue request failed. Reload explicitly; coverage is incomplete.'); }
}

export function readPreviewResponses(code: string, selected: PpPreviewTab, rawDesired: unknown, rawCurrent: unknown): {
  desired: PpCatalogResponse; current: ReadPpPreviewDraftResponse;
} {
  const parsed = PpCatalogResponseSchema.safeParse(rawDesired);
  if (!parsed.success || parsed.data.code !== code ||
    (parsed.data.definition && parsed.data.definition.code !== code)) throw new Error('The Notion response does not match the exact business code. Read again.');
  const current = rawCurrent as ReadPpPreviewDraftResponse | null;
  if (!current || typeof current.ok !== 'boolean') throw new Error('The draft response is invalid. Read again.');
  if (!current.ok) {
    if (typeof current.reason !== 'string') throw new Error('The draft response is invalid. Read again.');
  } else {
    const draft = current.snapshot;
    if (!isPpPreviewTab(current.tab) || current.tab.tabId !== selected.tabId ||
      current.tab.selectionToken !== selected.selectionToken || current.tab.entityId !== selected.entityId ||
      current.tab.host !== selected.host || !draft || draft.version !== 1 ||
      draft.entityId !== selected.entityId || draft.routePath !== selected.routePath ||
      !['ok', 'partial', 'unavailable', 'identity-mismatch'].includes(draft.status) ||
      !draft.general || typeof draft.general !== 'object' || Array.isArray(draft.general) ||
      !Array.isArray(draft.warnings) || !draft.warnings.every(w => typeof w === 'string') ||
      ![draft.locations, draft.items].every(c => c && ['available', 'missing', 'invalid'].includes(c.state) && Array.isArray(c.rows))) {
      throw new Error('The draft response does not match the selected tab. List tabs and select it again.');
    }
  }
  return { desired: parsed.data, current };
}

export function attributeSetConsistency(draft: ScanPpDraftResponse): 'matching' | 'different' | 'unknown' {
  const provider = draft.providerAttributeSetId;
  const general = draft.generalAttributeSetId;
  const isId = (id: unknown): id is string | number =>
    (typeof id === 'string' && /^\d+$/.test(id)) || (typeof id === 'number' && Number.isInteger(id) && id >= 0);
  if (!isId(provider) || !Array.isArray(general) || !general.length || !general.every(isId)) return 'unknown';
  return general.length === 1 && String(general[0]) === String(provider) ? 'matching' : 'different';
}

/** Reference rows only: the V2 global lists do not define native field assignments. */
export function ppPreviewRows(desired: PpCatalogResponse, current: ScanPpDraftResponse) {
  const definition = desired.definition;
  if (!definition || !['found', 'partial'].includes(desired.status) || !['ok', 'partial'].includes(current.status)) return [];
  return [
    { field: 'Titles', current: current.general.option_title, desired: definition.name,
      reason: 'The Notion PP title is not an established mapping to the Magento general title.' },
    { field: 'Locations / faces', current: current.locations, desired: { faces: definition.faces,
      faceCount: definition.faceCount, locationCount: definition.locationCount },
      reason: 'Global faces and possible-location counts do not identify Magento location rows or their translations.' },
    { field: 'Options / techniques', current: current.items, desired: { options: definition.options, techniques: definition.techniques },
      reason: 'No per-location assignment or Magento catalogue ID mapping is established. Raw parent values are not Notion assignments.' },
    { field: 'Other general fields / translations', current: { general: current.general, translations: current.generalTranslations },
      desired: undefined, reason: 'No supported desired native-field mapping. Missing or blank values never request deletion.' },
  ];
}
