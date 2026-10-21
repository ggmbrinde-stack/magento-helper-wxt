// The toolkit entry point: one stylesheet per page, delivered "like a CDN".
//
// Delivery (UI-TOOLKIT.md §3, option A with B as fallback):
//   A. a <link> to public/ui/toolkit.css served by the extension
//      (web_accessible_resources) — one fetch, browser-cached across admin
//      pages and tabs, and CSS does not inflate the content bundle.
//   B. an inline <style id="mhx-ui"> copy (src/ui/toolkitCss.ts, generated)
//      used when the extension URL is unavailable — enterprise CSP setups,
//      fixtures without a chrome runtime, or a link that failed to load.
//
// Either way there is exactly ONE toolkit sheet per page, plus at most one
// theme overlay from lib/magentoTheme.ts. Features call `ensureUi()` before
// drawing anything; it is idempotent, so every feature can call it and the
// first call wins.

import { TOOLKIT_CSS } from './toolkitCss';

const LINK_ID = 'mhx-ui-link';
const STYLE_ID = 'mhx-ui';

/** chrome.runtime.getURL, or null outside an extension context (fixtures). */
function toolkitUrl(): string | null {
  try {
    const runtime = (
      globalThis as typeof globalThis & {
        chrome?: { runtime?: { getURL?: (path: string) => string } };
      }
    ).chrome?.runtime;
    if (!runtime?.getURL) return null;
    return runtime.getURL('ui/toolkit.css');
  } catch {
    // Extension context invalidated (reload mid-flight): fall back to inline.
    return null;
  }
}

function injectInline(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = TOOLKIT_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Make sure the one toolkit stylesheet is on the page. Synchronous start
 * (the sheet exists in the DOM before this returns), asynchronous ready —
 * callers draw on the next scan/mutation, by which time either delivery path
 * has resolved.
 */
export function ensureUi(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID) || document.getElementById(LINK_ID)) {
    return;
  }

  const href = toolkitUrl();
  if (!href) {
    injectInline();
    return;
  }

  const link = document.createElement('link');
  link.id = LINK_ID;
  link.rel = 'stylesheet';
  link.href = href;

  let settled = false;
  const useFallback = (): void => {
    if (settled) return;
    settled = true;
    link.remove();
    injectInline();
  };
  // A stylesheet that fails to load fires `error`; one that "loads" but has
  // no sheet (blocked, emptied) is just as absent, so both end inline.
  link.addEventListener('error', useFallback);
  link.addEventListener('load', () => {
    if (settled) return;
    if (link.sheet) settled = true;
    else useFallback();
  });

  (document.head ?? document.documentElement).appendChild(link);
}

// Deliberately NOT re-exporting ./tokens: those helpers need the extension's
// storage APIs, and keeping them out of this entry means a pure-DOM feature
// (or a fixture bundle) can import `ensureUi`/factories without pulling
// `wxt/browser` in. Import `../ui/tokens` directly when storage is needed.
export { bar, badge, button, chip, group, popover, segmented } from './components';
export type {
  ButtonOptions,
  ButtonVariant,
  ChipOptions,
  GroupOptions,
  SegmentedOption,
  SegmentedOptions,
} from './components';
