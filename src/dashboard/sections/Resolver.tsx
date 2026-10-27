import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type {
  ResolveAdminFallback,
  ResolveSkuResponse,
  ResolverNotionMetadata,
} from '../../lib/messages';
import type { ResolverJson } from '../../lib/resolver';
import { supplierFor } from '../../lib/resolver';
import { buildVariantSummary } from '../../lib/variants';
import { buildMagentoTable } from '../../lib/magento';

function LinkRow({ label, url }: { label: string; url: string }) {
  if (!url) return null;
  return (
    <li>
      <span>{label}</span>
      <a href={url} target="_blank" rel="noreferrer noopener">
        {url}
      </a>
    </li>
  );
}

function urlsEqual(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const normalize = (value: string): string => {
    try {
      const parsed = new URL(value);
      const path = parsed.pathname.replace(/\/+/g, '/').replace(/\/+$/, '');
      return `${parsed.origin}${path}`.toLowerCase();
    } catch {
      return value.trim().replace(/\/+$/, '').toLowerCase();
    }
  };
  return normalize(a) === normalize(b);
}

function ResolverResult({
  r,
  notion,
  adminBase,
  source,
}: {
  r: ResolverJson;
  notion?: ResolverNotionMetadata;
  adminBase?: string;
  source?: ResolveSkuResponse['source'];
}) {
  const v = buildVariantSummary(r);
  const m = buildMagentoTable(r, adminBase);

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>
            Resolver <span class="db-mono">{r.sku}</span>
          </h2>
          {source ? <span class="db-badge">{source}</span> : null}
          <span class={r.verified ? 'db-badge db-ok' : 'db-badge db-warn'}>
            {r.verified ? 'verified' : `${r.anomalies.length} anomalies`}
          </span>
        </div>
        <ul class="db-kv">
          <li>
            <span>Product type</span>
            <b>{r.product_type}</b>
          </li>
          <li>
            <span>Supplier</span>
            <b>{notion?.supplier || supplierFor(r.sku)}</b>
          </li>
          <li>
            <span>{m.isSimple ? 'Simple ID' : 'Configurable ID'}</span>
            <b class="db-mono">{m.isSimple ? m.simpleId : m.confId}</b>
          </li>
          <li>
            <span>Children / optionPrices</span>
            <b>
              {r.child_count} / {r.option_prices_count}
            </b>
          </li>
          <li>
            <span>Source</span>
            <b>{r.source ?? '-'}</b>
          </li>
        </ul>
        {notion?.category || notion?.subcategory || notion?.status ? (
          <ul class="db-kv">
            {notion.category || notion.subcategory ? (
              <li>
                <span>Notion category</span>
                <b>
                  {notion.category}
                  {notion.subcategory ? ` / ${notion.subcategory}` : ''}
                </b>
              </li>
            ) : null}
            {notion.status ? (
              <li>
                <span>Notion status</span>
                <b>{notion.status}</b>
              </li>
            ) : null}
          </ul>
        ) : null}
        <ul class="db-links db-links--flush">
          <LinkRow label="Frontend" url={r.frontend_url} />
          {Object.entries(r.store_urls).map(([lang, url]) => (
            <LinkRow key={lang} label={`Frontend (${lang.toUpperCase()})`} url={url} />
          ))}
          <LinkRow label="Backend" url={m.configurableUrl} />
          {Object.entries(m.parentUrls)
            .filter(([scope]) => scope !== 'all')
            .map(([scope, url]) => (
              <LinkRow key={scope} label={`Backend (${scope.toUpperCase()})`} url={url} />
            ))}
          {notion?.frontend && !urlsEqual(notion.frontend, r.frontend_url) ? (
            <LinkRow label="SKU Library frontend" url={notion.frontend} />
          ) : null}
          {notion?.backend && !urlsEqual(notion.backend, m.configurableUrl) ? (
            <LinkRow label="SKU Library backend" url={notion.backend} />
          ) : null}
        </ul>
        {r.anomalies.length > 0 ? (
          <ul class="db-flags db-flags--warn">
            {r.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Variants</h2>
          <span class="db-count">
            {v.isSimple ? 'simple' : `${v.colorCount} x ${v.sizeCount}`}
          </span>
        </div>
        {v.isSimple ? (
          <p class="db-empty">Simple product — single variant, no colour/size matrix.</p>
        ) : (
          <>
            <ul class="db-kv">
              <li>
                <span>Total / expected</span>
                <b>
                  {v.total} / {v.expected}
                </b>
              </li>
              <li>
                <span>Sizes</span>
                <b>{v.sizes.join(', ')}</b>
              </li>
            </ul>
            <div class="db-families">
              {v.familyOrder.map((f) => (
                <div class="db-family" key={f}>
                  <span
                    class={
                      f === 'Unclassified (review)' ? 'db-family-name db-warn' : 'db-family-name'
                    }
                  >
                    {f}
                  </span>
                  <span class="db-family-list">{v.families[f]?.join(', ')}</span>
                </div>
              ))}
            </div>
            {v.missing.length > 0 ? (
              <p class="db-flags db-flags--warn">
                Missing {v.missing.length}: {v.missingText}
              </p>
            ) : (
              <p class="db-empty">Missing combos: none (full matrix).</p>
            )}
          </>
        )}
        {v.anomalies.length > 0 ? (
          <ul class="db-flags db-flags--warn">
            {v.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Magento links</h2>
          <span class="db-count">{m.urlCount} child URLs</span>
        </div>
        <div class="db-scopes">
          {Object.entries(m.parentUrls).map(([scope, url]) => (
            <a key={scope} href={url} target="_blank" rel="noreferrer noopener">
              {scope.toUpperCase()}
            </a>
          ))}
        </div>
        <table class="db-table">
          <thead>
            <tr>
              <th>Child ID</th>
              <th>Colour</th>
              <th>Size</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {m.groupOrder.flatMap((group) =>
              (m.groups[group] ?? []).map((row) => (
                <tr key={row.child}>
                  <td class="db-mono">{row.child}</td>
                  <td>{row.color}</td>
                  <td>{row.size}</td>
                  <td>
                    <a href={row.url} target="_blank" rel="noreferrer noopener">
                      edit
                    </a>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
        {m.anomalies.length > 0 ? (
          <ul class="db-flags db-flags--warn">
            {m.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}

function AdminFallbackResult({
  fallback,
  sku,
}: {
  fallback: ResolveAdminFallback;
  sku: string;
}) {
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>
          Magento admin result <span class="db-mono">{sku}</span>
        </h2>
        <span class="db-badge db-warn">storefront resolver unavailable</span>
      </div>
      <ul class="db-kv">
        <li>
          <span>Product ID</span>
          <b class="db-mono">{fallback.productId}</b>
        </li>
      </ul>
      <ul class="db-links db-links--flush">
        <LinkRow label="Backend" url={fallback.backend} />
      </ul>
      {fallback.children.length ? (
        <table class="db-table">
          <thead>
            <tr>
              <th>Child ID</th>
              <th>Colour</th>
              <th>Size</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {fallback.children.map((child) => (
              <tr key={child.id}>
                <td class="db-mono">{child.id}</td>
                <td>{child.color}</td>
                <td>{child.size}</td>
                <td>
                  {child.backend ? (
                    <a href={child.backend} target="_blank" rel="noreferrer noopener">
                      edit
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function NotionOnlyResult({
  sku,
  notion,
}: {
  sku: string;
  notion: ResolverNotionMetadata;
}) {
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>
          SKU Library result <span class="db-mono">{sku}</span>
        </h2>
        <span class="db-badge db-warn">resolver unavailable</span>
      </div>
      <ul class="db-kv">
        {notion.category || notion.subcategory ? (
          <li>
            <span>Category</span>
            <b>
              {notion.category}
              {notion.subcategory ? ` / ${notion.subcategory}` : ''}
            </b>
          </li>
        ) : null}
        {notion.supplier ? (
          <li>
            <span>Supplier</span>
            <b>{notion.supplier}</b>
          </li>
        ) : null}
        {notion.status ? (
          <li>
            <span>Status</span>
            <b>{notion.status}</b>
          </li>
        ) : null}
      </ul>
      <ul class="db-links db-links--flush">
        <LinkRow label="Frontend" url={notion.frontend} />
        <LinkRow label="Backend" url={notion.backend} />
      </ul>
    </section>
  );
}

export function Resolver() {
  const [sku, setSku] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveSkuResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const tabs = await browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tab = tabs[0];
        if (!tab?.id || !(tab.url ?? '').includes('/catalog/product')) return;
        const response = (await browser.tabs.sendMessage(tab.id, {
          type: 'GET_SKU',
        })) as { sku?: string } | undefined;
        if (response?.sku) setSku(response.sku);
      } catch {
        // The active tab may not have the Magento content script.
      }
    })();
  }, []);

  const run = async (): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setWarning(null);
    setResult(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'RESOLVE_SKU',
        sku: trimmed,
        url: url.trim() || undefined,
      })) as ResolveSkuResponse;
      if (response?.ok) {
        setResult(response);
        setWarning(response.warning ?? null);
        if (response.resolutionError) {
          setWarning(
            [response.warning, `Storefront resolver failed: ${response.resolutionError}`]
              .filter(Boolean)
              .join(' '),
          );
        }
      } else {
        setError(response?.error ?? 'Resolve failed.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Resolve SKU</h2>
        </div>
        <label class="db-field">
          <span>SKU</span>
          <em>e.g. R0317C or TTFL9293</em>
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
        <div class="db-actions">
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={loading}
            onClick={() => void run()}
          >
            {loading ? 'Resolving…' : 'Resolve'}
          </button>
        </div>
      </section>

      {error ? <div class="mhx-error">{error}</div> : null}
      {warning ? <div class="mhx-error">{warning}</div> : null}
      {result?.resolver ? (
        <ResolverResult
          r={result.resolver}
          notion={result.notion}
          adminBase={result.adminBase}
          source={result.source}
        />
      ) : null}
      {result?.adminFallback ? (
        <AdminFallbackResult fallback={result.adminFallback} sku={sku.trim()} />
      ) : null}
      {result && !result.resolver && !result.adminFallback && result.notion ? (
        <NotionOnlyResult sku={sku.trim()} notion={result.notion} />
      ) : null}
    </>
  );
}
