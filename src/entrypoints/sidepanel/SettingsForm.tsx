import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { ThemePicker } from '../../lib/ThemePicker';
import { ToolkitColors } from '../../lib/ToolkitColors';

export interface SettingsValues {
  notionToken: string;
  skuLibraryDb: string;
  listingErrorsDb: string;
  adminBaseUrl: string;
}

interface Props {
  settings: SettingsValues;
  defaults: { skuLibraryDb: string; listingErrorsDb: string };
  onSaved?: (settings: SettingsValues) => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function SettingsForm(props: Props) {
  const [form, setForm] = useState<SettingsValues>(props.settings);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  // Keep the form in sync when the panel loads settings asynchronously (or
  // they change elsewhere), so we never save a stale/blank value over the top.
  useEffect(() => {
    setForm(props.settings);
  }, [props.settings]);

  function update<K extends keyof SettingsValues>(
    key: K,
    value: string,
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
    setState('idle');
    setError('');
  }

  async function save(): Promise<void> {
    const next = {
      notionToken: form.notionToken.trim(),
      // Empty falls back to the live database ids in the background worker.
      skuLibraryDb: form.skuLibraryDb.trim(),
      listingErrorsDb: form.listingErrorsDb.trim(),
      adminBaseUrl: form.adminBaseUrl.trim(),
    };
    setState('saving');
    setError('');
    try {
      await browser.storage.local.set(next);
      // Read back to prove it actually persisted before claiming "Saved".
      const stored = await browser.storage.local.get([
        'notionToken',
        'skuLibraryDb',
        'listingErrorsDb',
        'adminBaseUrl',
      ]);
      const persisted: SettingsValues = {
        notionToken: (stored.notionToken as string) ?? '',
        skuLibraryDb: (stored.skuLibraryDb as string) ?? '',
        listingErrorsDb: (stored.listingErrorsDb as string) ?? '',
        adminBaseUrl: (stored.adminBaseUrl as string) ?? '',
      };
      if (persisted.notionToken !== next.notionToken) {
        throw new Error('Value did not persist to storage.');
      }
      setForm(persisted);
      props.onSaved?.(persisted);
      setState('saved');
    } catch (err) {
      setError((err as Error).message || 'Failed to save settings.');
      setState('error');
    }
  }

  const showingSkuDefault =
    !form.skuLibraryDb && props.defaults.skuLibraryDb.length > 0;
  const showingErrorsDefault =
    !form.listingErrorsDb && props.defaults.listingErrorsDb.length > 0;

  return (
    <main class="mhx-content">
      <ThemePicker />
      <ToolkitColors />
      <label class="mhx-field mhx-field--block">
        <span>Notion token</span>
        <input
          type="password"
          value={form.notionToken}
          placeholder="secret_… / ntn_…"
          autocomplete="off"
          onInput={(e) => update('notionToken', e.currentTarget.value)}
        />
      </label>
      <label class="mhx-field mhx-field--block">
        <span>SKU Library database id</span>
        <input
          type="text"
          value={form.skuLibraryDb}
          placeholder={
            showingSkuDefault ? props.defaults.skuLibraryDb : 'optional'
          }
          onInput={(e) => update('skuLibraryDb', e.currentTarget.value)}
        />
      </label>
      <label class="mhx-field mhx-field--block">
        <span>Listing Errors database id</span>
        <input
          type="text"
          value={form.listingErrorsDb}
          placeholder={
            showingErrorsDefault ? props.defaults.listingErrorsDb : 'optional'
          }
          onInput={(e) => update('listingErrorsDb', e.currentTarget.value)}
        />
      </label>
      <label class="mhx-field mhx-field--block">
        <span>Magento Admin base URL</span>
        <input
          type="url"
          value={form.adminBaseUrl}
          placeholder="https://… (used by backend link flows)"
          onInput={(e) => update('adminBaseUrl', e.currentTarget.value)}
        />
      </label>
      <div class="mhx-row">
        <button
          type="button"
          class="mhx-primary"
          disabled={state === 'saving'}
          onClick={() => void save()}
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {state === 'saved' ? <span class="mhx-saved">Saved</span> : null}
      </div>
      {state === 'error' ? <div class="mhx-error">{error}</div> : null}
      <p class="mhx-note">
        Stored in chrome.storage.local only — never logged, never committed.
      </p>
    </main>
  );
}
