// Collapsible system-messages bar (operator request, 2026-10-22).
//
// Same contract as the sidebar toggle (lib/adminNavToggle.ts):
// - One fixed tab on the page edge flips the band's display, and the tab stays
//   reachable while the band is hidden, so it can always be brought back.
// - Display-only. Magento's message elements are never removed: the band's own
//   inline `display` is remembered and restored, so closing a message, AJAX
//   message updates and the notifications counter keep working exactly as
//   before. Nothing is written and no request is made.
// - The choice persists per origin in localStorage, and the tab re-syncs on
//   every debounced scan, so an AJAX reload cannot leave the page in a state
//   the operator did not pick.
//
// Edge alignment: Magento paints the messages band across the whole window
// while everything else sits in the content column — most obvious once the
// admin nav is collapsed, when the content gutter is ours. The band is
// measured against the page's content column and inset/outset by the delta, so
// both its sides line up with the rest of the page (deltas, not fixed values:
// the page can be at any width, and a theme may already have it right).

import { ensureUi } from '../ui';

const BTN_ID = 'mhx-messages-toggle';
const HIDDEN_ATTR = 'data-mhx-messages-hidden';
const PREV_DISPLAY_ATTR = 'data-mhx-messages-prev-display';
const PREF_KEY = 'mhx.messages.hidden.v1';

/** A band is the messages block that actually carries a message. */
const BAND_SEL = '#messages, .messages, .page.messages, #system_messages, .message-system';
const MESSAGE_SEL =
  '.message, .message-error, .message-warning, .message-notice, .message-success';
/** The column the rest of the page uses — what the band has to match. */
const CONTENT_SEL = '.page-main, .page-content, main';
/** Only a difference this large is treated as a misalignment. */
const MIN_DELTA = 2;
const MAX_ADJUST = 400;
const TAB_HEIGHT = 40;

const ICON_UP =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const ICON_DOWN =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

let listenersBound = false;
/** Adjustments spent on a band. A page whose layout ignores the margin (a
 *  fixed/absolutely placed band) would otherwise grow it on every scan. */
const adjustments = new WeakMap<HTMLElement, number>();

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writePref(hidden: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, hidden ? '1' : '0');
  } catch {
    /* storage blocked — state stays session-local */
  }
}

/**
 * The element to hide and align: the messages block, climbed to the outermost
 * wrapper that only wraps this band (Magento nests `#messages` in a plain
 * `<div>`; hiding only the inner one leaves the yellow strip behind).
 */
function bandEl(): HTMLElement | null {
  const block = Array.from(document.querySelectorAll<HTMLElement>(BAND_SEL)).find(
    (el) => Boolean(el.querySelector(MESSAGE_SEL)),
  );
  if (!block) return null;

  let band = block;
  for (let hops = 0; hops < 4; hops += 1) {
    const parent = band.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) {
      break;
    }
    // Never climb into something that also holds the page itself.
    if (parent.querySelector(`${CONTENT_SEL}, table, .data-grid`)) break;
    // Only climb through wrappers that exist solely to wrap this band — a
    // parent with siblings would take the rest of the page down with it.
    if (parent.children.length !== 1) break;
    const own = band.getBoundingClientRect();
    const outer = parent.getBoundingClientRect();
    if (outer.width < own.width - 1) break;
    if (outer.height > own.height + 120) break;
    band = parent;
  }
  return band;
}

/**
 * Line the band up with the content column. Works on the band's own margins
 * and compares against live geometry, so it corrects itself (and never
 * accumulates) on later scans, width changes or a nav collapse.
 */
function alignBand(band: HTMLElement, content: HTMLElement): void {
  const b = band.getBoundingClientRect();
  const c = content.getBoundingClientRect();
  if (b.width <= 0 || c.width <= 0) return;

  const left = Math.max(-MAX_ADJUST, Math.min(MAX_ADJUST, c.left - b.left));
  const right = Math.max(-MAX_ADJUST, Math.min(MAX_ADJUST, b.right - c.right));
  const offLeft = Math.abs(left) > MIN_DELTA;
  const offRight = Math.abs(right) > MIN_DELTA;
  if (!offLeft && !offRight) {
    adjustments.delete(band);
    return;
  }

  const tried = adjustments.get(band) ?? 0;
  if (tried >= 3) return;
  adjustments.set(band, tried + 1);

  const current = getComputedStyle(band);
  if (offLeft) {
    const next = (parseFloat(current.marginLeft) || 0) + left;
    band.style.marginLeft = `${Math.round(next)}px`;
  }
  if (offRight) {
    // Positive margin-right pulls the band's right edge in (an auto-width
    // block shrinks by exactly that much).
    const next = (parseFloat(current.marginRight) || 0) + right;
    band.style.marginRight = `${Math.round(next)}px`;
  }
}

/** Hide or show the band, remembering whatever Magento had inline. */
function setHidden(hidden: boolean): void {
  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>(`[${HIDDEN_ATTR}]`),
  )) {
    const prev = el.getAttribute(PREV_DISPLAY_ATTR) ?? '';
    if (prev) el.style.display = prev;
    else el.style.removeProperty('display');
    el.removeAttribute(HIDDEN_ATTR);
    el.removeAttribute(PREV_DISPLAY_ATTR);
  }
  if (!hidden) return;

  const band = bandEl();
  if (!band) return;
  band.setAttribute(PREV_DISPLAY_ATTR, band.style.display);
  band.setAttribute(HIDDEN_ATTR, '1');
  // Magento's own sheet sets a display for the band; the inline hide must
  // outrank it or the strip stays painted.
  band.style.setProperty('display', 'none', 'important');
}

/** True when a band is hidden right now, whoever hid it (us or Magento). */
function isBandHidden(band: HTMLElement): boolean {
  if (band.getAttribute(HIDDEN_ATTR) === '1') return true;
  return getComputedStyle(band).display === 'none';
}

/**
 * Tab position, arrow and label follow the band and the stored choice.
 */
function syncTab(btn: HTMLButtonElement): void {
  const band = bandEl();
  // Follow what is on screen when there is a band. The stored preference can
  // disagree (Magento re-rendered the band after the pref was written), and
  // trusting it made the arrow point the wrong way and the next click a no-op.
  const hidden = band ? isBandHidden(band) : readPref();

  // The tab hangs on the page's right edge (the left edge belongs to the
  // admin-nav chevron). While the band is up it rides its vertical centre;
  // otherwise it parks at the top so it is always findable.
  let top = 0;
  if (!hidden && band) {
    const rect = band.getBoundingClientRect();
    if (rect.height > 0) {
      top = Math.max(0, rect.top + rect.height / 2 - TAB_HEIGHT / 2);
    }
  }
  btn.style.top = `${Math.round(top)}px`;
  // Rewrite the arrow ONLY when the state flips. This used to run on every
  // scan and scroll, and replacing the SVG mid-click destroyed the click
  // target on busy admin pages (operator report: "the arrow doesn't work").
  if (btn.dataset['state'] !== String(hidden)) {
    btn.dataset['state'] = String(hidden);
    btn.innerHTML = hidden ? ICON_DOWN : ICON_UP;
  }

  const label = hidden ? 'Show system messages' : 'Hide system messages';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
}

/**
 * Add the messages collapse tab, restore a stored choice and keep the band
 * aligned with the content column. Idempotent; safe on every scan.
 */
export function enhanceMessagesToggle(): void {
  if (!document.body) return;
  const band = bandEl();
  if (!band) {
    // A page without messages keeps a parked tab only if the operator hid the
    // band before a reload — never invent a control on a clean page.
    if (!readPref()) return;
  }

  // The tab's box, colours and horizontal shape are the toolkit's
  // `.mhx-toggle` / `--h` primitive — this file draws nothing itself.
  ensureUi();

  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    // `.mhx-toggle` for the box/colours, `--h` for the horizontal handle.
    btn.className = 'mhx-toggle mhx-toggle--h';
    btn.addEventListener('click', () => {
      // Follow the band on screen, not just the stored preference: when they
      // disagree (a re-rendered band, another feature showing messages) the
      // pref-based toggle made the first click do nothing visible.
      const band = bandEl();
      const hidden = band ? isBandHidden(band) : readPref();
      const next = !hidden;
      writePref(next);
      setHidden(next);
      const current = document.getElementById(
        BTN_ID,
      ) as HTMLButtonElement | null;
      if (current) syncTab(current);
    });
    document.body.appendChild(btn);
  }

  const wantHidden = readPref();
  setHidden(wantHidden);

  if (!wantHidden) {
    const content = document.querySelector<HTMLElement>(CONTENT_SEL);
    const current = bandEl();
    if (content && current) alignBand(current, content);
  }

  syncTab(btn);

  if (!listenersBound) {
    listenersBound = true;
    const resync = (): void => {
      const current = document.getElementById(
        BTN_ID,
      ) as HTMLButtonElement | null;
      if (current) syncTab(current);
    };
    // Passive, cheap: the tab rides the band, which moves with scroll and
    // reflows with any window change.
    window.addEventListener('scroll', resync, { passive: true });
    window.addEventListener('resize', resync, { passive: true });
  }
}

// Nothing visual is written here: the handle is the toolkit's
// `.mhx-toggle--h`, and the band is the page's own element (only its inline
// display and margins are touched, and both are restored).
