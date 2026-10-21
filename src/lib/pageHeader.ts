// Move a page's action bar (the strip holding "Add Product", "Save", …) into
// the admin header, next to the global search, notifications and user block.
//
// Magento renders the actions in `.page-main-actions` / `.page-actions`, a
// full-width strip under the page title. Moving the existing element — never
// rebuilding the buttons — keeps every handler, confirmation and ACL check
// intact; nothing is written and no request is made.
//
// Idempotent: Magento replaces parts of the header on some navigations, and the
// content script re-scans on every DOM mutation, so the move re-applies cleanly.

const MOVED_CLASS = 'mhx-header-actions';
const STYLE_ID = 'mhx-page-header-styles';

/** Where the actions belong: just before the right-hand header cluster. */
const HEADER_ANCHOR =
  '.admin-user, .notifications, .search-global, .search-global-init';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = HEADER_STYLES;
  (document.head ?? document.documentElement).appendChild(style);
}

/**
 * Returns true when this call moved something.
 * Does nothing when the page has no header or no actions (login, dashboards,
 * modals with their own footers).
 */
export function movePageActionsToHeader(): boolean {
  const header = document.querySelector<HTMLElement>('header.page-header');
  if (!header) return false;
  if (header.querySelector(`.${MOVED_CLASS}`)) return false;

  const bar = document.querySelector<HTMLElement>('.page-main-actions');
  // Fall back to the buttons container on pages that do not use the strip.
  const source = bar ?? document.querySelector<HTMLElement>('.page-actions');
  if (!source) return false;
  if (source.closest('.modal-popup, .modal-slide, .admin__scope-old form')) {
    return false;
  }

  injectStyles();
  source.classList.add(MOVED_CLASS);

  // `insertBefore` needs the reference node to be a *direct* child. Magento
  // nests the user block inside a header wrapper on some themes, and passing a
  // descendant threw NotFoundError.
  const anchor =
    Array.from(header.children).find(
      (child) =>
        child.matches(HEADER_ANCHOR) ||
        child.querySelector(HEADER_ANCHOR) !== null,
    ) ?? null;
  header.insertBefore(source, anchor);

  return true;
}

const HEADER_STYLES = `
header.page-header > .mhx-header-actions {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 16px 0 0 !important;
  padding: 0 !important;
  height: auto !important;
  min-height: 0 !important;
  width: auto !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  float: none !important;
  position: static !important;
  flex: 0 0 auto !important;
}
header.page-header > .mhx-header-actions .page-actions,
header.page-header > .mhx-header-actions .page-actions-buttons {
  display: inline-flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  float: none !important;
}
header.page-header > .mhx-header-actions .action-primary,
header.page-header > .mhx-header-actions .action-default {
  margin: 0 !important;
  white-space: nowrap !important;
}
`;
