// Collapsible admin sidebar (operator request, 2026-10-20): a fixed chevron
// on the nav's right edge hides/shows Magento's left admin menu so the grid
// gets the width back.
//
// How it stays safe (display-only, like the other page-UI replacements):
// - Hiding flips `display` of the nav, of the RAIL COLUMN around it (the
//   container that paints the left band â€” logo plus background, which is not
//   the `<nav>` itself; leaving it up is what kept a grey strip on screen),
//   and TEMPORARILY zeroes the content offset that reserves space for the rail.
//   Nothing is hardcoded: the rail is the chain of ancestors that share the
//   nav's left edge (Â±8px) and are about the same width (Â±96px), and the
//   offset is whatever computed margin-left / padding-left actually holds the
//   content aside. Every previous inline value is restored exactly on expand.
// - Only a residual offset larger than a normal content gutter (> 24px) is
//   treated as rail space, so ordinary padding is never zeroed.
// - No request is made, no form state touched; the nav's links keep working
//   when shown. Choice persists per origin in localStorage (same pattern as
//   the category-tree view prefs).
// - Gated on the nav actually existing (`nav.admin__menu, #menu`), so the
//   toggle never appears on storefront pages matched by the content script.
// - Idempotent: the button is id'd, so the debounced re-scan and AJAX
//   reloads cannot stack copies; each scan just re-syncs position/state.

import { ensureUi } from '../ui';

const BTN_ID = 'mhx-nav-toggle';
const STYLE_ID = 'mhx-nav-toggle-styles';
const HIDDEN_CLASS = 'mhx-nav-hidden';
const PREF_KEY = 'mhx.nav.collapsed.v1';

const NAV_SEL =
  'nav.admin__menu, #menu, .admin__menu, nav[aria-label="Main Menu"], [role="navigation"]';

// Containers Magento offsets to reserve room for the fixed nav. Only
// elements whose computed margin-left > 0 are touched, and only for the
// duration of the collapse.
// NOTE: These selectors are deliberately broad so they work across Magento
// admin themes. We never rely on class names alone â€” we check computed
// margin-left > 0 at runtime before zeroing anything.
const OFFSET_SEL =
  '.page-main, .page-wrapper, #page-wrapper, .admin__header, main, body, ' +
  '#html-body, [class*="wrapper"], [class*="content"], [role="main"]';

/** Inline values captured on collapse, restored exactly on expand. */
interface SavedInline {
  el: HTMLElement;
  prop: string;
  value: string;
}
let saved: SavedInline[] | null = null;
let resizeBound = false;
/** Whether the rail column was found in this collapse (retried on later scans). */
let railsSettled = false;

/** An offset this large is rail space, not a content gutter. */
const RESIDUAL_MIN = 24;

function hideRail(nav: HTMLElement, capture: SavedInline[]): number {
  // A hidden nav reports a 0x0 rect, so measure the nav when it still has a
  // box and fall back to its parent (the rail itself) otherwise. Without this
  // the very first scan of a persisted-collapsed page found no rail at all.
  const navRect = nav.getBoundingClientRect();
  const base =
    navRect.width > 0
      ? navRect
      : (nav.parentElement?.getBoundingClientRect() ?? navRect);
  if (base.width <= 0) return 0;
  // Rail columns are narrow; content wrappers are not. Bounds are generous so
  // a rail never fails the test just because the nav is narrower than it.
  const maxRail = Math.min(260, Math.max(120, base.width * 2 + 60));
  let railWidth = 0;
  let el: HTMLElement | null = nav.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const rect = el.getBoundingClientRect();
    const sameLeft = Math.abs(rect.left - base.left) <= 8;
    const nearWidth = rect.width > 0 && rect.width <= maxRail;
    const tallEnough = rect.height >= Math.max(40, base.height * 0.5);
    if (!sameLeft || !nearWidth || !tallEnough) break;
    if (el.style.getPropertyValue('display') !== 'none') {
      capture.push({
        el,
        prop: 'display',
        value: el.style.getPropertyValue('display'),
      });
      el.style.setProperty('display', 'none', 'important');
    }
    railWidth = Math.max(railWidth, rect.width);
    el = el.parentElement;
  }
  return railWidth;
}

const ICON_LEFT =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
const ICON_RIGHT =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

function navEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(NAV_SEL);
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writePref(collapsed: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, collapsed ? '1' : '0');
  } catch {
    /* storage blocked â€” state stays session-local */
  }
}

/** Hide/show the rail + zero/restore the measured content offset. */
function setHidden(hidden: boolean): void {
  if (hidden) {
    if (saved) {
      document.body.classList.add(HIDDEN_CLASS);
      return;
    }
    const capture: SavedInline[] = [];
    const remember = (el: HTMLElement, prop: string): void => {
      capture.push({ el, prop, value: el.style.getPropertyValue(prop) });
    };

    // 1. The rail column itself, not just the <nav> inside it. Measured
    //    BEFORE the body class goes on: that class hides the nav, and a
    //    hidden element reports a 0x0 rect, which made every rail test fail.
    const nav = navEl();
    const measuredRail = nav ? hideRail(nav, capture) : 0;
    const railWidth =
      measuredRail > 0
        ? measuredRail
        : (nav?.getBoundingClientRect().width ?? 0);
    railsSettled = measuredRail > 0;

    // 2. Whatever margin reserved the rail's width.
    const contentEls = document.querySelectorAll<HTMLElement>(OFFSET_SEL);
    for (const el of contentEls) {
      const ml = getComputedStyle(el).marginLeft;
      if (ml && ml !== '0px' && parseFloat(ml) > 0) {
        remember(el, 'margin-left');
        el.style.setProperty('margin-left', '0', 'important');
      }
    }

    // 3. Any inset left over (themes that reserve the band with padding, where
    //    the wrapper's own box still starts at 0 so its rect says nothing).
    //    Zeroed only when the padding is the rail's width or exactly the space
    //    the content is still pushed aside by â€” a normal content gutter stays.
    const content =
      document.querySelector<HTMLElement>('.page-wrapper, .page-main, main') ??
      document.body;
    const residual = content.getBoundingClientRect().left;
    document.querySelectorAll<HTMLElement>(OFFSET_SEL).forEach((el) => {
      const pl = parseFloat(getComputedStyle(el).paddingLeft);
      if (!(pl > 0)) return;
      const reservesRail = railWidth > 4 && pl >= railWidth - 4;
      const matchesResidual = residual > RESIDUAL_MIN && pl >= residual - 4;
      if (!reservesRail && !matchesResidual) return;
      remember(el, 'padding-left');
      el.style.setProperty('padding-left', '0', 'important');
    });

    saved = capture;
    document.body.classList.add(HIDDEN_CLASS);
    return;
  }
  if (saved) {
    for (const { el, prop, value } of saved) {
      if (value) el.style.setProperty(prop, value);
      else el.style.removeProperty(prop);
    }
    saved = null;
  }
  railsSettled = false;
  document.body.classList.remove(HIDDEN_CLASS);
}


/** Arrow, label and edge position follow the current state. */
function syncPosition(btn: HTMLButtonElement): void {
  const hidden = document.body.classList.contains(HIDDEN_CLASS);
  const nav = navEl();
  btn.style.left = hidden || !nav ? '0px' : `${nav.offsetWidth}px`;
  btn.innerHTML = hidden ? ICON_RIGHT : ICON_LEFT;
  const label = hidden ? 'Show admin menu' : 'Hide admin menu';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
}

function injectStyles(): void {
  // The chevron's box and colours come from the toolkit's `.mhx-toggle`
  // primitive (one page-adaptive sheet); this local sheet carries only the
  // collapse layout rules â€” feature behaviour, not presentation.
  ensureUi();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = NAV_LAYOUT_STYLES;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Add the sidebar toggle (admin pages only â€” returns silently elsewhere).
 * Idempotent; re-syncs persisted state on every debounced scan.
 */
export function enhanceAdminNavToggle(): void {
  if (!document.body) return;
  const nav = navEl();
  if (!nav) return; // Storefront / non-admin page: no toggle, ever.

  injectStyles();

  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'mhx-toggle'; // box + colours: the toolkit primitive
    btn.addEventListener('click', () => {
      const next = !document.body.classList.contains(HIDDEN_CLASS);
      setHidden(next);
      writePref(next);
      const current = document.getElementById(
        BTN_ID,
      ) as HTMLButtonElement | null;
      if (current) syncPosition(current);
    });
    document.body.appendChild(btn);
  }

  // Apply the persisted choice idempotently (fresh load, or another
  // scan changed nothing).
  const wantHidden = readPref();
  if (wantHidden !== document.body.classList.contains(HIDDEN_CLASS)) {
    setHidden(wantHidden);
  }

  // Self-healing: a collapse that ran before layout settled (fresh load of a
  // persisted-collapsed page) may not have found the rail column. Retry on
  // every scan until it does, so no grey band can survive a reload.
  if (!railsSettled && saved && document.body.classList.contains(HIDDEN_CLASS)) {
    const nav = navEl();
    if (nav) {
      const extra: SavedInline[] = [];
      if (hideRail(nav, extra) > 0) {
        saved.push(...extra);
        railsSettled = true;
      }
    }
  }
  syncPosition(btn);

  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', () => {
      const current = document.getElementById(
        BTN_ID,
      ) as HTMLButtonElement | null;
      if (current) syncPosition(current);
    });
  }
}

// Collapse layout rules only (feature behaviour). The chevron's own look â€”
// box, border, hover, focus â€” is the toolkit's `.mhx-toggle` primitive.
const NAV_LAYOUT_STYLES = `
/* Chevron box/colours: the toolkit's mhx-toggle primitive (src/ui/toolkit.css) */


/* Make every element use border-box so zeroing offsets never causes overflow */
body.mhx-nav-hidden,
body.mhx-nav-hidden * {
  box-sizing: border-box;
}
/* Hide the nav AND the rail column (left band with logo/background) */
body.mhx-nav-hidden nav.admin__menu,
body.mhx-nav-hidden #menu,
body.mhx-nav-hidden .admin__menu,
body.mhx-nav-hidden [role="navigation"],
body.mhx-nav-hidden nav[aria-label="Main Menu"],
body.mhx-nav-hidden DIV.menu-wrapper._fixed,
body.mhx-nav-hidden [class*="menu-wrapper"] {
  display: none !important;
}
/* F14 fix: the blanket margin/padding zeroing rule was removed.
   The JS setHidden() path measures and restores each element's inline
   offset individually, so a CSS !important override is redundant and
   can fight an admin theme's own layout. The body gutter below is kept
   because it applies once on a single element (no compounding). */
/* A small breathing gutter on the left and right once the rail is gone.
   Applied once on <body> so nested wrappers cannot compound the padding,
   and border-box keeps the total width equal to the viewport (no h-scroll). */
body.mhx-nav-hidden {
  margin: 0 !important;
  padding: 0 30px !important; /* @content__indent: 30px */
  overflow-x: hidden !important;
}
html:has(> body.mhx-nav-hidden) {
  overflow-x: hidden !important;
}
`;
