import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  DEFAULT_LISTING_ERRORS_DB,
  DEFAULT_SKU_LIBRARY_DB,
} from '../../lib/notion';
import type { FetchSkuDataResponse } from '../../lib/messages';
import { STORE_VIEWS, detectStoreView } from '../../lib/store';
import { SettingsForm } from './SettingsForm';
import { FillPanel } from './FillPanel';
import { DataPanel } from './DataPanel';
import { ConfigPanel } from './ConfigPanel';
import { LookupPanel } from './LookupPanel';

interface Settings {
  notionToken: string;
  skuLibraryDb: string;
  listingErrorsDb: string;
  adminBaseUrl: string;
}

const EMPTY_SETTINGS: Settings = {
  notionToken: '',
  skuLibraryDb: '',
  listingErrorsDb: '',
  adminBaseUrl: '',
};

type Tab = 'data' | 'config' | 'lookup' | 'fill' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'data', label: 'Data' },
  { id: 'config', label: 'Config' },
  { id: 'lookup', label: 'Lookup' },
  { id: 'fill', label: 'Fill' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [tab, setTab] = useState<Tab>('data');
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [detectedStoreView, setDetectedStoreView] = useState('all');
  const [storeView, setStoreView] = useState('all');
  const [sku, setSku] = useState('');
  const [result, setResult] = useState<FetchSkuDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    void (async () => {
      const data = await browser.storage.local.get([
        'notionToken',
        'skuLibraryDb',
        'listingErrorsDb',
        'adminBaseUrl',
      ]);
      setSettings({
        notionToken: (data.notionToken as string) ?? '',
        skuLibraryDb: (data.skuLibraryDb as string) ?? '',
        listingErrorsDb: (data.listingErrorsDb as string) ?? '',
        adminBaseUrl: (data.adminBaseUrl as string) ?? '',
      });
      setSettingsLoaded(true);
    })();
  }, []);

  // Keep the panel in sync with storage: saving in Settings (or another panel)
  // updates the header warning and any consumer immediately.
  useEffect(() => {
    const listener = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void => {
      if (area !== 'local') return;
      const tracked = [
        'notionToken',
        'skuLibraryDb',
        'listingErrorsDb',
        'adminBaseUrl',
      ];
      if (!tracked.some((k) => k in changes)) return;
      setSettings((prev) => ({
        notionToken:
          (changes.notionToken?.newValue as string | undefined) ??
          prev.notionToken,
        skuLibraryDb:
          (changes.skuLibraryDb?.newValue as string | undefined) ??
          prev.skuLibraryDb,
        listingErrorsDb:
          (changes.listingErrorsDb?.newValue as string | undefined) ??
          prev.listingErrorsDb,
        adminBaseUrl:
          (changes.adminBaseUrl?.newValue as string | undefined) ??
          prev.adminBaseUrl,
      }));
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    void (async () => {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      const detected = detectStoreView(tabs[0]?.url ?? '');
      setDetectedStoreView(detected);
      setStoreView(detected);
    })();
  }, []);

  // Prefill the SKU from the open product-edit tab (read-only; GET_SKU).
  useEffect(() => {
    void (async () => {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tab = tabs[0];
        if (!tab?.id || !(tab.url ?? '').includes('/catalog/product')) return;
        const response = (await browser.tabs.sendMessage(tab.id, {
          type: 'GET_SKU',
        })) as { sku?: string } | undefined;
        if (response?.sku) setSku(response.sku);
      } catch {
        // No content script on this tab — leave the SKU blank.
      }
    })();
  }, []);

  async function handleFetch(): Promise<void> {
    const trimmed = sku.trim();
    if (!trimmed) {
      setFetchError('SKU is required');
      return;
    }
    setLoading(true);
    setFetchError('');
    setResult(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'FETCH_SKU_DATA',
        sku: trimmed,
        storeView,
      })) as FetchSkuDataResponse;
      if (response?.error) {
        setFetchError(response.error);
      } else {
        setResult(response);
      }
    } catch (err) {
      setFetchError((err as Error).message ?? 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const tokenMissing = settingsLoaded && !settings.notionToken;

  return (
    <div class="mhx-panel">
      <header class="mhx-header">
        <h1>BOG Helper</h1>
        <div class="mhx-header-actions">
          <button
            type="button"
            class="mhx-link-btn"
            title="Open the full dashboard"
            onClick={() =>
              void browser.tabs.create({
                url: browser.runtime.getURL('/dashboard.html'),
              })
            }
          >
            Dashboard
          </button>
          <button
            type="button"
            class="mhx-link-btn"
            title="Open the audit workspace"
            onClick={() =>
              void browser.tabs.create({
                url: browser.runtime.getURL('/dashboard.html'),
              })
            }
          >
            Audit
          </button>
          <span class="mhx-badge">v0.2.0</span>
        </div>
      </header>

      {tokenMissing ? (
        <div class="mhx-warning">
          Notion token not set. Add it in Settings to fetch data.
          <button type="button" onClick={() => setTab('settings')}>
            Open Settings
          </button>
        </div>
      ) : null}

      <nav class="mhx-tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            class={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'data' ? (
        <main class="mhx-content">
          <div class="mhx-row">
            <label class="mhx-field">
              <span>SKU</span>
              <input
                type="text"
                value={sku}
                placeholder="e.g. 12345"
                onInput={(e) => setSku(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleFetch();
                }}
              />
            </label>
            <label class="mhx-field mhx-field--store">
              <span>
                Store view
                {detectedStoreView !== 'all'
                  ? ` (detected: ${detectedStoreView})`
                  : ''}
              </span>
              <select
                value={storeView}
                onChange={(e) => setStoreView(e.currentTarget.value)}
              >
                <option value="all">All</option>
                {STORE_VIEWS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              class="mhx-primary"
              disabled={loading}
              onClick={() => void handleFetch()}
            >
              {loading ? 'Loading…' : 'Fetch'}
            </button>
          </div>

          <DataPanel result={result} error={fetchError} />
        </main>
      ) : tab === 'config' ? (
        <ConfigPanel />
      ) : tab === 'lookup' ? (
        <LookupPanel sku={sku} onSkuChange={setSku} />
      ) : tab === 'fill' ? (
        <main class="mhx-content">
          <FillPanel
            sku={sku}
            storeView={storeView}
            detectedStoreView={detectedStoreView}
          />
        </main>
      ) : !settingsLoaded ? (
        <main class="mhx-content">
          <p class="mhx-empty">Loading settings…</p>
        </main>
      ) : (
        <SettingsForm
          settings={settings}
          onSaved={setSettings}
          defaults={{
            skuLibraryDb: DEFAULT_SKU_LIBRARY_DB,
            listingErrorsDb: DEFAULT_LISTING_ERRORS_DB,
          }}
        />
      )}
    </div>
  );
}
