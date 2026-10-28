import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { AuditImagesResponse } from '../../../core/messages';
import type { ImageAuditResult } from '../../../audit';

const ALL_LANGS = ['EN', 'ES', 'FR'];

function Summary({ audit }: { audit: ImageAuditResult }) {
  const { duplicates: dup, order, background: bg } = audit.checks;
  return (
    <ul class="db-kv">
      <li>
        <span>Duplicates</span>
        <b>
          {dup.files} files · {dup.dup_groups} cross-colour groups · {dup.same_color_groups}{' '}
          same-colour (normal)
        </b>
      </li>
      <li>
        <span>Order</span>
        <b>
          {order.children} children · langs {order.languages || '-'} · {order.violations}{' '}
          violations · {order.unclassified_files} unclassified
        </b>
      </li>
      <li>
        <span>Background (pos0)</span>
        <b>
          {bg.sampled} sampled · {bg.missing_files} missing · {bg.offwhite} off-white
        </b>
      </li>
    </ul>
  );
}

export function ImageAudit() {
  const [sku, setSku] = useState('');
  const [url, setUrl] = useState('');
  const [langs, setLangs] = useState<string[]>([...ALL_LANGS]);
  const [hashImages, setHashImages] = useState(false);
  const [background, setBackground] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditImagesResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleLang = (lang: string): void => {
    setLangs((current) =>
      current.includes(lang)
        ? current.filter((l) => l !== lang)
        : [...current, lang].sort(),
    );
  };

  const run = async (): Promise<void> => {
    const trimmed = sku.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    setCopied(false);
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'AUDIT_IMAGES',
        sku: trimmed,
        url: url.trim() || undefined,
        langs,
        hashImages,
        background,
      })) as AuditImagesResponse;
      setResult(response ?? { ok: false, error: 'No response.' });
    } catch (err) {
      setResult({ ok: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const copyBlock = async (): Promise<void> => {
    if (!result?.mdBlock) return;
    try {
      await navigator.clipboard.writeText(result.mdBlock);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const audit = result?.audit;

  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Image audit</h2>
          <span class="db-badge">mechanical checks only</span>
        </div>
        <p class="db-note">
          Reads the live storefront media endpoint (EN/ES/FR). Local evidence folders are not
          read yet. Produces candidates only — severity, model-view and instruction-image
          judgements stay with the auditor.
        </p>
        <label class="db-field">
          <span>SKU</span>
          <em>e.g. R0304, R8306, TTKP230</em>
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
        <div class="db-checks">
          {ALL_LANGS.map((lang) => (
            <label class="db-check" key={lang}>
              <input
                type="checkbox"
                checked={langs.includes(lang)}
                onChange={() => toggleLang(lang)}
              />
              <span>{lang}</span>
            </label>
          ))}
        </div>
        <label class="db-check">
          <input
            type="checkbox"
            checked={hashImages}
            onChange={(e) => setHashImages(e.currentTarget.checked)}
          />
          <span>Download + SHA-256 every image (duplicates check — slower)</span>
        </label>
        <label class="db-check">
          <input
            type="checkbox"
            checked={background}
            onChange={(e) => setBackground(e.currentTarget.checked)}
          />
          <span>Sample pos0 border tone (background check)</span>
        </label>
        <div class="db-actions">
          <button
            type="button"
            class="db-btn db-btn--primary"
            disabled={loading || !sku.trim() || langs.length === 0}
            onClick={() => void run()}
          >
            {loading ? 'Auditing…' : 'Run image audit'}
          </button>
        </div>
      </section>

      {result?.error ? <div class="mhx-error">{result.error}</div> : null}

      {audit ? (
        <>
          <section class="db-card db-wide">
            <div class="db-card-head">
              <h2>
                Checks <span class="db-mono">{audit.sku}</span>
              </h2>
              <span
                class={
                  audit.findings.length > 0 || audit.anomalies.length > 0
                    ? 'db-badge db-warn'
                    : 'db-badge db-ok'
                }
              >
                {audit.findings.length} findings
              </span>
            </div>
            <Summary audit={audit} />
            {result?.stats ? (
              <p class="db-empty">
                media files {result.stats.mediaFiles} · images downloaded{' '}
                {result.stats.imagesDownloaded} · skipped {result.stats.imagesSkipped}
              </p>
            ) : null}
          </section>

          <section class="db-card db-wide">
            <div class="db-card-head">
              <h2>Findings</h2>
              <span class="db-count">{audit.findings.length}</span>
            </div>
            {audit.findings.length === 0 ? (
              <p class="db-empty">No mechanical findings.</p>
            ) : (
              <table class="db-table">
                <thead>
                  <tr>
                    <th>Error Type</th>
                    <th>Notes</th>
                    <th>Fix at</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.findings.map((f) => (
                    <tr key={f.type}>
                      <td>{f.type}</td>
                      <td class="db-notes">{f.notes}</td>
                      <td>{f.fix_location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {result?.mdBlock ? (
            <section class="db-card db-wide">
              <div class="db-card-head">
                <h2>Dossier block</h2>
                <button type="button" class="db-btn" onClick={() => void copyBlock()}>
                  {copied ? 'Copied' : 'Copy block'}
                </button>
              </div>
              <textarea class="db-textarea" rows={6} readOnly value={result.mdBlock} />
              <p class="db-empty">
                Paste into Push errors (SKU + dossier markdown) to build Listing Errors payloads.
              </p>
            </section>
          ) : null}

          {audit.anomalies.length > 0 ? (
            <section class="db-card db-wide">
              <div class="db-card-head">
                <h2>Anomalies / review flags</h2>
                <span class="db-count">{audit.anomalies.length}</span>
              </div>
              <ul class="db-flags db-flags--warn">
                {audit.anomalies.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
