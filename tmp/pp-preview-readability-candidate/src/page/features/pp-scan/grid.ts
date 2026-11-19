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
    // A refusal names the exact loaded field it rejected, so the dashboard can show the cause
    // instead of one shared sentence. The text is display only and never carries a page value.
    const reject = (detail: string): PpLoadedGridRead => {
      result.status = 'incomplete';
      result.detail = detail.slice(0, 200);
      return result;
    };
    const items = own(data, 'items'), total = own(data, 'totalRecords'), paging = own(params, 'paging'), filters = own(params, 'filters'), sorting = own(params, 'sorting');
    if (!Array.isArray(items)) return reject('data.items is ' + typeof items);
    // The Grid loads a whole filtered page at once: PP 963's page holds 925 rows. Bound the scan
    // without refusing a page size the Grid itself offers.
    if (items.length > 5000) return reject('data.items holds ' + items.length + ' rows, above 5000');
    if (!integer(total, 0, Number.MAX_SAFE_INTEGER)) return reject('data.totalRecords is ' + typeof total);
    if (!record(paging)) return reject('params.paging is ' + typeof paging);
    if (!record(filters)) return reject('params.filters is ' + typeof filters);
    if (!record(sorting)) return reject('params.sorting is ' + typeof sorting);
    const page = own(paging, 'current'), pageSize = own(paging, 'pageSize'), filterId = own(filters, 'attributesetcustomoptions_id'), placeholder = own(filters, 'placeholder');
    const sortField = own(sorting, 'field'), sortDirection = own(sorting, 'direction');
    // A value is described, never coerced: an object with a throwing toString is only an object.
    const described = (value: unknown): string => typeof value === 'string' ? JSON.stringify(value.slice(0, 40))
      : typeof value === 'number' || typeof value === 'boolean' ? String(value) : typeof value;
    if (!integer(page, 1, 1_000_000)) return reject('paging.current is ' + described(page));
    if (!integer(pageSize, 1, 5000)) return reject('paging.pageSize is ' + described(pageSize));
    if (items.length > pageSize) return reject('data.items holds ' + items.length + ' rows for a page size of ' + pageSize);
    if (items.length > total) return reject('data.items holds more rows than data.totalRecords (' + total + ')');
    if (filterId !== undefined && (typeof filterId !== 'string' || filterId.length > 128)) return reject('filters.attributesetcustomoptions_id is ' + typeof filterId);
    if (placeholder !== undefined && typeof placeholder !== 'boolean') return reject('filters.placeholder is ' + typeof placeholder);
    const extraFilter = Object.keys(filters).find(key => !['placeholder', 'attributesetcustomoptions_id'].includes(key));
    if (extraFilter) return reject('params.filters has an unsupported key: ' + extraFilter);
    if (typeof sortField !== 'string' || sortField.length > 128) return reject('sorting.field is ' + typeof sortField);
    if (typeof sortDirection !== 'string' || !['asc', 'desc'].includes(sortDirection)) return reject('sorting.direction is ' + described(sortDirection));
    result.loadedRows = items.length; result.totalRows = total; result.page = page; result.pageSize = pageSize; result.filtered = filterId !== undefined && filterId !== '';
    const ids: string[] = [], matches: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
      const row = own(items, String(i)), id = own(row, 'attributesetcustomoptions_id');
      if (!((typeof id === 'string' && /^\d{1,16}$/.test(id)) || (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0))) {
        return reject('row ' + (i + 1) + ' has no numeric attributesetcustomoptions_id (' + typeof id + ')');
      }
      const exactId = String(id); ids.push(exactId);
      if (exactId === expectedEntityId) matches.push(row);
    }
    if (blocked) return reject('a property accessor is not readable');
    if (matches.length > 1) { result.status = 'duplicate'; return result; }
    if (!matches.length) { result.status = 'not-in-loaded-results'; return result; }
    const nativeUrl = own(own(own(matches[0], 'actions'), 'edit'), 'href');
    if (typeof nativeUrl !== 'string' || nativeUrl.length > 2048 || /[?#]/.test(nativeUrl)) { result.status = 'invalid-link'; return result; }
    let url: URL;
    try { url = new URL(nativeUrl); } catch { result.status = 'invalid-link'; return result; }
    const editPath = expectedPath.replace(/\/index\/?$/, '/edit/attributesetcustomoptions_id/' + expectedEntityId);
    if (url.href !== nativeUrl || url.origin !== expectedOrigin || url.username || url.password ||
      !new RegExp(`^${escape(editPath)}(?:/key/[A-Za-z0-9_-]{1,256})?/?$`).test(url.pathname)) { result.status = 'invalid-link'; return result; }
    if (blocked) return reject('a property accessor is not readable');
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
    if (blocked) return reject('a property accessor is not readable');
    result.status = 'found'; result.nativeUrl = nativeUrl;
    result.stamp = JSON.stringify({ namespace, page, pageSize, filterId, placeholder, sortField, sortDirection, total, ids, nativeUrl });
    return result;
  } catch { result.status = 'error'; return result; }
}
