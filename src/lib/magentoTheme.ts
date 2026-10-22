// Recolours the Magento admin pages the operator is looking at.
//
// It reuses the palette from `theme.ts`: the custom properties are written onto
// the page's <html>, and the stylesheet below only ever references them. That
// keeps one source of truth for both our own UI and the Magento chrome.
//
// Deliberately conservative:
// - Only surfaces are touched (backgrounds, text, borders, fields, grids,
//   buttons, modals). Magento's semantic feedback — `.message-*`, `.admin__field-error`,
//   `.admin__control-text._error`, validation states — is left alone so error
//   and warning styling keeps its meaning.
// - Nothing is written to Magento or Notion, and no request is made.
//
// Magento's admin markup varies by version and theme, so this is a first pass
// over the common surfaces. Missing spots get added as they are reported.

import {
  MAGENTO_THEME_KEY,
  THEME_ACCENT_KEY,
  THEME_KEY,
  THEME_PALETTES,
  applyTheme,
  isHexColor,
  isThemePreference,
  readMagentoThemeEnabled,
  readThemeAccent,
  readThemePreference,
  resolveTheme,
  type ThemePreference,
} from './theme';
import { browser } from 'wxt/browser';

const STYLE_ID = 'mhx-magento-theme';
const ACCENT_STYLE_ID = 'mhx-magento-accent';
const DARK_MEDIA = '(prefers-color-scheme: dark)';

/**
 * Surface overrides. Every value is a palette variable, so switching the theme
 * repaints the admin without rebuilding this sheet.
 */
export const MAGENTO_THEME_CSS = `
/* --- page shell ------------------------------------------------------- */
html, body { background: var(--mhx-bg) !important; color: var(--mhx-ink) !important; }
.page-wrapper, .page-content, .page-main, .main-col,
.admin__old, .content-header { background: var(--mhx-bg) !important; color: var(--mhx-ink) !important; }

/* --- header & page actions -------------------------------------------- */
.page-header { background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border) !important; }
.page-title, .page-title span, .admin__page-heading, .content-header h3 { color: var(--mhx-ink) !important; background: transparent !important; }
.page-main-actions, .page-actions { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; }
.page-actions .action-default, .page-main-actions .action-default { background: var(--mhx-surface-2) !important; border-color: var(--mhx-border-2) !important; color: var(--mhx-ink) !important; }
.page-actions .action-primary, .page-main-actions .action-primary,
.action-primary { background: var(--mhx-accent) !important; border-color: var(--mhx-accent) !important; color: var(--mhx-on-accent) !important; }

/* --- panels, fieldsets, tabs ------------------------------------------ */
.admin__fieldset, fieldset, .admin__field, .admin__field-control, .admin__fieldset-wrapper,
.entry-edit, .fieldset-wrapper, .box, .admin__collapsible-block { background: transparent !important; color: var(--mhx-ink) !important; }
.admin__fieldset > .admin__fieldset-wrapper-title, .admin__collapsible-title,
.admin__fieldset-wrapper-title { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; color: var(--mhx-ink) !important; }
.admin__field-label, .admin__fieldset-wrapper-title strong, label, .label { color: var(--mhx-ink-2) !important; }
.admin__field-note, .admin__field-error + .admin__field-note, .note { color: var(--mhx-muted) !important; }
.admin__page-nav, .admin__page-nav-items, .admin__page-nav-title { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; }
.admin__page-nav-item, .admin__page-nav-link { color: var(--mhx-ink) !important; }
.admin__page-nav-item._active, .admin__page-nav-link._active { background: var(--mhx-tint) !important; color: var(--mhx-accent-2) !important; }

/* --- form controls ---------------------------------------------------- */
.admin__control-text, .admin__control-select, .admin__control-textarea,
.admin__control-multiselect, .admin__control-file, .admin__control-tel,
.admin__field-control input, .admin__field-control select, .admin__field-control textarea,
.input-text, select, textarea {
  background: var(--mhx-surface) !important;
  color: var(--mhx-ink) !important;
  border-color: var(--mhx-border-2) !important;
}
.admin__control-text:focus, .admin__control-select:focus, .admin__control-textarea:focus { border-color: var(--mhx-accent) !important; }

/* --- grids ------------------------------------------------------------ */
.admin__data-grid-wrap, .admin__data-grid-outer-wrap, .admin__data-grid-header,
.data-grid, .admin__table-primary, .admin__table-secondary { background: var(--mhx-surface) !important; border-color: var(--mhx-border) !important; color: var(--mhx-ink) !important; }
table.data-grid thead th, .admin__table-primary thead th { background: var(--mhx-surface-2) !important; color: var(--mhx-ink-2) !important; border-color: var(--mhx-border) !important; }
table.data-grid tbody td, .admin__table-primary tbody td { background: transparent !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border) !important; }
table.data-grid tbody tr:hover > td, table.data-grid tbody tr._odd > td { background: var(--mhx-surface-2) !important; }
.data-grid-filters input, .data-grid-filters select, .data-grid-search-control input { background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border-2) !important; }
.admin__data-grid-toolbar, .sticky-header { background: var(--mhx-surface) !important; }
.admin__control-support-text { color: var(--mhx-muted) !important; }

/* --- buttons & dropdowns --------------------------------------------- */
.action-default, .action-secondary, .admin__action-dropdown,
.admin__action-multiselect, .admin__action-dropdown-text { background: var(--mhx-surface-2) !important; border-color: var(--mhx-border-2) !important; color: var(--mhx-ink) !important; }
.action-default:hover, .admin__action-dropdown:hover { background: var(--mhx-surface) !important; }
/* --- action dropdown menus, including nested submenus -------------------
   Magento renders the bulk "Actions" menu as ul.action-menu with items as
   <span class="action-menu-item">, and puts a submenu on its own white
   background one level deeper. Direct-child selectors miss all of that, which
   is how a maroon highlight ended up on a white submenu. Descendant selectors
   everywhere so every level is themed. ---------------------------------- */
.admin__action-dropdown-menu, .admin__action-multiselect-menu, .action-menu,
.admin__action-dropdown-menu ul, .admin__action-multiselect-menu ul, .action-menu ul {
  background: var(--mhx-surface) !important;
  border-color: var(--mhx-border) !important;
  color: var(--mhx-ink) !important;
}
.admin__action-dropdown-menu li, .admin__action-multiselect-menu li, .action-menu li,
.admin__action-dropdown-menu li > a, .admin__action-dropdown-menu li > span,
.admin__action-multiselect-menu li > a, .admin__action-multiselect-menu li > span,
.action-menu li > a, .action-menu li > span, .action-menu-item {
  background: transparent !important;
  color: var(--mhx-ink) !important;
}
/* Hover and open states: keep the accent wash but always the readable ink. */
.admin__action-dropdown-menu li:hover, .admin__action-multiselect-menu li:hover,
.action-menu li:hover, .action-menu li._active, .action-menu li.active,
.admin__action-dropdown-menu li._active, .admin__action-dropdown-menu li.active {
  background: var(--mhx-tint) !important;
}
.admin__action-dropdown-menu li:hover > a, .admin__action-dropdown-menu li:hover > span,
.action-menu li:hover > a, .action-menu li:hover > span, .action-menu li:hover .action-menu-item,
.admin__action-dropdown-menu li._active > span, .action-menu li._active > span {
  background: transparent !important;
  color: var(--mhx-ink) !important;
}

/* --- modals, menus, misc surfaces ------------------------------------ */
.modal-popup .modal-inner-wrap, .modal-slide .modal-inner-wrap,
.modal-popup .modal-header, .modal-popup .modal-content, .modal-popup .modal-footer {
  background: var(--mhx-surface) !important; color: var(--mhx-ink) !important; border-color: var(--mhx-border) !important;
}
.admin__data-grid-loading-mask { background: color-mix(in srgb, var(--mhx-bg) 70%, transparent) !important; }
.admin__field-error, .message-error, .message-warning, .message-success, .message-notice { /* left to Magento */ }

`;

/**
 * Accent-only overrides. Deliberately separate from the surface sheet: these
 * also apply to the light admin, and only when the operator has actually chosen
 * an accent colour, so a default install keeps Magento's own link and button
 * palette.
 */
export const MAGENTO_ACCENT_CSS = `
/* links: row links, toolbar links, "Clear all" and friends */
.page-wrapper a:not(.logo):not(.admin__action-dropdown):not(.action-primary):not(.action-default):not(.action-menu-item) { color: var(--mhx-accent) !important; }
.page-wrapper a:not(.logo):not(.admin__action-dropdown):not(.action-primary):not(.action-default):not(.action-menu-item):hover { color: var(--mhx-accent-2) !important; }

/* primary buttons: "Add Product", "Save", grid toolbar primaries */
.action-primary, .page-actions .action-primary, .page-actions-buttons .action-primary,
.admin__data-grid-toolbar .action-primary {
  background: var(--mhx-accent) !important;
  border-color: var(--mhx-accent) !important;
  color: var(--mhx-on-accent) !important;
}
.action-primary:hover, .action-primary:focus {
  background: var(--mhx-accent-2) !important;
  border-color: var(--mhx-accent-2) !important;
  color: var(--mhx-on-accent) !important;
}

/* secondary buttons pick the accent up on interaction, not at rest */
.action-default:hover, .action-secondary:hover, .admin__action-dropdown:hover {
  border-color: var(--mhx-accent) !important;
  color: var(--mhx-accent) !important;
}

/* selected / active states */
.admin__action-dropdown._active .admin__action-dropdown-text,
.admin__page-nav-link._active, .admin__page-nav-item._active { color: var(--mhx-accent) !important; }
.admin__page-nav-link._active, .admin__page-nav-item._active {
  background: var(--mhx-tint) !important;
  border-color: var(--mhx-accent) !important;
}

/* focus rings */
.admin__control-text:focus, .admin__control-select:focus, .admin__control-textarea:focus,
.data-grid-filters input:focus, .data-grid-filters select:focus, .data-grid-search-control input:focus {
  border-color: var(--mhx-accent) !important;
  box-shadow: 0 0 0 1px var(--mhx-accent) !important;
}

/* native controls */
.page-wrapper input[type="checkbox"], .page-wrapper input[type="radio"] { accent-color: var(--mhx-accent) !important; }
`;

let applied = false;

/**
 * Every property name applyTheme can write. Taken from the palette rather than
 * from `style` itself: custom properties are not enumerable on
 * CSSStyleDeclaration, so scanning it would silently remove nothing.
 */
const PALETTE_KEYS = Object.keys(THEME_PALETTES.light);

/** Remove the overrides and the palette we put on the page. */
export function clearMagentoPageTheme(): void {
  document.getElementById(STYLE_ID)?.remove();
  document.getElementById(ACCENT_STYLE_ID)?.remove();
  if (applied) {
    const root = document.documentElement;
    root.style.colorScheme = '';
    delete root.dataset['theme'];
    delete root.dataset['themePreference'];
    for (const name of PALETTE_KEYS) root.style.removeProperty(name);
  }
  applied = false;
}

/** Inject or remove one stylesheet by id. */
function syncSheet(id: string, css: string | null): void {
  const existing = document.getElementById(id);
  if (!css) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Apply the admin-page theme.
 *
 * Two independent layers:
 * - the palette is always published, because our own injected widgets (copy
 *   buttons, the segmented pager) read `--mhx-*` on every admin page. The page
 *   is light unless the operator asked for the dark admin.
 * - the accent sheet is added only when an accent colour was chosen, and it
 *   applies to the light admin too. That is what makes links, primary buttons
 *   and focus rings follow the accent. No accent → Magento's own colours.
 */
export function applyMagentoPageTheme(
  enabled: boolean,
  preference: ThemePreference,
  accent: string | null = null,
): void {
  const dark = enabled && resolveTheme(preference) === 'dark';

  applyTheme(document.documentElement, dark ? 'dark' : 'light', accent);
  syncSheet(STYLE_ID, dark ? MAGENTO_THEME_CSS : null);
  syncSheet(ACCENT_STYLE_ID, accent ? MAGENTO_ACCENT_CSS : null);
  applied = true;
}

/**
 * Keep the admin page in step with the stored preference.
 * Called once from the content script. Returns an unsubscribe function.
 */
export function watchMagentoPageTheme(): () => void {
  let enabled = false;
  let preference: ThemePreference = 'system';
  let accent: string | null = null;

  const apply = (): void => applyMagentoPageTheme(enabled, preference, accent);

  void Promise.all([
    readMagentoThemeEnabled(),
    readThemePreference(),
    readThemeAccent(),
  ]).then(([on, pref, storedAccent]) => {
    enabled = on;
    preference = pref;
    accent = storedAccent;
    apply();
  });

  const onStorage = (
    changes: Record<string, { newValue?: unknown }>,
    area: string,
  ): void => {
    if (area !== 'local') return;
    let touched = false;
    if (MAGENTO_THEME_KEY in changes) {
      enabled = changes[MAGENTO_THEME_KEY]?.newValue === true;
      touched = true;
    }
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
    if (touched) apply();
  };
  browser.storage.onChanged.addListener(onStorage);

  // Follow the OS only while the preference is System.
  const mq = window.matchMedia(DARK_MEDIA);
  const onSystemChange = (): void => {
    if (preference === 'system' && enabled) apply();
  };
  mq.addEventListener('change', onSystemChange);

  return () => {
    browser.storage.onChanged.removeListener(onStorage);
    mq.removeEventListener('change', onSystemChange);
  };
}
