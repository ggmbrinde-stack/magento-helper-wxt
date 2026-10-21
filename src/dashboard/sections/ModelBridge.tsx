import { h, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  DEFAULT_BRIDGE_CONFIG,
  type BridgeCatalog,
  type BridgeHealth,
  type ModelBridgeConfig,
} from '../../lib/modelBridge';
import type {
  ModelBridgeSaveResponse,
  ModelBridgeStatusResponse,
} from '../../lib/messages';

function StatusBadge({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const cls = ok ? 'db-badge db-ok' : warn ? 'db-badge db-warn' : 'db-badge db-bad';
  return <span class={cls}>{ok ? 'online' : warn ? 'attention' : 'offline'}</span>;
}

export function ModelBridge() {
  const [config, setConfig] = useState<ModelBridgeConfig>({ ...DEFAULT_BRIDGE_CONFIG });
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [catalog, setCatalog] = useState<BridgeCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function refresh(): Promise<void> {
    setLoading(true);
    setError('');
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'MODEL_BRIDGE_STATUS',
      })) as ModelBridgeStatusResponse;
      if (!res?.ok) {
        setError(res?.error ?? 'Bridge check failed.');
        return;
      }
      if (res.config) setConfig(res.config);
      setHealth(res.health ?? null);
      setCatalog(res.catalog ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError('');
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'MODEL_BRIDGE_SAVE',
        config,
      })) as ModelBridgeSaveResponse;
      if (!res?.ok) {
        setError(res?.error ?? 'Could not save bridge settings.');
        return;
      }
      if (res.config) setConfig(res.config);
      setHealth(res.health ?? null);
      setCatalog(res.catalog ?? null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const providers = useMemo(() => {
    const ids = new Set<string>();
    for (const model of catalog?.models ?? []) ids.add(model.providerID);
    if (config.providerID) ids.add(config.providerID);
    return [...ids].sort();
  }, [catalog, config.providerID]);

  const models = useMemo(
    () => (catalog?.models ?? []).filter((m) => m.providerID === config.providerID),
    [catalog, config.providerID],
  );

  const selected = models.find((m) => m.modelID === config.modelID);
  const serverUp = health?.ok === true;
  const freeCount = (catalog?.models ?? []).filter((m) => m.free).length;
  const visionCount = (catalog?.models ?? []).filter((m) => m.vision).length;

  return (
    <Fragment>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Model bridge</h2>
          <StatusBadge ok={serverUp} warn={!!health && !serverUp} />
        </div>
        <p class="db-note">
          The model-sort stage reaches a vision model through the local opencode
          server. The extension never stores a provider key — opencode owns
          provider auth, so the free models you already run are available here.
          Only the model's verdict is kept (candidates + review flags); no
          severity is ever set automatically.
        </p>
        <ul class="db-kv">
          <li>
            <span>Server</span>
            <b class={serverUp ? 'ok' : 'bad'}>
              {serverUp ? `online · v${health?.version ?? '?'}` : 'offline'}
            </b>
          </li>
          <li>
            <span>URL</span>
            <b>{config.baseUrl}</b>
          </li>
          <li>
            <span>Connected providers</span>
            <b>{catalog?.connected?.length ? catalog.connected.join(', ') : '—'}</b>
          </li>
          <li>
            <span>Models available</span>
            <b>
              {catalog?.models?.length ?? 0} · {visionCount} with vision · {freeCount} free
            </b>
          </li>
          {selected ? (
            <li>
              <span>Selected model</span>
              <b class={selected.vision ? 'ok' : 'bad'}>
                {selected.modelID}
                {selected.vision ? ' · vision' : ' · text-only'}
                {selected.free ? ' · free' : ''}
              </b>
            </li>
          ) : null}
        </ul>
        {health && !health.ok && health.error ? (
          <p class="db-flags db-flags--warn">{health.error}</p>
        ) : null}
        <p class="db-note">
          Automatic start: run <code>scripts/bridge/install-autostart.ps1</code> once
          to register a logon task that keeps this bridge up. Manual start:{' '}
          <code>scripts/bridge/start-bridge.ps1</code>.
        </p>
        <div class="db-actions">
          <button
            type="button"
            class="db-btn"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? 'Checking…' : 'Re-check'}
          </button>
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </section>

      {error ? <div class="mhx-error">{error}</div> : null}

      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Settings</h2>
          <span class={config.enabled ? 'db-badge db-ok' : 'db-badge'}>
            {config.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>
        <ul class="db-kv">
          <li>
            <span>Base URL</span>
            <input
              class="db-input"
              type="text"
              value={config.baseUrl}
              onInput={(e) =>
                setConfig({ ...config, baseUrl: (e.target as HTMLInputElement).value })
              }
            />
          </li>
          <li>
            <span>Server username</span>
            <input
              class="db-input"
              type="text"
              value={config.username}
              onInput={(e) =>
                setConfig({ ...config, username: (e.target as HTMLInputElement).value })
              }
            />
          </li>
          <li>
            <span>Server password</span>
            <input
              class="db-input"
              type="password"
              placeholder="OPENCODE_SERVER_PASSWORD"
              value={config.password}
              onInput={(e) =>
                setConfig({ ...config, password: (e.target as HTMLInputElement).value })
              }
            />
          </li>
          <li>
            <span>Provider</span>
            {providers.length > 0 ? (
              <select
                class="db-input"
                value={config.providerID}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    providerID: (e.target as HTMLSelectElement).value,
                    modelID: '',
                  })
                }
              >
                {providers.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            ) : (
              <input
                class="db-input"
                type="text"
                value={config.providerID}
                onInput={(e) =>
                  setConfig({ ...config, providerID: (e.target as HTMLInputElement).value })
                }
              />
            )}
          </li>
          <li>
            <span>Model</span>
            {models.length > 0 ? (
              <select
                class="db-input"
                value={config.modelID}
                onChange={(e) =>
                  setConfig({ ...config, modelID: (e.target as HTMLSelectElement).value })
                }
              >
                <option value="">— pick a model —</option>
                {models.map((m) => (
                  <option key={m.modelID} value={m.modelID}>
                    {m.modelID}
                    {m.vision ? ' · vision' : ''}
                    {m.free ? ' · free' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                class="db-input"
                type="text"
                value={config.modelID}
                onInput={(e) =>
                  setConfig({ ...config, modelID: (e.target as HTMLInputElement).value })
                }
              />
            )}
          </li>
          <li>
            <span>Enabled</span>
            <label class="db-check">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    enabled: (e.target as HTMLInputElement).checked,
                  })
                }
              />
              Use the bridge for model scoring
            </label>
          </li>
        </ul>
        <p class="db-note">
          Thinking-mode models reject structured output. If a run fails with
          "thinking mode does not support this tool choice", pick a non-thinking
          model such as <code>glm-5.3-flash-free</code>. The server password is
          stored locally next to the Notion token and is never logged.
        </p>
        <p class="db-note">
          The password is owned by <code>scripts\bridge\start-bridge.ps1</code> and
          kept in <code>%LOCALAPPDATA%\BOG\bridge-password.txt</code>. Run{' '}
          <code>scripts\bridge\start-bridge.ps1 -CopyPassword</code> to copy it, then
          paste it here and press <b>Save settings</b>.
        </p>
      </section>

      {catalog && catalog.models.length > 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Available models</h2>
            <span class="db-count">{catalog.models.length}</span>
          </div>
          <table class="db-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Model</th>
                <th>Vision</th>
                <th>Free</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {catalog.models.map((m) => (
                <tr key={`${m.providerID}/${m.modelID}`}>
                  <td>{m.providerID}</td>
                  <td class="db-notes">{m.modelID}</td>
                  <td>{m.vision ? 'yes' : '—'}</td>
                  <td>{m.free ? 'yes' : '—'}</td>
                  <td>{m.context ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </Fragment>
  );
}
