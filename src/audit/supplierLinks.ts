/**
 * Supplier attribution (port of `scripts/supplier-links.ps1`).
 *
 * Offline and deterministic: the supplier comes from the shared prefix rule
 * (`supplierFor`), the tier + official URLs from the confirmed tier list in
 * SYSTEM.md 1.7. Per-SKU catalog deep links are NOT resolved here (supplier
 * sites are JS-blocked) - `catalog` stays empty with a review flag until an
 * agent resolves it.
 */

import { supplierFor } from '../shared/resolver';

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

export interface SupplierLinkInfo {
  sku: string;
  supplier: SupplierName;
  tier: number;
  official: string;
  /** Alternative official site, when the supplier has one. */
  alt: string;
  /** Deep catalog product page - always '' until an agent resolves it. */
  catalog: string;
  reviewFlags: string[];
}

export function supplierLinkFor(sku: string): SupplierLinkInfo {
  const id = sku.trim().toUpperCase();
  const supplier = supplierFor(id) as SupplierName;
  const row = SUPPLIER_TABLE[supplier];
  const reviewFlags: string[] = [];
  if (!row.official) reviewFlags.push('no-public-supplier-url');
  reviewFlags.push('catalog-url-unresolved');
  return {
    sku: id,
    supplier,
    tier: row.tier,
    official: row.official,
    alt: row.alt,
    catalog: '',
    reviewFlags,
  };
}

/** Markdown block (same wording as the PowerShell generator). */
export function supplierBlock(info: SupplierLinkInfo, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  const lines: string[] = [];
  lines.push('## Supplier - ' + stamp);
  lines.push('');
  lines.push(`- Supplier: ${info.supplier} (Tier ${info.tier})`);
  lines.push(
    `- Official: ${info.official || '- (interno, no public URL)'}`,
  );
  if (info.alt) lines.push(`- Alt: ${info.alt}`);
  lines.push(
    '- Catalog product page: - (agent best-effort per role spec; blank = unresolved)',
  );
  lines.push('- Source: supplier-identifier tier list, offline (no live lookup this run)');
  return lines.join('\n');
}
