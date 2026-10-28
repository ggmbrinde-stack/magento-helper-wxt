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

import { ensureUi } from '../../../ui';

const MOVED_CLASS = 'mhx-header-actions';

/** Where the actions belong: just before the right-hand header cluster. */
const HEADER_ANCHOR =
  '.admin-user, .notifications, .search-global, .search-global-init';

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

  ensureUi();
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


