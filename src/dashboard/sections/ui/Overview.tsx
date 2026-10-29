import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import {
  DEFAULT_LISTING_ERRORS_DB,
  DEFAULT_SKU_LIBRARY_DB,
} from '../../../shared/notion/client';
import type { ResolverCacheResponse } from '../../../core/messages';
import { useSettings } from '../../shell/useSettings';

function notionUrl(id: string): string {
  return `https://www.notion.so/${id.replace(/-/g, '')}`;
}

export function Overview() {
  const { settings, loaded } = useSettings();
  const [cacheCount, setCacheCount] = useState<number | null>(null);

  // F5: the count comes from the audit lane, which owns the storage layout.
  useEffect(() => {
    void browser.runtime
      .sendMessage({ type: 'RESOLVER_CACHE', action: 'list' })
      .then((raw) => {
        const res = raw as ResolverCacheResponse;
        if (!res?.ok) return;
        const skus = new Set(
          (res.entries ?? []).map((entry) => entry.sku.trim().toUpperCase()),
        );
        setCacheCount(skus.size);
      });
  }, []);

  const skuDb = settings.skuLibraryDb || DEFAULT_SKU_LIBRARY_DB;
  const errDb = settings.listingErrorsDb || DEFAULT_LISTING_ERRORS_DB;

  return (
    <div class="db-grid">
      <section class="db-card">
        <h2>Status</h2>
        <ul class="db-kv">
          <li>
            <span>Notion token</span>
            <b class={settings.notionToken ? 'ok' : 'bad'}>
              {!loaded ? '…' : settings.notionToken ? 'Configured' : 'Missing'}
            </b>
          </li>
          <li>
            <span>Cached SKUs</span>
            <b>{cacheCount ?? '…'}</b>
          </li>
          <li>
            <span>Page writes</span>
            <b class="bad">Paused</b>
          </li>
          <li>
            <span>Notion access</span>
            <b class="ok">Create-only</b>
          </li>
        </ul>
      </section>

      <section class="db-card">
        <h2>Quick links</h2>
        <div class="db-links">
          <a href={notionUrl(skuDb)} target="_blank" rel="noreferrer noopener">
            Notion · SKU Library
          </a>
          <a href={notionUrl(errDb)} target="_blank" rel="noreferrer noopener">
            Notion · Listing Errors
          </a>
          {settings.adminBaseUrl ? (
            <a
              href={settings.adminBaseUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              Magento admin
            </a>
          ) : null}
          <a href="https://bestofgifts.eu" target="_blank" rel="noreferrer noopener">
            Storefront · EU
          </a>
          <a href="https://bestofgifts.es" target="_blank" rel="noreferrer noopener">
            Storefront · ES
          </a>
          <a href="https://bestofgifts.fr" target="_blank" rel="noreferrer noopener">
            Storefront · FR
          </a>
        </div>
      </section>
    </div>
  );
}
