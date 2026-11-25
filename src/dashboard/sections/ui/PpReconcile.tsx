import { h } from 'preact';
import type { PpCatalogIndexRow } from '../../../shared/ppCatalog';
import type { PpIndexLoad } from './ppPreviewModel';
import { PP_DUPLICATE_CONTRACT, PP_INVENTORY_UNAVAILABLE, ppDuplicateGate, ppReconcile, ppSelection } from './ppReconcileModel';

/**
 * Read-only reconciliation of the loaded Notion catalogue against a Magento business-code
 * inventory. It classifies codes and states plainly that the duplicate write path is blocked,
 * because the native Duplicate contract is not proven.
 */
export function PpReconcile(props: { rows: PpCatalogIndexRow[]; coverage: PpIndexLoad['coverage']; checked: string[] }) {
  const report = ppReconcile({ notionCoverage: props.coverage, notionRows: props.rows, inventory: PP_INVENTORY_UNAVAILABLE });
  const selection = ppSelection(report, props.checked);
  const gate = ppDuplicateGate(report, selection);
  const tone = (ok: boolean): string => ok ? 'ok' : 'warn';
  const steps = [
    { text: 'Reconcile sources', state: props.coverage === 'complete' && report.coverage === 'complete'
      ? 'Both inventories complete.' : 'A source is incomplete, so no code is called absent.' },
    { text: 'Select code(s)', state: props.checked.length
      ? props.checked.length + ' selected. One code and a batch use the same per-code operation.'
      : 'None selected. Loading the catalogue selects nothing.' },
    { text: 'Verify match', state: report.counts.matched + ' matched' + (report.entityCollisions.length ? ', ' + report.entityCollisions.length + ' entity collision(s)' : '') + (selection.skipped.length ? ', ' + selection.skipped.length + ' selected will be skipped' : '') + (selection.blocked.length ? ', ' + selection.blocked.length + ' selected need review' : '') + '.' },
  ];
  return <section class="db-card">
    <div class="db-card-head"><h2>Reconcile sources</h2><span class="db-badge">Read-only</span></div>
    <p class="db-note">One exact business code will be duplicated once, only after the native Duplicate contract is proven and both inventories are complete with one record per code on each side. The original is preserved, its faces are kept, and only the duplicate's printing options are reduced to the Notion list. A Notion-only code is skipped and never created; a Magento-only code is left untouched. That write path does not exist yet: this card is read-only and never writes to Magento.</p>
    <div class="db-pills">
      <span class={'db-pill db-pill--' + tone(props.coverage === 'complete')}>Notion {props.coverage}</span>
      <span class={'db-pill db-pill--' + tone(report.coverage === 'complete')}>Magento inventory {report.coverage}</span>
      <span class="db-pill">{report.counts.matched} matched</span>
      <span class="db-pill">{report.counts.skipped} skipped, no Magento record</span>
      <span class="db-pill">{report.counts.untouched} Magento only, untouched</span>
      <span class={'db-pill' + (report.counts.review ? ' db-pill--warn' : '')}>{report.counts.review} need review</span>
      {report.entityCollisions.length ? <span class="db-pill db-pill--warn">{report.entityCollisions.length} two codes on one entity</span> : null}
    </div>
    <p class="db-note">{report.coverageReason}</p>
    <p class="db-note">Codes are compared exactly as each source writes them. Notion stores <span class="db-mono">661</span>; a Magento Attribute Set label pads the code to four digits, as in <span class="db-mono">AS&gt;PP0049</span> for 49. No observation proves the two widths are one profile, so a differing format stays Needs review instead of matching.</p>
    {report.entityCollisions.length ? <details class="db-disclosure" open><summary>Two codes on one Magento entity ({report.entityCollisions.length})</summary>
      <ul class="db-pp-list">{report.entityCollisions.map(collision => <li key={collision.entityId}>Entity <span class="db-mono">{collision.entityId}</span> is claimed by codes <span class="db-mono">{collision.codes.join(' and ')}</span>. Both stay Needs review; the report does not choose between them.</li>)}</ul>
    </details> : null}
    {props.rows.length === 0 ? <p class="db-empty">No Notion rows loaded. Load the catalogue in step 1.</p> : null}
    <ol class="db-pp-list">
      {steps.map(step => <li key={step.text}>{step.text}: {step.state}</li>)}
      <li>Duplicate once: <span class="db-pill db-pill--warn">Blocked</span> {PP_DUPLICATE_CONTRACT.status === 'unproven' ? 'the native Magento Duplicate contract is unverified.' : ''}</li>
      <li>Review reduced options by face: <span class="db-pill db-pill--warn">Unavailable until a duplicate exists</span></li>
      <li>Save and verify: <span class="db-pill db-pill--warn">Unavailable until a duplicate exists</span></li>
    </ol>
    <p class="db-warn"><strong>Write flow blocked.</strong> {gate.reason}</p>
    {selection.rows.length ? <div class="db-table-wrap"><table class="db-table db-table--reconcile"><thead><tr><th scope="col">Selected code</th><th scope="col">Notion title</th><th scope="col">Verdict</th><th scope="col">Magento original</th><th scope="col">Reason</th></tr></thead><tbody>
      {selection.rows.map(row => <tr key={row.pageId ?? row.code}>
        <td class="db-mono">{row.code || 'Unknown'}</td><td>{row.name ?? 'Unknown'}</td>
        <td>{row.verdict === 'matched' ? <span class="db-pill db-pill--ok">Matched</span>
          : row.verdict === 'skipped' ? <span class="db-pill db-pill--warn">Skipped</span>
            : <span class="db-pill db-pill--warn">Needs review</span>}</td>
        <td>{row.entityId || '(none)'}</td><td>{row.reason}</td>
      </tr>)}
    </tbody></table></div> : null}
    {report.magentoOnly.length ? <details class="db-disclosure"><summary>Magento only, left untouched ({report.magentoOnly.length})</summary>
      <ul class="db-pp-list">{report.magentoOnly.map(row => <li key={row.entityId}>Entity {row.entityId} · code {row.code}</li>)}</ul>
    </details> : null}
  </section>;
}
