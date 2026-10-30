import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';

/**
 * Shared dashboard workspace.
 *
 * Every audit screen used to own its own SKU/URL/language state, so resolving a
 * SKU and then opening Image audit meant pasting it again. The workspace is one
 * store for the subject of the work; a screen reads it, edits it, and the change
 * is visible everywhere - which is also what lets a chain of stages feed the next
 * one without prop-drilling through the shell.
 *
 * Kept in `storage.session`: it survives a dashboard reload, dies with the
 * browser session, and never writes product data to disk.
 */

export const ALL_LANGS = ['EN', 'ES', 'FR'] as const;

export interface Workspace {
  sku: string;
  url: string;
  /** SKU the URL was typed/derived for; a URL never applies to another SKU. */
  urlFor: string;
  langs: string[];
  hashImages: boolean;
  background: boolean;
}

const STORAGE_KEY = 'mhx:dashboard:workspace';

const DEFAULTS: Workspace = {
  sku: '',
  url: '',
  urlFor: '',
  langs: [...ALL_LANGS],
  hashImages: false,
  background: true,
};

let state: Workspace = { ...DEFAULTS };
let hydration: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const listener of subscribers) listener();
}

function sameLangSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((lang) => b.includes(lang));
}

async function persist(): Promise<void> {
  try {
    await browser.storage.session.set({ [STORAGE_KEY]: state });
  } catch {
    // Session storage is best-effort (older Chrome, private windows): the
    // in-memory store still works for this page.
  }
}

export function workspace(): Workspace {
  return state;
}

/**
 * The URL to send as the resolver's `url` override, or undefined.
 *
 * A URL belongs to one SKU. Sending yesterday's SKU's URL for today's SKU made
 * the storefront step fail its own SKU guard and report "storefront resolution
 * failed" for a product that has a perfectly good PDP - so an override that does
 * not match the current SKU is dropped rather than trusted.
 */
export function activeUrl(ws: Workspace = state): string | undefined {
  const url = ws.url.trim();
  if (!url) return undefined;
  const belongs = ws.urlFor.trim().toUpperCase();
  const sku = ws.sku.trim().toUpperCase();
  if (belongs && sku && belongs !== sku) return undefined;
  return url;
}

export function setWorkspace(patch: Partial<Workspace>): void {
  const next = { ...state, ...patch };
  if (
    next.sku === state.sku &&
    next.url === state.url &&
    next.urlFor === state.urlFor &&
    sameLangSet(next.langs, state.langs) &&
    next.hashImages === state.hashImages &&
    next.background === state.background
  ) {
    return;
  }
  state = next;
  notify();
  void persist();
}

/** One shared read of the stored workspace, no matter how many screens mount. */
function hydrate(): Promise<void> {
  if (hydration) return hydration;
  hydration = (async () => {
    try {
      const stored = await browser.storage.session.get(STORAGE_KEY);
      const saved = stored?.[STORAGE_KEY] as Partial<Workspace> | undefined;
      if (saved) {
        state = { ...state, ...saved };
        notify();
      }
    } catch {
      // Nothing stored yet, or session storage unavailable.
    }
  })();
  return hydration;
}

export function useWorkspace(): [Workspace, (patch: Partial<Workspace>) => void] {
  const [, bump] = useState(0);
  useEffect(() => {
    const rerender = (): void => bump((n) => n + 1);
    subscribers.add(rerender);
    void hydrate().then(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, []);
  return [state, setWorkspace];
}
