/**
 * Lane B router — audit.
 *
 * Owns: SKU data for the panel, the storefront resolver, the image and text
 * audits, Notion health, and the single-SKU Listing Errors push. Also owns the
 * Notion-health cache invalidation hook the worker calls when settings change.
 *
 * This router must not import the page UI or the batch runner; the batch push
 * step lives in `automation.ts` and calls this lane's writers through their
 * modules, not through this router.
 */

import {
  loadSettings,
  mapListingErrorPage,
  mapSkuLibraryPage,
  queryAllDatabase,
  queryDatabase,
} from '../../../shared/notion/client';
import {
  checkSkuAvailability,
  getCachedResolver,
  readResolverCache,
  deleteCachedResolver,
  clearResolverCache,
  loadAvailability,
  saveAvailability,
  resolveSkuForDashboard,
  downloadMakitoCarouselImages,
  collectMakitoGallery,
  saveSupplierOverride,
  clearSupplierOverride,
  supplierInfoForSku,
} from '../../../audit';
import { resolveSku, resolveSkuWithHtml } from '../../../shared/resolver';
import { imageAuditForSku } from '../../../audit';
import { textAuditForSku } from '../../../audit';
import {
  breadcrumbsFromCategories,
  buildPayloadsFromMarkdown,
  extractBreadcrumbs,
} from '../../../audit';
import {
  pushListingErrorPayloads,
} from '../../../audit';
import { clearNotionHealthCache, notionHealth } from '../../../audit';
import { NOTION_WRITES_ENABLED } from '../../../shared/flags';
import {
  ListingErrorSchema,
  SkuLibrarySchema,
  validateRows,
  type ListingError,
} from '../../../shared/schemas';
import type { LaneRouter } from '../../../core/messages';

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

/** Settings keys that invalidate the cached Notion health report. */
const HEALTH_KEYS = ['notionToken', 'skuLibraryDb', 'listingErrorsDb'];

/**
 * Called by the worker's `chrome.storage.onChanged` listener. A token or
 * database change must not leave a stale preview health result.
 */
export function onSettingsChanged(changedKeys: readonly string[]): void {
  if (HEALTH_KEYS.some((key) => changedKeys.includes(key))) {
    clearNotionHealthCache();
  }
}

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

export const handleAuditMessage: LaneRouter = (message, ctx) => {
  const { sendResponse } = ctx;

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
        const [skuPages, errorPage] = await Promise.all([
          queryDatabase(
            settings.notionToken,
            settings.skuLibraryDb,
            skuFilter,
            1,
          ),
          queryAllDatabase(
            settings.notionToken,
            settings.listingErrorsDb,
            errorFilter,
            100,
          ),
        ]);
        const errorPages = errorPage.results;
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
            (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3),
        );
        sendResponse({
          skuLibrary: library.rows[0] ?? null,
          errors,
          skippedRows: library.skipped + mapped.skipped,
          truncated: errorPage.truncated,
        });
      } catch (err) {
        sendResponse({ error: (err as Error).message ?? 'Unknown error' });
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
        const targetTabId = ctx.senderTabId ?? (await findAdminTabId());
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
        const page = await queryAllDatabase(
          settings.notionToken,
          settings.listingErrorsDb,
          errorFilter,
          100,
        );
        const mapped = validateRows(
          ListingErrorSchema,
          page.results.map(mapListingErrorPage),
        );
        const errors = mapped.rows
          .slice()
          .sort(
            (a, b) =>
              (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3),
          );
        await chrome.tabs.sendMessage(targetTabId, {
          type: 'ERROR_MARKUP',
          errors,
        });
        sendResponse({
          success: true,
          errorCount: errors.length,
          truncated: page.truncated,
        });
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
    const force = message.force === true;
    if (!sku) {
      sendResponse({ ok: false, error: 'SKU is required' });
      return true;
    }
    void (async () => {
      try {
        sendResponse(await resolveSkuForDashboard(sku, url, force));
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

  if (message?.type === 'CHECK_SUPPLIER') {
    const sku = String(message.sku ?? '').trim().toUpperCase();
    const force = message.force === true;
    if (!sku) {
      sendResponse({ ok: false, error: 'SKU is required' });
      return true;
    }
    void (async () => {
      try {
        // The stored verdict is shown as-is unless the operator re-checks (D4).
        const cached = (await loadAvailability())[sku];
        if (!force && cached) {
          sendResponse({ ok: true, check: cached });
          return;
        }
        const check = await checkSkuAvailability(sku, {
          priorMisses: cached?.misses ?? [],
        });
        await saveAvailability([check]);
        sendResponse({ ok: true, check });
      } catch (err) {
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Supplier check failed',
        });
      }
    })();
    // Outer return keeps the message channel open for the async response.
    return true;
  }

  if (message?.type === 'SET_SUPPLIER_URL' || message?.type === 'CLEAR_SUPPLIER_URL') {
    const sku = String(message.sku ?? '').trim().toUpperCase();
    if (!sku) {
      sendResponse({ ok: false, error: 'Resolve a SKU first.' });
      return true;
    }
    void (async () => {
      try {
        if (message.type === 'SET_SUPPLIER_URL') {
          await saveSupplierOverride(sku, String(message.url ?? ''));
        } else {
          await clearSupplierOverride(sku);
        }
        sendResponse({ ok: true, supplier: await supplierInfoForSku(sku) });
      } catch (err) {
        sendResponse({ ok: false, error: (err as Error).message ?? 'Could not store the link.' });
      }
    })();
    return true;
  }

  if (message?.type === 'DOWNLOAD_MAKITO_IMAGES') {
    const sku = String(message.sku ?? '').trim().toUpperCase();
    const catalogUrl = String(message.catalogUrl ?? '').trim();
    if (!sku || !catalogUrl) {
      sendResponse({ ok: false, error: 'A Makito SKU and confirmed product URL are required.' });
      return true;
    }
    const work =
      message.mode === 'files'
        ? collectMakitoGallery(sku, catalogUrl, { withBytes: true }).then((gallery) => ({
            total: gallery.total,
            folder: gallery.folder,
            files: gallery.files.map((file) => ({ name: file.name, base64: file.base64 ?? '' })),
          }))
        : downloadMakitoCarouselImages(sku, catalogUrl);
    void work
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Could not download Makito product images.',
        }),
      );
    return true;
  }

  if (message?.type === 'RESOLVER_CACHE') {
    const action = String(message.action ?? 'list');
    void (async () => {
      try {
        if (action === 'clear') {
          await clearResolverCache();
          sendResponse({ ok: true, entries: [] });
          return;
        }
        if (action === 'delete') {
          const sku = String(message.sku ?? '').trim();
          if (sku) await deleteCachedResolver(sku);
        }
        sendResponse({ ok: true, entries: await readResolverCache() });
      } catch (err) {
        sendResponse({
          ok: false,
          error: (err as Error).message ?? 'Cache operation failed',
        });
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
            // C3: the resolver already stored the breadcrumb path, so a push
            // costs no second storefront fetch when the SKU is cached.
            const cached = await getCachedResolver(sku);
            if (cached?.categories?.ok) {
              breadcrumbs = breadcrumbsFromCategories(cached.categories);
            } else {
              const { enHtml } = await resolveSkuWithHtml(sku);
              breadcrumbs = extractBreadcrumbs(enHtml);
            }
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

  return false;
};
