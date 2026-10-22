// Icon utilities for toolkit primitives (UI-TOOLKIT.md §2.3 - icon option).
// Currently a stub; expanded as needed when features use icon buttons.

/** SVG icon path data for common toolkit icons. */
export const ICONS = {
  /** Small close/remove icon (16x16). */
  close: 'M12 3.586l-8 8a1 1 0 0 0 0 1.414l8 8a1 1 0 0 0 1.414-1.414L4.414 12 12 4.414l7.586 7.586a1 1 0 0 0 1.414-1.414l-8-8a1 1 0 0 0-1.414 0z',
  /** Small checkmark icon (16x16). */
  check: 'M12 1.586l-8 8a1 1 0 0 0 0 1.414l8 8a1 1 0 0 0 1.414-1.414L4.414 12 12 4.414l7.586 7.586a1 1 0 0 0 1.414-1.414l-8-8a1 1 0 0 0-1.414 0z',
  /** Copy icon (16x16). */
  copy: 'M4.5 4.5h2A2.5 2.5 0 0 1 9 7v4A2.5 2.5 0 0 1 6.5 13.5h-1A1 1 0 0 1 4.5 12.5v-6A1.5 1.5 0 0 1 6 5h6A1.5 1.5 0 0 1 13.5 6.5v1A1 1 0 0 1 12.5 8.5h-6A2.5 2.5 0 0 1 4.5 6v-1.5z',
  /** Small chevron down for dropdowns (16x16). */
  chevronDown: 'M3 6.5h10L10 11 4 6.5V3h2V6.5z',
  /** Small chevron right for expanders (16x16). */
  chevronRight: 'M7 3l5 5-5 5V3z',
} as const;

/** Create an SVG icon element for use inside button primitives. */
export function icon(name: keyof typeof ICONS, size = 16): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('width', String(size));
  path.setAttribute('height', String(size));
  path.setAttribute('viewBox', '0 0 16 16');
  path.setAttribute('stroke', 'none');
  return path;
}
