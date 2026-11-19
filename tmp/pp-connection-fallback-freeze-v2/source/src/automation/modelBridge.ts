// Model bridge — the extension's path to a vision model.
//
// Two backends share one contract (health → catalog → one structured verdict):
//
//   opencode  the local `opencode serve` HTTP API. The extension stores no
//             provider key: opencode owns provider auth, so the free models the
//             operator already signed in to are available. Optional
//             OPENCODE_SERVER_PASSWORD basic auth is configured here.
//   openai    any OpenAI-compatible `/chat/completions` endpoint, keyed or local:
//             Freebuff, OpenRouter, Groq, Gemini (OpenAI-compatible), Mistral,
//             OpenAI, Ollama, LM Studio, llama.cpp, or a custom URL. The key is
//             kept in `chrome.storage.local` beside the Notion token and is
//             never logged.
//
// Sessions only exist for opencode (it needs one before a message); for the
// OpenAI-compatible kind they are a no-op so the callers stay identical.

export const MODEL_BRIDGE_KEY = 'modelBridge';

export const DEFAULT_BRIDGE_BASE_URL = 'http://127.0.0.1:4096';
export const DEFAULT_BRIDGE_USERNAME = 'opencode';

// glm-5.3-flash-free was verified live: it accepts image parts and returns
// schema-validated JSON at zero cost. Thinking-mode models (e.g.
// deepseek-v4.1-flash-free) reject the structured-output tool choice.
export const DEFAULT_BRIDGE_PROVIDER = 'opencode';
export const DEFAULT_BRIDGE_MODEL = 'glm-5.3-flash-free';

export type BridgeKind = 'opencode' | 'openai';

export interface ModelBridgeConfig {
  /** Which adapter answers: the local opencode server or an OpenAI-compatible API. */
  kind: BridgeKind;
  /** Preset that produced the URL (used for defaults and the model list label). */
  preset: string;
  baseUrl: string;
  /** opencode only: HTTP basic auth for the local server. */
  username: string;
  password: string;
  /** OpenAI-compatible only: bearer key. Empty for keyless local servers. */
  apiKey: string;
  /** opencode provider id; the preset id for OpenAI-compatible backends. */
  providerID: string;
  modelID: string;
  enabled: boolean;
}

/** Where a preset lives: this machine, a hosted endpoint, or a local gateway. */
export type BridgeGroup = 'local' | 'gateway' | 'hosted' | 'custom';

export const BRIDGE_GROUPS: Array<{ id: BridgeGroup; label: string }> = [
  { id: 'local', label: 'Runs on this machine' },
  { id: 'gateway', label: 'Local gateway (borrowed sign-in)' },
  { id: 'hosted', label: 'Hosted (free tier or account credits)' },
  { id: 'custom', label: 'Other' },
];

export interface BridgePreset {
  id: string;
  label: string;
  kind: BridgeKind;
  group: BridgeGroup;
  baseUrl: string;
  /** True when this backend needs a bearer key. */
  apiKey: boolean;
  /** True for servers that run on this machine without a key. */
  local?: boolean;
  /** Pre-filled when the endpoint is known to carry a vision model. */
  defaultModel?: string;
  note: string;
}

/**
 * Backends the operator can switch between. "OpenAI-compatible" covers almost
 * every free option in practice. Cline, Antigravity and VS Code keep their
 * models behind their own sign-in (no paste-able key), so they are not presets:
 * either point them at the same local server this bridge uses, or run a local
 * gateway that exports their sign-in as an OpenAI-compatible URL - see
 * BRIDGE_CLIENTS below and the `gateway` preset.
 */
export const BRIDGE_PRESETS: BridgePreset[] = [
  {
    id: 'opencode',
    label: 'opencode (local server)',
    kind: 'opencode',
    group: 'local',
    baseUrl: DEFAULT_BRIDGE_BASE_URL,
    apiKey: false,
    local: true,
    defaultModel: DEFAULT_BRIDGE_MODEL,
    note: 'Reuses the providers you already signed in to (free models included).',
  },
  {
    id: 'freebuff',
    label: 'Freebuff API',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://freebuff.com/api/v1/paid',
    apiKey: true,
    note: 'Owner key: Freebuff → Account → Developer API (OPENAI_API_KEY).',
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai',
    group: 'local',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: false,
    local: true,
    note: 'Start Ollama, then pull a vision model (e.g. qwen2.5vl or llava).',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    kind: 'openai',
    group: 'local',
    baseUrl: 'http://127.0.0.1:1234/v1',
    apiKey: false,
    local: true,
    note: 'In LM Studio: Developer → Start server, then load a vision model.',
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp server (local)',
    kind: 'openai',
    group: 'local',
    baseUrl: 'http://127.0.0.1:8080/v1',
    apiKey: false,
    local: true,
    note: 'Run llama-server with an mmproj file so images are accepted.',
  },
  {
    id: 'gateway',
    label: 'Local gateway (CLIProxyAPI / copilot-api / LiteLLM)',
    kind: 'openai',
    group: 'gateway',
    baseUrl: '',
    apiKey: false,
    local: true,
    note:
      'Exports a client sign-in (Cline, Antigravity, Gemini CLI, Copilot) as an ' +
      'OpenAI-compatible URL. Paste its base URL above - CLIProxyAPI 8317, ' +
      'copilot-api 4141, LiteLLM 4000 - and press Save. These gateways are ' +
      'unofficial: they borrow the client OAuth session and may break or ' +
      'trip provider abuse limits.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: true,
    note: 'Free models end in ":free"; the model list marks them.',
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: true,
    note: 'Free tier; pick a vision model (e.g. a Llama 4 or Qwen VL model).',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (OpenAI-compatible)',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: true,
    note:
      'Free tier key from Google AI Studio; Gemini models accept images. This is ' +
      'the same model family Antigravity runs.',
  },
  {
    id: 'zhipu',
    label: 'Z.AI / GLM (free flash models)',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiKey: true,
    note:
      'Key from z.ai. The *-flash models are free and GLM-4.6V-Flash reads ' +
      'images; paid GLM models cost credits.',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM (free dev serverless)',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: true,
    note:
      'Key from build.nvidia.com. Free for development within account limits; ' +
      'pick a vision-language model for image scoring.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: true,
    note: 'Studio free mode needs no card; Pixtral models accept images.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    group: 'hosted',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: true,
    note: 'Paid platform key; vision models support strict JSON schema output.',
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible URL',
    kind: 'openai',
    group: 'custom',
    baseUrl: '',
    apiKey: true,
    note: 'Any /chat/completions endpoint. Grant the host when you press Save.',
  },
];

/**
 * Editor agents people ask about by name. None of them hands out a paste-able
 * bearer key, so the card lists what actually works instead of pretending to be
 * a provider.
 */
export interface BridgeClient {
  id: string;
  label: string;
  /** True when a local gateway can export this client's sign-in. */
  gateway: boolean;
  how: string;
}

export const BRIDGE_CLIENTS: BridgeClient[] = [
  {
    id: 'cline',
    label: 'Cline (VS Code extension)',
    gateway: true,
    how:
      'No hosted API of its own. Either set Cline\'s OpenAI-compatible provider to ' +
      'this machine\'s Ollama / LM Studio URL, or run CLIProxyAPI and point both ' +
      'tools at that gateway.',
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    gateway: true,
    how:
      'Signs in with Google and runs Gemini. Paste a Gemini API key (free tier) ' +
      'into the gemini preset, or export the Antigravity session with CLIProxyAPI ' +
      'and use the gateway preset.',
  },
  {
    id: 'vscode',
    label: 'VS Code / GitHub Copilot',
    gateway: true,
    how:
      'The Copilot subscription is not a paste-able key and GitHub Models was ' +
      'retired (30 Jul 2026). Use a gemini / groq / openrouter free key, or an ' +
      'unofficial local proxy such as copilot-api.',
  },
  {
    id: 'editors',
    label: 'Continue / Zed / Cursor',
    gateway: false,
    how:
      'Each holds its own sign-in, but all three accept a custom OpenAI base URL ' +
      'and key - so they can share whichever endpoint this card is configured ' +
      'with.',
  },
  {
    id: 'kirocrew',
    label: 'Kiro Crew (dashboard agent)',
    gateway: false,
    how:
      'Kiro Crew is a dashboard agent manager, not an API provider: it routes ' +
      'to hosted models (Auto, Claude, DeepSeek, Qwen, MiniMax, GLM) through its ' +
      'own credit system and hands out no paste-able key. To use the same model ' +
      'as this bridge, configure the matching hosted preset above (e.g. Z.AI ' +
      'for GLM, OpenRouter for DeepSeek/Qwen) or run a local server that Kiro ' +
      'Crew can also reach.',
  },
];

export function presetById(id: string): BridgePreset | undefined {
  return BRIDGE_PRESETS.find((preset) => preset.id === id);
}

/** Presets bucketed for the picker, in BRIDGE_GROUPS order. */
export function presetsByGroup(): Array<{
  id: BridgeGroup;
  label: string;
  presets: BridgePreset[];
}> {
  return BRIDGE_GROUPS.map((group) => ({
    ...group,
    presets: BRIDGE_PRESETS.filter((preset) => preset.group === group.id),
  })).filter((group) => group.presets.length > 0);
}

/** Best-effort preset for a stored URL (old configs and hand-edited URLs). */
export function presetForBaseUrl(baseUrl: string): BridgePreset | undefined {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase();
  if (!normalized) return undefined;
  return BRIDGE_PRESETS.find(
    (preset) => preset.baseUrl && preset.baseUrl.toLowerCase() === normalized,
  );
}

export const DEFAULT_BRIDGE_CONFIG: ModelBridgeConfig = {
  kind: 'opencode',
  preset: 'opencode',
  baseUrl: DEFAULT_BRIDGE_BASE_URL,
  username: DEFAULT_BRIDGE_USERNAME,
  password: '',
  apiKey: '',
  providerID: DEFAULT_BRIDGE_PROVIDER,
  modelID: DEFAULT_BRIDGE_MODEL,
  enabled: true,
};

export interface BridgeHealth {
  ok: boolean;
  version?: string;
  /** Extra context for the UI (model count, endpoint kind). */
  detail?: string;
  error?: string;
}

export interface BridgeModel {
  providerID: string;
  providerName: string;
  modelID: string;
  name: string;
  /** undefined = the endpoint did not say (local servers usually stay silent). */
  vision?: boolean;
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

function normalizeBaseUrl(url: string, fallback: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  return trimmed || fallback;
}

/**
 * Old configs (opencode only) have no `kind`/`apiKey`/`preset`: default them to
 * the local opencode server so an upgrade never breaks a working setup.
 */
function normalizeBridgeConfig(raw: Partial<ModelBridgeConfig> | undefined): ModelBridgeConfig {
  if (!raw) return { ...DEFAULT_BRIDGE_CONFIG };
  const kind: BridgeKind = raw.kind === 'openai' ? 'openai' : 'opencode';
  const preset =
    (raw.preset && presetById(raw.preset)?.id) ||
    (kind === 'opencode' ? 'opencode' : presetForBaseUrl(String(raw.baseUrl ?? ''))?.id) ||
    'custom';
  const presetDef = presetById(preset);
  return {
    kind,
    preset,
    baseUrl: normalizeBaseUrl(
      String(raw.baseUrl ?? ''),
      kind === 'openai' ? (presetDef?.baseUrl ?? '') : DEFAULT_BRIDGE_BASE_URL,
    ),
    username: String(raw.username ?? DEFAULT_BRIDGE_USERNAME),
    password: String(raw.password ?? ''),
    apiKey: String(raw.apiKey ?? ''),
    providerID: String(
      raw.providerID ??
        (kind === 'openai' ? presetDef?.id ?? 'openai' : DEFAULT_BRIDGE_PROVIDER),
    ),
    modelID: String(
      raw.modelID ??
        (kind === 'openai' ? presetDef?.defaultModel ?? '' : DEFAULT_BRIDGE_MODEL),
    ),
    enabled: raw.enabled !== false,
  };
}

export async function loadBridgeConfig(): Promise<ModelBridgeConfig> {
  try {
    const stored = await chrome.storage.local.get([MODEL_BRIDGE_KEY]);
    const raw = stored[MODEL_BRIDGE_KEY] as Partial<ModelBridgeConfig> | undefined;
    return normalizeBridgeConfig(raw);
  } catch {
    return { ...DEFAULT_BRIDGE_CONFIG };
  }
}

export async function saveBridgeConfig(
  config: ModelBridgeConfig,
): Promise<ModelBridgeConfig> {
  const kind: BridgeKind = config.kind === 'openai' ? 'openai' : 'opencode';
  const presetDef = presetById(config.preset);
  const preset = presetDef?.id ?? (kind === 'opencode' ? 'opencode' : 'custom');
  const next: ModelBridgeConfig = {
    kind,
    preset,
    baseUrl: normalizeBaseUrl(
      config.baseUrl,
      kind === 'openai' ? (presetDef?.baseUrl ?? '') : DEFAULT_BRIDGE_BASE_URL,
    ),
    username: config.username.trim() || DEFAULT_BRIDGE_USERNAME,
    password: config.password,
    apiKey: config.apiKey.trim(),
    providerID:
      kind === 'openai'
        ? preset
        : config.providerID.trim() || DEFAULT_BRIDGE_PROVIDER,
    modelID:
      config.modelID.trim() ||
      (kind === 'openai' ? (presetDef?.defaultModel ?? '') : DEFAULT_BRIDGE_MODEL),
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
  if (config.kind === 'openai') {
    return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
  }
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

function friendlyBridgeError(raw: string, kind: BridgeKind = 'opencode'): string {
  if (isQuotaExhausted(raw)) return latchQuota(raw);
  if (/thinking mode does not support/i.test(raw)) {
    return (
      'This model runs in thinking mode and cannot return structured output. ' +
      'Pick a non-thinking model (for example glm-5.3-flash-free).'
    );
  }
  if (/401|403|unauthor|invalid api key|incorrect api key/i.test(raw)) {
    return kind === 'openai'
      ? 'The provider rejected the API key (HTTP 401/403). Check the key in Model bridge settings.'
      : 'The bridge rejected the credentials. Check the server password in Model bridge settings.';
  }
  if (/429|rate limit/i.test(raw)) {
    return (
      'The provider is rate-limiting this key (HTTP 429). Wait a moment, or ' +
      'pick another free model.'
    );
  }
  if (/model.{0,24}(not found|does not exist|unknown)/i.test(raw)) {
    return (
      'That model id is not offered by this endpoint. Reload the model list ' +
      'and pick one of the ids it returns.'
    );
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
  if (cfg.kind === 'openai') return openAiHealth(cfg);
  try {
    const res = await bridgeFetch(cfg, '/global/health', {}, 8000);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        error: friendlyBridgeError(`HTTP ${res.status} ${body}`.trim(), 'opencode'),
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

/**
 * An OpenAI-compatible endpoint has no health route; `/models` proves both the
 * URL and the key (and returns 401 for a bad key, which is the useful signal).
 */
async function openAiHealth(cfg: ModelBridgeConfig): Promise<BridgeHealth> {
  if (!cfg.baseUrl) {
    return {
      ok: false,
      error:
        'No base URL set - pick a backend above or paste an OpenAI-compatible URL.',
    };
  }
  try {
    const res = await bridgeFetch(cfg, '/models', {}, 8000);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        error: friendlyBridgeError(`HTTP ${res.status} ${body}`.trim(), 'openai'),
      };
    }
    const data = (await res.json()) as { data?: unknown[] };
    const count = Array.isArray(data.data) ? data.data.length : 0;
    return {
      ok: true,
      detail: `${count} model(s) listed`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        `Cannot reach ${cfg.baseUrl}. Check the URL, the API key and that the ` +
        `server is running. ${errorMessage(err)}`,
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
  if (cfg.kind === 'openai') return listOpenAiModels(cfg);
  try {
    const res = await bridgeFetch(cfg, '/provider', {}, 15000);
    if (!res.ok) {
      return {
        ok: false,
        connected: [],
        models: [],
        error: friendlyBridgeError(`HTTP ${res.status}`, 'opencode'),
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
      error: friendlyBridgeError(errorMessage(err), 'opencode'),
    };
  }
}

interface OpenAiModelRaw {
  id?: string;
  name?: string;
  owned_by?: string;
  context_length?: number;
  top_provider?: { context_length?: number };
  architecture?: { input_modalities?: string[]; modality?: string };
  pricing?: { prompt?: string; completion?: string };
}

function isLocalBase(baseUrl: string): boolean {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i.test(
    baseUrl,
  );
}

/** Name heuristic for endpoints that do not publish modality metadata. */
function looksLikeVisionModel(modelID: string): boolean {
  return /vision|llava|pixtral|gemini|gpt-4o|gpt-4\.1|gpt-5|claude|qwen[\w.-]*vl|llama[\w.-]*(?:4|vision)|internvl|minicpm-v/i.test(
    modelID,
  );
}

function mapOpenAiModel(
  raw: OpenAiModelRaw,
  providerID: string,
  baseUrl: string,
): BridgeModel {
  const modelID = String(raw.id ?? raw.name ?? '');
  const modalities = Array.isArray(raw.architecture?.input_modalities)
    ? raw.architecture.input_modalities
    : (raw.architecture?.modality ?? '').split('+').filter(Boolean);
  const typedVision =
    modalities.length > 0
      ? modalities.some((modality) => /image/i.test(modality))
      : undefined;
  const pricing = raw.pricing;
  const zeroPrice =
    pricing !== undefined &&
    Number(pricing.prompt ?? 0) === 0 &&
    Number(pricing.completion ?? 0) === 0;
  return {
    providerID,
    providerName: providerID,
    modelID,
    name: String(raw.name ?? modelID),
    vision: typedVision ?? (looksLikeVisionModel(modelID) ? true : undefined),
    context: raw.context_length ?? raw.top_provider?.context_length,
    free: /:free$/i.test(modelID) || isLocalBase(baseUrl) || zeroPrice,
  };
}

/** `/models` on an OpenAI-compatible endpoint; the key, URL and catalog at once. */
async function listOpenAiModels(cfg: ModelBridgeConfig): Promise<BridgeCatalog> {
  const providerID = cfg.preset || cfg.providerID || 'openai';
  if (!cfg.baseUrl) {
    return {
      ok: false,
      connected: [],
      models: [],
      error: 'No base URL set - pick a backend or paste an OpenAI-compatible URL.',
    };
  }
  try {
    const res = await bridgeFetch(cfg, '/models', {}, 15000);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        connected: [],
        models: [],
        error: friendlyBridgeError(`HTTP ${res.status} ${body}`.trim(), 'openai'),
      };
    }
    const data = (await res.json()) as { data?: OpenAiModelRaw[] };
    const models = (Array.isArray(data.data) ? data.data : [])
      .map((model) => mapOpenAiModel(model, providerID, cfg.baseUrl))
      .filter((model) => model.modelID);
    return { ok: true, connected: [providerID], models };
  } catch (err) {
    return {
      ok: false,
      connected: [],
      models: [],
      error: friendlyBridgeError(errorMessage(err), 'openai'),
    };
  }
}

export async function createBridgeSession(
  title: string,
  config?: ModelBridgeConfig,
): Promise<string> {
  const cfg = config ?? (await loadBridgeConfig());
  // Stateless backends: the "session" is just a stable label.
  if (cfg.kind === 'openai') return `api:${cfg.preset || 'openai'}`;
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
  if (cfg.kind === 'openai') return;
  try {
    await bridgeFetch(cfg, `/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }, 8000);
  } catch {
    // A stale session is harmless; the server expires it.
  }
}

const DEFAULT_SYSTEM_PROMPT =
  'You are an image QA assistant for a wholesale gift catalogue. ' +
  'Answer only through the structured schema. Never invent a SKU, image or URL.';

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
  if (cfg.kind === 'openai') return scoreViaOpenAi(req, cfg);
  return scoreViaOpencode(req, cfg);
}

/** Local opencode server: throw-away session, `format: json_schema` message. */
async function scoreViaOpencode(
  req: BridgeScoreRequest,
  cfg: ModelBridgeConfig,
): Promise<BridgeScoreResult> {
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
    system: req.system ?? DEFAULT_SYSTEM_PROMPT,
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

/* ------------------------------------------------------------------------- */
/* OpenAI-compatible backend                                                  */
/* ------------------------------------------------------------------------- */

type OpenAiFormatMode = 'json_schema' | 'json_object' | 'plain';

interface OpenAiChatBody {
  model?: string;
  choices?: Array<{ message?: { content?: unknown } }>;
  error?: { message?: string };
}

function readOpenAiContent(data: unknown): string {
  const body = data as OpenAiChatBody;
  const content = body.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

/** JSON.parse tolerant of code fences and surrounding prose. */
function parseJsonLoose(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  const candidates = fenced ? [fenced, trimmed] : [trimmed];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* try the braces slice below */
    }
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        /* not JSON */
      }
    }
  }
  return null;
}

function openAiRequestBody(
  req: BridgeScoreRequest,
  model: string,
  system: string,
  mode: OpenAiFormatMode,
): Record<string, unknown> {
  const images = (req.images ?? []).filter((url) => /^data:|^https?:\/\//i.test(url));
  const text =
    mode === 'json_schema'
      ? req.text
      : `${req.text}\n\nReturn only a single JSON object that validates this JSON Schema:\n` +
        JSON.stringify(req.schema);
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
  };
  if (mode === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'bog_verdict', strict: true, schema: req.schema },
    };
  } else if (mode === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  return body;
}

/**
 * Any OpenAI-compatible `/chat/completions`: images as `image_url` parts, JSON
 * output negotiated down from strict `json_schema` to `json_object` to a plain
 * prompt, so local servers that lack structured output still work.
 */
async function scoreViaOpenAi(
  req: BridgeScoreRequest,
  cfg: ModelBridgeConfig,
): Promise<BridgeScoreResult> {
  const started = Date.now();
  if (quotaLatch) {
    return { ok: false, quota: true, error: quotaLatch, ms: 0 };
  }
  if (!cfg.baseUrl) {
    return {
      ok: false,
      error: 'The model bridge has no base URL - open Settings → Model bridge.',
      ms: 0,
    };
  }
  // The caller's model wins (the batch passes the picked one); fall back to the
  // saved model so a direct call still works.
  const model = (req.modelID.trim() || cfg.modelID.trim()).trim();
  if (!model) {
    return {
      ok: false,
      error: 'No model selected - open Settings → Model bridge and pick one.',
      ms: 0,
    };
  }

  const system = req.system ?? DEFAULT_SYSTEM_PROMPT;
  const modes: OpenAiFormatMode[] = ['json_schema', 'json_object', 'plain'];
  let lastError = '';
  let lastText = '';

  for (const mode of modes) {
    try {
      const res = await bridgeFetch(
        cfg,
        '/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(openAiRequestBody(req, model, system, mode)),
        },
        req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      const rawBody = await res.text().catch(() => '');
      if (!res.ok) {
        const raw = `HTTP ${res.status} ${rawBody}`.trim();
        lastError = friendlyBridgeError(raw, 'openai');
        // A rejected response_format is worth the next, simpler mode; auth,
        // quota and rate limits are not.
        const retryableFormat =
          /response_format|json_schema|json schema|unsupported|not supported|invalid_request/i.test(
            raw,
          ) && !/401|403|429|unauthor|api key/i.test(raw);
        if (retryableFormat && mode !== 'plain') continue;
        return {
          ok: false,
          quota: isQuotaExhausted(raw),
          error: lastError,
          ms: Date.now() - started,
        };
      }

      let data: unknown;
      try {
        data = JSON.parse(rawBody);
      } catch {
        lastText = rawBody;
        lastError = 'The endpoint answered with something that is not JSON.';
        continue;
      }

      const apiError = (data as OpenAiChatBody).error;
      if (apiError) {
        const raw = apiError.message ?? 'the endpoint returned an error';
        lastError = friendlyBridgeError(raw, 'openai');
        if (
          /response_format|json_schema|unsupported|not supported/i.test(raw) &&
          mode !== 'plain'
        ) {
          continue;
        }
        return {
          ok: false,
          quota: isQuotaExhausted(raw),
          error: lastError,
          ms: Date.now() - started,
        };
      }

      const content = readOpenAiContent(data);
      lastText = content;
      if (isQuotaExhausted(content)) {
        return {
          ok: false,
          quota: true,
          text: content,
          error: friendlyBridgeError(content, 'openai'),
          ms: Date.now() - started,
        };
      }
      const structured = parseJsonLoose(content);
      if (structured == null) {
        lastError = 'The model did not return JSON.';
        if (mode !== 'plain') continue;
        return {
          ok: false,
          text: content || undefined,
          error: 'The model did not return JSON for the requested schema.',
          ms: Date.now() - started,
        };
      }
      return {
        ok: true,
        structured,
        text: content || undefined,
        providerID: cfg.preset || cfg.providerID || 'openai',
        modelID: String((data as OpenAiChatBody).model ?? model),
        ms: Date.now() - started,
      };
    } catch (err) {
      const raw = errorMessage(err);
      lastError = friendlyBridgeError(raw, 'openai');
      if (/aborted|timed out|timeout/i.test(raw)) break;
    }
  }

  return {
    ok: false,
    text: lastText || undefined,
    error: lastError || 'The model did not return structured output.',
    ms: Date.now() - started,
  };
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
