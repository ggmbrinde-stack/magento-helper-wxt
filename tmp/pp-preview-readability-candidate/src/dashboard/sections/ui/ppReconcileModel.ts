import type { PpCatalogIndexRow } from '../../../shared/ppCatalog';
import type { PpPlanRow } from './ppPreviewModel';

/**
 * The requested workflow: one exact business code that exists in both inventories is duplicated
 * once, its faces are kept, and only the duplicate's printing options are reduced to the Notion
 * list. A Notion-only code is skipped, never created. A Magento-only code is untouched.
 *
 * None of that can be decided without a complete Magento inventory of business codes, and no
 * write can start until the native Duplicate contract is proven. This model therefore classifies
 * read-only evidence and refuses an absence verdict when a source is incomplete.
 */

export type PpInventoryCoverage = 'complete' | 'partial' | 'unavailable';

export interface PpMagentoInventoryRow {
  /** Custom-option entity id, as read from Magento. */
  entityId: string;
  /** Business PP code for that record, for example `49`. */
  code: string;
}

export interface PpMagentoInventory {
  coverage: PpInventoryCoverage;
  rows: PpMagentoInventoryRow[];
  reason: string;
  readAt?: string;
}

/**
 * No proven Magento-wide business-code inventory exists. The Options Grid read proves entity ids
 * and edit links only, and the custom-option edit page carries the code only inside its Attribute
 * Set label, which no reader parses. A partial list is never treated as complete.
 */
export const PP_INVENTORY_UNAVAILABLE: PpMagentoInventory = {
  coverage: 'unavailable',
  rows: [],
  reason: 'No proven Magento-wide business-code inventory. The loaded Options Grid proves custom-option entity ids and edit links only, and the custom-option edit page carries the code only inside its Attribute Set label, which no reader parses. A partial list is never treated as complete.',
};

/** A usable Magento original id: a positive integer. `0` is not a record. */
const PP_ENTITY_ID = /^[1-9]\d{0,15}$/;

/** The native Duplicate contract is not established: no observed route, new-ID readback or face remap. */
export const PP_DUPLICATE_CONTRACT = {
  status: 'unproven' as const,
  reason: 'Magento native Duplicate is unverified: no observed action or route, no new entity ID readback and no proven face or parent-key remap. A write path is not implemented.',
};

/**
 * Codes compare exactly, as written. The two sources format a code differently: a Notion page
 * reads `PP 661` and the workbook stores `661`, while a Magento Attribute Set label reads
 * `AS>PP0049_...` and yields `0049`. No observed record pair proves that `661` and `0661` are the
 * same profile, so width, prefix and spacing are never normalised away. A differing format is a
 * Needs review row: not a match, and not an absence.
 */
export function ppCodeKey(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  return /^\d{1,6}$/.test(text) ? text : '';
}

/**
 * Digits only, with a `PP` prefix and padding ignored. Used to explain a format difference in a
 * review reason; never used to decide a match.
 */
function ppCodeShape(value: string | null | undefined): string {
  const text = (value ?? '').trim().toUpperCase().replace(/^PP[\s_-]*/, '');
  if (!/^\d{1,6}$/.test(text)) return '';
  return text.replace(/^0+/, '') || '0';
}

export type PpVerdict = 'matched' | 'skipped' | 'needs-review';

export interface PpReconcileRow {
  pageId: string | null;
  code: string;
  name: string | null;
  verdict: PpVerdict;
  reason: string;
  /** Magento original, only when the match is proven. */
  entityId: string;
}

export interface PpReconcileReport {
  notionCoverage: 'complete' | 'partial' | 'cancelled' | 'error';
  /** Effective Magento coverage, after unusable rows downgrade a claimed complete list. */
  coverage: PpInventoryCoverage;
  coverageReason: string;
  /** True only when both inventories are complete and Magento entity ids are unique. */
  absenceAllowed: boolean;
  rows: PpReconcileRow[];
  magentoOnly: PpMagentoInventoryRow[];
  /** Inventory rows sharing one Magento entity, reported even without a Notion match. */
  entityCollisions: PpEntityCollision[];
  counts: { matched: number; skipped: number; untouched: number; review: number };
}

export interface PpEntityCollision {
  entityId: string;
  codes: string[];
}

export interface PpReconcileInput {
  notionCoverage: PpReconcileReport['notionCoverage'];
  notionRows: PpCatalogIndexRow[];
  inventory: PpMagentoInventory;
}

interface PpInventoryState {
  coverage: PpInventoryCoverage;
  reason: string;
  rows: PpMagentoInventoryRow[];
}

/** A list that holds an unreadable row cannot be called complete, whatever it claims. */
function ppInventoryState(inventory: PpMagentoInventory): PpInventoryState {
  if (inventory.coverage !== 'complete') {
    return { coverage: inventory.coverage, reason: inventory.reason, rows: inventory.rows };
  }
  // An id of `0` is not a record: the page itself refuses it, so a list holding one is not a
  // complete inventory. Downgrading here keeps that row out of both `matched` and the untouched
  // list instead of publishing it as a usable original.
  const unusable = inventory.rows.find(row => !PP_ENTITY_ID.test((row.entityId ?? '').trim()) || !ppCodeKey(row.code));
  if (unusable) {
    return {
      coverage: 'partial',
      reason: 'The Magento inventory contains an unreadable row (an entity id must be a positive integer and a code must be digits), so its completeness is not established.',
      rows: inventory.rows,
    };
  }
  return { coverage: 'complete', reason: inventory.reason, rows: inventory.rows };
}

/**
 * One classification per loaded Notion row. Absence is never inferred from a partial source, and
 * a duplicate business code on either side stays for review instead of picking a record.
 */
export function ppReconcile(input: PpReconcileInput): PpReconcileReport {
  const inventory = ppInventoryState(input.inventory);
  const byEntity = new Map<string, PpMagentoInventoryRow[]>();
  if (inventory.coverage === 'complete') for (const row of inventory.rows) {
    const id = row.entityId.trim();
    byEntity.set(id, [...(byEntity.get(id) ?? []), row]);
  }
  const entityCollisions: PpEntityCollision[] = [...byEntity].filter(([, group]) => group.length > 1)
    .map(([entityId, group]) => ({ entityId, codes: group.map(row => row.code) }));
  const absenceAllowed = input.notionCoverage === 'complete' && inventory.coverage === 'complete' && !entityCollisions.length;
  const notionCounts = new Map<string, number>();
  for (const row of input.notionRows) {
    const key = ppCodeKey(row.code);
    if (key) notionCounts.set(key, (notionCounts.get(key) ?? 0) + 1);
  }
  const inventoryByCode = new Map<string, PpMagentoInventoryRow[]>();
  for (const row of inventory.rows) {
    const key = ppCodeKey(row.code);
    if (!key) continue;
    inventoryByCode.set(key, [...(inventoryByCode.get(key) ?? []), row]);
  }
  const rows: PpReconcileRow[] = input.notionRows.map(row => {
    const code = row.code ?? '';
    const key = ppCodeKey(code);
    const base = { pageId: row.pageId ?? null, code, name: row.name ?? null, entityId: '' };
    if (!row.pageId) return { ...base, verdict: 'needs-review', reason: 'Missing or invalid Notion page ID.' };
    if (!key) return { ...base, verdict: 'needs-review', reason: 'Not a numeric PP business code. The code cannot be matched exactly.' };
    if ((notionCounts.get(key) ?? 0) > 1) {
      return { ...base, verdict: 'needs-review', reason: 'Duplicate exact business code in Notion. One record cannot be chosen.' };
    }
    if (input.notionCoverage !== 'complete') {
      return { ...base, verdict: 'needs-review', reason: 'Notion coverage is ' + input.notionCoverage + '. Uniqueness and absence are not established.' };
    }
    if (inventory.coverage !== 'complete') {
      return { ...base, verdict: 'needs-review', reason: 'Magento inventory is ' + inventory.coverage + '. ' + inventory.reason };
    }
    const found = inventoryByCode.get(key) ?? [];
    if (found.length > 1) {
      return { ...base, verdict: 'needs-review', reason: found.length + ' Magento records share this code: entity ' + found.map(entry => entry.entityId).join(', ') + '. The original is ambiguous.' };
    }
    const original = found[0];
    const collision = original && byEntity.get(original.entityId.trim());
    if (collision && collision.length > 1) {
      const others = collision.filter(entry => entry !== original).map(entry => entry.code).join(', ');
      return { ...base, verdict: 'needs-review', reason: 'Magento entity ' + original.entityId.trim() + ' is also the match for code ' + others + '. One original cannot be duplicated for two codes.' };
    }
    if (original) return { ...base, verdict: 'matched', reason: 'Exactly one Magento original.', entityId: original.entityId.trim() };
    const written = inventory.rows.filter(entry => ppCodeKey(entry.code) !== key && ppCodeShape(entry.code) === ppCodeShape(code));
    if (written.length) {
      return { ...base, verdict: 'needs-review', reason: 'Magento writes this code as ' + written.map(entry => entry.code).join(', ') + ', Notion writes ' + code + '. The formats differ and no observation proves they are the same profile, so no match is made.' };
    }
    if (!absenceAllowed) return { ...base, verdict: 'needs-review', reason: 'Magento entity IDs collide in the inventory. Absence cannot be established until the records are reviewed.' };
    return { ...base, verdict: 'skipped', reason: 'No Magento record with this code. Nothing will be created.' };
  });
  const notionKeys = new Set(input.notionRows.map(row => ppCodeKey(row.code)).filter(Boolean));
  // A record written in a different format is not "Magento only": the Notion row may be the same
  // profile, so it stays out of the untouched list and its own row stays Needs review.
  const notionShapes = new Set(input.notionRows.map(row => ppCodeShape(row.code)).filter(Boolean));
  const magentoOnly = absenceAllowed
    ? inventory.rows.filter(row => !notionKeys.has(ppCodeKey(row.code)) && !notionShapes.has(ppCodeShape(row.code)))
    : [];
  const count = (verdict: PpVerdict): number => rows.filter(row => row.verdict === verdict).length;
  return {
    notionCoverage: input.notionCoverage,
    coverage: inventory.coverage,
    coverageReason: inventory.reason,
    absenceAllowed,
    rows,
    magentoOnly,
    entityCollisions,
    counts: { matched: count('matched'), skipped: count('skipped'), untouched: magentoOnly.length, review: count('needs-review') },
  };
}

export interface PpSelection {
  /** Selected report rows, in the order the operator selected them. */
  rows: PpReconcileRow[];
  matched: PpReconcileRow[];
  /** Selected Notion-only codes. A clean skip: the runner reports it and creates nothing. */
  skipped: PpReconcileRow[];
  blocked: Array<{ code: string; reason: string }>;
  ready: boolean;
  reason: string;
}

/**
 * The operator's explicit selection. One code and several codes take the same path. A clean
 * Notion-only skip does not block the other selected codes, because it is not an error and it
 * writes nothing. Ambiguous or unmatched selections are blocked, two selected codes may never
 * target the same Magento original, and an empty selection is never widened to the catalogue.
 */
export function ppSelection(report: PpReconcileReport, pageIds: string[]): PpSelection {
  const seen = new Set<string>();
  const rows: PpReconcileRow[] = [], matched: PpReconcileRow[] = [], skipped: PpReconcileRow[] = [];
  const blocked: Array<{ code: string; reason: string }> = [];
  /** One original cannot be the target of two codes, or a batch would duplicate it twice. */
  const targets = new Map<string, string>();
  for (const pageId of pageIds) {
    if (!pageId || seen.has(pageId)) continue;
    seen.add(pageId);
    const row = report.rows.find(candidate => candidate.pageId === pageId);
    if (!row) {
      blocked.push({ code: pageId, reason: 'Selected record is not in the reconciliation report. Reload the catalogue.' });
      continue;
    }
    rows.push(row);
    if (row.verdict === 'skipped') { skipped.push(row); continue; }
    if (row.verdict !== 'matched') { blocked.push({ code: row.code || '(no code)', reason: row.reason }); continue; }
    if (!PP_ENTITY_ID.test(row.entityId)) {
      blocked.push({ code: row.code || '(no code)', reason: 'The match has no usable Magento entity id, so there is no original to duplicate.' });
      continue;
    }
    const other = targets.get(row.entityId);
    if (other !== undefined) {
      blocked.push({ code: row.code || '(no code)', reason: 'Codes ' + other + ' and ' + (row.code || '(no code)') + ' both resolve to Magento entity ' + row.entityId + '. One original cannot be duplicated twice.' });
      continue;
    }
    targets.set(row.entityId, row.code || '(no code)');
    matched.push(row);
  }
  const ready = matched.length > 0 && blocked.length === 0;
  const reason = !rows.length ? 'Select one or more exact codes.'
    : blocked.length ? blocked.length + ' selected code(s) cannot be run: ' + blocked[0]!.reason
      : matched.length ? 'Match verified for ' + matched.length + ' code(s)'
        + (skipped.length ? '; ' + skipped.length + ' will be skipped because Notion has no Magento record and nothing is created' : '') + '.'
        : skipped.length + ' selected code(s) have no Magento record. Nothing is created, so there is nothing to duplicate.';
  return { rows, matched, skipped, blocked, ready, reason };
}

/**
 * Every write boundary. It returns false today because the Duplicate contract is unproven, and it
 * also refuses when the selection is not matched or a source is incomplete.
 */
export function ppDuplicateGate(report: PpReconcileReport, selection: PpSelection): { allowed: boolean; reason: string } {
  if (!selection.rows.length) return { allowed: false, reason: 'Select one or more exact codes first.' };
  if (selection.blocked.length) return { allowed: false, reason: selection.reason };
  if (!selection.matched.length) return { allowed: false, reason: 'No selected code has a verified Magento original to duplicate. ' + selection.reason };
  if (!report.absenceAllowed) return { allowed: false, reason: report.entityCollisions.length
    ? 'Magento entity IDs collide in the inventory. Review those records before duplicating any code.'
    : 'Both inventories must be complete before a match can be certified. ' + report.coverageReason };
  return { allowed: false, reason: PP_DUPLICATE_CONTRACT.reason };
}

export interface PpPlanFaceGroup {
  face: string;
  rows: PpPlanRow[];
  add: number;
  present: number;
  review: number;
}

/** The plan grouped by the Magento face it changes, so the difference is read one face at a time. */
export function ppPlanFaces(rows: PpPlanRow[]): PpPlanFaceGroup[] {
  const groups: PpPlanFaceGroup[] = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = row.magentoFace || row.face;
    const at = index.get(key);
    if (at === undefined) {
      index.set(key, groups.length);
      groups.push({ face: key, rows: [row], add: 0, present: 0, review: 0 });
    } else groups[at]!.rows.push(row);
  }
  for (const group of groups) {
    group.add = group.rows.filter(row => row.action === 'add').length;
    group.present = group.rows.filter(row => row.action === 'present').length;
    group.review = group.rows.filter(row => row.action === 'review').length;
  }
  return groups;
}
