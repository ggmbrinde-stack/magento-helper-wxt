// Magento's own Save control is pressed from the page's main world so its handlers,
// validation, redirect and messages all run exactly as if the operator clicked it.
//
// These functions are injected with `chrome.scripting.executeScript`, which serialises
// the function alone: no imports, no module-level constants, no references outside the
// body. A module constant here fails as an undefined name in the live page.
import type { PpSortCapture, ScanPpDraftResponse } from '../../../core/messages';

export interface PpSavePress { clicked: boolean; label: string; reason: string }
export interface PpSaveOutcome { success: string[]; errors: string[] }

/** Keep only the row fields needed to compare Sort before and after Save. */
export function ppSortCapture(snapshot: ScanPpDraftResponse | null | undefined, at: number): PpSortCapture {
  const available = !!snapshot && ['ok', 'partial'].includes(snapshot.status) &&
    snapshot.locations.state === 'available' && snapshot.items.state === 'available';
  const capture: PpSortCapture = { at, available, truncated: !!snapshot &&
    (snapshot.locations.truncated || snapshot.items.truncated), rows: [] };
  if (!available || !snapshot) return capture;
  const text = (value: unknown): string => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  const name = (value: unknown): string => {
    if (typeof value === 'string' && value.trim().startsWith('{')) {
      try { value = JSON.parse(value); } catch { return ''; }
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const names = value as Record<string, unknown>;
      return text(names['1']) || Object.values(names).map(text).find(Boolean) || '';
    }
    return text(value);
  };
  const faces = new Map(snapshot.locations.rows.map(row => [text(row.values.key_id),
    name(row.translations?.name?.parsed ?? row.values.name)]));
  const catalogue = new Map((snapshot.catalogue ?? []).map(row => [row.id, row.label]));
  capture.rows = snapshot.items.rows.map(row => {
    const catalogueId = text(row.values.name_option ?? row.values.name);
    return {
      face: faces.get(text(row.values.parent)) || '(unresolved face)',
      name: text(snapshot.itemLabels?.[text(row.values.record_id) || String(row.position)]) || catalogue.get(catalogueId) || '',
      catalogueId, sort: text(row.values.sort),
    };
  });
  return capture;
}

export function pressPpSave(): PpSavePress {
  const selectors = [
    '#save',
    'button[data-ui-id="page-actions-buttons-save"]',
    '[data-action="save"]',
    '.page-actions-buttons button[type="submit"]',
  ];
  const plain = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const ignored = (node: Element): boolean => !!node.closest('.modal-popup, .modal-slide, .admin__modal');
  const isContinue = (node: Element): boolean =>
    /save[_ -]?and[_ -]?continue/i.test(`${node.id} ${node.getAttribute('data-action') ?? ''} ${node.getAttribute('data-ui-id') ?? ''}`);
  let button: HTMLElement | null = null;
  for (const selector of selectors) {
    const found = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find(node => !ignored(node) && !isContinue(node));
    if (found) { button = found; break; }
  }
  if (!button) return { clicked: false, label: '', reason: 'Magento Save was not found on this page. Nothing was pressed.' };
  const disabled = (button as HTMLButtonElement).disabled === true || button.getAttribute('aria-disabled') === 'true';
  if (disabled) return { clicked: false, label: '', reason: 'Magento Save is disabled. Fix the form validation first; nothing was pressed.' };
  const label = plain(button.textContent) || 'Save';
  button.click();
  return { clicked: true, label: label.slice(0, 40), reason: '' };
}

/** The page key for one row: the face label normalised the same way the apply lane does. */
export function ppItemPair(magentoFace: unknown, catalogueId: unknown): string {
  const key = String(magentoFace ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join('');
  return `${key}|${String(catalogueId ?? '').trim()}`;
}

/**
 * Read the face and catalogue pairs that are in the form now, one entry per row. A reloaded or
 * edited helper tab drops the added rows, and this is how the save lane notices before pressing
 * Save. A repeated pair is reported as often as it appears, so one copy is never read as two.
 */
export function readPpItemPairs(): string[] {
  const plain = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
  const key = (value: unknown): string => plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .trim().split(' ').sort().join('');
  const pairs: string[] = [];
  for (const node of Array.from(document.querySelectorAll('select[name*="[sub_options_items]"][name*="[parent]"]'))) {
    const select = node as HTMLSelectElement;
    const row = select.closest ? select.closest('tr') : null;
    const option = row ? row.querySelector<HTMLSelectElement>('select[name*="[name_option]"]') : null;
    if (!row || !option) continue;
    const id = String(option.value ?? '').trim();
    if (!/^[1-9]\d{0,15}$/.test(id)) continue;
    pairs.push(`${key(select.options[select.selectedIndex]?.text)}|${id}`);
  }
  return pairs;
}

export function readPpSaveOutcome(): PpSaveOutcome {
  const plain = (node: Element): string => String(node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
  const collect = (selector: string, limit: number): string[] => {
    const out: string[] = [];
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (node.closest('#mhx-pp-catalog, #mhx-pp-draft-scan')) continue;
      const value = plain(node);
      if (value && out.indexOf(value) === -1) out.push(value);
      if (out.length >= limit) break;
    }
    return out;
  };
  return {
    success: collect('.message-success, [data-ui-id="messages-message-success"]', 3),
    errors: collect('.message-error, [data-ui-id="messages-message-error"], .admin__field-error, .validation-advice', 5),
  };
}
