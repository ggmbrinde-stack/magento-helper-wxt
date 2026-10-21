import { h } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { LookupSkuResponse } from '../../lib/messages';
import { CopyButton } from './CopyButton';

interface LookupPanelProps {
  sku: string;
  onSkuChange: (sku: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  notion: 'from Notion',
  storefront: 'from Storefront',
  admin: 'from Admin grid',
  resolver: 'cached',
};

const DOMAIN_TLDS = [
  { tld: 'eu', label: 'EU' },
  { tld: 'es', label: 'ES' },
  { tld: 'fr', label: 'FR' },
];

function urlKeyOf(entry: LookupSkuResponse['entry']): string {
  if (!entry?.frontend) return '';
  const match = entry.frontend.match(/\/([a-z0-9-]+)\/?$/i);
  return match?.[1] ?? '';
}

function LinkRow({ label, url }: { label: string; url: string }) {
  if (!url) return null;
  return (
    <div class="mhx-field">
      <div class="mhx-field-label">{label}</div>
      <span class="mhx-linkrow">
        <a href={url} target="_blank" rel="noreferrer noopener">
          {url}
        </a>
        <CopyButton value={url} />
      </span>
    </div>
  );
}

export function LookupPanel({ sku, onSkuChange }: LookupPanelProps) {
  const [result, setResult] = useState<LookupSkuResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const find = async (): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'LOOKUP_SKU',
        sku: trimmed,
      })) as LookupSkuResponse;
      setResult(response ?? { found: false, error: 'No response.' });
    } catch (err) {
      setResult({ found: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const entry = result?.entry;
  const urlKey = urlKeyOf(entry);

  return (
    <main class="mhx-content">
      <div class="mhx-row">
        <label class="mhx-field">
          <span>SKU</span>
          <input
            type="text"
            value={sku}
            placeholder="Paste SKU…"
            onInput={(e) => onSkuChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void find();
            }}
          />
        </label>
        <button
          type="button"
          class="mhx-primary"
          disabled={loading}
          onClick={() => void find()}
        >
          {loading ? 'Finding…' : 'Find'}
        </button>
      </div>

      {result === null ? (
        <p class="mhx-empty">Enter a SKU to find its links.</p>
      ) : !result.found ? (
        <div class="mhx-error">{result.error ?? 'SKU not found.'}</div>
      ) : entry ? (
        <section class="mhx-result">
          <h2>
            {entry.title || entry.sku}
            <span class="mhx-source">
              {SOURCE_LABELS[result.source ?? ''] ?? ''}
            </span>
          </h2>

          <LinkRow label="Frontend" url={entry.frontend} />
          <LinkRow label="Backend" url={entry.backend} />

          {urlKey ? (
            <div class="mhx-field">
              <div class="mhx-field-label">All domains</div>
              {DOMAIN_TLDS.map((d) => {
                const url = `https://bestofgifts.${d.tld}/${urlKey}`;
                return (
                  <span class="mhx-linkrow" key={d.tld}>
                    <b class="mhx-domain">{d.label}</b>
                    <a href={url} target="_blank" rel="noreferrer noopener">
                      {url}
                    </a>
                    <CopyButton value={url} />
                  </span>
                );
              })}
            </div>
          ) : null}

          {entry.category ? (
            <div class="mhx-field">
              <div class="mhx-field-label">Category</div>
              <div>
                {entry.category}
                {entry.subcategory ? ` / ${entry.subcategory}` : ''}
              </div>
            </div>
          ) : null}
          {entry.supplier ? (
            <div class="mhx-field">
              <div class="mhx-field-label">Supplier</div>
              <div>{entry.supplier}</div>
            </div>
          ) : null}
          {entry.status ? (
            <div class="mhx-field">
              <div class="mhx-field-label">Status</div>
              <span class="mhx-badge">{entry.status}</span>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
