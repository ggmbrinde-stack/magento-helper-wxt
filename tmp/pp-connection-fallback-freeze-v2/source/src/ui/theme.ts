// Theme manager for the extension's own UI (side panel and dashboard).
//
// The palette is written onto a root element as CSS custom properties, so it
// reaches both a normal page (the dashboard, rooted at <html>) and the side
// panel, which lives inside a Shadow DOM (rooted at its shadow host: custom
// properties inherit from the host into the shadow tree).
//
// Nothing here touches Magento or Notion: this only themes our own surfaces.

import { browser } from 'wxt/browser';

export type ThemePreference =
  | 'system'
  | 'light'
  | 'dark'
  | 'high-contrast'
  | 'sepia'
  | 'blue-tinted';
export type ResolvedTheme =
  | 'light'
  | 'dark'
  | 'high-contrast'
  | 'sepia'
  | 'blue-tinted';

/** Storage key. Kept separate from the Magento/Notion settings. */
export const THEME_KEY = 'theme';

/**
 * Whether the Magento admin pages themselves get recoloured. Off by default:
 * repainting the whole admin is a big visual change, so it is opt-in, and it
 * only ever applies on top of the resolved theme.
 */
export const MAGENTO_THEME_KEY = 'themeMagentoPages';

/**
 * Optional accent override. One colour in, a coherent ramp out: the shade, the
 * pale tint and the readable foreground are all derived, so the operator never
 * has to pick four colours and can never pick an unreadable pair.
 */
export const THEME_ACCENT_KEY = 'themeAccent';

/**
 * Optional custom theme base colour. One colour in, a full surface palette out:
 * background, surface, borders, ink — all derived from the single choice so the
 * operator can never pick an unreadable theme.
 */
export const THEME_CUSTOM_KEY = 'themeCustom';

export interface AccentPreset {
  label: string;
  value: string | null;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { label: 'Default', value: null },
  { label: 'Pink', value: '#d81b60' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Teal', value: '#0f9b8e' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Amber', value: '#d97706' },
  { label: 'Slate', value: '#64748b' },
];

const DARK_MEDIA = '(prefers-color-scheme: dark)';

export interface ThemeOption {
  id: ThemePreference;
  label: string;
  hint: string;
}

/** The whole choice, deliberately: three options, no Save button. */
export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'system', label: 'System', hint: 'Follow the OS setting' },
  { id: 'light', label: 'Light', hint: 'Always light' },
  { id: 'dark', label: 'Dark', hint: 'Always dark' },
  { id: 'high-contrast', label: 'High contrast', hint: 'Black background, maximum-contrast text' },
  { id: 'sepia', label: 'Sepia', hint: 'Warm paper tone, easy on the eyes' },
  { id: 'blue-tinted', label: 'Blue tinted', hint: 'Cool slate-blue surface' },
];

type Palette = Record<string, string>;

/**
 * Every colour the UI uses. Adding a colour here is all it takes to theme a new
 * surface; both stylesheets only ever reference these names.
 */
const LIGHT: Palette = {
  '--mhx-bg': '#f6f7f9',
  '--mhx-surface': '#ffffff',
  '--mhx-surface-2': '#f5f7fa',
  '--mhx-border': '#e4e7eb',
  '--mhx-border-2': '#cbd2d9',
  '--mhx-ink': '#1f2933',
  '--mhx-ink-2': '#3e4c59',
  '--mhx-muted': '#7b8794',
  '--mhx-muted-2': '#52606d',
  '--mhx-accent': '#d81b60',
  '--mhx-accent-2': '#c2185b',
  '--mhx-tint': '#fce4ec',
  '--mhx-tint-2': '#f8bbd0',
  '--mhx-on-accent': '#ffffff',
  '--mhx-ok': '#0b6e4f',
  '--mhx-ok-bg': '#e6f4ea',
  '--mhx-ok-border': '#b7dfc2',
  '--mhx-bad': '#912018',
  '--mhx-bad-bg': '#fdecea',
  '--mhx-bad-border': '#f5b7b1',
  '--mhx-warn-bg': '#fff8e1',
  '--mhx-warn-border': '#ffe082',
  '--mhx-prio-high': '#d93025',
  '--mhx-prio-medium': '#f9ab00',
  '--mhx-prio-low': '#f57f17',
  '--mhx-shadow': '0 4px 16px rgba(0, 0, 0, 0.18)',
};

const DARK: Palette = {
  '--mhx-bg': '#14181d',
  '--mhx-surface': '#1c2229',
  '--mhx-surface-2': '#232b34',
  '--mhx-border': '#2e3843',
  '--mhx-border-2': '#3d4956',
  '--mhx-ink': '#e7ecf1',
  '--mhx-ink-2': '#c4cdd7',
  '--mhx-muted': '#98a5b3',
  '--mhx-muted-2': '#aebac6',
  '--mhx-accent': '#ff5c94',
  '--mhx-accent-2': '#ff86b0',
  '--mhx-tint': '#3a1e29',
  '--mhx-tint-2': '#4a2531',
  '--mhx-on-accent': '#12161b',
  '--mhx-ok': '#58d3a4',
  '--mhx-ok-bg': '#16302a',
  '--mhx-ok-border': '#2b5847',
  '--mhx-bad': '#ff9a91',
  '--mhx-bad-bg': '#3a211f',
  '--mhx-bad-border': '#6b3a35',
  '--mhx-warn-bg': '#3a3320',
  '--mhx-warn-border': '#6b5a24',
  '--mhx-prio-high': '#ff6b5e',
  '--mhx-prio-medium': '#ffc247',
  '--mhx-prio-low': '#ff9f1c',
  '--mhx-shadow': '0 4px 16px rgba(0, 0, 0, 0.5)',
};

const HIGH_CONTRAST: Palette = {
  '--mhx-bg': '#000000',
  '--mhx-surface': '#0a0a0a',
  '--mhx-surface-2': '#1a1a1a',
  '--mhx-border': '#ffffff',
  '--mhx-border-2': '#cccccc',
  '--mhx-ink': '#ffffff',
  '--mhx-ink-2': '#e0e0e0',
  '--mhx-muted': '#a0a0a0',
  '--mhx-muted-2': '#808080',
  '--mhx-accent': '#ffff00',
  '--mhx-accent-2': '#cccc00',
  '--mhx-tint': '#1a1a00',
  '--mhx-tint-2': '#333300',
  '--mhx-on-accent': '#000000',
  '--mhx-ok': '#00ff00',
  '--mhx-ok-bg': '#001a00',
  '--mhx-ok-border': '#006600',
  '--mhx-bad': '#ff0000',
  '--mhx-bad-bg': '#1a0000',
  '--mhx-bad-border': '#660000',
  '--mhx-warn-bg': '#1a1a00',
  '--mhx-warn-border': '#cccc00',
  '--mhx-prio-high': '#ff0000',
  '--mhx-prio-medium': '#ffff00',
  '--mhx-prio-low': '#ffffff',
  '--mhx-shadow': '0 4px 16px rgba(0, 0, 0, 1)',
};

const SEPIA: Palette = {
  '--mhx-bg': '#f4ecd8',
  '--mhx-surface': '#fdf6e3',
  '--mhx-surface-2': '#efe5d5',
  '--mhx-border': '#d4c3a5',
  '--mhx-border-2': '#c9b891',
  '--mhx-ink': '#3e2723',
  '--mhx-ink-2': '#5d4037',
  '--mhx-muted': '#8d6e63',
  '--mhx-muted-2': '#a1887f',
  '--mhx-accent': '#795548',
  '--mhx-accent-2': '#5d4037',
  '--mhx-tint': '#d7ccc8',
  '--mhx-tint-2': '#bcaaa4',
  '--mhx-on-accent': '#ffffff',
  '--mhx-ok': '#2e7d32',
  '--mhx-ok-bg': '#e8f5e9',
  '--mhx-ok-border': '#a5d6a7',
  '--mhx-bad': '#c62828',
  '--mhx-bad-bg': '#ffebee',
  '--mhx-bad-border': '#ef9a9a',
  '--mhx-warn-bg': '#fff3e0',
  '--mhx-warn-border': '#ffcc80',
  '--mhx-prio-high': '#c62828',
  '--mhx-prio-medium': '#f9a825',
  '--mhx-prio-low': '#fbc02d',
  '--mhx-shadow': '0 4px 16px rgba(0, 0, 0, 0.15)',
};

const BLUE_TINTED: Palette = {
  '--mhx-bg': '#0f172a',
  '--mhx-surface': '#1e293b',
  '--mhx-surface-2': '#334155',
  '--mhx-border': '#475569',
  '--mhx-border-2': '#64748b',
  '--mhx-ink': '#f1f5f9',
  '--mhx-ink-2': '#cbd5e1',
  '--mhx-muted': '#94a3b8',
  '--mhx-muted-2': '#64748b',
  '--mhx-accent': '#3b82f6',
  '--mhx-accent-2': '#2563eb',
  '--mhx-tint': '#1e3a5f',
  '--mhx-tint-2': '#2c5282',
  '--mhx-on-accent': '#ffffff',
  '--mhx-ok': '#22c55e',
  '--mhx-ok-bg': '#064e3b',
  '--mhx-ok-border': '#10b981',
  '--mhx-bad': '#ef4444',
  '--mhx-bad-bg': '#450a0a',
  '--mhx-bad-border': '#dc2626',
  '--mhx-warn-bg': '#713f12',
  '--mhx-warn-border': '#f59e0b',
  '--mhx-prio-high': '#ef4444',
  '--mhx-prio-medium': '#f59e0b',
  '--mhx-prio-low': '#eab308',
  '--mhx-shadow': '0 4px 16px rgba(0, 0, 0, 0.4)',
};

export const THEME_PALETTES: Record<ResolvedTheme, Palette> = {
  light: LIGHT,
  dark: DARK,
  'high-contrast': HIGH_CONTRAST,
  sepia: SEPIA,
  'blue-tinted': BLUE_TINTED,
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const body = match?.[1];
  if (!body) return null;
  const full =
    body.length === 3
      ? body
          .split('')
          .map((c) => c + c)
          .join('')
      : body;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && parseHex(value) !== null;
}

/**
 * A foreground that stays readable on `hex`, by perceived brightness rather
 * than by asking the operator. Used for accent-on-button text — including the
 * toolkit's custom accent (src/ui/tokens.ts), so one helper decides it.
 */
export function readableForeground(hex: string): string {
  return luminance(hex) > 0.5 ? '#12161b' : '#ffffff';
}

/** Blend `t` of `towards` into `from` (0 keeps `from`, 1 becomes `towards`). */
function mix(from: string, towards: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(towards);
  if (!a || !b) return from;
  return toHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

/** Perceived brightness: 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1;
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(rgb.r) +
    0.7152 * channel(rgb.g) +
    0.0722 * channel(rgb.b)
  );
}

/** Themes that use a dark surface. Used to pick the blend direction for accent ramps. */
function isDarkTheme(theme: ResolvedTheme): boolean {
  return theme === 'dark' || theme === 'high-contrast' || theme === 'blue-tinted';
}

/** Maps a resolved theme to a valid CSS color-scheme value. */
function colorSchemeFor(theme: ResolvedTheme): 'light' | 'dark' {
  return isDarkTheme(theme) ? 'dark' : 'light';
}

/**
 * Accent palette entries derived from one chosen colour: a shade for hover, a
 * pale wash blended into the current surface, and a foreground picked for
 * contrast rather than asked for.
 */
export function accentOverrides(accent: string, theme: ResolvedTheme): Palette {
  const base = THEME_PALETTES[theme];
  const surface = base['--mhx-surface'] ?? '#ffffff';
  // Normalise to `#rrggbb`: `isHexColor` also accepts `ff5c94` (and 3-digit
  // shorthand), but an *unprefixed* value is not a valid CSS colour, so the
  // custom property would be dropped and every `background: var(--mhx-accent)`
  // would fall back to transparent.
  const parsed = isHexColor(accent) ? parseHex(accent) : null;
  const clean = parsed
    ? toHex(parsed)
    : (base['--mhx-accent'] ?? accent);
  const towards = isDarkTheme(theme) ? '#ffffff' : '#000000';
  return {
    '--mhx-accent': clean,
    '--mhx-accent-2': mix(clean, towards, 0.18),
    '--mhx-tint': mix(surface, clean, isDarkTheme(theme) ? 0.22 : 0.12),
    '--mhx-tint-2': mix(surface, clean, isDarkTheme(theme) ? 0.34 : 0.22),
    '--mhx-on-accent': readableForeground(clean),
  };
}

/**
 * Theme palette entries derived from one chosen base colour: background,
 * surface, borders, ink — all blended toward light or dark so the result stays
 * readable on either surface.
 */
export function themeOverrides(baseColor: string, theme: ResolvedTheme): Palette {
  const parsed = isHexColor(baseColor) ? parseHex(baseColor) : null;
  if (!parsed) return {};
  const clean = toHex(parsed);
  const base = THEME_PALETTES[theme];
  const surface = base['--mhx-surface'] ?? '#ffffff';
  const bg = base['--mhx-bg'] ?? '#f6f7f9';
  const border = base['--mhx-border'] ?? '#e4e7eb';
  const isDark = isDarkTheme(theme);
  const towards = isDark ? '#000000' : '#ffffff';

  // Tint the background and surface toward the chosen colour
  const nextBg = mix(bg, clean, isDark ? 0.25 : 0.15);
  const nextSurface = mix(surface, clean, isDark ? 0.20 : 0.10);
  const ink = readableForeground(nextBg);

  return {
    '--mhx-bg': nextBg,
    '--mhx-surface': nextSurface,
    '--mhx-surface-2': mix(nextSurface, towards, 0.15),
    '--mhx-border': mix(border, clean, 0.35),
    '--mhx-border-2': mix(border, clean, 0.50),
    '--mhx-ink': ink,
    '--mhx-ink-2': mix(ink, towards, 0.30),
    '--mhx-muted': mix(ink, towards, 0.55),
    '--mhx-accent': clean,
    '--mhx-accent-2': mix(clean, towards, 0.18),
    '--mhx-on-accent': readableForeground(clean),
    '--mhx-tint': mix(nextSurface, clean, isDark ? 0.22 : 0.12),
    '--mhx-tint-2': mix(nextSurface, clean, isDark ? 0.34 : 0.22),
  };
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    value === 'system' ||
    value === 'light' ||
    value === 'dark' ||
    value === 'high-contrast' ||
    value === 'sepia' ||
    value === 'blue-tinted'
  );
}

/** What the OS currently asks for. Defaults to light where matchMedia is absent. */
export function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia(DARK_MEDIA).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/**
 * Write the palette onto a root element.
 *
 * `color-scheme` is set too, so native widgets and scrollbars inside that root
 * (selects, checkboxes, the scrollbar) follow the theme instead of staying
 * bright white on a dark surface.
 */
export function applyTheme(
  root: HTMLElement,
  preference: ThemePreference,
  accent?: string | null,
  customTheme?: string | null,
): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const palette: Palette = { ...THEME_PALETTES[resolved] };
  // Every key is written on every apply, so dropping a value restores the
  // built-in colours instead of leaving derived ones behind.
  if (accent) Object.assign(palette, accentOverrides(accent, resolved));
  if (customTheme) Object.assign(palette, themeOverrides(customTheme, resolved));
  for (const [name, value] of Object.entries(palette)) {
    root.style.setProperty(name, value);
  }
  root.style.colorScheme = colorSchemeFor(resolved);
  root.dataset['theme'] = resolved;
  root.dataset['themePreference'] = preference;
  return resolved;
}

export async function readThemePreference(): Promise<ThemePreference> {
  try {
    const data = await browser.storage.local.get([THEME_KEY]);
    const raw = data?.[THEME_KEY];
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export async function writeThemePreference(
  preference: ThemePreference,
): Promise<void> {
  await browser.storage.local.set({ [THEME_KEY]: preference });
}

export async function readThemeAccent(): Promise<string | null> {
  try {
    const data = await browser.storage.local.get([THEME_ACCENT_KEY]);
    const raw = data?.[THEME_ACCENT_KEY];
    return isHexColor(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function writeThemeAccent(
  accent: string | null,
): Promise<void> {
  await browser.storage.local.set({ [THEME_ACCENT_KEY]: accent });
}

export async function readThemeCustom(): Promise<string | null> {
  try {
    const data = await browser.storage.local.get([THEME_CUSTOM_KEY]);
    const raw = data?.[THEME_CUSTOM_KEY];
    return isHexColor(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function writeThemeCustom(
  custom: string | null,
): Promise<void> {
  await browser.storage.local.set({ [THEME_CUSTOM_KEY]: custom });
}

export async function readMagentoThemeEnabled(): Promise<boolean> {
  try {
    const data = await browser.storage.local.get([MAGENTO_THEME_KEY]);
    return data?.[MAGENTO_THEME_KEY] === true;
  } catch {
    return false;
  }
}

export async function writeMagentoThemeEnabled(
  enabled: boolean,
): Promise<void> {
  await browser.storage.local.set({ [MAGENTO_THEME_KEY]: enabled });
}

/**
 * Apply the theme and keep it applied.
 *
 * Call once per UI. Extra roots are for surfaces the document root cannot
 * reach — the side panel passes its shadow host, so the palette lands both on
 * `<html>` (page background behind the shadow) and inside the shadow tree.
 *
 * Returns an unsubscribe function.
 */
export function primeTheme(...extraRoots: HTMLElement[]): () => void {
  const roots = [document.documentElement, ...extraRoots];

  // Applied immediately with the OS value so the first paint is already themed
  // rather than flashing light while storage resolves.
  let preference: ThemePreference = 'system';
  let accent: string | null = null;
  let customTheme: string | null = null;
  const paint = (): void => {
    for (const root of roots) applyTheme(root, preference, accent, customTheme);
  };
  paint();

  void Promise.all([
    readThemePreference(),
    readThemeAccent(),
    readThemeCustom(),
  ]).then(
    ([storedPreference, storedAccent, storedCustom]) => {
      preference = storedPreference;
      accent = storedAccent;
      customTheme = storedCustom;
      paint();
    },
  );

  const onStorage = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ): void => {
    if (area !== 'local') return;
    let touched = false;
    if (THEME_KEY in changes) {
      const next = changes[THEME_KEY]?.newValue;
      preference = isThemePreference(next) ? next : 'system';
      touched = true;
    }
    if (THEME_ACCENT_KEY in changes) {
      const next = changes[THEME_ACCENT_KEY]?.newValue;
      accent = isHexColor(next) ? next : null;
      touched = true;
    }
    if (THEME_CUSTOM_KEY in changes) {
      const next = changes[THEME_CUSTOM_KEY]?.newValue;
      customTheme = isHexColor(next) ? next : null;
      touched = true;
    }
    if (touched) paint();
  };
  browser.storage.onChanged.addListener(onStorage);

  // While set to System, follow the OS live.
  const mq = window.matchMedia(DARK_MEDIA);
  const onSystemChange = (): void => {
    if (preference === 'system') paint();
  };
  mq.addEventListener('change', onSystemChange);

  return () => {
    browser.storage.onChanged.removeListener(onStorage);
    mq.removeEventListener('change', onSystemChange);
  };
}
