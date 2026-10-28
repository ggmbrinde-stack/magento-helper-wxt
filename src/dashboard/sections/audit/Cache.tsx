import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { isResolverJson, type ResolverJson } from '../../../shared/resolver';

interface CacheMaps {
  current: Record<string, unknown>;
  legacy: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function Cache() {
  const [maps, setMaps] = useState<CacheMaps>({ current: {}, legacy: {} });
  const [loaded, setLoaded] = useState(false);

  const load = (): void => {
    void browser.storage.local
      .get(['resolverMap', 'resolverMapV2'])
      .then((data) => {
        setMaps({
          current: asRecord(data.resolverMap),
          legacy: asRecord(data.resolverMapV2),
        });
        setLoaded(true);
      });
  };

  useEffect(load, []);

  const persist = (next: CacheMaps): void => {
    setMaps(next);
    void browser.storage.local.set({
      resolverMap: next.current,
      resolverMapV2: next.legacy,
    });
  };

  const resolvers = new Map<string, ResolverJson>();
  for (const [key, value] of Object.entries(maps.legacy)) {
    if (isResolverJson(value)) resolvers.set(value.sku.trim().toUpperCase(), value);
  }
  for (const value of Object.values(maps.current)) {
    if (isResolverJson(value)) resolvers.set(value.sku.trim().toUpperCase(), value);
  }
  const entries = [...resolvers.values()].sort(
    (a, b) =>
      Date.parse(b.generated) - Date.parse(a.generated),
  );

  const remove = (sku: string): void => {
    const normalizedSku = sku.trim().toUpperCase();
    const next = { current: { ...maps.current }, legacy: { ...maps.legacy } };
    for (const [key, value] of Object.entries(next.current)) {
      if (
        isResolverJson(value) &&
        value.sku.trim().toUpperCase() === normalizedSku
      ) {
        delete next.current[key];
      }
    }
    for (const [key, value] of Object.entries(next.legacy)) {
      if (
        isResolverJson(value) &&
        value.sku.trim().toUpperCase() === normalizedSku
      ) {
        delete next.legacy[key];
      }
    }
    persist(next);
  };

  const clearAll = (): void => {
    if (!Object.keys(maps.current).length && !Object.keys(maps.legacy).length) {
      return;
    }
    if (window.confirm('Clear all cached SKUs?')) {
      persist({ current: {}, legacy: {} });
    }
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
            disabled={
              !Object.keys(maps.current).length &&
              !Object.keys(maps.legacy).length
            }
            onClick={clearAll}
          >
            Clear all
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <p class="db-empty">
          No complete resolver results cached yet. Run Resolve SKU to populate
          this cache.
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
            {entries.map((resolver) => (
              <tr key={resolver.sku}>
                <td class="db-mono">{resolver.sku}</td>
                <td class="db-mono">
                  {resolver.configurable_id ?? resolver.simple_product_id ?? '—'}
                </td>
                <td>{resolver.children.length}</td>
                <td>{new Date(resolver.generated).toLocaleString()}</td>
                <td class="db-row-actions">
                  <button
                    type="button"
                    class="db-btn db-btn--danger"
                    onClick={() => remove(resolver.sku)}
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
