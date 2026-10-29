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

/** One lazy-loaded grid page, as the listing provider returns it. */
interface GridItem {
  sku?: string;
  entity_id?: string | number;
  id?: string | number;
  /** Status column: `1`/`2`, `Enabled`/`Disabled`, or a boolean. */
  status?: unknown;
}

/**
 * The product grid's Status column, normalised to the admin's own words.
 *
 * Magento returns `1`/`2` in JSON, `Enabled`/`Disabled` when the column is
 * rendered with its option labels, and `true`/`false` in some themes. An
 * unrecognised value is passed through untouched rather than guessed at, so the
 * resolver never claims a product is enabled without evidence.
 */
function statusLabel(raw: unknown): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'boolean') return raw ? 'Enabled' : 'Disabled';
  const text = String(raw).replace(/<[^>]*>/g, '').trim();
  if (!text) return '';
  if (/^(1|true|enabled|enable|active)$/i.test(text)) return 'Enabled';
  if (/^(2|false|disabled|disable|inactive)$/i.test(text)) return 'Disabled';
  return text;
}

/** Status cell -> the child's `enabled` flag; undefined when unreported. */
function statusEnabled(raw: unknown): boolean | undefined {
  const label = statusLabel(raw);
  if (label === 'Enabled') return true;
  if (label === 'Disabled') return false;
  return undefined;
}

/** Admin AJAX base for this tab: honours the secret `/key/<hash>/` segment. */
function gridBaseUrl(): string {
  const keyHash = location.href.match(/\/key\/([a-f0-9]+)\//)?.[1] ?? '';
  const adminPath = location.pathname.match(/^(\/[^/]+\/)/)?.[1] ?? '/';
  let url = `${location.origin}${adminPath}mui/index/render`;
  if (keyHash) url += `/key/${keyHash}`;
  return `${url}/`;
}

/**
 * Query the product listing grid. `like` is Magento's own condition, so a SKU
 * also returns every row whose SKU contains it (children, suffixed copies).
 */
async function queryGrid(
  sku: string,
  pageSize: number,
): Promise<{ items: GridItem[]; error: string; status: number }> {
  const formKey =
    document.querySelector<HTMLInputElement>('input[name="form_key"]')?.value ??
    '';
  const qs = new URLSearchParams();
  qs.append('namespace', 'product_listing');
  qs.append('isAjax', 'true');
  qs.append('form_key', formKey);
  qs.append('filters[placeholder][]', 'true');
  qs.append('filters[sku][value]', sku);
  qs.append('filters[sku][condition_type]', 'like');
  qs.append('paging[pageSize]', String(pageSize));
  qs.append('paging[currentPage]', '1');

  try {
    const res = await fetch(`${gridBaseUrl()}?${qs.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text) as {
        items?: GridItem[];
        data?: { items?: GridItem[] };
      };
      return {
        items: data.items ?? data.data?.items ?? [],
        error: '',
        status: res.status,
      };
    } catch {
      return {
        items: [],
        error: `Grid returned non-JSON (status ${res.status})`,
        status: res.status,
      };
    }
  } catch (err) {
    return {
      items: [],
      error: `Admin grid search failed: ${(err as Error).message}`,
      status: 0,
    };
  }
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

/**
 * Child rows as the grid reports them. No colour/size labels (the grid has no
 * such columns), but the child SKU and its status - which is what a human
 * searches for in Magento - are real.
 */
function childrenFromGrid(items: GridItem[], parentSku: string): ResolverChild[] {
  const wanted = parentSku.trim().toUpperCase();
  const out: ResolverChild[] = [];
  for (const item of items) {
    const sku = (item.sku ?? '').trim();
    if (!sku || sku.toUpperCase() === wanted) continue;
    const id = String(item.entity_id ?? item.id ?? '');
    if (!id) continue;
    out.push({
      id,
      sku,
      color: '',
      size: '',
      backend: '',
      enabled: statusEnabled(item.status),
    });
  }
  return out;
}

/** Search the open admin tab's product grid via AJAX. */
export async function handleSearchMagento(
  sku: string,
): Promise<SearchMagentoResponse> {
  const wanted = sku.trim().toUpperCase();
  const first = await queryGrid(sku, 20);
  if (first.error && first.items.length === 0) {
    return { found: false, error: first.error };
  }

  // The filter is `like`, so a search for M22480 also returns M224801 and the
  // children named M22480-BLUE. Only an exact SKU is the product itself;
  // falling back to items[0] silently resolved the wrong product.
  const match = first.items.find(
    (item) => (item.sku ?? '').trim().toUpperCase() === wanted,
  );
  const productId = match ? String(match.entity_id ?? match.id ?? '') : '';
  if (!productId) {
    const close = first.items
      .map((item) => (item.sku ?? '').trim())
      .filter(Boolean)
      .slice(0, 6)
      .join(', ');
    return {
      found: false,
      error: close
        ? `SKU "${sku}" has no exact row in the admin grid; the like-filter returned: ${close}.`
        : `SKU "${sku}" not found in the admin grid.`,
    };
  }

  const config = readConfigurableChildren(productId);
  let children = config.children;
  let childrenReason = config.reason;

  // The matrix is the only source with colour/size labels, but it needs the
  // parent's own edit page open. Fall back to the grid so the child SKUs (and
  // their status) still arrive from whatever admin page the operator is on.
  if (children.length === 0) {
    const wider = await queryGrid(sku, 100);
    const derived = childrenFromGrid(wider.items, sku);
    if (derived.length > 0) {
      children = derived;
      childrenReason =
        'child rows read from the product grid by SKU (colour/size labels need the parent edit page open)';
    } else if (wider.error) {
      childrenReason = `${childrenReason}; grid fallback failed: ${wider.error}`;
    }
  }

  return {
    found: true,
    productId,
    sku: (match?.sku ?? sku).trim(),
    status: statusLabel(match?.status),
    children,
    childrenReason,
  };
}
