// Feature flags shared across the extension.

// Board direction (2026-10-16): all page-data WRITES are paused. The M3a
// apply/undo machinery stays in the codebase but no write may reach a live
// Magento form until this is deliberately turned back on. Both the panel
// (hides/enables the buttons) and the content script (rejects APPLY_FIELD)
// honor this flag, so the pause cannot be bypassed by a stray message.
export const WRITES_ENABLED = false;

// Notion writes (board direction, 2026-10-19): Listing Errors rows may be
// created only, never updated/deleted/appended. The background handler is the
// only writer, and every push also requires an explicit `confirm: true` from
// the UI. SKU Library writes have a separate flag below. The static guard
// enforces these database-specific request boundaries. Set to false to return
// the extension to a pure Notion reader.
export const NOTION_WRITES_ENABLED = true;

// SKU Library updates (board direction, 2026-10-19): updates are limited to
// the fixed property whitelist in skuLibraryWriter.ts. Listing Errors remains
// strictly create-only. Updates match an exact SKU title, are diffed and read
// back, and require explicit push confirmation. The static guard permits the
// PATCH call only in src/lib/skuLibraryWriter.ts. Set false to disable updates
// to existing SKU Library rows (new-row creation remains available).
export const NOTION_LIBRARY_UPDATES_ENABLED = true;

// Dropdown enhancement (2026-10-16): the page-UI half of the spike asking
// whether the extension can reshape a Magento admin menu. This is neither a
// Magento write nor a Notion write — the native <select> stays in the page and
// keeps the real value, nothing is saved, and no request is made. Only the
// operator's control changes. Set to false to hand the admin's stock dropdowns
// back exactly as Magento rendered them.
export const ENHANCE_SELECTS = true;

// Only dropdowns with at least this many options are replaced. Short lists are
// faster to use as Magento rendered them, so they are deliberately left alone.
export const ENHANCE_MIN_OPTIONS = 12;

// Row action selector (2026-10-19): the product grid's per-row "Select ▾"
// dropdown becomes an inline selector. Same terms as the select enhancement —
// Magento's own menu stays in the page and every click is forwarded to it, so
// nothing is written and no request is made. Set to false to give the grid's
// stock row dropdowns back.
export const ENHANCE_ROW_ACTIONS = true;

// Massaction buttons (2026-10-20, every option 2026-10-22): the grid
// toolbar's bulk "Actions" dropdown becomes one-click inline buttons
// (Delete, Change status, Update attributes, …) so bulk actions stop costing
// a menu-open plus a pick. Same forwarding contract as row actions: every
// button clicks Magento's OWN menu element, so the massaction selection
// check, confirmation modals, KO handlers and ACL filtering all keep
// running. Submenu options ("Change status ▾") open the native dropdown and
// forward the pick — only Magento can expand its submenu — and the dropdown
// itself is never hidden, so its children stay reachable. Nothing is
// submitted, written or requested by the extension; with no rows selected
// Magento replies exactly as it would for the stock menu. Set to false to
// give the toolbar's stock Actions dropdown back.
export const ENHANCE_MASSACTIONS = true;

// Admin sidebar toggle (2026-10-20): a fixed chevron on the nav's edge
// hides/shows the left admin menu so the grid gets the width back. Purely
// display: nav `display:none` + the measured content offset (margin-left)
// zeroed while hidden and restored exactly on expand. No request, no form
// state; the choice persists per origin in localStorage. The toggle only
// renders on pages that actually have the admin nav. Set to false to pin
// the sidebar open exactly as Magento ships it.
export const ENHANCE_NAV_TOGGLE = true;

// Paging sizes (2026-10-19): the grid's "500 Select per page" control is a
// Magento `.selectmenu`, not a <select>, so it needs its own handling. Numeric
// sizes become a segmented control; a custom size leaves the stock widget
// alone. Same terms: the original buttons keep their handlers, nothing is
// written. Set to false to restore Magento's widget.
export const ENHANCE_PAGING_SIZES = true;

// Active filter chips (2026-10-20): every chip in the grid's "Active filters"
// strip gets a pencil that edits its value inline — no filter menu round-trip.
// Applying writes the value into Magento's own filter field and then clicks
// the panel's native Apply button (form submit / Enter on the field as
// fallbacks), so it is a grid re-query — the exact request "Apply filters"
// already sends. A search, never a data write; the pencil only appears when
// the chip resolves to exactly one editable field. Set to false to leave the
// strip as Magento rendered it.
export const ENHANCE_ACTIVE_FILTERS = true;

// Category tree (Update Attributes page): the mass-attributes Categories tree
// renders fully expanded, so it gets per-branch toggles, Collapse/Expand all,
// a Tree | List switch, a filter over names and Notion index numbers, a
// "Selected only" filter and a pills strip of the checked categories. Display
// parts flip visibility/badges/chips only; the one state change is the
// check-path cascade (ticking a category also ticks its ancestors up to the
// root item — the operator's own selection, through Magento's checkboxes,
// never a request or a Save).
// Set to false to leave Magento's tree exactly as rendered.
export const ENHANCE_CATEGORY_TREE = true;

// Page actions (2026-10-19): move the page's action bar ("Add Product", "Save",
// …) from the strip under the title into the admin header, next to the search,
// notification and user controls. A pure DOM move of Magento's own element, so
// every handler and confirmation still works.
//
// OFF by default (2026-10-19): the move was reverted on request — "Add Product"
// goes back to the stock strip under the title. The capability is kept intact,
// so switching it back on re-enables the header placement.
export const MOVE_PAGE_ACTIONS = false;
