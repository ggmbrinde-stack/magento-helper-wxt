/**
 * Coverage gate - port of `scripts/coverage-check.ps1`.
 *
 * Answers "is anything silently missed?" per SKU. The PowerShell version
 * compares resolver.json / media JSONs / image files / dossier table / Notion
 * stamp on disk; the extension keeps the same facts in batch storage, so the
 * checks run against:
 *
 *   resolver children  -> BatchEvidence.children (snapshot from runSku)
 *   media child ids    -> evidence.media (media_<LANG>_<child> sources)
 *   image child ids    -> evidence.files (`<child>_pos<N>_...` names)
 *   magento table rows -> dossier markdown `## Child links` tables
 *   Notion stamp       -> BATCH_PUSHED_KEY entry
 *
 * Read-only: nothing here writes, pushes, or touches the mirror.
 */

import {
  loadDossier,
  loadEvidence,
  loadLibraryCells,
  loadPushed,
  type BatchEvidence,
} from '../automation';
import { readMediaSource } from './imageAudit';

export interface CoverageGap {
  check:
    | 'no-resolver'
    | 'no-dossier'
    | 'media-gap'
    | 'image-gap'
    | 'extra-media'
    | 'extra-images'
    | 'magento-mismatch'
    | 'no-notion-stamp';
  detail: string;
  remedy: string;
}

export interface CoverageResult {
  sku: string;
  consistent: boolean;
  gaps: CoverageGap[];
  next: string;
}

const REMEDY: Record<CoverageGap['check'], string> = {
  'no-resolver': 'run the batch for <SKU> - resolver children snapshot missing',
  'no-dossier': 're-run the batch to rebuild the dossier',
  'media-gap': 're-run the batch with images enabled (media JSON missing for child)',
  'image-gap': 'Save images / re-run the batch (no image files for child)',
  'extra-media': 're-run the batch - media exists for a child the resolver snapshot does not have',
  'extra-images': 're-run the batch - images exist for a child the resolver snapshot does not have',
  'magento-mismatch': 're-run the batch - the dossier child table drifted from the resolver',
  'no-notion-stamp': 'push the batch to Notion, then re-check',
};

function remedy(check: CoverageGap['check'], sku: string): string {
  return REMEDY[check].split('<SKU>').join(sku);
}

function fileChildren(entry: BatchEvidence): Set<string> {
  const out = new Set<string>();
  for (const names of Object.values(entry.files)) {
    for (const name of names) {
      const m = /^(\d+)_pos\d+_/.exec(name);
      if (m?.[1]) out.add(m[1]);
    }
  }
  return out;
}

function mediaChildren(entry: BatchEvidence): Set<string> {
  const out = new Set<string>();
  for (const source of entry.media) {
    const parsed = readMediaSource(source);
    if (parsed) out.add(parsed.child);
  }
  return out;
}

/** Child ids from the dossier's `## Child links` tables. */
export function dossierChildIds(markdown: string): Set<string> {
  const out = new Set<string>();
  const start = markdown.indexOf('## Child links');
  if (start < 0) return out;
  const rest = markdown.slice(start + '## Child links'.length);
  const section = rest.split(/\n## /)[0] ?? '';
  for (const line of section.split(/\r?\n/)) {
    if (/\(configurable\)/i.test(line)) continue;
    const m = /^\|\s*(\d+)\s*\|/.exec(line);
    if (m?.[1]) out.add(m[1]);
  }
  return out;
}

function resolverChildren(entry: BatchEvidence): Set<string> {
  const out = new Set<string>(entry.children ?? []);
  if (out.size === 0 && entry.childColor) {
    for (const id of Object.keys(entry.childColor)) out.add(id);
  }
  return out;
}

/** The dossier prints at most this many child rows per colour group. */
const MAX_DOSSIER_ROWS_PER_GROUP = 8;

/**
 * How many child rows the dossier should show for these children: every child
 * when each colour group fits under the cap, otherwise `cap` per group. Used
 * to tell "truncated on purpose" from "rows went missing".
 */
function expectedDossierRows(entry: BatchEvidence, resolver: Set<string>): number {
  const groups = new Map<string, number>();
  for (const child of resolver) {
    const label = (entry.childColor?.[child] ?? '').trim() || '(unlabelled)';
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  if (groups.size === 0) {
    return Math.min(resolver.size, MAX_DOSSIER_ROWS_PER_GROUP);
  }
  let expected = 0;
  for (const size of groups.values()) {
    expected += Math.min(size, MAX_DOSSIER_ROWS_PER_GROUP);
  }
  return expected;
}

export async function checkCoverage(skus?: string[]): Promise<{
  results: CoverageResult[];
  withGaps: number;
}> {
  const [evidence, dossiers, library, pushed] = await Promise.all([
    loadEvidence(),
    loadDossier(),
    loadLibraryCells(),
    loadPushed(),
  ]);
  const list = (skus?.length ? skus : Object.keys(evidence)).filter(Boolean);
  if (list.length === 0) throw new Error('No batch SKUs to check.');

  const results: CoverageResult[] = [];
  for (const sku of list) {
    const entry = evidence[sku];
    const gaps: CoverageGap[] = [];
    const resolver = entry ? resolverChildren(entry) : new Set<string>();
    const media = entry ? mediaChildren(entry) : new Set<string>();
    const files = entry ? fileChildren(entry) : new Set<string>();

    if (!entry || resolver.size === 0) {
      gaps.push({
        check: 'no-resolver',
        detail: 'resolver children snapshot missing',
        remedy: remedy('no-resolver', sku),
      });
    }

    const dossier = dossiers[sku];
    if (!dossier) {
      gaps.push({
        check: 'no-dossier',
        detail: 'dossier markdown missing',
        remedy: remedy('no-dossier', sku),
      });
    }

    if (resolver.size > 0) {
      for (const child of resolver) {
        if (!media.has(child)) {
          gaps.push({
            check: 'media-gap',
            detail: `no media JSON for resolver child ${child}`,
            remedy: remedy('media-gap', sku),
          });
        }
        if (!files.has(child)) {
          gaps.push({
            check: 'image-gap',
            detail: `no images for resolver child ${child}`,
            remedy: remedy('image-gap', sku),
          });
        }
      }
      for (const child of media) {
        if (!resolver.has(child)) {
          gaps.push({
            check: 'extra-media',
            detail: `media for unknown child ${child}`,
            remedy: remedy('extra-media', sku),
          });
        }
      }
      for (const child of files) {
        if (!resolver.has(child)) {
          gaps.push({
            check: 'extra-images',
            detail: `images for unknown child ${child}`,
            remedy: remedy('extra-images', sku),
          });
        }
      }
      if (dossier) {
        const rows = dossierChildIds(dossier);
        if (rows.size === 0) {
          gaps.push({
            check: 'magento-mismatch',
            detail: 'child links table missing from the dossier',
            remedy: remedy('magento-mismatch', sku),
          });
        } else {
          // A row for a child the resolver does not know is drift, always.
          for (const child of rows) {
            if (!resolver.has(child)) {
              gaps.push({
                check: 'magento-mismatch',
                detail: `dossier child row ${child} is not a resolver child`,
                remedy: remedy('magento-mismatch', sku),
              });
            }
          }
          const expectedRows = entry
            ? expectedDossierRows(entry, resolver)
            : resolver.size;
          if (expectedRows >= resolver.size) {
            // Every child should be listed: check them one by one.
            for (const child of resolver) {
              if (!rows.has(child)) {
                gaps.push({
                  check: 'magento-mismatch',
                  detail: `resolver child ${child} has no dossier child row`,
                  remedy: remedy('magento-mismatch', sku),
                });
              }
            }
          } else if (rows.size < expectedRows) {
            gaps.push({
              check: 'magento-mismatch',
              detail: `dossier lists ${rows.size} of ${expectedRows} child rows (per-colour cap ${MAX_DOSSIER_ROWS_PER_GROUP})`,
              remedy: remedy('magento-mismatch', sku),
            });
          }
        }
      }
    }

    if (!pushed[sku] && !library[sku]) {
      gaps.push({
        check: 'no-notion-stamp',
        detail: 'no Notion push recorded for this SKU',
        remedy: remedy('no-notion-stamp', sku),
      });
    }

    const next = gaps[0]?.remedy ?? '';
    results.push({
      sku,
      consistent: gaps.length === 0,
      gaps,
      next,
    });
  }

  return { results, withGaps: results.filter((r) => !r.consistent).length };
}

export function coverageMarkdown(results: CoverageResult[]): string {
  const lines = ['| SKU | Consistent | Gaps | Next |', '|---|---|---|---|'];
  for (const r of results) {
    const kinds = [...new Set(r.gaps.map((g) => g.check))].join(', ') || '-';
    lines.push(`| ${r.sku} | ${r.consistent ? 'yes' : 'NO'} | ${kinds} | ${r.next || '-'} |`);
  }
  return lines.join('\n');
}
