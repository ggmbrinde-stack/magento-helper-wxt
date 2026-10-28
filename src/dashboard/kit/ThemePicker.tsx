// The theme control shown in both settings screens (side panel and dashboard).
//
// It only reads and writes preferences. Applying them is `primeTheme`'s job in
// the extension UI and `watchMagentoPageTheme`'s job on Magento pages, so the
// theme is right from the first paint rather than only after someone visits
// Settings.

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  ACCENT_PRESETS,
  MAGENTO_THEME_KEY,
  THEME_ACCENT_KEY,
  THEME_CUSTOM_KEY,
  THEME_KEY,
  THEME_OPTIONS,
  THEME_PALETTES,
  isHexColor,
  isThemePreference,
  readMagentoThemeEnabled,
  readThemeAccent,
  readThemeCustom,
  readThemePreference,
  writeMagentoThemeEnabled,
  writeThemeAccent,
  writeThemeCustom,
  writeThemePreference,
  type ThemePreference,
} from '../../ui/theme';

/** The built-in accent, used to paint the "Default" swatch and seed the picker. */
const BUILT_IN_ACCENT = THEME_PALETTES.light['--mhx-accent'];

interface StorageChanges {
  [key: string]: { newValue?: unknown } | undefined;
}

/** Subscribe to one storage key and keep a piece of state in step with it. */
function useStoredValue<T>(
  key: string,
  read: () => Promise<T>,
  decode: (raw: unknown) => T,
  fallback: T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    void read().then(setValue);
    const listener = (changes: StorageChanges, area: string): void => {
      if (area !== 'local') return;
      const change = changes[key];
      if (!change) return;
      setValue(decode(change.newValue));
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
    // `read` and `decode` are module-level and stable, so `key` is the only dep.
  }, [key]);

  return [value, setValue];
}

/** Current theme preference, kept in sync with the other UI via storage events. */
export function useThemePreference() {
  const [preference, setPreferenceState] = useStoredValue<ThemePreference>(
    THEME_KEY,
    readThemePreference,
    (raw) => (isThemePreference(raw) ? raw : 'system'),
    'system',
  );

  const setPreference = (next: ThemePreference): void => {
    // Optimistic: the storage event repaints, but the control should not lag.
    setPreferenceState(next);
    void writeThemePreference(next);
  };

  return { preference, setPreference };
}

/** Whether the Magento admin pages get recoloured too. */
export function useMagentoTheme() {
  const [enabled, setEnabledState] = useStoredValue<boolean>(
    MAGENTO_THEME_KEY,
    readMagentoThemeEnabled,
    (raw) => raw === true,
    false,
  );

  const setEnabled = (next: boolean): void => {
    setEnabledState(next);
    void writeMagentoThemeEnabled(next);
  };

  return { enabled, setEnabled };
}

/** The accent override, or null for the built-in colour. */
export function useThemeAccent() {
  const [accent, setAccentState] = useStoredValue<string | null>(
    THEME_ACCENT_KEY,
    readThemeAccent,
    (raw) => (isHexColor(raw) ? raw : null),
    null,
  );

  const setAccent = (next: string | null): void => {
    setAccentState(next);
    void writeThemeAccent(next);
  };

  return { accent, setAccent };
}

/** The custom theme base colour, or null for the built-in palette. */
export function useThemeCustom() {
  const [custom, setCustomState] = useStoredValue<string | null>(
    THEME_CUSTOM_KEY,
    readThemeCustom,
    (raw) => (isHexColor(raw) ? raw : null),
    null,
  );

  const setCustom = (next: string | null): void => {
    setCustomState(next);
    void writeThemeCustom(next);
  };

  return { custom, setCustom };
}

export function ThemePicker() {
  const { preference, setPreference } = useThemePreference();
  const { enabled, setEnabled } = useMagentoTheme();
  const { accent, setAccent } = useThemeAccent();
  const { custom, setCustom } = useThemeCustom();

  return (
    <div class="mhx-theme">
      <span class="mhx-theme-label">Theme</span>
      <div class="mhx-theme-opts" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => {
          const active = preference === option.id;
          return (
            <button
              type="button"
              key={option.id}
              role="radio"
              aria-checked={active}
              title={option.hint}
              class={
                active ? 'mhx-theme-btn mhx-theme-btn--active' : 'mhx-theme-btn'
              }
              onClick={() => setPreference(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <span class="mhx-theme-label">Accent colour</span>
      <div class="mhx-swatches">
        {ACCENT_PRESETS.map((preset) => {
          const active = accent === preset.value;
          return (
            <button
              type="button"
              key={preset.label}
              title={preset.label}
              aria-label={`Accent: ${preset.label}`}
              aria-pressed={active}
              class={active ? 'mhx-swatch mhx-swatch--active' : 'mhx-swatch'}
              style={{ background: preset.value ?? BUILT_IN_ACCENT }}
              onClick={() => setAccent(preset.value)}
            />
          );
        })}
        <label class="mhx-swatch-custom" title="Pick any colour">
          <input
            type="color"
            value={accent ?? BUILT_IN_ACCENT}
            aria-label="Custom accent colour"
            onInput={(e) => setAccent(e.currentTarget.value)}
          />
          <span>Custom</span>
        </label>
      </div>

      <span class="mhx-theme-label">Theme colour</span>
      <div class="mhx-swatches">
        <label class="mhx-swatch-custom" title="Pick any colour">
          <input
            type="color"
            value={custom ?? THEME_PALETTES.light['--mhx-bg']}
            aria-label="Custom theme base colour"
            onInput={(e) => setCustom(e.currentTarget.value)}
          />
          <span>Custom</span>
        </label>
      </div>

      <label class="mhx-theme-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <span>Also recolour the Magento admin pages</span>
      </label>

      <p class="mhx-note">
        Applies immediately — no Save needed, and it touches neither Magento nor
        Notion. The shade, tint and button text are derived from the accent you
        pick, so it stays readable. “System” follows your OS and changes with it;
        the Magento option applies in dark mode only, and leaves Magento's own
        error and warning colours alone.
      </p>
    </div>
  );
}
