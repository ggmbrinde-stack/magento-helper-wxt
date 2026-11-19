import type { PpFreshFormResponse, PpFreshFormState, PpFreshReadiness, PpReadinessCheckpoint, ScanPpDraftResponse, PpReferenceSource, PpGridCoverage, PpSourceSelection, PpConnectionResponse, PpConnectionTab } from '../../core/messages';
import { scanCurrentPpDraft, ppRoutePathFromUrl, ppEntityIdFromUrl } from '../../page/features/pp-scan/page';
import { readPpReadiness } from '../../page/features/pp-scan/readiness';
import { readLoadedPpGrid, type PpLoadedGridRead } from '../../page/features/pp-scan/grid';
import { isPpDraftScanResponse, ppTabSelectionToken } from './ppPreview';

const HOSTS = new Set(['bestofgifts.pt', 'bestofgifts.eu', 'bestofgifts.es', 'bestofgifts.fr', 'bestofgifts-pt-qa.toogas.net']);
const BASE_RULE = 'Use https on bestofgifts.pt, bestofgifts.eu, bestofgifts.es, bestofgifts.fr or bestofgifts-pt-qa.toogas.net, with one admin path segment such as /admin_xxx, and no port, query, key or extra path.';
const MAX_WAIT = 30_000, MAX_INJECTIONS = 10;
const POLL_MS = 500, EXTRACTION_GAP = (MAX_WAIT - 1000) / (MAX_INJECTIONS - 1);
interface ReadJob {
  id: string; entityId: string; owner: number | undefined; cancelled: boolean; referenceSource: PpReferenceSource;
  selection?: PpSourceSelection;
  tabId?: number; close?: Promise<boolean>; done: Promise<PpFreshFormResponse>;
  removed?: boolean; onRemoved?: (tabId: number) => void;
  closeInFlight?: boolean;
  cancelWait?: () => void;
}
let active: ReadJob | null = null;
let leftover: ReadJob | null = null;
const stoppedBeforeStart = new Map<string, number | undefined>();

const reply = (id: string, entityId: string, status: PpFreshFormResponse['status'], reason: string): PpFreshFormResponse =>
  ({ source: 'fresh-magento-form-load', requestId: id, entityId, status, reason, cleanup: 'not-created' });

export type FreshFormIssue = 'entity' | 'missing-base' | 'rejected-base';

/** Name the exact input that blocks the load, so the reason is actionable instead of shared. */
export function freshFormIssue(base: unknown, entityId: unknown): FreshFormIssue | null {
  if (typeof entityId !== 'string' || !/^[1-9]\d{0,15}$/.test(entityId)) return 'entity';
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

async function closeOwned(job: ReadJob): Promise<boolean> {
  if (job.tabId === undefined || job.removed) return true;
  if (!job.close) {
    job.closeInFlight = true;
    job.close = chrome.tabs.remove(job.tabId).then(() => true, () => false).finally(() => { job.closeInFlight = false; });
  }
  return job.close;
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
    (c.loadedRows !== undefined && c.loadedRows > 500) || (c.pageSize !== undefined && (c.pageSize < 1 || c.pageSize > 500)) ||
    (c.page !== undefined && c.page < 1) || (c.filtered !== undefined && typeof c.filtered !== 'boolean')) return undefined;
  if (c.status === 'found' && [c.loadedRows, c.totalRows, c.page, c.pageSize].some(n => n === undefined)) return undefined;
  return { status: c.status, freshness: 'loaded-unverified', loadedRows: c.loadedRows, totalRows: c.totalRows,
    page: c.page, pageSize: c.pageSize, filtered: c.filtered };
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
      if (coverage.status !== 'found') return { grid: coverage, reason: reasons[coverage.status] };
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
    while (Date.now() < deadline && !job.cancelled) {
      const before = await bounded(chrome.tabs.get(job.tabId), deadline - Date.now(), job);
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
        const afterProbe = await bounded(chrome.tabs.get(job.tabId), deadline - Date.now(), job);
        if (afterProbe.url !== before.url || afterProbe.pendingUrl || afterProbe.status !== 'complete') {
          response = reply(job.id, job.entityId, 'unavailable', 'The helper document changed or returned an invalid identity. No snapshot accepted.'); break;
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
              response = { ...reply(job.id, job.entityId, result.status, 'Fresh Magento form load. This is not a certified saved-server snapshot or an existing user draft.'),
                host: wanted.hostname, readAt: Date.now(), snapshot: { ...result,
                  routePath: `/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/${job.entityId}` } };
              break;
            }
          }
        }
      } else readiness.last = { document: 'unknown', stage: 'document-loading', registry: 'unknown', provider: 'unknown', data: 'unknown', identity: 'unknown', blockedAccessor: false };
      await new Promise(resolve => setTimeout(resolve, Math.min(POLL_MS, Math.max(0, deadline - Date.now()))));
    }
    if (response.status === 'unavailable' && Date.now() >= deadline) response.reason = 'The fresh form did not yield a matching snapshot within the 30-second readiness budget. See the last readiness checkpoint.';
    if (job.cancelled) response = reply(job.id, job.entityId, 'cancelled', 'Preview cancelled. No further reads will run.');
  } catch {
    response = reply(job.id, job.entityId, job.cancelled ? 'cancelled' : 'unavailable',
      job.cancelled ? 'Preview cancelled.' : 'The fresh Magento form read failed or timed out. Retry explicitly.');
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
