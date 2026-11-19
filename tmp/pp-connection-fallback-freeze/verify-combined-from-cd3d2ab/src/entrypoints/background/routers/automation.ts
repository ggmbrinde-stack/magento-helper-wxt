/**
 * Lane C router — automation.
 *
 * Owns: the batch pipeline (start / pause / resume / cancel / clear / state /
 * push) and the local model bridge for the model-sort stage. Also owns the
 * worker wake-ups that keep a suspended batch alive.
 *
 * Audit rules and Notion writers belong to the audit lane; this router only
 * composes them. It must not import the page UI.
 */

import {
  BATCH_ALARM,
  clearBatch,
  countPayloads,
  loadBatchJob,
  loadBatchPayloads,
  loadDossier,
  loadLibraryCells,
  markPushed,
  parseSkuInput,
} from '../../../automation';
import {
  loadLibraryRowsBySkus,
  preflightLibraryEntry,
  previewSkuLibrary,
  pushSkuLibraryBatch,
  type LibraryRowRef,
} from '../../../audit';
import { loadSettings } from '../../../shared/notion/client';
import { markdownToNotionBlocks } from '../../../shared/notion/blocks';
import { notionHealth } from '../../../audit';
import {
  preflightListingPayloads,
  pushListingErrorPayloads,
} from '../../../audit';
import {
  getBridgeHealth,
  listBridgeModels,
  loadBridgeConfig,
  saveBridgeConfig,
} from '../../../automation';
import {
  cancelBatch,
  maybeResume,
  pauseBatch,
  resumeBatch,
  startBatch,
} from '../../../automation';
import { NOTION_WRITES_ENABLED } from '../../../shared/flags';
import type { LibraryCells } from '../../../audit';
import type { BatchPushPreview, LaneRouter } from '../../../core/messages';

/** Re-enter the batch pump (worker start, alarm or settings change). */
export function resumeBatchOnWake(): void {
  void maybeResume();
}

/** Worker alarm hook: only the batch pump alarm wakes the pipeline. */
export function onBatchAlarm(name: string): void {
  if (name === BATCH_ALARM) void maybeResume();
}

async function buildBatchPreview(
  token: string,
  skuLibraryDb: string,
  listingErrors: BatchPushPreview['listingErrors'],
  entries: { sku: string; cells: LibraryCells; children?: unknown[] }[],
  health: BatchPushPreview['health'],
): Promise<BatchPushPreview> {
  const rows: BatchPushPreview['library']['rows'] = [];
  let existingRows: Map<string, LibraryRowRef> | null = null;
  if (token) {
    try {
      existingRows = await loadLibraryRowsBySkus(
        token,
        skuLibraryDb,
        entries.map((entry) => entry.sku),
      );
    } catch {
      // Fall back to the writer's per-SKU lookup rather than misreporting rows
      // as new just because the batched read failed.
      existingRows = null;
    }
  }
  for (const entry of entries) {
    if (!token) {
      const pre = preflightLibraryEntry(entry.sku, entry.cells, entry.children);
      rows.push({
        sku: entry.sku,
        action: 'invalid',
        changes: [],
        bodyBlocks: pre.bodyBlocks,
        bodyChunks: pre.bodyChunks,
        bodyAction: 'invalid',
        error: 'Notion token not configured',
      });
      continue;
    }
    try {
      rows.push(
        await previewSkuLibrary(
          token,
          skuLibraryDb,
          entry.sku,
          entry.cells,
          entry.children,
          existingRows
            ? existingRows.get(entry.sku.trim().toUpperCase()) ?? null
            : undefined,
        ),
      );
    } catch (err) {
      const pre = preflightLibraryEntry(entry.sku, entry.cells, entry.children);
      rows.push({
        sku: entry.sku,
        action: 'invalid',
        changes: [],
        bodyBlocks: pre.bodyBlocks,
        bodyChunks: pre.bodyChunks,
        bodyAction: 'invalid',
        error: (err as Error).message ?? 'preview failed',
      });
    }
  }
  return {
    listingErrors,
    library: {
      total: entries.length,
      rows,
      errors: rows.filter((row) => row.action === 'invalid').length,
    },
    health,
  };
}

export const handleAutomationMessage: LaneRouter = (message, ctx) => {
  const { sendResponse } = ctx;

  if (message?.type === 'MODEL_BRIDGE_STATUS') {
    void (async () => {
      try {
        const config = await loadBridgeConfig();
        const [health, catalog] = await Promise.all([
          getBridgeHealth(config),
          listBridgeModels(config),
        ]);
        sendResponse({ ok: true, config, health, catalog });
      } catch (err) {
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Bridge check failed',
        });
      }
    })();
    // Outer return keeps the message channel open for the async response.
    return true;
  }

  if (message?.type === 'MODEL_BRIDGE_SAVE') {
    const raw = message.config ?? {};
    void (async () => {
      try {
        const config = await saveBridgeConfig({
          kind: raw.kind === 'openai' ? 'openai' : 'opencode',
          preset: String(raw.preset ?? ''),
          baseUrl: String(raw.baseUrl ?? ''),
          username: String(raw.username ?? ''),
          password: String(raw.password ?? ''),
          apiKey: String(raw.apiKey ?? ''),
          providerID: String(raw.providerID ?? ''),
          modelID: String(raw.modelID ?? ''),
          enabled: raw.enabled !== false,
        });
        const [health, catalog] = await Promise.all([
          getBridgeHealth(config),
          listBridgeModels(config),
        ]);
        sendResponse({ ok: true, config, health, catalog });
      } catch (err) {
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Bridge settings could not be saved',
        });
      }
    })();
    return true;
  }

  if (message?.type === 'BATCH_START') {
    void (async () => {
      try {
        let skus: string[] = Array.isArray(message.skus)
          ? message.skus.map(String)
          : [];
        let invalid: string[] = Array.isArray(message.invalid)
          ? message.invalid.map(String)
          : [];
        if (skus.length === 0) {
          const parsed = parseSkuInput(String(message.input ?? ''));
          skus = parsed.skus;
          invalid = parsed.invalid;
        }
        if (skus.length === 0) {
          sendResponse({ ok: false, invalid, error: 'No valid SKUs found' });
          return;
        }
        const job = await startBatch({ skus, options: message.options });
        sendResponse({ ok: true, job, invalid });
      } catch (err) {
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Batch start failed',
        });
      }
    })();
    return true;
  }

  if (
    message?.type === 'BATCH_PAUSE' ||
    message?.type === 'BATCH_RESUME' ||
    message?.type === 'BATCH_CANCEL' ||
    message?.type === 'BATCH_CLEAR'
  ) {
    void (async () => {
      try {
        if (message.type === 'BATCH_CLEAR') {
          const job = await loadBatchJob();
          if (job?.status === 'running') {
            sendResponse({
              ok: false,
              error: 'Pause or cancel the batch before clearing results.',
            });
            return;
          }
          await clearBatch();
          sendResponse({ ok: true, job: null });
          return;
        }
        const job =
          message.type === 'BATCH_PAUSE'
            ? await pauseBatch()
            : message.type === 'BATCH_RESUME'
              ? await resumeBatch()
              : await cancelBatch();
        sendResponse({ ok: true, job });
      } catch (err) {
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Batch control failed',
        });
      }
    })();
    return true;
  }

  if (message?.type === 'BATCH_STATE') {
    void (async () => {
      try {
        const [job, payloads] = await Promise.all([
          loadBatchJob(),
          loadBatchPayloads(),
        ]);
        sendResponse({ ok: true, job, payloadCount: countPayloads(payloads) });
      } catch (err) {
        sendResponse({
          ok: false,
          payloadCount: 0,
          error: (err as Error).message ?? 'Batch state failed',
        });
      }
    })();
    return true;
  }

  if (message?.type === 'BATCH_PUSH') {
    const confirm = message.confirm === true;
    const wantErrors = message.listingErrors !== false;
    const wantLibrary = message.library === true;
    void (async () => {
      try {
        const [payloadMap, libraryMap, dossierMap] = await Promise.all([
          loadBatchPayloads(),
          loadLibraryCells(),
          loadDossier(),
        ]);
        const payloads = Object.values(payloadMap).flat();
        const libraryEntries = Object.entries(libraryMap).map(
          ([sku, cells]) => {
            // Cells stored by older runs predate these three fields; the
            // payloads for the same SKU already carry the validated values.
            const first = payloadMap[sku]?.[0];
            return {
              sku,
              cells: {
                ...cells,
                category: cells.category || first?.category || '',
                subcategory: cells.subcategory || first?.subcategory || '',
                supplier: cells.supplier || first?.supplier || '',
              },
              children: [] as unknown[],
            };
          },
        );
        if (
          (wantErrors ? payloads.length === 0 : true) &&
          (wantLibrary ? libraryEntries.length === 0 : true)
        ) {
          sendResponse({ ok: false, error: 'Nothing to push' });
          return;
        }

        if (wantLibrary) {
          for (const entry of libraryEntries) {
            const md = dossierMap[entry.sku];
            if (!md) continue;
            entry.children = markdownToNotionBlocks(md);
          }
        }

        const listingPreflight = wantErrors
          ? preflightListingPayloads(payloads)
          : {
              total: payloads.length,
              unique: payloads.length,
              duplicates: 0,
              warnings: [],
              failures: [],
            };
        const libraryPreflights = wantLibrary
          ? libraryEntries.map((entry) =>
              preflightLibraryEntry(entry.sku, entry.cells, entry.children),
            )
          : [];
        const localFailures =
          listingPreflight.failures.length +
          libraryPreflights.filter((row) => !row.ok).length;
        const localErrorDetails = [
          ...listingPreflight.failures.map(
            (failure) => `${failure.title}: ${failure.error}`,
          ),
          ...libraryPreflights
            .filter((row) => !row.ok)
            .map((row) => `${row.sku}: ${row.error ?? 'invalid row'}`),
        ].join('; ');
        const warnings = listingPreflight.warnings;

        const settings = await loadSettings();
        let health: BatchPushPreview['health'];
        if (!settings.notionToken) {
          health = { ok: false, error: 'Notion token not configured' };
        } else {
          try {
            const report = await notionHealth({ fresh: confirm });
            health = {
              ok: report.ok,
              error: report.ok
                ? undefined
                : report.checks
                    .filter((check) => check.status === 'fail')
                    .map((check) => `${check.label}: ${check.detail}`)
                    .join(' | ') || 'Notion health check failed',
            };
          } catch (err) {
            health = {
              ok: false,
              error: (err as Error).message ?? 'Notion health check failed',
            };
          }
        }

        if (!confirm || !NOTION_WRITES_ENABLED) {
          const preview = await buildBatchPreview(
            settings.notionToken,
            settings.skuLibraryDb,
            listingPreflight,
            wantLibrary ? libraryEntries : [],
            health,
          );
          const healthOk = health?.ok === true;
          sendResponse({
            ok: localFailures === 0 && healthOk,
            dryRun: true,
            payloadCount: payloads.length,
            warnings,
            preview,
            error: localFailures
              ? `Preflight failed; nothing was written. ${localErrorDetails}`
              : healthOk
                ? undefined
                : `Notion health check failed: ${health?.error ?? 'unknown error'}`,
          });
          return;
        }

        if (localFailures > 0) {
          sendResponse({
            ok: false,
            error: `Preflight failed; nothing was written. ${localErrorDetails}`,
          });
          return;
        }
        if (!settings.notionToken) {
          sendResponse({ ok: false, error: 'Notion token not configured' });
          return;
        }
        if (!health?.ok) {
          sendResponse({
            ok: false,
            error: `Notion health check failed: ${health?.error ?? 'unknown error'}`,
          });
          return;
        }

        const report =
          wantErrors && payloads.length > 0
            ? await pushListingErrorPayloads(
                settings.notionToken,
                settings.listingErrorsDb,
                payloads,
              )
            : undefined;

        const libraryReport =
          wantLibrary && libraryEntries.length > 0
            ? await pushSkuLibraryBatch(
                settings.notionToken,
                settings.skuLibraryDb,
                libraryEntries,
              )
            : undefined;
        if (libraryReport) {
          const incomplete = new Set(libraryReport.bodyIncomplete);
          const okSkus = [
            ...libraryReport.created.filter((sku) => !incomplete.has(sku)),
            ...libraryReport.updated.filter((sku) => !incomplete.has(sku)),
            ...libraryReport.unchanged.filter((sku) => !incomplete.has(sku)),
          ];
          await markPushed(okSkus);
        }
        sendResponse({
          ok: true,
          dryRun: false,
          payloadCount: payloads.length,
          warnings,
          report,
          libraryReport,
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Batch push failed',
        });
      }
    })();
    return true;
  }

  return false;
};
