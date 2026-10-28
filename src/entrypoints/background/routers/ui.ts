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

  return false;
};
