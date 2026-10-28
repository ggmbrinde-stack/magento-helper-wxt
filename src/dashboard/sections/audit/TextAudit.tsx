import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { AuditTextResponse } from '../../../core/messages';
import type { TextAuditResult } from '../../../audit';

const ALL_LANGS = ['EN', 'ES', 'FR'];

function Summary({ audit }: { audit: TextAuditResult }) {
  const specs = audit.matrix?.specs.length ?? 0;
  return (
    <ul class="db-kv">
      <li>
        <span>Languages</span>
        <b>{audit.langs.join(' + ') || '-'}</b>
      </li>
      <li>
        <span>Spec rows</span>
        <b>{specs}</b>
      </li>
      <li>
        <span>Findings</span>
        <b>{audit.findings.length}</b>
      </li>
      <li>
        <span>Review flags</span>
        <b>{audit.review_flags.length}</b>
      </li>
    </ul>
  );
}

function Matrix({ audit }: { audit: TextAuditResult }) {
  if (!audit.matrix) return null;
  const scalars = [
    { field: 'Name', ...audit.matrix.name },
    { field: 'H1', ...audit.matrix.h1 },
    { field: 'Short description', ...audit.matrix.short_desc },
    { field: 'Long description', ...audit.matrix.long_desc },
  ];
  const rows = [...scalars, ...audit.matrix.specs];
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>Extracted matrix</h2>
        <span class="db-badge">
          {audit.langs.join('/')} · {audit.matrix.specs.length} spec rows
        </span>
      </div>
      <table class="db-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>EN</th>
            <th>ES</th>
            <th>FR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field}>
              <td>{row.field}</td>
              <td class="db-notes">{row.en || '—'}</td>
              <td class="db-notes">{row.es || '—'}</td>
              <td class="db-notes">{row.fr || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function TextAudit() {
  const [sku, setSku] = useState('');
  const [url, setUrl] = useState('');
  const [langs, setLangs] = useState<string[]>([...ALL_LANGS]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditTextResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleLang = (lang: string): void => {
    if (lang === 'EN') return;
    setLangs((current) =>
      current.includes(lang)
        ? current.filter((l) => l !== lang)
        : [...current, lang].sort(),
    );
  };

  const run = async (): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    setCopied(false);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'AUDIT_TEXT',
        sku: trimmed,
        url: url.trim() || undefined,
        langs,
      })) as AuditTextResponse;
      setResult(response ?? { ok: false, error: 'No response.' });
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const copyBlock = async (): Promise<void> => {
    if (!result?.mdBlock) return;
    try {
      await navigator.clipboard.writeText(result.mdBlock);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const audit = result?.audit;
  const dirty =
    !!audit && (audit.findings.length > 0 || audit.review_flags.length > 0 || !audit.ok);

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Text audit</h2>
          <span class="db-badge">mechanical checks only</span>
        </div>
        <p class="db-note">
          Reads the live EN/ES/FR PDPs (title, og:description, details, spec table and
          JSON-LD). Produces candidates only — translation quality and the correct wording stay
          with the auditor.
        </p>
        <label class="db-field">
          <span>SKU</span>
          <em>e.g. R0304, TTKP230, TTFL9293</em>
          <input
            type="text"
            value={sku}
            placeholder="Paste SKU…"
            onInput={(e) => setSku(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run();
            }}
          />
        </label>
        <label class="db-field">
          <span>Product URL (optional)</span>
          <em>Skips the catalogsearch step when the slug is known</em>
          <input
            type="text"
            value={url}
            placeholder="https://bestofgifts.eu/…"
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
        </label>
        <div class="db-checks">
          {ALL_LANGS.map((lang) => (
            <label class="db-check" key={lang}>
              <input
                type="checkbox"
                checked={langs.includes(lang)}
                disabled={lang === 'EN'}
                onChange={() => toggleLang(lang)}
              />
              <span>{lang === 'EN' ? 'EN (baseline)' : lang}</span>
            </label>
          ))}
        </div>
        <div class="db-actions">
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={loading || !sku.trim()}
            onClick={() => void run()}
          >
            {loading ? 'Auditing…' : 'Run text audit'}
          </button>
        </div>
      </section>

      {result?.error ? <div class="mhx-error">{result.error}</div> : null}

      {audit ? (
        <>
          <section class="db-card db-wide">
            <div class="db-card-head">
              <h2>
                Checks <span class="db-mono">{audit.sku}</span>
              </h2>
              <span class={dirty ? 'db-badge db-warn' : 'db-badge db-ok'}>
                {audit.findings.length} findings · {audit.review_flags.length} flags
              </span>
            </div>
            <Summary audit={audit} />
            {audit.verdict === 'blocked' ? (
              <p class="db-empty">Blocked — no EN baseline was extracted.</p>
            ) : null}
          </section>

          <section class="db-card db-wide">
            <div class="db-card-head">
              <h2>Findings</h2>
              <span class="db-count">{audit.findings.length}</span>
            </div>
            {audit.findings.length === 0 ? (
              <p class="db-empty">No mechanical findings.</p>
            ) : (
              <table class="db-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Finding</th>
                    <th>Notes</th>
                    <th>Priority hint</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.findings.map((f, i) => (
                    <tr key={`${f.field}|${f.finding}|${i}`}>
                      <td>{f.field}</td>
                      <td>{f.finding}</td>
                      <td class="db-notes">{f.notes}</td>
                      <td>{f.priority_hint || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {audit.review_flags.length > 0 ? (
            <section class="db-card db-wide">
              <div class="db-card-head">
                <h2>Review flags</h2>
                <span class="db-count">{audit.review_flags.length}</span>
              </div>
              <ul class="db-flags db-flags--warn">
                {audit.review_flags.map((flag, i) => (
                  <li key={`${flag}|${i}`}>{flag}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {result?.mdBlock ? (
            <section class="db-card db-wide">
              <div class="db-card-head">
                <h2>Dossier block</h2>
                <button type="button" class="db-btn" onClick={() => void copyBlock()}>
                  {copied ? 'Copied' : 'Copy block'}
                </button>
              </div>
              <textarea class="db-textarea" rows={6} readOnly value={result.mdBlock} />
              <p class="db-empty">
                Paste into Push errors (SKU + dossier markdown) to build Listing Errors payloads.
              </p>
            </section>
          ) : null}

          {result?.anomalies && result.anomalies.length > 0 ? (
            <section class="db-card db-wide">
              <div class="db-card-head">
                <h2>Fetch anomalies</h2>
                <span class="db-count">{result.anomalies.length}</span>
              </div>
              <ul class="db-flags db-flags--warn">
                {result.anomalies.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <Matrix audit={audit} />
        </>
      ) : null}
    </>
  );
}
