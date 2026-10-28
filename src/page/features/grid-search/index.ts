// Feature: last-resort product lookup through the admin grid (AJAX), plus the
// full child list read from the open product's Configurations matrix.
import type {
  ResolverChild,
  SearchMagentoResponse,
} from '../../../core/messages';
import { findConfigSection, isCollapsed } from '../../shared/config-section';

const CHILD_LINK = 'a[href*="/catalog/product/edit/id/"]';

interface ConfigChildren {
  children: ResolverChild[];
  reason: string;
}

/**
 * Read every assigned child (enabled or disabled) from the Configurations
 * matrix of the currently open product edit page.
 *
 * The admin matrix is status-blind, which is exactly why it is used: it is the
 * only available source for a colour/size whose storefront children are all
 * disabled, and therefore missing from the PDP's jsonConfig.
 *
 * Read-only: a collapsed section is reported, never expanded from here.
 */
export function readConfigurableChildren(productId: string): ConfigChildren {
  const edit = location.pathname.match(/\/catalog\/product\/edit\/id\/(\d+)/);
  if (!edit) {
    return {
      children: [],
      reason: 'open the parent product edit page to read every child',
    };
  }
  if (productId && edit[1] !== productId) {
    return {
      children: [],
      reason: `product ${productId} is not the one open in this tab`,
    };
  }

  const section = findConfigSection();
  if (!section) {
    return { children: [], reason: 'no Configurations section on this page' };
  }
  if (isCollapsed(section)) {
    return {
      children: [],
      reason: 'Configurations section is collapsed - expand it and resolve again',
    };
  }

  const table = section.querySelector<HTMLTableElement>(
    'table.admin__dynamic-rows, table.data-grid, table',
  );
  if (!table) {
    return { children: [], reason: 'no configuration rows yet' };
  }

  const header = Array.from(table.querySelectorAll('thead th')).map((th) =>
    (th.textContent ?? '').trim().toLowerCase(),
  );
  const col = (...names: string[]): number =>
    header.findIndex((h) => names.some((n) => h.includes(n)));
  const attrCol = col('attribute');
  const skuCol = col('sku');
  const statusCol = col('status');
  const attrIndex = attrCol >= 0 ? attrCol : 7;

  const children: ResolverChild[] = [];
  for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
    if (
      row.classList.contains('empty-text') ||
      row.classList.contains('data-grid-tr-no-data')
    ) {
      continue;
    }
    const cells = Array.from(row.querySelectorAll('td'));
    if (cells.length === 0) continue;

    const attrText = (cells[attrIndex]?.textContent ?? '').trim();
    const color =
      attrText.match(/(?:colou?r|cor)\s*:\s*([^,]+)/i)?.[1]?.trim() ?? '';
    const size =
      attrText.match(/(?:size|talla|tamanho|taille)\s*:\s*([^,]+)/i)?.[1]?.trim() ??
      '';

    const link = row.querySelector<HTMLAnchorElement>(CHILD_LINK);
    const id = link?.href.match(/\/edit\/id\/(\d+)/)?.[1] ?? '';
    if (!id) continue;

    const sku = skuCol >= 0 ? (cells[skuCol]?.textContent ?? '').trim() : '';
    const statusText =
      statusCol >= 0 ? (cells[statusCol]?.textContent ?? '').trim() : '';
    const enabled = statusText
      ? !/disab|inactiv|desactiv/i.test(statusText)
      : undefined;

    children.push({ id, sku, color, size, backend: link?.href ?? '', enabled });
  }

  if (children.length === 0) {
    return {
      children: [],
      reason: 'configuration rows are present but none could be read',
    };
  }
  return { children, reason: '' };
}

/** Search the open admin tab's product grid via AJAX. */
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
      if (m?.[1]) {
        return {
          found: true,
          productId: m[1],
          children: [],
          childrenReason: 'grid returned non-JSON, children not read',
        };
      }
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
    if (productId) {
      const config = readConfigurableChildren(productId);
      return {
        found: true,
        productId,
        children: config.children,
        childrenReason: config.reason,
      };
    }
    return { found: false, error: `SKU "${sku}" not found in the admin grid.` };
  } catch (err) {
    return {
      found: false,
      error: `Admin grid search failed: ${(err as Error).message}`,
    };
  }
}
