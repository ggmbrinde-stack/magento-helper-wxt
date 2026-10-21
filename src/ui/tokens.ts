// The toolkit's operator-customisable colour tokens.
//
// Three coloured page tokens (`--mhx-pg-accent`, `--mhx-pg-danger`,
// `--mhx-pg-ok`) are exposed as named entries here so Settings can offer
// them without hard-coding CSS property names in the UI. The *defaults* live
// in src/ui/toolkit.css (CSS cannot read TypeScript); a `seed` below only
// feeds the colour-picker swatch before anything is chosen and never
// overrides the stylesheet. "Auto" (null) always means "fall back to the
// stylesheet" — which for accent is the theme accent (`--mhx-accent`).
//
// Overrides are written as INLINE custom properties on the page's <html>:
// inline outranks the toolkit stylesheet's `:root` block, so clearing one
// restores the default instead of leaving a stale value behind.
//
// Nothing here touches Magento or Notion: this only repaints our own injected
// widgets, and the content script is the only writer on admin pages.

import { browser } from 'wxt/browser';
import { isHexColor, readableForeground } from '../lib/theme';

/** Storage key. Deliberately separate from theme/settings keys. */
export const TOOLKIT_COLORS_KEY = 'toolkitColors';

export type ToolkitColorId = 'accent' | 'danger' | 'ok';

export interface ToolkitColorToken {
  id: ToolkitColorId;
  /** The page token this entry overrides (written inline on <html>). */
  cssVar: string;
  label: string;
  /** What the colour actually drives, for the Settings hint. */
  hint: string;
  /** Swatch seed for the native colour input before anything is chosen. */
  seed: string;
  /**
   * Extension-palette variable used only by the Settings preview swatch, so
   * the sample shows the real default without a hex literal in the UI.
   */
  previewFallbackVar: string;
}

export const TOOLKIT_COLOR_TOKENS: ToolkitColorToken[] = [
  {
    id: 'accent',
    cssVar: '--mhx-pg-accent',
    label: 'Accent',
    hint: 'Focus rings, active segments, accent buttons. Auto = the theme accent.',
    seed: '#d81b60',
    previewFallbackVar: '--mhx-accent',
  },
  {
    id: 'danger',
    cssVar: '--mhx-pg-danger',
    label: 'Danger',
    hint: 'Delete / remove actions, error badges and toasts.',
    seed: '#e5484d',
    previewFallbackVar: '--mhx-bad',
  },
  {
    id: 'ok',
    cssVar: '--mhx-pg-ok',
    label: 'Success',
    hint: 'Copied / done feedback and success badges.',
    seed: '#16a34a',
    previewFallbackVar: '--mhx-ok',
  },
];

/** null = auto (use the stylesheet default). */
export type ToolkitColors = Record<ToolkitColorId, string | null>;

const AUTO: ToolkitColors = { accent: null, danger: null, ok: null };

/** Derived alongside a custom accent so accent buttons stay readable. */
const ON_ACCENT_VAR = '--mhx-pg-on-accent';

function sanitize(raw: unknown): ToolkitColors {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: ToolkitColors = { ...AUTO };
  for (const token of TOOLKIT_COLOR_TOKENS) {
    const value = source[token.id];
    out[token.id] = isHexColor(value) ? value : null;
  }
  return out;
}

export function isToolkitColors(value: unknown): value is ToolkitColors {
  return (
    typeof value === 'object' &&
    value !== null &&
    TOOLKIT_COLOR_TOKENS.every((token) => {
      const v = (value as Record<string, unknown>)[token.id];
      return v === null || v === undefined || isHexColor(v);
    })
  );
}

export async function readToolkitColors(): Promise<ToolkitColors> {
  try {
    const data = await browser.storage.local.get([TOOLKIT_COLORS_KEY]);
    return sanitize(data?.[TOOLKIT_COLORS_KEY]);
  } catch {
    return { ...AUTO };
  }
}

/** Persist one or more tokens. null clears back to auto. */
export async function writeToolkitColors(
  next: Partial<ToolkitColors>,
): Promise<void> {
  const merged = { ...(await readToolkitColors()), ...sanitize(next) };
  await browser.storage.local.set({ [TOOLKIT_COLORS_KEY]: merged });
}

/**
 * Publish the overrides onto one root as inline custom properties.
 * Applied on every key (auto included) so clearing a colour removes the
 * inline property and the stylesheet default takes over again.
 */
export function applyToolkitColors(
  root: HTMLElement,
  colors: ToolkitColors,
): void {
  for (const token of TOOLKIT_COLOR_TOKENS) {
    const value = colors[token.id];
    if (value) {
      root.style.setProperty(token.cssVar, value);
      if (token.id === 'accent') {
        root.style.setProperty(ON_ACCENT_VAR, readableForeground(value));
      }
    } else {
      root.style.removeProperty(token.cssVar);
      if (token.id === 'accent') root.style.removeProperty(ON_ACCENT_VAR);
    }
  }
}

/**
 * Keep `root` in step with storage. The content script calls this on admin
 * pages; the panel/dashboard call it so their previews show the real values.
 * Returns an unsubscribe function (app-lifetime surfaces never call it).
 */
export function watchToolkitColors(
  root: HTMLElement = document.documentElement,
): () => void {
  let colors: ToolkitColors = { ...AUTO };
  const apply = (): void => applyToolkitColors(root, colors);

  void readToolkitColors().then((stored) => {
    colors = stored;
    apply();
  });

  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ): void => {
    if (area !== 'local' || !(TOOLKIT_COLORS_KEY in changes)) return;
    colors = sanitize(changes[TOOLKIT_COLORS_KEY]?.newValue);
    apply();
  };
  browser.storage.onChanged.addListener(listener);

  return () => browser.storage.onChanged.removeListener(listener);
}
