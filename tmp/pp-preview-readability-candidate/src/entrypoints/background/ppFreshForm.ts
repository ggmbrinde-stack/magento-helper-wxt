import type { PpFreshFormResponse, PpFreshFormState, PpFreshReadiness, PpReadinessCheckpoint, ScanPpDraftResponse, PpReferenceSource, PpGridCoverage, PpSourceSelection, PpConnectionResponse, PpConnectionTab, ApplyPpPlanResponse, PpApplyPlanRow, PpApplyPlanResult, SavePpFormResponse } from '../../core/messages';
import { activatePpOptionsTab, scanCurrentPpDraft, ppRoutePathFromUrl, ppEntityIdFromUrl } from '../../page/features/pp-scan/page';
import { applyPpPlanRows, placePpItemRows, type PpOrderDiagnostics, type PpPlacementReport } from '../../page/features/pp-scan/apply';
import { removePpItemRows } from '../../page/features/pp-scan/remove';
import { readPpReadiness } from '../../page/features/pp-scan/readiness';
import { readLoadedPpGrid, type PpLoadedGridRead } from '../../page/features/pp-scan/grid';
import { isPpDraftScanResponse, ppTabSelectionToken } from './ppPreview';
import { pressPpSave, readPpItemPairs, readPpSaveOutcome, ppItemPair, type PpSaveOutcome, type PpSavePress } from '../../page/features/pp-scan/save';

const HOSTS = new Set(['bestofgifts.pt', 'bestofgifts.eu', 'bestofgifts.es', 'bestofgifts.fr', 'bestofgifts-pt-qa.toogas.net']);
const BASE_RULE = 'Use https on bestofgifts.pt, bestofgifts.eu, bestofgifts.es, bestofgifts.fr or bestofgifts-pt-qa.toogas.net, with one admin path segment such as /admin_xxx, and no port, query, key or extra path.';
const MAX_WAIT = 30_000, MAX_INJECTIONS = 10;
// A shorter poll only shortens the wait for a page that is already ready; it does not add
// requests, because each tick is one injected readiness probe.
const POLL_MS = 150, EXTRACTION_GAP = (MAX_WAIT - 1000) / (MAX_INJECTIONS - 1);
interface ReadJob {
  id: string; entityId: string; owner: number | undefined; cancelled: boolean; referenceSource: PpReferenceSource;
  selection?: PpSourceSelection;
  tabId?: number; close?: Promise<boolean>; done: Promise<PpFreshFormResponse>;
  plan?: PpApplyPlanRow[];
  mode?: 'add' | 'remove' | 'order' | 'rebuild';
  removed?: boolean; onRemoved?: (tabId: number) => void;
  closeInFlight?: boolean;
  cancelWait?: () => void;
}
let active: ReadJob | null = null;
let leftover: ReadJob | null = null;
/**
 * Helper tab that still holds an unsaved form filled by the apply lane. The worker can be
 * stopped between apply and save, so this marker is also kept in session storage.
 */
let applyTab: number | undefined;
const FILLED_TAB_KEY = 'ppFilledHelperTab';
interface FilledTab { tabId: number; entityId: string }
const tabOpen = (tabId: number): Promise<boolean> => chrome.tabs.get(tabId).then(() => true, () => false);
const readFilledTab = async (): Promise<FilledTab | null> => {
  try {
    const stored = await chrome.storage.session.get(FILLED_TAB_KEY);
    const value = stored?.[FILLED_TAB_KEY] as Partial<FilledTab> | undefined;
    return value && Number.isSafeInteger(value.tabId) && typeof value.entityId === 'string'
      ? { tabId: value.tabId as number, entityId: value.entityId } : null;
  } catch { return null; }
};
const setApplyTab = async (tabId: number | undefined, entityId = ''): Promise<void> => {
  applyTab = tabId;
  try {
    if (tabId === undefined) await chrome.storage.session.remove(FILLED_TAB_KEY);
    else await chrome.storage.session.set({ [FILLED_TAB_KEY]: { tabId, entityId } });
  } catch { /* the in-memory marker still covers this worker */ }
};
/** The filled helper tab, if it is still open. A closed tab is forgotten. */
const filledTab = async (): Promise<number | undefined> => {
  if (applyTab !== undefined) {
    if (await tabOpen(applyTab)) return applyTab;
    await setApplyTab(undefined);
    return undefined;
  }
  const stored = await readFilledTab();
  if (!stored) return undefined;
  if (!(await tabOpen(stored.tabId))) { await setApplyTab(undefined); return undefined; }
  applyTab = stored.tabId;
  return applyTab;
};
/** A leftover helper only blocks another job while its tab is still open. */
const blockingLeftover = async (): Promise<ReadJob | null> => {
  if (!leftover) return null;
  if (leftover.tabId !== undefined && await tabOpen(leftover.tabId)) return leftover;
  leftover = null;
  return null;
};
const stoppedBeforeStart = new Map<string, number | undefined>();

const reply = (id: string, entityId: string, status: PpFreshFormResponse['status'], reason: string): PpFreshFormResponse =>
  ({ source: 'fresh-magento-form-load', requestId: id, entityId, status, reason, cleanup: 'not-created' });

export type FreshFormIssue = 'entity' | 'missing-base' | 'rejected-base';

/** Name the exact input that blocks the load, so the reason is actionable instead of shared. */
export function freshFormIssue(base: unknown, entityId: unknown): FreshFormIssue | null {
  if (typeof entityId !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(entityId)) return 'entity';
  if (typeof base !== 'string' || !base.trim()) return 'missing-base';
  try {
    const url = new URL(base);
    return url.protocol === 'https:' && HOSTS.has(url.hostname) && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && /^\/[a-z0-9_-]+\/?$/i.test(url.pathname) ? null : 'rejected-base';
  } catch { return 'rejected-base'; }
}

const issueReason = (issue: FreshFormIssue): string => issue === 'entity'
  ? 'Enter the exact positive Magento custom-option entity ID: digits only, no leading zero. No helper tab was opened.'
  : issue === 'missing-base'
    ? `Admin base URL is not set, so no helper tab was opened. Open Settings, enter the HTTPS admin root, press Save, then retry. ${BASE_RULE}`
    : `The saved admin base URL is not accepted, so no helper tab was opened. ${BASE_RULE}`;

export function freshFormUrl(base: unknown, entityId: unknown): string | null {
  if (freshFormIssue(base, entityId)) return null;
  const url = new URL(base as string);
  return `${url.origin}${url.pathname.replace(/\/$/, '')}/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/${entityId}/`;
}

/** Validate the whole native address without extracting or rewriting its key. */
export function isNativePpReference(value: unknown, target: string): value is string {
  if (typeof value !== 'string' || /[?#]/.test(value)) return false;
  try {
    const url = new URL(value), wanted = new URL(target);
    const path = wanted.pathname.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return url.href === value && !url.username && !url.password && url.origin === wanted.origin &&
      url.protocol === 'https:' && HOSTS.has(url.hostname) &&
      new RegExp(`^${path}(?:/key/[A-Za-z0-9_-]{1,256})?/?$`).test(url.pathname);
  } catch { return false; }
}

/** The helper tab may carry a session key or a query; only its record address matters here. */
export function isPpHelperEditUrl(url: unknown, entityId: string): url is string {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && HOSTS.has(parsed.hostname) && ppEntityIdFromUrl(url) === entityId;
  } catch { return false; }
}

async function closeOwned(job: ReadJob): Promise<boolean> {
  if (job.tabId === undefined || job.removed) return true;
  if (!job.close) {
    job.closeInFlight = true;
    job.close = chrome.tabs.remove(job.tabId).then(() => true, () => false).finally(() => { job.closeInFlight = false; });
  }
  return job.close;
}

/**
 * A page script can throw or hang. Both cases name the step, and neither may echo the admin URL
 * with its session key, so the message is scrubbed and capped before it reaches the dashboard.
 */
export function ppLaneFailure(lane: string, error: unknown, seconds = 90): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw === 'Read timed out' || /timed out/i.test(raw)) {
    return `The ${lane} step did not answer within ${seconds} seconds. Check the helper tab before retrying; nothing was saved.`;
  }
  const message = raw.replace(/key\/[^\s/?#]+/gi, 'key/[redacted]')
    .replace(/\?[^\s]*/g, '?[redacted]').replace(/\s+/g, ' ').trim().slice(0, 200);
  return `The ${lane} step stopped with a script error${message ? ': ' + message : ''}. Check the helper tab before retrying; nothing was saved.`;
}

function bounded<T>(promise: Promise<T>, milliseconds: number, job?: ReadJob): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (ok: boolean, value: unknown): void => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      if (job?.cancelWait === cancel) job.cancelWait = undefined;
      if (ok) resolve(value as T); else reject(value);
    };
    const cancel = (): void => finish(false, new Error('Read cancelled'));
    const timer = setTimeout(() => finish(false, new Error('Read timed out')), Math.max(1, milliseconds));
    if (job) { job.cancelWait = cancel; if (job.cancelled) cancel(); }
    promise.then(value => finish(true, value), error => finish(false, error));
  });
}

export function freshFormState(owner: number | undefined): PpFreshFormState {
  if (leftover) return { status: 'cleanup-failed', requestId: leftover.id, leftoverTabId: leftover.tabId };
  if (active && active.owner === owner) return { status: 'reading', requestId: active.id };
  return { status: 'idle' };
}

function safeReadiness(value: unknown): PpReadinessCheckpoint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const c = value as PpReadinessCheckpoint;
  if (!['loading', 'interactive', 'complete', 'unknown'].includes(c.document) ||
    !['document-loading', 'route-mismatch', 'registry-unavailable', 'provider-unavailable', 'data-unavailable', 'identity-missing', 'identity-invalid', 'identity-mismatch', 'ready', 'read-error'].includes(c.stage) ||
    ![c.registry, c.provider, c.data].every(state => ['unknown', 'available', 'unavailable'].includes(state)) ||
    !['unknown', 'missing', 'invalid', 'matching', 'mismatched'].includes(c.identity) || typeof c.blockedAccessor !== 'boolean') return undefined;
  return { document: c.document, stage: c.stage, registry: c.registry, provider: c.provider, data: c.data,
    identity: c.identity, blockedAccessor: c.blockedAccessor };
}

function classifyScanWarnings(result: ScanPpDraftResponse): PpFreshReadiness['warningCodes'] {
  const codes: PpFreshReadiness['warningCodes'] = [];
  const known: [PpFreshReadiness['warningCodes'][number], string][] = [
    ['registry-unavailable', 'The already-loaded Magento registry is unavailable.'],
    ['provider-unavailable', 'The Magento custom-option provider is not loaded.'],
    ['data-unavailable', 'The Magento provider data is unavailable.'],
    ['identity-mismatch', 'The route entity and provider entity do not match.'],
    ['route-mismatch', 'This is not a recognized custom-option edit route.'],
    ['scan-error', 'The provider could not be read safely. Retry the scan after Magento finishes loading.'],
  ];
  for (const [code, warning] of known) if (result.warnings.includes(warning)) codes.push(code);
  if (result.scannedAt !== undefined && result.providerEntityId === undefined) codes.push('identity-missing');
  if (result.status === 'partial') codes.push('partial-fields');
  if (result.status === 'unavailable' && !codes.length) codes.push('scan-error');
  return [...new Set(codes)];
}

function safeGridCoverage(value: unknown): PpGridCoverage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const c = value as PpGridCoverage;
  if (!['found', 'duplicate', 'invalid-link', 'loading', 'error', 'not-in-loaded-results', 'incomplete', 'unavailable', 'changed', 'ambiguous-source'].includes(c.status) ||
    c.freshness !== 'loaded-unverified' ||
    [c.loadedRows, c.totalRows, c.page, c.pageSize].some(n => n !== undefined && (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)) ||
    (c.loadedRows !== undefined && c.loadedRows > 5000) || (c.pageSize !== undefined && (c.pageSize < 1 || c.pageSize > 5000)) ||
    (c.page !== undefined && c.page < 1) || (c.filtered !== undefined && typeof c.filtered !== 'boolean') ||
    (c.detail !== undefined && (typeof c.detail !== 'string' || c.detail.length > 200))) return undefined;
  if (c.status === 'found' && [c.loadedRows, c.totalRows, c.page, c.pageSize].some(n => n === undefined)) return undefined;
  return { status: c.status, freshness: 'loaded-unverified', loadedRows: c.loadedRows, totalRows: c.totalRows,
    page: c.page, pageSize: c.pageSize, filtered: c.filtered, detail: c.detail };
}

async function gridReference(job: ReadJob, target: string): Promise<{ grid: PpGridCoverage; reason: string; url?: string }> {
  const empty = (status: PpGridCoverage['status'], reason: string) => ({ grid: { status, freshness: 'loaded-unverified' as const }, reason });
  const wanted = new URL(target), gridPath = wanted.pathname.replace(/\/edit\/attributesetcustomoptions_id\/\d+\/$/, '/index/');
  const gridTarget = wanted.origin + gridPath;
  try {
    let tabs = (await bounded(chrome.tabs.query({ url: [gridTarget.replace(/\/$/, ''), gridTarget + '*'] }), 5000, job))
      .filter(tab => typeof tab.id === 'number' && Number.isInteger(tab.id) && tab.id >= 0 && tab.status === 'complete' &&
        !tab.pendingUrl && isNativePpReference(tab.url, gridTarget));
    if (job.selection) {
      const selected = tabs.find(tab => tab.id === job.selection!.tabId);
      if (!selected || await ppTabSelectionToken(selected) !== job.selection.selectionToken) return empty('changed', 'Selected Options Grid changed. Check the connection and select it again.');
      tabs = [selected];
    }
    if (job.cancelled) return empty('unavailable', 'Preview cancelled.');
    if (!tabs.length) return empty('unavailable', 'Open one Magento Options Grid for the configured admin base and load the target record, or explicitly choose the exact-record reference source.');
    if (tabs.length !== 1) return empty('ambiguous-source', 'Keep one Options Grid tab open for the configured admin base. No address selected.');
    const source = tabs[0]!, before = await bounded(chrome.tabs.get(source.id!), 5000, job);
    if (job.cancelled) return empty('unavailable', 'Preview cancelled.');
    if (before.status !== 'complete' || before.pendingUrl || before.url !== source.url || !isNativePpReference(before.url, gridTarget)) return empty('changed', 'Options Grid navigation changed. Wait for it to finish, then retry.');
    let previous: PpLoadedGridRead | undefined, coverage: PpGridCoverage | undefined;
    const reasons: Record<PpGridCoverage['status'], string> = {
      found: 'Native Edit address read from loaded grid data; grid freshness and in-flight state are not verified.',
      duplicate: 'Multiple loaded grid rows exactly match this entity. No address selected.',
      'invalid-link': 'The exact loaded row has no valid native Edit address. No address selected.',
      loading: 'Options Grid is still loading. Wait, load the target record manually, then retry.',
      error: 'Options Grid reports an error. Resolve it manually before retrying.',
      'not-in-loaded-results': 'The exact entity is not in the loaded grid results. Filters or paging may hide it; load the appropriate filter/page manually, then retry. This is not a global not-found result.',
      incomplete: 'Loaded Options Grid coverage or parameters are incomplete or unsupported. Load a supported page manually, then retry.',
      unavailable: 'The already-loaded Options Grid provider is unavailable. Load the grid manually, then retry.',
      changed: 'Options Grid data, parameters or Edit address changed during the read. Wait and retry.',
      'ambiguous-source': 'Options Grid source is ambiguous. Keep one matching grid tab open.',
    };
    for (let check = 0; check < 2; check++) {
      const [injection] = await bounded(chrome.scripting.executeScript({
        target: { tabId: source.id!, frameIds: [0] }, world: 'MAIN', func: readLoadedPpGrid,
        args: [job.entityId, wanted.origin, gridPath],
      }), 5000, job);
      if (job.cancelled) return empty('unavailable', 'Preview cancelled.');
      const after = await bounded(chrome.tabs.get(source.id!), 5000, job);
      if (after.url !== before.url || after.pendingUrl || after.status !== 'complete') return empty('changed', reasons.changed);
      const result = injection?.result;
      coverage = safeGridCoverage(result);
      if (injection?.frameId !== 0 || !coverage) return empty('unavailable', 'The grid did not return a valid main-frame loaded-data snapshot.');
      // An incomplete read now says which loaded field it refused, so the connection reason
      // names the cause instead of repeating one sentence for every case.
      if (coverage.status !== 'found') return { grid: coverage, reason: coverage.detail
        ? `${reasons[coverage.status]} Rejected: ${coverage.detail}.` : reasons[coverage.status] };
      if (!result || typeof result.nativeUrl !== 'string' || !isNativePpReference(result.nativeUrl, target)) return { grid: { ...coverage, status: 'invalid-link' }, reason: reasons['invalid-link'] };
      if (typeof result.stamp !== 'string' || result.stamp.length > 32_000) return { grid: { ...coverage, status: 'incomplete' }, reason: reasons.incomplete };
      if (previous && (previous.stamp !== result.stamp || previous.nativeUrl !== result.nativeUrl)) return { grid: { ...coverage, status: 'changed' }, reason: reasons.changed };
      previous = result;
    }
    return { grid: coverage!, reason: reasons.found, url: previous!.nativeUrl };
  } catch { return empty('unavailable', 'Loaded Options Grid data could not be read safely. Wait and retry or explicitly choose an exact-record reference.'); }
}

async function run(job: ReadJob): Promise<PpFreshFormResponse> {
  let response = reply(job.id, job.entityId, 'unavailable', 'The fresh Magento form could not be read. Check the admin session and target entity.');
  let readiness: PpFreshReadiness | undefined, started = 0;
  let labelPending: PpFreshFormResponse | undefined, labelActivations = 0;
  let reference: PpFreshFormResponse['reference'];
  try {
    const settings = await bounded(chrome.storage.local.get(['adminBaseUrl']), 5000, job);
    const target = freshFormUrl(settings.adminBaseUrl, job.entityId);
    if (!target) {
      const issue = freshFormIssue(settings.adminBaseUrl, job.entityId) ?? 'rejected-base';
      return reply(job.id, job.entityId, 'invalid', issueReason(issue));
    }
    if (job.cancelled) return reply(job.id, job.entityId, 'cancelled', 'Preview cancelled before opening a helper tab.');
    const wanted = new URL(target), safePath = ppRoutePathFromUrl(target)!;
    reference = { kind: job.referenceSource };
    let nativeUrl: string;
    if (job.referenceSource === 'current-draft') return await readOpenDraft(job, target);
    if (job.referenceSource === 'options-grid') {
      const selected = await gridReference(job, target);
      reference.grid = selected.grid;
      if (job.cancelled) return { ...reply(job.id, job.entityId, 'cancelled', 'Preview cancelled before opening a helper tab.'), reference };
      if (!selected.url) return { ...reply(job.id, job.entityId, 'unavailable', selected.reason), reference };
      nativeUrl = selected.url;
    } else {
      let references = (await chrome.tabs.query({ url: [target.replace(/\/$/, ''), `${target}*`] }))
        .filter(tab => typeof tab.id === 'number' && Number.isInteger(tab.id) && tab.id >= 0 &&
          tab.status === 'complete' && !tab.pendingUrl && isNativePpReference(tab.url, target));
      if (job.selection) {
        const selected = references.find(tab => tab.id === job.selection!.tabId);
        if (!selected || await ppTabSelectionToken(selected) !== job.selection.selectionToken) return reply(job.id, job.entityId, 'unavailable', 'Selected reference changed. Check the connection and select it again.');
        references = [selected];
      }
      if (job.cancelled) return reply(job.id, job.entityId, 'cancelled', 'Preview cancelled before opening a helper tab.');
      if (!references.length) return reply(job.id, job.entityId, 'unavailable',
        `Open Magento record ${job.entityId} as a reference tab, then retry. Its address is used privately; your draft remains untouched.`);
      if (references.length !== 1) return reply(job.id, job.entityId, 'unavailable',
        `Keep only one reference edit tab for Magento record ${job.entityId} open, then retry. No helper was opened.`);
      const reference = references[0]!;
      const current = await chrome.tabs.get(reference.id!);
      if (job.cancelled) return reply(job.id, job.entityId, 'cancelled', 'Preview cancelled before opening a helper tab.');
      if (current.status !== 'complete' || current.pendingUrl || current.url !== reference.url || !isNativePpReference(current.url, target)) {
        return reply(job.id, job.entityId, 'unavailable', 'The exact-record reference tab changed. Reopen the target record and retry; its draft was not read.');
      }
      nativeUrl = current.url;
    }
    // Only the owned helper loads this unchanged, private native address.
    const created = await chrome.tabs.create({ url: nativeUrl, active: false });
    if (typeof created.id !== 'number') throw new Error('No owned tab');
    job.tabId = created.id;
    job.onRemoved = id => {
      if (id !== job.tabId) return;
      job.removed = true;
      if (leftover === job) leftover = null;
      if (job.onRemoved) chrome.tabs.onRemoved.removeListener(job.onRemoved);
    };
    chrome.tabs.onRemoved.addListener(job.onRemoved);
    started = Date.now();
    const deadline = started + MAX_WAIT;
    readiness = { elapsedMs: 0, checks: 0, extractions: 0, warningCodes: [] };
    let nextExtractionAt = started;
    let cycleCount = 0;
    while (Date.now() < deadline && !job.cancelled) {
      const before = await bounded(chrome.tabs.get(job.tabId), deadline - Date.now(), job);
      cycleCount += 1;
      if (job.cancelled) break;
      if (before.status === 'complete' && !before.pendingUrl) {
        const url = new URL(before.url ?? '');
        if (/\/(?:auth\/login|admin\/index\/index)(?:\/|$)/i.test(url.pathname)) {
          response = reply(job.id, job.entityId, 'auth', 'Magento redirected to sign-in. Sign in yourself, then retry.'); break;
        }
        if (url.origin !== wanted.origin || ppRoutePathFromUrl(url.href) !== safePath) {
          response = reply(job.id, job.entityId, 'unavailable', 'Magento redirected away from the requested PP entity. No snapshot accepted.'); break;
        }
        readiness.checks++;
        let checkpoint: PpReadinessCheckpoint | undefined;
        try {
          const [probe] = await bounded(chrome.scripting.executeScript({
            target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: readPpReadiness, args: [job.entityId],
          }), deadline - Date.now(), job);
          if (probe && probe.frameId !== 0) { readiness.warningCodes = ['wrong-frame']; response.reason = 'Readiness check returned from an unexpected frame. No snapshot accepted.'; break; }
          checkpoint = safeReadiness(probe?.result);
        } catch { checkpoint = undefined; }
        readiness.last = checkpoint ?? { document: 'unknown', stage: 'read-error', registry: 'unknown', provider: 'unknown', data: 'unknown', identity: 'unknown', blockedAccessor: false };
        if (job.cancelled) break;
        if (cycleCount % 6 === 0) {
          const afterProbe = await bounded(chrome.tabs.get(job.tabId), deadline - Date.now(), job);
          if (afterProbe.url !== before.url || afterProbe.pendingUrl || afterProbe.status !== 'complete') {
            response = reply(job.id, job.entityId, 'unavailable', 'The helper document changed or returned an invalid identity. No snapshot accepted.'); break;
          }
        }
        if (checkpoint?.stage === 'route-mismatch' || checkpoint?.identity === 'mismatched' || checkpoint?.identity === 'invalid') {
          response = reply(job.id, job.entityId, 'unavailable', 'The readiness check found an invalid or mismatched route/provider identity. No snapshot accepted.'); break;
        }
        if (readiness.extractions < MAX_INJECTIONS && Date.now() >= nextExtractionAt && Date.now() < deadline) {
          readiness.extractions++;
          nextExtractionAt = started + readiness.extractions * EXTRACTION_GAP;
          let injection: chrome.scripting.InjectionResult<unknown> | undefined, extractionFailed = false;
          try {
            [injection] = await bounded(chrome.scripting.executeScript({
              target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: scanCurrentPpDraft,
            }), deadline - Date.now(), job);
          } catch { extractionFailed = true; readiness.lastScanStatus = 'injection-error'; readiness.warningCodes = ['injection-error']; }
          if (job.cancelled) break;
          const after = await bounded(chrome.tabs.get(job.tabId), deadline - Date.now(), job);
          if (after.url !== before.url || after.pendingUrl || after.status !== 'complete') {
            response = reply(job.id, job.entityId, 'unavailable', 'The helper document changed during extraction. No snapshot accepted.'); break;
          }
          if (injection && injection.frameId !== 0) { readiness.warningCodes = ['wrong-frame']; response.reason = 'Extraction returned from an unexpected frame. No snapshot accepted.'; break; }
          const result: unknown = injection?.result;
          if (!injection || result == null) {
            if (!extractionFailed) { readiness.lastScanStatus = 'no-result'; readiness.warningCodes = ['no-scan-result']; }
          } else if (!isPpDraftScanResponse(result)) {
            readiness.lastScanStatus = 'invalid-result'; readiness.warningCodes = ['invalid-scan-result'];
            response.reason = 'The helper returned an invalid snapshot. No snapshot accepted.'; break;
          } else {
            readiness.lastScanStatus = result.status;
            readiness.warningCodes = classifyScanWarnings(result);
            if (result.entityId !== job.entityId || result.routePath !== safePath || result.status === 'identity-mismatch' ||
              (result.providerEntityId !== undefined && String(result.providerEntityId) !== job.entityId)) {
              readiness.warningCodes = ['identity-mismatch'];
              response = reply(job.id, job.entityId, 'unavailable', 'The Magento route and provider entity do not match. No snapshot accepted.'); break;
            }
            if ((result.status === 'ok' || result.status === 'partial') && String(result.providerEntityId) === job.entityId) {
              const accepted: PpFreshFormResponse = { ...reply(job.id, job.entityId, result.status, 'Fresh Magento form load. This is not a certified saved-server snapshot or an existing user draft.'),
                host: wanted.hostname, readAt: Date.now(), snapshot: { ...result,
                  routePath: `/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/${job.entityId}` } };
              // Magento renders the Items rows only after the Options tab opens. Open it in
              // our owned helper so the visible technique names can be read, then read again.
              if (!result.itemLabels && result.items.rows.length > 0 && labelActivations < 3 && job.tabId !== undefined) {
                labelActivations += 1;
                labelPending = accepted;
                try {
                  await bounded(chrome.scripting.executeScript({
                    target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: activatePpOptionsTab,
                  }), deadline - Date.now(), job);
                } catch { /* activation is best effort; the snapshot stays usable */ }
              } else {
                response = accepted;
                break;
              }
            }
          }
        }
      } else readiness.last = { document: 'unknown', stage: 'document-loading', registry: 'unknown', provider: 'unknown', data: 'unknown', identity: 'unknown', blockedAccessor: false };
      await new Promise(resolve => setTimeout(resolve, Math.min(POLL_MS, Math.max(0, deadline - Date.now()))));
    }
    if (response.status === 'unavailable' && Date.now() >= deadline) response.reason = 'The fresh form did not yield a matching snapshot within the 30-second readiness budget. See the last readiness checkpoint.';
    if (labelPending && response.status === 'unavailable' && Date.now() >= deadline) response = labelPending;
    if (job.cancelled) response = reply(job.id, job.entityId, 'cancelled', 'Preview cancelled. No further reads will run.');
  } catch {
    response = reply(job.id, job.entityId, job.cancelled ? 'cancelled' : 'unavailable',
      job.cancelled ? 'Preview cancelled.' : 'The selected Magento source read failed or timed out. Retry explicitly.');
  } finally {
    if (reference) response.reference = reference;
    if (readiness) { readiness.elapsedMs = Math.max(0, Date.now() - started); response.readiness = readiness; }
    const closed = await closeOwned(job);
    if (closed && job.onRemoved) chrome.tabs.onRemoved.removeListener(job.onRemoved);
    if (job.tabId !== undefined) {
      response.cleanup = closed ? 'closed' : 'failed';
      if (!closed) {
        leftover = job;
        response.status = 'cleanup-failed'; response.leftoverTabId = job.tabId;
        response.reason = `Helper tab ${job.tabId} could not be closed. Retry closing it or close that helper tab manually. Further previews are blocked.`;
      }
    }
    if (active === job) active = null;
  }
  return response;
}


/** Planned additions must already name one face and one exact catalogue id. */
function validPlanRows(value: unknown): value is PpApplyPlanRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) return false;
  return value.every(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const row = entry as PpApplyPlanRow;
    return typeof row.face === 'string' && row.face.length > 0 && row.face.length <= 120 &&
      typeof row.magentoFace === 'string' && row.magentoFace.length > 0 && row.magentoFace.length <= 120 &&
      typeof row.technique === 'string' && row.technique.length > 0 && row.technique.length <= 200 &&
      typeof row.catalogueId === 'string' && /^[1-9]\d{0,15}$/.test(row.catalogueId);
  });
}

/**
 * A run that had nothing to do is not a failure: all rows skipped means they were already there.
 */
export function ppApplyStatus(done: number, failed: number, skipped: number): 'applied' | 'partial' | 'failed' {
  if (failed > 0) return done > 0 ? 'partial' : 'failed';
  if (done > 0) return 'applied';
  return skipped > 0 ? 'applied' : 'failed';
}

function validApplyReport(value: unknown): value is { results: PpApplyPlanResult[]; reason: string } {
  if (!value || typeof value !== 'object') return false;
  const report = value as { results?: unknown; reason?: unknown };
  if (typeof report.reason !== 'string' || !Array.isArray(report.results) || report.results.length > 25) return false;
  return report.results.every(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const result = entry as PpApplyPlanResult;
    return ['added', 'removed', 'ordered', 'failed', 'skipped'].includes(result.outcome) && typeof result.reason === 'string' &&
      typeof result.face === 'string' && typeof result.technique === 'string' && typeof result.catalogueId === 'string';
  });
}

const waitMs = (milliseconds: number): Promise<void> => new Promise(resolve => setTimeout(resolve, milliseconds));

async function closeHelperTab(job: ReadJob): Promise<void> {
  if (job.tabId === undefined) return;
  const tabId = job.tabId;
  job.tabId = undefined;
  await chrome.tabs.remove(tabId).then(() => undefined, () => undefined);
}

/** Fill the missing technique rows in an owned helper tab. It never saves, closes or touches a user tab. */
async function runApply(job: ReadJob): Promise<ApplyPpPlanResponse> {
  const mode = job.mode ?? 'add';
  const base: ApplyPpPlanResponse = { source: 'fresh-magento-form', requestId: job.id, entityId: job.entityId, mode,
    status: 'unavailable', reason: mode === 'remove'
      ? 'The form could not be changed safely. Nothing was saved.'
      : 'The form could not be filled safely. Nothing was saved.', keptOpen: false, results: [] };
  const success = mode === 'remove' ? 'removed' : mode === 'order' ? 'ordered' : mode === 'rebuild' ? 'added' : 'added';
  const fail = (status: ApplyPpPlanResponse['status'], reason: string): ApplyPpPlanResponse => ({ ...base, status, reason });
  const keep = (response: ApplyPpPlanResponse): ApplyPpPlanResponse => ({ ...response, keptOpen: true, tabId: job.tabId });
  let readiness: PpFreshReadiness | undefined;
  const started = Date.now();
  try {
    const settings = await bounded(chrome.storage.local.get(['adminBaseUrl']), 5000, job);
    const target = freshFormUrl(settings.adminBaseUrl, job.entityId);
    if (!target) return fail('invalid', issueReason(freshFormIssue(settings.adminBaseUrl, job.entityId) ?? 'rejected-base'));
    if (job.referenceSource !== 'options-grid' && job.referenceSource !== 'exact-record') return fail('invalid',
      'Choose the Options Grid or an exact-record tab. An open user draft is never changed.');
    const wanted = new URL(target);
    let nativeUrl: string;
    if (job.referenceSource === 'options-grid') {
      const selected = await gridReference(job, target);
      if (job.cancelled) return fail('cancelled', 'Apply cancelled before a helper tab was opened.');
      if (!selected.url) return fail('unavailable', selected.reason);
      nativeUrl = selected.url;
    } else {
      let references = (await bounded(chrome.tabs.query({ url: [target.replace(/\/$/, ''), `${target}*`] }), 5000, job))
        .filter(tab => typeof tab.id === 'number' && Number.isInteger(tab.id) && tab.id >= 0 &&
          tab.status === 'complete' && !tab.pendingUrl && isNativePpReference(tab.url, target));
      if (job.selection) {
        const selected = references.find(tab => tab.id === job.selection!.tabId);
        if (!selected || await ppTabSelectionToken(selected) !== job.selection.selectionToken) return fail('invalid',
          'Selected reference changed. Check the connection and select it again.');
        references = [selected];
      }
      if (!references.length) return fail('unavailable', `Open Magento record ${job.entityId} as a reference tab, then retry.`);
      if (references.length !== 1) return fail('unavailable', 'Keep only one reference edit tab for this entity open, then retry.');
      nativeUrl = references[0]!.url!;
    }
    if (job.cancelled) return fail('cancelled', 'Apply cancelled before a helper tab was opened.');
    const created = await bounded(chrome.tabs.create({ url: nativeUrl, active: false }), 10_000, job);
    if (typeof created.id !== 'number') return fail('unavailable', 'No helper tab could be opened. Nothing was changed.');
    job.tabId = created.id;
    const deadline = Date.now() + MAX_WAIT;
    readiness = { elapsedMs: 0, checks: 0, extractions: 0, warningCodes: [] };
    let ready = false;
    while (Date.now() < deadline && !job.cancelled) {
      const tab = await bounded(chrome.tabs.get(job.tabId), Math.max(1, deadline - Date.now()), job);
      if (tab.status === 'complete' && !tab.pendingUrl) {
        const url = new URL(tab.url ?? '');
        if (/\/(?:auth\/login|admin\/index\/index)(?:\/|$)/i.test(url.pathname)) {
          await closeHelperTab(job);
          return fail('auth', 'Magento redirected to sign-in. Sign in yourself, then retry.');
        }
        if (url.origin !== wanted.origin || ppRoutePathFromUrl(url.href) !== ppRoutePathFromUrl(target)) {
          await closeHelperTab(job);
          return fail('unavailable', 'Magento redirected away from the requested PP entity. Nothing was changed.');
        }
        readiness.checks++;
        const [probe] = await bounded(chrome.scripting.executeScript({
          target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: readPpReadiness, args: [job.entityId],
        }), 5000, job);
        const checkpoint = safeReadiness(probe?.result);
        readiness.last = checkpoint ?? { document: 'unknown', stage: 'read-error', registry: 'unknown',
          provider: 'unknown', data: 'unknown', identity: 'unknown', blockedAccessor: false };
        if (checkpoint?.stage === 'ready' && checkpoint.identity === 'matching') { ready = true; break; }
        if (checkpoint?.stage === 'route-mismatch' || checkpoint?.identity === 'mismatched' || checkpoint?.identity === 'invalid') {
          await closeHelperTab(job);
          return fail('unavailable', 'The helper form identity does not match the target entity. Nothing was changed.');
        }
      }
      await waitMs(POLL_MS);
    }
    if (job.cancelled) { await closeHelperTab(job); return fail('cancelled', 'Apply cancelled. Nothing was saved.'); }
    if (!ready) {
      await closeHelperTab(job);
      readiness.elapsedMs = Date.now() - started;
      return { ...fail('unavailable', 'The helper form was not ready in time. Nothing was changed.'), readiness };
    }
    // A fill waits for the native Add Item button, the face dropdown, the technique dropdown and
    // the table order on every row, so seven additions can legitimately pass 90 seconds. Order
    // and remove touch one row per planned row and keep the shorter budget.
    const budget = mode === 'add' || mode === 'rebuild' ? 200_000 : 90_000;
    // Magento only renders the Items once the Options tab opens, in either mode.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: activatePpOptionsTab,
      });
    } catch { /* the form is usable either way */ }
    await waitMs(400);
    // The placement lane opens the Options tab itself and waits for the real table, so no probe
    // here decides when it runs.
    let report: unknown;
    if (mode === 'rebuild') {
      // Rebuild: remove the out-of-order rows, then re-add them in plan order.
      // The plan rows are all rows in Notion order. The remove step deletes them all from
      // the form, then the add step places them back in plan order at the tail of their face.
      // This gives each row a fresh record id that is higher than the rows left in place,
      // so the server stores them last — fixing both the admin display and the frontend order.
      let removeReport: unknown;
      try {
        const [removeInjection] = await bounded(chrome.scripting.executeScript({
          target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: removePpItemRows, args: [job.plan ?? []],
        }) as Promise<chrome.scripting.InjectionResult<unknown>[]>, budget, job);
        if (job.cancelled) return keep({ ...fail('cancelled', 'Apply cancelled. Nothing was saved.'), results: [] });
        removeReport = removeInjection?.result;
      } catch (error) {
        return keep(fail('unavailable', ppLaneFailure('remove', error, budget / 1000)));
      }
      const removeResult = (removeReport && typeof removeReport === 'object' ? removeReport : null) as
        { results?: Array<{ outcome: string; reason: string; face: string; technique: string; catalogueId: string }> } | null;
      const removeFailed = removeResult?.results?.filter(r => r.outcome !== 'removed') ?? [];
      if (removeFailed.length) {
        const why = removeFailed.map(r => `${r.technique}: ${r.reason}`).join('; ');
        return keep(fail('unavailable', `The rebuild could not remove ${removeFailed.length} row(s): ${why}. Nothing was re-added; check the helper tab before saving.`));
      }
      // Brief wait for Knockout to re-render after the removal.
      await waitMs(600);
      if (job.cancelled) return keep({ ...fail('cancelled', 'Apply cancelled. Nothing was saved.'), results: [] });
      // Now re-add the same rows in plan order.
      try {
        const [addInjection] = await bounded(chrome.scripting.executeScript({
          target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: applyPpPlanRows, args: [job.plan ?? []],
        }) as Promise<chrome.scripting.InjectionResult<unknown>[]>, budget, job);
        if (job.cancelled) return keep({ ...fail('cancelled', 'Apply cancelled. Nothing was saved.'), results: [] });
        report = addInjection?.result;
      } catch (error) {
        return keep(fail('unavailable', ppLaneFailure('re-add', error, budget / 1000)));
      }
    } else if (mode === 'add' && (job.plan ?? []).length > 3) {
      // A fill is slow per row: each addition waits for the native Add Item button, the face
      // dropdown, the technique dropdown and the table order, so seven rows can outlast any single
      // budget. Three rows per call keeps each call bounded and lets the form be read between
      // calls. The page counts the rows already on the form, so a batch never doubles a row.
      const rows = job.plan ?? [];
      const collected: PpApplyPlanResult[] = [];
      // The last batch's placement account is kept, so the Order lane panel explains a fill even
      // when it ran in several calls.
      let placement: PpOrderDiagnostics | undefined;
      for (let at = 0; at < rows.length; at += 3) {
        if (job.cancelled) return keep({ ...fail('cancelled', 'Apply cancelled. Nothing was saved.'), results: collected });
        try {
          const [injection] = await bounded(chrome.scripting.executeScript({
            target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: applyPpPlanRows,
            args: [rows.slice(at, at + 3)],
          }) as Promise<chrome.scripting.InjectionResult<unknown>[]>, 90_000, job);
          const part = injection?.result as { results?: PpApplyPlanResult[]; reason?: string;
            diagnostics?: PpOrderDiagnostics } | undefined;
          if (!Array.isArray(part?.results)) return keep(fail('unavailable',
            'A fill batch returned no report. Check the helper tab before retrying; nothing was saved.'));
          collected.push(...part.results);
          if (part.diagnostics) placement = part.diagnostics;
        } catch (error) {
          const current = await readHelperForm(job);
          // Rows from the batches that finished are in the form, so the panel must offer the save
          // instead of reporting a plain failure.
          const landed = collected.filter(result => result.outcome === 'added').length;
          return keep({ ...fail(landed > 0 ? 'partial' : 'unavailable', ppLaneFailure('fill', error, 90) +
            (landed > 0 ? ` ${landed} row(s) from the finished batches are in the form.` : '') +
            (current ? ` The form holds ${current.items.rows.length} item row(s) now.` : '')), results: collected,
            ...(current ? { snapshot: current, readAt: Date.now() } : {}) });
        }
      }
      report = { results: collected, reason: 'The planned rows were filled in batches.',
        ...(placement ? { diagnostics: placement } : {}) };
    } else {
      try {
        const running = mode === 'remove'
          ? chrome.scripting.executeScript({
            target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: removePpItemRows, args: [job.plan ?? []],
          })
          : mode === 'order'
            ? chrome.scripting.executeScript({
              target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: placePpItemRows,
              args: [job.plan ?? [], true, null, 'plan'],
            })
            : chrome.scripting.executeScript({
              target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: applyPpPlanRows, args: [job.plan ?? []],
            });
        const [injection] = await bounded(running as Promise<chrome.scripting.InjectionResult<unknown>[]>, budget, job);
        if (job.cancelled) return keep({ ...fail('cancelled', 'Apply cancelled. Nothing was saved.'), results: [] });
        report = injection?.result;
      } catch (error) {
        const current = await readHelperForm(job);
        return keep({ ...fail('unavailable', ppLaneFailure(mode === 'remove' ? 'remove' : mode === 'order' ? 'order' : 'fill', error, budget / 1000) +
          (current ? ` The form holds ${current.items.rows.length} item row(s) now.` : '')), results: [],
          ...(current ? { snapshot: current, readAt: Date.now() } : {}) });
      }
    }
    readiness.elapsedMs = Date.now() - started;
    // The placement lane reports counts, so its answer is turned into the same row reports the
    // other lanes return before it is validated and summarised.
    if (mode === 'order') {
      const placement = (report && typeof report === 'object' ? report : null) as Partial<PpPlacementReport> | null;
      const why = typeof placement?.reason === 'string' && placement.reason
        ? placement.reason : 'The rows are at their face in the plan order.';
      // The lane names the plan rows it placed, so each row is reported on its own index. A report
      // without that list marks nothing placed, which is safer than crediting rows that did not move.
      const movedRows = new Set(Array.isArray(placement?.orderedRows) ? placement.orderedRows : []);
      report = {
        reason: why,
        diagnostics: placement?.diagnostics,
        results: (job.plan ?? []).map((row, at) => ({
          face: row.face, technique: row.technique, catalogueId: row.catalogueId,
          outcome: movedRows.has(at) ? 'ordered' : 'failed',
          reason: movedRows.has(at) ? 'Moved to its plan position in the record list, unsaved.' : why,
        })),
      };
    }
    if (!validApplyReport(report)) return { ...keep(fail('unavailable', 'The form returned an invalid apply report.')), readiness };
    const done = report.results.filter(result => result.outcome === success).length;
    const failed = report.results.filter(result => result.outcome === 'failed').length;
    const skipped = report.results.length - done - failed;
    const status: ApplyPpPlanResponse['status'] = ppApplyStatus(done, failed, skipped);
    // The operator works in the dashboard, so the helper stays in the background and the
    // dashboard is handed back instead of leaving them on the Magento tab.
    if (typeof job.owner === 'number' && Number.isSafeInteger(job.owner) && job.owner >= 0 && job.owner !== job.tabId) {
      try { await chrome.tabs.update(job.owner, { active: true }); } catch { /* the dashboard may be closed */ }
    }
    // Read the filled form again, so the panel shows the page as it now is instead of only the
    // report.
    const snapshot = await readHelperForm(job);
    return { ...base, status, keptOpen: true, tabId: job.tabId, results: report.results,
      ...(snapshot ? { snapshot, readAt: Date.now() } : {}),
      diagnostics: (report as { diagnostics?: unknown }).diagnostics, readiness,
      reason: mode === 'remove'
        ? `${done} removed, ${failed} failed, ${skipped} skipped. Nothing is saved yet: review the form, then save it from PP Preview or press Magento's own Save.`
        : mode === 'order'
          ? `${done} row(s) moved to the plan order in the record list, ${failed} failed, ${skipped} skipped. Nothing is saved yet: review the form, then save it from PP Preview or press Magento's own Save.`
          : mode === 'rebuild'
            ? `${done} row(s) removed and re-added in Notion order, ${failed} failed, ${skipped} skipped. Nothing is saved yet: review the form, then save it from PP Preview or press Magento's own Save.`
            : `${done} added, ${failed} failed, ${skipped} skipped. Nothing is saved yet: review the form, then save it from PP Preview or press Magento's own Save.` };
  } catch {
    return { ...fail(job.cancelled ? 'cancelled' : 'unavailable', job.cancelled ? 'Apply cancelled.' :
      'The form could not be filled safely. Nothing was saved.'), results: [], tabId: job.tabId !== undefined ? job.tabId : undefined,
      keptOpen: job.tabId !== undefined };
  } finally {
    if (active === job) active = null;
  }
}

export async function applyPpPlan(id: unknown, entityId: unknown, owner: number | undefined, referenceSource: unknown,
  selection: PpSourceSelection | undefined, rows: unknown, mode: 'add' | 'remove' | 'order' | 'rebuild' = 'add'): Promise<ApplyPpPlanResponse> {
  // A mode the request did not name exactly is an add: removal rows would otherwise be
  // filled as if they were additions.
  const kind: 'add' | 'remove' | 'order' | 'rebuild' = mode === 'remove' ? 'remove' : mode === 'order' ? 'order' : mode === 'rebuild' ? 'rebuild' : 'add';
  const refused = (status: ApplyPpPlanResponse['status'], reason: string): ApplyPpPlanResponse => ({
    source: 'fresh-magento-form', requestId: typeof id === 'string' ? id : '', entityId: typeof entityId === 'string' ? entityId : '',
    mode: kind, status, reason, keptOpen: false, results: [] });
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id) || typeof entityId !== 'string' || !/^[1-9]\d{0,15}$/.test(entityId) ||
    (referenceSource !== 'options-grid' && referenceSource !== 'exact-record') ||
    (selection !== undefined && !validSelection(selection)) || !validPlanRows(rows)) {
    return refused('invalid', 'Invalid apply request. Choose the exact entity, tab and resolved plan rows.');
  }
  const stale = await blockingLeftover();
  if (stale) return refused('busy', `Helper tab ${stale.tabId} still needs closing before another helper job.`);
  const held = await filledTab();
  if (held !== undefined) {
    return refused('busy', `Helper tab ${held} still holds an unsaved form. Save or close it before another apply.`);
  }
  if (active) return refused('busy', 'Another helper job is still running. Stop it or wait before retrying.');
  const job: ReadJob = { id, entityId, owner, cancelled: false, referenceSource, selection, done: undefined!, plan: rows, mode: kind };
  const applied = runApply(job);
  job.done = applied as unknown as Promise<PpFreshFormResponse>;
  active = job;
  const response = await applied;
  if (response.keptOpen && response.tabId !== undefined) await setApplyTab(response.tabId, entityId);
  return response;
}

const GRID_ROUTE = /\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/index(?:\/|$)/i;

/** The native Save control was clicked; a navigation can cut the injected call short. */
async function pressNativeSave(tabId: number, fromUrl: string): Promise<PpSavePress> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] }, world: 'MAIN', func: pressPpSave,
    });
    const result = injection?.result as PpSavePress | undefined;
    if (result && typeof result.clicked === 'boolean') return result;
  } catch { /* the click can navigate before the call answers */ }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== fromUrl || tab.pendingUrl || tab.status === 'loading') {
      return { clicked: true, label: 'Save', reason: '' };
    }
  } catch { /* fall through to the refusal below */ }
  return { clicked: false, label: '', reason: 'The page did not accept the Save click. Reload the helper tab and try again; nothing was written.' };
}

function safeSaveOutcome(value: unknown): PpSaveOutcome {
  const read = (list: unknown): string[] => Array.isArray(list)
    ? list.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0 && entry.length <= 400).slice(0, 5)
    : [];
  const outcome = value as { success?: unknown; errors?: unknown } | null;
  return { success: read(outcome?.success), errors: read(outcome?.errors) };
}

async function readSaveOutcomeIn(tabId: number): Promise<PpSaveOutcome> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] }, world: 'MAIN', func: readPpSaveOutcome,
    });
    return safeSaveOutcome(injection?.result);
  } catch { return { success: [], errors: [] }; }
}

/** Reopen the record and read it again, so the write is judged from stored data. */
async function readStoredPp(tabId: number, url: string, entityId: string): Promise<{ snapshot?: ScanPpDraftResponse; reason: string }> {
  const deadline = Date.now() + MAX_WAIT;
  try { await chrome.tabs.update(tabId, { url }); }
  catch { return { reason: 'the saved record could not be reopened' }; }
  const routePath = ppRoutePathFromUrl(url);
  // Magento renders the item rows, and the labels they show, only after its Options tab opens.
  let opened = false;
  while (Date.now() < deadline) {
    await waitMs(POLL_MS);
    let tab: chrome.tabs.Tab;
    try { tab = await chrome.tabs.get(tabId); } catch { return { reason: 'the read-back tab closed before it could be read' }; }
    if (tab.url) {
      let pathname = '';
      try { pathname = new URL(tab.url).pathname; } catch { pathname = ''; }
      if (/\/(?:auth\/login|admin\/index\/index)(?:\/|$)/i.test(pathname)) {
        return { reason: 'Magento asked for sign-in again, so the read-back did not run' };
      }
    }
    if (tab.status === 'complete' && !tab.pendingUrl && tab.url && routePath && ppRoutePathFromUrl(tab.url) === routePath) {
      if (!opened) {
        opened = true;
        try {
          await chrome.scripting.executeScript({
            target: { tabId, frameIds: [0] }, world: 'MAIN', func: activatePpOptionsTab,
          });
        } catch { /* the scan below still reports what it can */ }
        await waitMs(400);
      }
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] }, world: 'MAIN', func: scanCurrentPpDraft,
        });
        const result: unknown = injection?.result;
        if (injection?.frameId === 0 && isPpDraftScanResponse(result) && result.entityId === entityId &&
          String(result.providerEntityId) === entityId && ['ok', 'partial'].includes(result.status)) {
          return { snapshot: result, reason: '' };
        }
      } catch { /* the form is still booting; retry until the deadline */ }
    }
  }
  return { reason: 'the record was not ready to read within 30 seconds' };
}

/** Read the open helper form as it is now. It never reloads the tab, so unsaved rows survive. */
async function readHelperForm(job: ReadJob): Promise<ScanPpDraftResponse | undefined> {
  if (job.tabId === undefined) return undefined;
  try {
    const [injection] = await bounded(chrome.scripting.executeScript({
      target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: scanCurrentPpDraft,
    }), 10_000, job);
    const result: unknown = injection?.result;
    if (injection?.frameId === 0 && isPpDraftScanResponse(result) && result.entityId === job.entityId &&
      String(result.providerEntityId) === job.entityId && ['ok', 'partial'].includes(result.status)) return result;
  } catch { /* the caller keeps its own message */ }
  return undefined;
}

async function readBackInNewTab(url: string, entityId: string): Promise<{ snapshot?: ScanPpDraftResponse; reason: string }> {
  let created: chrome.tabs.Tab;
  try { created = await chrome.tabs.create({ url, active: false }); }
  catch { return { reason: 'the record could not be reopened' }; }
  const id = created.id;
  if (typeof id !== 'number') return { reason: 'the record could not be reopened' };
  const stored = await readStoredPp(id, url, entityId);
  await chrome.tabs.remove(id).catch(() => undefined);
  return stored;
}

/** Press Magento's own Save in the filled helper tab, then read the record again. */
export async function savePpForm(requestId: unknown, entityId: unknown, tabId: unknown, rows: unknown,
  owner?: number, arrangement?: unknown): Promise<SavePpFormResponse> {
  const base: SavePpFormResponse = { source: 'pp-save', requestId: typeof requestId === 'string' ? requestId : '',
    entityId: typeof entityId === 'string' ? entityId : '', status: 'invalid', reason: '', keptOpen: false };
  const refused = (status: SavePpFormResponse['status'], reason: string): SavePpFormResponse => ({ ...base, status, reason });
  if (typeof requestId !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(requestId) || typeof entityId !== 'string' ||
    !/^[1-9]\d{0,15}$/.test(entityId) || !Number.isSafeInteger(tabId) || (tabId as number) < 0 ||
    !Array.isArray(rows) || rows.length > 25 || (rows.length > 0 && !validPlanRows(rows))) {
    return refused('invalid', 'Invalid save request. Preview and apply the plan first.');
  }
  const filled = await filledTab();
  if (filled === undefined) return refused('invalid',
    'No filled helper form is recorded in this browser session, so there is nothing to save. Preview, apply the plan, then save.');
  if (filled !== tabId) return { ...refused('invalid',
    `The filled form is in helper tab ${filled}, not in the tab this dashboard asked to save. Reload the dashboard and save that tab, or apply the plan again.`),
    keptOpen: true, tabId: filled };
  const stopped = await blockingLeftover();
  if (active || stopped) return refused('busy', 'Another helper job is still running. Wait for it before saving.');
  const helper = tabId as number;
  try {
    // Wait briefly for a navigation to settle, then judge only the record address.
    let before = await chrome.tabs.get(helper);
    for (let wait = 0; wait < 6 && (before.pendingUrl || before.status === 'loading'); wait += 1) {
      await waitMs(250);
      before = await chrome.tabs.get(helper);
    }
    if (!isPpHelperEditUrl(before.url, entityId)) {
      let pathname = '';
      try { pathname = new URL(before.url ?? '').pathname; } catch { pathname = ''; }
      if (/\/(?:auth\/login|admin\/index\/index)(?:\/|$)/i.test(pathname)) {
        return { ...refused('invalid', 'Magento asked for sign-in again, so that tab no longer holds the form. Sign in, then apply and save again.'),
          keptOpen: true, tabId: helper };
      }
      return { ...refused('invalid', ppEntityIdFromUrl(before.url ?? '') === entityId
        ? 'The helper tab is not on the expected edit form. Nothing was pressed.'
        : 'The helper tab is showing a different record. Nothing was pressed.'), keptOpen: true, tabId: helper };
    }
    // Magento renders the custom-option Items only after its Options tab opens, and the
    // operator asked for that selection to be made before saving. View only.
    // The tab is also brought to the front first: a hidden tab can defer Magento's own
    // handlers, which is why the press used to need the operator to open it by hand.
    try { await chrome.tabs.update(helper, { active: true }); } catch { /* the press still runs */ }
    await waitMs(300);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: helper, frameIds: [0] }, world: 'MAIN', func: activatePpOptionsTab,
      });
    } catch { /* the form state is loaded either way */ }
    await waitMs(400);
    // A reload or an edit drops the added rows without changing the tab id, and Save would
    // then write the form without them. Check the plan is still in the form before pressing.
    // Each planned row needs its own row in the form, so a technique the plan names twice needs
    // two rows there, and one stored copy never satisfies both. The counts do that.
    const expected = rows.map(row => ppItemPair(row.magentoFace, row.catalogueId));
    if (expected.length) {
      let found: string[] = [];
      try {
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: helper, frameIds: [0] }, world: 'MAIN', func: readPpItemPairs,
        });
        const value: unknown = injection?.result;
        if (Array.isArray(value)) found = value.filter((entry): entry is string => typeof entry === 'string');
      } catch { found = []; }
      const available = new Map<string, number>();
      for (const pair of found) available.set(pair, (available.get(pair) ?? 0) + 1);
      let missing = 0;
      for (const pair of expected) {
        const left = available.get(pair) ?? 0;
        if (left > 0) available.set(pair, left - 1); else missing += 1;
      }
      if (missing) {
        return { ...refused('blocked', `${missing} of ${expected.length} planned item row(s) are not in that helper form any more. Reloading or editing that tab discards unsaved rows: apply the plan again, then save.`),
          keptOpen: true, tabId: helper };
      }
    }
    // A re-render between apply and save can restore the old order, so the rows are placed
    // again here and the posted indices follow the visible order. A wrong order is never saved.
    let placement: Record<string, unknown> | null = null;
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: helper, frameIds: [0] }, world: 'MAIN', func: placePpItemRows,
        args: [rows, true, null, arrangement === 'plan' ? 'plan' : 'append'],
      });
      const value: unknown = injection?.result;
      placement = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    } catch { placement = null; }
    const reportedTotal = placement ? placement.total : undefined;
    const reportedOrdered = placement ? placement.ordered : undefined;
    const planned = typeof reportedTotal === 'number' ? reportedTotal : 0;
    const inPlace = typeof reportedOrdered === 'number' ? reportedOrdered : 0;
    if (planned > 0 && inPlace < planned) {
      return { ...refused('blocked', `The added rows are not at the end of their face in that helper form (${inPlace} of ${planned}). Nothing was pressed; move or delete those rows, then apply again.`),
        keptOpen: true, tabId: helper };
    }
    // Nothing was pressed yet, so a short retry is still a single press: the page may be binding.
    let pressed = await pressNativeSave(helper, before.url);
    for (let attempt = 1; !pressed.clicked && attempt <= 2; attempt += 1) {
      await waitMs(400);
      pressed = await pressNativeSave(helper, before.url);
    }
    if (!pressed.clicked) return { ...refused('blocked', pressed.reason), keptOpen: true, tabId: helper };
    const deadline = Date.now() + MAX_WAIT;
    let navigated = false, outcome: PpSaveOutcome = { success: [], errors: [] };
    while (Date.now() < deadline) {
      await waitMs(POLL_MS);
      let tab: chrome.tabs.Tab;
      try { tab = await chrome.tabs.get(helper); } catch { break; }
      if (tab.pendingUrl || tab.status === 'loading') continue;
      navigated = !!tab.url && tab.url !== before.url;
      outcome = await readSaveOutcomeIn(helper);
      if (outcome.errors.length || outcome.success.length || navigated) break;
    }
    const magentoMessage = outcome.errors[0] ?? outcome.success[0];
    if (outcome.errors.length) {
      return { ...base, status: 'rejected',
        reason: 'Magento rejected the save. Fix what it reports in the helper tab, then press its Save yourself.',
        magentoMessage, keptOpen: true, tabId: helper, readAt: Date.now() };
    }
    let finalUrl = before.url;
    try { finalUrl = (await chrome.tabs.get(helper)).url ?? before.url; } catch { /* keep the known address */ }
    let onGrid = false;
    try { onGrid = GRID_ROUTE.test(new URL(finalUrl).pathname); } catch { onGrid = false; }
    if (outcome.success.length || onGrid) {
      const stored = await readStoredPp(helper, before.url, entityId);
      await setApplyTab(undefined);
      if (stored.snapshot) {
        await chrome.tabs.remove(helper).catch(() => undefined);
        // The helper was in front for the press, so hand the dashboard back.
        if (typeof owner === 'number' && Number.isSafeInteger(owner) && owner >= 0 && owner !== helper) {
          try { await chrome.tabs.update(owner, { active: true }); } catch { /* the dashboard is still open */ }
        }
        return { ...base, status: 'saved', reason: `Magento saved PP ${entityId}. The record was read again to check the rows.`,
          magentoMessage, keptOpen: false, readAt: Date.now(), snapshot: stored.snapshot };
      }
      return { ...base, status: 'saved',
        reason: `Magento saved PP ${entityId}, but the read-back did not complete: ${stored.reason}.`,
        magentoMessage, keptOpen: true, tabId: helper, readAt: Date.now() };
    }
    // A read in a new tab never touches the unsaved draft in the helper tab.
    const stored = await readBackInNewTab(before.url, entityId);
    return { ...base, status: 'unknown',
      reason: stored.snapshot
        ? 'Magento gave no save confirmation. A fresh read of the record was taken; compare it with the rows before saving again.'
        : 'Magento gave no save confirmation and the record could not be read again. Check it before pressing Save again.',
      keptOpen: true, tabId: helper, readAt: Date.now(), ...(stored.snapshot ? { snapshot: stored.snapshot } : {}) };
  } catch {
    return { ...refused('unavailable', 'The save could not be run. Check the helper tab before trying again.'), keptOpen: true, tabId: helper };
  }
}
function validSelection(value: unknown): value is PpSourceSelection {
  if (!value || typeof value !== 'object') return false;
  const s = value as PpSourceSelection;
  return Number.isSafeInteger(s.tabId) && s.tabId >= 0 && typeof s.selectionToken === 'string' && /^[a-f0-9]{64}$/.test(s.selectionToken);
}

/** Only the scanner reads the chosen user tab; it is never an owned helper. */
async function readOpenDraft(job: ReadJob, target: string): Promise<PpFreshFormResponse> {
  const response = reply(job.id, job.entityId, 'unavailable', 'Selected draft is unavailable or changed. Check the connection and select it again.');
  const deadline = Date.now() + MAX_WAIT;
  const before = await bounded(chrome.tabs.get(job.selection!.tabId), deadline - Date.now(), job);
  if (job.cancelled) return { ...response, status: 'cancelled', reason: 'Draft read cancelled.' };
  if (before.status !== 'complete' || before.pendingUrl || !isNativePpReference(before.url, target) ||
    await ppTabSelectionToken(before) !== job.selection!.selectionToken) return response;
  if (job.cancelled || Date.now() >= deadline) return { ...response, status: job.cancelled ? 'cancelled' : 'unavailable' };
  const [injection] = await bounded(chrome.scripting.executeScript({
    target: { tabId: job.selection!.tabId, frameIds: [0] }, world: 'MAIN', func: scanCurrentPpDraft,
  }), deadline - Date.now(), job);
  const after = await bounded(chrome.tabs.get(job.selection!.tabId), deadline - Date.now(), job);
  if (job.cancelled) return { ...response, status: 'cancelled', reason: 'Draft read cancelled.' };
  const result: unknown = injection?.result;
  if (after.status !== 'complete' || after.pendingUrl || after.url !== before.url ||
    !isNativePpReference(after.url, target) || injection?.frameId !== 0 || !isPpDraftScanResponse(result) ||
    !['ok', 'partial'].includes(result.status) || result.entityId !== job.entityId ||
    String(result.providerEntityId) !== job.entityId || result.routePath !== ppRoutePathFromUrl(before.url!)) return response;
  return { ...response, source: 'current-open-page-draft', status: result.status as 'ok' | 'partial',
    reason: 'CURRENT OPEN-PAGE DRAFT, including unsaved edits. This is not a fresh load or saved-server snapshot.',
    host: new URL(target).hostname, readAt: Date.now(), reference: { kind: 'current-draft' },
    snapshot: { ...result, routePath: `/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/${job.entityId}` } };
}

export async function checkPpConnection(entityId: unknown, referenceSource: unknown, selection?: PpSourceSelection): Promise<PpConnectionResponse> {
  const result: PpConnectionResponse = { status: 'unavailable', reason: 'Connection could not be checked safely. Retry explicitly.', tabs: [] };
  try {
    if (!['options-grid', 'exact-record', 'current-draft'].includes(String(referenceSource)) || (selection !== undefined && !validSelection(selection))) return { ...result, status: 'invalid', reason: 'Choose a supported source and detected tab.' };
    const settings = await bounded(chrome.storage.local.get(['adminBaseUrl']), 5000);
    const issue = freshFormIssue(settings.adminBaseUrl, entityId);
    if (issue) return { ...result, status: 'invalid', reason: issueReason(issue) };
    const target = freshFormUrl(settings.adminBaseUrl, entityId)!, wanted = new URL(target);
    const gridPath = wanted.pathname.replace(/\/edit\/attributesetcustomoptions_id\/\d+\/$/, '/index/');
    const sourceTarget = referenceSource === 'options-grid' ? wanted.origin + gridPath : target;
    const tabs = await bounded(chrome.tabs.query({ url: [...HOSTS].map(host => `https://${host}/*`) }), 5000);
    let mismatched = false;
    for (const tab of tabs) {
      if (!Number.isSafeInteger(tab.id) || tab.id! < 0 || typeof tab.url !== 'string') continue;
      const url = new URL(tab.url);
      const route = referenceSource === 'options-grid'
        ? /^\/[a-z0-9_-]+\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/index(?:\/key\/[A-Za-z0-9_-]{1,256})?\/?$/i.test(url.pathname)
        : ppEntityIdFromUrl(tab.url) === entityId && /^\/[a-z0-9_-]+\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/[1-9]\d{0,15}(?:\/key\/[A-Za-z0-9_-]{1,256})?\/?$/i.test(url.pathname);
      if (!HOSTS.has(url.hostname) || url.protocol !== 'https:' || !route) continue;
      if (!isNativePpReference(tab.url, sourceTarget)) {
        if (url.origin !== wanted.origin || url.pathname.split('/')[1] !== wanted.pathname.split('/')[1]) mismatched = true;
        continue;
      }
      result.tabs.push({ tabId: tab.id!, selectionToken: await ppTabSelectionToken(tab), host: url.hostname,
        kind: referenceSource === 'options-grid' ? 'options-grid' : 'edit', loading: tab.status !== 'complete' || !!tab.pendingUrl });
    }
    if (!result.tabs.length) return { ...result, status: mismatched ? 'base-mismatch' : 'no-source', reason: mismatched
      ? 'A matching Magento page uses a different admin base. Open the target under the configured base or correct Settings.'
      : referenceSource === 'options-grid' ? 'No eligible Options Grid tab. Open the Grid under the configured admin base and load the exact entity, or explicitly choose an open-page draft.'
      : 'No eligible exact-record edit tab. Open the exact Magento entity under the configured admin base.' };
    const chosen = selection ? result.tabs.find(tab => tab.tabId === selection.tabId && tab.selectionToken === selection.selectionToken) : result.tabs.length === 1 && referenceSource !== 'current-draft' ? result.tabs[0] : undefined;
    if (!chosen) return { ...result, status: selection ? 'changed' : 'ambiguous', reason: 'Select the detected source tab explicitly. If it changed, check the connection again.' };
    if (chosen.loading) return { ...result, status: 'loading', reason: 'Selected Magento tab is loading or navigating. Wait, then check the connection again.' };
    if (referenceSource === 'options-grid') {
      const job: ReadJob = { id: 'preflight', entityId: entityId as string, owner: undefined, cancelled: false, referenceSource, selection: chosen, done: undefined! };
      const checked = await gridReference(job, target);
      result.grid = checked.grid;
      if (!checked.url) return { ...result, status: checked.grid.status === 'loading' ? 'loading' : checked.grid.status === 'changed' ? 'changed' : 'unavailable', reason: checked.reason };
    }
    return { ...result, status: 'ready', reason: referenceSource === 'current-draft'
      ? 'Selected edit tab ready. Read CURRENT DRAFT includes unsaved edits; it does not certify saved state.'
      : 'Connection ready for a fresh helper load. Source and entity are rechecked when reading.' };
  } catch { return result; }
}

export function readFreshForm(id: unknown, entityId: unknown, owner: number | undefined, referenceSource: unknown = 'exact-record', selection?: PpSourceSelection): Promise<PpFreshFormResponse> {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id) || typeof entityId !== 'string' || !/^[1-9]\d{0,15}$/.test(entityId) ||
    (referenceSource !== 'options-grid' && referenceSource !== 'exact-record' && referenceSource !== 'current-draft') ||
    (selection !== undefined && !validSelection(selection)) || (referenceSource === 'current-draft' && !selection)) {
    return Promise.resolve(reply('', '', 'invalid', 'Invalid preview identity. Enter the exact positive Magento entity ID.'));
  }
  if (stoppedBeforeStart.has(id) && stoppedBeforeStart.get(id) === owner) {
    stoppedBeforeStart.delete(id);
    return Promise.resolve(reply(id, entityId, 'cancelled', 'Preview cancelled before opening a helper tab.'));
  }
  if (leftover) return Promise.resolve({ ...reply(id, entityId, 'cleanup-failed', `Helper tab ${leftover.tabId} still needs closing before another preview.`),
    cleanup: 'failed', leftoverTabId: leftover.tabId, cleanupRequestId: leftover.id });
  if (active) return Promise.resolve(reply(id, entityId, 'busy', 'Another helper read is still running or closing. Stop it or wait before retrying.'));
  const job: ReadJob = { id, entityId, owner, cancelled: false, referenceSource, selection, done: undefined! };
  active = job; job.done = run(job).then(response => referenceSource === 'current-draft' ? { ...response, source: 'current-open-page-draft' as const } : response); return job.done;
}

export async function cancelFreshForm(id: unknown, owner: number | undefined): Promise<PpFreshFormResponse> {
  const job = leftover ?? active;
  if (!job || job.id !== id || (job !== leftover && job.owner !== owner)) {
    if (typeof id === 'string' && /^[a-z0-9-]{1,80}$/i.test(id)) {
      if (stoppedBeforeStart.size >= 100) stoppedBeforeStart.delete(stoppedBeforeStart.keys().next().value!);
      stoppedBeforeStart.set(id, owner);
    }
    return reply('', '', 'unavailable', 'No matching helper read to stop or close.');
  }
  job.cancelled = true;
  job.cancelWait?.();
  if (job === leftover) {
    if (!job.closeInFlight) job.close = undefined;
    const closed = await closeOwned(job);
    if (closed) {
      leftover = null;
      if (job.onRemoved) chrome.tabs.onRemoved.removeListener(job.onRemoved);
      return { ...reply(job.id, job.entityId, 'cancelled', 'Helper tab closed.'), cleanup: 'closed' };
    }
    return { ...reply(job.id, job.entityId, 'cleanup-failed', `Helper tab ${job.tabId} still could not be closed.`), cleanup: 'failed', leftoverTabId: job.tabId };
  }
  if (job.tabId !== undefined) await closeOwned(job);
  return job.done;
}
