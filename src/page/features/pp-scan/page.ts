import type {
  PpDraftCollection,
  PpDraftRow,
  PpDraftTranslation,
  PpDraftValue,
  ScanPpDraftResponse,
} from '../../../core/messages';

const ROUTE =
  /\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/(\d+)(?:\/|$)/i;
export function ppRoutePathFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(ROUTE);
    return match?.index === undefined ? null :
      `${pathname.slice(0, match.index)}${match[0].replace(/\/$/, '')}`;
  } catch {
    return null;
  }
}
export function ppEntityIdFromUrl(url: string): string | null {
  try {
    return new URL(url).pathname.match(ROUTE)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Runs in Magento's main world and reads only the already-loaded registry provider. */
export function scanCurrentPpDraft(): ScanPpDraftResponse {
  const providerName =
    'toogas_attributesetcustomoptions_attributesetcustomoptions_form.attributesetcustomoptions_form_data_source';
  const registryModuleName = 'Magento_Ui/js/lib/registry/registry';
  const maxRows = 100;
  const maxString = 1024;
  const maxObjectKeys = 40;
  const route = window.location.pathname.match(
    /\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/(\d+)(?:\/|$)/i,
  );
  const entityId = route?.[1] ?? null;
  const routePath = route?.index === undefined ? '' :
    `${window.location.pathname.slice(0, route.index)}${route[0].replace(/\/$/, '')}`;
  const base: ScanPpDraftResponse = {
    version: 1,
    status: 'unavailable',
    entityId,
    routePath,
    general: {},
    locations: { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
    items: { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] },
    warnings: [],
  };
  if (!entityId) {
    base.warnings.push('This is not a recognized custom-option edit route.');
    return base;
  }

  let clipped = false;
  let sanitized = false;
  type Read = { found: boolean; value?: unknown };
  const read = (source: unknown, key: string): Read => {
    if (
      source === null ||
      (typeof source !== 'object' && typeof source !== 'function')
    ) return { found: false };
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor && !('value' in descriptor)) sanitized = true;
    return descriptor && 'value' in descriptor
      ? { found: true, value: descriptor.value }
      : { found: false };
  };
  const readRegistryGet = (source: unknown): Read => {
    if (source === null || (typeof source !== 'object' && typeof source !== 'function')) return { found: false };
    let current: object | null = source;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'get');
      if (descriptor) {
        if (!('value' in descriptor)) {
          sanitized = true;
          return { found: false };
        }
        return { found: true, value: descriptor.value };
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
    return { found: false };
  };
  const path = (source: unknown, keys: string[]): Read => {
    let current = source;
    for (const key of keys) {
      const next = read(current, key);
      if (!next.found) return { found: false };
      current = next.value;
    }
    return { found: true, value: current };
  };
  const safeValue = (
    value: unknown,
    seen = new Set<object>(),
    depth = 0,
  ): PpDraftValue => {
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) sanitized = true;
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      if (value.length > maxString) clipped = true;
      return value.slice(0, maxString);
    }
    if (typeof value !== 'object') {
      sanitized = true;
      return null;
    }
    if (seen.has(value)) {
      sanitized = true;
      return '[Circular]';
    }
    if (depth >= 4) {
      clipped = true;
      return '[Depth limit]';
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const out: PpDraftValue[] = [];
      const length = Math.min(value.length, maxRows);
      if (value.length > length) clipped = true;
      for (let index = 0; index < length; index += 1) {
        const item = read(value, String(index));
        out.push(item.found ? safeValue(item.value, seen, depth + 1) : null);
      }
      seen.delete(value);
      return out;
    }
    const out: Record<string, PpDraftValue> = {};
    const keys: string[] = [];
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      keys.push(key);
      if (keys.length > maxObjectKeys) break;
    }
    if (keys.length > maxObjectKeys) clipped = true;
    for (const key of keys.slice(0, maxObjectKeys)) {
      const item = read(value, key);
      if (item.found) out[key.slice(0, 80)] = safeValue(item.value, seen, depth + 1);
    }
    seen.delete(value);
    return out;
  };
  const fieldValues = (
    source: unknown,
    fields: string[],
  ): Record<string, PpDraftValue> => {
    const values: Record<string, PpDraftValue> = {};
    for (const field of fields) {
      const found = read(source, field);
      if (found.found) values[field] = safeValue(found.value);
    }
    return values;
  };
  const translation = (value: unknown): PpDraftTranslation => {
    const result: PpDraftTranslation = { raw: safeValue(value) };
    if (typeof value !== 'string' || !value.trim()) return result;
    if (value.length > maxString) {
      clipped = true;
      result.parseError = 'Translation JSON exceeds the scan limit.';
      return result;
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return result;
    try {
      result.parsed = safeValue(JSON.parse(value));
    } catch {
      result.parseError = 'Invalid translation JSON.';
    }
    return result;
  };
  const collection = (
    found: Read,
    fields: string[],
    translatedFields: string[],
    identifierFields: string[],
  ): PpDraftCollection => {
    if (!found.found || found.value === null || found.value === undefined) {
      return { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] };
    }
    if (!Array.isArray(found.value) && typeof found.value !== 'object') {
      return { state: 'invalid', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] };
    }
    const source = found.value as object;
    const keys: string[] = [];
    if (Array.isArray(source)) {
      const length = Math.min(source.length, maxRows + 1);
      for (let index = 0; index < length; index += 1) keys.push(String(index));
    } else {
      for (const key in source) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        keys.push(key);
        if (keys.length > maxRows) break;
      }
    }
    const rows: PpDraftRow[] = [];
    const truncated = keys.length > maxRows;
    let identifierGaps = 0;
    const skippedPositions: number[] = [];
    for (let index = 0; index < Math.min(keys.length, maxRows); index += 1) {
      const key = keys[index];
      if (key === undefined) {
        skippedPositions.push(index);
        continue;
      }
      const row = read(source, key);
      if (!row.found || !row.value || typeof row.value !== 'object') {
        skippedPositions.push(index);
        continue;
      }
      const values = fieldValues(row.value, fields);
      if (Object.keys(values).length === 0) {
        skippedPositions.push(index);
        continue;
      }
      if (identifierFields.some((field) => {
        const value = read(row.value, field);
        return !value.found || value.value === null || value.value === undefined || value.value === '';
      })) identifierGaps += 1;
      const translations: Record<string, PpDraftTranslation> = {};
      for (const field of translatedFields) {
        const value = read(row.value, field);
        if (!value.found) continue;
        translations[field] = translation(value.value);
      }
      rows.push({ position: index, values, translations });
    }
    return { state: 'available', rows, truncated, identifierGaps, skippedPositions };
  };

  try {
    const requireFn = (window as Window & { require?: unknown }).require;
    const contexts = read(requireFn, 's');
    const context = path(contexts.value, ['contexts', '_']);
    const defined = read(context.value, 'defined');
    const registryModule = read(defined.value, registryModuleName);
    const get = readRegistryGet(registryModule.value);
    if (!contexts.found || !context.found || !defined.found || !registryModule.found || typeof get.value !== 'function') {
      base.warnings.push('The already-loaded Magento registry is unavailable.');
      return base;
    }
    const provider = (get.value as (name: string) => unknown).call(
      registryModule.value,
      providerName,
    );
    if (!provider) {
      base.warnings.push('The Magento custom-option provider is not loaded.');
      return base;
    }
    const dataRead = read(provider, 'data');
    if (!dataRead.found || !dataRead.value || typeof dataRead.value !== 'object') {
      base.warnings.push('The Magento provider data is unavailable.');
      return base;
    }
    const data = dataRead.value;
    const providerId = read(data, 'attributesetcustomoptions_id');
    if (providerId.found) base.providerEntityId = safeValue(providerId.value);
    if (providerId.found && String(providerId.value) !== entityId) {
      base.status = 'identity-mismatch';
      base.warnings.push('The route entity and provider entity do not match.');
      return base;
    }

    const general = path(data, ['general']);
    const generalValid = general.found && !!general.value && typeof general.value === 'object';
    if (generalValid) {
      base.general = fieldValues(general.value, [
        'option_title', 'attribute_set_id', 'option_type', 'is_required',
        'sort_order', 'description', 'info_message', 'placeholder', 'price',
        'max_characters', 'allowed_extensions', 'translationsData', 'translations',
      ]);
      const translations = read(general.value, 'translationsData');
      if (translations.found) base.generalTranslations = translation(translations.value);
      const setId = read(general.value, 'attribute_set_id');
      if (setId.found) base.generalAttributeSetId = safeValue(setId.value);
    } else {
      base.warnings.push('General provider data is missing or invalid.');
    }
    const providerSetId = read(data, 'attribute_set_id');
    if (providerSetId.found) base.providerAttributeSetId = safeValue(providerSetId.value);

    const locationFields = [
      'record_id', 'key_id', 'name', 'description', 'img', 'price', 'sort',
      'store_view', 'visible', 'is_visible', 'hidden', 'disabled', 'delete',
    ];
    const itemFields = [
      'record_id', 'parent', 'name', 'name_option', 'price', 'sort',
      'store_view', 'visible', 'is_visible', 'hidden', 'disabled', 'delete',
    ];
    base.locations = collection(
      path(data, ['options', 'sub_options', 'sub_options']),
      locationFields,
      ['name', 'description'],
      ['record_id', 'key_id'],
    );
    base.items = collection(
      path(data, ['options', 'sub_options_items', 'sub_options_items']),
      itemFields,
      ['name'],
      ['record_id', 'parent'],
    );
    // The visible technique name is page text, not provider data: read the selected
    // option of each Items row select, keyed by the record_id in its input name.
    const readItemLabels = (): Record<string, string> => {
      const labels: Record<string, string> = {};
      try {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return labels;
        const selects = Array.from(document.querySelectorAll('select[name]'));
        for (const node of selects) {
          if (Object.keys(labels).length >= maxRows) return labels;
          const name = String((node as { name?: string }).name ?? '');
          if (name.indexOf('[sub_options_items]') === -1 || name.indexOf('[name_option]') === -1) continue;
          if (node.closest && node.closest('#mhx-items-panel, .mhx-items-panel')) continue;
          const segments = name.split('[').map((segment) => segment.split(']')[0] ?? '');
          const key = segments[segments.length - 2] ?? '';
          if (!key || key.length > 16) continue;
          if (!key.split('').every((char) => char >= '0' && char <= '9')) continue;
          const select = node as unknown as { selectedIndex: number; options: ArrayLike<{ text: string }> };
          const chosen = select.options[select.selectedIndex];
          const text = String(chosen?.text ?? '').trim();
          if (!text) continue;
          labels[key] = text.slice(0, 200);
        }
      } catch { return labels; }
      return labels;
    };
    const itemLabels = readItemLabels();
    if (Object.keys(itemLabels).length) base.itemLabels = itemLabels;
    // The technique dropdown carries the whole catalogue: value plus rendered label.
    const readCatalogue = (): Array<{ id: string; label: string }> => {
      const entries: Array<{ id: string; label: string }> = [];
      try {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return entries;
        for (const node of Array.from(document.querySelectorAll('select[name]'))) {
          const name = String((node as { name?: string }).name ?? '');
          if (name.indexOf('[sub_options_items]') === -1 || name.indexOf('[name_option]') === -1) continue;
          if (node.closest && node.closest('#mhx-items-panel, .mhx-items-panel')) continue;
          const options = Array.from((node as unknown as { options: ArrayLike<{ value: string; text: string }> }).options);
          for (const option of options) {
            const id = String(option.value ?? '').trim();
            const label = String(option.text ?? '').trim();
            if (!id || !label || id.length > 16 || label.length > 200) continue;
            if (!id.split('').every((char) => char >= '0' && char <= '9')) continue;
            if (entries.some((entry) => entry.id === id)) continue;
            entries.push({ id, label: label.slice(0, 200) });
            if (entries.length >= 400) break;
          }
        }
      } catch { return entries; }
      return entries;
    };
    const catalogue = readCatalogue();
    if (catalogue.length) base.catalogue = catalogue;
    base.scannedAt = Date.now();
    base.status = 'ok';
    if (!generalValid || base.locations.state !== 'available' || base.items.state !== 'available') {
      base.status = 'partial';
      if (base.locations.state !== 'available') base.warnings.push(`Location collection is ${base.locations.state}.`);
      if (base.items.state !== 'available') base.warnings.push(`Item collection is ${base.items.state}.`);
    }
    if (base.generalTranslations?.parseError) {
      base.status = 'partial';
      base.warnings.push(base.generalTranslations.parseError);
    }
    if ([...base.locations.rows, ...base.items.rows].some((row) =>
      Object.values(row.translations).some((value) => Boolean(value.parseError)),
    )) {
      base.status = 'partial';
      base.warnings.push('One or more row translation values contain invalid JSON.');
    }
    if (base.locations.identifierGaps || base.items.identifierGaps) {
      base.status = 'partial';
      base.warnings.push(
        `Rows with missing or blank identity/parent fields: locations ${base.locations.identifierGaps}, items ${base.items.identifierGaps}.`,
      );
    }
    if (base.locations.skippedPositions.length || base.items.skippedPositions.length) {
      base.status = 'partial';
      base.warnings.push(
        `Unrecognized or invalid rows were skipped: locations [${base.locations.skippedPositions.join(', ')}], items [${base.items.skippedPositions.join(', ')}].`,
      );
    }
    if (base.locations.truncated || base.items.truncated || clipped) {
      base.status = 'partial';
      base.warnings.push('The snapshot reached a safety limit; some values or rows may be truncated.');
    }
    if (sanitized) {
      base.status = 'partial';
      base.warnings.push('Some provider values were omitted or sanitized because they were not safe JSON values.');
    }
    const duplicateValues = (rows: PpDraftRow[], field: string): boolean => {
      const seen = new Set<string>();
      for (const row of rows) {
        const value = row.values[field];
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        const key = String(value);
        if (seen.has(key)) return true;
        seen.add(key);
      }
      return false;
    };
    if (
      duplicateValues(base.locations.rows, 'record_id') ||
      duplicateValues(base.locations.rows, 'key_id') ||
      duplicateValues(base.items.rows, 'record_id')
    ) {
      base.status = 'partial';
      base.warnings.push('Duplicate row identifiers were found; review relationships manually.');
    }
    base.warnings.push('Item parent values are preserved raw; this scan does not infer location assignments.');
    base.warnings.push('Absent provider fields are omitted; explicit blank values remain visible as empty strings.');
    return base;
  } catch {
    base.status = 'unavailable';
    base.general = {};
    base.locations = { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] };
    base.items = { state: 'missing', rows: [], truncated: false, identifierGaps: 0, skippedPositions: [] };
    base.warnings.push('The provider could not be read safely. Retry the scan after Magento finishes loading.');
    return base;
  }
}

/**
 * Opens the native Options tab in an extension-owned helper tab so Magento renders
 * the Items rows. View only: no field is edited, saved or submitted.
 */
export function activatePpOptionsTab(): boolean {
  try {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return false;
    // Only the nav link switches the panel. The tab id can also sit on the panel itself,
    // and clicking a panel does nothing, so the click must never leave this nav.
    const nav = Array.from(document.querySelectorAll(
      '.admin__page-nav-items a, .admin__page-nav-items button, .admin__page-nav-link, a[href="#options"]',
    ));
    if (!nav.length) return false;
    const words = (value: unknown): string[] =>
      String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const named = (node: Element): string[] => [
      ...words((node as HTMLElement).id),
      ...words(node.getAttribute('data-tab')),
      ...words(String(node.getAttribute('href') ?? '').replace(/^#/, '')),
    ];
    const letters = (node: Element): string => String(node.textContent ?? '').toLowerCase()
      .split('').filter((char) => char >= 'a' && char <= 'z').join('');
    const candidate = nav.find((node) => named(node).indexOf('options') !== -1)
      ?? nav.find((node) => letters(node) === 'options');
    if (!candidate) return false;
    // The live page carries no aria-selected or active class on these links, and a
    // repeat click on the already-open tab is a harmless view no-op.
    (candidate as HTMLElement).click();
    return true;
  } catch { return false; }
}
