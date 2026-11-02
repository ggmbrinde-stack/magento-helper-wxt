import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { LoadEnableFlowResponse } from '../../../core/messages';
import {
  TIER_PRICES_READ_ON,
  TIER_PRICES_URL,
  TIER_PRICE_TABLES,
  buildEnableFlow,
  type EnableCheck,
  type EnableCheckFix,
  type EnableFlowReport,
} from '../../../audit';
import { useWorkspace } from '../../shell/workspace';

/**
 * Disable -> Enable flow.
 *
 * Read-only by design: it reads the resolver and the Notion PP tracker and
 * turns them into a checklist. The only thing it writes is the local record of
 * which manual rows the operator has verified - never Magento, never Notion.
 */

const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass',
  missing: 'Missing',
  manual: 'Manual',
  na: 'N/A',
  verified: 'Verified',
};

const STATUS_CLASS: Record<string, string> = {
  pass: 'db-badge db-ok',
  missing: 'db-badge db-bad',
  manual: 'db-badge db-warn',
  na: 'db-badge',
  verified: 'db-badge db-ok',
};

function ackKey(sku: string): string {
  return `mhx:enable:${sku}`;
}

interface StoredAcks {
  items: Record<string, string>;
}

function FixAction({
  fix,
  onOpen,
}: {
  fix: EnableCheckFix | undefined;
  onOpen: (id: 'images' | 'text') => void;
}) {
  if (!fix) return null;
  if (fix.open) {
    return (
      <button type="button" class="db-btn" onClick={() => onOpen(fix.open!)}>
        {fix.label}
      </button>
    );
  }
  return (
    <a href={fix.href} target="_blank" rel="noreferrer noopener">
      {fix.label}
    </a>
  );
}

function CheckRow({
  check,
  ackedAt,
  onToggle,
  onOpen,
}: {
  check: EnableCheck;
  ackedAt: string | undefined;
  onToggle: (id: string, on: boolean) => void;
  onOpen: (id: 'images' | 'text') => void;
}) {
  const verified = check.status === 'manual' && Boolean(ackedAt);
  const status = verified ? 'verified' : check.status;
  return (
    <tr>
      <td>
        <strong>{check.title}</strong>
      </td>
      <td>
        <span class={STATUS_CLASS[status] ?? 'db-badge'}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </td>
      <td>
        {check.detail}
        {check.notes.length > 0 ? (
          <ul class="db-kv">
            {check.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        {check.status === 'manual' ? (
          <label class="db-check">
            <input
              type="checkbox"
              checked={Boolean(ackedAt)}
              onChange={(event) =>
                onToggle(check.id, (event.target as HTMLInputElement).checked)
              }
            />
            I verified this in Magento
            {ackedAt ? ` (${new Date(ackedAt).toLocaleDateString()})` : ''}
          </label>
        ) : null}
      </td>
      <td class="db-row-actions">
        <FixAction fix={check.fix} onOpen={onOpen} />
      </td>
    </tr>
  );
}

function TierReference() {
  return (
    <details class="db-card db-wide">
      <summary>Tier prices reference (Notion, read {TIER_PRICES_READ_ON})</summary>
      <p class="db-note">
        Source:{' '}
        <a href={TIER_PRICES_URL} target="_blank" rel="noreferrer noopener">
          Tier Prices
        </a>
        . Compare the product's Advanced Pricing with the table that applies.
      </p>
      {TIER_PRICE_TABLES.map((table) => (
        <div key={table.name}>
          <h2>
            {table.name} <span class="db-count">{table.appliesTo}</span>
          </h2>
          <table class="db-table">
            <thead>
              <tr>
                <th>Quantity</th>
                <th>Discount</th>
              </tr>
            </thead>
            <tbody>
              {table.bands.map((band) => (
                <tr key={`${band.from}-${band.to ?? 'max'}`}>
                  <td>
                    {band.from}
                    {band.to === null ? ' +' : ` – ${band.to}`}
                  </td>
                  <td>{band.discount}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}

export function EnableFlow({
  onOpen,
}: {
  onOpen: (id: 'images' | 'text') => void;
}) {
  const [ws, setWs] = useWorkspace();
  const [sku, setSku] = useState(ws.sku);
  const [response, setResponse] = useState<LoadEnableFlowResponse | null>(null);
  const [report, setReport] = useState<EnableFlowReport | null>(null);
  const [acked, setAcked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    setSku(ws.sku);
  }, [ws.sku]);

  // Acknowledgements are per SKU and local to this browser.
  useEffect(() => {
    const target = report?.sku;
    if (!target) {
      setAcked({});
      return;
    }
    let alive = true;
    void browser.storage.local
      .get(ackKey(target))
      .then((stored) => {
        if (!alive) return;
        const value = stored?.[ackKey(target)] as StoredAcks | undefined;
        setAcked(value?.items && typeof value.items === 'object' ? value.items : {});
      })
      .catch(() => {
        if (alive) setAcked({});
      });
    return () => {
      alive = false;
    };
  }, [report?.sku]);

  const load = async (force: boolean): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'LOAD_ENABLE_FLOW',
        sku: trimmed,
        force,
      })) as LoadEnableFlowResponse;
      setResponse(res);
      if (!res?.ok || !res.resolution) {
        setReport(null);
        setError(res?.error ?? 'The checklist could not be loaded.');
        return;
      }
      const resolution = res.resolution;
      const built = buildEnableFlow({
        sku: resolution.resolver?.sku || trimmed,
        resolver: resolution.resolver,
        notion: resolution.notion,
        targets: resolution.targets,
        categoryCheck: resolution.categoryCheck,
        pp: res.pp,
        ppError: res.ppError,
        availability: resolution.availability,
        adminBase: resolution.adminBase,
      });
      setReport(built);

      // Keep the dashboard on the SKU the resolve actually proved.
      const canonical = resolution.resolver?.sku || trimmed;
      const frontend = resolution.resolver?.frontend_url || '';
      setWs({
        sku: canonical,
        url: frontend || ws.url,
        urlFor: frontend ? canonical : ws.urlFor,
      });
      if (resolution.resolutionError) {
        setNote(`Storefront resolver failed: ${resolution.resolutionError}`);
      }
    } catch (err) {
      setReport(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, on: boolean): void => {
    if (!report) return;
    const next = { ...acked };
    if (on) next[id] = new Date().toISOString();
    else delete next[id];
    setAcked(next);
    void browser.storage.local
      .set({ [ackKey(report.sku)]: { items: next } satisfies StoredAcks })
      .catch(() => {
        // Best effort: the in-memory state still drives this screen.
      });
  };

  const open = report
    ? report.checks.filter(
        (check) =>
          check.status === 'missing' ||
          (check.status === 'manual' && !acked[check.id]),
      )
    : [];
  const missing = report?.counts.missing ?? 0;
  const unverified = open.length - missing;
  const ready = Boolean(report) && open.length === 0;

  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>Enable flow</h2>
        <span class="db-count">read-only · Enable stays manual</span>
        <div class="db-actions">
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={busy || sku.trim() === ''}
            onClick={() => void load(false)}
          >
            {busy ? 'Loading…' : 'Load checklist'}
          </button>
          <button
            type="button"
            class="db-btn"
            disabled={busy || sku.trim() === '' || !report}
            onClick={() => void load(true)}
          >
            Re-check
          </button>
        </div>
      </div>

      <div class="db-grid">
        <label class="db-field">
          <span>SKU</span>
          <input
            type="text"
            class="db-input"
            placeholder="e.g. M22498"
            value={sku}
            onInput={(event) => setSku((event.target as HTMLInputElement).value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void load(false);
              }
            }}
          />
        </label>
      </div>

      <p class="db-note">
        This screen only reads. It never enables the product and never writes to
        Magento or Notion — after every row is Pass or Verified, enable the SKU
        manually in Magento. Manual rows are acknowledged locally in this
        browser so a stale “ready” cannot survive a re-check.
      </p>

      {error ? <div class="mhx-error">{error}</div> : null}
      {note ? <div class="db-warning">{note}</div> : null}

      {!report ? (
        <p class="db-empty-state">
          Enter the disabled SKU and load its checklist. PP comes from the
          Magento Attribute Set and the Notion tracker; categories are compared
          on both sides.
        </p>
      ) : (
        <>
          <div class="db-summary-strip">
            <span>
              Magento
              <b
                class={
                  /disabled/i.test(report.summary.magentoStatus) ? 'bad' : 'ok'
                }
              >
                {report.summary.magentoStatus}
              </b>
            </span>
            <span>
              Supplier<b>{report.summary.supplier}</b>
            </span>
            <span>
              Type<b>{report.summary.productType}</b>
            </span>
            <span>
              Children<b>{report.summary.children}</b>
            </span>
            <span>
              PP<b>{report.summary.ppCode}</b>
            </span>
            <span>
              Availability<b>{report.summary.availability}</b>
            </span>
          </div>

          <p class="db-note">
            {report.summary.categoryPath} · checked{' '}
            {new Date(report.checkedAt).toLocaleTimeString()}
            {response?.resolution?.stale ? ' · cached payload (stale)' : ''}
          </p>

          <table class="db-table">
            <thead>
              <tr>
                <th>Check</th>
                <th>Status</th>
                <th>Detail</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {report.checks.map((check) => (
                <CheckRow
                  key={check.id}
                  check={check}
                  ackedAt={acked[check.id]}
                  onToggle={toggle}
                  onOpen={onOpen}
                />
              ))}
            </tbody>
          </table>

          {ready ? (
            <div class="db-note">
              <strong>Ready to enable.</strong> Every automatic check passed and
              every manual row is verified.{' '}
              <a
                href={report.adminUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Enable the product manually in Magento →
              </a>
            </div>
          ) : (
            <div class="db-warning">
              <strong>{open.length} blocker(s) left:</strong> {missing} missing,{' '}
              {unverified} waiting for manual verification. The product must not
              be enabled yet.
            </div>
          )}

          <div class="db-links">
            <a href={report.adminUrl} target="_blank" rel="noreferrer noopener">
              Magento product edit
            </a>
            <a href={TIER_PRICES_URL} target="_blank" rel="noreferrer noopener">
              Tier Prices (Notion)
            </a>
          </div>
        </>
      )}

      <TierReference />
    </section>
  );
}
