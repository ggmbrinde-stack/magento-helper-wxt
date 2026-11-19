import type { PpGridCoverage } from '../../../core/messages';

/** Internal result: nativeUrl/stamp may only be consumed privately by the worker. */
export interface PpLoadedGridRead extends PpGridCoverage { nativeUrl?: string; stamp?: string }

/** Serialized MAIN-world read of already-loaded Options Grid data; never loads or modifies it. */
export function readLoadedPpGrid(expectedEntityId: string, expectedOrigin: string, expectedPath: string): PpLoadedGridRead {
  const result: PpLoadedGridRead = { status: 'unavailable', freshness: 'loaded-unverified' };
  let blocked = false;
  const own = (source: unknown, key: string): unknown => {
    if (!source || (typeof source !== 'object' && typeof source !== 'function')) return undefined;
    const d = Object.getOwnPropertyDescriptor(source, key);
    if (!d) return undefined;
    if (!('value' in d)) { blocked = true; return undefined; }
    return d.value;
  };
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const integer = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    if (!/^[1-9]\d{0,15}$/.test(expectedEntityId) || window.location.origin !== expectedOrigin ||
      !new RegExp(`^${escape(expectedPath.replace(/\/$/, ''))}(?:/key/[A-Za-z0-9_-]{1,256})?/?$`).test(window.location.pathname)) return result;
    const requireFn = own(window, 'require');
    const defined = own(own(own(own(requireFn, 's'), 'contexts'), '_'), 'defined');
    const registry = own(defined, 'Magento_Ui/js/lib/registry/registry');
    let get: unknown, prototype = registry;
    for (let depth = 0; prototype && depth < 4 && (typeof prototype === 'object' || typeof prototype === 'function'); depth++) {
      const d = Object.getOwnPropertyDescriptor(prototype, 'get');
      if (d) { if ('value' in d) get = d.value; else blocked = true; break; }
      prototype = Object.getPrototypeOf(prototype);
    }
    if (typeof get !== 'function' || blocked) return result;
    const namespace = 'toogas_attributesetcustomoptions_attributesetcustomoptions_listing';
    const providerName = namespace + '.' + namespace + '_data_source';
    const provider = get.call(registry, providerName);
    if (!provider) return result;
    const firstLoad = own(provider, 'firstLoad'), lastError = own(provider, 'lastError'), message = own(provider, 'message');
    if (lastError === true || (typeof message === 'string' && message.length > 0)) { result.status = 'error'; return result; }
    if (firstLoad !== false) { result.status = 'loading'; return result; }
    if (lastError !== false) return result;
    const data = own(provider, 'data'), params = own(provider, 'params');
    if (!record(data) || !record(params) || own(params, 'namespace') !== namespace) return result;
    const items = own(data, 'items'), total = own(data, 'totalRecords'), paging = own(params, 'paging'), filters = own(params, 'filters'), sorting = own(params, 'sorting');
    if (!Array.isArray(items) || items.length > 500 || !integer(total, 0, Number.MAX_SAFE_INTEGER) ||
      !record(paging) || !record(filters) || !record(sorting)) { result.status = 'incomplete'; return result; }
    const page = own(paging, 'current'), pageSize = own(paging, 'pageSize'), filterId = own(filters, 'attributesetcustomoptions_id'), placeholder = own(filters, 'placeholder');
    const sortField = own(sorting, 'field'), sortDirection = own(sorting, 'direction');
    if (!integer(page, 1, 1_000_000) || !integer(pageSize, 1, 500) || items.length > pageSize || items.length > total ||
      (filterId !== undefined && (typeof filterId !== 'string' || filterId.length > 128)) ||
      (placeholder !== undefined && typeof placeholder !== 'boolean') ||
      Object.keys(filters).some(key => !['placeholder', 'attributesetcustomoptions_id'].includes(key)) ||
      typeof sortField !== 'string' || sortField.length > 128 || typeof sortDirection !== 'string' || !['asc', 'desc'].includes(sortDirection)) {
      result.status = 'incomplete'; return result;
    }
    result.loadedRows = items.length; result.totalRows = total; result.page = page; result.pageSize = pageSize; result.filtered = filterId !== undefined && filterId !== '';
    const ids: string[] = [], matches: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
      const row = own(items, String(i)), id = own(row, 'attributesetcustomoptions_id');
      if (!((typeof id === 'string' && /^\d{1,16}$/.test(id)) || (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0))) { result.status = 'incomplete'; return result; }
      const exactId = String(id); ids.push(exactId);
      if (exactId === expectedEntityId) matches.push(row);
    }
    if (blocked) { result.status = 'incomplete'; return result; }
    if (matches.length > 1) { result.status = 'duplicate'; return result; }
    if (!matches.length) { result.status = 'not-in-loaded-results'; return result; }
    const nativeUrl = own(own(own(matches[0], 'actions'), 'edit'), 'href');
    if (typeof nativeUrl !== 'string' || nativeUrl.length > 2048 || /[?#]/.test(nativeUrl)) { result.status = 'invalid-link'; return result; }
    let url: URL;
    try { url = new URL(nativeUrl); } catch { result.status = 'invalid-link'; return result; }
    const editPath = expectedPath.replace(/\/index\/?$/, '/edit/attributesetcustomoptions_id/' + expectedEntityId);
    if (url.href !== nativeUrl || url.origin !== expectedOrigin || url.username || url.password ||
      !new RegExp(`^${escape(editPath)}(?:/key/[A-Za-z0-9_-]{1,256})?/?$`).test(url.pathname)) { result.status = 'invalid-link'; return result; }
    if (blocked) { result.status = 'incomplete'; return result; }
    if (get.call(registry, providerName) !== provider || own(provider, 'data') !== data || own(provider, 'params') !== params ||
      own(data, 'items') !== items || own(data, 'totalRecords') !== total || own(provider, 'firstLoad') !== firstLoad || own(provider, 'lastError') !== lastError ||
      own(provider, 'message') !== message || own(params, 'namespace') !== namespace || items.length !== ids.length ||
      own(params, 'paging') !== paging || own(params, 'filters') !== filters || own(params, 'sorting') !== sorting ||
      own(paging, 'current') !== page || own(paging, 'pageSize') !== pageSize || own(filters, 'attributesetcustomoptions_id') !== filterId ||
      own(filters, 'placeholder') !== placeholder || Object.keys(filters).some(key => !['placeholder', 'attributesetcustomoptions_id'].includes(key)) ||
      own(sorting, 'field') !== sortField || own(sorting, 'direction') !== sortDirection ||
      own(own(own(matches[0], 'actions'), 'edit'), 'href') !== nativeUrl) { result.status = 'changed'; return result; }
    for (let i = 0; i < ids.length; i++) {
      const id = own(own(items, String(i)), 'attributesetcustomoptions_id');
      if ((typeof id !== 'string' && typeof id !== 'number') || String(id) !== ids[i]) { result.status = 'changed'; return result; }
    }
    if (blocked) { result.status = 'incomplete'; return result; }
    result.status = 'found'; result.nativeUrl = nativeUrl;
    result.stamp = JSON.stringify({ namespace, page, pageSize, filterId, placeholder, sortField, sortDirection, total, ids, nativeUrl });
    return result;
  } catch { result.status = 'error'; return result; }
}
