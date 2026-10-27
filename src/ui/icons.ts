// Icon utilities for toolkit primitives (UI-TOOLKIT.md §2.3 - icon option).

/** SVG icon path data for common toolkit icons. */
export const ICONS = {
  /** Small close/remove icon (16x16). */
  close: 'M4 4 12 12 M12 4 4 12',
  /** Small checkmark icon (16x16). */
  check: 'M2 8.5 6 12.5 14 4.5 12.5 3 6 9.5 3.5 7z',
  /** Copy icon (16x16). */
  copy: 'M8 5h7v10H8z M5 8H3V2h9v3',
  /** Open-in-new-tab icon (16x16). */
  externalLink: 'M10 2h4v4 M14 2 7 9 M12 8v6H2V4h6',
  /** Small chevron down for dropdowns (16x16). */
  chevronDown: 'M3 6.5h10L10 11 4 6.5V3h2V6.5z',
  /** Small chevron right for expanders (16x16). */
  chevronRight: 'M7 3l5 5-5 5V3z',
} as const;
