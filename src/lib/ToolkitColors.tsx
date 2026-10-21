// The "Toolkit colours" control, shown next to ThemePicker in both settings
// screens (dashboard Settings and the side panel's Settings tab).
//
// It only reads and writes preferences. Applying them on admin pages is
// `watchToolkitColors`' job in the content script (src/ui/tokens.ts), so an
// open admin tab repaints the moment a swatch is picked — no Save, no
// reload. The extension surfaces run the same watcher so the preview below
// shows the real values rather than a mock-up.
//
// Three tokens, deliberately: accent, danger and success are the only
// toolkit colours with a meaning of their own. Ink, lines and fills are
// page-adaptive by design (they follow the admin's own light/dark colours),
// so there is nothing sensible to customise there — and nothing to get
// contrast-wrong.

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  TOOLKIT_COLOR_TOKENS,
  TOOLKIT_COLORS_KEY,
  readToolkitColors,
  writeToolkitColors,
  type ToolkitColorId,
  type ToolkitColors,
} from '../ui/tokens';

interface StorageChanges {
  [key: string]: { newValue?: unknown } | undefined;
}

/** Current overrides, kept in step with storage across every UI. */
export function useToolkitColors(): {
  colors: ToolkitColors;
  setColor: (id: ToolkitColorId, value: string | null) => void;
} {
  const [colors, setColors] = useState<ToolkitColors>({
    accent: null,
    danger: null,
    ok: null,
  });

  useEffect(() => {
    void readToolkitColors().then(setColors);
    const listener = (changes: StorageChanges, area: string): void => {
      if (area !== 'local' || !(TOOLKIT_COLORS_KEY in changes)) return;
      void readToolkitColors().then(setColors);
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const setColor = (id: ToolkitColorId, value: string | null): void => {
    setColors((prev) => ({ ...prev, [id]: value }));
    void writeToolkitColors({ [id]: value });
  };

  return { colors, setColor };
}

export function ToolkitColors() {
  const { colors, setColor } = useToolkitColors();

  return (
    <div class="mhx-theme mhx-tk">
      <span class="mhx-theme-label">Toolkit colours</span>

      {TOOLKIT_COLOR_TOKENS.map((token) => {
        const value = colors[token.id];
        return (
          <div class="mhx-tk-row" key={token.id}>
            <span class="mhx-tk-name">{token.label}</span>
            {/* Live sample: resolves the real token when one is set, the
                automatic fallback otherwise. */}
            <span
              class="mhx-tk-preview"
              title={token.hint}
              style={{
                background: `var(${token.cssVar}, var(${token.previewFallbackVar}))`,
              }}
            />
            <label class="mhx-swatch-custom" title="Pick any colour">
              <input
                type="color"
                value={value ?? token.seed}
                aria-label={`Custom toolkit ${token.label.toLowerCase()} colour`}
                onInput={(e) => setColor(token.id, e.currentTarget.value)}
              />
              <span>Custom</span>
            </label>
            <button
              type="button"
              class={
                value
                  ? 'mhx-theme-btn'
                  : 'mhx-theme-btn mhx-theme-btn--active'
              }
              title="Back to the automatic colour"
              aria-pressed={!value}
              onClick={() => setColor(token.id, null)}
            >
              Auto
            </button>
          </div>
        );
      })}

      <p class="mhx-note">
        Applies immediately to the injected admin UI — buttons, strips, chips,
        focus rings — in every open admin tab. “Auto” follows the page and the
        theme accent. Nothing is written to Magento or Notion.
      </p>
    </div>
  );
}
