import { h, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  BRIDGE_CLIENTS,
  DEFAULT_BRIDGE_CONFIG,
  presetById,
  presetsByGroup,
  type BridgeCatalog,
  type BridgeHealth,
  type BridgeModel,
  type ModelBridgeConfig,
} from '../../../automation';
import type {
  ModelBridgeSaveResponse,
  ModelBridgeStatusResponse,
} from '../../../core/messages';

function StatusBadge({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const cls = ok ? 'db-badge db-ok' : warn ? 'db-badge db-warn' : 'db-badge db-bad';
  return <span class={cls}>{ok ? 'online' : warn ? 'attention' : 'offline'}</span>;
}

function VisionCell({ model }: { model: BridgeModel }) {
  if (model.vision === true) return <span class="ok">yes</span>;
  if (model.vision === false) return <span class="bad">no</span>;
  return <span title="The endpoint did not publish input modalities">?</span>;
}

/** `<base>/chat/completions` and `<base>/models` need host access. */
function hostPattern(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}/*`;
  } catch {
    return null;
  }
}

/**
 * Asks for the origin declared in `optional_host_permissions`. Must be called
 * straight from the click: an await before it can drop the user gesture.
 */
async function ensureHostAccess(baseUrl: string): Promise<boolean> {
  const pattern = hostPattern(baseUrl);
  if (!pattern) return true;
  if (/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(pattern)) return true;
  try {
    return await browser.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
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
    // The click is the permission gesture: ask before anything else.
    const granted = await ensureHostAccess(config.baseUrl);
    if (!granted) {
      setError(
        `The browser did not grant access to ${config.baseUrl}. ` +
          'Press Save again and allow the host, otherwise model calls will fail.',
      );
    }
    setSaving(true);
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

  const preset = presetById(config.preset);
  const isApi = config.kind === 'openai';

  const providers = useMemo(() => {
    if (config.kind === 'openai') return [];
    const ids = new Set<string>();
    for (const model of catalog?.models ?? []) ids.add(model.providerID);
    if (config.providerID) ids.add(config.providerID);
    return [...ids].sort();
  }, [catalog, config.providerID, config.kind]);

  const models = useMemo(() => {
    const list = (catalog?.models ?? []).filter(
      (m) => m.providerID === config.providerID,
    );
    return [...list].sort((a, b) => {
      const byVision = Number(b.vision === true) - Number(a.vision === true);
      if (byVision !== 0) return byVision;
      const byFree = Number(b.free) - Number(a.free);
      if (byFree !== 0) return byFree;
      return a.modelID.localeCompare(b.modelID);
    });
  }, [catalog, config.providerID]);

  const selected = models.find((m) => m.modelID === config.modelID);
  const serverUp = health?.ok === true;
  const freeCount = (catalog?.models ?? []).filter((m) => m.free).length;
  const visionCount = (catalog?.models ?? []).filter((m) => m.vision === true).length;
  const unknownVision = (catalog?.models ?? []).filter(
    (m) => m.vision === undefined,
  ).length;

  const applyPreset = (id: string): void => {
    const next = presetById(id);
    if (!next) return;
    setConfig({
      ...config,
      kind: next.kind,
      preset: next.id,
      baseUrl: next.baseUrl,
      providerID: next.kind === 'openai' ? next.id : 'opencode',
      modelID: next.defaultModel ?? '',
    });
    setCatalog(null);
    setHealth(null);
  };

  return (
    <Fragment>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Model bridge</h2>
          <StatusBadge ok={serverUp} warn={!!health && !serverUp} />
        </div>
        <p class="db-note">
          The model-sort stage asks a vision model what a human would check
          anyway (printing sheets, model shots, backgrounds). Two backends: the
          local <b>opencode</b> server, which keeps provider keys out of the
          browser, or <b>any OpenAI-compatible endpoint</b> — Freebuff,
          OpenRouter, Groq, Gemini, Z.AI / GLM, NVIDIA NIM, Mistral, OpenAI, or a
          local Ollama / LM Studio / llama.cpp server. Cline, Antigravity and VS
          Code keep their models behind their own sign-in, so they share this
          bridge through a local server or gateway (see <b>Clients &amp; IDEs</b>{' '}
          below). Only the verdict is stored; severity is never set here.
        </p>
        <ul class="db-kv">
          <li>
            <span>Backend</span>
            <b>{preset?.label ?? config.kind}</b>
          </li>
          <li>
            <span>Endpoint</span>
            <b>{config.baseUrl || '—'}</b>
          </li>
          <li>
            <span>Status</span>
            <b class={serverUp ? 'ok' : 'bad'}>
              {serverUp
                ? health?.version
                  ? `online · v${health.version}`
                  : `online${health?.detail ? ` · ${health.detail}` : ''}`
                : 'offline'}
            </b>
          </li>
          {!isApi ? (
            <li>
              <span>Connected providers</span>
              <b>{catalog?.connected?.length ? catalog.connected.join(', ') : '—'}</b>
            </li>
          ) : null}
          <li>
            <span>Models available</span>
            <b>
              {catalog?.models?.length ?? 0} · {visionCount} vision
              {unknownVision > 0 ? ` · ${unknownVision} unknown` : ''} ·{' '}
              {freeCount} free
            </b>
          </li>
          {selected ? (
            <li>
              <span>Selected model</span>
              <b class={selected.vision === true ? 'ok' : selected.vision === false ? 'bad' : ''}>
                {selected.modelID}
                {selected.vision === true
                  ? ' · vision'
                  : selected.vision === false
                    ? ' · no image input'
                    : ' · vision unknown'}
                {selected.free ? ' · free' : ''}
              </b>
            </li>
          ) : null}
        </ul>
        {health && !health.ok && health.error ? (
          <p class="db-flags db-flags--warn">{health.error}</p>
        ) : null}
        {catalog && !catalog.ok && catalog.error && catalog.error !== health?.error ? (
          <p class="db-flags db-flags--warn">{catalog.error}</p>
        ) : null}
        {!isApi ? (
          <p class="db-note">
            Automatic start: run <code>scripts/bridge/install-autostart.ps1</code> once
            to register a logon task that keeps this bridge up. Manual start:{' '}
            <code>scripts/bridge/start-bridge.ps1</code>.
          </p>
        ) : (
          <p class="db-note">
            The API key is stored in this browser profile (next to the Notion
            token) and is only sent to the endpoint above. A local server needs
            no key.
          </p>
        )}
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
            class="db-btn"
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
          <h2>Clients &amp; IDEs</h2>
          <span class="db-count">{BRIDGE_CLIENTS.length}</span>
        </div>
        <p class="db-note">
          These tools are not API providers: they sign in through the editor and
          hand out no key. Each can still use the same model as this bridge —
          either by pointing the tool at the local server above, or through a
          local gateway that exports its session as an OpenAI-compatible URL.
        </p>
        <table class="db-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>How it shares this bridge</th>
              <th>Gateway</th>
            </tr>
          </thead>
          <tbody>
            {BRIDGE_CLIENTS.map((client) => (
              <tr key={client.id}>
                <td>{client.label}</td>
                <td class="db-notes">{client.how}</td>
                <td>{client.gateway ? 'yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Settings</h2>
          <span class={config.enabled ? 'db-badge db-ok' : 'db-badge'}>
            {config.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>
        <ul class="db-kv">
          <li>
            <span>Backend</span>
            <select
              class="db-input"
              value={config.preset}
              onChange={(e) =>
                applyPreset((e.target as HTMLSelectElement).value)
              }
            >
              {presetsByGroup().map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {group.presets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </li>
          <li>
            <span>Base URL</span>
            <input
              class="db-input"
              type="text"
              value={config.baseUrl}
              placeholder={
                isApi ? 'https://api.example.com/v1' : 'http://127.0.0.1:4096'
              }
              onInput={(e) =>
                setConfig({
                  ...config,
                  preset: 'custom',
                  baseUrl: (e.target as HTMLInputElement).value,
                })
              }
            />
          </li>
          {isApi ? (
            <li>
              <span>API key</span>
              <input
                class="db-input"
                type="password"
                value={config.apiKey}
                placeholder={preset?.apiKey === false ? 'not needed' : 'sk-…'}
                autocomplete="off"
                onInput={(e) =>
                  setConfig({ ...config, apiKey: (e.target as HTMLInputElement).value })
                }
              />
            </li>
          ) : (
            <>
              <li>
                <span>Server username</span>
                <input
                  class="db-input"
                  type="text"
                  value={config.username}
                  onInput={(e) =>
                    setConfig({
                      ...config,
                      username: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              </li>
              <li>
                <span>Server password</span>
                <input
                  class="db-input"
                  type="password"
                  value={config.password}
                  placeholder="OPENCODE_SERVER_PASSWORD"
                  onInput={(e) =>
                    setConfig({
                      ...config,
                      password: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              </li>
            </>
          )}
          {!isApi ? (
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
                    setConfig({
                      ...config,
                      providerID: (e.target as HTMLInputElement).value,
                    })
                  }
                />
              )}
            </li>
          ) : null}
          <li>
            <span>Model</span>
            {models.length > 0 ? (
              <select
                class="db-input"
                value={config.modelID}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    modelID: (e.target as HTMLSelectElement).value,
                  })
                }
              >
                <option value="">— pick a model —</option>
                {models.map((m) => (
                  <option key={m.modelID} value={m.modelID}>
                    {m.modelID}
                    {m.vision === true ? ' · vision' : ''}
                    {m.free ? ' · free' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                class="db-input"
                type="text"
                value={config.modelID}
                placeholder={isApi ? 'model id from /models' : 'glm-5.3-flash-free'}
                onInput={(e) =>
                  setConfig({
                    ...config,
                    modelID: (e.target as HTMLInputElement).value,
                  })
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
        {preset?.note ? <p class="db-note">{preset.note}</p> : null}
        {isApi && selected && selected.vision === false ? (
          <p class="db-flags db-flags--warn">
            This model reports no image input, so scoring will fail. Pick a
            vision model (its name usually contains VL, vision or the model
            family supports images).
          </p>
        ) : null}
        {isApi ? (
          <p class="db-note">
            The bridge tries strict <code>json_schema</code> output first, then{' '}
            <code>json_object</code>, then a plain prompt with the schema —
            local servers that only support the simpler modes still work.
          </p>
        ) : (
          <p class="db-note">
            Thinking-mode models reject structured output. If a run fails with
            “thinking mode does not support this tool choice”, pick a
            non-thinking model such as <code>glm-5.3-flash-free</code>. The
            server password is stored locally next to the Notion token and is
            never logged.
          </p>
        )}
        {!isApi ? (
          <p class="db-note">
            The password is owned by <code>scripts\bridge\start-bridge.ps1</code> and
            kept in <code>%LOCALAPPDATA%\BOG\bridge-password.txt</code>. Run{' '}
            <code>scripts\bridge\start-bridge.ps1 -CopyPassword</code> to copy it,
            then paste it here and press <b>Save settings</b>.
          </p>
        ) : null}
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
                  <td>
                    <VisionCell model={m} />
                  </td>
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
