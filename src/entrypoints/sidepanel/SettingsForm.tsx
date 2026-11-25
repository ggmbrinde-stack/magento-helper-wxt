import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { ThemePicker } from '../../dashboard/kit/ThemePicker';
import { ToolkitColors } from '../../dashboard/kit/ToolkitColors';
import { saveFeatureSettings, FEATURE_DEFAULTS, loadFeatureSettings } from '../../shared/featureSettings';
import { FEATURE_CATALOG, FEATURE_GROUPS } from '../../shared/featureCatalog';

export interface SettingsValues {
  notionToken: string;
  skuLibraryDb: string;
  listingErrorsDb: string;
  adminBaseUrl: string;
  drimeEnabled: boolean;
  drimeApiToken: string;
  drimeWorkspaceId: number;
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
  const [features, setFeatures] = useState<Record<string, boolean>>({ ...FEATURE_DEFAULTS });
  const [detected, setDetected] = useState<string[]>([]);
  useEffect(() => {
    void loadFeatureSettings().then(setFeatures);
    void chrome.storage.local.get('detectedFeatures').then((d) => {
      const v = d.detectedFeatures;
      if (Array.isArray(v)) setDetected(v as string[]);
    });
  }, []);
  const [error, setError] = useState('');

  // Keep the form in sync when the panel loads settings asynchronously (or
  // they change elsewhere), so we never save a stale/blank value over the top.
  useEffect(() => {
    setForm(props.settings);
  }, [props.settings]);

  function update<K extends keyof SettingsValues>(
    key: K,
    value: SettingsValues[K],
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
      drimeEnabled: form.drimeEnabled,
      drimeApiToken: form.drimeApiToken.trim(),
      drimeWorkspaceId: form.drimeWorkspaceId,
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
        'drimeEnabled',
        'drimeApiToken',
        'drimeWorkspaceId',
      ]);
      const persisted: SettingsValues = {
        notionToken: (stored.notionToken as string) ?? '',
        skuLibraryDb: (stored.skuLibraryDb as string) ?? '',
        listingErrorsDb: (stored.listingErrorsDb as string) ?? '',
        adminBaseUrl: (stored.adminBaseUrl as string) ?? '',
        drimeEnabled: (stored.drimeEnabled as boolean) ?? false,
        drimeApiToken: (stored.drimeApiToken as string) ?? '',
        drimeWorkspaceId: (stored.drimeWorkspaceId as number) ?? 0,
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

  async function testDrimeConnection(): Promise<void> {
    const resultEl = document.getElementById('drime-test-result');
    if (!resultEl) return;
    
    if (!form.drimeApiToken) {
      resultEl.textContent = 'Enter API token first';
      resultEl.style.color = 'var(--destructive)';
      return;
    }
    
    resultEl.textContent = 'Testing…';
    resultEl.style.color = 'var(--muted-foreground)';
    
    try {
      const response = await fetch('https://app.drime.cloud/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${form.drimeApiToken}`,
        },
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      resultEl.textContent = `✓ Connected as ${data.user?.email || data.user?.display_name || 'user'}`;
      resultEl.style.color = 'var(--success)';
    } catch (err) {
      resultEl.textContent = `✗ ${(err as Error).message}`;
      resultEl.style.color = 'var(--destructive)';
    }
  }

  return (
    <main class="mhx-content">
      <ThemePicker />
      <ToolkitColors />
      <label class="mhx-panel-field mhx-panel-field--block">
        <span>Notion token</span>
        <input
          type="password"
          value={form.notionToken}
          placeholder="secret_… / ntn_…"
          autocomplete="off"
          onInput={(e) => update('notionToken', e.currentTarget.value)}
        />
      </label>
      <label class="mhx-panel-field mhx-panel-field--block">
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
      <label class="mhx-panel-field mhx-panel-field--block">
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
      <label class="mhx-panel-field mhx-panel-field--block">
        <span>Magento Admin base URL</span>
        <input
          type="url"
          value={form.adminBaseUrl}
          placeholder="https://… (used by backend link flows)"
          onInput={(e) => update('adminBaseUrl', e.currentTarget.value)}
        />
      </label>
      <hr class="mhx-divider" />
      <div class="mhx-drime-section">
        <strong>Drime Cloud Storage</strong>
        <p class="mhx-note">
          Store product images in Drime Cloud (20 GB free).{' '}
          <a href="https://app.drime.cloud/account-settings#developers" target="_blank" rel="noopener">
            Get API token
          </a>
        </p>
        <label class="mhx-panel-field">
          <input
            type="checkbox"
            checked={form.drimeEnabled}
            onChange={(e) => setForm((prev) => ({ ...prev, drimeEnabled: e.currentTarget.checked }))}
          />
          <span>Enable Drime Cloud storage</span>
        </label>
        <label class="mhx-panel-field mhx-panel-field--block">
          <span>API Token</span>
          <input
            type="password"
            value={form.drimeApiToken}
            placeholder="drime_…"
            autocomplete="off"
            onInput={(e) => update('drimeApiToken', e.currentTarget.value)}
            disabled={!form.drimeEnabled}
          />
        </label>
        <label class="mhx-panel-field mhx-panel-field--block">
          <span>Workspace ID</span>
          <input
            type="number"
            value={form.drimeWorkspaceId || ''}
            placeholder="0 (personal)"
            onInput={(e) => update('drimeWorkspaceId', e.currentTarget.value === '' ? 0 : parseInt(e.currentTarget.value, 10))}
            disabled={!form.drimeEnabled}
          />
        </label>
        <div class="mhx-row">
          <button
            type="button"
            class="mhx-secondary"
            disabled={!form.drimeEnabled || !form.drimeApiToken || state === 'saving'}
            onClick={testDrimeConnection}
          >
            Test Connection
          </button>
          <span id="drime-test-result" class="mhx-note"></span>
        </div>
      </div>
      <div class="mhx-feature-toggles">
        <strong>Features</strong>
        {FEATURE_GROUPS.map((group) => {
          const inGroup = FEATURE_CATALOG.filter(
            (feature) =>
              feature.group === group &&
              (feature.id === 'extensionEnabled' ||
                detected.length === 0 ||
                detected.includes(feature.id)),
          );
          if (inGroup.length === 0) return null;
          return (
            <div key={group} class="mhx-feature-group">
              <span class="mhx-note">{group}</span>
              {inGroup.map((feature) => (
                <label
                  key={feature.id}
                  class="mhx-panel-field"
                  title={feature.description}
                >
                  <input
                    type="checkbox"
                    checked={features[feature.id] ?? feature.defaultOn}
                    disabled={!feature.available}
                    onChange={async (e) => {
                      const next = {
                        ...features,
                        [feature.id]: e.currentTarget.checked,
                      };
                      setFeatures(next);
                      await saveFeatureSettings(next);
                    }}
                  />
                  <span>{feature.label}</span>
                  {feature.available ? null : (
                    <em class="mhx-note">unavailable in this build</em>
                  )}
                </label>
              ))}
            </div>
          );
        })}
      </div>
      <div class="mhx-row">
        <button
          type="button"
          class="mhx-primary"
          disabled={state === 'saving'}
          onClick={() => void save()}
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {state === 'saved' ? <span class="mhx-sidepanel-saved">Saved</span> : null}
      </div>
      {state === 'error' ? <div class="mhx-error">{error}</div> : null}
      <p class="mhx-note">
        Stored in chrome.storage.local only — never logged, never committed.
      </p>
    </main>
  );
}
