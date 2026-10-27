import { h } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { FetchSkuDataResponse } from '../../lib/messages';
import type { ListingError } from '../../lib/schemas';
import {
  OPEN_STORE_VIEWS,
  STORE_VIEW_IDS,
  withStoreView,
} from '../../lib/store';
import { CopyButton } from './CopyButton';

interface DataPanelProps {
  result: FetchSkuDataResponse | null;
  error: string;
}

const PRIORITY_ORDER: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

function groupErrors(errors: ListingError[]): [string, ListingError[]][] {
  const groups = new Map<string, ListingError[]>();
  for (const err of errors) {
    const name = err.errorGroup[0] ?? 'Ungrouped';
    const list = groups.get(name);
    if (list) list.push(err);
    else groups.set(name, [err]);
  }
  return [...groups.entries()];
}

function ErrorCard({ err }: { err: ListingError }) {
  const meta = [err.priority, err.language, err.field, err.fixLocation]
    .filter(Boolean)
    .join(' · ');
  return (
    <li class={`mhx-error-row prio-${err.priority.toLowerCase()}`}>
      <div class="mhx-error-head">
        <span class="mhx-error-title">{err.title}</span>
        <CopyButton value={err.sku} label="SKU" />
      </div>
      {meta ? <span class="mhx-error-meta">{meta}</span> : null}
      {err.errorType.length > 0 ? (
        <span class="mhx-error-meta">{err.errorType.join(', ')}</span>
      ) : null}
      {err.notes ? <span class="mhx-error-notes">{err.notes}</span> : null}
      {err.supplier || err.brand || err.csvRow ? (
        <span class="mhx-error-meta">
          {[
            err.supplier && `Supplier: ${err.supplier}`,
            err.brand && `Brand: ${err.brand}`,
            err.csvRow && `CSV: ${err.csvRow}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      ) : null}
      {err.link ? (
        <a href={err.link} target="_blank" rel="noreferrer noopener">
          Open link
        </a>
      ) : null}
    </li>
  );
}

function MarkFieldsButton({
  sku,
  count,
}: {
  sku: string;
  count: number;
}) {
  const [state, setState] = useState<
    'idle' | 'busy' | 'done' | 'partial' | 'error'
  >('idle');
  if (!sku || count === 0) return null;
  const run = (): void => {
    setState('busy');
    void browser.runtime
      .sendMessage({ type: 'FETCH_ERROR_MARKUP', sku })
      .then((resp) => {
        const result = resp as
          | { error?: string; truncated?: boolean }
          | undefined;
        setState(result?.error ? 'error' : result?.truncated ? 'partial' : 'done');
      })
      .catch(() => setState('error'))
      .finally(() => setTimeout(() => setState('idle'), 1600));
  };
  return (
    <button
      type="button"
      class="mhx-copy"
      disabled={state === 'busy'}
      title="Draw priority markers next to the matching fields on the open product page"
      onClick={run}
    >
      {state === 'busy'
        ? 'Marking…'
        : state === 'done'
          ? 'Marked'
          : state === 'partial'
            ? 'Marked (partial)'
            : state === 'error'
              ? 'Failed'
              : 'Mark fields'}
    </button>
  );
}

function StoreViewButtons({
  backend,
  sku,
}: {
  backend: string;
  sku: string;
}) {
  const [busy, setBusy] = useState(false);
  if (!backend) return null;

  const openAll = (): void => {
    setBusy(true);
    const urls = [
      withStoreView(backend, null),
      ...OPEN_STORE_VIEWS.map((v) => withStoreView(backend, STORE_VIEW_IDS[v] ?? null)),
    ].filter(Boolean);
    void browser.runtime
      .sendMessage({
        type: 'OPEN_TAB_GROUP',
        urls,
        groupName: `${sku} store views`,
      })
      .finally(() => setBusy(false));
  };

  return (
    <div class="mhx-storeviews">
      <button
        type="button"
        class="mhx-storeview"
        onClick={() => window.open(withStoreView(backend, null), '_blank')}
      >
        All
      </button>
      {OPEN_STORE_VIEWS.map((v) => (
        <button
          type="button"
          key={v}
          class="mhx-storeview"
          onClick={() =>
            window.open(withStoreView(backend, STORE_VIEW_IDS[v] ?? null), '_blank')
          }
        >
          {v}
        </button>
      ))}
      <button
        type="button"
        class="mhx-storeview mhx-storeview--all"
        disabled={busy}
        onClick={openAll}
      >
        {busy ? 'Opening…' : 'Open all'}
      </button>
    </div>
  );
}

export function DataPanel({
  result,
  error,
}: DataPanelProps) {
  if (error) {
    return <div class="mhx-error">{error}</div>;
  }
  if (!result) {
    return <p class="mhx-empty">Enter a SKU and press Fetch.</p>;
  }

  const lib = result.skuLibrary;
  const grouped = groupErrors(result.errors);
  const markupSku = lib?.sku || result.errors[0]?.sku || '';

  return (
    <section class="mhx-result">
      <h2>SKU Library</h2>
      {lib ? (
        <dl class="mhx-kv">
          <dt>SKU</dt>
          <dd>
            {lib.sku} <CopyButton value={lib.sku} />
          </dd>
          <dt>Category</dt>
          <dd>
            {lib.category}
            {lib.subcategory ? ` / ${lib.subcategory}` : ''}
          </dd>
          <dt>Supplier</dt>
          <dd>{lib.supplier}</dd>
          <dt>Status</dt>
          <dd>{lib.status}</dd>
          <dt>Colors</dt>
          <dd>
            {lib.colors} {lib.colors ? <CopyButton value={lib.colors} /> : null}
          </dd>
          <dt>Sizes</dt>
          <dd>
            {lib.sizes} {lib.sizes ? <CopyButton value={lib.sizes} /> : null}
          </dd>
          <dt>Backend</dt>
          <dd>
            {lib.backend ? (
              <span class="mhx-linkrow">
                <a href={lib.backend} target="_blank" rel="noreferrer noopener">
                  Open
                </a>
                <CopyButton value={lib.backend} />
              </span>
            ) : (
              '—'
            )}
          </dd>
          <dt>Frontend</dt>
          <dd>
            {lib.frontend ? (
              <span class="mhx-linkrow">
                <a href={lib.frontend} target="_blank" rel="noreferrer noopener">
                  Open
                </a>
                <CopyButton value={lib.frontend} />
              </span>
            ) : (
              '—'
            )}
          </dd>
          <dt>Store views</dt>
          <dd>
            <StoreViewButtons backend={lib.backend} sku={lib.sku} />
          </dd>
        </dl>
      ) : (
        <p class="mhx-empty">No SKU Library row for this SKU.</p>
      )}

      <h2 class="mhx-errors-head">
        Listing Errors <span class="mhx-count">{result.errors.length}</span>
        <MarkFieldsButton sku={markupSku} count={result.errors.length} />
      </h2>
      {result.truncated ? (
        <p class="mhx-warning">
          Showing the first 1,000 open errors. More rows exist in Notion.
        </p>
      ) : null}
      {result.errors.length === 0 ? (
        <p class="mhx-empty">No open errors.</p>
      ) : (
        <div class="mhx-error-groups">
          {grouped.map(([name, list]) => (
            <div class="mhx-error-group" key={name}>
              <h3 class="mhx-group-title">
                {name} <span class="mhx-count">{list.length}</span>
              </h3>
              <ul class="mhx-errors">
                {list
                  .slice()
                  .sort(
                    (a, b) =>
                      (PRIORITY_ORDER[a.priority] ?? 3) -
                      (PRIORITY_ORDER[b.priority] ?? 3),
                  )
                  .map((e, i) => (
                    <ErrorCard key={e.id || `${e.title}-${i}`} err={e} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {result.skippedRows > 0 ? (
        <p class="mhx-note">
          {result.skippedRows} row(s) skipped: failed schema validation.
        </p>
      ) : null}
    </section>
  );
}
