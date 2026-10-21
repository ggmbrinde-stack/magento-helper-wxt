/**
 * Text audit - live collection layer.
 *
 * Fetches the EN/ES/FR PDP HTML (EN comes from the resolver; ES/FR from the
 * hreflang alternates in `store_urls`) and hands the extracted fields to the
 * pure engine in `textAudit.ts`.
 *
 * Like the image audit this does NOT read local evidence folders; the audit
 * workspace's `html/*.html` snapshots are the PowerShell input, the live PDPs
 * are ours. Host permissions cover bestofgifts.eu / .es / .fr.
 */

import { resolveSkuWithHtml, type ResolverJson } from './resolver';
import {
  TEXT_LANGS,
  auditText,
  getPdpFields,
  type LangMap,
  type TextAuditResult,
  type TextLang,
} from './textAudit';

export interface TextAuditFetchOptions {
  /** Explicit bestofgifts.eu product URL (skips the catalogsearch step). */
  url?: string;
  /** Languages to compare besides the EN baseline (default EN, ES, FR). */
  langs?: string[];
  fetchImpl?: typeof fetch;
}

export interface TextAuditRun {
  audit: TextAuditResult;
  resolver: ResolverJson;
  /** Fetch-level problems (missing alternate, HTTP error). */
  anomalies: string[];
}

/** Fetch the live PDPs and run the mechanical text checks. */
export async function textAuditForSku(
  skuRaw: string,
  opts: TextAuditFetchOptions = {},
): Promise<TextAuditRun> {
  const sku = skuRaw.trim().toUpperCase();
  if (!sku) throw new Error('SKU is required');
  const fetchImpl = opts.fetchImpl ?? fetch;
  const wanted = new Set(
    (opts.langs?.length ? opts.langs : TEXT_LANGS).map((l) => l.trim().toUpperCase()),
  );

  const { resolver, enHtml } = await resolveSkuWithHtml(sku, {
    url: opts.url,
    fetchImpl,
  });
  const byLang: LangMap = { EN: getPdpFields(enHtml) };
  const anomalies: string[] = [];

  for (const lang of ['ES', 'FR'] as const) {
    if (!wanted.has(lang)) continue;
    const target = storeUrlFor(resolver, lang);
    if (!target) {
      anomalies.push(`${lang} URL missing (no hreflang alternate)`);
      continue;
    }
    try {
      byLang[lang] = getPdpFields(await fetchPdp(target, lang, fetchImpl));
    } catch (err) {
      anomalies.push(`${lang} html unreadable: ${messageOf(err)}`);
    }
  }

  const audit = auditText({ sku: resolver.sku, byLang });
  if (anomalies.length > 0) {
    // The PowerShell script treats unreadable html as a review flag too.
    audit.review_flags.unshift(...anomalies);
    audit.ok = false;
  }
  return { audit, resolver, anomalies };
}

function storeUrlFor(resolver: ResolverJson, lang: TextLang): string | null {
  const lc = lang.toLowerCase();
  const direct = resolver.store_urls?.[lc] ?? resolver.store_urls?.[lang];
  if (direct) return absoluteUrl(direct, resolver.frontend_url);
  for (const [code, url] of Object.entries(resolver.hreflang ?? {})) {
    const c = code.toLowerCase();
    if (c === lc || c.startsWith(`${lc}-`)) {
      return absoluteUrl(url, resolver.frontend_url);
    }
  }
  return null;
}

function absoluteUrl(url: string, base: string): string {
  try {
    return new URL(url.replace(/&amp;/g, '&'), base).toString();
  } catch {
    return url;
  }
}

async function fetchPdp(
  url: string,
  lang: TextLang,
  fetchImpl: typeof fetch,
): Promise<string> {
  const acceptLanguage =
    lang === 'ES' ? 'es-ES,es;q=0.9' : lang === 'FR' ? 'fr-FR,fr;q=0.9' : 'en-US,en;q=0.9';
  const resp = await fetchImpl(url, {
    credentials: 'omit',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': acceptLanguage,
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.text();
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
