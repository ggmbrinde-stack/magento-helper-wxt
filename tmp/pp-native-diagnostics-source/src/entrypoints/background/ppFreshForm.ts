import type { PpFreshFormResponse, PpFreshFormState } from '../../core/messages';
import { scanCurrentPpDraft, ppRoutePathFromUrl } from '../../page/features/pp-scan/page';
import { isPpDraftScanResponse } from './ppPreview';

const HOSTS = new Set(['bestofgifts.pt', 'bestofgifts.eu', 'bestofgifts.es', 'bestofgifts.fr', 'bestofgifts-pt-qa.toogas.net']);
const BASE_RULE = 'Use https on bestofgifts.pt, bestofgifts.eu, bestofgifts.es, bestofgifts.fr or bestofgifts-pt-qa.toogas.net, with one admin path segment such as /admin_xxx, and no port, query, key or extra path.';
const MAX_WAIT = 30_000, MAX_INJECTIONS = 10;
interface ReadJob {
  id: string; entityId: string; owner: number | undefined; cancelled: boolean;
  tabId?: number; close?: Promise<boolean>; done: Promise<PpFreshFormResponse>;
  removed?: boolean; onRemoved?: (tabId: number) => void;
  closeInFlight?: boolean;
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

function bounded<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Read timed out')), Math.max(1, milliseconds));
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

export function freshFormState(owner: number | undefined): PpFreshFormState {
  if (leftover) return { status: 'cleanup-failed', requestId: leftover.id, leftoverTabId: leftover.tabId };
  if (active && active.owner === owner) return { status: 'reading', requestId: active.id };
  return { status: 'idle' };
}

async function run(job: ReadJob): Promise<PpFreshFormResponse> {
  let response = reply(job.id, job.entityId, 'unavailable', 'The fresh Magento form could not be read. Check the admin session and target entity.');
  try {
    const settings = await chrome.storage.local.get(['adminBaseUrl']);
    const target = freshFormUrl(settings.adminBaseUrl, job.entityId);
    if (!target) {
      const issue = freshFormIssue(settings.adminBaseUrl, job.entityId) ?? 'rejected-base';
      return reply(job.id, job.entityId, 'invalid', issueReason(issue));
    }
    if (job.cancelled) return reply(job.id, job.entityId, 'cancelled', 'Preview cancelled before opening a helper tab.');
    const wanted = new URL(target), safePath = ppRoutePathFromUrl(target)!;
    const references = (await chrome.tabs.query({ url: [target.replace(/\/$/, ''), `${target}*`] }))
      .filter(tab => typeof tab.id === 'number' && Number.isInteger(tab.id) && tab.id >= 0 &&
        tab.status === 'complete' && !tab.pendingUrl && isNativePpReference(tab.url, target));
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
    // Only the owned helper loads this unchanged, private native address.
    const created = await chrome.tabs.create({ url: current.url, active: false });
    if (typeof created.id !== 'number') throw new Error('No owned tab');
    job.tabId = created.id;
    job.onRemoved = id => {
      if (id !== job.tabId) return;
      job.removed = true;
      if (leftover === job) leftover = null;
      if (job.onRemoved) chrome.tabs.onRemoved.removeListener(job.onRemoved);
    };
    chrome.tabs.onRemoved.addListener(job.onRemoved);
    const deadline = Date.now() + MAX_WAIT;
    let attempts = 0;
    while (Date.now() < deadline && !job.cancelled) {
      const before = await bounded(chrome.tabs.get(job.tabId), deadline - Date.now());
      if (job.cancelled) break;
      if (before.status === 'complete' && !before.pendingUrl) {
        const url = new URL(before.url ?? '');
        if (/\/(?:auth\/login|admin\/index\/index)(?:\/|$)/i.test(url.pathname)) {
          response = reply(job.id, job.entityId, 'auth', 'Magento redirected to sign-in. Sign in yourself, then retry.'); break;
        }
        if (url.origin !== wanted.origin || ppRoutePathFromUrl(url.href) !== safePath) {
          response = reply(job.id, job.entityId, 'unavailable', 'Magento redirected away from the requested PP entity. No snapshot accepted.'); break;
        }
        attempts++;
        const [injection] = await bounded(chrome.scripting.executeScript({
          target: { tabId: job.tabId, frameIds: [0] }, world: 'MAIN', func: scanCurrentPpDraft,
        }), deadline - Date.now());
        if (job.cancelled) break;
        const after = await bounded(chrome.tabs.get(job.tabId), deadline - Date.now());
        const result: unknown = injection?.result;
        if (after.url !== before.url || after.pendingUrl || after.status !== 'complete' || injection?.frameId !== 0 ||
          !isPpDraftScanResponse(result) || result.entityId !== job.entityId || result.routePath !== safePath) {
          response = reply(job.id, job.entityId, 'unavailable', 'The helper document changed or returned an invalid identity. No snapshot accepted.'); break;
        }
        if (result.status === 'identity-mismatch' || (result.providerEntityId !== undefined && String(result.providerEntityId) !== job.entityId)) {
          response = reply(job.id, job.entityId, 'unavailable', 'The Magento route and provider entity do not match. No snapshot accepted.'); break;
        }
        if ((result.status === 'ok' || result.status === 'partial') && String(result.providerEntityId) === job.entityId) {
          response = { ...reply(job.id, job.entityId, result.status, 'Fresh Magento form load. This is not a certified saved-server snapshot or an existing user draft.'),
            host: wanted.hostname, readAt: Date.now(), snapshot: { ...result,
              routePath: `/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/${job.entityId}` } };
          break;
        }
        if (attempts >= MAX_INJECTIONS) {
          response = reply(job.id, job.entityId, 'unavailable', 'The PP provider did not become available with a matching entity within the bounded read attempts.'); break;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (job.cancelled) response = reply(job.id, job.entityId, 'cancelled', 'Preview cancelled. No further reads will run.');
  } catch {
    response = reply(job.id, job.entityId, job.cancelled ? 'cancelled' : 'unavailable',
      job.cancelled ? 'Preview cancelled.' : 'The fresh Magento form read failed or timed out. Retry explicitly.');
  } finally {
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

export function readFreshForm(id: unknown, entityId: unknown, owner: number | undefined): Promise<PpFreshFormResponse> {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id) || typeof entityId !== 'string' || !/^[1-9]\d{0,15}$/.test(entityId)) {
    return Promise.resolve(reply('', '', 'invalid', 'Invalid preview identity. Enter the exact positive Magento entity ID.'));
  }
  if (stoppedBeforeStart.has(id) && stoppedBeforeStart.get(id) === owner) {
    stoppedBeforeStart.delete(id);
    return Promise.resolve(reply(id, entityId, 'cancelled', 'Preview cancelled before opening a helper tab.'));
  }
  if (leftover) return Promise.resolve({ ...reply(id, entityId, 'cleanup-failed', `Helper tab ${leftover.tabId} still needs closing before another preview.`),
    cleanup: 'failed', leftoverTabId: leftover.tabId, cleanupRequestId: leftover.id });
  if (active) return Promise.resolve(reply(id, entityId, 'busy', 'Another helper read is still running or closing. Stop it or wait before retrying.'));
  const job: ReadJob = { id, entityId, owner, cancelled: false, done: undefined! };
  active = job; job.done = run(job); return job.done;
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
