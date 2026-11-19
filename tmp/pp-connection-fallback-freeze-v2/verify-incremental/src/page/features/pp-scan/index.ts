import type {
  ScanPpDraftRequest,
  ScanPpDraftResponse,
} from '../../../core/messages';
import { ppEntityIdFromUrl, ppRoutePathFromUrl } from './page';

const ANCHOR_SELECTOR =
  '[data-bind*="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"]';
const PANEL_ID = 'mhx-pp-draft-scan';

let mounted:
  | { panel: HTMLElement; anchor: HTMLElement; host: HTMLElement; entityId: string; destroy: () => void }
  | undefined;

function isScanResponse(value: unknown): value is ScanPpDraftResponse {
  if (!value || typeof value !== 'object') return false;
  const result = value as ScanPpDraftResponse;
  return (
    result.version === 1 &&
    ['ok', 'partial', 'unavailable', 'identity-mismatch'].includes(result.status) &&
    (typeof result.entityId === 'string' || result.entityId === null) &&
    typeof result.routePath === 'string' &&
    !!result.general && typeof result.general === 'object' &&
    !!result.locations && Array.isArray(result.locations.rows) && Array.isArray(result.locations.skippedPositions) &&
    !!result.items && Array.isArray(result.items.rows) && Array.isArray(result.items.skippedPositions) &&
    Array.isArray(result.warnings)
  );
}

export function unmountPpScan(): void {
  mounted?.destroy();
  mounted = undefined;
}

export function mountPpScan(): void {
  const entityId = ppEntityIdFromUrl(window.location.href);
  const anchor = document.querySelector<HTMLElement>(ANCHOR_SELECTOR);
  if (
    mounted &&
    (!mounted.panel.isConnected || mounted.entityId !== entityId ||
      mounted.anchor !== anchor || !anchor || mounted.panel.parentElement !== mounted.host ||
      anchor.parentElement !== mounted.host)
  ) unmountPpScan();
  if (!entityId || !anchor?.parentElement || mounted) return;

  const pageDocument = document;
  const currentPath = window.location.pathname;
  const routePath = ppRoutePathFromUrl(window.location.href) ?? '';
  let generation = 0;
  const panel = document.createElement('section');
  panel.id = PANEL_ID;
  panel.setAttribute('aria-label', 'Current Magento custom-option draft scan');
  const heading = document.createElement('h2');
  heading.textContent = 'Current Magento draft (read-only)';
  const explanation = document.createElement('p');
  explanation.textContent =
    'Scans the current unsaved draft. It does not save or change Magento data.';
  const scanButton = document.createElement('button');
  scanButton.type = 'button';
  scanButton.textContent = 'Scan current PP';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Scan when the custom-option form has finished loading.';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Snapshot';
  const output = document.createElement('pre');
  output.setAttribute('aria-label', 'Current custom-option draft snapshot');
  details.append(summary, output);
  panel.append(heading, explanation, scanButton, status, details);
  const host = anchor.parentElement;
  const catalogPanel = host.querySelector<HTMLElement>(':scope > #mhx-pp-catalog');
  host.insertBefore(panel, catalogPanel ?? anchor);

  const stillCurrent = (request: number): boolean =>
    request === generation && pageDocument === document && panel.isConnected &&
    anchor.isConnected && document.querySelector(ANCHOR_SELECTOR) === anchor &&
    window.location.pathname === currentPath &&
    ppEntityIdFromUrl(window.location.href) === entityId;
  const onDraftChange = (): void => {
    generation += 1;
    scanButton.disabled = false;
    output.textContent = '';
    status.textContent = 'The draft changed. Scan again to refresh the snapshot.';
  };
  const scan = async (): Promise<void> => {
    const request = ++generation;
    scanButton.disabled = true;
    output.textContent = '';
    status.textContent = 'Reading the current unsaved Magento draft…';
    try {
      const payload: ScanPpDraftRequest = { type: 'SCAN_PP_DRAFT' };
      const response: unknown = await chrome.runtime.sendMessage(payload);
      if (!stillCurrent(request)) return;
      if (!isScanResponse(response) || response.entityId !== entityId || response.routePath !== routePath) {
        status.textContent = 'The scan response was invalid or the page identity changed. Scan again.';
        return;
      }
      if (response.status === 'unavailable') {
        status.textContent = response.warnings.join(' ') || 'The Magento draft is unavailable for scanning.';
        details.open = false;
        return;
      }
      status.textContent = `${response.status}: snapshot of Magento entity ${entityId}. Item parent values remain raw; no Notion or location assignment is inferred.`;
      output.textContent = JSON.stringify(response, null, 2);
      details.open = true;
    } catch {
      if (!stillCurrent(request)) return;
      status.textContent = 'The scan could not complete. Retry after Magento has finished loading.';
    } finally {
      if (stillCurrent(request)) scanButton.disabled = false;
    }
  };
  const onClick = (): void => { void scan(); };
  scanButton.addEventListener('click', onClick);
  anchor.addEventListener('input', onDraftChange, true);
  anchor.addEventListener('change', onDraftChange, true);

  mounted = {
    panel,
    anchor,
    host,
    entityId,
    destroy: () => {
      generation += 1;
      scanButton.removeEventListener('click', onClick);
      anchor.removeEventListener('input', onDraftChange, true);
      anchor.removeEventListener('change', onDraftChange, true);
      panel.remove();
    },
  };
}
