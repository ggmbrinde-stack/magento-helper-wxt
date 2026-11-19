import type { PpPreviewTab, ScanPpDraftResponse, ReadPpPreviewDraftResponse } from '../../../core/messages';
import type { PpCatalogDefinition } from '../../../shared/ppCatalog';
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

/** Store ids observed on the native custom-option form. */
export const PP_STORE_LANGUAGES: readonly (readonly [string, string])[] = [
  ['1', 'PT'], ['2', 'EN'], ['4', 'ES'], ['5', 'FR'], ['6', 'DE'], ['7', 'IT'],
];

export function ppLanguage(store: string): string {
  const known = PP_STORE_LANGUAGES.find(([id]) => id === store);
  return known ? known[1] : store ? `store ${store}` : '';
}

const ppRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function ppText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Keep the difference between an absent value and an explicitly blank one visible. */
export function ppCell(value: unknown): string {
  if (value === undefined || value === null) return '(not supplied)';
  const text = ppText(value);
  return text === '' ? '(blank)' : text;
}

/** Name fields hold JSON keyed by store id; unparsable text contributes nothing. */
export function ppStoreValues(value: unknown): Record<string, string> {
  let source: unknown = value;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { source = JSON.parse(value); } catch { source = undefined; }
  }
  if (!ppRecord(source)) return {};
  const out: Record<string, string> = {};
  for (const [store, text] of Object.entries(source)) {
    const read = ppText(text);
    if (read) out[store] = read;
  }
  return out;
}

export function ppPreferredName(value: unknown): string {
  const values = ppStoreValues(value);
  if (values['1']) return values['1'];
  const first = Object.values(values).find(text => text.trim() !== '');
  if (first) return first;
  return typeof value === 'string' && !value.trim().startsWith('{') ? value.trim() : '';
}

export interface PpFaceRow {
  position: number;
  name: string;
  keyId: string;
  sort: string;
  price: string;
  translations: Record<string, string>;
}

export function ppFaceRows(snapshot: ScanPpDraftResponse): PpFaceRow[] {
  return snapshot.locations.rows.map(row => ({
    position: row.position,
    name: ppPreferredName(row.translations?.name?.parsed ?? row.values.name),
    keyId: ppText(row.values.key_id),
    sort: ppText(row.values.sort),
    price: ppText(row.values.price),
    translations: ppStoreValues(row.translations?.name?.parsed ?? row.values.name),
  }));
}

export interface PpOptionRow {
  position: number;
  face: string;
  catalogueId: string;
  label: string;
  sort: string;
  store: string;
}

export function ppOptionRows(snapshot: ScanPpDraftResponse): PpOptionRow[] {
  const faces = new Map<string, string>();
  for (const row of snapshot.locations.rows) {
    const key = ppText(row.values.key_id);
    if (key) faces.set(key, ppPreferredName(row.translations?.name?.parsed ?? row.values.name));
  }
  return snapshot.items.rows.map(row => {
    const parent = ppText(row.values.parent);
    return {
      position: row.position,
      face: faces.get(parent) || (parent ? '(face ' + parent + ')' : '(no parent)'),
      catalogueId: ppText(row.values.name_option ?? row.values.name),
      label: ppText(snapshot.itemLabels?.[ppText(row.values.record_id) || String(row.position)]),
      sort: ppText(row.values.sort),
      store: ppText(row.values.store_view),
    };
  });
}

export interface PpSnapshotSummary {
  faces: number;
  options: number;
  languages: string[];
  warnings: number;
  attributeSet: string;
}

export function ppSnapshotSummary(snapshot: ScanPpDraftResponse): PpSnapshotSummary {
  const present = new Set<string>();
  for (const face of ppFaceRows(snapshot)) for (const store of Object.keys(face.translations)) present.add(store);
  const languages = PP_STORE_LANGUAGES.map(([store, label]) => present.has(store) ? label : '').filter(Boolean);
  for (const store of present) if (!PP_STORE_LANGUAGES.some(([id]) => id === store)) languages.push(ppLanguage(store));
  return {
    faces: snapshot.locations.rows.length,
    options: snapshot.items.rows.length,
    languages,
    warnings: snapshot.warnings.length,
    attributeSet: ppText(snapshot.providerAttributeSetId),
  };
}

const ppCount = (count: number, singular: string, plural: string): string =>
  count === 1 ? `1 ${singular}` : `${count} ${plural}`;

const ppList = (values: string[] | null | undefined): string => {
  const list = (values ?? []).map(value => value.trim()).filter(Boolean);
  return list.length ? list.join(' · ') : '(not supplied)';
};

/** The Notion lists are global to the PP, so they are shown beside Magento rows and never paired. */
export function ppNotionLists(definition: PpCatalogDefinition): { faces: string; options: string; techniques: string } {
  return { faces: ppList(definition.faces), options: ppList(definition.options), techniques: ppList(definition.techniques) };
}

export interface PpReferenceRow { field: string; magento: string; notion: string }

/** Both sides show their own values. The rows carry no mapping and no executable change. */
export function ppPreviewRows(desired: PpCatalogResponse, current: ScanPpDraftResponse): PpReferenceRow[] {
  const definition = desired.definition;
  if (!definition || !['found', 'partial'].includes(desired.status) || !['ok', 'partial'].includes(current.status)) return [];
  const summary = ppSnapshotSummary(current);
  const faces = ppFaceRows(current), options = ppOptionRows(current);
  const faceText = faces.length ? faces.map(face => {
    const translated = PP_STORE_LANGUAGES
      .map(([store, label]) => face.translations[store] ? label + ' ' + face.translations[store] : '')
      .filter(Boolean).join(', ');
    return translated ? (face.name || '(blank)') + ': ' + translated : (face.name || '(blank)');
  }).join(' | ') : '(no face rows)';
  const optionText = options.length ? options.map(option =>
    '#' + option.position + ' ' + (option.label || '(label not read)') + ', catalogue id ' +
    (option.catalogueId || '(blank)') + ', parent ' + option.face,
  ).join(' | ') : '(no option rows)';
  const notion = ppNotionLists(definition);
  return [
    { field: 'Title', magento: ppCell(current.general.option_title), notion: definition.name || '(not supplied)' },
    { field: 'Faces (locations)', magento: faceText,
      notion: definition.faceCount === null ? notion.faces : notion.faces + ' · ' + ppCount(definition.faceCount, 'face', 'faces') },
    { field: 'Option rows', magento: optionText, notion: notion.options },
    { field: 'Techniques', magento: '(no native Magento field)', notion: notion.techniques },
    { field: 'Languages and other fields',
      magento: (summary.languages.join(', ') || '(none)') + ' · ' + ppCount(summary.warnings, 'warning', 'warnings'),
      notion: definition.body.length ? definition.body.length + ' body line(s) in the reference' : '(not supplied)' },
  ];
}

/** Notion body tables pair a face label with the options written for that face. */
export function ppLocationRows(definition: PpCatalogDefinition): Array<{ face: string; options: string[] }> {
  const rows: Array<{ face: string; options: string[] }> = [];
  const index = new Map<string, number>();
  let inTable = false, columns = 0;
  for (const line of definition.body) {
    const text = String(line);
    const cut = text.indexOf('|');
    if (cut < 0) { inTable = false; continue; }
    const face = text.slice(0, cut).trim();
    if (ppNormal(face) === 'facelocal') { columns = text.split('|').length; inTable = true; continue; }
    if (!inTable) continue;
    if (!face) continue;
    // Option labels carry their own pipe ("... BLOCOS PEQUENOS | OUTROS"), so the row cannot be
    // split into columns on every pipe: the cut lands inside a label and silently drops the rest
    // of the cell. When the header declares a Notes column, the text after the last pipe is that
    // note; otherwise only an empty trailing pipe is cropped.
    let cell = text.slice(cut + 1);
    const lastCut = cell.lastIndexOf('|');
    if (columns >= 3 && lastCut >= 0) cell = cell.slice(0, lastCut);
    else cell = cell.replace(/\s*\|\s*$/, '');
    const options = cell.split(';').join('\n').split('\n')
      .map(value => value.trim()).filter(Boolean);
    const key = ppFaceKey(face);
    const existing = index.get(key);
    if (existing === undefined) { index.set(key, rows.length); rows.push({ face, options }); }
    else rows[existing]!.options.push(...options);
  }
  return rows;
}

/** Lowercase letters and digits only, so accents, spaces and punctuation do not block a match. */
const ppNormal = (value: string): string => {
  let out = '';
  for (const char of String(value ?? '').normalize('NFD')) {
    const lower = (char >= 'A' && char <= 'Z') ? char.toLowerCase() : char;
    if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) out += lower;
  }
  return out;
};

/** Word order matters: "Face 1 Artigo" and "Artigo Face 1" are different faces. */
const ppFaceKey = (value: string): string => {
  const tokens: string[] = [];
  let current = '';
  for (const char of String(value ?? '').normalize('NFD')) {
    const lower = (char >= 'A' && char <= 'Z') ? char.toLowerCase() : char;
    if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) current += lower;
    else { if (current) { tokens.push(current); current = ''; } }
  }
  if (current) tokens.push(current);
  return tokens.join(' ');
};

export type PpPlanAction = 'add' | 'present' | 'review';

export interface PpPlanRow {
  face: string; magentoFace: string; technique: string;
  catalogueId: string; action: PpPlanAction; note: string;
}

export interface PpUpdatePlan {
  rows: PpPlanRow[]; add: number; present: number; review: number;
  locations: number; unlistedItems: number; catalogueSize: number;
}

/** Read-only plan. It proposes additions only and never proposes a removal. */
export function ppUpdatePlan(desired: PpCatalogResponse, current: ScanPpDraftResponse): PpUpdatePlan | null {
  const definition = desired.definition;
  if (!definition || !['found', 'partial'].includes(desired.status) || !['ok', 'partial'].includes(current.status)) return null;
  const catalogue = current.catalogue ?? [];
  const locations = ppLocationRows(definition);
  if (!locations.length) return null;
  const faces = ppFaceRows(current);
  const options = ppOptionRows(current);
  const rows: PpPlanRow[] = [];
  // A face can hold the same technique more than once, and so can the Notion list, so every
  // planned occurrence is matched to its own row on the face. One stored copy satisfies one
  // occurrence only; the next occurrence of the same technique is still proposed for adding.
  const taken = new Map<string, Map<string, number>>();
  const reuseExisting = (faceName: string, catalogueId: string, available: number): boolean => {
    let counts = taken.get(faceName);
    if (!counts) { counts = new Map(); taken.set(faceName, counts); }
    const used = counts.get(catalogueId) ?? 0;
    if (used >= available) return false;
    counts.set(catalogueId, used + 1);
    return true;
  };
  for (const location of locations) {
    // A location with no usable Magento name cannot be written safely, so it stays for review.
    const face = faces.find(candidate => !!candidate.name && ppFaceKey(candidate.name) === ppFaceKey(location.face));
    const magentoFace = face ? (face.name || '(blank)') : '(not found)';
    const onFace = face ? options.filter(option => option.face === face.name) : [];
    for (const technique of location.options) {
      const key = ppNormal(technique);
      const exact = catalogue.filter(entry => ppNormal(entry.label) === key);
      let action: PpPlanAction = 'add';
      let id = '';
      let note = '';
      if (exact.length === 1 && exact[0]) {
        id = exact[0].id;
      } else if (exact.length > 1) {
        action = 'review'; note = 'several catalogue entries share this label';
        id = exact.map(entry => entry.id).join(', ');
      } else {
        const partial = catalogue.filter(entry => {
          const label = ppNormal(entry.label);
          return label.startsWith(key) || key.startsWith(label);
        });
        if (partial.length === 1 && partial[0]) {
          id = partial[0].id; action = 'review'; note = 'catalogue label has extra text';
        } else if (partial.length > 1) {
          action = 'review'; note = 'several catalogue labels start with this text';
          id = partial.slice(0, 5).map(entry => entry.id + ' ' + entry.label).join(' | ');
        } else if (!catalogue.length) {
          action = 'review'; note = 'catalogue list not read';
        } else {
          action = 'review'; note = 'no catalogue label matches this text';
        }
      }
      if (action === 'add' && id) {
        const existing = onFace.filter(option => option.catalogueId === id).length;
        if (reuseExisting(magentoFace, id, existing)) { action = 'present'; note = 'already on this face'; }
      }
      if (!face) {
        action = 'review';
        note = note ? note + '; face not found in Magento' : 'face not found in Magento';
      }
      rows.push({ face: location.face, magentoFace, technique, catalogueId: id, action, note });
    }
  }
  const count = (value: PpPlanAction): number => rows.filter(row => row.action === value).length;
  const planned = (option: { face: string; catalogueId: string }): boolean =>
    rows.some(row => row.magentoFace === option.face && row.catalogueId === option.catalogueId);
  return {
    rows, add: count('add'), present: count('present'), review: count('review'),
    locations: locations.length,
    unlistedItems: options.filter(option => !planned(option)).length,
    catalogueSize: catalogue.length,
  };
}

/**
 * A read-back taken right after Save knows the rows but not the catalogue or the labels, because
 * they are read from the open Options tab. Keep the earlier read for those, so a save does not
 * turn every planned row into one that needs review.
 */
/**
 * Stored copies the Notion list does not ask for: per face and technique, the copies beyond what
 * Notion names. One stored copy satisfies one Notion occurrence, so a face that lists a technique
 * once keeps one copy and offers the rest. Nothing is removed here; the panel only ticks these
 * rows, and the operator still confirms the removal and the save.
 */
export function ppExtraCopies(
  plan: { rows: Array<{ magentoFace: string; catalogueId: string; action?: string }> },
  stored: Array<{ face: string; catalogueId: string; position: number }>,
): Array<{ face: string; catalogueId: string; position: number }> {
  // A row without an exact catalogue id is unresolved, and a review row is not a claim either (its
  // face may be missing in Magento): the technique then looks absent from Notion, so offering
  // ticks could delete a copy Notion may well ask for. Nothing is offered in both cases.
  if (plan.rows.some(row => row.action === 'review' || !/^[1-9]\d{0,15}$/.test(row.catalogueId))) return [];
  const wanted = new Map<string, number>();
  for (const row of plan.rows) {
    const key = row.magentoFace + '|' + row.catalogueId;
    wanted.set(key, (wanted.get(key) ?? 0) + 1);
  }
  const kept = new Map<string, number>();
  const extras: Array<{ face: string; catalogueId: string; position: number }> = [];
  for (const option of stored) {
    const key = option.face + '|' + option.catalogueId;
    const allowed = wanted.get(key) ?? 0;
    const used = kept.get(key) ?? 0;
    if (used < allowed) kept.set(key, used + 1);
    else extras.push(option);
  }
  return extras;
}

/**
 * The rows a change actually handled, matched to their own reported outcome. One plan row matches
 * one result, so a technique handled twice is counted twice. The panel keeps these rows: after a
 * read-back the plan no longer names them (they are already present), and saving still has to know
 * what was applied.
 */
/**
 * The rows the save lane must receive after an apply. An order apply writes the whole ordered list,
 * so it keeps every row it sent, whatever the placement report says about single rows: sending only
 * the rows that moved would let the save write a shorter arrangement. An add or rebuild keeps the
 * rows the lane handled, and a removal keeps none, because those rows were never added to that form.
 */
export function ppSaveRows<T extends { face: string; catalogueId: string }>(
  kind: 'add' | 'remove' | 'order' | 'rebuild',
  rows: T[],
  results: Array<{ outcome: string; face: string; catalogueId: string }>,
): T[] {
  if (kind === 'remove') return [];
  if (kind === 'order') return rows;
  return ppHandledRows(rows, results);
}

export function ppHandledRows<T extends { face: string; catalogueId: string }>(
  rows: T[],
  results: Array<{ outcome: string; face: string; catalogueId: string }>,
): T[] {
  const available = new Map<string, number>();
  for (const result of results) {
    if (result.outcome !== 'added' && result.outcome !== 'removed' && result.outcome !== 'ordered') continue;
    const key = result.face + '|' + result.catalogueId;
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const handled: T[] = [];
  for (const row of rows) {
    const key = row.face + '|' + row.catalogueId;
    const left = available.get(key) ?? 0;
    if (left <= 0) continue;
    available.set(key, left - 1);
    handled.push(row);
  }
  return handled;
}

export function ppMergeReadBack(
  previous: ScanPpDraftResponse | undefined,
  stored: ScanPpDraftResponse,
): ScanPpDraftResponse {
  if (!previous) return stored;
  const catalogue = stored.catalogue && stored.catalogue.length ? stored.catalogue : previous.catalogue;
  const itemLabels = stored.itemLabels && Object.keys(stored.itemLabels).length ? stored.itemLabels : previous.itemLabels;
  return { ...stored, catalogue, itemLabels };
}

/**
 * A read-back taken right after Save knows the rows but not the catalogue or the labels, because
 * they are read from the open Options tab. Kept here so one place decides how a read-back is
 * completed. (The merge itself lives in the panel, which holds the earlier snapshot.)
 */
export function ppApplyPlannedOrder(
  snapshot: ScanPpDraftResponse,
  rows: Array<{ magentoFace: string; catalogueId: string }>,
): ScanPpDraftResponse {
  const options = ppOptionRows(snapshot);
  // Every occurrence is kept, so a face that lists the same technique twice keeps it twice.
  const order = new Map<string, string[]>();
  for (const row of rows) {
    if (!/^[1-9]\d{0,15}$/.test(row.catalogueId)) continue;
    const key = ppFaceKey(row.magentoFace);
    const list = order.get(key) ?? [];
    list.push(row.catalogueId);
    order.set(key, list);
  }
  if (!order.size) return snapshot;
  const byFace = new Map<string, number[]>();
  options.forEach((option, at) => {
    const key = ppFaceKey(option.face);
    byFace.set(key, [...(byFace.get(key) ?? []), at]);
  });
  const next = snapshot.items.rows.slice();
  let moved = false;
  for (const [key, ids] of order) {
    const slots = byFace.get(key) ?? [];
    if (slots.length < 2) continue;
    // Planned rows take the first places of their face in plan order, so a technique Notion
    // lists first is placed first instead of being pushed behind rows Notion does not name.
    // Every row the plan does not name follows in the order it already holds, and each plan
    // entry is matched to its own row, so a repeated technique is placed twice.
    const used: number[] = [];
    const sequence: number[] = [];
    for (const id of ids) {
      const at = slots.find(slot => used.indexOf(slot) === -1 && options[slot]!.catalogueId === id);
      if (at === undefined) continue;
      used.push(at);
      sequence.push(at);
    }
    for (const slot of slots) if (used.indexOf(slot) === -1) sequence.push(slot);
    if (sequence.length !== slots.length) continue;
    if (slots.every((slot, at) => next[slot] === snapshot.items.rows[sequence[at]!])) continue;
    moved = true;
    slots.forEach((slot, at) => { next[slot] = snapshot.items.rows[sequence[at]!]!; });
  }
  if (!moved) return snapshot;
  return { ...snapshot, items: { ...snapshot.items, rows: next.map((row, position) => ({ ...row, position })) } };
}

/**
 * Drop rows the helper form just removed, so the panel, the plan and the order verdict match the
 * form without a second Magento read. Positions are reassigned; the labels stay by record id.
 */
export function ppDropRemovedRows(
  snapshot: ScanPpDraftResponse,
  removed: Array<{ magentoFace: string; catalogueId: string }>,
): ScanPpDraftResponse {
  // Each removed entry stands for one row, so a face that holds the same technique twice keeps
  // the copies that were not removed.
  const wanted = new Map<string, number>();
  for (const row of removed) {
    if (!row.catalogueId) continue;
    const key = ppFaceKey(row.magentoFace) + '|' + row.catalogueId;
    wanted.set(key, (wanted.get(key) ?? 0) + 1);
  }
  if (!wanted.size) return snapshot;
  const options = ppOptionRows(snapshot);
  const dropped = new Set<number>();
  options.forEach((option, at) => {
    const key = ppFaceKey(option.face) + '|' + option.catalogueId;
    const left = wanted.get(key) ?? 0;
    if (left < 1) return;
    wanted.set(key, left - 1);
    dropped.add(at);
  });
  const kept = snapshot.items.rows.filter((_row, at) => !dropped.has(at));
  if (kept.length === snapshot.items.rows.length) return snapshot;
  return { ...snapshot, items: { ...snapshot.items, rows: kept.map((row, position) => ({ ...row, position })) } };
}

export interface PpFaceOrder { face: string; wanted: string[]; actual: string[]; outOfPlace: string[] }
export interface PpOrderCheck { faces: PpFaceOrder[]; ordered: boolean; outOfPlace: string[] }

/**
 * Compare the order the form already holds with the order the Notion list gives, face by face.
 * Only rows the plan can identify in Magento take part, and only their relative order counts, so
 * an extra row between two planned rows is not reported as a Notion order problem.
 */
export function ppOrderCheck(
  rows: Array<{ magentoFace: string; technique: string; catalogueId: string }>,
  snapshot: ScanPpDraftResponse,
): PpOrderCheck {
  const options = ppOptionRows(snapshot);
  const faces: PpFaceOrder[] = [];
  const keys: string[] = [];
  for (const row of rows) {
    const key = ppFaceKey(row.magentoFace);
    if (key && keys.indexOf(key) === -1) keys.push(key);
  }
  for (const key of keys) {
    // Every planned occurrence takes part, and each is matched to its own row on the face, so a
    // technique Notion lists twice is checked twice.
    const planned = rows.filter(row => ppFaceKey(row.magentoFace) === key && /^[1-9]\d{0,15}$/.test(row.catalogueId));
    const onFace = options.filter(option => ppFaceKey(option.face) === key);
    const matched: number[] = [];
    const positions = planned.map(row => {
      const at = onFace.findIndex((option, index) => matched.indexOf(index) === -1 && option.catalogueId === row.catalogueId);
      if (at !== -1) matched.push(at);
      return at;
    });
    if (positions.every(at => at === -1)) continue;
    let highest = -1;
    const outOfPlace: string[] = [];
    planned.forEach((row, at) => {
      const position = positions[at]!;
      if (position === -1) return;
      if (position < highest) outOfPlace.push(row.technique + ' → move down');
      else highest = position;
    });
    faces.push({
      face: planned[0]!.magentoFace || key,
      wanted: planned.map(row => row.technique),
      actual: onFace.map(option => option.label || 'catalogue ' + option.catalogueId),
      outOfPlace,
    });
  }
  return {
    faces,
    ordered: faces.every(face => !face.outOfPlace.length),
    outOfPlace: faces.flatMap(face => face.outOfPlace),
  };
}

export interface PpSavedVerification {
  checked: number;
  found: string[];
  missing: string[];
  misplaced: string[];
}

/**
 * Compare the rows that were written with what a fresh read now holds. Presence is checked
 * per face and per occurrence, and so is the order: the written rows have to appear on their
 * face in the plan order, whatever rows the plan does not name sit around them.
 */
export function ppSavedVerification(
  rows: Array<{ magentoFace: string; technique: string; catalogueId: string }>,
  snapshot: ScanPpDraftResponse,
): PpSavedVerification {
  const options = ppOptionRows(snapshot);
  const found: string[] = [], missing: string[] = [], misplaced: string[] = [];
  const label = (row: { magentoFace: string; technique: string; catalogueId: string }): string =>
    [row.magentoFace, row.technique, 'catalogue id ' + row.catalogueId].filter(Boolean).join(' · ');
  const byFace = new Map<string, number[]>();
  options.forEach((option, index) => {
    const key = ppFaceKey(option.face);
    byFace.set(key, [...(byFace.get(key) ?? []), index]);
  });
  // Each written row is matched to its own stored row, so a technique written twice needs two
  // stored copies. A row is misplaced when it sits before a row written earlier on that face,
  // which is the order the lane guarantees: the written rows keep the plan order.
  const taken = new Map<string, number[]>(), highest = new Map<string, number>();
  for (const row of rows) {
    const key = ppFaceKey(row.magentoFace);
    const face = byFace.get(key) ?? [];
    const used = taken.get(key) ?? [];
    const match = face.find(index => used.indexOf(index) === -1 && options[index]!.catalogueId === row.catalogueId);
    if (match === undefined) { missing.push(label(row)); continue; }
    used.push(match);
    taken.set(key, used);
    found.push(label(row));
    const last = highest.get(key) ?? -1;
    if (match < last) misplaced.push(label(row));
    else highest.set(key, match);
  }
  return { checked: rows.length, found, missing, misplaced };
}

/** Compare the rows that were removed with what a fresh read now holds. */
export function ppRemovedVerification(
  rows: Array<{ magentoFace: string; technique: string; catalogueId: string }>,
  snapshot: ScanPpDraftResponse,
): { checked: number; gone: number; present: string[] } {
  const options = ppOptionRows(snapshot);
  // Each removed entry is matched to its own remaining row, so removing one of two copies still
  // reports the copy that is left.
  const taken: number[] = [];
  const present: string[] = [];
  for (const row of rows) {
    const found = options.findIndex((option, index) => taken.indexOf(index) === -1 &&
      option.catalogueId === row.catalogueId && ppFaceKey(option.face) === ppFaceKey(row.magentoFace));
    if (found !== -1) {
      taken.push(found);
      present.push([row.magentoFace, row.technique, 'catalogue id ' + row.catalogueId].filter(Boolean).join(' · '));
    }
  }
  return { checked: rows.length, gone: rows.length - present.length, present };
}

/** Notion review values are shown in plain English; the raw value stays available. */
export function ppReviewLabel(value: string | null | undefined): { label: string; raw: string } {
  const raw = (value ?? '').trim();
  const key = ppNormal(raw);
  if (!key) return { label: 'Unknown', raw };
  if (key === 'arever' || key === 'rever' || key === 'toreview') return { label: 'Needs review', raw };
  if (key === 'aprovado' || key === 'approved' || key === 'ok') return { label: 'Approved', raw };
  if (key === 'parcial' || key === 'partial') return { label: 'Partial', raw };
  return { label: raw, raw };
}

export type PpSearchMode = 'all' | 'exact-code' | 'text';

/** Digits search the exact business code; text searches codes and titles. */
export function ppSearchMode(query: string): PpSearchMode {
  const trimmed = query.trim();
  if (!trimmed) return 'all';
  return trimmed.split('').every(char => char >= '0' && char <= '9') ? 'exact-code' : 'text';
}

export function ppMatchesSearch(row: PpCatalogIndexRow, query: string): boolean {
  const mode = ppSearchMode(query);
  const wanted = query.trim().toLowerCase();
  if (mode === 'all') return true;
  const code = (row.code ?? '').trim().toLowerCase();
  if (mode === 'exact-code') return code === wanted;
  return code.includes(wanted) || (row.name ?? '').toLowerCase().includes(wanted);
}

/** The list draws at most this many matches; a whole catalogue per keystroke is too slow. */
export const PP_SEARCH_CAP = 200;

/** Matches and the bounded head of them, so the count still names the whole catalogue. */
export function ppSearchRows(rows: PpCatalogIndexRow[], query: string, cap: number):
  { matches: number; shown: Array<{ row: PpCatalogIndexRow; position: number }> } {
  const all = rows.map((row, position) => ({ row, position })).filter(({ row }) => ppMatchesSearch(row, query));
  return { matches: all.length, shown: all.slice(0, Math.max(0, Math.floor(cap))) };
}

/** Partial code matches a digit query hides; used only for the hint line. */
export function ppPartialMatches(rows: PpCatalogIndexRow[], query: string): number {
  if (ppSearchMode(query) !== 'exact-code') return 0;
  const wanted = query.trim().toLowerCase();
  return rows.filter(row => {
    const code = (row.code ?? '').trim().toLowerCase();
    return code !== wanted && (row.code ?? '').toLowerCase().includes(wanted);
  }).length;
}
