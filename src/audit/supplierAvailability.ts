/**
 * Supplier availability - port of `scripts/supplier-availability.ps1`.
 *
 * Roly only (per the old script's scope). Official ref candidates are derived
 * from the SKU's trailing digits (`PO<digits>` always, bare digits only when it
 * differs after stripping leading zeros); each candidate is fetched from
 * `https://www.roly.es/es/model_<REF>` and a page counts as live only when it
 * is HTTP 200, the title reads `<MODEL> | Roly`, and the final URL carries
 * `/model_`. 404 moves on to the next candidate; any other failure is an
 * anomaly and blocks a verdict (never invents "discontinued").
 *
 * Side-effect free: no writes, no markdown, no Notion. Results are cached in
 * extension storage so a sweep is cheap to repeat.
 */

import { supplierFor } from '../shared/resolver';

export const BATCH_AVAILABILITY_KEY = 'batchAvailability';
const CATALOG_BASE = 'https://www.roly.es/es/model_';
const TIMEOUT_MS = 20000;
const DAY = 24 * 60 * 60 * 1000;
const TTL_OK = 30 * DAY;
const TTL_RETRY = 1 * DAY;

export type AvailabilityVerdict =
  | 'available'
  | 'discontinued-candidate'
  | 'unresolved'
  | 'not-roly'
  | 'fetch-error';

export interface AvailabilityCheck {
  sku: string;
  verdict: AvailabilityVerdict;
  /** Live catalog URL when `available`. */
  url?: string;
  title?: string;
  tried: string[];
  review: string[];
  anomalies: string[];
  checkedAt: string;
}

export type AvailabilityMap = Record<string, AvailabilityCheck>;

export function officialRefs(sku: string): string[] {
  const m = /(\d+)\s*$/.exec(sku.trim().toUpperCase());
  const digits = m?.[1] ?? '';
  if (!digits) return [];
  const refs = [`PO${digits}`];
  const bare = digits.replace(/^0+/, '') || '0';
  if (bare !== digits) refs.push(digits);
  return [...new Set(refs)];
}

interface FetchOutcome {
  status: number;
  title: string;
  finalUrl: string;
  error: string;
}

async function fetchCatalog(url: string): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    const body = await response.text();
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.trim() ?? '';
    return {
      status: response.status,
      title: title.replace(/\s+/g, ' '),
      finalUrl: response.url || url,
      error: '',
    };
  } catch (err) {
    return { status: 0, title: '', finalUrl: url, error: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkSkuAvailability(sku: string): Promise<AvailabilityCheck> {
  const id = sku.trim().toUpperCase();
  const checkedAt = new Date().toISOString();
  const supplier = supplierFor(id);
  if (supplier !== 'ROLY') {
    return {
      sku: id,
      verdict: 'not-roly',
      tried: [],
      review: [],
      anomalies: [`supplier ${supplier} - Roly-only check, other suppliers later`],
      checkedAt,
    };
  }

  const tried: string[] = [];
  const review: string[] = [];
  const anomalies: string[] = [];
  let verdict: AvailabilityVerdict = 'unresolved';
  let url: string | undefined;
  let title: string | undefined;

  for (const ref of officialRefs(id)) {
    const candidate = `${CATALOG_BASE}${ref}`;
    tried.push(candidate);
    const outcome = await fetchCatalog(candidate);
    const live =
      outcome.status === 200 &&
      /\S+\s*\|\s*Roly/i.test(outcome.title) &&
      outcome.finalUrl.includes('/model_');
    if (live) {
      verdict = 'available';
      url = candidate;
      title = outcome.title;
      if (/^MODELS\./i.test(outcome.title)) {
        review.push('title-untranslated (page live, model name key unresolved - spot-check once)');
      }
      break;
    }
    if (outcome.status === 404) continue;
    if (outcome.status !== 0) {
      anomalies.push(
        `inconclusive fetch ${candidate} (status ${outcome.status}): ${outcome.error || outcome.title}`,
      );
    } else if (outcome.error) {
      anomalies.push(`fetch failed ${candidate}: ${outcome.error}`);
    }
  }

  if (verdict === 'unresolved' && anomalies.length === 0 && tried.length > 0) {
    verdict = 'discontinued-candidate';
  }
  return { sku: id, verdict, url, title, tried, review, anomalies, checkedAt };
}

export async function loadAvailability(): Promise<AvailabilityMap> {
  try {
    const stored = await chrome.storage.local.get([BATCH_AVAILABILITY_KEY]);
    return (stored[BATCH_AVAILABILITY_KEY] as AvailabilityMap | undefined) ?? {};
  } catch {
    return {};
  }
}

function isFresh(check: AvailabilityCheck, now: number): boolean {
  const at = Date.parse(check.checkedAt);
  if (!Number.isFinite(at)) return false;
  const ttl = check.verdict === 'available' || check.verdict === 'discontinued-candidate' ? TTL_OK : TTL_RETRY;
  return now - at < ttl;
}

export async function saveAvailability(checks: AvailabilityCheck[]): Promise<void> {
  const map = await loadAvailability();
  for (const check of checks) map[check.sku] = check;
  await chrome.storage.local.set({ [BATCH_AVAILABILITY_KEY]: map });
}

/** Sequential sweep (the catalog rate-limits bursts); cached fresh results skip. */
export async function runAvailabilitySweep(
  skus: string[],
  options: {
    force?: boolean;
    onProgress?: (sku: string, index: number, total: number) => void;
  } = {},
): Promise<AvailabilityCheck[]> {
  const cache = await loadAvailability();
  const now = Date.now();
  const out: AvailabilityCheck[] = [];
  const list = [...new Set(skus.map((sku) => sku.trim().toUpperCase()).filter(Boolean))];
  for (const [index, sku] of list.entries()) {
    options.onProgress?.(sku, index + 1, list.length);
    const cached = cache[sku];
    if (!options.force && cached && isFresh(cached, now)) {
      out.push(cached);
      continue;
    }
    let check: AvailabilityCheck;
    try {
      check = await checkSkuAvailability(sku);
    } catch (err) {
      check = {
        sku,
        verdict: 'fetch-error',
        tried: [],
        review: [],
        anomalies: [(err as Error).message],
        checkedAt: new Date().toISOString(),
      };
    }
    out.push(check);
    await saveAvailability([check]).catch(() => undefined);
  }
  return out;
}

export function availabilityMarkdown(checks: AvailabilityCheck[]): string {
  const lines = ['| SKU | Verdict | Catalog | Tried |', '|---|---|---|---|'];
  for (const check of checks) {
    lines.push(
      `| ${check.sku} | ${check.verdict} | ${check.url ?? '-'} | ${check.tried.join(', ') || '-'} |`,
    );
  }
  return lines.join('\n');
}
