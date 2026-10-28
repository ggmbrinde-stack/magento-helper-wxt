/**
 * Background service worker — the thin composition layer.
 *
 * This file wires the worker to the three lane routers and nothing else. It
 * must stay small: if a change needs to go in here, it is a change to the
 * shared envelope, not to a lane.
 *
 *   routers/ui.ts         page + panel surface (tab groups)
 *   routers/audit.ts      resolver, audits, Notion read/write, error markup
 *   routers/automation.ts batch pipeline + model bridge
 *
 * Router order is the dispatch order; each router returns `true` once it has
 * handled a message. They must not import each other.
 */

import { defineBackground } from 'wxt/sandbox';
import type { LaneRouter } from '../../core/messages';
import { handleAuditMessage, onSettingsChanged } from './routers/audit';
import { handleAutomationMessage, onBatchAlarm, resumeBatchOnWake } from './routers/automation';
import { handleUiMessage } from './routers/ui';

const ROUTERS: LaneRouter[] = [
  handleUiMessage,
  handleAuditMessage,
  handleAutomationMessage,
];

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => undefined);
  }

  // A token or database change must not leave a stale preview health result.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    onSettingsChanged(Object.keys(changes));
  });

  // Batch runner: re-enter the pump when the worker wakes up or when a job
  // stalls. The pump itself re-reads the persisted job every step, so nothing
  // is lost if the worker is suspended mid-batch.
  chrome.runtime.onStartup?.addListener(() => {
    resumeBatchOnWake();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    onBatchAlarm(alarm.name);
  });
  resumeBatchOnWake();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const ctx = { senderTabId: sender.tab?.id, sendResponse };
    for (const route of ROUTERS) {
      if (route(message, ctx)) return true;
    }
    return false;
  });
});
