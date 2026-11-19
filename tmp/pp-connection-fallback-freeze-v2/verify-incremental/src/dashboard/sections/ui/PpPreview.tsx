import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PpFreshFormResponse, PpFreshFormState, PpReferenceSource, PpConnectionResponse, PpSourceSelection } from '../../../core/messages';
import { PP_CATALOG_DATABASE, PpCatalogResponseSchema, type PpCatalogResponse, type PpCatalogIndexRow } from '../../../shared/ppCatalog';
import { isPpDraftScanResponse } from '../../../entrypoints/background/ppPreview';
import { attributeSetConsistency, catalogProblems, loadPpIndex, ppPreviewRows, type PpIndexLoad } from './ppPreviewModel';

const show = (value: unknown): string => value === undefined || value === null ? 'Unknown / not supplied' : JSON.stringify(value, null, 2);
const time = (value: string | number | undefined | null): string => value == null ? 'Unknown' : new Date(value).toLocaleString();
interface PreviewRequest { id: string; stopped: boolean; phase: 'details' | 'form'; cancelSent: boolean }

export function PpPreview() {
  const [index, setIndex] = useState<PpIndexLoad>({ rows: [], coverage: 'partial', reason: 'Catalogue not loaded.' });
  const [loading, setLoading] = useState(false), [filter, setFilter] = useState('');
  const [checked, setChecked] = useState<string[]>([]), [activeId, setActiveId] = useState('');
  const [entityId, setEntityId] = useState(''), [paired, setPaired] = useState(false);
  const [referenceSource, setReferenceSource] = useState<PpReferenceSource>('options-grid');
  const [connection, setConnection] = useState<PpConnectionResponse | null>(null);
  const [selection, setSelection] = useState<PpSourceSelection | undefined>();
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('Load Notion V2 summaries, check PPs, then choose one to preview.');
  const [helper, setHelper] = useState<PpFreshFormState>({ status: 'idle' });
  const [result, setResult] = useState<{ desired: PpCatalogResponse; current?: PpFreshFormResponse } | null>(null);
  const mounted = useRef(true), generation = useRef(0);
  const catalogueJob = useRef<{ stopped: boolean; timedOut: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const previewJob = useRef<PreviewRequest | null>(null);
  const helperGeneration = useRef(0);
  const problems = catalogProblems(index.rows);
  const chosen = index.rows.find(row => row.pageId === activeId && checked.includes(activeId));
  const chosenProblem = problems[index.rows.findIndex(row => row === chosen)];
  const visible = index.rows.map((row, position) => ({ row, position })).filter(({ row }) =>
    (row.code ?? '').toLowerCase().includes(filter.toLowerCase()) || (row.name ?? '').toLowerCase().includes(filter.toLowerCase()));

  const rememberCleanup = (response: PpFreshFormResponse): void => {
    if (!mounted.current || !response) return;
    helperGeneration.current++;
    if (response.cleanup === 'failed') setHelper({ status: 'cleanup-failed', requestId: response.cleanupRequestId ?? response.requestId, leftoverTabId: response.leftoverTabId });
    else if (response.cleanup === 'closed' || response.status === 'cancelled') setHelper(previous =>
      !previous.requestId || previous.requestId === response.requestId ? { status: 'idle' } : previous);
  };
  const stopPreview = (): void => {
    const job = previewJob.current;
    if (job) {
      job.stopped = true;
      if (job.phase === 'form' && !job.cancelSent) {
        job.cancelSent = true;
        void chrome.runtime.sendMessage({ type: 'CANCEL_PP_FRESH_FORM', requestId: job.id }).then(rememberCleanup).catch(() => {
          if (mounted.current) setNotice('Stop could not be confirmed. Wait for the helper read to finish and check its cleanup status.');
        });
      }
    }
  };
  const invalidate = (): void => {
    generation.current++; setResult(null); setPaired(false); setConnection(null); setSelection(undefined); stopPreview();
    setNotice('Selection changed. Previous preview is stale; pair and read the selected sources again.');
  };
  useEffect(() => {
    mounted.current = true;
    const version = helperGeneration.current;
    void chrome.runtime.sendMessage({ type: 'GET_PP_FRESH_FORM_STATE' }).then(state => {
      if (mounted.current && version === helperGeneration.current && state && ['idle', 'reading', 'cleanup-failed'].includes(state.status)) setHelper(state);
    }).catch(() => { if (mounted.current) setNotice('Helper status could not be checked. A new read will still enforce worker concurrency and cleanup guards.'); });
    return () => {
      mounted.current = false; generation.current++;
      if (catalogueJob.current) { catalogueJob.current.stopped = true; clearTimeout(catalogueJob.current.timer); }
      stopPreview();
    };
  }, []);
  useEffect(() => {
    const valid = new Set(index.rows.filter((row, i) => row.pageId && !problems[i]).map(row => row.pageId!));
    setChecked(previous => previous.filter(id => valid.has(id)));
    if (activeId && !valid.has(activeId)) { invalidate(); setActiveId(''); setEntityId(''); }
  }, [index.rows]);

  const load = async (): Promise<void> => {
    if (catalogueJob.current) { catalogueJob.current.stopped = true; clearTimeout(catalogueJob.current.timer); }
    const job = { stopped: false, timedOut: false }; catalogueJob.current = job;
    invalidate(); setChecked([]); setActiveId(''); setEntityId('');
    setIndex({ rows: [], coverage: 'partial', reason: 'Loading summaries. Catalogue completeness is not established.' }); setLoading(true);
    const timer = setTimeout(() => {
      job.stopped = true; job.timedOut = true;
      if (mounted.current && catalogueJob.current === job) {
        setLoading(false); setIndex(previous => ({ ...previous, coverage: 'partial', reason: 'Catalogue time limit reached. Coverage is incomplete; an in-flight request may finish.' }));
      }
    }, 60_000);
    catalogueJob.current.timer = timer;
    try {
      const response = await loadPpIndex(cursor => chrome.runtime.sendMessage({ type: 'FETCH_PP_CATALOG_INDEX_PAGE', ...(cursor ? { cursor } : {}) }),
        (rows, checkedAt) => { if (mounted.current && catalogueJob.current === job && !job.stopped) setIndex({ rows, checkedAt, coverage: 'partial', reason: 'Loading summaries. Coverage and uniqueness are incomplete.' }); },
        () => !mounted.current || catalogueJob.current !== job || job.stopped);
      if (mounted.current && catalogueJob.current === job) setIndex(job.timedOut ? { ...response, coverage: 'partial', reason: 'Catalogue time limit reached. Coverage is incomplete.' } : response);
    } finally {
      clearTimeout(timer);
      if (catalogueJob.current === job) { catalogueJob.current = null; if (mounted.current) setLoading(false); }
    }
  };
  const stopLoad = (): void => {
    if (catalogueJob.current) { catalogueJob.current.stopped = true; clearTimeout(catalogueJob.current.timer); }
    setLoading(false); setIndex(previous => ({ ...previous, coverage: 'cancelled', reason: 'Catalogue load stopped. An in-flight request may finish; no further pages will be requested.' }));
  };
  const stopOrClose = async (): Promise<void> => {
    generation.current++; setResult(null);
    if (previewJob.current) { stopPreview(); setNotice('Stopping preview; waiting for the current request and owned-tab cleanup.'); return; }
    if (helper.requestId) {
      setBusy(true);
      try {
        const response = await chrome.runtime.sendMessage({ type: 'CANCEL_PP_FRESH_FORM', requestId: helper.requestId });
        rememberCleanup(response);
        if (mounted.current) setNotice(response?.reason ?? 'Check helper cleanup status.');
        const version = helperGeneration.current;
        const state = await chrome.runtime.sendMessage({ type: 'GET_PP_FRESH_FORM_STATE' });
        if (mounted.current && version === helperGeneration.current && state && ['idle', 'reading', 'cleanup-failed'].includes(state.status)) setHelper(state);
      }
      catch { setNotice('Helper cleanup could not be confirmed. Check the helper tab manually.'); }
      finally { if (mounted.current) setBusy(false); }
    }
  };
  const checkConnection = async (): Promise<void> => {
    const version = ++generation.current;
    setChecking(true); setConnection(null); setResult(null); setPaired(false); stopPreview();
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_PP_CONNECTION', entityId, referenceSource, selection }) as PpConnectionResponse;
      if (!mounted.current || version !== generation.current) return;
      if (!response || !Array.isArray(response.tabs) || typeof response.reason !== 'string') { setNotice('Connection response was invalid. Retry explicitly.'); return; }
      setConnection(response);
      if (selection && !response.tabs.some(tab => tab.tabId === selection.tabId && tab.selectionToken === selection.selectionToken)) setSelection(undefined);
      if (response.status === 'ready' && !selection && response.tabs.length === 1 && referenceSource !== 'current-draft') setSelection(response.tabs[0]);
    } catch { if (mounted.current && version === generation.current) setNotice('Connection check failed. Retry explicitly.'); }
    finally { if (mounted.current) setChecking(false); }
  };
  const read = async (): Promise<void> => {
    if (connection?.status !== 'ready' || !selection || checking || previewJob.current || busy || !chosen || chosenProblem || !paired || !/^[1-9]\d{0,15}$/.test(entityId) || helper.status !== 'idle') return;
    const request = ++generation.current;
    const job: PreviewRequest = { id: crypto.randomUUID(), stopped: false, phase: 'details', cancelSent: false }; previewJob.current = job;
    setBusy(true); setResult(null); setNotice('Reading the selected Notion definition. No Magento tab opened yet.');
    const current = (): boolean => mounted.current && request === generation.current && !job.stopped;
    try {
      const parsed = PpCatalogResponseSchema.safeParse(await chrome.runtime.sendMessage({ type: 'FETCH_PP_PREVIEW_CATALOG', code: chosen.code }));
      if (!current()) return;
      if (!parsed.success || parsed.data.code !== chosen.code || (parsed.data.definition &&
        (parsed.data.definition.pageId !== chosen.pageId || parsed.data.definition.code !== chosen.code))) {
        setNotice('The exact detail response does not match the selected Notion record. No Magento read started.'); return;
      }
      const desired = parsed.data;
      if (!['found', 'partial'].includes(desired.status) || !desired.definition) { setResult({ desired }); setNotice(desired.reason); return; }
      job.phase = 'form'; helperGeneration.current++; setHelper({ status: 'reading', requestId: job.id });
      setNotice(referenceSource === 'current-draft' ? 'Reading CURRENT OPEN-PAGE DRAFT, including unsaved edits...' : 'Loading a fresh Magento form in a temporary helper tab...');
      const response = await chrome.runtime.sendMessage({ type: 'READ_PP_FRESH_FORM', requestId: job.id, entityId, referenceSource, selection }) as PpFreshFormResponse;
      rememberCleanup(response);
      if (!current()) return;
      if (!response || response.source !== (referenceSource === 'current-draft' ? 'current-open-page-draft' : 'fresh-magento-form-load') || response.requestId !== job.id || response.entityId !== entityId ||
        !['ok', 'partial', 'cancelled', 'busy', 'invalid', 'unavailable', 'auth', 'cleanup-failed'].includes(response.status) ||
        typeof response.reason !== 'string' || !['closed', 'failed', 'not-created'].includes(response.cleanup)) {
        setNotice('The Magento snapshot response was invalid. Check helper status before retrying.'); return;
      }
      if (response.reference && response.reference.kind !== referenceSource) { setNotice('The returned address source does not match the selected source. No snapshot accepted.'); return; }
      if ((['ok', 'partial'].includes(response.status) && (!response.snapshot || response.snapshot.status !== response.status ||
        typeof response.readAt !== 'number' || !Number.isFinite(response.readAt))) ||
        (response.snapshot && (!isPpDraftScanResponse(response.snapshot) || response.snapshot.entityId !== entityId ||
        String(response.snapshot.providerEntityId) !== entityId ||
        response.snapshot.routePath !== '/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/' + entityId))) {
        setNotice('The Magento snapshot did not match the explicit target. No snapshot accepted.'); return;
      }
      if (response.cleanup !== 'failed') setHelper({ status: 'idle' });
      setResult({ desired, current: response });
      setNotice(referenceSource === 'current-draft' ? 'Manual pairing only. CURRENT OPEN-PAGE DRAFT includes unsaved edits, not a fresh load or saved-server snapshot. Source changes require a new preview.' : 'Manual pairing only, not a verified association. Fresh Magento form load, not a certified saved-server snapshot. Source changes require a new preview.');
    } catch {
      if (current()) setNotice('The selected preview could not complete. Retry explicitly; no data was saved.');
      if (job.phase === 'form') {
        const version = ++helperGeneration.current;
        void chrome.runtime.sendMessage({ type: 'GET_PP_FRESH_FORM_STATE' }).then(state => {
          if (mounted.current && version === helperGeneration.current && state && ['idle', 'reading', 'cleanup-failed'].includes(state.status)) setHelper(state);
        }).catch(() => {});
      }
    }
    finally {
      if (previewJob.current === job) {
        previewJob.current = null;
        if (mounted.current) {
          setBusy(false);
          if (job.stopped) setNotice('Preview stopped or invalidated. Check helper cleanup status before retrying.');
        }
      }
    }
  };
  const setRow = (row: PpCatalogIndexRow, value: boolean): void => {
    if (!row.pageId) return;
    setChecked(previous => value ? [...new Set([...previous, row.pageId!])] : previous.filter(id => id !== row.pageId));
    if (!value && activeId === row.pageId) { invalidate(); setActiveId(''); setEntityId(''); }
  };
  const desired = result?.desired, form = result?.current;
  const draft = form && ['ok', 'partial'].includes(form.status) ? form.snapshot : undefined;
  const rows = desired && draft ? ppPreviewRows(desired, draft) : [];
  return <div class="db-stack">
    <section class="db-card"><h2>PP Preview <span class="db-badge">Read-only</span></h2>
      <p class="db-note">Choose Notion V2 records. Preview one selected PP at a time. Keep one Options Grid open with the exact target entity in its loaded results, or explicitly choose an exact-record edit tab as the address source. To read unsaved edits, explicitly choose CURRENT DRAFT and select the exact edit tab. No Magento data is changed.</p>
      <div class="db-actions"><button type="button" class="db-btn" disabled={loading} onClick={() => void load()}>Load PP catalogue</button>
        <button type="button" class="db-btn" disabled={!loading} onClick={stopLoad}>Stop catalogue load</button></div>
      <p role="status" aria-live="polite">Catalogue: {index.coverage}. {index.reason} Rows: {index.rows.length}. Read: {time(index.checkedAt)}</p>
      <label class="db-field"><span>Search loaded codes or titles</span><input value={filter} onInput={event => setFilter(event.currentTarget.value)} /></label>
      <p>{checked.length} selected · {visible.length} visible. Search filters the list, not the exact code used for lookup.</p>
      <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">Select</th><th scope="col">Exact code</th><th scope="col">Notion title</th><th scope="col">Review</th><th scope="col">Identity status</th></tr></thead><tbody>
        {visible.map(({ row, position }) => <tr key={row.pageId ?? 'invalid-' + position}><td><input type="checkbox" aria-label={'Select PP ' + (row.code ?? 'missing code')} disabled={!!problems[position]} checked={!!row.pageId && checked.includes(row.pageId)} onChange={event => setRow(row, event.currentTarget.checked)} /></td>
          <td><pre class="db-pp-data">{row.code === null ? 'Unknown' : row.code}</pre></td><td>{row.name ?? 'Unknown'}</td><td>{row.reviewStatus ?? 'Unknown'}</td><td>{problems[position] ?? (index.coverage === 'complete' ? 'Unique exact code in loaded catalogue' : 'Uniqueness not established until coverage completes; detail lookup rechecks it')}</td></tr>)}
      </tbody></table></div>
    </section>
    <section class="db-card"><h2>Preview one selected PP</h2>
      <label class="db-field"><span>Magento address source</span><select value={referenceSource} onChange={event => { invalidate(); setReferenceSource(event.currentTarget.value as PpReferenceSource); }}>
        <option value="options-grid">Options Grid: loaded results only</option><option value="exact-record">Exact-record edit tab: address for fresh helper</option><option value="current-draft">Read CURRENT DRAFT: selected open edit tab</option>
      </select></label>
      <p class="db-note">{referenceSource === 'options-grid'
        ? 'Only already-loaded Grid rows are read. Load the exact entity with native filters/paging yourself. The helper does not change the Grid or fetch more pages. Grid freshness and in-flight state are not verified.'
        : referenceSource === 'current-draft' ? 'Select the already-open exact PP edit tab below, then check the connection. This reads current provider state, including unsaved edits. The tab is never navigated, reloaded or closed.' : 'Keep one edit tab open for the exact Magento entity. Only its native address is copied privately into a fresh helper; the user draft is not read, navigated or reloaded. A general admin tab is not sufficient.'}</p>
      <label class="db-field"><span>Selected Notion record</span><select value={activeId} onChange={event => { invalidate(); setActiveId(event.currentTarget.value); setEntityId(''); }}><option value="">Choose a checked PP explicitly</option>
        {index.rows.filter(row => row.pageId && checked.includes(row.pageId)).map(row => <option key={row.pageId!} value={row.pageId!}>{row.code} · {row.name}</option>)}
      </select></label>
      <label class="db-field"><span>Exact Magento custom-option entity ID</span><input inputMode="numeric" value={entityId} maxLength={16} onInput={event => { invalidate(); setEntityId(event.currentTarget.value); }} />
        <em>Enter the actual record ID separately. It is not the business code or Attribute Set ID. The selected source must match that exact entity and configured allowed HTTPS admin base. Do not paste a URL or session key.</em></label>
      <div class="db-actions"><button type="button" class="db-btn" disabled={busy || checking || !/^[1-9]\d{0,15}$/.test(entityId)} onClick={() => void checkConnection()}>{checking ? 'Checking connection…' : 'Check Magento connection'}</button></div>
      {connection ? <>
        <p role="status" aria-live="polite">Connection: {connection.status}. {connection.reason}</p>
        <label class="db-field"><span>Detected source tab</span><select value={selection?.tabId ?? ''} disabled={busy || checking} onChange={event => {
          generation.current++; setResult(null); setPaired(false); stopPreview();
          setSelection(connection.tabs.find(tab => String(tab.tabId) === event.currentTarget.value));
          setConnection({ ...connection, status: 'changed', reason: 'Tab choice changed. Check the connection again, then confirm the pairing.' });
        }}><option value="">Choose a detected tab explicitly</option>{connection.tabs.map(tab => <option key={tab.tabId} value={tab.tabId}>Tab {tab.tabId} · {tab.host} · {tab.kind}{tab.loading ? ' · loading' : ''}</option>)}</select></label>
      </> : null}
      <label><input type="checkbox" checked={paired} disabled={!chosen || !!chosenProblem || !/^[1-9]\d{0,15}$/.test(entityId)} onChange={event => { generation.current++; setResult(null); stopPreview(); setPaired(event.currentTarget.checked); }} /> I manually pair this Notion record with this Magento entity for this preview. The association is not verified.</label>
      <div class="db-actions"><button type="button" class="db-btn db-btn--primary" disabled={checking || connection?.status !== 'ready' || !selection || busy || helper.status !== 'idle' || !chosen || !!chosenProblem || !paired} aria-busy={busy} onClick={() => void read()}>{busy ? 'Reading selected PP…' : 'Preview selected PP'}</button>
        <button type="button" class="db-btn" disabled={!busy && helper.status === 'idle'} onClick={() => void stopOrClose()}>Stop preview / close helper tab</button></div>
      {helper.status === 'cleanup-failed' ? <p role="alert">Helper tab {helper.leftoverTabId} could not be closed. Further previews are blocked. Retry closing it or close that helper tab manually.</p> : null}
      <p role="status" aria-live="polite">{notice}</p>
    </section>
    {result ? <div class="db-grid">
      <section class="db-card"><h2>Current: {!form ? 'MAGENTO NOT READ' : form.source === 'current-open-page-draft' ? 'CURRENT OPEN-PAGE DRAFT (includes unsaved edits)' : 'FRESH MAGENTO FORM LOAD'}</h2>
        <p>Status: {form?.status ?? 'not read'}. Helper cleanup: {form?.cleanup ?? 'not created'}</p><p>{form?.reason ?? 'No Magento read was started.'}</p>
        {form?.reference ? <p class="db-note">Address source: {form.reference.kind}.
          {form.reference.grid ? <> Loaded Grid: {form.reference.grid.status}; rows {form.reference.grid.loadedRows ?? 'unknown'} of {form.reference.grid.totalRows ?? 'unknown'};
            page {form.reference.grid.page ?? 'unknown'}, page size {form.reference.grid.pageSize ?? 'unknown'}.
            Loaded data only, freshness unverified; filters/paging may hide other records.</> : null}</p> : null}
        {form?.readiness ? <div class="db-note">
          <p>Readiness checks: {form.readiness.checks}. Full reads: {form.readiness.extractions}. Elapsed: {(form.readiness.elapsedMs / 1000).toFixed(1)}s.</p>
          <p>Last checkpoint: {form.readiness.last?.stage ?? 'none'}. Document: {form.readiness.last?.document ?? 'unknown'}.
            Registry: {form.readiness.last?.registry ?? 'unknown'}. Provider: {form.readiness.last?.provider ?? 'unknown'}.
            Data: {form.readiness.last?.data ?? 'unknown'}. Identity: {form.readiness.last?.identity ?? 'unknown'}.</p>
          <p>Last scan: {form.readiness.lastScanStatus ?? 'not attempted'}. Warning codes: {form.readiness.warningCodes.join(', ') || 'none'}.
            {form.readiness.last?.blockedAccessor ? ' An accessor was blocked.' : ''}</p>
        </div> : null}
        <p class="db-note">{form?.source === 'current-open-page-draft' ? 'Current open-page draft, including unsaved edits. Freshness and saved state are not certified.' : 'Not an existing user draft and not a certified saved-server snapshot. Authentication, route support and initial provider state still need human live validation.'}</p>
        {draft ? <><p>Host: {form?.host}. Entity ID: {draft.entityId}. Read: {time(form?.readAt)}</p>
          <p>Provider entity: {show(draft.providerEntityId)}. Provider Attribute Set: {show(draft.providerAttributeSetId)}. General Attribute Set IDs: {show(draft.generalAttributeSetId)}</p>
          <p>Native Attribute Set consistency: {attributeSetConsistency(draft)}. This does not verify a Notion association.</p>
          {draft.warnings.map((warning, i) => <p class="db-note" key={i}>{warning}</p>)}
          <details><summary>{form?.source === 'current-open-page-draft' ? 'Current draft reference' : 'Fresh form reference'}</summary><pre class="db-pp-data">{show(draft)}</pre></details></> : <p>No usable Magento snapshot. Comparison blocked.</p>}
      </section>
      <section class="db-card"><h2>Desired: Notion PP Catalog V2</h2><p>Business code: {desired?.code}. Status: {desired?.status}</p><p>{desired?.reason}</p>
        <p>Read: {time(desired?.checkedAt)}. Edited: {time(desired?.definition?.lastEditedAt)}</p><p class="db-note">Source database: {PP_CATALOG_DATABASE}</p>
        {desired?.definition ? <><p>Notion page ID: {desired.definition.pageId}. Review: {desired.definition.reviewStatus ?? 'Unknown'}</p>
          <p class="db-note">A rever, partial and unknown data require manual review.</p>
          {desired.definition.warnings.map((warning, i) => <p class="db-note" key={i}>{warning}</p>)}
          <details><summary>Desired definition and body reference</summary><pre class="db-pp-data">{show(desired.definition)}</pre></details></> : <p>No unique desired definition. Comparison blocked.</p>}
      </section>
    </div> : null}
    {rows.length ? <section class="db-card"><h2>Side-by-side reference</h2><p class="db-note">No verified native-field mapping. These are blocked reference rows, not executable changes. Blank desired fields never request deletion.</p>
      <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">Field</th><th scope="col">{form?.source === 'current-open-page-draft' ? 'Current draft (unsaved edits included)' : 'Fresh form'}</th><th scope="col">Desired reference</th><th scope="col">Comparison</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.field}><th scope="row">{row.field}</th><td><pre class="db-pp-data">{show(row.current)}</pre></td><td><pre class="db-pp-data">{show(row.desired)}</pre></td><td>Blocked: {row.reason}</td></tr>)}
      </tbody></table></div></section> : null}
  </div>;
}
