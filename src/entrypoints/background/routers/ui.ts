/**
 * Lane A router — page + panel surface.
 *
 * Owns: browser-tab capability our own controls ask for. The page-domain
 * messages (GET_CONFIG, GET_SKU, GET_FORM_STATE, APPLY_FIELD, SEARCH_MAGENTO)
 * are answered by the content script, not here.
 *
 * The audit lane drives error markup and the resolver; this router must not
 * import audit internals.
 */

import type { LaneRouter } from '../../../core/messages';

import { selectAssociatedSkus } from '../../../page/features/assoc-bulk/page';

export const handleUiMessage: LaneRouter = (message, ctx) => {
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
