/**
 * Dossier body generator for the SKU Library page.
 *
 * Mirrors `generate-libcontent.ps1` so the extension writes the same page body
 * the old audit pipeline produced: Facts, Text facts, Child links (grouped by
 * colour, capped at 8 per group), Open findings (with Notion row links + Fix
 * text), and Retired findings. Output is markdown; callers convert it with
 * `markdownToNotionBlocks` before sending it as `children`.
 *
 * Pure: no network, no Notion. Inputs are the in-memory objects already
 * produced by `runSku` plus the Notion row ids collected during push.
 */

import type { ResolverJson } from '../shared/resolver';
import type { MagentoBuild, MagentoRow } from '../shared/magento';
import type { VariantSummary } from './variants';
import type { ImageAuditResult } from './imageAudit';
import type { ListingErrorPayload } from './payload';
import type { SupplierLinkInfo } from './supplierLinks';
import type { AvailabilityCheck } from './supplierAvailability';

export interface DossierInput {
  sku: string;
  resolver: ResolverJson;
  magento: MagentoBuild;
  variants: VariantSummary;
  imageAudit: ImageAuditResult;
  payloads: ListingErrorPayload[];
  /** Supplier tier + official URLs (supplier-links port). */
  supplier?: SupplierLinkInfo;
  /** Last supplier availability verdict, when the sweep ran (D4). */
  availability?: AvailabilityCheck;
  /** Notion row id keyed by payload title, collected during the push. */
  rowLinks?: Record<string, string>;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

const EM = '\u2014';
const MAX_PER_GROUP = 8;

function cap(s: string, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n)}...` : t;
}

function fixText(notes: string): string {
  const m = /\|\s*Fix\s+(.*)$/i.exec(notes);
  if (m && m[1]) return `Fix ${m[1].trim()}`;
  const m2 = /\/\/\s*Fix:(.*)$/i.exec(notes);
  if (m2 && m2[1]) return `Fix: ${m2[1].trim()}`;
  return '';
}

function rowUrl(id: string): string {
  return `https://app.notion.com/p/${id.replace(/-/g, '')}`;
}

export function buildDossierMarkdown(input: DossierInput): string {
  const { sku, resolver, magento, variants, imageAudit, payloads, supplier, availability, rowLinks } =
    input;
  const out: string[] = [];

  // --- Facts ---------------------------------------------------------------
  out.push('## Facts');
  out.push('Store URLs:');
  out.push(`EN: ${resolver.frontend_url}`);
  const esUrl = (resolver.store_urls ?? {})['es'] ?? (resolver.store_urls ?? {})['ES'];
  const frUrl = (resolver.store_urls ?? {})['fr'] ?? (resolver.store_urls ?? {})['FR'];
  if (esUrl) out.push(`ES: ${esUrl}`);
  if (frUrl) out.push(`FR: ${frUrl}`);
  if (magento.parentUrls && Object.keys(magento.parentUrls).length > 0) {
    out.push('Backend URLs:');
    const all = magento.parentUrls['all'] ?? magento.parentUrls['All'];
    const en = magento.parentUrls['en'] ?? magento.parentUrls['EN'];
    const es = magento.parentUrls['es'] ?? magento.parentUrls['ES'];
    const fr = magento.parentUrls['fr'] ?? magento.parentUrls['FR'];
    if (all) out.push(`All stores: ${all}`);
    if (en) out.push(`EN: ${en}`);
    if (es) out.push(`ES: ${es}`);
    if (fr) out.push(`FR: ${fr}`);
  }
  const dup = imageAudit.checks.duplicates;
  const ord = imageAudit.checks.order;
  const bg = imageAudit.checks.background;
  out.push(
    `Audit stats: dup groups ${dup.dup_groups} | order violations ${ord.violations} ` +
      `(${ord.children} children) | bg sampled ${bg.sampled}, off-white ${bg.offwhite}`,
  );
  const path = resolver.categories?.path ?? [];
  if (path.length > 0) {
    out.push(`Categories: ${path.join(' > ')}`);
  }
  if (resolver.magento_status?.label) {
    out.push(`Magento status: ${resolver.magento_status.label}`);
  }
  if (resolver.redirected_to) {
    out.push(`Redirected from: ${resolver.redirected_to}`);
  }
  if (supplier) {
    const catalogLine = supplier.catalog
      ? ` - ${supplier.catalog} (${supplier.catalogSource})`
      : ' - catalogue URL unresolved';
    out.push(
      `Supplier: ${supplier.supplier} (Tier ${supplier.tier}) - ` +
        (supplier.official || 'interno, no public URL') +
        catalogLine,
    );
    if (availability) {
      out.push(
        `Supplier availability: ${availability.verdict} (checked ${availability.checkedAt.slice(0, 10)}` +
          `${availability.urlSource === 'guessed' ? ', URL guessed' : ''})`,
      );
      for (const note of availability.review) out.push(`  - ${note}`);
    }
  }
  out.push('');

  // --- Text facts (derived from text-audit findings) -----------------------
  const nameFinding = payloads.find((p) =>
    /name/i.test(p.type) && /untranslated/i.test(p.type),
  );
  const genderFinding = payloads.find((p) => /gender/i.test(p.type));
  const compFinding = payloads.find((p) => /composition/i.test(p.type));
  if (nameFinding || genderFinding || compFinding) {
    out.push('## Text facts');
    // These lines quote the finding, not the product value: label them so.
    if (nameFinding) {
      out.push(`Name finding: ${cap(nameFinding.notes, 200)}`);
    }
    if (genderFinding) {
      out.push(`Gender finding: ${cap(genderFinding.notes, 200)}`);
    }
    if (compFinding) {
      out.push(`Composition finding: ${cap(compFinding.notes, 200)}`);
    }
    out.push('');
  }

  // --- Child links grouped by colour -------------------------------------
  const rows: MagentoRow[] = magento.rows ?? [];
  if (rows.length > 0) {
    out.push(
      `## Child links (parent SKU ${sku}; All scope; append /store/2|4|5 for EN|ES/FR)`,
    );
    out.push('');
    const groups: Record<string, MagentoRow[]> = {};
    const order: string[] = [];
    for (const r of rows) {
      const key = /configurable/i.test(r.color) ? '(configurable)' : r.color;
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(r);
    }
    for (const key of order) {
      const g = groups[key] ?? [];
      out.push('');
      out.push(`### ${key} (${g.length})`);
      // The child SKU is what a human quotes in a ticket or a supplier mail; the
      // matrix's numeric id alone is unsearchable in the admin. Column order
      // matches the existing SKU Library page tables (SKU first). The column is
      // named "Child SKU" on purpose: the parent's SKU (row title, and the
      // heading above) is a different value and must not be mistaken for it.
      out.push('| Child SKU | Child ID | Size | Admin URL |');
      out.push('|---|---|---|---|');
      let shown = 0;
      for (const r of g) {
        if (shown >= MAX_PER_GROUP) break;
        out.push(`| ${r.sku || '-'} | ${r.child} | ${r.size} | ${r.url} |`);
        shown += 1;
      }
      if (g.length > MAX_PER_GROUP) {
        out.push('');
        out.push(`_${g.length - MAX_PER_GROUP} more in this group - full table lives in the dossier._`);
      }
    }
    out.push('');
  }

  // --- Open findings -------------------------------------------------------
  const openLines: string[] = [];
  for (const p of payloads) {
    const fix = fixText(p.notes) || cap(p.notes, 300);
    const title = p.title;
    const id = rowLinks?.[title];
    if (id) {
      openLines.push(`- **${p.type}** ${EM} [Notion row](${rowUrl(id)}) ${EM} ${fix}`);
    } else {
      openLines.push(`- **${p.type}** ${EM} ${cap(p.notes, 300)}`);
    }
  }
  if (openLines.length > 0) {
    out.push('## Open findings');
    out.push('');
    for (const ln of openLines) out.push(ln);
    out.push('');
  }

  // --- Retired findings: none at create time (no prior-row tracking) -------
  // (Skipped; the extension has no stamped-row history to diff against.)

  return out.join('\n').trim();
}
