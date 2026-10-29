import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ResolverCacheResponse } from '../../../core/messages';
import type { ResolverJson } from '../../../shared/resolver';

async function askCache(
  action: 'list' | 'delete' | 'clear',
  sku?: string,
): Promise<ResolverCacheResponse> {
  return (await browser.runtime.sendMessage({
    type: 'RESOLVER_CACHE',
    action,
    sku,
  })) as ResolverCacheResponse;
}

/** F2: the age is the point of the column, so keep it relative and short. */
function formatAge(days: number | undefined): string {
  if (days === undefined) return '?';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function Cache() {
  const [entries, setEntries] = useState<ResolverJson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    void askCache('list')
      .then((res) => {
        if (!res?.ok) {
          setError(res?.error ?? 'Could not read the resolver cache.');
          return;
        }
        setEntries(res.entries ?? []);
        setError(null);
        setLoaded(true);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoaded(true);
      });
  };

  useEffect(load, []);

  const remove = (sku: string): void => {
    void askCache('delete', sku).then((res) => {
      if (res?.ok) setEntries(res.entries ?? []);
      else setError(res?.error ?? 'Delete failed.');
    });
  };

  const clearAll = (): void => {
    if (entries.length === 0) return;
    if (!window.confirm('Clear all cached SKUs?')) return;
    void askCache('clear').then((res) => {
      if (res?.ok) setEntries(res.entries ?? []);
      else setError(res?.error ?? 'Clear failed.');
    });
  };

  // F5: the size is reported, because per-SKU keys make it a real number.
  const bytes = entries.reduce(
    (total, entry) => total + JSON.stringify(entry).length,
    0,
  );
  const stale = entries.filter((entry) => entry.stale).length;

  if (!loaded) return <p class="db-empty">Loading cache…</p>;

  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>
          Resolver cache <span class="db-count">{entries.length}</span>
        </h2>
        <span class="db-count">
          {formatBytes(bytes)}
          {stale > 0 ? ` · ${stale} stale` : ''}
        </span>
        <div class="db-actions">
          <button type="button" class="db-btn" onClick={load}>
            Refresh
          </button>
          <button
            type="button"
            class="db-btn db-btn--danger"
            disabled={entries.length === 0}
            onClick={clearAll}
          >
            Clear all
          </button>
        </div>
      </div>

      {error ? <div class="mhx-error">{error}</div> : null}

      {entries.length === 0 ? (
        <p class="db-empty">
          No resolver results cached yet. Run Resolve SKU to populate this cache.
        </p>
      ) : (
        <table class="db-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product ID</th>
              <th>Children</th>
              <th>Category</th>
              <th>Cached</th>
              <th>Age</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.sku}>
                <td class="db-mono">{entry.sku}</td>
                <td class="db-mono">
                  {entry.configurable_id ?? entry.simple_product_id ?? '—'}
                </td>
                <td>{entry.children.length}</td>
                <td>{entry.categories?.path.join(' › ') || '—'}</td>
                <td>{new Date(entry.generated).toLocaleString()}</td>
                <td>
                  <span class={entry.stale ? 'db-badge db-warn' : 'db-badge'}>
                    {formatAge(entry.age_days)}
                  </span>
                </td>
                <td class="db-row-actions">
                  <button
                    type="button"
                    class="db-btn db-btn--danger"
                    onClick={() => remove(entry.sku)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
