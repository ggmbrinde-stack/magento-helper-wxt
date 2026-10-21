// Local opencode bridge — the extension's only path to a model.
//
// `opencode serve` exposes a local HTTP API (OpenAPI at /doc). The extension
// never stores a provider key: opencode owns provider auth, so the free models
// the operator already runs are available without putting provider secrets in
// the browser. The optional OPENCODE_SERVER_PASSWORD basic auth is configurable
// here and is stored next to the Notion token in `chrome.storage.local`.
//
// The bridge is read-only from the extension's point of view: it creates a
// throw-away session, asks for one structured verdict and deletes the session.

export const MODEL_BRIDGE_KEY = 'modelBridge';

export const DEFAULT_BRIDGE_BASE_URL = 'http://127.0.0.1:4096';
export const DEFAULT_BRIDGE_USERNAME = 'opencode';

// glm-5.3-flash-free was verified live: it accepts image parts and returns
// schema-validated JSON at zero cost. Thinking-mode models (e.g.
// deepseek-v4.1-flash-free) reject the structured-output tool choice.
export const DEFAULT_BRIDGE_PROVIDER = 'opencode';
export const DEFAULT_BRIDGE_MODEL = 'glm-5.3-flash-free';

export interface ModelBridgeConfig {
  baseUrl: string;
  username: string;
  password: string;
  providerID: string;
  modelID: string;
  enabled: boolean;
}

export const DEFAULT_BRIDGE_CONFIG: ModelBridgeConfig = {
  baseUrl: DEFAULT_BRIDGE_BASE_URL,
  username: DEFAULT_BRIDGE_USERNAME,
  password: '',
  providerID: DEFAULT_BRIDGE_PROVIDER,
  modelID: DEFAULT_BRIDGE_MODEL,
  enabled: true,
};

export interface BridgeHealth {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface BridgeModel {
  providerID: string;
  providerName: string;
  modelID: string;
  name: string;
  vision: boolean;
  context?: number;
  output?: number;
  free: boolean;
}

export interface BridgeCatalog {
  ok: boolean;
  connected: string[];
  models: BridgeModel[];
  error?: string;
}

export interface BridgeScoreRequest {
  sessionId: string;
  providerID: string;
  modelID: string;
  text: string;
  system?: string;
  /** Public image URLs, sent as `file` parts (vision). */
  images?: string[];
  schema: Record<string, unknown>;
  retryCount?: number;
  timeoutMs?: number;
}

export interface BridgeScoreResult {
  ok: boolean;
  structured?: unknown;
  text?: string;
  error?: string;
  cost?: number;
  providerID?: string;
  modelID?: string;
  ms: number;
  /** True when the provider refused because the free quota is used up. */
  quota?: boolean;
}

const DEFAULT_TIMEOUT_MS = 120000;

/**
 * The hosted free models (and `opencode` in general) answer with
 * "Free usage exceeded, subscribe to Go / tentando novamente em 28483s" when
 * the quota is gone. Without this the bridge would sit in its own retry loop
 * for hours, so every consumer sees this latch and stops calling the model.
 */
const QUOTA_PATTERNS = [
  /free usage exceeded/i,
  /subscribe to (?:the )?go\b/i,
  /usage limit (?:reached|exceeded)/i,
  /tentando novamente em \d+s/i,
];

let quotaLatch: string | null = null;

export function isQuotaExhausted(raw: string): boolean {
  return QUOTA_PATTERNS.some((pattern) => pattern.test(raw));
}

export function modelQuotaMessage(): string | null {
  return quotaLatch;
}

export function resetModelQuotaLatch(): void {
  quotaLatch = null;
}

function latchQuota(raw: string): string {
  const message =
    'Free usage for this model is exhausted ("Free usage exceeded, subscribe to Go"). ' +
    'The audit stopped asking instead of waiting for the retry window - switch the ' +
    'model in Model bridge settings (or wait ~8h) and run again. Server said: ' +
    raw.trim().slice(0, 240);
  quotaLatch = message;
  return message;
}

export async function loadBridgeConfig(): Promise<ModelBridgeConfig> {
  try {
    const stored = await chrome.storage.local.get([MODEL_BRIDGE_KEY]);
    const raw = stored[MODEL_BRIDGE_KEY] as Partial<ModelBridgeConfig> | undefined;
    if (!raw) return { ...DEFAULT_BRIDGE_CONFIG };
    return {
      baseUrl: String(raw.baseUrl ?? DEFAULT_BRIDGE_CONFIG.baseUrl).replace(/\/+$/, ''),
      username: String(raw.username ?? DEFAULT_BRIDGE_CONFIG.username),
      password: String(raw.password ?? ''),
      providerID: String(raw.providerID ?? DEFAULT_BRIDGE_CONFIG.providerID),
      modelID: String(raw.modelID ?? DEFAULT_BRIDGE_CONFIG.modelID),
      enabled: raw.enabled !== false,
    };
  } catch {
    return { ...DEFAULT_BRIDGE_CONFIG };
  }
}

export async function saveBridgeConfig(
  config: ModelBridgeConfig,
): Promise<ModelBridgeConfig> {
  const next: ModelBridgeConfig = {
    baseUrl: config.baseUrl.trim().replace(/\/+$/, '') || DEFAULT_BRIDGE_BASE_URL,
    username: config.username.trim() || DEFAULT_BRIDGE_USERNAME,
    password: config.password,
    providerID: config.providerID.trim() || DEFAULT_BRIDGE_PROVIDER,
    modelID: config.modelID.trim() || DEFAULT_BRIDGE_MODEL,
    enabled: config.enabled !== false,
  };
  await chrome.storage.local.set({ [MODEL_BRIDGE_KEY]: next });
  return next;
}

function base64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function authHeader(config: ModelBridgeConfig): Record<string, string> {
  if (!config.password) return {};
  return {
    Authorization: `Basic ${base64(`${config.username}:${config.password}`)}`,
  };
}

interface BridgeFetchInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

async function bridgeFetch(
  config: ModelBridgeConfig,
  path: string,
  init: BridgeFetchInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${config.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      body: init.body,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...authHeader(config),
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function friendlyBridgeError(raw: string): string {
  if (isQuotaExhausted(raw)) return latchQuota(raw);
  if (/thinking mode does not support/i.test(raw)) {
    return (
      'This model runs in thinking mode and cannot return structured output. ' +
      'Pick a non-thinking model (for example glm-5.3-flash-free).'
    );
  }
  if (/401|unauthor/i.test(raw)) {
    return 'The bridge rejected the credentials. Check the server password in Model bridge settings.';
  }
  if (/aborted|timed out|timeout/i.test(raw)) {
    return 'The model did not answer in time. Try a smaller image set or a faster model.';
  }
  return raw;
}

/** Probe the local server. `ok:false` is a normal state (server not running). */
export async function getBridgeHealth(
  config?: ModelBridgeConfig,
): Promise<BridgeHealth> {
  const cfg = config ?? (await loadBridgeConfig());
  try {
    const res = await bridgeFetch(cfg, '/global/health', {}, 8000);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        error: friendlyBridgeError(`HTTP ${res.status} ${body}`.trim()),
      };
    }
    const data = (await res.json()) as { healthy?: boolean; version?: string };
    return { ok: data.healthy === true, version: data.version };
  } catch (err) {
    return {
      ok: false,
      error:
        'Bridge not reachable at ' +
        cfg.baseUrl +
        ' — run `scripts/bridge/start-bridge.ps1` (or the autostart task). ' +
        errorMessage(err),
    };
  }
}

interface ProviderModelRaw {
  id?: string;
  name?: string;
  capabilities?: { attachment?: boolean };
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
}

interface ProviderRaw {
  id?: string;
  name?: string;
  models?: Record<string, ProviderModelRaw>;
}

/** Connected providers + their models, flattened for the picker. */
export async function listBridgeModels(
  config?: ModelBridgeConfig,
): Promise<BridgeCatalog> {
  const cfg = config ?? (await loadBridgeConfig());
  try {
    const res = await bridgeFetch(cfg, '/provider', {}, 15000);
    if (!res.ok) {
      return {
        ok: false,
        connected: [],
        models: [],
        error: friendlyBridgeError(`HTTP ${res.status}`),
      };
    }
    const data = (await res.json()) as {
      all?: ProviderRaw[];
      connected?: string[];
    };
    const connected = Array.isArray(data.connected) ? data.connected : [];
    const models: BridgeModel[] = [];
    for (const provider of data.all ?? []) {
      const providerID = String(provider.id ?? '');
      if (!providerID || (connected.length > 0 && !connected.includes(providerID))) {
        continue;
      }
      for (const [key, model] of Object.entries(provider.models ?? {})) {
        const modelID = String(model.id ?? key);
        const cost = model.cost ?? {};
        const free =
          /free/i.test(modelID) ||
          ((cost.input ?? 0) === 0 && (cost.output ?? 0) === 0);
        models.push({
          providerID,
          providerName: String(provider.name ?? providerID),
          modelID,
          name: String(model.name ?? modelID),
          vision: model.capabilities?.attachment === true,
          context: model.limit?.context,
          output: model.limit?.output,
          free,
        });
      }
    }
    return { ok: true, connected, models };
  } catch (err) {
    return {
      ok: false,
      connected: [],
      models: [],
      error: friendlyBridgeError(errorMessage(err)),
    };
  }
}

export async function createBridgeSession(
  title: string,
  config?: ModelBridgeConfig,
): Promise<string> {
  const cfg = config ?? (await loadBridgeConfig());
  const res = await bridgeFetch(
    cfg,
    '/session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    },
    15000,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      friendlyBridgeError(`session create failed: HTTP ${res.status} ${body}`.trim()),
    );
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error('session create returned no id');
  return data.id;
}

export async function deleteBridgeSession(
  sessionId: string,
  config?: ModelBridgeConfig,
): Promise<void> {
  const cfg = config ?? (await loadBridgeConfig());
  try {
    await bridgeFetch(cfg, `/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }, 8000);
  } catch {
    // A stale session is harmless; the server expires it.
  }
}

/**
 * One prompt -> one schema-validated object. Never parses prose: when the
 * model cannot produce structured output the call fails loudly so the runner
 * records an anomaly instead of guessing.
 */
export async function bridgeScore(
  req: BridgeScoreRequest,
  config?: ModelBridgeConfig,
): Promise<BridgeScoreResult> {
  const cfg = config ?? (await loadBridgeConfig());
  const started = Date.now();
  if (quotaLatch) {
    return { ok: false, quota: true, error: quotaLatch, ms: 0 };
  }
  const parts: Array<Record<string, unknown>> = [{ type: 'text', text: req.text }];
  for (const url of req.images ?? []) {
    // The server only accepts inline images (`data:` URLs); remote URLs are a
    // BadRequest, so the caller must inline them first.
    if (!/^data:|^https?:\/\//i.test(url)) continue;
    parts.push({ type: 'file', mime: mimeForUrl(url), url });
  }

  const body = {
    model: { providerID: req.providerID, modelID: req.modelID },
    system:
      req.system ??
      'You are an image QA assistant for a wholesale gift catalogue. ' +
        'Answer only through the structured schema. Never invent a SKU, image or URL.',
    parts,
    format: {
      type: 'json_schema',
      schema: req.schema,
      retryCount: req.retryCount ?? 1,
    },
  };

  try {
    const res = await bridgeFetch(
      cfg,
      `/session/${encodeURIComponent(req.sessionId)}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const raw = `HTTP ${res.status} ${text}`.trim();
      return {
        ok: false,
        quota: isQuotaExhausted(raw),
        error: friendlyBridgeError(raw),
        ms: Date.now() - started,
      };
    }
    const data = (await res.json()) as {
      info?: {
        error?: { name?: string; data?: { message?: string } };
        structured?: unknown;
        cost?: number;
        providerID?: string;
        modelID?: string;
      };
      parts?: Array<{ type?: string; text?: string }>;
    };
    const info = data.info ?? {};
    if (info.error) {
      const raw =
        info.error.data?.message ?? info.error.name ?? 'model returned an error';
      return {
        ok: false,
        quota: isQuotaExhausted(raw),
        error: friendlyBridgeError(raw),
        ms: Date.now() - started,
      };
    }
    const text = (data.parts ?? [])
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('\n')
      .trim();
    if (isQuotaExhausted(text)) {
      return {
        ok: false,
        quota: true,
        text,
        error: friendlyBridgeError(text),
        ms: Date.now() - started,
      };
    }
    if (info.structured == null) {
      return {
        ok: false,
        text: text || undefined,
        error: 'The model did not return structured output.',
        ms: Date.now() - started,
      };
    }
    return {
      ok: true,
      structured: info.structured,
      text: text || undefined,
      cost: info.cost,
      providerID: info.providerID,
      modelID: info.modelID,
      ms: Date.now() - started,
    };
  } catch (err) {
    const raw = errorMessage(err);
    return {
      ok: false,
      quota: isQuotaExhausted(raw),
      error: friendlyBridgeError(raw),
      ms: Date.now() - started,
    };
  }
}

function mimeForUrl(url: string): string {
  if (/^data:/i.test(url)) {
    const m = /^data:([^;,]+)/i.exec(url);
    return m?.[1] ?? 'image/jpeg';
  }
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}
