/**
 * Pipeline status - port of `scripts/status.ps1` + `scripts/batch-report.ps1`.
 *
 * PowerShell walked the audit root on disk; batch storage is the source of
 * truth here. Stages are ordered and each one names its own fix, so the report
 * doubles as the "next action" list. Mirror columns from the old status table
 * (file counts) are informational only - the authoritative check is
 * `evidence-manifest` (hashes), exposed separately.
 */

import {
  loadAnomalies,
  loadBatchJob,
  loadDossier,
  loadEvidence,
  loadLibraryCells,
  loadPushed,
  type BatchEvidence,
} from '../automation';
import { loadManifests } from '../automation';
import { missingLibraryFields } from './skuLibraryWriter';

export type StageName = 'collected' | 'saved' | 'dossier' | 'library' | 'notion';

const STAGE_ORDER: StageName[] = ['collected', 'saved', 'dossier', 'library', 'notion'];

const STAGE_LABEL: Record<StageName, string> = {
  collected: 'collect',
  saved: 'images',
  dossier: 'dossier',
  library: 'library',
  notion: 'notion',
};

const NEXT: Record<StageName, string> = {
  collected: 'run the batch for <SKU>',
  saved: 'Save images (mirror manifest missing)',
  dossier: 're-run the batch to rebuild the dossier',
  library: 're-run the batch to build the SKU Library row',
  notion: 'push the batch to Notion',
};

export interface SkuStage {
  name: StageName;
  label: string;
  done: boolean;
  note?: string;
}

export interface SkuStatus {
  sku: string;
  stages: SkuStage[];
  complete: boolean;
  next: string;
}

function hasCollected(entry: BatchEvidence | undefined): boolean {
  if (!entry) return false;
  return entry.media.length > 0 || Object.keys(entry.files).length > 0;
}

export async function buildStatuses(skus?: string[]): Promise<SkuStatus[]> {
  const [evidence, dossiers, library, pushed, manifests, job] = await Promise.all([
    loadEvidence(),
    loadDossier(),
    loadLibraryCells(),
    loadPushed(),
    loadManifests(),
    loadBatchJob(),
  ]);

  const fromJob = (job?.items ?? []).map((item) => item.sku);
  const list = (
    skus?.length ? skus : [...new Set([...Object.keys(evidence), ...fromJob])]
  ).filter(Boolean);

  return list.map((sku) => {
    const entry = evidence[sku];
    const cells = library[sku];
    const missing = cells ? missingLibraryFields(cells) : [];
    const stamp = pushed[sku];
    const manifest = manifests[sku];

    const states: Record<StageName, SkuStage> = {
      collected: {
        name: 'collected',
        label: STAGE_LABEL.collected,
        done: hasCollected(entry),
      },
      saved: {
        name: 'saved',
        label: STAGE_LABEL.saved,
        done: Boolean(manifest && manifest.files.length > 0),
        note: manifest ? `${manifest.files.length} file(s)` : undefined,
      },
      dossier: {
        name: 'dossier',
        label: STAGE_LABEL.dossier,
        done: Boolean(dossiers[sku]),
      },
      library: {
        name: 'library',
        label: STAGE_LABEL.library,
        done: Boolean(cells) && missing.length === 0,
        note: cells && missing.length > 0 ? `missing ${missing.join(', ')}` : undefined,
      },
      notion: {
        name: 'notion',
        label: STAGE_LABEL.notion,
        done: Boolean(stamp),
        note: stamp ? stamp.at.slice(0, 10) : undefined,
      },
    };

    const stages = STAGE_ORDER.map((name) => states[name]);
    const firstMissing = stages.find((stage) => !stage.done);
    return {
      sku,
      stages,
      complete: !firstMissing,
      next: firstMissing ? NEXT[firstMissing.name].split('<SKU>').join(sku) : '',
    };
  });
}

export function statusMarkdown(statuses: SkuStatus[]): string {
  const header = ['| SKU | ' + STAGE_ORDER.map((s) => STAGE_LABEL[s]).join(' | ') + ' | Next |'];
  header.push(
    '|---|' + STAGE_ORDER.map(() => '---').join('|') + '|---|',
  );
  const rows = statuses.map((status) => {
    const cells = status.stages.map((stage) => (stage.done ? 'done' : 'missing'));
    return `| ${status.sku} | ${cells.join(' | ')} | ${status.next || 'complete'} |`;
  });
  return [...header, ...rows].join('\n');
}

export async function batchReportMarkdown(): Promise<string> {
  const [job, statuses, anomalies] = await Promise.all([
    loadBatchJob(),
    buildStatuses(),
    loadAnomalies(),
  ]);
  const complete = statuses.filter((s) => s.complete).length;
  const lines: string[] = [];
  lines.push('### Batch report');
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  if (job) {
    const done = job.items.filter((item) => item.status === 'ok').length;
    const running = job.items.filter((item) => item.status === 'running').length;
    lines.push(
      `- Job: ${job.status}, ${done}/${job.items.length} ok, ` +
        `${job.totals.failed} failed, ${running} running, ` +
        `${job.totals.anomalies} anomaly flag(s)`,
    );
  } else {
    lines.push('- Job: none');
  }
  lines.push(`- SKUs: ${statuses.length} (${complete} complete, ${statuses.length - complete} in progress)`);
  lines.push('');
  lines.push(statusMarkdown(statuses));
  const withAnomalies = Object.entries(anomalies).filter(([, list]) => list.length > 0);
  lines.push('');
  lines.push('### Blockers');
  if (withAnomalies.length === 0) {
    lines.push('- none');
  } else {
    for (const [sku, list] of withAnomalies) {
      lines.push(`- ${sku}: ${list.join('; ')}`);
    }
  }
  return lines.join('\n');
}
