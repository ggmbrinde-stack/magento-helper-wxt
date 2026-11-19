import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { AuditImagesResponse } from '../../../core/messages';
import type { ImageAuditResult } from '../../../audit';
import { StageHost } from '../../shell/StageHost';
import type { Stage } from '../../shell/stage';
import { ALL_LANGS, activeUrl, useWorkspace } from '../../shell/workspace';

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

function ImageResult({
  result,
  copied,
  onCopy,
}: {
  result: AuditImagesResponse;
  copied: boolean;
  onCopy: () => void;
}) {
  const audit = result.audit;
  if (!audit) return null;
  return (
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
        {result.stats ? (
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

      {result.mdBlock ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Dossier block</h2>
            <button type="button" class="db-btn" onClick={onCopy}>
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
  );
}

export function ImageAudit() {
  const [ws, setWs] = useWorkspace();
  const [copied, setCopied] = useState(false);

  const toggleLang = (lang: string): void => {
    setWs({
      langs: ws.langs.includes(lang)
        ? ws.langs.filter((l) => l !== lang)
        : [...ws.langs, lang].sort(),
    });
  };

  const copyBlock = async (block?: string): Promise<void> => {
    if (!block) return;
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const stage: Stage<AuditImagesResponse> = {
    id: 'images',
    title: 'Image audit',
    badge: 'mechanical checks only',
    hint: 'Reads the live storefront media endpoint (EN/ES/FR). Local evidence folders are not read yet. Produces candidates only — severity, model-view and instruction-image judgements stay with the auditor.',
    blocked: !ws.sku.trim()
      ? 'enter a SKU to run this step'
      : ws.langs.length === 0
        ? 'pick at least one language'
        : undefined,
    errorOf: (result) =>
      result.ok ? undefined : (result.error ?? 'Image audit failed.'),
    run: async () =>
      (await browser.runtime.sendMessage({
        type: 'AUDIT_IMAGES',
        sku: ws.sku.trim(),
        url: activeUrl(ws),
        langs: ws.langs,
        hashImages: ws.hashImages,
        background: ws.background,
      })) as AuditImagesResponse,
    Controls: () => (
      <>
        <label class="db-field">
          <span>SKU</span>
          <em>e.g. R0304, R8306, TTKP230</em>
          <input
            type="text"
            value={ws.sku}
            placeholder="Paste SKU…"
            onInput={(e) => setWs({ sku: e.currentTarget.value })}
          />
        </label>
        <label class="db-field">
          <span>Product URL (optional)</span>
          <em>Skips the catalogsearch step when the slug is known</em>
          <input
            type="text"
            value={ws.url}
            placeholder="https://bestofgifts.eu/…"
            onInput={(e) =>
              setWs({ url: e.currentTarget.value, urlFor: ws.sku.trim() })
            }
          />
        </label>
        <div class="db-checks">
          {ALL_LANGS.map((lang) => (
            <label class="db-check" key={lang}>
              <input
                type="checkbox"
                checked={ws.langs.includes(lang)}
                onChange={() => toggleLang(lang)}
              />
              <span>{lang}</span>
            </label>
          ))}
        </div>
        <label class="db-check">
          <input
            type="checkbox"
            checked={ws.hashImages}
            onChange={(e) => setWs({ hashImages: e.currentTarget.checked })}
          />
          <span>Download + SHA-256 every image (duplicates check — slower)</span>
        </label>
        <label class="db-check">
          <input
            type="checkbox"
            checked={ws.background}
            onChange={(e) => setWs({ background: e.currentTarget.checked })}
          />
          <span>Sample pos0 border tone (background check)</span>
        </label>
      </>
    ),
    View: ({ result }) => (
      <ImageResult
        result={result}
        copied={copied}
        onCopy={() => void copyBlock(result.mdBlock)}
      />
    ),
  };

  return <StageHost stages={[stage]} />;
}
