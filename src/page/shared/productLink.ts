// Where a grid row's product lives.
//
// The products grid does not always render the name as a link, so a row can
// hold no href at all. The id is still there — in the row's `data-id`, or in the
// ID cell — and the admin base path (the secret `/admin_xxxxx` prefix) is in the
// current URL. Combining them gives the product edit page without asking
// Magento for anything or guessing a route.

/** The `/admin_xxxxx` prefix of the current admin URL ('' when already at root). */
export function adminBasePath(pathname: string): string {
  const match = /^(.*?)\/catalog\//.exec(pathname);
  return match?.[1] ?? '';
}

/** Row id from `data-id`, or from the grid's ID cell. */
export function productIdOf(row: Element): string | null {
  const fromAttr = (row.getAttribute('data-id') ?? '').trim();
  if (/^\d+$/.test(fromAttr)) return fromAttr;

  const cell = row.querySelector(
    'td[data-index="entity_id"], td[data-index="id"], td[data-col="entity_id"]',
  );
  const id = (cell?.textContent ?? '').trim();
  return /^\d+$/.test(id) ? id : null;
}

/**
 * The product edit URL for this row, or null when the row has no usable id.
 *
 * An existing edit link wins: it already carries the right admin path, store
 * scope and any extra parameters Magento added.
 */
export function productEditUrl(
  row: Element,
  origin: string,
  pathname: string,
): string | null {
  const link = row.querySelector<HTMLAnchorElement>(
    'a[href*="/catalog/product/edit/id/"]',
  );
  if (link?.href) return link.href;

  const id = productIdOf(row);
  if (!id) return null;
  return `${origin}${adminBasePath(pathname)}/catalog/product/edit/id/${id}/`;
}
