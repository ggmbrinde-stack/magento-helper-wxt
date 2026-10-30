import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { AuditTextResponse } from '../../../core/messages';
import type { TextAuditResult } from '../../../audit';
import { StageHost } from '../../shell/StageHost';
import type { Stage } from '../../shell/stage';
import { ALL_LANGS, useWorkspace } from '../../shell/workspace';

function Summary({ audit }: { audit: TextAuditResult }) {
  const specs = audit.matrix?.specs.length ?? 0;
  return (
    <ul class="db-kv">
      <li>
        <span>Languages</span>
        <b>{audit.langs.join(' + ') || '-'}</b>
      </li>
      <li>
        <span>Spec rows</span>
        <b>{specs}</b>
      </li>
      <li>
        <span>Findings</span>
        <b>{audit.findings.length}</b>
      </li>
      <li>
        <span>Review flags</span>
        <b>{audit.review_flags.length}</b>
      </li>
    </ul>
  );
}

function Matrix({ audit }: { audit: TextAuditResult }) {
  if (!audit.matrix) return null;
  const scalars = [
    { field: 'Name', ...audit.matrix.name },
    { field: 'H1', ...audit.matrix.h1 },
    { field: 'Short description', ...audit.matrix.short_desc },
    { field: 'Long description', ...audit.matrix.long_desc },
  ];
  const rows = [...scalars, ...audit.matrix.specs];
  return (
    <section class="db-card db-wide">
      <div class="db-card-head">
        <h2>Extracted matrix</h2>
        <span class="db-badge">
          {audit.langs.join('/')} · {audit.matrix.specs.length} spec rows
        </span>
      </div>
      <table class="db-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>EN</th>
            <th>ES</th>
            <th>FR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field}>
              <td>{row.field}</td>
              <td class="db-notes">{row.en || '—'}</td>
              <td class="db-notes">{row.es || '—'}</td>
              <td class="db-notes">{row.fr || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TextResult({
  result,
  copied,
  onCopy,
}: {
  result: AuditTextResponse;
  copied: boolean;
  onCopy: () => void;
}) {
  const audit = result.audit;
  if (!audit) return null;
  const dirty =
    audit.findings.length > 0 || audit.review_flags.length > 0 || !audit.ok;
  return (
    <>
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>
            Checks <span class="db-mono">{audit.sku}</span>
          </h2>
          <span class={dirty ? 'db-badge db-warn' : 'db-badge db-ok'}>
            {audit.findings.length} findings · {audit.review_flags.length} flags
          </span>
        </div>
        <Summary audit={audit} />
        {audit.verdict === 'blocked' ? (
          <p class="db-empty">Blocked — no EN baseline was extracted.</p>
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
                <th>Field</th>
                <th>Finding</th>
                <th>Notes</th>
                <th>Priority hint</th>
              </tr>
            </thead>
            <tbody>
              {audit.findings.map((f, i) => (
                <tr key={`${f.field}|${f.finding}|${i}`}>
                  <td>{f.field}</td>
                  <td>{f.finding}</td>
                  <td class="db-notes">{f.notes}</td>
                  <td>{f.priority_hint || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {audit.review_flags.length > 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Review flags</h2>
            <span class="db-count">{audit.review_flags.length}</span>
          </div>
          <ul class="db-flags db-flags--warn">
            {audit.review_flags.map((flag, i) => (
              <li key={`${flag}|${i}`}>{flag}</li>
            ))}
          </ul>
        </section>
      ) : null}

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

      {result.anomalies && result.anomalies.length > 0 ? (
        <section class="db-card db-wide">
          <div class="db-card-head">
            <h2>Fetch anomalies</h2>
            <span class="db-count">{result.anomalies.length}</span>
          </div>
          <ul class="db-flags db-flags--warn">
            {result.anomalies.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Matrix audit={audit} />
    </>
  );
}

export function TextAudit() {
  const [ws, setWs] = useWorkspace();
  const [copied, setCopied] = useState(false);

  const toggleLang = (lang: string): void => {
    // EN is the baseline every other language is compared against, so it is not
    // a choice.
    if (lang === 'EN') return;
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

  const stage: Stage<AuditTextResponse> = {
    id: 'text',
    title: 'Text audit',
    badge: 'mechanical checks only',
    hint: 'Reads the live EN/ES/FR PDPs (title, og:description, details, spec table and JSON-LD). Produces candidates only — translation quality and the correct wording stay with the auditor.',
    blocked: !ws.sku.trim() ? 'enter a SKU to run this step' : undefined,
    errorOf: (result) =>
      result.ok ? undefined : (result.error ?? 'Text audit failed.'),
    run: async () =>
      (await browser.runtime.sendMessage({
        type: 'AUDIT_TEXT',
        sku: ws.sku.trim(),
        url: ws.url.trim() || undefined,
        langs: ws.langs,
      })) as AuditTextResponse,
    Controls: () => (
      <>
        <label class="db-field">
          <span>SKU</span>
          <em>e.g. R0304, TTKP230, TTFL9293</em>
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
            onInput={(e) => setWs({ url: e.currentTarget.value })}
          />
        </label>
        <div class="db-checks">
          {ALL_LANGS.map((lang) => (
            <label class="db-check" key={lang}>
              <input
                type="checkbox"
                checked={ws.langs.includes(lang)}
                disabled={lang === 'EN'}
                onChange={() => toggleLang(lang)}
              />
              <span>{lang === 'EN' ? 'EN (baseline)' : lang}</span>
            </label>
          ))}
        </div>
      </>
    ),
    View: ({ result }) => (
      <TextResult
        result={result}
        copied={copied}
        onCopy={() => void copyBlock(result.mdBlock)}
      />
    ),
  };

  return <StageHost stages={[stage]} />;
}
