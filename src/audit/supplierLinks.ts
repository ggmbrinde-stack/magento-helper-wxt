/**
 * Supplier attribution (port of `scripts/supplier-links.ps1`).
 *
 * Offline and deterministic: the supplier comes from the shared prefix rule
 * (`supplierFor`), the tier + official URLs from the confirmed tier list in
 * SYSTEM.md 1.7.
 *
 * Catalogue deep links (D1) are resolved from three sources, in order:
 *
 *   1. Notion - the SKU Library `Supplier Product` column (a human confirmed it);
 *   2. `rules/supplierCatalog.ts` - the hand-maintained SKU -> URL map;
 *   3. the ROLY `/model_PO<digits>` pattern - kept, but always marked
 *      `guessed`, because a guess must never be reported as a fact.
 *
 * TOPTEX has no known product-URL pattern, so without (1) or (2) it stays
 * `catalogSource: 'none'` and the availability check says so instead of
 * inventing a slug. ALLBEST is internal and has no public catalogue at all.
 */

import { supplierFor } from '../shared/resolver';
import { SUPPLIER_CATALOG } from './rules/supplierCatalog';

export type SupplierName = 'ROLY' | 'TOPTEX' | 'ALLBEST';

interface SupplierRow {
  tier: number;
  official: string;
  alt: string;
}

/** Confirmed tier list (records/SYSTEM.md sec 1.7). */
export const SUPPLIER_TABLE: Record<SupplierName, SupplierRow> = {
  ROLY: { tier: 2, official: 'https://roly.pt', alt: 'https://rolymalta.com' },
  TOPTEX: { tier: 10, official: 'https://toptex.eu', alt: '' },
  // ALLBEST is an internal supplier: no public site exists.
  ALLBEST: { tier: 6, official: '', alt: '' },
};

/** Where a catalogue URL came from. `guessed` is always disclosed as such. */
export type CatalogSource = 'notion' | 'map' | 'guessed' | 'none';

export interface SupplierLinkInfo {
  sku: string;
  supplier: SupplierName;
  tier: number;
  official: string;
  /** Alternative official site, when the supplier has one. */
  alt: string;
  /** Best catalogue URL we have; '' when none is known. */
  catalog: string;
  catalogSource: CatalogSource;
  /** Pattern-derived candidate, kept even when a better URL wins. */
  guessed: string;
  /** True when the supplier publishes no public catalogue (ALLBEST). */
  internalOnly: boolean;
  reviewFlags: string[];
}

export interface SupplierLinkInput {
  /** SKU Library `Supplier Product` column, when the row has one. */
  catalogUrl?: string;
  /** SKU Library `Supplier Link` column (official site override). */
  supplierUrl?: string;
}

/**
 * The legacy pattern guess. Only ROLY's catalogue exposes a stable
 * `/model_<REF>` shape; nothing is guessed for the other suppliers.
 */
export function guessCatalogUrl(sku: string, supplier: SupplierName): string {
  if (supplier !== 'ROLY') return '';
  const m = /(\d+)\s*$/.exec(sku.trim().toUpperCase());
  const digits = m?.[1] ?? '';
  if (!digits) return '';
  return `https://www.roly.es/es/model_PO${digits}`;
}

export function supplierLinkFor(
  sku: string,
  input: SupplierLinkInput = {},
): SupplierLinkInfo {
  const id = sku.trim().toUpperCase();
  const supplier = supplierFor(id) as SupplierName;
  const row = SUPPLIER_TABLE[supplier];
  const guessed = guessCatalogUrl(id, supplier);
  const internalOnly = supplier === 'ALLBEST';

  const fromNotion = (input.catalogUrl ?? '').trim();
  const fromMap = (SUPPLIER_CATALOG[id] ?? '').trim();
  let catalog = '';
  let catalogSource: CatalogSource = 'none';
  if (fromNotion) {
    catalog = fromNotion;
    catalogSource = 'notion';
  } else if (fromMap) {
    catalog = fromMap;
    catalogSource = 'map';
  } else if (guessed) {
    catalog = guessed;
    catalogSource = 'guessed';
  }

  const reviewFlags: string[] = [];
  if (!row.official) reviewFlags.push('no-public-supplier-url');
  if (internalOnly) {
    reviewFlags.push('internal-only-supplier');
  } else if (!catalog) {
    reviewFlags.push('catalog-url-missing');
  } else if (catalogSource === 'guessed') {
    reviewFlags.push('catalog-url-guessed');
  }

  return {
    sku: id,
    supplier,
    tier: row.tier,
    official: (input.supplierUrl ?? '').trim() || row.official,
    alt: row.alt,
    catalog,
    catalogSource,
    guessed,
    internalOnly,
    reviewFlags,
  };
}

/** Markdown block (same wording as the PowerShell generator, plus D1 fields). */
export function supplierBlock(info: SupplierLinkInfo, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const lines: string[] = [];
  lines.push('## Supplier - ' + stamp);
  lines.push('');
  lines.push(`- Supplier: ${info.supplier} (Tier ${info.tier})`);
  lines.push(`- Official: ${info.official || '- (interno, no public URL)'}`);
  if (info.alt) lines.push(`- Alt: ${info.alt}`);
  if (info.catalog) {
    const label =
      info.catalogSource === 'guessed'
        ? 'guessed from the SKU digits - verify once'
        : `confirmed via ${info.catalogSource}`;
    lines.push(`- Catalog product page: ${info.catalog} (${label})`);
  } else {
    lines.push(
      '- Catalog product page: - (unresolved: add the URL to the SKU Library Supplier Product column)',
    );
  }
  lines.push('- Source: supplier-identifier tier list, offline (no live lookup this run)');
  return lines.join('\n');
}
