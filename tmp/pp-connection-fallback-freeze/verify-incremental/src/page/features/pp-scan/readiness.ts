import type { PpReadinessCheckpoint } from '../../../core/messages';

/** Serialized MAIN-world probe: fixed status values only, no provider content. */
export function readPpReadiness(expectedEntityId: string): PpReadinessCheckpoint {
  const result: PpReadinessCheckpoint = { document: 'unknown', stage: 'read-error',
    registry: 'unknown', provider: 'unknown', data: 'unknown', identity: 'unknown', blockedAccessor: false };
  const own = (source: unknown, key: string): unknown => {
    if (source === null || (typeof source !== 'object' && typeof source !== 'function')) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) return undefined;
    if (!('value' in descriptor)) { result.blockedAccessor = true; return undefined; }
    return descriptor.value;
  };
  try {
    const state = document.readyState;
    if (state === 'loading' || state === 'interactive' || state === 'complete') result.document = state;
    const route = window.location.pathname.match(/\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/(\d+)(?:\/|$)/i);
    if (route?.[1] !== expectedEntityId) { result.stage = 'route-mismatch'; return result; }
    if (state === 'loading') { result.stage = 'document-loading'; return result; }
    const requireFn = own(window, 'require');
    const defined = own(own(own(own(requireFn, 's'), 'contexts'), '_'), 'defined');
    const registry = own(defined, 'Magento_Ui/js/lib/registry/registry');
    let get: unknown, prototype = registry;
    for (let depth = 0; prototype && depth < 4 && (typeof prototype === 'object' || typeof prototype === 'function'); depth++) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'get');
      if (descriptor) {
        if ('value' in descriptor) get = descriptor.value;
        else result.blockedAccessor = true;
        break;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    if (typeof get !== 'function') { result.registry = 'unavailable'; result.stage = 'registry-unavailable'; return result; }
    result.registry = 'available';
    const provider = get.call(registry, 'toogas_attributesetcustomoptions_attributesetcustomoptions_form.attributesetcustomoptions_form_data_source');
    if (!provider) { result.provider = 'unavailable'; result.stage = 'provider-unavailable'; return result; }
    result.provider = 'available';
    const data = own(provider, 'data');
    if (!data || typeof data !== 'object') { result.data = 'unavailable'; result.stage = 'data-unavailable'; return result; }
    result.data = 'available';
    const id = own(data, 'attributesetcustomoptions_id');
    if (id === undefined || id === null || id === '') { result.identity = 'missing'; result.stage = 'identity-missing'; return result; }
    if (!((typeof id === 'string' && /^\d{1,16}$/.test(id)) || (typeof id === 'number' && Number.isSafeInteger(id) && id >= 0))) {
      result.identity = 'invalid'; result.stage = 'identity-invalid'; return result;
    }
    result.identity = String(id) === expectedEntityId ? 'matching' : 'mismatched';
    result.stage = result.identity === 'matching' ? 'ready' : 'identity-mismatch';
    return result;
  } catch { result.stage = 'read-error'; return result; }
}
