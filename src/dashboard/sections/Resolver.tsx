import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ResolveSkuResponse } from '../../lib/messages';
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

function ResolverResult({ r }: { r: ResolverJson }) {
  const v = buildVariantSummary(r);
  const m = buildMagentoTable(r);

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>
            Resolver <span class="db-mono">{r.sku}</span>
          </h2>
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
            <b>{supplierFor(r.sku)}</b>
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
        <ul class="db-links db-links--flush">
          <LinkRow label="Frontend" url={r.frontend_url} />
          {Object.entries(r.store_urls).map(([lang, url]) => (
            <LinkRow key={lang} label={`Frontend (${lang.toUpperCase()})`} url={url} />
          ))}
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

export function Resolver() {
  const [sku, setSku] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolverJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'RESOLVE_SKU',
        sku: trimmed,
        url: url.trim() || undefined,
      })) as ResolveSkuResponse;
      if (response?.ok && response.resolver) {
        setResult(response.resolver);
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
          <h2>Resolve a SKU</h2>
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
      {result ? <ResolverResult r={result} /> : null}
    </>
  );
}
