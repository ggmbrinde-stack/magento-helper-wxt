import type { RouterContext, PpPreviewTab, ScanPpDraftResponse } from '../../core/messages';
import { ppCatalogEntity } from '../../shared/ppCatalog';

/** Only the extension's dashboard document can request a cross-tab PP read. */
export function isPpPreviewSender(ctx: RouterContext): boolean {
  try {
    const sender = new URL(ctx.senderUrl ?? '');
    const dashboard = new URL(chrome.runtime.getURL('dashboard.html'));
    return sender.protocol === dashboard.protocol && sender.host === dashboard.host &&
      sender.pathname === dashboard.pathname && !sender.search &&
      (ctx.senderFrameId === undefined || ctx.senderFrameId === 0);
  } catch { return false; }
}

export const PP_PREVIEW_TAB_URLS = [
  'bestofgifts.pt', 'bestofgifts.eu', 'bestofgifts.es', 'bestofgifts.fr',
  'bestofgifts-pt-qa.toogas.net',
].map(host => `https://${host}/*toogas_attributesetcustomoptions/attributesetcustomoptions/edit/*`);

export async function ppTabSelectionToken(tab: chrome.tabs.Tab): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${tab.id}\n${tab.url}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function ppPreviewTab(tab: chrome.tabs.Tab): Promise<PpPreviewTab | null> {
  const entityId = ppCatalogEntity(tab.url ?? '');
  if (!entityId || typeof tab.id !== 'number' || !Number.isInteger(tab.id) || tab.id < 0 || tab.pendingUrl) return null;
  const url = new URL(tab.url!);
  // The private full URL detects navigation; only its digest crosses contexts.
  const selectionToken = await ppTabSelectionToken(tab);
  return {
    tabId: tab.id, host: url.hostname, entityId,
    routePath: `/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/${entityId}`,
    selectionToken,
  };
}

export function isPpDraftScanResponse(value: unknown): value is ScanPpDraftResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as ScanPpDraftResponse;
  const isRecord = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item);
  const validCollection = (collection: unknown): boolean => {
    if (!isRecord(collection) || !Array.isArray(collection.rows) ||
      !Array.isArray(collection.skippedPositions) ||
      !collection.skippedPositions.every((position) => typeof position === 'number' && Number.isInteger(position) && position >= 0) ||
      !['available', 'missing', 'invalid'].includes(String(collection.state)) ||
      typeof collection.truncated !== 'boolean' || typeof collection.identifierGaps !== 'number' ||
      !Number.isInteger(collection.identifierGaps) || collection.identifierGaps < 0) return false;
    return collection.rows.every((row) => isRecord(row) &&
      typeof row.position === 'number' && Number.isInteger(row.position) && row.position >= 0 &&
      isRecord(row.values) && isRecord(row.translations));
  };
  return result.version === 1 &&
    ['ok', 'partial', 'unavailable', 'identity-mismatch'].includes(result.status) &&
    (typeof result.entityId === 'string' || result.entityId === null) &&
    typeof result.routePath === 'string' && isRecord(result.general) &&
    validCollection(result.locations) && validCollection(result.items) &&
    Array.isArray(result.warnings) && result.warnings.every((warning) => typeof warning === 'string') &&
    (result.scannedAt === undefined || (typeof result.scannedAt === 'number' && Number.isFinite(result.scannedAt)));
}
