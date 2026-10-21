import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';

export interface DashboardSettings {
  notionToken: string;
  skuLibraryDb: string;
  listingErrorsDb: string;
  adminBaseUrl: string;
}

const EMPTY: DashboardSettings = {
  notionToken: '',
  skuLibraryDb: '',
  listingErrorsDb: '',
  adminBaseUrl: '',
};

const KEYS = [
  'notionToken',
  'skuLibraryDb',
  'listingErrorsDb',
  'adminBaseUrl',
] as const;

type SettingsKey = (typeof KEYS)[number];

function fromStorage(data: Record<string, unknown>): DashboardSettings {
  return {
    notionToken: (data.notionToken as string) ?? '',
    skuLibraryDb: (data.skuLibraryDb as string) ?? '',
    listingErrorsDb: (data.listingErrorsDb as string) ?? '',
    adminBaseUrl: (data.adminBaseUrl as string) ?? '',
  };
}

/**
 * Settings state shared by the dashboard pages: loads storage, stays in sync via
 * `storage.onChanged`, and saves with a read-back so callers can verify.
 */
export function useSettings() {
  const [settings, setSettings] = useState<DashboardSettings>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const data = await browser.storage.local.get([...KEYS]);
      setSettings(fromStorage(data));
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    const listener = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void => {
      if (area !== 'local') return;
      if (!KEYS.some((k) => k in changes)) return;
      setSettings((prev) => {
        const next = { ...prev };
        for (const key of KEYS) {
          const change = changes[key];
          if (change && typeof change.newValue === 'string') {
            next[key as SettingsKey] = change.newValue;
          }
        }
        return next;
      });
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const save = async (
    next: DashboardSettings,
  ): Promise<DashboardSettings> => {
    await browser.storage.local.set({ ...next });
    const data = await browser.storage.local.get([...KEYS]);
    const persisted = fromStorage(data);
    setSettings(persisted);
    return persisted;
  };

  return { settings, loaded, save };
}
