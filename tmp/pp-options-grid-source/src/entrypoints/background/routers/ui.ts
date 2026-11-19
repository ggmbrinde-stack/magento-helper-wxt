/**
 * Lane A router — page + panel surface.
 *
 * Owns: browser-tab capabilities our controls ask for. SCAN_PP_DRAFT is the
 * exception that reads Magento's already-loaded main-world registry.
 *
 * The audit lane drives error markup and the resolver; this router must not
 * import audit internals.
 */

import type { LaneRouter, ScanPpDraftResponse } from '../../../core/messages';

import { selectAssociatedSkus } from '../../../page/features/assoc-bulk/page';
import { isPpPreviewSender, isPpDraftScanResponse, ppPreviewTab, PP_PREVIEW_TAB_URLS } from '../ppPreview';
import { readFreshForm, cancelFreshForm, freshFormState } from '../ppFreshForm';
import {
  ppEntityIdFromUrl,
  ppRoutePathFromUrl,
  scanCurrentPpDraft,
} from '../../../page/features/pp-scan/page';

const PP_ADMIN_HOSTS = new Set([
  'bestofgifts-pt-qa.toogas.net',
  'bestofgifts.pt',
  'bestofgifts.eu',
  'bestofgifts.es',
  'bestofgifts.fr',
]);

function unavailablePpScan(entityId: string | null, routePath: string): ScanPpDraftResponse {
  return {
    version: 1,
    status: 'unavailable',
    entityId,
    routePath: routePath.slice(0, 512),
    general: {},
    locations: { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
    items: { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
    warnings: ['The current Magento page could not be scanned safely.'],
  };
}

export const handleUiMessage: LaneRouter = (message, ctx) => {
  if (['READ_PP_FRESH_FORM', 'CANCEL_PP_FRESH_FORM', 'GET_PP_FRESH_FORM_STATE'].includes(message?.type ?? '')) {
    if (!isPpPreviewSender(ctx)) {
      ctx.sendResponse({ source: 'fresh-magento-form-load', requestId: '', entityId: '', status: 'unavailable',
        cleanup: 'not-created', reason: 'Open PP Preview in the extension dashboard.' });
    } else if (message.type === 'GET_PP_FRESH_FORM_STATE') ctx.sendResponse(freshFormState(ctx.senderTabId));
    else void (message.type === 'READ_PP_FRESH_FORM'
      ? readFreshForm(message.requestId, message.entityId, ctx.senderTabId, message.referenceSource)
      : cancelFreshForm(message.requestId, ctx.senderTabId)).then(ctx.sendResponse);
    return true;
  }

  if (message?.type === 'LIST_PP_PREVIEW_TABS' || message?.type === 'READ_PP_PREVIEW_DRAFT') {
    void (async () => {
      const unavailable = (): void => ctx.sendResponse({ ok: false,
        reason: 'The selected PP tab is unavailable or changed. List tabs and select it again.' });
      if (!isPpPreviewSender(ctx)) { unavailable(); return; }
      try {
        if (message.type === 'LIST_PP_PREVIEW_TABS') {
          const tabs = await chrome.tabs.query({ url: PP_PREVIEW_TAB_URLS });
          const matches = await Promise.all(tabs.map(ppPreviewTab));
          ctx.sendResponse({ ok: true, tabs: matches.filter(tab => tab !== null) });
          return;
        }
        if (!Number.isInteger(message.tabId) || message.tabId < 0 ||
          typeof message.selectionToken !== 'string' || !/^[a-f0-9]{64}$/.test(message.selectionToken)) {
          unavailable(); return;
        }
        const before = await chrome.tabs.get(message.tabId);
        const selected = await ppPreviewTab(before);
        if (!selected || selected.selectionToken !== message.selectionToken) { unavailable(); return; }
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: selected.tabId, frameIds: [0] }, world: 'MAIN', func: scanCurrentPpDraft,
        });
        const result: unknown = injection?.result;
        const after = await chrome.tabs.get(selected.tabId);
        if (injection?.frameId !== 0 || after.pendingUrl || after.url !== before.url ||
          !isPpDraftScanResponse(result) || result.entityId !== selected.entityId ||
          result.routePath !== ppRoutePathFromUrl(before.url!)) { unavailable(); return; }
        // Report the canonical route, never the private admin/session path.
        ctx.sendResponse({ ok: true, tab: selected, snapshot: { ...result, routePath: selected.routePath } });
      } catch { unavailable(); }
    })();
    return true;
  }

  if (message?.type === 'SCAN_PP_DRAFT') {
    const senderEntity = ctx.senderUrl ? ppEntityIdFromUrl(ctx.senderUrl) : null;
    const senderPath = (() => {
      try { return new URL(ctx.senderUrl ?? '').pathname; } catch { return ''; }
    })();
    const safeRoutePath = ctx.senderUrl ? ppRoutePathFromUrl(ctx.senderUrl) ?? '' : '';
    void (async () => {
      if (
        typeof ctx.senderTabId !== 'number' ||
        ctx.senderFrameId !== 0 ||
        !senderEntity ||
        !ctx.senderUrl
      ) {
        ctx.sendResponse(unavailablePpScan(senderEntity, safeRoutePath));
        return;
      }
      try {
        const sender = new URL(ctx.senderUrl);
        if (sender.protocol !== 'https:' || !PP_ADMIN_HOSTS.has(sender.hostname)) {
          ctx.sendResponse(unavailablePpScan(senderEntity, safeRoutePath));
          return;
        }
        const tab = await chrome.tabs.get(ctx.senderTabId);
        const current = new URL(tab.url ?? '');
        if (
          current.protocol !== 'https:' ||
          current.hostname !== sender.hostname ||
          current.pathname !== sender.pathname ||
          ppEntityIdFromUrl(tab.url ?? '') !== senderEntity
        ) {
          ctx.sendResponse(unavailablePpScan(senderEntity, safeRoutePath));
          return;
        }
        const [injection] = await chrome.scripting.executeScript({
          target: { tabId: ctx.senderTabId },
          world: 'MAIN',
          func: scanCurrentPpDraft,
        });
        const result: unknown = injection?.result;
        if (
          !isPpDraftScanResponse(result) || result.entityId !== senderEntity ||
          result.routePath !== safeRoutePath
        ) {
          ctx.sendResponse(unavailablePpScan(senderEntity, safeRoutePath));
          return;
        }
        ctx.sendResponse(result);
      } catch {
        ctx.sendResponse(unavailablePpScan(senderEntity, safeRoutePath));
      }
    })();
    return true;
  }

  if (message?.type === 'OPEN_TAB_GROUP') {
    const urls = (message.urls ?? []) as string[];
    const groupName = String(message.groupName ?? 'Magento');
    if (urls.length === 0) {
      ctx.sendResponse({ success: false, error: 'No URLs provided' });
      return true;
    }
    void (async () => {
      try {
        const first = await chrome.tabs.create({
          url: urls[0],
          active: false,
        });
        const rest = await Promise.all(
          urls.slice(1).map((url) =>
            chrome.tabs.create({ url, active: false }),
          ),
        );
        const tabIds = [first.id, ...rest.map((t) => t.id)].filter(
          (id): id is number => typeof id === 'number',
        );
        if (chrome.tabs.group) {
          const groupId = await chrome.tabs.group({ tabIds });
          await chrome.tabGroups.update(groupId, { title: groupName });
          ctx.sendResponse({ success: true, groupId });
        } else {
          ctx.sendResponse({ success: true, tabIds });
        }
      } catch (err) {
        ctx.sendResponse({ success: false, error: (err as Error).message });
      }
    })();
    // Outer return keeps the channel open for the async response.
    return true;
  }

  if (message?.type === 'SELECT_ASSOCIATED_SKUS') {
    const tabId = ctx.senderTabId;
    const skus = (message.skus ?? []) as string[];

    if (typeof tabId !== 'number') {
      ctx.sendResponse({
        ok: false,
        reason: 'No sender tab.',
        requested: 0,
        found: 0,
        missing: [],
        already: [],
        cancelled: false,
        added: 0,
        selectedBefore: 0,
        selectedAfter: 0,
        totalSelected: null,
        tickedOnScreen: 0,
        filterPasses: 0,
      });
      return true;
    }
    if (skus.length === 0) {
      ctx.sendResponse({
        ok: false,
        reason: 'No SKUs provided.',
        requested: 0,
        found: 0,
        missing: [],
        already: [],
        cancelled: false,
        added: 0,
        selectedBefore: 0,
        selectedAfter: 0,
        totalSelected: null,
        tickedOnScreen: 0,
        filterPasses: 0,
      });
      return true;
    }

    void (async () => {
      try {
        // The injected function is the page-world implementation in the feature
        // module. `executeScript` with a bundled file runs in MAIN world, so it
        // can read `ko`/`window.require`/the observables that the content script
        // cannot reach. Its run returns the report through `injection.result`.
        const [injection] =
          await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: selectAssociatedSkus,
            args: [skus],
          });
        ctx.sendResponse(
          (injection && injection.result) ?? {
            ok: false,
            reason: 'The page did not return a report.',
            requested: skus.length,
            found: 0,
            missing: [],
            already: [],
            cancelled: false,
            added: 0,
            selectedBefore: 0,
            selectedAfter: 0,
            totalSelected: null,
            tickedOnScreen: 0,
            filterPasses: 0,
          },
        );
      } catch (err) {
        ctx.sendResponse({
          ok: false,
          reason: String((err && (err as Error).message) || err),
          requested: skus.length,
          found: 0,
          missing: [],
          already: [],
          cancelled: false,
          added: 0,
          selectedBefore: 0,
          selectedAfter: 0,
          totalSelected: null,
          tickedOnScreen: 0,
          filterPasses: 0,
        });
      }
    })();
    return true;
  }

  return false;
};
