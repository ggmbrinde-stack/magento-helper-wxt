import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { PushListingErrorsResponse } from '../../lib/messages';
import type { ListingErrorPayload } from '../../lib/payload';

function PayloadTable({ payloads }: { payloads: ListingErrorPayload[] }) {
  if (payloads.length === 0) {
    return <p class="db-empty">No payloads produced.</p>;
  }
  return (
    <table class="db-table">
      <thead>
        <tr>
          <th>Error (title)</th>
          <th>Group</th>
          <th>Type</th>
          <th>Fix at</th>
          <th>Priority</th>
          <th>Lang</th>
          <th>Field</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {payloads.map((p) => (
          <tr key={p.dedup_key}>
            <td>{p.title}</td>
            <td>{p.group}</td>
            <td>{p.type}</td>
            <td>{p.fix_location ?? '-'}</td>
            <td>{p.priority ?? '-'}</td>
            <td>{p.language}</td>
            <td>{p.field ?? '-'}</td>
            <td class="db-notes">{p.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function notionUrl(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, '')}`;
}

function PushReportView({ report }: { report: NonNullable<PushListingErrorsResponse['report']> }) {
  return (
    <>
      <ul class="db-kv">
        <li>
          <span>Created</span>
          <b class="ok">{report.created.length}</b>
        </li>
        <li>
          <span>Skipped (exists in Notion)</span>
          <b>{report.skipped.length}</b>
        </li>
        <li>
          <span>Skipped (batch duplicate)</span>
          <b>{report.skippedInBatch.length}</b>
        </li>
        <li>
          <span>Failed</span>
          <b class={report.failed.length ? 'bad' : ''}>{report.failed.length}</b>
        </li>
      </ul>
      {report.created.length > 0 ? (
        <ul class="db-links db-links--flush">
          {report.created.map((title) => {
            const id = report.createdPageIds[title];
            return (
              <li key={title}>
                <span>{title}</span>
                {id ? (
                  <a href={notionUrl(id)} target="_blank" rel="noreferrer noopener">
                    open row
                  </a>
                ) : (
                  <em>id not returned</em>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      {report.skippedInBatch.length > 0 ? (
        <p class="db-note">
          Batch duplicates (not sent): {report.skippedInBatch.join(' · ')}
        </p>
      ) : null}
    </>
  );
}

export function Push() {
  const [sku, setSku] = useState('');
  const [content, setContent] = useState('');
  const [fetchBreadcrumbs, setFetchBreadcrumbs] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PushListingErrorsResponse | null>(null);

  const run = async (write: boolean): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'PUSH_LISTING_ERRORS',
        sku: trimmed,
        content,
        fetchBreadcrumbs,
        confirm: write,
      })) as PushListingErrorsResponse;
      setResult(response ?? { ok: false, error: 'No response.' });
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Build &amp; push Listing Errors</h2>
        </div>
        <label class="db-field">
          <span>SKU</span>
          <input
            type="text"
            value={sku}
            placeholder="e.g. R6681"
            onInput={(e) => setSku(e.currentTarget.value)}
          />
        </label>
        <label class="db-field">
          <span>Dossier markdown</span>
          <em>Paste records/skus/&lt;SKU&gt;.md — the image-audit / text-audit / variants marker blocks</em>
          <textarea
            class="db-textarea"
            rows={10}
            value={content}
            placeholder="<!-- image-audit:begin --> … <!-- image-audit:end -->"
            onInput={(e) => setContent(e.currentTarget.value)}
          />
        </label>
        <label class="db-check">
          <input
            type="checkbox"
            checked={fetchBreadcrumbs}
            onChange={(e) => setFetchBreadcrumbs(e.currentTarget.checked)}
          />
          <span>Fetch EN breadcrumbs (Category / Subcategory)</span>
        </label>
        <label class="db-check">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.currentTarget.checked)}
          />
          <span>I confirm create-only Notion writes (new rows only, never updates)</span>
        </label>
        <div class="db-actions">
          <button
            type="button"
            class="db-btn"
            disabled={loading || !sku.trim()}
            onClick={() => void run(false)}
          >
            {loading ? 'Working…' : 'Preview'}
          </button>
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={loading || !confirm || !sku.trim()}
            onClick={() => void run(true)}
          >
            {loading ? 'Working…' : 'Push to Notion'}
          </button>
        </div>
      </section>

      {result?.error ? <div class="mhx-error">{result.error}</div> : null}

      {result?.report ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Write report</h2>
            <span class="db-badge db-ok">create-only</span>
          </div>
          <PushReportView report={result.report} />
          {result.report.failed.length > 0 ? (
            <ul class="db-flags db-flags--warn">
              {result.report.failed.map((f) => (
                <li key={f.title}>
                  {f.title}: {f.error}
                  {f.status ? ` [${f.status}${f.code ? ` ${f.code}` : ''}]` : ''}
                  {f.field ? ` (field: ${f.field})` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {result?.report && result.report.warnings.length > 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Contract warnings</h2>
            <span class="db-count">{result.report.warnings.length}</span>
          </div>
          <ul class="db-flags">
            {result.report.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {result?.payloads ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Payloads</h2>
            <span class="db-count">{result.payloads.length}</span>
            {result.dryRun ? <span class="db-badge">preview</span> : null}
          </div>
          <PayloadTable payloads={result.payloads} />
        </section>
      ) : null}

      {result?.anomalies && result.anomalies.length > 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Anomalies / review flags</h2>
            <span class="db-count">{result.anomalies.length}</span>
          </div>
          <ul class="db-flags db-flags--warn">
            {result.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
