/**
 * Supplier availability - port of `scripts/supplier-availability.ps1`, made
 * supplier-aware (D2) and evidence-hungry (D3).
 *
 * A page counts as live only when it is HTTP 200, has a title, and the title is
 * not a not-found page. When the URL came from a *guess* (the ROLY
 * `/model_PO<digits>` pattern) the check is stricter: the title must read
 * `<MODEL> | Roly` and the final URL must still carry `/model_`, because a
 * guessed slug can land on a search page that returns 200.
 *
 * Verdicts:
 *   available             - a confirmed 200 page
 *   not-found             - a single 404; NOT discontinued
 *   discontinued-candidate- 404s on two checks at least 7 days apart
 *   unresolved            - no catalogue URL, or only inconclusive failures
 *   internal-only         - ALLBEST: no public catalogue exists
 *   fetch-error           - the check itself failed (never a product verdict)
 *
 * Side-effect free: no writes, no markdown, no Notion. Results (including the
 * 404 timestamps that make D3 possible) are cached in extension storage so a
 * sweep is cheap to repeat.
 */

import { supplierFor } from '../shared/resolver';
import {
  supplierLinkFor,
  type CatalogSource,
  type SupplierName,
} from './supplierLinks';

export const BATCH_AVAILABILITY_KEY = 'batchAvailability';
const CATALOG_BASE = 'https://www.roly.es/es/model_';
const TIMEOUT_MS = 20000;
const DAY = 24 * 60 * 60 * 1000;
const TTL_OK = 30 * DAY;
const TTL_MISS = 7 * DAY;
const TTL_RETRY = 1 * DAY;
/** How far apart two 404s must be before "discontinued" is even a candidate. */
const MISS_GAP_DAYS = 7;

export type AvailabilityVerdict =
  | 'available'
  | 'discontinued-candidate'
  | 'not-found'
  | 'unresolved'
  | 'internal-only'
  | 'fetch-error';

export interface AvailabilityCheck {
  sku: string;
  verdict: AvailabilityVerdict;
  /** Live catalog URL when `available`. */
  url?: string;
  /** Provenance of the URL that was checked (D1: a guess is never hidden). */
  urlSource: CatalogSource;
  title?: string;
  tried: string[];
  /** ISO timestamps of each 404 - the second one is what escalates (D3). */
  misses: string[];
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

async function fetchCatalog(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
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

const NOT_FOUND_TITLE = /404|not found|no encontrado|non trouv|n\u00e3o encontrad/i;

/** Live = 200 + a real title; a guessed ROLY slug must also look like ROLY. */
function isLive(outcome: FetchOutcome, source: CatalogSource): boolean {
  if (outcome.status !== 200) return false;
  if (!outcome.title || NOT_FOUND_TITLE.test(outcome.title)) return false;
  if (source === 'guessed') {
    return /|\s*Roly/i.test(outcome.title) && outcome.finalUrl.includes('/model_');
  }
  return true;
}

/** Two 404s at least `MISS_GAP_DAYS` apart, not the same run counted twice. */
export function missesEscalate(misses: string[], now = Date.now()): boolean {
  const stamps = misses
    .map((iso) => Date.parse(iso))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (stamps.length < 2) return false;
  const first = stamps[0] ?? 0;
  const last = stamps[stamps.length - 1] ?? 0;
  if (now - first < MISS_GAP_DAYS * DAY) return false;
  return last - first >= MISS_GAP_DAYS * DAY;
}

export interface AvailabilityOptions {
  /** SKU Library `Supplier Product` URL (confirmed by a human). */
  catalogUrl?: string;
  /** 404 timestamps recorded by an earlier run (D3). */
  priorMisses?: string[];
  fetchImpl?: typeof fetch;
  now?: Date;
}

export async function checkSkuAvailability(
  sku: string,
  opts: AvailabilityOptions = {},
): Promise<AvailabilityCheck> {
  const id = sku.trim().toUpperCase();
  const now = opts.now ?? new Date();
  const checkedAt = now.toISOString();
  const supplier: SupplierName = supplierFor(id);
  const link = supplierLinkFor(id, { catalogUrl: opts.catalogUrl });
  const priorMisses = opts.priorMisses ?? [];

  const base: AvailabilityCheck = {
    sku: id,
    verdict: 'unresolved',
    urlSource: link.catalogSource,
    tried: [],
    misses: [...priorMisses],
    review: [],
    anomalies: [],
    checkedAt,
  };

  if (link.internalOnly) {
    return {
      ...base,
      verdict: 'internal-only',
      review: [
        `${supplier} is an internal supplier: no public catalogue exists, so availability is a stock question, not a web check`,
      ],
    };
  }

  if (!link.catalog) {
    return {
      ...base,
      verdict: 'unresolved',
      review: [
        `no catalogue URL known for ${supplier}: add the supplier product link to the SKU Library (Supplier Product column) - no URL pattern is guessed for this supplier`,
      ],
    };
  }

  const candidates: { url: string; source: CatalogSource }[] = [
    { url: link.catalog, source: link.catalogSource },
  ];
  if (link.catalogSource === 'guessed') {
    // The legacy generator tried PO<digits> and then bare digits.
    for (const ref of officialRefs(id)) {
      const url = `${CATALOG_BASE}${ref}`;
      if (!candidates.some((c) => c.url === url)) candidates.push({ url, source: 'guessed' });
    }
  }

  let live: { url: string; title: string; source: CatalogSource } | null = null;
  let saw404 = false;
  const anomalies: string[] = [];

  for (const candidate of candidates) {
    base.tried.push(candidate.url);
    const outcome = await fetchCatalog(candidate.url, opts.fetchImpl);
    if (isLive(outcome, candidate.source)) {
      live = { url: candidate.url, title: outcome.title, source: candidate.source };
      break;
    }
    if (outcome.status === 404) {
      saw404 = true;
      continue;
    }
    if (outcome.status !== 0) {
      anomalies.push(
        `inconclusive fetch ${candidate.url} (status ${outcome.status}): ${outcome.error || outcome.title}`,
      );
    } else if (outcome.error) {
      anomalies.push(`fetch failed ${candidate.url}: ${outcome.error}`);
    }
  }

  if (live) {
    const review: string[] = [];
    if (/^MODELS\./i.test(live.title)) {
      review.push('title-untranslated (page live, model name key unresolved - spot-check once)');
    }
    if (live.source === 'guessed') {
      review.push('catalogue URL guessed from the SKU digits - confirm it once and store it');
    }
    return {
      ...base,
      verdict: 'available',
      url: live.url,
      urlSource: live.source,
      title: live.title,
      // A live page retires earlier misses.
      misses: [],
      review,
      anomalies,
    };
  }

  if (!saw404) {
    return {
      ...base,
      verdict: anomalies.length > 0 ? 'fetch-error' : 'unresolved',
      anomalies,
      review:
        anomalies.length > 0
          ? ['the check itself failed - no product verdict is drawn from it']
          : ['no conclusive answer: every candidate failed without a 404'],
    };
  }

  // Keep the history bounded: only the spread matters, not every run.
  const misses = [...new Set([...priorMisses, checkedAt])].sort().slice(-10);
  const escalated = missesEscalate(misses, now.getTime());
  const review: string[] = [];
  if (escalated) {
    review.push(
      `404 on ${misses.length} checks spanning at least ${MISS_GAP_DAYS} days - review the product before marking it discontinued`,
    );
  } else {
    review.push(
      `single 404 - not discontinued on its own: re-check in ${MISS_GAP_DAYS} days (a second 404 escalates it)`,
    );
  }
  if (link.catalogSource === 'guessed') {
    review.push('the 404 may be the guessed slug, not the product - confirm the supplier URL');
  }
  return {
    ...base,
    verdict: escalated ? 'discontinued-candidate' : 'not-found',
    misses,
    review,
    anomalies,
  };
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
  const ttl =
    check.verdict === 'available' || check.verdict === 'discontinued-candidate'
      ? TTL_OK
      : check.verdict === 'not-found' || check.verdict === 'internal-only'
        ? TTL_MISS
        : TTL_RETRY;
  return now - at < ttl;
}

export async function saveAvailability(checks: AvailabilityCheck[]): Promise<void> {
  const map = await loadAvailability();
  for (const check of checks) map[check.sku] = check;
  await chrome.storage.local.set({ [BATCH_AVAILABILITY_KEY]: map });
}

/** Sequential sweep (supplier sites rate-limit bursts); cached fresh results skip. */
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
      check = await checkSkuAvailability(sku, {
        priorMisses: cached?.misses ?? [],
      });
    } catch (err) {
      check = {
        sku,
        verdict: 'fetch-error',
        urlSource: 'none',
        tried: [],
        misses: cached?.misses ?? [],
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
  const lines = ['| SKU | Verdict | URL source | Catalog | Tried |', '|---|---|---|---|---|'];
  for (const check of checks) {
    lines.push(
      `| ${check.sku} | ${check.verdict} | ${check.urlSource} | ${check.url ?? '-'} | ${check.tried.join(', ') || '-'} |`,
    );
  }
  return lines.join('\n');
}
