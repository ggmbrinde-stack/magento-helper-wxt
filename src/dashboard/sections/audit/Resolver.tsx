import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type {
  CacheDuplicate,
  CategoryCheck,
  CheckSupplierResponse,
  DownloadMakitoImagesResponse,
  FindMakitoUrlResponse,
  ResolveAdminFallback,
  ResolveSkuResponse,
  ResolverNotionMetadata,
} from '../../../core/messages';
import type { AvailabilityCheck } from '../../../audit';
import type { SupplierLinkInfo } from '../../../audit';
import { ensureWritePermission, evidenceRoot, writeEvidenceFile } from '../../../audit';
import { supplierLinkFor } from '../../../audit';
import type { ResolverJson, ResolverMagentoFacts, ResolverTierPrice } from '../../../shared/resolver';
import type { VariantTargets } from '../../../audit';
import { supplierFor } from '../../../shared/resolver';
import { buildVariantSummary } from '../../../audit';
import { buildMagentoTable } from '../../../shared/magento';
import { categoryCode } from '../../../page/features/category-tree/categoryIndex';
import { activeUrl, useWorkspace } from '../../shell/workspace';

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

/** R7: a cached status is a point in time, so it says when it was read. */
function formatCheckedAt(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `as of ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** Decode the base64 the worker returns into bytes the folder writer accepts. */
function base64Bytes(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const CATALOG_SOURCE_LABEL: Record<SupplierLinkInfo['catalogSource'], string> = {
  manual: 'pasted here',
  notion: 'confirmed in the SKU Library',
  map: 'confirmed in the supplier map',
  guessed: 'guessed from the SKU digits',
  none: 'no URL known',
};

const AVAILABILITY_CLASS: Record<AvailabilityCheck['verdict'], string> = {
  available: 'db-badge db-ok',
  'discontinued-candidate': 'db-badge db-bad',
  'not-found': 'db-badge db-bad',
  unresolved: 'db-badge db-warn',
  'internal-only': 'db-badge',
  'fetch-error': 'db-badge db-warn',
};

/**
 * The verdict in the operator's words. The stored enum (`not-found`,
 * `fetch-error`, …) is an implementation detail - the badge has to answer the
 * one question: is this SKU still on the supplier's site?
 */
const AVAILABILITY_LABEL: Record<AvailabilityCheck['verdict'], string> = {
  available: 'Available on supplier site',
  'discontinued-candidate': 'Possibly discontinued',
  'not-found': 'Not on supplier site',
  unresolved: 'Availability unresolved',
  'internal-only': 'Internal supplier',
  'fetch-error': 'Supplier check failed',
};

function SupplierCard({
  supplier,
  availability,
  busy,
  onCheck,
  downloadBusy,
  downloadMessage,
  onDownloadMakitoImages,
  findBusy,
  onFindProduct,
  linkDraft,
  linkBusy,
  linkError,
  onLinkDraft,
  onSaveLink,
  onClearLink,
}: {
  supplier: SupplierLinkInfo;
  availability: AvailabilityCheck | null;
  busy: boolean;
  onCheck: () => void;
  downloadBusy: boolean;
  downloadMessage: string | null;
  onDownloadMakitoImages: () => void;
  findBusy: boolean;
  onFindProduct: () => void;
  linkDraft: string;
  linkBusy: boolean;
  linkError: string | null;
  onLinkDraft: (value: string) => void;
  onSaveLink: () => void;
  onClearLink: () => void;
}) {
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>Supplier</h2>
        <span class="db-badge">
          {supplier.supplier} · tier {supplier.tier}
        </span>
        {availability ? (
          <span
            class={AVAILABILITY_CLASS[availability.verdict]}
            title={
              availability.url
                ? `${availability.verdict} — ${availability.url}`
                : availability.verdict
            }
          >
            {AVAILABILITY_LABEL[availability.verdict]}
          </span>
        ) : (
          <span class="db-badge" title="no supplier check has run for this SKU yet">
            Not checked yet
          </span>
        )}
        <div class="db-actions">
          <button type="button" class="db-btn" disabled={busy} onClick={onCheck}>
            {busy ? 'Checking…' : availability ? 'Re-check' : 'Check availability'}
          </button>
          {supplier.supplier === 'MAKITO' ? (
            <>
              <button
                type="button"
                class="db-btn"
                disabled={findBusy || downloadBusy}
                title={`Search www.makito.eu for reference ${supplier.sku.replace(/^[A-Za-z]+/, '')}`}
                onClick={onFindProduct}
              >
                {findBusy ? 'Searching Makito…' : 'Find product page'}
              </button>
              <button
                type="button"
                class="db-btn"
                disabled={downloadBusy || findBusy}
                title={
                  supplier.catalog
                    ? `Save the product-gallery images of ${supplier.catalog}`
                    : 'Finds the product page first, then saves its gallery'
                }
                onClick={onDownloadMakitoImages}
              >
                {downloadBusy ? 'Downloading images…' : 'Download Makito images'}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {supplier.supplier === 'MAKITO' && !supplier.catalog ? (
        <p class="db-muted" role="note">
          No product link is known yet — <b>Find product page</b> searches the Makito site for
          this SKU's reference and stores the page it finds.
        </p>
      ) : null}
      {downloadMessage ? (
        <p class="db-muted" role="status">
          {downloadMessage}
        </p>
      ) : null}
      {!supplier.internalOnly ? (
        <div class="db-field">
          <span>Supplier product link</span>
          <em>
            {supplier.catalogSource === 'manual'
              ? 'pasted by you - used for the dossier link and the image download'
              : 'Paste the product page when no URL is known for this SKU'}
          </em>
          <div class="db-link-row">
            <input
              type="text"
              value={linkDraft}
              placeholder={
                supplier.supplier === 'MAKITO'
                  ? 'https://www.makito.eu/es/<product>.html'
                  : 'https://…'
              }
              onInput={(e) => onLinkDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveLink();
              }}
            />
            <button
              type="button"
              class="db-btn"
              disabled={linkBusy || !linkDraft.trim()}
              onClick={onSaveLink}
            >
              {linkBusy ? 'Saving…' : 'Save link'}
            </button>
            {supplier.catalogSource === 'manual' ? (
              <button type="button" class="db-btn" disabled={linkBusy} onClick={onClearLink}>
                Clear
              </button>
            ) : null}
          </div>
          {linkError ? (
            <p class="db-muted" role="alert">
              {linkError}
            </p>
          ) : null}
        </div>
      ) : null}
      <ul class="db-kv">
        <li>
          <span>Official site</span>
          <b>{supplier.official || 'internal supplier — no public site'}</b>
        </li>
        <li>
          <span>Catalogue product</span>
          <b>{supplier.catalog || 'not derivable from the SKU'}</b>
        </li>
        {!supplier.catalog && supplier.searchUrl ? (
          <li>
            <span>Find by SKU</span>
            <b>search the supplier site for {supplier.sku.replace(/^[A-Za-z]+/, '')}</b>
          </li>
        ) : null}
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
        {!supplier.catalog ? (
          <LinkRow label="Search supplier site" url={supplier.searchUrl} />
        ) : null}
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

  const leafName = path[path.length - 1] ?? '';
  const leafCode = leafName ? categoryCode(leafName, path.slice(0, -1)) : null;

  const notionParts = [
    notion?.category,
    notion?.subcategory,
    notion?.subSubCategory,
  ].filter(Boolean) as string[];
  const notionLeaf = notionParts[notionParts.length - 1] ?? '';
  const notionCode = notionLeaf
    ? categoryCode(notionLeaf, notionParts.slice(0, -1))
    : null;
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
            <b>
              {leafCode ? (
                <span class="db-badge db-ok" style={{ marginRight: '6px' }}>
                  {leafCode}
                </span>
              ) : null}
              {path.join(' › ')}
            </b>
          </li>
        ) : (
          <li>
            <span>Storefront path</span>
            <b>not published on the PDP</b>
          </li>
        )}
        {notionParts.length > 0 ? (
          <li>
            <span>SKU Library</span>
            <b>
              {notionCode ? (
                <span class="db-badge db-ok" style={{ marginRight: '6px' }}>
                  {notionCode}
                </span>
              ) : null}
              {notionParts.join(' › ')}
            </b>
          </li>
        ) : null}
      </ul>
      {r.categories?.urls.length ? (
        <ul class="db-links db-links--flush">
          {r.categories.path.map((name, index) => {
            const url = r.categories?.urls[index] ?? '';
            const stepCode = categoryCode(name, r.categories?.path.slice(0, index));
            return url ? (
              <LinkRow
                key={`${name}-${index}`}
                label={stepCode ? `${stepCode} · ${name}` : name}
                url={url}
              />
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

/** One tier row, as the operator would read it in Advanced Pricing. */
function describeTier(row: ResolverTierPrice): string {
  return row.valueType === 'percent'
    ? `${row.qty}+: ${row.value}%`
    : `${row.qty}+: ${row.value} fixed`;
}

function categoryLine(
  path: readonly string[],
  ids: readonly string[] | undefined,
): string {
  return path
    .map((name, index) => {
      const id = ids?.[index];
      return id ? `${name} (${id})` : name;
    })
    .join(' > ');
}

function MagentoFactsCard({
  facts,
  storefrontPrice,
  busy,
  onRead,
}: {
  facts?: ResolverMagentoFacts;
  storefrontPrice?: ResolverJson['storefront_price'];
  busy: boolean;
  onRead: () => void;
}) {
  const readAt = formatCheckedAt(facts?.readAt);
  const price = facts?.price.price ?? null;
  const special = facts?.price.specialPrice ?? null;
  const qty = facts?.stock.qty ?? null;
  const inStock = facts?.stock.isInStock ?? null;

  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>Magento facts</h2>
        {facts ? (
          <span class="db-badge" title="read from the product edit page">
            v{facts.factsVersion} {readAt}
          </span>
        ) : (
          <span class="db-badge db-warn">not read</span>
        )}
        <button
          type="button"
          class="db-btn"
          disabled={busy}
          title="Read the product edit page in Magento (read-only)"
          onClick={onRead}
        >
          {busy ? 'Reading…' : facts ? 'Re-read Magento facts' : 'Read Magento facts'}
        </button>
      </div>

      {!facts ? (
        <p class="db-empty">
          No Magento facts are cached for this SKU. Read the product edit page to
          capture the Attribute Set / PP, categories, tier prices, price, stock
          and visibility. This opens a background admin tab when none is open.
        </p>
      ) : (
        <>
          <ul class="db-kv">
            <li>
              <span>Attribute Set</span>
              <b>{facts.attributeSet || '—'}</b>
            </li>
            <li>
              <span>PP</span>
              <b class={facts.ppCode ? 'db-mono' : 'db-warn'}>
                {facts.ppCode || 'not in the Attribute Set name'}
              </b>
            </li>
            <li>
              <span>Attribute Set ID</span>
              <b class="db-mono">{facts.attributeSetId || '—'}</b>
            </li>
            <li>
              <span>Price</span>
              <b class={price === null ? 'db-warn' : ''}>
                {!facts.priceRead ? 'not read' : price === null ? 'blank' : price}
                {special !== null ? ` · special ${special}` : ''}
              </b>
            </li>
            <li>
              <span>Storefront price</span>
              <b>
                {storefrontPrice?.amount === null || storefrontPrice?.amount === undefined
                  ? 'not published'
                  : `${storefrontPrice.amount} ${storefrontPrice.currency}`}
              </b>
            </li>
            <li>
              <span>Stock</span>
              <b class={qty !== null && qty <= 0 ? 'db-warn' : ''}>
                {!facts.stockRead
                  ? 'not read'
                  : qty === null
                    ? 'quantity blank'
                    : `qty ${qty}`}
                {inStock === null
                  ? ''
                  : inStock
                    ? ' · In Stock'
                    : ' · Out of Stock'}
                {facts.stock.backorders ? ` · ${facts.stock.backorders}` : ''}
              </b>
            </li>
            <li>
              <span>Visibility</span>
              <b>{facts.visibilityRead ? facts.visibility || 'blank' : 'not read'}</b>
            </li>
            <li>
              <span>Status</span>
              <b class={facts.status === 'Disabled' ? 'bad' : ''}>
                {facts.statusRead ? facts.status || 'blank' : 'not read'}
              </b>
            </li>
            <li>
              <span>Websites</span>
              <b>
                {!facts.websitesRead
                  ? 'not read'
                  : facts.websites.length > 0
                    ? facts.websites.join(', ')
                    : 'none assigned'}
              </b>
            </li>
            <li>
              <span>Weight</span>
              <b>
                {!facts.weightRead
                  ? 'not read'
                  : facts.weight === null
                    ? 'blank'
                    : facts.weight}
              </b>
            </li>
          </ul>

          <ul class="db-kv">
            <li>
              <span>Categories</span>
              <span class="db-kv-value">
                {facts.categoryPaths.length > 0 ? (
                  facts.categoryPaths.map((path, index) => (
                    <b key={path.join(' > ')} class="db-mono">
                      {categoryLine(path, facts.categoryIds[index])}
                    </b>
                  ))
                ) : (
                  <b class="db-warn">
                    {facts.categoryReason ?? 'no category is checked'}
                  </b>
                )}
              </span>
            </li>
            <li>
              <span>Tier prices</span>
              <span class="db-kv-value">
                {!facts.tierRead ? (
                  <b class="db-warn">{facts.tierReason ?? 'not read'}</b>
                ) : facts.tierPrices.length === 0 ? (
                  <b>none defined</b>
                ) : (
                  facts.tierPrices.map((row, index) => (
                    <b key={`${row.qty}-${row.valueType}-${index}`} class="db-mono">
                      {describeTier(row)}
                      {row.group ? ` · ${row.group}` : ''}
                      {row.website ? ` · ${row.website}` : ''}
                    </b>
                  ))
                )}
              </span>
            </li>
          </ul>
        </>
      )}
    </section>
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
  imageDownloadBusy,
  imageDownloadMessage,
  onDownloadMakitoImages,
  findBusy,
  onFindProduct,
  factsBusy,
  onReadFacts,
  linkDraft,
  linkBusy,
  linkError,
  onLinkDraft,
  onSaveLink,
  onClearLink,
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
  imageDownloadBusy: boolean;
  imageDownloadMessage: string | null;
  onDownloadMakitoImages: () => void;
  findBusy: boolean;
  onFindProduct: () => void;
  factsBusy: boolean;
  onReadFacts: () => void;
  linkDraft: string;
  linkBusy: boolean;
  linkError: string | null;
  onLinkDraft: (value: string) => void;
  onSaveLink: () => void;
  onClearLink: () => void;
}) {
  // A partial (admin-only) payload has no attributes or index: rendering the
  // matrix would invent an empty one (F7).
  const v = r.partial ? null : buildVariantSummary(r, targets);
  // Built even for a partial payload: a simple product's only Magento link is
  // the table's single row, and even an empty matrix still needs the parent's
  // store-view links. Its anomalies describe missing storefront data, which a
  // partial payload is expected not to have, so they are suppressed below.
  const m = buildMagentoTable(r, adminBase);
  const childSku = new Map(
    (r.children_detail ?? []).map((child) => [child.id, child.sku] as const),
  );
  // Disabled children never appear on the storefront, so the admin status is the
  // only place their Enabled/Disabled state is visible. Show the column when the
  // payload actually carries it rather than a wall of "-".
  const childStatus = new Map(
    (r.children_detail ?? [])
      .filter((child) => child.enabled !== undefined)
      .map((child) => [child.id, child.enabled === false ? 'disabled' : 'enabled'] as const),
  );
  const showStatus = childStatus.size > 0;
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
          {/* "admin" next to "admin only" said the same thing twice. */}
          {source && !(r.partial && source === 'admin') ? (
            <span class="db-badge">{source}</span>
          ) : null}
          {r.partial ? <span class="db-badge db-warn">admin only</span> : null}
          {r.verified ? (
            <span class="db-badge db-ok">verified</span>
          ) : r.anomalies.length > 0 ? (
            <span class="db-badge db-warn">
              {r.anomalies.length} anomaly{r.anomalies.length === 1 ? '' : 's'}
            </span>
          ) : null}
          {/* An admin-only payload is never cached, so "— old" was describing
              an age that does not exist. */}
          {ageDays !== null && ageDays !== undefined ? (
            <span class={stale ? 'db-badge db-warn' : 'db-badge'}>
              {formatAge(ageDays)} old
            </span>
          ) : (
            <span class="db-badge" title="a partial payload is never cached">
              live
            </span>
          )}
        </div>
        <ul class="db-kv">
          <li>
            <span>Product type</span>
            <b>{r.product_type}</b>
          </li>
          {r.magento_status?.label ? (
            <li>
              <span>Magento status</span>
              <span class="db-kv-value">
                <b class={r.magento_status.label === 'Disabled' ? 'bad' : 'ok'}>
                  {r.magento_status.label}
                </b>
                {/* R7: Enabled/Disabled is point-in-time; a cached payload can be
                    two weeks old, so the read date travels with the verdict. */}
                {r.magento_status.checked_at ? (
                  <small
                    title="read from the Magento admin when this result was resolved"
                  >
                    {formatCheckedAt(r.magento_status.checked_at)}
                  </small>
                ) : null}
              </span>
            </li>
          ) : null}
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
            {/* optionPrices only exists on a storefront payload; showing
                "1 / 0" read as a failure rather than "not available here". */}
            <span>{r.partial ? 'Children (admin)' : 'Children / optionPrices'}</span>
            <b>{r.partial ? r.child_count : `${r.child_count} / ${r.option_prices_count}`}</b>
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

      <MagentoFactsCard
        facts={r.magento_facts}
        storefrontPrice={r.storefront_price}
        busy={factsBusy}
        onRead={onReadFacts}
      />

      {resolvedSupplier.supplier ? (
        <SupplierCard
          supplier={resolvedSupplier}
          availability={availability}
          busy={supplierBusy}
          onCheck={onCheckSupplier}
          downloadBusy={imageDownloadBusy}
          downloadMessage={imageDownloadMessage}
          onDownloadMakitoImages={onDownloadMakitoImages}
          findBusy={findBusy}
          onFindProduct={onFindProduct}
          linkDraft={linkDraft}
          linkBusy={linkBusy}
          linkError={linkError}
          onLinkDraft={onLinkDraft}
          onSaveLink={onSaveLink}
          onClearLink={onClearLink}
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
            <span class="db-badge db-mono">parent {r.sku}</span>
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
                <th>Child SKU</th>
                <th>Colour</th>
                <th>Size</th>
                {showStatus ? <th>Status</th> : null}
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
                    {showStatus ? (
                      <td>
                        {childStatus.get(row.child) === 'disabled' ? (
                          <span class="db-badge db-bad">disabled</span>
                        ) : childStatus.get(row.child) === 'enabled' ? (
                          <span class="db-badge db-ok">enabled</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    ) : null}
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
          {!r.partial && m.anomalies.length > 0 ? (
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
  // The grid has no colour/size columns, so when children came from it the two
  // columns were a wall of "-". Show them only when they carry something.
  const hasLabels = fallback.children.some(
    (child) => child.color || child.size,
  );
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>
          Children <span class="db-mono">{sku}</span>
        </h2>
        <span class="db-count">{fallback.children.length}</span>
        {fallback.status ? (
          <span class={fallback.status === 'Disabled' ? 'db-badge db-bad' : 'db-badge db-ok'}>
            {fallback.status}
          </span>
        ) : null}
      </div>
      {!hasLabels && fallback.children.length > 0 ? (
        <p class="db-empty">
          The product grid carries no colour/size columns and the parent's edit
          page could not be read, so these children have no labels.
        </p>
      ) : null}
      {fallback.children.length ? (
        <table class="db-table">
          <thead>
            <tr>
              <th>Child ID</th>
              <th>Child SKU</th>
              {hasLabels ? <th>Colour</th> : null}
              {hasLabels ? <th>Size</th> : null}
              <th>Status</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {fallback.children.map((child) => (
              <tr key={child.id}>
                <td class="db-mono">{child.id}</td>
                <td class="db-mono">{child.sku || '-'}</td>
                {hasLabels ? <td>{child.color || '-'}</td> : null}
                {hasLabels ? <td>{child.size || '-'}</td> : null}
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

export function Resolver({
  onOpen,
}: {
  /** Jump to a stage that already reads the shared workspace SKU. */
  onOpen?: (section: string) => void;
} = {}) {
  // The SKU is the subject of the whole dashboard, so it lives in the shared
  // workspace: resolve once, then Image/Text audit already have it.
  const [ws, setWs] = useWorkspace();
  const sku = ws.sku;
  const url = ws.url;
  const setSku = (value: string): void => {
    // A URL names one product. Editing the SKU away from the SKU the URL was
    // resolved for drops the URL, so the next resolve searches instead of
    // fetching someone else's page.
    if (
      ws.url &&
      ws.urlFor &&
      value.trim().toUpperCase() !== ws.urlFor.trim().toUpperCase()
    ) {
      setWs({ sku: value, url: '', urlFor: '' });
      return;
    }
    setWs({ sku: value });
  };
  const setUrl = (value: string): void => setWs({ url: value, urlFor: ws.sku.trim() });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResolveSkuResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityCheck | null>(null);
  const [supplierBusy, setSupplierBusy] = useState(false);
  const [imageDownloadBusy, setImageDownloadBusy] = useState(false);
  const [imageDownloadMessage, setImageDownloadMessage] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [findBusy, setFindBusy] = useState(false);
  const [factsBusy, setFactsBusy] = useState(false);

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

  const run = async (force = false, readFacts = false): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    // Reading facts is an enrichment of the result already on screen, so it
    // must not blank the card while the admin tab loads.
    if (readFacts) {
      setFactsBusy(true);
    } else {
      setLoading(true);
      setResult(null);
      setAvailability(null);
    }
    setError(null);
    setWarning(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'RESOLVE_SKU',
        sku: trimmed,
        url: activeUrl(ws),
        force,
        readAdminFacts: readFacts,
      })) as ResolveSkuResponse;
      if (response?.ok) {
        setResult(response);
        setAvailability(response.availability ?? null);
        setWarning(response.warning ?? null);
        // The workspace holds the subject of the whole dashboard, so the SKU a
        // resolve actually proved (not the string typed) is what the next stage
        // should read. The frontend URL is carried too: it skips catalogsearch.
        const resolved = response.resolver;
        const canonical = resolved?.sku || trimmed;
        const frontend = resolved?.frontend_url || '';
        setWs({
          sku: canonical,
          url: frontend || url,
          urlFor: frontend ? canonical : ws.urlFor,
        });
        if (response.resolutionError) {
          setWarning(
            [response.warning, `Storefront resolver failed: ${response.resolutionError}`]
              .filter(Boolean)
              .join(' '),
          );
        }
        // Checking availability is part of resolving, not a second chore: run it
        // when no verdict is stored yet. A stored one is shown as-is and the
        // Re-check button is what overrides it.
        if (!response.availability && response.resolver?.sku) {
          void checkSupplier(response.resolver.sku, false);
        }
      } else {
        setError(response?.error ?? 'Resolve failed.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setFactsBusy(false);
    }
  };

  const checkSupplier = async (
    targetSku: string,
    force: boolean,
  ): Promise<void> => {
    const target = targetSku || result?.resolver?.sku || sku.trim();
    if (!target) return;
    setSupplierBusy(true);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'CHECK_SUPPLIER',
        sku: target,
        force,
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

  /**
   * Store or forget a pasted supplier link. The worker answers with the whole
   * supplier card, so the download button, the catalogue line and the dossier
   * all follow without resolving again.
   */
  const changeSupplierLink = async (action: 'set' | 'clear'): Promise<void> => {
    const targetSku = result?.resolver?.sku ?? sku.trim();
    if (!targetSku) return;
    setLinkBusy(true);
    setLinkError(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: action === 'set' ? 'SET_SUPPLIER_URL' : 'CLEAR_SUPPLIER_URL',
        sku: targetSku,
        url: action === 'set' ? linkDraft : undefined,
      })) as { ok: boolean; supplier?: SupplierLinkInfo; error?: string };
      if (!response?.ok || !response.supplier) {
        setLinkError(response?.error ?? 'Could not store the link.');
        return;
      }
      setResult((prev) => (prev ? { ...prev, supplier: response.supplier } : prev));
      if (action === 'set') setLinkDraft('');
    } catch (err) {
      setLinkError((err as Error).message);
    } finally {
      setLinkBusy(false);
    }
  };

  /**
   * Ask the worker which Makito page carries this SKU's reference.
   *
   * Returns the stored URL so a caller can continue straight into a download;
   * the answer includes the refreshed supplier card, so the button, the
   * catalogue line and the dossier all pick the link up at once.
   */
  const findProductLink = async (targetSku: string): Promise<string | null> => {
    setFindBusy(true);
    setLinkError(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'FIND_MAKITO_URL',
        sku: targetSku,
      })) as FindMakitoUrlResponse;
      if (!response?.ok || !response.url) {
        setLinkError(response?.error ?? 'No Makito product page was found for this SKU.');
        return null;
      }
      if (response.supplier) {
        setResult((prev) => (prev ? { ...prev, supplier: response.supplier } : prev));
      }
      return response.url;
    } catch (err) {
      setLinkError((err as Error).message);
      return null;
    } finally {
      setFindBusy(false);
    }
  };

  const onFindProduct = (): void => {
    const targetSku = result?.resolver?.sku ?? sku.trim();
    if (!targetSku) return;
    void findProductLink(targetSku);
  };

  const downloadMakitoImages = async (): Promise<void> => {
    const targetSku = result?.resolver?.sku ?? sku.trim();
    const supplierInfo =
      result?.supplier ??
      supplierLinkFor(targetSku, {
        catalogUrl: result?.notion?.supplierProduct,
        supplierUrl: result?.notion?.supplierLink,
      });
    if (supplierInfo.supplier !== 'MAKITO') {
      setImageDownloadMessage('Image downloads are only available for Makito products.');
      return;
    }
    setImageDownloadBusy(true);
    setImageDownloadMessage(null);
    try {
      // The picked evidence root is the operator's image-corrections folder, so
      // the gallery belongs inside the SKU it will be used to fix. Ask for
      // permission before any network work, while the click is still a gesture -
      // a search first would spend the gesture and the prompt would be refused.
      const root = await evidenceRoot();
      const canWrite = root ? await ensureWritePermission(root).catch(() => false) : false;

      // A confirmed link saves the extra search; without one, find it first so
      // the button works from a bare SKU.
      let catalogUrl = supplierInfo.catalog;
      if (!catalogUrl || supplierInfo.catalogSource === 'guessed') {
        setImageDownloadMessage('Looking for the Makito product page…');
        catalogUrl = (await findProductLink(targetSku)) ?? '';
        if (!catalogUrl) {
          setImageDownloadMessage(
            'No Makito product page was found for this SKU, so there is no gallery to save.',
          );
          return;
        }
        setImageDownloadMessage(null);
      }

      if (root && canWrite) {
        const response = (await browser.runtime.sendMessage({
          type: 'DOWNLOAD_MAKITO_IMAGES',
          sku: targetSku,
          catalogUrl,
          mode: 'files',
        })) as DownloadMakitoImagesResponse;
        if (!response?.ok || !response.files?.length) {
          setImageDownloadMessage(response?.error ?? 'Makito image download failed.');
          return;
        }
        const parts = [supplierFor(targetSku), targetSku.toUpperCase()];
        let written = 0;
        for (const file of response.files) {
          await writeEvidenceFile(root, parts, file.name, base64Bytes(file.base64));
          written += 1;
        }
        const skipped = response.skipped ? ` (${response.skipped} thumbnail skipped)` : '';
        setImageDownloadMessage(
          `Saved ${written} of ${response.total ?? written} ${written === 1 ? 'image' : 'images'} to ${root.name}/${parts.join('/')}.${skipped}`,
        );
        return;
      }

      // No folder chosen (or no permission): Chrome can only write under
      // Downloads, so say where the files go rather than failing the click.
      const response = (await browser.runtime.sendMessage({
        type: 'DOWNLOAD_MAKITO_IMAGES',
        sku: targetSku,
        catalogUrl,
      })) as DownloadMakitoImagesResponse;
      if (!response?.ok || response.folder === undefined) {
        setImageDownloadMessage(response?.error ?? 'Makito image download failed.');
        return;
      }
      const saved = response.saved ?? response.started ?? 0;
      const total = response.total ?? saved;
      const failed = response.failures?.length ?? 0;
      // Report what reached the disk, not what was merely started: a supplier
      // that blocks download requests would otherwise look like a success.
      const detail = failed
        ? ` ${failed} failed (${response.failures?.[0]?.error ?? 'unknown error'}).`
        : '';
      setImageDownloadMessage(
        `Saved ${saved} of ${total} ${total === 1 ? 'image' : 'images'} to Downloads/${response.folder} (pick the image corrections folder in Run audit to save there instead).${detail}`,
      );
    } catch (err) {
      setImageDownloadMessage((err as Error).message);
    } finally {
      setImageDownloadBusy(false);
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
          {/* The stages read the same workspace SKU, so there is no copy-paste
              between resolving and auditing. */}
          {onOpen && result?.resolver ? (
            <>
              <button
                type="button"
                class="db-btn"
                title="Image audit for this SKU"
                onClick={() => onOpen('images')}
              >
                Open image audit
              </button>
              <button
                type="button"
                class="db-btn"
                title="Text audit for this SKU"
                onClick={() => onOpen('text')}
              >
                Open text audit
              </button>
            </>
          ) : null}
        </div>
      </section>

      {error ? (
        <div class="mhx-error" role="alert">
          {error}
        </div>
      ) : null}
      {/* A warning is not a failure: the resolve answered, this is a caveat
          about what it could not check. Red text made the two indistinguishable. */}
      {warning ? (
        <div class="db-warning" role="status">
          <span>{warning}</span>
          <button
            type="button"
            class="db-warning-x"
            aria-label="Dismiss warning"
            onClick={() => setWarning(null)}
          >
            ×
          </button>
        </div>
      ) : null}
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
          imageDownloadBusy={imageDownloadBusy}
          imageDownloadMessage={imageDownloadMessage}
          onCheckSupplier={() =>
            void checkSupplier(result?.resolver?.sku ?? sku.trim(), true)
          }
          onDownloadMakitoImages={() => void downloadMakitoImages()}
          findBusy={findBusy}
          onFindProduct={onFindProduct}
          factsBusy={factsBusy}
          onReadFacts={() => void run(true, true)}
          linkDraft={linkDraft}
          linkBusy={linkBusy}
          linkError={linkError}
          onLinkDraft={setLinkDraft}
          onSaveLink={() => void changeSupplierLink('set')}
          onClearLink={() => void changeSupplierLink('clear')}
        />
      ) : null}
      {result?.adminFallback && result.adminFallback.children.length > 0 ? (
        <AdminFallbackResult fallback={result.adminFallback} sku={sku.trim()} />
      ) : null}
      {result && !result.resolver && !result.adminFallback && result.notion ? (
        <NotionOnlyResult sku={sku.trim()} notion={result.notion} />
      ) : null}
    </>
  );
}
