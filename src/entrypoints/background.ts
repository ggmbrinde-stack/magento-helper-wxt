import { defineBackground } from 'wxt/sandbox';
import {
  loadSettings,
  mapListingErrorPage,
  mapSkuLibraryPage,
  queryDatabase,
} from '../lib/notion';
import { lookupSku } from '../lib/lookup';
import { resolveSku, resolveSkuWithHtml } from '../lib/resolver';
import { buildMagentoTable } from '../lib/magento';
import { imageAuditForSku } from '../lib/imageFetch';
import { textAuditForSku } from '../lib/textFetch';
import { buildPayloadsFromMarkdown, extractBreadcrumbs } from '../lib/payload';
import { payloadWarnings, pushListingErrorPayloads } from '../lib/listingWriter';
import { notionHealth } from '../lib/notionHealth';
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
} from '../lib/batch';
import { pushSkuLibraryBatch } from '../lib/skuLibraryWriter';
import { markdownToNotionBlocks } from '../lib/notionBlocks';
import { buildDossierMarkdown } from '../lib/dossierContent';
import {
  getBridgeHealth,
  listBridgeModels,
  loadBridgeConfig,
  saveBridgeConfig,
} from '../lib/modelBridge';
import {
  cancelBatch,
  maybeResume,
  pauseBatch,
  resumeBatch,
  startBatch,
} from '../lib/batchRunner';
import { NOTION_WRITES_ENABLED } from '../lib/flags';
import {
  ListingErrorSchema,
  SkuLibrarySchema,
  validateRows,
  type ListingError,
} from '../lib/schemas';
import type { ResolverEntry, ResolverMap } from '../lib/messages';

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

/** Best open Magento admin tab to draw error markup on (prefer a product page). */
async function findAdminTabId(): Promise<number | undefined> {
  const tabs = await chrome.tabs.query({});
  const adminTabs = tabs.filter((t) =>
    /^https:\/\/bestofgifts/.test(t.url ?? ''),
  );
  const tab =
    adminTabs.find((t) => (t.url ?? '').includes('/catalog/product')) ??
    adminTabs.find((t) => (t.url ?? '').includes('admin'));
  return tab?.id;
}

export default defineBackground(() => {
  // Clicking the toolbar icon opens the side panel.
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => undefined);
  }

  // Batch runner: re-enter the pump when the worker wakes up or when a job
  // stalls. The pump itself re-reads the persisted job every step, so nothing
  // is lost if the worker is suspended mid-batch.
  chrome.runtime.onStartup?.addListener(() => {
    void maybeResume();
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === BATCH_ALARM) void maybeResume();
  });
  void maybeResume();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // D4 fix: single writer for the resolver cache. The content script and
    // lookup path both route through here; the map is read-modify-written once.
    if (message?.type === 'RESOLVE_CACHE_PUT') {
      const entry = message.entry as ResolverEntry | undefined;
      if (!entry?.sku) {
        sendResponse({ ok: false });
        return true;
      }
      void (async () => {
        try {
          const stored = await chrome.storage.local.get(['resolverMap']);
          const map = (stored.resolverMap as ResolverMap | undefined) ?? {};
          const existing = map[entry.sku];
          // Only write when something actually changed.
          if (
            !existing ||
            existing.id !== entry.id ||
            existing.children.length !== entry.children.length ||
            existing.timestamp < entry.timestamp
          ) {
            map[entry.sku] = entry;
            await chrome.storage.local.set({ resolverMap: map });
          }
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }

    if (message?.type === 'FETCH_SKU_DATA') {
      const sku = String(message.sku ?? '');
      const storeView = String(message.storeView ?? 'all');
      if (!sku) {
        sendResponse({ error: 'SKU is required' });
        return true;
      }
      void (async () => {
        try {
          const settings = await loadSettings();
          if (!settings.notionToken) {
            sendResponse({ error: 'Notion token not configured' });
            return;
          }
          const skuFilter = { property: 'SKU', title: { equals: sku } };
          const errorFilter = {
            and: [
              { property: 'SKU', rich_text: { equals: sku } },
              {
                property: 'Status',
                select: { does_not_equal: 'Done' },
              },
            ],
          };
          const [skuPages, errorPages] = await Promise.all([
            queryDatabase(
              settings.notionToken,
              settings.skuLibraryDb,
              skuFilter,
              1,
            ),
            queryDatabase(
              settings.notionToken,
              settings.listingErrorsDb,
              errorFilter,
              100,
            ),
          ]);
          const library = validateRows(
            SkuLibrarySchema,
            skuPages.map(mapSkuLibraryPage),
          );
          const mapped = validateRows(
            ListingErrorSchema,
            errorPages.map(mapListingErrorPage),
          );
          let errors: ListingError[] = mapped.rows;
          if (storeView !== 'all') {
            errors = errors.filter(
              (e) => e.language === storeView || e.language === 'Systemic',
            );
          }
          errors.sort(
            (a, b) =>
              (PRIORITY_ORDER[a.priority] ?? 3) -
              (PRIORITY_ORDER[b.priority] ?? 3),
          );
          sendResponse({
            skuLibrary: library.rows[0] ?? null,
            errors,
            skippedRows: library.skipped + mapped.skipped,
          });
        } catch (err) {
          sendResponse({ error: (err as Error).message ?? 'Unknown error' });
        }
      })();
      // Outer return keeps the message channel open for the async response.
      return true;
    }

    if (message?.type === 'LOOKUP_SKU') {
      const sku = String(message.sku ?? '').trim();
      if (!sku) {
        sendResponse({ found: false, error: 'SKU is required' });
        return true;
      }
      void (async () => {
        try {
          sendResponse(await lookupSku(sku));
        } catch (err) {
          sendResponse({
            found: false,
            error: (err as Error).message ?? 'Lookup failed',
          });
        }
      })();
      // Outer return keeps the message channel open for the async response.
      return true;
    }

    if (message?.type === 'FETCH_ERROR_MARKUP') {
      const sku = String(message.sku ?? '').trim();
      void (async () => {
        try {
          if (!sku) {
            sendResponse({ error: 'SKU is required' });
            return;
          }
          const settings = await loadSettings();
          if (!settings.notionToken) {
            sendResponse({ error: 'Notion token not configured' });
            return;
          }
          const targetTabId = sender.tab?.id ?? (await findAdminTabId());
          if (!targetTabId) {
            sendResponse({ error: 'No Magento admin tab open.' });
            return;
          }
          const errorFilter = {
            and: [
              { property: 'SKU', rich_text: { equals: sku } },
              { property: 'Status', select: { does_not_equal: 'Done' } },
            ],
          };
          const pages = await queryDatabase(
            settings.notionToken,
            settings.listingErrorsDb,
            errorFilter,
            100,
          );
          const mapped = validateRows(
            ListingErrorSchema,
            pages.map(mapListingErrorPage),
          );
          const errors = mapped.rows
            .slice()
            .sort(
              (a, b) =>
                (PRIORITY_ORDER[a.priority] ?? 3) -
                (PRIORITY_ORDER[b.priority] ?? 3),
            );
          await chrome.tabs.sendMessage(targetTabId, {
            type: 'ERROR_MARKUP',
            errors,
          });
          sendResponse({ success: true, errorCount: errors.length });
        } catch (err) {
          sendResponse({
            error: (err as Error).message ?? 'Failed to build markup',
          });
        }
      })();
      // Outer return keeps the message channel open for the async response.
      return true;
    }

    if (message?.type === 'RESOLVE_SKU') {
      const sku = String(message.sku ?? '').trim();
      const url = message.url ? String(message.url) : undefined;
      if (!sku) {
        sendResponse({ ok: false, error: 'SKU is required' });
        return true;
      }
      void (async () => {
        try {
          const resolver = await resolveSku(sku, { url });
          // Cache a compact resolver entry for the dashboard's cache view.
          const magento = buildMagentoTable(resolver);
          const productId = magento.isSimple ? magento.simpleId : magento.confId;
          if (productId) {
            const entry: ResolverEntry = {
              id: productId,
              sku: resolver.sku,
              backend: magento.configurableUrl,
              children: magento.rows.map((row) => ({
                id: row.child,
                sku: '',
                color: row.color,
                size: row.size,
                backend: row.url,
              })),
              timestamp: Date.now(),
            };
            // D4 fix: route through the single-writer helper (read-modify-write).
            const stored = await chrome.storage.local.get(['resolverMap']);
            const map = (stored.resolverMap as ResolverMap | undefined) ?? {};
            const existing = map[entry.sku];
            if (
              !existing ||
              existing.id !== entry.id ||
              existing.children.length !== entry.children.length
            ) {
              map[entry.sku] = entry;
              await chrome.storage.local.set({ resolverMap: map });
            }
          }
          sendResponse({ ok: true, resolver });
        } catch (err) {
          sendResponse({ ok: false, error: (err as Error).message ?? 'Resolve failed' });
        }
      })();
      // Outer return keeps the message channel open for the async response.
      return true;
    }

    if (message?.type === 'AUDIT_IMAGES') {
      const sku = String(message.sku ?? '').trim();
      const url = message.url ? String(message.url) : undefined;
      if (!sku) {
        sendResponse({ ok: false, error: 'SKU is required' });
        return true;
      }
      void (async () => {
        try {
          const resolver = await resolveSku(sku, { url });
          const run = await imageAuditForSku(resolver, {
            langs: Array.isArray(message.langs) ? message.langs.map(String) : undefined,
            hashImages: message.hashImages === true,
            background: message.background !== false,
            maxChildren:
              typeof message.maxChildren === 'number' ? message.maxChildren : undefined,
            maxImages: typeof message.maxImages === 'number' ? message.maxImages : undefined,
          });
          sendResponse({
            ok: run.audit.ok,
            audit: run.audit,
            mdBlock: run.mdBlock,
            anomalies: run.collection.anomalies,
            stats: run.collection.stats,
          });
        } catch (err) {
          sendResponse({ ok: false, error: (err as Error).message ?? 'Image audit failed' });
        }
      })();
      // Outer return keeps the message channel open for the async response.
      return true;
    }

    if (message?.type === 'AUDIT_TEXT') {
      const sku = String(message.sku ?? '').trim();
      const url = message.url ? String(message.url) : undefined;
      if (!sku) {
        sendResponse({ ok: false, error: 'SKU is required' });
        return true;
      }
      void (async () => {
        try {
          const run = await textAuditForSku(sku, {
            url,
            langs: Array.isArray(message.langs) ? message.langs.map(String) : undefined,
          });
          sendResponse({
            ok: run.audit.ok,
            audit: run.audit,
            mdBlock: run.audit.mdBlock,
            anomalies: run.anomalies,
          });
        } catch (err) {
          sendResponse({ ok: false, error: (err as Error).message ?? 'Text audit failed' });
        }
      })();
      // Outer return keeps the message channel open for the async response.
      return true;
    }

    if (message?.type === 'NOTION_HEALTH') {
      void (async () => {
        try {
          sendResponse({ ok: true, report: await notionHealth() });
        } catch (err) {
          sendResponse({
            ok: false,
            error: (err as Error).message ?? 'Health check failed',
          });
        }
      })();
      // Outer return keeps the message channel open for the async response.
      return true;
    }

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
            baseUrl: String(raw.baseUrl ?? ''),
            username: String(raw.username ?? ''),
            password: String(raw.password ?? ''),
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

    if (message?.type === 'PUSH_LISTING_ERRORS') {
      const sku = String(message.sku ?? '').trim();
      const content = String(message.content ?? '');
      const confirm = message.confirm === true;
      const fetchBreadcrumbs = message.fetchBreadcrumbs !== false;
      if (!sku) {
        sendResponse({ ok: false, error: 'SKU is required' });
        return true;
      }
      void (async () => {
        try {
          let breadcrumbs = null;
          if (fetchBreadcrumbs) {
            try {
              const { enHtml } = await resolveSkuWithHtml(sku);
              breadcrumbs = extractBreadcrumbs(enHtml);
            } catch {
              // breadcrumbs stay missing -> Category/Subcategory flagged, never invented
            }
          }
          const build = buildPayloadsFromMarkdown({
            sku,
            content,
            link: message.link ? String(message.link) : undefined,
            supplier: message.supplier ? String(message.supplier) : undefined,
            breadcrumbs,
          });
          if (!build.ok) {
            sendResponse({ ok: false, error: build.error, anomalies: build.anomalies });
            return;
          }
          if (!confirm || !NOTION_WRITES_ENABLED) {
            sendResponse({
              ok: true,
              dryRun: true,
              payloads: build.payloads,
              anomalies: build.anomalies,
            });
            return;
          }
          const settings = await loadSettings();
          if (!settings.notionToken) {
            sendResponse({ ok: false, error: 'Notion token not configured' });
            return;
          }
          const report = await pushListingErrorPayloads(
            settings.notionToken,
            settings.listingErrorsDb,
            build.payloads,
          );
          sendResponse({
            ok: true,
            dryRun: false,
            payloads: build.payloads,
            anomalies: build.anomalies,
            report,
          });
        } catch (err) {
          sendResponse({ ok: false, error: (err as Error).message ?? 'Push failed' });
        }
      })();
      // Outer return keeps the message channel open for the async response.
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
          const warnings = payloads.flatMap((p) => payloadWarnings(p));

          if (!confirm || !NOTION_WRITES_ENABLED) {
            sendResponse({
              ok: true,
              dryRun: true,
              payloadCount: payloads.length,
              warnings,
            });
            return;
          }

          const settings = await loadSettings();
          if (!settings.notionToken) {
            sendResponse({ ok: false, error: 'Notion token not configured' });
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

          const rowLinks = report?.createdPageIds ?? {};

          if (wantLibrary) {
            for (const entry of libraryEntries) {
              const md = dossierMap[entry.sku];
              if (!md) continue;
              entry.children = markdownToNotionBlocks(md);
            }
          }

          const libraryReport =
            wantLibrary && libraryEntries.length > 0
              ? await pushSkuLibraryBatch(
                  settings.notionToken,
                  settings.skuLibraryDb,
                  libraryEntries,
                )
              : undefined;
          if (libraryReport) {
            const okSkus = [
              ...libraryReport.created,
              ...libraryReport.updated,
              ...libraryReport.unchanged,
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

    if (message?.type === 'OPEN_TAB_GROUP') {
      const urls = (message.urls ?? []) as string[];
      const groupName = String(message.groupName ?? 'Magento');
      if (urls.length === 0) {
        sendResponse({ success: false, error: 'No URLs provided' });
        return true;
      }
      void (async () => {
        try {
          const first = await chrome.tabs.create({
            url: urls[0],
            active: false,
          });
          const rest = await Promise.all(
            urls.slice(1).map((url) =>
              chrome.tabs.create({ url, active: false }),
            ),
          );
          const tabIds = [first.id, ...rest.map((t) => t.id)].filter(
            (id): id is number => typeof id === 'number',
          );
          if (chrome.tabs.group) {
            const groupId = await chrome.tabs.group({ tabIds });
            await chrome.tabGroups.update(groupId, { title: groupName });
            sendResponse({ success: true, groupId });
          } else {
            sendResponse({ success: true, tabIds });
          }
        } catch (err) {
          sendResponse({ success: false, error: (err as Error).message });
        }
      })();
      // Outer return keeps the channel open for the async response.
      return true;
    }

    return false;
  });
});
