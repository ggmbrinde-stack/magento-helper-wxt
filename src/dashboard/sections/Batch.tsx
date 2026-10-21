import { h, Fragment } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { parseSkuInput, type BatchJob } from '../../lib/batch';
import type { BatchAnomalyMap, ModelVerdictMap } from '../../lib/batch';
import {
  DEFAULT_BRIDGE_CONFIG,
  type ModelBridgeConfig,
} from '../../lib/modelBridge';
import {
  evidenceRoot,
  folderPickingSupported,
  loadEvidenceFolder,
  pickEvidenceFolder,
  requestWritePermission,
} from '../../lib/evidenceFolder';
import {
  saveBatchEvidence,
  type EvidenceSaveProgress,
  type EvidenceSaveResult,
} from '../../lib/evidenceExport';
import {
  diagnoseEvidenceFolder,
  dryRunEvidence,
  type EvidenceDryRun,
  type EvidenceFolderDiagnosis,
} from '../../lib/evidenceDiagnose';
import {
  dedupeConfigure,
  moveModelShots,
  reorderMirror,
  type TidyProgress,
  type TidyResult,
} from '../../lib/mirrorTidy';
import { checkCoverage, coverageMarkdown } from '../../lib/coverageCheck';
import {
  batchReportMarkdown,
  buildStatuses,
  statusMarkdown,
} from '../../lib/statusReport';
import { retireStale, verifyManifests } from '../../lib/mirrorManifest';
import {
  availabilityMarkdown,
  runAvailabilitySweep,
} from '../../lib/supplierAvailability';
import type {
  BatchControlResponse,
  BatchPushResponse,
  BatchStartResponse,
  BatchStateResponse,
  ModelBridgeStatusResponse,
} from '../../lib/messages';

const ALL_LANGS = ['EN', 'ES', 'FR'];

const STAGE_LABEL: Record<string, string> = {
  pending: 'pending',
  resolve: 'resolve',
  variants: 'variants',
  images: 'images',
  text: 'text',
  payload: 'payload',
  done: 'done',
  failed: 'failed',
};

const STATUS_CLASS: Record<string, string> = {
  ok: 'db-ok',
  failed: 'db-bad',
  running: 'db-warn',
  pending: '',
  done: 'db-ok',
  cancelled: '',
  paused: 'db-warn',
  idle: '',
};

export function Batch() {
  const [input, setInput] = useState('');
  const [langs, setLangs] = useState<string[]>([...ALL_LANGS]);
  const [hashImages, setHashImages] = useState(false);
  const [background, setBackground] = useState(true);
  const [timeoutSec, setTimeoutSec] = useState(180);
  const [maxImages, setMaxImages] = useState(2000);
  const [modelScoring, setModelScoring] = useState(false);
  const [bridge, setBridge] = useState<ModelBridgeConfig>({ ...DEFAULT_BRIDGE_CONFIG });
  const [bridgeHealth, setBridgeHealth] = useState<{
    ok: boolean;
    version?: string;
    error?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<BatchJob | null>(null);
  const [payloadCount, setPayloadCount] = useState(0);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [anomalies, setAnomalies] = useState<BatchAnomalyMap>({});
  const [verdicts, setVerdicts] = useState<ModelVerdictMap>({});
  const [confirmPush, setConfirmPush] = useState(false);
  const [pushErrors, setPushErrors] = useState(true);
  const [updateLibrary, setUpdateLibrary] = useState(true);
  const [pushResult, setPushResult] = useState<BatchPushResponse | null>(null);
  const [evidenceFolder, setEvidenceFolder] = useState('');
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [evidenceProgress, setEvidenceProgress] =
    useState<EvidenceSaveProgress | null>(null);
  const [evidenceResult, setEvidenceResult] =
    useState<EvidenceSaveResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<EvidenceFolderDiagnosis | null>(null);
  const [dryRun, setDryRun] = useState<EvidenceDryRun | null>(null);
  const [testingEvidence, setTestingEvidence] = useState(false);
  const [tidySku, setTidySku] = useState('');
  const [tidyBusy, setTidyBusy] = useState(false);
  const [tidyProgress, setTidyProgress] = useState<TidyProgress | null>(null);
  const [tidyResult, setTidyResult] = useState<TidyResult | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateProgress, setGateProgress] = useState('');
  const [gateTitle, setGateTitle] = useState('');
  const [gateLines, setGateLines] = useState<string[]>([]);

  const parsed = useMemo(() => parseSkuInput(input), [input]);

  async function refresh() {
    try {
      const stored = await chrome.storage.local.get([
        'batchAnomalies',
        'batchModelVerdicts',
        'modelBridge',
      ]);
      setAnomalies((stored.batchAnomalies as BatchAnomalyMap | undefined) ?? {});
      setVerdicts((stored.batchModelVerdicts as ModelVerdictMap | undefined) ?? {});
      setBridge({
        ...DEFAULT_BRIDGE_CONFIG,
        ...((stored.modelBridge as Partial<ModelBridgeConfig> | undefined) ?? {}),
      });
      const res = (await browser.runtime.sendMessage({
        type: 'BATCH_STATE',
      })) as BatchStateResponse;
      if (res?.ok) {
        setJob(res.job ?? null);
        setPayloadCount(res.payloadCount ?? 0);
      } else if (res?.error) {
        setError(res.error);
      }
      const status = (await browser.runtime.sendMessage({
        type: 'MODEL_BRIDGE_STATUS',
      })) as ModelBridgeStatusResponse;
      setBridgeHealth({
        ok: Boolean(status?.health?.ok),
        version: status?.health?.version,
        error: status?.health?.error ?? status?.error,
      });
    } catch (err) {
      setError((err as Error).message ?? 'Failed to read batch state');
    }
  }

  useEffect(() => {
    void refresh();
    void loadEvidenceFolder().then((folder) =>
      setEvidenceFolder(folder?.name ?? ''),
    );
    const listener = (
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if ('modelBridge' in changes) void refresh();
      if (
        'batchJob' in changes ||
        'batchPayloads' in changes ||
        'batchAnomalies' in changes ||
        'batchModelVerdicts' in changes
      ) {
        const next = changes.batchJob?.newValue as BatchJob | undefined;
        if (next) setJob(next);
        else void refresh();
        if ('batchAnomalies' in changes) {
          setAnomalies(
            (changes.batchAnomalies?.newValue as BatchAnomalyMap | undefined) ??
              {},
          );
        }
        if ('batchModelVerdicts' in changes) {
          setVerdicts(
            (changes.batchModelVerdicts?.newValue as ModelVerdictMap | undefined) ??
              {},
          );
        }
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError('');
    setInvalid([]);
    setBusy(true);
    try {
      if (modelScoring) {
        const status = (await browser.runtime.sendMessage({
          type: 'MODEL_BRIDGE_STATUS',
        })) as ModelBridgeStatusResponse;
        if (!status?.health?.ok) {
          setError(
            status?.health?.error ??
              'Model bridge is offline. Open Model bridge settings, save the server password and re-check.',
          );
          return;
        }
      }
      const res = (await browser.runtime.sendMessage({
        type: 'BATCH_START',
        input,
        options: {
          langs,
          hashImages,
          background,
          timeoutMs: Math.max(30, timeoutSec) * 1000,
          maxImages: Math.max(100, maxImages),
          modelScoring,
          ...(modelScoring && bridge.modelID
            ? {
                model: {
                  providerID: bridge.providerID,
                  modelID: bridge.modelID,
                },
              }
            : {}),
        },
      })) as BatchStartResponse;
      if (res?.ok) {
        setJob(res.job ?? null);
        setInvalid(res.invalid ?? []);
      } else {
        setInvalid(res?.invalid ?? []);
        setError(res?.error ?? 'Batch start failed');
      }
    } catch (err) {
      setError((err as Error).message ?? 'Batch start failed');
    } finally {
      setBusy(false);
    }
  }

  async function control(
    type: 'BATCH_PAUSE' | 'BATCH_RESUME' | 'BATCH_CANCEL' | 'BATCH_CLEAR',
  ) {
    setBusy(true);
    setError('');
    try {
      const res = (await browser.runtime.sendMessage({
        type,
      })) as BatchControlResponse;
      if (res?.ok) {
        setJob(res.job ?? null);
        if (type === 'BATCH_CLEAR') {
          setPayloadCount(0);
          setAnomalies({});
          setVerdicts({});
          setPushResult(null);
          setConfirmPush(false);
        }
      } else setError(res?.error ?? 'Batch control failed');
    } catch (err) {
      setError((err as Error).message ?? 'Batch control failed');
    } finally {
      setBusy(false);
    }
  }

  async function push(confirm: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'BATCH_PUSH',
        confirm,
        listingErrors: pushErrors,
        library: updateLibrary,
      })) as BatchPushResponse;
      setPushResult(res);
      if (!res?.ok && res?.error) setError(res.error);
    } catch (err) {
      setError((err as Error).message ?? 'Batch push failed');
    } finally {
      setBusy(false);
    }
  }

  async function chooseEvidenceFolder() {
    setError('');
    try {
      const folder = await pickEvidenceFolder();
      setEvidenceFolder(folder.name);
      setEvidenceResult(null);
    } catch (err) {
      if ((err as Error).message !== 'Folder selection cancelled.') {
        setError((err as Error).message ?? 'Could not select the folder');
      }
    }
  }

  async function grantEvidenceAccess() {
    setTestingEvidence(true);
    setError('');
    try {
      const state = await requestWritePermission();
      if (state === 'no-folder') {
        setError('Choose a folder first.');
      } else if (state === 'denied') {
        setError('Chrome denied access - pick the folder again with "Change folder".');
      } else if (state !== 'granted') {
        setError('Could not request write access - try "Change folder".');
      }
      setDiagnosis(await diagnoseEvidenceFolder());
    } catch (err) {
      setError((err as Error).message ?? 'Permission request failed');
    } finally {
      setTestingEvidence(false);
    }
  }

  async function testEvidenceFolder() {
    setTestingEvidence(true);
    setError('');
    setDiagnosis(null);
    try {
      setDiagnosis(await diagnoseEvidenceFolder());
    } catch (err) {
      setError((err as Error).message ?? 'Folder test failed');
    } finally {
      setTestingEvidence(false);
    }
  }

  async function testEvidenceDownload() {
    setTestingEvidence(true);
    setError('');
    setDryRun(null);
    try {
      setDryRun(await dryRunEvidence({ sample: 3 }));
    } catch (err) {
      setError((err as Error).message ?? 'Download test failed');
    } finally {
      setTestingEvidence(false);
    }
  }

  function tidySkus(): string[] | undefined {
    const sku = tidySku.trim().toUpperCase();
    return sku ? [sku] : undefined;
  }

  async function runReorder(apply: boolean) {
    setTidyBusy(true);
    setError('');
    setTidyResult(null);
    try {
      setTidyResult(
        await reorderMirror({ apply, skus: tidySkus(), onProgress: setTidyProgress }),
      );
    } catch (err) {
      setError((err as Error).message ?? 'Reorder failed');
    } finally {
      setTidyBusy(false);
      setTidyProgress(null);
    }
  }

  async function runModelMove(apply: boolean) {
    const skus = tidySkus();
    const scope = skus ? skus[0] : 'every SKU in the batch';
    if (
      apply &&
      !window.confirm(`Score ${scope} with the vision model and move model shots to configure/?`)
    ) {
      return;
    }
    setTidyBusy(true);
    setError('');
    setTidyResult(null);
    try {
      setTidyResult(await moveModelShots({ apply, skus, onProgress: setTidyProgress }));
    } catch (err) {
      setError((err as Error).message ?? 'Model move failed');
    } finally {
      setTidyBusy(false);
      setTidyProgress(null);
    }
  }

  async function runDedupe() {
    setTidyBusy(true);
    setError('');
    setTidyResult(null);
    try {
      setTidyResult(await dedupeConfigure({ skus: tidySkus(), onProgress: setTidyProgress }));
    } catch (err) {
      setError((err as Error).message ?? 'Dedupe failed');
    } finally {
      setTidyBusy(false);
      setTidyProgress(null);
    }
  }

  function scopeLabel(): string {
    const sku = tidySku.trim().toUpperCase();
    return sku ? sku : 'every SKU in the batch';
  }

  async function runGate(label: string, body: () => Promise<string[]>): Promise<void> {
    setGateBusy(true);
    setError('');
    setGateTitle(label);
    setGateLines([]);
    setGateProgress('');
    try {
      setGateLines(await body());
    } catch (err) {
      setError((err as Error).message ?? `${label} failed`);
    } finally {
      setGateBusy(false);
      setGateProgress('');
    }
  }

  function runCoverage() {
    void runGate('Coverage check', async () => {
      const { results, withGaps } = await checkCoverage(tidySkus());
      const detail: string[] = [];
      for (const result of results) {
        if (result.gaps.length === 0) continue;
        detail.push(`${result.sku}:`);
        for (const gap of result.gaps) detail.push(`  - ${gap.check}: ${gap.detail}`);
      }
      return [
        `${results.length} SKU(s), ${withGaps} with gaps.`,
        '',
        coverageMarkdown(results),
        ...(detail.length > 0 ? ['', 'Gaps:', ...detail] : []),
      ];
    });
  }

  function runStatus() {
    void runGate('Status', async () => {
      const statuses = await buildStatuses(tidySkus());
      if (statuses.length === 0) return ['No SKUs in the batch yet.'];
      const complete = statuses.filter((status) => status.complete).length;
      return [
        `${statuses.length} SKU(s), ${complete} complete.`,
        '',
        statusMarkdown(statuses),
      ];
    });
  }

  function runBatchReport() {
    void runGate('Batch report', async () => [await batchReportMarkdown()]);
  }

  function runVerify() {
    void runGate('Manifest check', async () => {
      const state = await requestWritePermission();
      if (state !== 'granted') throw new Error('Folder access not granted.');
      const root = await evidenceRoot();
      if (!root) throw new Error('Choose the mirror folder first.');
      const results = await verifyManifests({
        root,
        skus: tidySkus(),
        onProgress: (sku, index, total) =>
          setGateProgress(`${sku} (${index}/${total}) - hashing`),
      });
      const drift = results.filter((result) => result.verdict !== 'ok');
      const lines = [
        `${results.length} SKU(s), ${drift.length} with drift.`,
        '',
        '| SKU | Verdict | Manifest | On disk | Missing | Extra | Mismatch |',
        '|---|---|---|---|---|---|---|',
        ...results.map(
          (result) =>
            `| ${result.sku} | ${result.verdict} | ${result.manifestFiles} | ` +
            `${result.onDisk} | ${result.missing.length} | ${result.extra.length} | ` +
            `${result.mismatch.length} |`,
        ),
      ];
      for (const result of drift) {
        lines.push('', `${result.sku} (${result.verdict})${result.note ? ` - ${result.note}` : ''}`);
        if (result.missing.length > 0) lines.push(`  missing: ${result.missing.join(', ')}`);
        if (result.extra.length > 0) lines.push(`  extra: ${result.extra.join(', ')}`);
        if (result.mismatch.length > 0) lines.push(`  mismatch: ${result.mismatch.join(', ')}`);
      }
      return lines;
    });
  }

  function runRetire() {
    if (!window.confirm(`Move files with no manifest record to _superseded/stale/ for ${scopeLabel()}?`)) {
      return;
    }
    void runGate('Retire stale', async () => {
      const state = await requestWritePermission();
      if (state !== 'granted') throw new Error('Folder access not granted.');
      const root = await evidenceRoot();
      if (!root) throw new Error('Choose the mirror folder first.');
      const result = await retireStale({
        root,
        skus: tidySkus(),
        onProgress: (sku, index, total) => setGateProgress(`${sku} (${index}/${total})`),
      });
      return [
        `${result.skus} SKU(s), ${result.retired} file(s) moved to _superseded/stale/.`,
        ...(result.errors.length > 0 ? ['', 'Errors:', ...result.errors] : []),
      ];
    });
  }

  function runAvailability() {
    void runGate('Supplier availability', async () => {
      const skus =
        tidySkus() ??
        (job?.items ?? []).filter((item) => item.status === 'ok').map((item) => item.sku);
      if (skus.length === 0) throw new Error('No SKUs to check.');
      const checks = await runAvailabilitySweep(skus, {
        onProgress: (sku, index, total) =>
          setGateProgress(`${sku} (${index}/${total}) - roly.es`),
      });
      const lines = [availabilityMarkdown(checks)];
      for (const check of checks) {
        if (check.anomalies.length === 0 && check.review.length === 0) continue;
        lines.push('', `${check.sku} (${check.verdict})`);
        for (const note of check.review) lines.push(`  review: ${note}`);
        for (const note of check.anomalies) lines.push(`  ! ${note}`);
      }
      return lines;
    });
  }

  async function saveEvidence() {
    setSavingEvidence(true);
    setError('');
    setEvidenceResult(null);
    setEvidenceProgress(null);
    try {
      const res = await saveBatchEvidence({ onProgress: setEvidenceProgress });
      setEvidenceResult(res);
      setEvidenceFolder(res.folder);
    } catch (err) {
      setError((err as Error).message ?? 'Saving evidence failed');
    } finally {
      setSavingEvidence(false);
      setEvidenceProgress(null);
    }
  }

  async function exportJson() {
    try {
      const stored = await chrome.storage.local.get([
        'batchPayloads',
        'batchModelVerdicts',
      ]);
      const payloads = stored.batchPayloads ?? {};
      const modelVerdicts = stored.batchModelVerdicts ?? {};
      const blob = new Blob(
        [JSON.stringify({ job, payloads, modelVerdicts }, null, 2)],
        {
          type: 'application/json',
        },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bog-batch-${job?.id || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message ?? 'Export failed');
    }
  }

  async function copyJson() {
    try {
      const stored = await chrome.storage.local.get([
        'batchPayloads',
        'batchModelVerdicts',
      ]);
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            job,
            payloads: stored.batchPayloads ?? {},
            modelVerdicts: stored.batchModelVerdicts ?? {},
          },
          null,
          2,
        ),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setError((err as Error).message ?? 'Copy failed');
    }
  }

  const done = job ? job.items.filter((i) => i.status !== 'pending').length : 0;
  const total = job?.items.length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const running = job?.status === 'running';
  const paused = job?.status === 'paused';
  const current = job?.items.find((i) => i.status === 'running');
  const doneMs = job?.items.filter((i) => i.ms).map((i) => i.ms as number) ?? [];
  const avgMs = doneMs.length > 0 ? doneMs.reduce((a, b) => a + b, 0) / doneMs.length : 0;
  const remaining = total - done;
  const etaMs = running && avgMs > 0 && remaining > 0 ? Math.round(avgMs * remaining) : 0;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const startedAt = job?.createdAt ?? 0;
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const fmtMs = (ms: number): string => {
    if (!ms || ms < 1000) return '0s';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r > 0 ? `${m}m ${r}s` : `${m}m`;
  };
  const [expandAll, setExpandAll] = useState(false);

  function verdictCell(sku: string, flagCount: number) {
    const verdict = verdicts[sku];
    if (!verdict) {
      return flagCount > 0 ? flagCount : 'â€”';
    }
    const cost =
      typeof verdict.cost === 'number' ? verdict.cost.toFixed(4) : 'â€”';
    return (
      <details>
        <summary>{verdict.flags.length}</summary>
        <p class="db-note">
          {verdict.images.length} image(s) Â· {verdict.providerID}/{verdict.modelID} Â·{' '}
          {verdict.ms} ms Â· cost {cost}
        </p>
        {verdict.flags.length > 0 ? (
          <ul class="db-flags db-flags--warn">
            {verdict.flags.map((f, fi) => (
              <li key={`${fi}-${f}`}>{f}</li>
            ))}
          </ul>
        ) : null}
        <ul class="db-flags">
          {verdict.images.map((im, ii) => (
            <li key={`${ii}-${im.url}`}>
              IMG{ii + 1} â€” {im.view} Â· {im.background}
              {im.concerns.length > 0 ? ` Â· ${im.concerns.join('; ')}` : ''}
            </li>
          ))}
        </ul>
      </details>
    );
  }

  return (
    <Fragment>
      <section class="db-card">
        <div class="db-card-head">
          <h2>Run a batch</h2>
          {job ? (
            <span class={`db-badge ${STATUS_CLASS[job.status] ?? ''}`}>
              {job.status}
            </span>
          ) : (
            <span class="db-badge">idle</span>
          )}
        </div>
        <p class="db-note">
          Paste SKUs (one per line, or comma/space separated). Each SKU runs the
          full browser pipeline â€” resolve, variants, images, text, payload â€” and
          is saved after every step, so a paused or interrupted run resumes where
          it stopped. Nothing is written to Notion here.
        </p>
        <textarea
          class="db-textarea"
          rows={6}
          placeholder={'R0304\nR0350C\nTTKP230'}
          value={input}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
        />
        <p class="db-note">
          {parsed.skus.length} valid SKU(s)
          {parsed.invalid.length > 0
            ? ` Â· ${parsed.invalid.length} unsupported token(s) skipped`
            : ''}
        </p>

        <div class="db-checks">
          {ALL_LANGS.map((lang) => (
            <label class="db-check" key={lang}>
              <input
                type="checkbox"
                checked={langs.includes(lang)}
                onChange={(e) => {
                  const on = (e.target as HTMLInputElement).checked;
                  setLangs((prev) =>
                    on ? [...prev, lang] : prev.filter((l) => l !== lang),
                  );
                }}
              />
              {lang}
            </label>
          ))}
          <label class="db-check">
            <input
              type="checkbox"
              checked={hashImages}
              onChange={(e) =>
                setHashImages((e.target as HTMLInputElement).checked)
              }
            />
            Download + hash images
          </label>
          <label class="db-check">
            <input
              type="checkbox"
              checked={background}
              onChange={(e) =>
                setBackground((e.target as HTMLInputElement).checked)
              }
            />
            Sample pos0 background
          </label>
          <label class="db-check">
            <input
              type="checkbox"
              checked={modelScoring}
              disabled={!bridge.enabled || !bridge.modelID || running}
              onChange={(e) =>
                setModelScoring((e.target as HTMLInputElement).checked)
              }
            />
            Model scoring (vision)
          </label>
          <label class="db-check">
            <input
              type="number"
              min={30}
              step={30}
              style="width:76px"
              value={timeoutSec}
              onInput={(e) =>
                setTimeoutSec(
                  Number((e.target as HTMLInputElement).value) || 0,
                )
              }
            />
            Per-SKU timeout (seconds)
          </label>
          <label class="db-check">
            <input
              type="number"
              min={100}
              step={100}
              style="width:86px"
              value={maxImages}
              onInput={(e) =>
                setMaxImages(
                  Number((e.target as HTMLInputElement).value) || 0,
                )
              }
            />
            Max image downloads
          </label>
        </div>

        {modelScoring ? (
          <p class="db-note">
            <span
              class={`db-badge ${bridgeHealth?.ok ? 'db-ok' : 'db-bad'}`}
              title={bridgeHealth?.error ?? ''}
            >
              bridge {bridgeHealth?.ok ? 'online' : 'offline'}
              {bridgeHealth?.version ? ` ${bridgeHealth.version}` : ''}
            </span>{' '}
            Model scoring uses <b>{bridge.providerID}/{bridge.modelID}</b> via the
            bridge at {bridge.baseUrl}. It adds review flags and image rows
            (printing sheets, text on pos0, model shots on child images) to the
            payload list; priority stays automatic. Configure it under{' '}
            <b>Model bridge</b>.
          </p>
        ) : (
          <p class="db-note">
            Model scoring is off. Enable it here, or configure the model under{' '}
            <b>Model bridge</b>.
            {bridgeHealth && !bridgeHealth.ok ? (
              <span>
                {' '}
                (<span class="db-badge db-bad">bridge offline</span>)
              </span>
            ) : null}
          </p>
        )}

        <div class="db-actions">
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={busy || parsed.skus.length === 0 || running}
            onClick={() => void start()}
          >
            Start batch
          </button>
          <button
            type="button"
            class="db-btn"
            disabled={busy || !running}
            onClick={() => void control('BATCH_PAUSE')}
          >
            Pause
          </button>
          <button
            type="button"
            class="db-btn"
            disabled={busy || job?.status !== 'paused'}
            onClick={() => void control('BATCH_RESUME')}
          >
            Resume
          </button>
          <button
            type="button"
            class="db-btn"
            disabled={busy || !job || job.status === 'done' || job.status === 'cancelled'}
            onClick={() => void control('BATCH_CANCEL')}
          >
            Cancel
          </button>
          <button
            type="button"
            class="db-btn"
            disabled={busy || !job || running}
            onClick={() => void control('BATCH_CLEAR')}
          >
            Clear results
          </button>
        </div>

        {invalid.length > 0 ? (
          <p class="db-note db-flags--warn">
            Skipped (unsupported): {invalid.join(', ')}
          </p>
        ) : null}
        {error ? <p class="db-note db-flags--warn">{error}</p> : null}
      </section>

      {!job || job.items.length === 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Progress</h2>
          </div>
          <p class="db-empty-state">
            No batch yet â€” paste SKUs above and press Start batch.
          </p>
        </section>
      ) : null}

      {job && job.items.length > 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Progress</h2>
            <span
              class={`db-badge ${
                running ? 'db-warn' : job.status === 'done' ? 'db-ok' : ''
              }`}
            >
              {job.status}
              {running && current ? ` Â· ${current.sku}` : ''}
            </span>
          </div>
          <div class="db-progress-row">
            <span>
              <b>{done}</b>/{total} SKUs Â· <b>{pct}%</b>
            </span>
            <span>
              {running
                ? `elapsed ${fmtMs(elapsedMs)}${etaMs ? ` Â· ETA ${fmtMs(etaMs)}` : ''}`
                : job.status === 'done'
                  ? `finished in ${fmtMs((job.updatedAt ?? 0) - (job.createdAt ?? 0))}`
                  : ''}
            </span>
          </div>
          <div class="db-progress">
            <div class="db-progress-bar" style={`width:${pct}%`} />
          </div>
          {running && current ? (
            <p class="db-note">
              Now running: <b>{current.sku}</b> â€” stage <b>{STAGE_LABEL[current.stage] ?? current.stage}</b>
              {current.anomalyCount > 0 ? ` Â· ${current.anomalyCount} anomal${current.anomalyCount === 1 ? 'y' : 'ies'}` : ''}
            </p>
          ) : null}
          {paused ? <p class="db-note db-flags--warn">Paused â€” press Resume to continue.</p> : null}
          {job.message ? <p class="db-note">{job.message}</p> : null}
          <div class="db-summary-strip">
            <span>Payloads <b>{payloadCount}</b></span>
            <span>Failed <b class={job.totals.failed > 0 ? 'bad' : 'ok'}>{job.totals.failed}</b></span>
            <span>Anomalies <b>{job.totals.anomalies}</b></span>
            <span>Review flags <b>{job.totals.reviewFlags}</b></span>
            <span>Model flags <b>{job.totals.modelFlags}</b></span>
            <span>SKUs ok <b class="ok">{job.totals.ok}</b></span>
          </div>
          <table class="db-table db-stages">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Status</th>
                <th>Stage</th>
                <th>Payloads</th>
                <th>Anomalies</th>
                <th>Review flags</th>
                <th>Model flags</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {job.items.map((item) => (
                <tr
                  key={item.sku}
                  class={item.status === 'running' ? 'db-sku-row--running' : ''}
                >
                  <td>{item.sku}</td>
                  <td>
                    <span class={`db-badge ${STATUS_CLASS[item.status] ?? ''}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{STAGE_LABEL[item.stage] ?? item.stage}</td>
                  <td>{item.payloadCount}</td>
                  <td>
                    {item.anomalyCount > 0 &&
                    (anomalies[item.sku]?.length ?? 0) > 0 ? (
                      <details open={expandAll}>
                        <summary>{item.anomalyCount}</summary>
                        <ul class="db-flags db-flags--warn">
                          {(anomalies[item.sku] ?? []).map((a, ai) => (
                            <li key={`${ai}-${a}`}>{a}</li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      item.anomalyCount
                    )}
                  </td>
                  <td>{item.reviewFlagCount}</td>
                  <td>
                    {item.modelFlagCount > 0 &&
                    (verdicts[item.sku]?.flags.length ?? 0) > 0 ? (
                      <details open={expandAll}>
                        <summary>{item.modelFlagCount}</summary>
                        <ul class="db-flags db-flags--warn">
                          {(verdicts[item.sku]?.flags ?? []).map((f, fi) => (
                            <li key={`${fi}-${f}`}>{f}</li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      item.modelFlagCount
                    )}
                  </td>
                  <td class="db-notes" title={item.error ?? ''}>
                    {item.error ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="db-kv-grid">
            <div>
              <span>SKUs done</span>
              <b>
                {done}/{total}
              </b>
            </div>
            <div>
              <span>Payloads built</span>
              <b>{payloadCount}</b>
            </div>
            <div>
              <span>Failed</span>
              <b class={job.totals.failed > 0 ? 'bad' : 'ok'}>
                {job.totals.failed}
              </b>
            </div>
            <div>
              <span>Anomalies</span>
              <b>{job.totals.anomalies}</b>
            </div>
            <div>
              <span>Review flags</span>
              <b>{job.totals.reviewFlags}</b>
            </div>
            <div>
              <span>Model flags</span>
              <b>{job.totals.modelFlags}</b>
            </div>
          </div>
          <div class="db-actions">
            <label class="db-check" style="margin:0">
              <input
                type="checkbox"
                checked={expandAll}
                onChange={(e) =>
                  setExpandAll((e.target as HTMLInputElement).checked)
                }
              />
              Expand all flags
            </label>
            <button type="button" class="db-btn" onClick={() => void exportJson()}>
              Download JSON
            </button>
            <button type="button" class="db-btn" onClick={() => void copyJson()}>
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
        </section>
      ) : null}

      <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Local images (evidence folder)</h2>
            <span class={`db-badge ${evidenceFolder ? 'db-ok' : ''}`}>
              {evidenceFolder || 'no folder'}
            </span>
          </div>
          <p class="db-note">
            Writes the Magento-ready <b>mirror</b> tree under the chosen folder:{' '}
            <code>
              &lt;folder&gt;\&lt;SUPPLIER&gt;\&lt;SKU&gt;\&lt;Colour&gt;\&lt;PP&gt;_&lt;child&gt;_pos&lt;N&gt;_&lt;name&gt;.&lt;ext&gt;
            </code>{' '}
            plus an empty <code>configure\</code>. <code>PP</code> is the
            zero-padded carousel position, so alphabetical order is carousel
            order; simple products mirror flat at the SKU folder. Only the EN
            carousel is written unless a store's order differs. Images use the
            original file URL (cache-cropped renditions stripped) and are
            downloaded again at save time; nothing is copied into the browser
            profile. <b>Reorder</b> rewrites the <code>PP_</code> prefixes to the
            canonical view order (front → side → back → box → bag → detail →
            ambience) and skips any folder with an unclassifiable file.
            <b>Move model shots</b> asks the vision bridge which images show a
            human wearing the product and moves those into <code>configure\</code>,
            then collapses identical copies (same photo reused by several children)
            to one file per hash. <b>Dedupe configure</b> runs that collapse on its
            own; extras go to <code>_superseded\configure\</code>, never deleted.
          </p>
          <div class="db-actions">
            <button
              type="button"
              class="db-btn"
              disabled={!folderPickingSupported() || savingEvidence}
              onClick={() => void chooseEvidenceFolder()}
            >
              {evidenceFolder ? 'Change folder' : 'Choose folder'}
            </button>
            <button
              type="button"
              class="db-btn db-btn--primary"
              disabled={!evidenceFolder || savingEvidence || (job?.totals.ok ?? 0) === 0}
              onClick={() => void saveEvidence()}
            >
              {savingEvidence ? 'Savingâ€¦' : 'Save images'}
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={testingEvidence || !evidenceFolder}
              onClick={() => void grantEvidenceAccess()}
            >
              Grant access
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={testingEvidence || !evidenceFolder}
              onClick={() => void testEvidenceFolder()}
            >
              {testingEvidence ? 'Testingâ€¦' : 'Test folder'}
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={testingEvidence || (job?.totals.ok ?? 0) === 0}
              onClick={() => void testEvidenceDownload()}
            >
              Test download
            </button>
          </div>
          <div class="db-actions" style="margin-top:8px">
            <label class="db-check" style="margin:0">
              Tidy SKU
              <input
                type="text"
                value={tidySku}
                placeholder="blank = all batch SKUs"
                onInput={(e) => setTidySku((e.target as HTMLInputElement).value)}
              />
            </label>
            <button
              type="button"
              class="db-btn"
              disabled={tidyBusy || !evidenceFolder}
              onClick={() => void runReorder(false)}
            >
              Preview reorder
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={tidyBusy || !evidenceFolder}
              onClick={() => void runReorder(true)}
            >
              Apply reorder
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={tidyBusy || !evidenceFolder}
              onClick={() => void runModelMove(false)}
            >
              Preview model
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={tidyBusy || !evidenceFolder}
              onClick={() => void runModelMove(true)}
            >
              {tidyBusy ? 'Working…' : 'Move model shots'}
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={tidyBusy || !evidenceFolder}
              onClick={() => void runDedupe()}
            >
              Dedupe configure
            </button>
          </div>
          {tidyProgress ? (
            <p class="db-note">
              {tidyProgress.stage === 'reorder'
                ? 'Reorder'
                : tidyProgress.stage === 'dedupe'
                  ? 'Dedupe'
                  : 'Model'}{' '}
              —{' '}
              {tidyProgress.sku} ({tidyProgress.skuIndex}/{tidyProgress.skuTotal}) —{' '}
              {tidyProgress.detail} ({tidyProgress.done}/{tidyProgress.total})
            </p>
          ) : null}
          {tidyResult ? (
            <div class="db-note">
              <p>
                {tidyResult.applied ? 'Applied' : 'Preview'} across{' '}
                {tidyResult.skus} SKU(s): re-sequenced{' '}
                <b>{tidyResult.reordered}</b>, already ordered{' '}
                <b>{tidyResult.alreadyOrdered}</b>, moved/retired{' '}
                <b>{tidyResult.moves}</b>, skipped <b>{tidyResult.skipped}</b>, errors{' '}
                <b>{tidyResult.errors.length}</b>
                {typeof tidyResult.scored === 'number' ? (
                  <>
                    {' '}
                    — model saw <b>{tidyResult.modelHits ?? 0}</b>/
                    <b>{tidyResult.scored}</b> image(s) as human
                  </>
                ) : null}
                .
              </p>
              {tidyResult.receipts.length > 0 ? (
                <ul>
                  {tidyResult.receipts.slice(0, 12).map((line) => (
                    <li key={line}>
                      <code>{line}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
              {tidyResult.skippedDetails.length > 0 ? (
                <p>
                  Skipped: {tidyResult.skippedDetails.slice(0, 5).join(' | ')}
                </p>
              ) : null}
              {tidyResult.errors.length > 0 ? (
                <p>Errors: {tidyResult.errors.slice(0, 5).join(' | ')}</p>
              ) : null}
            </div>
          ) : null}
          <div class="db-actions" style="margin-top:8px">
            <button
              type="button"
              class="db-btn"
              disabled={gateBusy}
              onClick={() => runCoverage()}
            >
              Check coverage
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={gateBusy}
              onClick={() => runStatus()}
            >
              Status
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={gateBusy}
              onClick={() => runBatchReport()}
            >
              Batch report
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={gateBusy || !evidenceFolder}
              onClick={() => runVerify()}
            >
              {gateBusy ? 'Working…' : 'Verify images'}
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={gateBusy || !evidenceFolder}
              onClick={() => runRetire()}
            >
              Retire stale
            </button>
            <button
              type="button"
              class="db-btn"
              disabled={gateBusy}
              onClick={() => runAvailability()}
            >
              Check availability
            </button>
          </div>
          {gateProgress ? <p class="db-note">{gateProgress}</p> : null}
          {gateTitle && gateLines.length > 0 ? (
            <div class="db-note">
              <p>
                <b>{gateTitle}</b>
              </p>
              <pre style="white-space:pre-wrap;font-size:12px;margin:0">
                {gateLines.join('\n')}
              </pre>
            </div>
          ) : null}
          {diagnosis ? (
            <div class="db-note">
              <p>
                Folder: <b>{diagnosis.folder ?? 'none'}</b> | API:{' '}
                {diagnosis.supported ? 'yes' : 'no'} | permission:{' '}
                <b>{diagnosis.permission}</b> | write+readback:{' '}
                <b>{diagnosis.ok ? 'OK' : 'FAILED'}</b>
                {diagnosis.error ? ` | error: ${diagnosis.error}` : ''}
              </p>
              {diagnosis.probe ? (
                <p>
                  Probe: wrote <code>{diagnosis.probe.wrote}</code>, read back{' '}
                  {diagnosis.probe.readBack ? 'yes' : 'no'}, deleted{' '}
                  {diagnosis.probe.removed ? 'yes' : 'no'} | entries:{' '}
                  {diagnosis.probe.entries.length > 0
                    ? diagnosis.probe.entries.join(', ')
                    : '(empty folder)'}
                </p>
              ) : null}
            </div>
          ) : null}
          {dryRun ? (
            <div class="db-note">
              <p>
                Dry run for <b>{dryRun.sku}</b> ({dryRun.skus} SKU(s) stored):{' '}
                {dryRun.mediaFiles} media JSON(s), {dryRun.imageFiles} image
                file(s) planned. First {dryRun.sampled.length} in carousel
                order:
              </p>
              <ul>
                {dryRun.sampled.map((row) => (
                  <li key={row.path}>
                    <code>{row.path}</code> â€” {row.status}
                    {row.bytes !== undefined ? ` (${row.bytes} bytes)` : ''}
                    {row.error ? ` â€” ${row.error}` : ''}
                  </li>
                ))}
              </ul>
              {dryRun.errors.length > 0 ? (
                <p>{dryRun.errors.length} download error(s).</p>
              ) : null}
            </div>
          ) : null}
          {!folderPickingSupported() ? (
            <p class="db-note db-flags--warn">
              This browser has no File System Access API â€” use Chrome or Edge.
            </p>
          ) : null}
          {evidenceProgress ? (
            <p class="db-note">
              {evidenceProgress.sku} ({evidenceProgress.skuIndex}/
              {evidenceProgress.skuTotal}) â€” {evidenceProgress.filesDone}/
              {evidenceProgress.filesTotal}: {evidenceProgress.file}
            </p>
          ) : null}
          {evidenceResult ? (
            <p class="db-note">
              Saved <b>{evidenceResult.files}</b> file(s) for{' '}
              <b>{evidenceResult.skus}</b> SKU(s) into{' '}
              <b>{evidenceResult.folder}</b>.{evidenceResult.aliases > 0 ? ` ${evidenceResult.aliases} duplicate byte(s) skipped.` : ''}{' '}
              {evidenceResult.failed > 0 ? (
                <span>
                  {evidenceResult.failed} failed â€”{' '}
                  {evidenceResult.errors.slice(0, 3).join('; ')}
                </span>
              ) : null}
            </p>
          ) : null}
      </section>

      {job && payloadCount > 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Review &amp; push</h2>
            <span class="db-badge">{payloadCount} payload(s)</span>
          </div>
          <p class="db-note">
            One confirm for the whole batch. Nothing is written until you press
            Push, and only after the Notion connection check. Listing Errors rows
            are create-only: an existing SKU + error title is skipped, never
            overwritten.
          </p>
          <label class="db-check">
            <input
              type="checkbox"
              checked={pushErrors}
              onChange={(e) =>
                setPushErrors((e.target as HTMLInputElement).checked)
              }
            />
            Create Listing Errors rows (create-only)
          </label>
          <label class="db-check">
            <input
              type="checkbox"
              checked={updateLibrary}
              onChange={(e) =>
                setUpdateLibrary((e.target as HTMLInputElement).checked)
              }
            />
            Create / update SKU Library rows (Status, Last audit, links, sizes,
            colors, missing combos, category, subcategory, supplier)
          </label>
          {!updateLibrary ? (
            <p class="db-note db-flags--warn">
              SKU Library is not selected â€” nothing will be created or updated
              there.
            </p>
          ) : null}
          <label class="db-check">
            <input
              type="checkbox"
              checked={confirmPush}
              onChange={(e) =>
                setConfirmPush((e.target as HTMLInputElement).checked)
              }
            />
            I reviewed the payloads and want to write to Notion
          </label>
          <div class="db-actions">
            <button
              type="button"
              class="db-btn"
              disabled={busy}
              onClick={() => void push(false)}
            >
              Preview
            </button>
            <button
              type="button"
              class="db-btn db-btn--primary"
              disabled={busy || !confirmPush}
              onClick={() => void push(true)}
            >
              Push to Notion
            </button>
          </div>
          {pushResult?.dryRun ? (
            <p class="db-note">
              Preview only â€” {pushResult.payloadCount ?? 0} payload(s), nothing
              written.
              {pushResult.warnings && pushResult.warnings.length > 0
                ? ` ${pushResult.warnings.length} contract warning(s).`
                : ''}
            </p>
          ) : null}
          {pushResult?.report ? (
            <ul class="db-kv">
              <li>
                <span>Created</span>
                <b>{pushResult.report.created.length}</b>
              </li>
              <li>
                <span>Skipped (already exist)</span>
                <b>{pushResult.report.skipped.length}</b>
              </li>
              <li>
                <span>Skipped (batch duplicates)</span>
                <b>{pushResult.report.skippedInBatch.length}</b>
              </li>
              <li>
                <span>Failed</span>
                <b
                  class={
                    (pushResult.report.failed?.length ?? 0) > 0 ? 'bad' : 'ok'
                  }
                >
                  {pushResult.report.failed?.length ?? 0}
                </b>
              </li>
            </ul>
          ) : null}
          {pushResult?.libraryReport ? (
            <Fragment>
              <ul class="db-kv">
                <li>
                  <span>Library created</span>
                  <b>{pushResult.libraryReport.created.length}</b>
                </li>
                <li>
                  <span>Library updated</span>
                  <b>{pushResult.libraryReport.updated.length}</b>
                </li>
                <li>
                  <span>Library unchanged</span>
                  <b>{pushResult.libraryReport.unchanged.length}</b>
                </li>
                <li>
                  <span>Library failed</span>
                  <b
                    class={
                      pushResult.libraryReport.failed.length > 0 ? 'bad' : 'ok'
                    }
                  >
                    {pushResult.libraryReport.failed.length}
                  </b>
                </li>
              </ul>
              {Object.keys(pushResult.libraryReport.changes).length > 0 ? (
                <details class="db-note">
                  <summary>
                    {Object.keys(pushResult.libraryReport.changes).length} row(s)
                    changed â€” old â†’ new
                  </summary>
                  <ul class="db-flags">
                    {Object.entries(pushResult.libraryReport.changes).map(
                      ([sku, changes]) => (
                        <li key={sku}>
                          <b>{sku}</b>:{' '}
                          {changes
                            .map(
                              (c) =>
                                `${c.field} "${c.from || 'â€”'}" â†’ "${c.to}"`,
                            )
                            .join('; ')}
                        </li>
                      ),
                    )}
                  </ul>
                </details>
              ) : null}
              {pushResult.libraryReport.failed.length > 0 ? (
                <ul class="db-flags db-flags--warn">
                  {pushResult.libraryReport.failed.map((f) => (
                    <li key={f.sku}>
                      {f.sku}: {f.error}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Fragment>
          ) : null}
          {pushResult?.warnings && pushResult.warnings.length > 0 ? (
            <details class="db-note">
              <summary>{pushResult.warnings.length} contract warning(s)</summary>
              <ul class="db-flags db-flags--warn">
                {pushResult.warnings.map((w, i) => (
                  <li key={`${i}-${w}`}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {pushResult?.report?.failed && pushResult.report.failed.length > 0 ? (
            <ul class="db-flags db-flags--warn">
              {pushResult.report.failed.map((f, i) => (
                <li key={`${i}-${f.title}`}>
                  {f.title}: {f.error}
                  {f.field ? ` (field: ${f.field})` : ''}
                  {f.status ? ` [${f.status}]` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </Fragment>
  );
}



