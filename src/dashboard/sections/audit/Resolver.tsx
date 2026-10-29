import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type {
  CacheDuplicate,
  CategoryCheck,
  CheckSupplierResponse,
  ResolveAdminFallback,
  ResolveSkuResponse,
  ResolverNotionMetadata,
} from '../../../core/messages';
import type { AvailabilityCheck } from '../../../audit';
import type { SupplierLinkInfo } from '../../../audit';
import { supplierLinkFor } from '../../../audit';
import type { ResolverJson } from '../../../shared/resolver';
import type { VariantTargets } from '../../../audit';
import { supplierFor } from '../../../shared/resolver';
import { buildVariantSummary } from '../../../audit';
import { buildMagentoTable } from '../../../shared/magento';

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

/** F2: age is shown next to the badge so a stale result is obvious. */
function formatAge(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

const CATALOG_SOURCE_LABEL: Record<SupplierLinkInfo['catalogSource'], string> = {
  notion: 'confirmed in the SKU Library',
  map: 'confirmed in the supplier map',
  guessed: 'guessed from the SKU digits',
  none: 'no URL known',
};

const AVAILABILITY_CLASS: Record<AvailabilityCheck['verdict'], string> = {
  available: 'db-badge db-ok',
  'discontinued-candidate': 'db-badge db-bad',
  'not-found': 'db-badge db-warn',
  unresolved: 'db-badge db-warn',
  'internal-only': 'db-badge',
  'fetch-error': 'db-badge db-warn',
};

function SupplierCard({
  supplier,
  availability,
  busy,
  onCheck,
}: {
  supplier: SupplierLinkInfo;
  availability: AvailabilityCheck | null;
  busy: boolean;
  onCheck: () => void;
}) {
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>Supplier</h2>
        <span class="db-badge">
          {supplier.supplier} · tier {supplier.tier}
        </span>
        {availability ? (
          <span class={AVAILABILITY_CLASS[availability.verdict]}>
            {availability.verdict}
          </span>
        ) : null}
        <div class="db-actions">
          <button type="button" class="db-btn" disabled={busy} onClick={onCheck}>
            {busy ? 'Checking…' : availability ? 'Re-check' : 'Check availability'}
          </button>
        </div>
      </div>
      <ul class="db-kv">
        <li>
          <span>Official site</span>
          <b>{supplier.official || 'internal supplier — no public site'}</b>
        </li>
        <li>
          <span>Catalogue product</span>
          <b>{supplier.catalog || '—'}</b>
        </li>
        <li>
          <span>Catalogue source</span>
          <b class={supplier.catalogSource === 'guessed' ? 'bad' : undefined}>
            {CATALOG_SOURCE_LABEL[supplier.catalogSource]}
          </b>
        </li>
        {availability ? (
          <li>
            <span>Checked</span>
            <b>{new Date(availability.checkedAt).toLocaleString()}</b>
          </li>
        ) : null}
      </ul>
      <ul class="db-links db-links--flush">
        <LinkRow label="Official" url={supplier.official} />
        <LinkRow label="Alternate" url={supplier.alt} />
        <LinkRow label="Catalogue" url={supplier.catalog} />
        {availability?.url && !urlsEqual(availability.url, supplier.catalog) ? (
          <LinkRow label="Checked page" url={availability.url} />
        ) : null}
      </ul>
      {availability?.review.length ? (
        <ul class="db-flags">
          {availability.review.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {availability?.misses.length ? (
        <p class="db-empty">
          404 record: {availability.misses.length} check(s) —{' '}
          {availability.misses.map((iso) => new Date(iso).toLocaleDateString()).join(', ')}
        </p>
      ) : null}
      {availability?.anomalies.length ? (
        <ul class="db-flags db-flags--warn">
          {availability.anomalies.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {supplier.reviewFlags.length ? (
        <ul class="db-flags db-flags--warn">
          {supplier.reviewFlags.map((flag) => (
            <li key={flag}>{flag}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function CategoryCard({
  r,
  notion,
  check,
}: {
  r: ResolverJson;
  notion?: ResolverNotionMetadata;
  check?: CategoryCheck;
}) {
  const path = r.categories?.path ?? [];
  if (path.length === 0 && !notion?.category) return null;
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>Categories</h2>
        <span class="db-count">{r.categories?.source ?? 'none'}</span>
        {check && check.mismatches.length > 0 ? (
          <span class="db-badge db-warn">{check.mismatches.length} mismatch</span>
        ) : null}
      </div>
      <ul class="db-kv">
        {path.length > 0 ? (
          <li>
            <span>Storefront path</span>
            <b>{path.join(' › ')}</b>
          </li>
        ) : (
          <li>
            <span>Storefront path</span>
            <b>not published on the PDP</b>
          </li>
        )}
        {notion?.category ? (
          <li>
            <span>SKU Library</span>
            <b>
              {[notion.category, notion.subcategory, notion.subSubCategory]
                .filter(Boolean)
                .join(' › ')}
            </b>
          </li>
        ) : null}
      </ul>
      {r.categories?.urls.length ? (
        <ul class="db-links db-links--flush">
          {r.categories.path.map((name, index) => {
            const url = r.categories?.urls[index] ?? '';
            return url ? (
              <LinkRow key={`${name}-${index}`} label={name} url={url} />
            ) : null;
          })}
        </ul>
      ) : null}
      {check && check.mismatches.length > 0 ? (
        <ul class="db-flags db-flags--warn">
          {check.mismatches.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function DuplicateFlags({ duplicates }: { duplicates: CacheDuplicate[] }) {
  if (duplicates.length === 0) return null;
  return (
    <ul class="db-flags db-flags--warn">
      {duplicates.map((duplicate) => (
        <li key={duplicate.sku}>
          duplicate of <b class="db-mono">{duplicate.sku}</b> ({duplicate.reason}) —{' '}
          {duplicate.frontend_url || `${duplicate.configurable_id}`}
        </li>
      ))}
    </ul>
  );
}

function ResolverResult({
  r,
  notion,
  adminBase,
  source,
  targets,
  targetsError,
  categoryCheck,
  duplicates,
  ageDays,
  stale,
  supplier,
  availability,
  supplierBusy,
  onCheckSupplier,
}: {
  r: ResolverJson;
  notion?: ResolverNotionMetadata;
  adminBase?: string;
  source?: ResolveSkuResponse['source'];
  targets?: VariantTargets;
  targetsError?: string;
  categoryCheck?: CategoryCheck;
  duplicates?: CacheDuplicate[];
  ageDays?: number | null;
  stale?: boolean;
  supplier?: SupplierLinkInfo;
  availability: AvailabilityCheck | null;
  supplierBusy: boolean;
  onCheckSupplier: () => void;
}) {
  // A partial (admin-only) payload has no attributes or index: rendering the
  // matrix would invent an empty one (F7).
  const v = r.partial ? null : buildVariantSummary(r, targets);
  const m = r.partial ? null : buildMagentoTable(r, adminBase);
  const childSku = new Map(
    (r.children_detail ?? []).map((child) => [child.id, child.sku] as const),
  );
  // Older cache entries carry no supplier block; the rule is deterministic, so
  // recompute it instead of showing an empty card.
  const resolvedSupplier =
    supplier ??
    supplierLinkFor(r.sku, {
      catalogUrl: notion?.supplierProduct,
      supplierUrl: notion?.supplierLink,
    });

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>
            Resolver <span class="db-mono">{r.sku}</span>
          </h2>
          {source ? <span class="db-badge">{source}</span> : null}
          {r.partial ? <span class="db-badge db-warn">admin only</span> : null}
          <span class={r.verified ? 'db-badge db-ok' : 'db-badge db-warn'}>
            {r.verified ? 'verified' : `${r.anomalies.length} anomalies`}
          </span>
          <span class={stale ? 'db-badge db-warn' : 'db-badge'}>
            {formatAge(ageDays)} old
          </span>
        </div>
        <ul class="db-kv">
          <li>
            <span>Product type</span>
            <b>{r.product_type}</b>
          </li>
          <li>
            <span>Supplier</span>
            <b>{notion?.supplier || resolvedSupplier.supplier || supplierFor(r.sku)}</b>
          </li>
          <li>
            <span>{r.product_type === 'configurable' ? 'Configurable ID' : 'Product ID'}</span>
            <b class="db-mono">
              {r.configurable_id ?? r.simple_product_id ?? '—'}
            </b>
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
          <LinkRow label="Backend" url={m?.configurableUrl ?? ''} />
          {m
            ? Object.entries(m.parentUrls)
                .filter(([scope]) => scope !== 'all')
                .map(([scope, url]) => (
                  <LinkRow key={scope} label={`Backend (${scope.toUpperCase()})`} url={url} />
                ))
            : null}
          {r.redirected_to ? (
            <LinkRow label="Redirected from" url={r.redirected_to} />
          ) : null}
          {notion?.frontend && !urlsEqual(notion.frontend, r.frontend_url) ? (
            <LinkRow label="SKU Library frontend" url={notion.frontend} />
          ) : null}
          {notion?.backend && !urlsEqual(notion.backend, m?.configurableUrl) ? (
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
        {r.notices && r.notices.length > 0 ? (
          <ul class="db-flags">
            {r.notices.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <DuplicateFlags duplicates={duplicates ?? []} />
      </section>

      <CategoryCard r={r} notion={notion} check={categoryCheck} />

      {resolvedSupplier.supplier ? (
        <SupplierCard
          supplier={resolvedSupplier}
          availability={availability}
          busy={supplierBusy}
          onCheck={onCheckSupplier}
        />
      ) : null}

      {v ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Variants</h2>
            <span class="db-count">
              {v.isSimple ? v.productType : `${v.colorCount} x ${v.sizeCount}`}
            </span>
          </div>
          {v.isSimple ? (
            <p class="db-empty">
              {v.productType} product — no colour/size matrix.
            </p>
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
                <li>
                  <span>Attribute options</span>
                  <b>
                    {v.optionCounts['93'] === null ? '?' : v.optionCounts['93']} colours /{' '}
                    {v.optionCounts['142'] === null ? '?' : v.optionCounts['142']} sizes
                  </b>
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
              {v.matrix.target ? (
                <div class="db-target">
                  <ul class="db-kv">
                    <li>
                      <span>Admin target ({v.targetsSource})</span>
                      <b>
                        {v.matrix.target.colors.length} x {v.matrix.target.sizes.length} ={' '}
                        {v.matrix.target.expected} / present {v.matrix.target.present.length}
                      </b>
                    </li>
                  </ul>
                  {v.missingVsTarget.length > 0 ? (
                    <p class="db-flags db-flags--warn">
                      Missing vs target {v.missingVsTarget.length}:{' '}
                      {v.missingVsTargetText}
                    </p>
                  ) : (
                    <p class="db-empty">
                      Missing vs target: none (storefront covers the whole admin matrix).
                    </p>
                  )}
                  {v.extraVsTarget.length > 0 ? (
                    <p class="db-flags db-flags--warn">
                      On storefront but not in the admin target: {v.extraVsTargetText}
                    </p>
                  ) : null}
                  {v.targetsNote ? <p class="db-empty">{v.targetsNote}</p> : null}
                </div>
              ) : targetsError ? (
                <p class="db-empty">Target matrix unavailable: {targetsError}.</p>
              ) : null}
            </>
          )}
          {v.labelReview.notes.length > 0 ? (
            <ul class="db-flags">
              {v.labelReview.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          {v.anomalies.length > 0 ? (
            <ul class="db-flags db-flags--warn">
              {v.anomalies.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {m ? (
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
                <th>SKU</th>
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
                    <td class="db-mono">{childSku.get(row.child) || '—'}</td>
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
      ) : null}
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
              <th>SKU</th>
              <th>Colour</th>
              <th>Size</th>
              <th>Status</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {fallback.children.map((child) => (
              <tr key={child.id}>
                <td class="db-mono">{child.id}</td>
                <td class="db-mono">{child.sku || '-'}</td>
                <td>{child.color || '-'}</td>
                <td>{child.size || '-'}</td>
                <td>
                  {child.enabled === undefined
                    ? '-'
                    : child.enabled
                      ? 'enabled'
                      : 'disabled'}
                </td>
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
      ) : fallback.childrenReason ? (
        <p class="db-empty">Child list unavailable: {fallback.childrenReason}.</p>
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
  const [availability, setAvailability] = useState<AvailabilityCheck | null>(null);
  const [supplierBusy, setSupplierBusy] = useState(false);

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

  const run = async (force = false): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setWarning(null);
    setResult(null);
    setAvailability(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'RESOLVE_SKU',
        sku: trimmed,
        url: url.trim() || undefined,
        force,
      })) as ResolveSkuResponse;
      if (response?.ok) {
        setResult(response);
        setAvailability(response.availability ?? null);
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

  const checkSupplier = async (): Promise<void> => {
    const target = result?.resolver?.sku ?? sku.trim();
    if (!target) return;
    setSupplierBusy(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'CHECK_SUPPLIER',
        sku: target,
        force: true,
      })) as CheckSupplierResponse;
      if (response?.ok && response.check) {
        setAvailability(response.check);
      } else {
        setWarning(response?.error ?? 'Supplier check failed.');
      }
    } catch (err) {
      setWarning((err as Error).message);
    } finally {
      setSupplierBusy(false);
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
          <button
            type="button"
            class="db-btn"
            disabled={loading}
            title="Ignore the cache and fetch the storefront again"
            onClick={() => void run(true)}
          >
            Refresh
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
          targets={result.targets}
          targetsError={result.targetsError}
          categoryCheck={result.categoryCheck}
          duplicates={result.duplicates}
          ageDays={result.ageDays}
          stale={result.stale}
          supplier={result.supplier}
          availability={availability}
          supplierBusy={supplierBusy}
          onCheckSupplier={() => void checkSupplier()}
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
