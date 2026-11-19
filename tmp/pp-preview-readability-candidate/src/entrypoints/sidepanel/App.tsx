import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  DEFAULT_LISTING_ERRORS_DB,
  DEFAULT_SKU_LIBRARY_DB,
} from '../../shared/notion/client';
import { SettingsForm, type SettingsValues } from './SettingsForm';

const EMPTY_SETTINGS: SettingsValues = {
  notionToken: '',
  skuLibraryDb: '',
  listingErrorsDb: '',
  adminBaseUrl: '',
};

/**
 * Side panel — settings only.
 *
 * The Data / Config / Fill tabs were removed on 2026-10-28. The dashboard
 * already owns Resolve SKU, config groups and form fill, so the panel was a
 * second copy of the same screens drifting out of date. What stays is the one
 * job the dashboard does not do well on the admin page: editing the token and
 * the database ids without leaving the tab.
 */
export function App() {
  const [settings, setSettings] = useState<SettingsValues>(EMPTY_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

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

  // Keep the form in sync with storage: saving in the dashboard (or another
  // panel) updates this one immediately.
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
          <span class="mhx-badge">v{browser.runtime.getManifest().version}</span>
        </div>
      </header>

      {!settingsLoaded ? (
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
