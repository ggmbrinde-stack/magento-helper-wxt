// Store-view detection shared by the panel (and future content scripts).
// The numeric ids are Magento store ids from the admin URL (/store/<id>/);
// the display codes match the Notion Language column values.

export const STORE_VIEW_MAP: Record<string, string> = {
  '1': 'PT',
  '2': 'EN',
  '4': 'ES',
  '5': 'FR',
  '6': 'DE',
  '7': 'IT',
};

export const STORE_VIEWS = ['PT', 'EN', 'ES', 'FR', 'DE', 'IT'] as const;

/** Display code -> Magento store id (inverse of STORE_VIEW_MAP). */
export const STORE_VIEW_IDS: Record<string, string> = {
  PT: '1',
  EN: '2',
  ES: '4',
  FR: '5',
  DE: '6',
  IT: '7',
};

/** Store views exposed as quick-open buttons in the panel. */
export const OPEN_STORE_VIEWS = ['EN', 'ES', 'FR'] as const;

export function detectStoreView(url: string): string {
  const match = url.match(/\/store\/(\d+)\//);
  if (match) {
    const id = match[1] ?? '';
    return STORE_VIEW_MAP[id] ?? 'all';
  }
  return 'all';
}

/**
 * Build the admin product-edit URL for a given store view. Passing `null`
 * returns the scope-less ("All") URL. Any existing `/store/<id>/` suffix on the
 * backend URL is replaced so the scope never doubles up.
 *
 * Read-only: this only produces a URL to open; nothing is written.
 */
export function withStoreView(
  backendUrl: string,
  storeId: string | null,
): string {
  const base = backendUrl.trim();
  if (!base) return '';
  const withoutOldScope = base.replace(/\/store\/\d+\/?/gi, '/');
  const normalized = withoutOldScope.replace(/\/+$/, '') + '/';
  if (!storeId) return normalized;
  return `${normalized}store/${storeId}/`;
}

/**
 * Re-scope *the currently open admin URL* to a store view, for the on-page
 * quick-open buttons. Unlike `withStoreView` (which appends `/store/<id>/` to a
 * stored backend URL), this preserves URLs that carry a Magento admin `key`
 * segment by inserting the scope *before* the key.
 *
 * `storeId = null` returns the scope-less ("All") URL. Read-only.
 */
export function scopeAdminUrl(url: string, storeId: string | null): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  // Drop any existing store scope first so it never doubles up.
  let path = parsed.pathname.replace(/\/store\/\d+\//gi, '/');
  if (storeId !== null) {
    const keyMatch = path.match(/\/key\/[^/]+\//);
    if (keyMatch) {
      path = path.replace(keyMatch[0], `/store/${storeId}/` + keyMatch[0]);
    } else {
      path = `${path.replace(/\/+$/, '')}/store/${storeId}/`;
    }
  }
  return `${parsed.origin}${path}${parsed.search}${parsed.hash}`;
}
