import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  DEFAULT_LISTING_ERRORS_DB,
  DEFAULT_SKU_LIBRARY_DB,
} from '../../../shared/notion/client';
import { ThemePicker } from '../../kit/ThemePicker';
import { ToolkitColors } from '../../kit/ToolkitColors';
import { useSettings, type DashboardSettings } from '../../shell/useSettings';

/**
 * SETTINGS ONLY OWNS SETTINGS.
 *
 * It used to render the whole Notion-health screen and the whole model-bridge
 * screen inline, which meant this file imported two other lanes' screens (and
 * their state, requests and permissions). Those screens are now their own nav
 * entries, and this card only points at them.
 */
export function Settings({ onOpen }: { onOpen?: (id: string) => void }) {
  const { settings, loaded, save } = useSettings();
  const [form, setForm] = useState<DashboardSettings>(settings);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const set = (key: keyof DashboardSettings, value: string): void =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSave = async (): Promise<void> => {
    setBusy(true);
    setStatus('');
    try {
      const next: DashboardSettings = {
        notionToken: form.notionToken.trim(),
        skuLibraryDb: form.skuLibraryDb.trim(),
        listingErrorsDb: form.listingErrorsDb.trim(),
        adminBaseUrl: form.adminBaseUrl.trim(),
      };
      const persisted = await save(next);
      if (next.notionToken && !persisted.notionToken) {
        throw new Error('Token did not persist');
      }
      setStatus('Saved');
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 2500);
    }
  };

  if (!loaded) return <p class="db-empty">Loading settings…</p>;

  return (
    <>
      <section class="db-card db-wide">
        <h2>Settings</h2>

        <ThemePicker />

        <ToolkitColors />

        <label class="db-field">
          <span>Notion token</span>
          <input
            type="password"
            value={form.notionToken}
            placeholder="ntn_…"
            autocomplete="off"
            onInput={(e) => set('notionToken', e.currentTarget.value)}
          />
        </label>

        <label class="db-field">
          <span>
            SKU Library database id <em>default: {DEFAULT_SKU_LIBRARY_DB}</em>
          </span>
          <input
            type="text"
            value={form.skuLibraryDb}
            placeholder={DEFAULT_SKU_LIBRARY_DB}
            onInput={(e) => set('skuLibraryDb', e.currentTarget.value)}
          />
        </label>

        <label class="db-field">
          <span>
            Listing Errors database id <em>default: {DEFAULT_LISTING_ERRORS_DB}</em>
          </span>
          <input
            type="text"
            value={form.listingErrorsDb}
            placeholder={DEFAULT_LISTING_ERRORS_DB}
            onInput={(e) => set('listingErrorsDb', e.currentTarget.value)}
          />
        </label>

        <label class="db-field">
          <span>
            Admin base URL <em>e.g. https://bestofgifts.pt/admin_L2pZx/</em>
          </span>
          <input
            type="text"
            value={form.adminBaseUrl}
            placeholder="https://bestofgifts.pt/admin_xxx/"
            onInput={(e) => set('adminBaseUrl', e.currentTarget.value)}
          />
        </label>

        <div class="db-actions">
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={busy}
            onClick={() => void onSave()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {status ? <span class="db-status">{status}</span> : null}
        </div>
      </section>

      <section class="db-card db-wide">
        <h2>Checks & connections</h2>
        <p class="db-empty">
          The Notion connection check and the model bridge have their own screens,
          so a failing request on one never blocks saving a setting here.
        </p>
        <div class="db-actions">
          <button type="button" class="db-btn" onClick={() => onOpen?.('notion')}>
            Open Notion health
          </button>
          <button type="button" class="db-btn" onClick={() => onOpen?.('bridge')}>
            Open model bridge
          </button>
        </div>
      </section>
    </>
  );
}
