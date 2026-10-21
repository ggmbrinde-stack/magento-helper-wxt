import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { ResolverMap } from '../../lib/messages';

export function Cache() {
  const [map, setMap] = useState<ResolverMap>({});
  const [loaded, setLoaded] = useState(false);

  const load = (): void => {
    void browser.storage.local.get(['resolverMap']).then((data) => {
      setMap((data.resolverMap as ResolverMap | undefined) ?? {});
      setLoaded(true);
    });
  };

  useEffect(load, []);

  const persist = (next: ResolverMap): void => {
    setMap(next);
    void browser.storage.local.set({ resolverMap: next });
  };

  const entries = Object.values(map).sort((a, b) => b.timestamp - a.timestamp);

  const remove = (sku: string): void => {
    const next = { ...map };
    delete next[sku];
    persist(next);
  };

  const clearAll = (): void => {
    if (!entries.length) return;
    if (window.confirm('Clear all cached SKUs?')) persist({});
  };

  if (!loaded) return <p class="db-empty">Loading cache…</p>;

  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>
          Resolver cache <span class="db-count">{entries.length}</span>
        </h2>
        <div class="db-actions">
          <button type="button" class="db-btn" onClick={load}>
            Refresh
          </button>
          <button
            type="button"
            class="db-btn db-btn--danger"
            disabled={!entries.length}
            onClick={clearAll}
          >
            Clear all
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p class="db-empty">
          No cached SKUs yet. Open a product page or run a lookup to populate it.
        </p>
      ) : (
        <table class="db-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product ID</th>
              <th>Children</th>
              <th>Cached</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.sku}>
                <td class="db-mono">{entry.sku}</td>
                <td class="db-mono">{entry.id}</td>
                <td>{entry.children?.length ?? 0}</td>
                <td>{new Date(entry.timestamp).toLocaleString()}</td>
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
