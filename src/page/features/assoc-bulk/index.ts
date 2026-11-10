// Content-side panel for "paste SKUs, they get selected".
//
// The heavy work runs in the page world (where `ko` lives) via
// `SELECT_ASSOCIATED_SKUS` → background → `chrome.scripting.executeScript` →
// the injected function in `page.ts`. This file is only the panel, the
// per-SKU progress watcher, and the message round-trip. It is idempotent, so
// the debounced re-scan keeps it mounted across the modal's AJAX reloads.
//
// Nothing is saved by this code; the operator still presses Done (or Cancel)
// in the modal.

import { button } from '../../../ui';

const PANEL_ATTR = 'data-mhx-assoc-bulk-panel';
const STATUS_ATTR = 'data-mhx-assoc-bulk-status';
const PROGRESS_EVENT = 'mhx-assoc-bulk-progress';
const CANCEL_ATTR = 'data-mhx-assoc-bulk-cancel';

/** The modal is an `aside` whose class carries the UI component name. */
const MODAL_SELECTOR =
  'aside[class*="associated_product_modal"], [id*="associated_product_modal"]';

// The text the operator last typed, so a re-mount from an AJAX grid refresh
// does not throw their draft away.
let lastValue = '';

// True while the page-world run is in flight. Shared so a panel remounted by
// the grid's own re-render still shows the run as busy, and so Stop is only
// offered when there is something to stop.
let running = false;

// Shared style block, injected once per page.
let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'mhx-assoc-bulk-styles';
  style.textContent = `
    .mhx-assoc-bulk-panel{
      display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;
      margin:8px 0;padding:8px 10px;box-sizing:border-box;
      border:1px solid var(--mhx-border-2,#c6c6c6);border-radius:6px;
      background:var(--mhx-surface,#fff);
    }
    .mhx-assoc-bulk-field{display:flex;flex-direction:column;gap:4px;}
    .mhx-assoc-bulk-actions{display:flex;gap:6px;align-items:center;}
    .mhx-assoc-bulk-field label{font-size:11px;color:var(--mhx-ink-2,#3a3a3a);font-weight:600;letter-spacing:.02em;text-transform:uppercase;}
    textarea.mhx-assoc-bulk-input{
      width:260px;height:54px;font:inherit;color:var(--mhx-ink,#222);
      background:var(--mhx-surface,#fff);border:1px solid var(--mhx-border-2,#c6c6c6);
      border-radius:6px;padding:6px 8px;resize:vertical;line-height:1.35;
      font-family:inherit;font-size:13px;
    }
    textarea.mhx-assoc-bulk-input:focus{
      outline:none;border-color:var(--mhx-accent,var(--mhx-pg-accent,#3761d8));
      box-shadow:0 0 0 3px var(--mhx-on-accent,#eae4ff);
    }
    [${STATUS_ATTR}]{font-size:12px;color:var(--mhx-muted,#6b6b6b);line-height:1.4;flex:1 1 220px;min-width:180px;white-space:normal;}
    [${STATUS_ATTR}][data-tone="ok"]{color:var(--mhx-pg-ok,#1c7a3c);}
    [${STATUS_ATTR}][data-tone="warn"]{color:var(--mhx-pg-warn,#b56a00);}
    [${STATUS_ATTR}][data-tone="err"]{color:var(--mhx-pg-danger,#b3261e);}
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

/** Parse the pasted text into unique, case-trimmed SKUs (cap at 100). */
function parseSkus(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const walker = /[ \t\r\n;,|]+/;
  for (const part of raw.split(walker)) {
    const sku = part.trim();
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sku);
  }
  if (out.length > 100) out.length = 100;
  return out;
}

/** Render the panel for one modal. Idempotent per modal. */
function attachToModal(modal: HTMLElement): void {
  // The grid refreshes its own markup; if our panel is still there, do nothing.
  if (modal.querySelector(`[${PANEL_ATTR}]`)) return;
  injectStyles();

  // Stay inside the modal body: the grid header is re-rendered by the listing
  // component and can be collapsed, while the modal body is always visible.
  const host =
    modal.querySelector<HTMLElement>('.modal-content') ??
    modal.querySelector<HTMLElement>('.admin__data-grid-header') ??
    modal.querySelector<HTMLElement>('.modal-inner-wrap') ??
    modal;

  const panel = document.createElement('div');
  panel.className = 'mhx-assoc-bulk-panel';
  panel.setAttribute(PANEL_ATTR, '1');

  const field = document.createElement('div');
  field.className = 'mhx-assoc-bulk-field';
  const label = document.createElement('label');
  label.textContent = 'Bulk select SKUs';
  const textarea = document.createElement('textarea');
  textarea.className = 'mhx-assoc-bulk-input';
  textarea.placeholder = 'RPO6640645\nANOTHER-SKU';
  textarea.rows = 3;
  textarea.value = lastValue;
  textarea.addEventListener('input', () => {
    lastValue = textarea.value;
  });
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void run(panel);
    }
  });
  field.appendChild(label);
  field.appendChild(textarea);

  const status = document.createElement('div');
  status.className = 'mhx-assoc-bulk-status';
  status.setAttribute(STATUS_ATTR, '1');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.textContent = 'Paste SKUs, then select them.';

  const actions = document.createElement('div');
  actions.className = 'mhx-assoc-bulk-actions';
  const runBtn = button({
    label: 'Select SKUs',
    title: 'Resolve pasted SKUs and tick them on screen',
    onClick: () => {
      void run(panel);
    },
  });
  runBtn.setAttribute('data-mhx-btn', '1');
  runBtn.disabled = false;
  actions.appendChild(runBtn);

  const stopBtn = button({
    label: 'Stop',
    title: 'Stop after the current SKU and leave the selection unchanged',
    onClick: () => {
      // The page-world function cannot see this module's variables, so the
      // signal travels as an attribute on the document element.
      document.documentElement.setAttribute(CANCEL_ATTR, '1');
      const statusEl = panel.querySelector(`div[${STATUS_ATTR}]`);
      if (statusEl instanceof HTMLElement) {
        setStatus(statusEl, 'Stopping after the current SKU…', 'warn');
      }
    },
  });
  stopBtn.setAttribute('data-mhx-stop', '1');
  stopBtn.disabled = true;
  actions.appendChild(stopBtn);

  panel.appendChild(field);
  panel.appendChild(actions);
  panel.appendChild(status);

  host.insertBefore(panel, host.firstChild);

  // A grid re-render can re-mount this panel mid-run; keep its controls honest.
  setRunningState(panel, running);
}

function setStatus(el: HTMLElement, text: string, tone?: 'ok' | 'warn' | 'err'): void {
  el.textContent = text;
  el.removeAttribute('data-tone');
  if (tone) el.setAttribute('data-tone', tone);
}

/** Reflect the shared run state on one panel's buttons. */
function setRunningState(panel: HTMLElement, on: boolean): void {
  const runBtn = panel.querySelector('button[data-mhx-btn]');
  if (runBtn instanceof HTMLButtonElement) runBtn.disabled = on;
  const stopBtn = panel.querySelector('button[data-mhx-stop]');
  if (stopBtn instanceof HTMLButtonElement) stopBtn.disabled = !on;
}

/** Every panel, including ones re-mounted by the grid mid-run. */
function setAllPanelsRunning(on: boolean): void {
  running = on;
  const panels: NodeListOf<HTMLElement> = document.querySelectorAll(`[${PANEL_ATTR}]`);
  panels.forEach((panel) => setRunningState(panel, on));
  if (on) {
    // Clear any stale "stop" from a previous run before the new one starts.
    document.documentElement.setAttribute(CANCEL_ATTR, '0');
  } else {
    document.documentElement.removeAttribute(CANCEL_ATTR);
  }
}

// ---- progress listener (one per tab) --------------------------------------
let progressBound = false;
function attachProgress(): void {
  if (progressBound) return;
  progressBound = true;
  document.addEventListener(PROGRESS_EVENT, (event) => {
    try {
      const detail = (event as CustomEvent).detail;
      if (typeof detail !== 'string') return;
      const parsed: { done?: number; total?: number; sku?: string } =
        JSON.parse(detail);
      if (!parsed.done || !parsed.total) return;
      // Do not overwrite the "Stopping..." line while the page finishes up.
      if (document.documentElement.getAttribute(CANCEL_ATTR) === '1') return;
      const targets = document.querySelectorAll(
        `div[${STATUS_ATTR}]`,
      ) as NodeListOf<HTMLElement>;
      if (targets.length === 0) return;
      const tone: 'ok' | 'warn' | 'err' = 'ok';
      try {
        // Several associated-product modals can sit in the DOM; write to the
        // one the operator is actually looking at.
        let target: HTMLElement | null = null;
        for (let i = 0; i < targets.length; i += 1) {
          const candidate = targets[i];
          if (candidate && candidate.getClientRects().length > 0) {
            target = candidate;
            break;
          }
        }
        if (!target) target = targets[0] ?? null;
        if (target) {
          setStatus(target, `Resolving ${parsed.sku}…  (${parsed.done} of ${parsed.total})`, tone);
        }
      } catch (err) {
        // Stale targets are normal during re-render; the next tick writes again.
      }
    } catch (err) {
      // Bad JSON from another world must never break the panel.
    }
  });
}

// ---- the clickable run ---------------------------------------------------
async function run(panel: HTMLElement): Promise<void> {
  if (running) return;

  const textareaEl = panel.querySelector('textarea.mhx-assoc-bulk-input');
  const textarea = textareaEl instanceof HTMLTextAreaElement ? textareaEl : null;
  const statusEl = panel.querySelector(`div[${STATUS_ATTR}]`);
  const status = statusEl instanceof HTMLElement ? statusEl : null;

  const skus = parseSkus(textarea?.value ?? '');
  if (skus.length === 0) {
    if (status) setStatus(status, 'Paste at least one SKU first.', 'warn');
    return;
  }
  if (skus.length > 100) lastValue = skus.slice(0, 100).join('\n');

  setAllPanelsRunning(true);
  if (status) {
    setStatus(status, `Resolving ${skus.length} SKU(s)… Press Stop to cancel.`, 'ok');
  }

  try {
    let response:
      | {
          ok?: boolean;
          reason?: string;
          requested?: number;
          found?: number;
          missing?: string[];
          already?: string[];
          cancelled?: boolean;
          added?: number;
          selectedBefore?: number;
          selectedAfter?: number;
          totalSelected?: number | null;
          tickedOnScreen?: number;
          filterPasses?: number;
        }
      | undefined;
    try {
      response = (await chrome.runtime.sendMessage({
        type: 'SELECT_ASSOCIATED_SKUS',
        skus: skus,
      })) as typeof response;
    } catch (err) {
      // Content script injected after settings saved, but maybe not in the
      // background listener yet: treat a silent drop as "did nothing".
      response = { ok: false, reason: 'The background did not answer.' };
    }

    if (!response) {
      if (status) setStatus(status, 'The background did not answer.', 'err');
      return;
    }
    if (!response.ok) {
      if (status) setStatus(status, String(response.reason || 'The run did not start.'), 'err');
      return;
    }

    if (response.cancelled) {
      if (status) {
        setStatus(
          status,
          'Stopped. Nothing was selected and the grid filter was put back.',
          'warn',
        );
      }
      return;
    }

    const total = response.requested ?? skus.length;
    const found = response.found ?? 0;
    const missing = response.missing ?? [];
    const already = response.already ?? [];
    const added = response.added ?? 0;
    const tickedOnScreen = response.tickedOnScreen ?? 0;
    const tb = response.totalSelected;
    const newTotal = Math.max(0, total - already.length);
    const tone: 'ok' | 'warn' | 'err' = missing.length > 0 ? 'warn' : 'ok';
    const lines: string[] = [];

    if (found === 0 && already.length === 0) {
      lines.push('No pasted SKU matched this listing.');
    } else if (added === 0) {
      if (already.length) lines.push(`${already.length} already associated, skipped.`);
      if (found > 0) lines.push('Nothing new to add.');
      if (tb !== null) lines.push(`Header total: ${tb}.`);
    } else {
      lines.push(`Selected ${added} of ${newTotal} new SKU(s).`);
      const offPage = Math.max(0, added - tickedOnScreen);
      if (offPage > 0) {
        lines.push(
          `${offPage} are not on this page, so they have no tick: the header count holds them.`,
        );
      }
      if (tb !== null) lines.push(`Header total: ${tb}.`);
      lines.push('Press Done to apply the selection.');
    }
    if (already.length) lines.push(`Already associated: ${already.join(', ')}.`);
    if (missing.length) lines.push(`Not found: ${missing.join(', ')}.`);
    if (status) setStatus(status, lines.join(' '), tone);

    if (skus.length > 100) {
      if (textarea) textarea.value = skus.slice(0, 100).join('\n');
      lastValue = textarea ? textarea.value : '';
    }
  } finally {
    setAllPanelsRunning(false);
  }
}

/** Exported for the registry; safe to call on any page. */
export function enhanceAssocBulk(): void {
  const modals: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const add = (el: HTMLElement): void => {
    if (seen.has(el)) return;
    seen.add(el);
    modals.push(el);
  };

  document.querySelectorAll<HTMLElement>(MODAL_SELECTOR).forEach(add);

  // Some builds drop the component class from the modal. Match the modal's own
  // heading (not the whole subtree, which would also match its parent).
  document
    .querySelectorAll<HTMLElement>('.modal-slide, .modal-popup, .admin__modal')
    .forEach((el) => {
      const title = el.querySelector('.modal-title');
      if (title && /select associated product/i.test(title.textContent ?? '')) {
        add(el);
      }
    });

  if (modals.length === 0) return;
  attachProgress();
  for (let i = 0; i < modals.length; i += 1) {
    const modal = modals[i];
    if (modal) attachToModal(modal);
  }
}
