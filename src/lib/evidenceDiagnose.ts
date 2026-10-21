/**
 * Diagnostics for the local mirror folder.
 *
 * `diagnoseEvidenceFolder()` proves the browser can actually write (probe file
 * + read-back + delete + directory listing). `dryRunEvidence()` proves the
 * stored batch has downloadable images and shows the exact mirror paths a real
 * save would create - without touching the disk.
 */

import { loadEvidence } from './batch';
import {
  folderPermissionState,
  folderPickingSupported,
  probeEvidenceFolder,
} from './evidenceFolder';
import { fetchOriginalBytes } from './imageFetch';
import { enrichEvidence, planMirrorFiles } from './evidenceExport';

export interface EvidenceFolderDiagnosis {
  supported: boolean;
  folder: string | null;
  permission: string;
  ok: boolean;
  probe?: Awaited<ReturnType<typeof probeEvidenceFolder>>;
  error?: string;
}

export async function diagnoseEvidenceFolder(): Promise<EvidenceFolderDiagnosis> {
  const supported = folderPickingSupported();
  let permission: string = 'unsupported';
  try {
    permission = await folderPermissionState();
  } catch (err) {
    permission = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  if (!supported) {
    return { supported: false, folder: null, permission, ok: false };
  }
  try {
    const probe = await probeEvidenceFolder();
    return {
      supported: true,
      folder: probe.folder,
      permission,
      ok: probe.ok,
      probe,
      error: probe.error,
    };
  } catch (err) {
    return {
      supported: true,
      folder: null,
      permission,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface EvidencePlanRow {
  path: string;
  url: string;
  status: 'ok' | 'http-error' | 'network-error';
  bytes?: number;
  error?: string;
}

export interface EvidenceDryRun {
  sku: string;
  skus: number;
  mediaFiles: number;
  imageFiles: number;
  sampled: EvidencePlanRow[];
  errors: string[];
}

/** Show what a save would write for the first stored SKU (or `sku`). */
export async function dryRunEvidence(
  options: { sku?: string; sample?: number } = {},
): Promise<EvidenceDryRun> {
  const stored = await loadEvidence();
  const skus = Object.keys(stored);
  if (skus.length === 0) throw new Error('No batch evidence stored yet.');
  const sku = options.sku && stored[options.sku] ? options.sku : (skus[0] as string);
  const entry = stored[sku];
  if (!entry) throw new Error(`No evidence stored for ${sku}.`);

  const planned = planMirrorFiles(sku, await enrichEvidence(sku, entry));
  const limit = Math.max(1, options.sample ?? 3);
  const rows: EvidencePlanRow[] = [];
  const errors: string[] = [];
  for (const file of planned.slice(0, limit)) {
    const path = `${file.folders.join('\\')}\\${file.mirrorName}`;
    try {
      const bytes = await fetchOriginalBytes(file.url);
      rows.push({ path, url: file.url, status: 'ok', bytes: bytes.byteLength });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const http = /^HTTP (\d+)/.exec(message);
      rows.push({
        path,
        url: file.url,
        status: http && Number(http[1]) >= 400 ? 'http-error' : 'network-error',
        error: message,
      });
      errors.push(`${file.mirrorName}: ${message}`);
    }
  }

  return {
    sku,
    skus: skus.length,
    mediaFiles: entry.media.length,
    imageFiles: planned.length,
    sampled: rows,
    errors,
  };
}
