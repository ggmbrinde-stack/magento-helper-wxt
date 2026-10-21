import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { NotionHealthResponse } from '../../lib/messages';
import type {
  DbHealth,
  HealthStatus,
  NotionHealthReport,
} from '../../lib/notionHealth';
import { useSettings } from '../useSettings';

function notionUrl(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, '')}`;
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const cls =
    status === 'ok'
      ? 'db-badge db-ok'
      : status === 'warn'
        ? 'db-badge db-warn'
        : 'db-badge db-bad';
  return <span class={cls}>{status}</span>;
}

function DbCard({ label, db }: { label: string; db: DbHealth }) {
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>{label}</h2>
        <StatusBadge status={db.reachable ? 'ok' : 'fail'} />
      </div>
      <ul class="db-kv">
        <li>
          <span>Database</span>
          <b>
            {db.title ? `${db.title} · ` : ''}
            <a href={notionUrl(db.id)} target="_blank" rel="noreferrer noopener">
              {db.id}
            </a>
          </b>
        </li>
        <li>
          <span>Reachable</span>
          <b class={db.reachable ? 'ok' : 'bad'}>{db.reachable ? 'Yes' : 'No'}</b>
        </li>
        <li>
          <span>Query (read)</span>
          <b class={db.queryOk ? 'ok' : 'bad'}>
            {db.queryOk ? `OK · ${db.sampleCount} row(s) sampled` : 'Failed'}
          </b>
        </li>
        <li>
          <span>Properties</span>
          <b>{db.propertyCount}</b>
        </li>
      </ul>
      {db.error ? <p class="db-flags db-flags--warn">{db.error}</p> : null}
      {db.missing.length > 0 ? (
        <p class="db-flags db-flags--warn">
          Missing required: {db.missing.join(', ')}
        </p>
      ) : null}
      {db.mismatched.length > 0 ? (
        <ul class="db-flags db-flags--warn">
          {db.mismatched.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {db.properties.length > 0 ? (
        <table class="db-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>Type</th>
              <th>Options</th>
            </tr>
          </thead>
          <tbody>
            {db.properties.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.type}</td>
                <td class="db-notes">{p.options.length ? p.options.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

export function NotionHealth() {
  const { settings, loaded } = useSettings();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<NotionHealthReport | null>(null);
  const [error, setError] = useState('');

  const run = async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'NOTION_HEALTH',
      })) as NotionHealthResponse;
      if (!response) {
        setError('No response from the background worker.');
        setReport(null);
        return;
      }
      if (!response.ok || !response.report) {
        setError(response.error ?? 'Health check failed.');
        setReport(null);
        return;
      }
      setReport(response.report);
    } catch (err) {
      setError((err as Error).message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
    // Run once on open; the button re-runs on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Notion connection</h2>
          {report ? (
            <span class={report.ok ? 'db-badge db-ok' : 'db-badge db-warn'}>
              {report.ok ? 'healthy' : 'attention'}
            </span>
          ) : null}
        </div>
        <p class="db-note">
          Read-only pre-flight: token source, both databases, the write contract and a local
          write simulation. No page is created, updated or deleted here.
        </p>
        <ul class="db-kv">
          <li>
            <span>Token source</span>
            <b>{report?.token.source ?? 'chrome.storage.local → notionToken'}</b>
          </li>
          <li>
            <span>Token</span>
            <b class={report?.token.configured ? 'ok' : 'bad'}>
              {!report
                ? loaded && settings.notionToken
                  ? 'Configured'
                  : loaded
                    ? 'Missing'
                    : '…'
                : report.token.shape}
            </b>
          </li>
          <li>
            <span>Writes flag</span>
            <b class={report?.writesEnabled ? 'ok' : 'bad'}>
              {report ? (report.writesEnabled ? 'create-only enabled' : 'disabled') : '…'}
            </b>
          </li>
        </ul>
        <div class="db-actions">
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={loading}
            onClick={() => void run()}
          >
            {loading ? 'Checking…' : 'Run checks'}
          </button>
          {report ? (
            <span class="db-status">
              checked {new Date(report.generated).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </section>

      {error ? <div class="mhx-error">{error}</div> : null}

      {report ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Checks</h2>
            <span class="db-count">{report.checks.length}</span>
          </div>
          <table class="db-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td class="db-notes">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {report ? <DbCard label="SKU Library" db={report.skuLibrary} /> : null}
      {report ? <DbCard label="Listing Errors" db={report.listingErrors} /> : null}

      {report ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Write simulation</h2>
            <StatusBadge status={report.simulation.ran ? (report.simulation.ok ? 'ok' : 'fail') : 'warn'} />
          </div>
          <p class="db-note">{report.simulation.reason}</p>
          {report.simulation.rows.length > 0 ? (
            <table class="db-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {report.simulation.rows.map((row) => (
                  <tr key={row.property}>
                    <td>{row.property}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td class="db-notes">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
