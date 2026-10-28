// Feature: last-resort product lookup through the admin grid (AJAX).
import type { SearchMagentoResponse } from '../../../core/messages';

/** Last-resort lookup: search the open admin tab's product grid via AJAX. */
export async function handleSearchMagento(
  sku: string,
): Promise<SearchMagentoResponse> {
  const keyHash = location.href.match(/\/key\/([a-f0-9]+)\//)?.[1] ?? '';
  const formKey =
    document.querySelector<HTMLInputElement>('input[name="form_key"]')?.value ??
    '';
  const adminPath = location.pathname.match(/^(\/[^/]+\/)/)?.[1] ?? '/';
  let baseUrl = `${location.origin}${adminPath}mui/index/render`;
  if (keyHash) baseUrl += `/key/${keyHash}`;
  baseUrl += '/';

  const qs = new URLSearchParams();
  qs.append('namespace', 'product_listing');
  qs.append('isAjax', 'true');
  qs.append('form_key', formKey);
  qs.append('filters[placeholder][]', 'true');
  qs.append('filters[sku][value]', sku);
  qs.append('filters[sku][condition_type]', 'like');
  qs.append('paging[pageSize]', '20');
  qs.append('paging[currentPage]', '1');

  type GridItem = {
    sku?: string;
    entity_id?: string | number;
    id?: string | number;
  };
  try {
    const res = await fetch(`${baseUrl}?${qs.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    let items: GridItem[] = [];
    try {
      const data = JSON.parse(text) as {
        items?: GridItem[];
        data?: { items?: GridItem[] };
      };
      items = data.items ?? data.data?.items ?? [];
    } catch {
      const m = text.match(/"entity_id"\s*:\s*"?(\d+)"?/);
      if (m?.[1]) return { found: true, productId: m[1], children: [] };
      return {
        found: false,
        error: `Grid returned non-JSON (status ${res.status})`,
      };
    }
    const match =
      items.find(
        (it) => (it.sku ?? '').toLowerCase() === sku.toLowerCase(),
      ) ?? items[0];
    const productId = match
      ? String(match.entity_id ?? match.id ?? '')
      : '';
    if (productId) return { found: true, productId, children: [] };
    return { found: false, error: `SKU "${sku}" not found in the admin grid.` };
  } catch (err) {
    return {
      found: false,
      error: `Admin grid search failed: ${(err as Error).message}`,
    };
  }
}
