import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ConfigGroup, GetConfigResponse } from '../../core/messages';

interface ConfigPanelProps {
  refreshKey?: number;
}

async function activeTabId(): Promise<number | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

export function ConfigPanel({ refreshKey = 0 }: ConfigPanelProps) {
  const [groups, setGroups] = useState<ConfigGroup[]>([]);
  const [sku, setSku] = useState('');
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async (retry = 0): Promise<void> => {
    setLoading(true);
    try {
      const tabId = await activeTabId();
      if (tabId === null) {
        setReason('No active tab.');
        setGroups([]);
        return;
      }
      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'GET_CONFIG',
      })) as GetConfigResponse | undefined;
      if (!response) {
        setReason('No response from the page - open the Magento admin first.');
        setGroups([]);
        return;
      }
      setSku(response.sku ?? '');
      setGroups(response.groups);
      setReason(response.reason ?? '');
      setPending(Boolean(response.pending));
      if (response.pending && retry < 4) {
        setTimeout(() => void load(retry + 1), 1500);
      }
    } catch {
      setReason('Cannot reach the page - open a product edit page in the active tab.');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const openAll = (group: ConfigGroup): void => {
    if (group.urls.length === 0) return;
    setOpening(group.label);
    void browser.runtime
      .sendMessage({
        type: 'OPEN_TAB_GROUP',
        urls: group.urls,
        groupName: `${group.label} sizes`,
      })
      .finally(() => setOpening(null));
  };

  const total = groups.reduce((n, g) => n + g.urls.length, 0);

  return (
    <main class="mhx-content">
      <div class="mhx-row">
        <button type="button" class="mhx-primary" disabled={loading} onClick={() => void load()}>
          {loading ? 'Reading…' : 'Refresh'}
        </button>
        <span class="mhx-hint">
          SKU <code>{sku || '—'}</code>
          {groups.length > 0 ? ` · ${groups.length} colors / ${total} sizes` : ''}
        </span>
      </div>

      {reason && groups.length === 0 ? (
        <p class="mhx-empty">{reason}</p>
      ) : null}

      {groups.map((group) => (
        <div class="mhx-section" key={group.label}>
          <div class="mhx-config-head">
            <span class="mhx-section-title">{group.label}</span>
            <span class="mhx-count">{group.urls.length} sizes</span>
            <button
              type="button"
              class="mhx-storeview--all"
              disabled={opening !== null}
              onClick={() => openAll(group)}
            >
              {opening === group.label ? 'Opening…' : 'Open all'}
            </button>
          </div>
          <ul class="mhx-config-list">
            {group.urls.map((url) => {
              const id = url.match(/\/edit\/id\/(\d+)/)?.[1] ?? '';
              return (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer noopener">
                    ID {id}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </main>
  );
}
