export const FEATURE_DEFAULTS: Record<string, boolean> = {
  extensionEnabled: true,
  selects: true,
  navToggle: true,
  rowActions: true,
  massactions: true,
  paging: true,
  activeFilters: true,
  categoryTree: true,
  pageActions: false,
  skuCopy: true,
  productTypeBadge: true,
  gridCopy: true,
  storeViews: true,
  configButtons: true,
  errorMarkup: true,
  optionsCompanion: true,
  optionsItems: true,
  tierPrices: true,
};

type FeatureSettings = Record<string, boolean>;

let cache: FeatureSettings = { ...FEATURE_DEFAULTS };

export function getFeatureSettings(): FeatureSettings {
  return cache;
}

export async function loadFeatureSettings(): Promise<FeatureSettings> {
  const keys = Object.keys(FEATURE_DEFAULTS);
  const data = await chrome.storage.local.get(keys.concat(['featureFlags']));
  const stored = (data.featureFlags as FeatureSettings | undefined) ?? {};
  const merged: FeatureSettings = { ...FEATURE_DEFAULTS };
  for (const k of keys) {
    if (typeof stored[k] === 'boolean') merged[k] = stored[k];
    else if (typeof data[k] === 'boolean') merged[k] = data[k] as boolean;
  }
  cache = merged;
  return cache;
}

export function onFeatureSettingsChange(cb: (s: FeatureSettings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!('featureFlags' in changes) && !Object.keys(FEATURE_DEFAULTS).some((k) => k in changes)) return;
    void loadFeatureSettings().then(cb);
  });
}

export async function saveFeatureSettings(next: FeatureSettings): Promise<void> {
  cache = { ...FEATURE_DEFAULTS, ...next };
  await chrome.storage.local.set({ featureFlags: cache });
}