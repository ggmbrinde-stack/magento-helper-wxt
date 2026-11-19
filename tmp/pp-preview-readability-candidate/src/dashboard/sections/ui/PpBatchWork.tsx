import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { PpCatalogIndexRow } from '../../../shared/ppCatalog';
import { ppReviewLabel } from './ppPreviewModel';

/**
 * Where a queued code stands. Only the single-PP lane writes these: this screen reads them and
 * never sends a preview, apply, order or save request of its own.
 */
export type PpBatchStatus = 'waiting' | 'applied' | 'saved' | 'attention' | 'skipped';
export interface PpBatchResult { status: PpBatchStatus; note: string; at: number }

const PP_BATCH_LABEL: Record<PpBatchStatus, string> = {
  waiting: 'Waiting',
  applied: 'Applied, unsaved',
  saved: 'Saved',
  attention: 'Needs attention',
  skipped: 'Skipped',
};

/** A code the operator is finished with, either because it was saved or because they skipped it. */
const terminal = (status: PpBatchStatus | undefined): boolean => status === 'saved' || status === 'skipped';

const tone = (status: PpBatchStatus): string => status === 'saved' ? ' db-pill--ok'
  : status === 'attention' ? ' db-pill--warn' : '';

export function PpBatchWork({ rows, results, onOpen, onSkip, onBrowse }: {
  rows: PpCatalogIndexRow[];
  results: Record<string, PpBatchResult>;
  onOpen: (row: PpCatalogIndexRow) => void;
  onSkip: (row: PpCatalogIndexRow) => void;
  onBrowse: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const resultOf = (row: PpCatalogIndexRow | undefined): PpBatchResult | undefined =>
    row?.pageId ? results[row.pageId] : undefined;
  // The current code is the first one that is neither saved nor skipped, so the queue moves on by
  // itself as codes finish. Selecting a row overrides that until the operator finishes with it.
  const firstOpen = rows.findIndex(row => !terminal(resultOf(row)?.status));
  const position = picked !== null && picked < rows.length ? picked : (firstOpen === -1 ? 0 : firstOpen);
  const current = rows[position];
  const currentResult = resultOf(current);
  const step = (from: number): void => {
    for (let index = from + 1; index < rows.length; index += 1) {
      if (!terminal(resultOf(rows[index])?.status)) { setPicked(index); return; }
    }
    setPicked(from + 1 < rows.length ? from + 1 : from);
  };
  const saved = rows.filter(row => resultOf(row)?.status === 'saved').length;
  const attention = rows.filter(row => resultOf(row)?.status === 'attention').length;
  const left = rows.filter(row => !terminal(resultOf(row)?.status)).length;
  return <>
    <section class="db-card">
      <div class="db-card-head"><h2>Batch work</h2><span class="db-badge">One code at a time</span></div>
      <p class="db-note">Work through the ticked codes in order. Opening a code hands it to One PP at a time, where preview, apply, order and save stay the same single-PP steps with their own confirmations. This screen sends no Magento or Notion request and saves nothing.</p>
      <div class="db-pills">
        <span class="db-pill">{rows.length} queued</span>
        <span class="db-pill">{left} left</span>
        <span class={'db-pill' + (saved ? ' db-pill--ok' : '')}>{saved} saved</span>
        {attention ? <span class="db-pill db-pill--warn">{attention} need attention</span> : null}
      </div>
      <div class="db-actions">
        <button type="button" class="db-btn" onClick={onBrowse}>Choose codes in One PP at a time</button>
      </div>
    </section>
    <section class="db-card">
      <h2><span class="db-step">1</span>Current code</h2>
      {current ? <>
        <p><strong>{current.code ?? 'Unknown code'} · {current.name ?? 'Unknown title'}</strong></p>
        <div class="db-pills">
          <span class="db-pill">PP {current.code ?? 'unknown'}</span>
          <span class={'db-pill' + (ppReviewLabel(current.reviewStatus ?? null).label === 'Needs review' ? ' db-pill--warn' : '')}>{ppReviewLabel(current.reviewStatus ?? null).label}</span>
          <span class="db-pill">Queued {position + 1} of {rows.length}</span>
          <span class={'db-pill' + (currentResult ? tone(currentResult.status) : '')}>{PP_BATCH_LABEL[currentResult?.status ?? 'waiting']}</span>
        </div>
        <p class="db-note">{currentResult?.note ?? 'Not opened yet. The other queued codes are untouched while this one is worked on.'}</p>
        <div class="db-actions">
          <button type="button" class="db-btn db-btn--primary" onClick={() => onOpen(current)}>Open this code in Single progress</button>
          <button type="button" class="db-btn" onClick={() => { onSkip(current); step(position); }}>Skip this code</button>
          <button type="button" class="db-btn" disabled={rows.length < 2} onClick={() => step(position)}>Next code</button>
        </div>
        <p class="db-hint">Opening a code only selects it in the single-PP flow. The pairing, the connection check and every confirmation there are still yours.</p>
      </> : <p class="db-empty">No codes queued. Tick PP records in the catalogue first.</p>}
    </section>
    <section class="db-card">
      <h2>Queue</h2>
      <p class="db-note">Read-only order. Select a row to make it the current code.</p>
      <div class="db-table-wrap"><table class="db-table db-table--select">
        <thead><tr><th scope="col">Order</th><th scope="col">Code</th><th scope="col">Title</th><th scope="col">Review</th><th scope="col">Status</th></tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const result = resultOf(row);
            const status = result?.status ?? 'waiting';
            return <tr key={row.pageId ?? index} class={index === position ? 'db-row--selected' : undefined}
              onClick={() => setPicked(index)}>
              <td>{index + 1}</td>
              <td class="db-mono">{row.code ?? 'Unknown'}</td>
              <td>{row.name ?? 'Unknown'}</td>
              <td>{ppReviewLabel(row.reviewStatus ?? null).label}</td>
              <td><span class={'db-pill' + tone(status)}>{PP_BATCH_LABEL[status]}</span>
                {result?.note ? <span class="db-meta"> {result.note}</span> : null}</td>
            </tr>;
          })}
        </tbody>
      </table></div>
      {rows.length ? null : <p class="db-empty">The queue fills from the catalogue selection.</p>}
    </section>
  </>;
}
