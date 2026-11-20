import { h, Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PpFreshFormResponse, PpFreshFormState, PpReferenceSource, PpConnectionResponse, PpSourceSelection, ApplyPpPlanResponse, SavePpFormResponse } from '../../../core/messages';
import { PP_CATALOG_DATABASE, PpCatalogResponseSchema, type PpCatalogResponse, type PpCatalogIndexRow } from '../../../shared/ppCatalog';
import { isPpDraftScanResponse } from '../../../entrypoints/background/ppPreview';
import type { PpOrderDiagnostics } from '../../../page/features/pp-scan/apply';
import { attributeSetConsistency, catalogProblems, loadPpIndex, ppApplyPlannedOrder, ppCell, ppDropRemovedRows, ppExtraCopies, ppFaceRows, ppMergeReadBack, ppLanguage, ppNotionLists, ppOptionRows, ppOrderCheck, ppPartialMatches, ppPreviewRows, ppSearchMode, ppSearchRows, PP_SEARCH_CAP, ppRemovedVerification, ppReviewLabel, ppSaveRows, ppSavedVerification, ppSnapshotSummary, ppUpdatePlan, PP_STORE_LANGUAGES, type PpIndexLoad } from './ppPreviewModel';
import { PpBatchWork, type PpBatchResult, type PpBatchStatus } from './PpBatchWork';
import { PpReconcile } from './PpReconcile';
import { ppPlanFaces } from './ppReconcileModel';

const show = (value: unknown): string => value === undefined || value === null ? 'Unknown / not supplied' : JSON.stringify(value, null, 2);
const time = (value: string | number | undefined | null): string => value == null ? 'Unknown' : new Date(value).toLocaleString();
interface PreviewRequest { id: string; stopped: boolean; phase: 'details' | 'form'; cancelSent: boolean }

export function PpPreview() {
  const [index, setIndex] = useState<PpIndexLoad>({ rows: [], coverage: 'partial', reason: 'Catalogue not loaded.' });
  const [loading, setLoading] = useState(false), [filter, setFilter] = useState('');
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [checked, setChecked] = useState<string[]>([]), [activeId, setActiveId] = useState('');
  const [entityId, setEntityId] = useState(''), [paired, setPaired] = useState(false);
  const [referenceSource, setReferenceSource] = useState<PpReferenceSource>('options-grid');
  const [connection, setConnection] = useState<PpConnectionResponse | null>(null);
  const [selection, setSelection] = useState<PpSourceSelection | undefined>();
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('Load Notion V2 summaries, check PPs, then choose one to preview.');
  const [helper, setHelper] = useState<PpFreshFormState>({ status: 'idle' });
  const [result, setResult] = useState<{ desired: PpCatalogResponse; current?: PpFreshFormResponse } | null>(null);
  const [applyState, setApplyState] = useState<{ phase: 'idle' | 'confirming' | 'applying' | 'done'; kind?: 'add' | 'remove' | 'order' | 'rebuild'; response?: ApplyPpPlanResponse; error?: string }>({ phase: 'idle' });
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [removed, setRemoved] = useState<Array<{ magentoFace: string; technique: string; catalogueId: string }>>([]);
  // Per-code outcome of the batch queue. Only this single-PP lane writes it, so the queue shows
  // real progress while the batch screen itself still sends nothing to Magento or Notion.
  const [batchResults, setBatchResults] = useState<Record<string, PpBatchResult>>({});
  // Set when the preview is showing the saved record's read-back instead of a fresh form load.
  const [readBackAt, setReadBackAt] = useState<number | null>(null);
  const [readBackSource, setReadBackSource] = useState<'form' | 'stored' | null>(null);
  // The rows the last change handled. The plan is re-based on the read-back, so saving has to keep
  // its own record of what was applied.
  const [appliedRows, setAppliedRows] = useState<Array<{ face: string; magentoFace: string; technique: string; catalogueId: string }>>([]);
  const [saveState, setSaveState] = useState<{ phase: 'idle' | 'confirming' | 'saving' | 'done'; response?: SavePpFormResponse; error?: string }>({ phase: 'idle' });
  const [sortCopy, setSortCopy] = useState('');
  const mounted = useRef(true), generation = useRef(0);
  const catalogueJob = useRef<{ stopped: boolean; timedOut: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const previewJob = useRef<PreviewRequest | null>(null);
  const helperGeneration = useRef(0);
  const problems = catalogProblems(index.rows);
  const chosen = index.rows.find(row => row.pageId === activeId && checked.includes(activeId));
  const chosenProblem = problems[index.rows.findIndex(row => row === chosen)];
  const search = ppSearchRows(index.rows, filter, PP_SEARCH_CAP), visible = search.shown;
  const searchMode = ppSearchMode(filter);
  const partialHidden = ppPartialMatches(index.rows, filter);
  const searchHint = searchMode === 'all'
    ? 'Search filters the list, not the exact code used for lookup.'
    : searchMode === 'exact-code'
      ? `Digits match the exact business code only.${partialHidden ? ` ${partialHidden} partial code match(es) hidden; type part of the title to search text.` : ''}`
      : 'Text search matches codes and titles. The exact code used for lookup is always the selected row.';

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
    generation.current++; setResult(null); setApplyState({ phase: 'idle' }); setSaveState({ phase: 'idle' }); setPaired(false); setConnection(null); setSelection(undefined);
    // Removal ticks and the removal record belong to the previous preview, so they are dropped
    // with it instead of being checked against a different record's read-back.
    setRemoveIds([]); setRemoved([]); setReadBackAt(null); setAppliedRows([]); stopPreview();
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
    setBusy(true); setResult(null); setApplyState({ phase: 'idle' }); setReadBackAt(null);
    // A fresh read replaces the rows these ticks referred to, so stale ticks cannot be sent
    // against a different set of rows.
    setRemoveIds([]); setRemoved([]); setAppliedRows([]);
    setNotice('Reading the Notion definition and loading the Magento form at the same time. Nothing is saved.');
    const current = (): boolean => mounted.current && request === generation.current && !job.stopped;
    job.phase = 'form'; helperGeneration.current++; setHelper({ status: 'reading', requestId: job.id });
    // The two reads are independent, so the Magento form loads while Notion is still being read
    // instead of waiting for it. A rejected or abandoned read cancels the helper job.
    const formRequest = chrome.runtime.sendMessage({ type: 'READ_PP_FRESH_FORM', requestId: job.id, entityId, referenceSource, selection })
      .then((value: unknown) => value, () => null);
    const abandoned = async (message: string): Promise<void> => {
      job.cancelSent = true;
      setNotice(message);
      await chrome.runtime.sendMessage({ type: 'CANCEL_PP_FRESH_FORM', requestId: job.id }).catch(() => null);
      await formRequest;
      if (mounted.current && request === generation.current) setHelper({ status: 'idle' });
    };
    try {
      const parsed = PpCatalogResponseSchema.safeParse(await chrome.runtime.sendMessage({ type: 'FETCH_PP_PREVIEW_CATALOG', code: chosen.code }));
      if (!current()) return;
      if (!parsed.success || parsed.data.code !== chosen.code || (parsed.data.definition &&
        (parsed.data.definition.pageId !== chosen.pageId || parsed.data.definition.code !== chosen.code))) {
        await abandoned('The exact detail response does not match the selected Notion record. The Magento read was cancelled.'); return;
      }
      const desired = parsed.data;
      if (!['found', 'partial'].includes(desired.status) || !desired.definition) {
        setResult({ desired }); await abandoned(desired.reason); return;
      }
      const response = await formRequest as PpFreshFormResponse;
      if (!response) { setNotice('The Magento form read did not answer. Check helper status before retrying.'); return; }
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
  const rememberBatch = (pageId: string | null | undefined, status: PpBatchStatus, note: string): void => {
    if (!pageId) return;
    setBatchResults(previous => ({ ...previous, [pageId]: { status, note, at: Date.now() } }));
  };
  const applyPlan = async (kind: 'add' | 'remove' | 'order' | 'rebuild' = 'add'): Promise<void> => {
    if (!plan || busy || applyState.phase === 'applying' || helper.status !== 'idle' || referenceSource === 'current-draft') return;
    // The queue entry belongs to the record this run works on, not to whatever is selected later.
    const batchId = chosen?.pageId;
    // Order and rebuild modes name every row the plan can identify, in Notion order, so the lane
    // can place / remove-and-re-add the existing rows without adding new ones.
    const rows = kind === 'add'
      ? plan.rows.filter(row => row.action === 'add' && row.catalogueId).map(row => ({
        face: row.face, magentoFace: row.magentoFace, technique: row.technique, catalogueId: row.catalogueId,
        // Present rows for the same face and id already account for a stored copy, so the page
        // must not treat that copy as the one this add row is meant to create.
        claimed: plan.rows.filter(other => other.action === 'present' && other.magentoFace === row.magentoFace &&
          other.catalogueId === row.catalogueId).length }))
      : kind === 'remove'
        ? removeRows.map(option => ({ face: option.face, magentoFace: option.face,
          technique: option.label || option.catalogueId, catalogueId: option.catalogueId }))
        : plan.rows.filter(row => row.catalogueId && /^[1-9]\d{0,15}$/.test(row.catalogueId)).map(row => ({
          face: row.face, magentoFace: row.magentoFace, technique: row.technique, catalogueId: row.catalogueId }));
    if (!rows.length) return;
    if (kind === 'remove') setRemoved(rows.map(row => ({ magentoFace: row.magentoFace, technique: row.technique, catalogueId: row.catalogueId })));
    setApplyState({ phase: 'applying', kind }); setSaveState({ phase: 'idle' });
    try {
      const response = await chrome.runtime.sendMessage({ type: 'APPLY_PP_PLAN', requestId: crypto.randomUUID(), entityId, referenceSource, selection, rows, mode: kind }) as ApplyPpPlanResponse;
      if (!mounted.current) return;
      if (!response || response.source !== 'fresh-magento-form' || !Array.isArray(response.results) ||
        !['applied', 'partial', 'failed', 'cancelled', 'invalid', 'unavailable', 'busy', 'auth'].includes(response.status) ||
        typeof response.reason !== 'string') {
        setApplyState({ phase: 'done', error: 'The apply response was invalid. Check the Magento form before saving anything.' }); return;
      }
      setApplyState({ phase: 'done', response });
      // What the change handled decides what Save writes, so it is captured before the read-back
      // re-bases the plan. A removal keeps its own list, and an order keeps every row it sent:
      // saving that arrangement writes the whole list, not just the rows that moved.
      setAppliedRows(ppSaveRows(kind, rows, response.results));
      // The fill lane read the form again, so the panel now shows the rows that are on the page
      // instead of the plan it had before the change.
      const filled = response.snapshot;
      if (filled) {
        setReadBackAt(response.readAt ?? Date.now());
        setReadBackSource('form');
        // The snapshot moved the rows, so a tick that used to point at one row could point at
        // another one now.
        setRemoveIds([]);
        setResult(previous => {
          if (!previous?.current) return previous;
          const merged = ppMergeReadBack(previous.current.snapshot, filled);
          return { ...previous, current: { ...previous.current, snapshot: merged, readAt: response.readAt ?? previous.current.readAt } };
        });
      }
      const handled = response.results.filter(result =>
        result.outcome === 'added' || result.outcome === 'removed' || result.outcome === 'ordered').length;
      rememberBatch(batchId, ['applied', 'partial'].includes(response.status) ? 'applied' : 'attention',
        `${kind === 'remove' ? 'Removed' : kind === 'order' ? 'Ordered' : kind === 'rebuild' ? 'Rebuilt' : 'Added'} ${handled} row(s), unsaved.`);
      // The form really lost these rows, so the panel drops them now instead of asking for
      // another full Magento read just to see what was removed.
      if (kind === 'remove') {
        const gone = rows.filter(row => response.results.some(result =>
          result.outcome === 'removed' && result.catalogueId === row.catalogueId && result.face === row.face));
        if (gone.length) setResult(previous => {
          if (!previous?.current?.snapshot) return previous;
          return { ...previous, current: { ...previous.current, snapshot: ppDropRemovedRows(previous.current.snapshot, gone) } };
        });
        setRemoveIds([]);
      }
      // The form now holds the plan order, so the panel shows it without another Magento read.
      if (kind === 'order') {
        // One result per row, in the order the rows were sent, so a repeated technique on one face
        // is matched to its own result. A report of another length cannot be aligned, so nothing
        // is refreshed from it.
        const placed = response.results.length === rows.length
          ? rows.filter((_row, at) => response.results[at]?.outcome === 'ordered')
          : [];
        if (placed.length) setResult(previous => {
          if (!previous?.current?.snapshot) return previous;
          return { ...previous, current: { ...previous.current, snapshot: ppApplyPlannedOrder(previous.current.snapshot, placed) } };
        });
      }
      // Rebuild re-adds in Notion order, so the panel reflects the new order.
      if (kind === 'rebuild') {
        const added = rows.filter(row => response.results.some(result =>
          result.outcome === 'added' && result.catalogueId === row.catalogueId && result.face === row.face));
        if (added.length) setResult(previous => {
          if (!previous?.current?.snapshot) return previous;
          return { ...previous, current: { ...previous.current, snapshot: ppApplyPlannedOrder(previous.current.snapshot, added) } };
        });
      }
    } catch { if (mounted.current) setApplyState({ phase: 'done', error: 'The apply request failed. Check the Magento form before saving anything.' }); }
  };
  const savePlan = async (): Promise<void> => {
    const helperTab = applyState.response?.tabId;
    if (!helperTab || !plan || busy || saveState.phase === 'saving') return;
    const batchId = chosen?.pageId;
    // The save lane checks the rows the apply actually handled. An order apply sends the whole
    // ordered list, an add sends the added rows, a rebuild sends the rebuilt (re-added) rows,
    // and a removal sends none: its rows were never added to that form, so asking for them
    // would block the save that persists the removal.
    const appliedMode = applyState.response?.mode;
    // Rows the change actually handled, captured at apply time. The plan is re-based on the
    // read-back, where they are already present, so it cannot supply them any more.
    const rows = appliedMode === 'remove' ? [] : appliedRows;
    if (!rows.length && !removed.length) return;
    setSortCopy(''); setSaveState({ phase: 'saving' });
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SAVE_PP_FORM', requestId: crypto.randomUUID(),
        entityId, tabId: helperTab, rows, arrangement: appliedMode === 'order' ? 'plan' : 'append' }) as SavePpFormResponse;
      if (!mounted.current) return;
      if (!response || response.source !== 'pp-save' || response.entityId !== entityId || typeof response.reason !== 'string' ||
        !['saved', 'rejected', 'unknown', 'blocked', 'invalid', 'unavailable', 'busy'].includes(response.status)) {
        setSaveState({ phase: 'done', error: 'The save response was invalid. Check the Magento record before pressing Save again.' }); return;
      }
      setSaveState({ phase: 'done', response });
      rememberBatch(batchId, response.status === 'saved' ? 'saved' : 'attention',
        response.status === 'saved' ? 'Saved and read back.' : `Save ${response.status}: ${response.reason}`);
      // The save lane already read the record again, so its snapshot becomes the panel's data:
      // the operator sees the stored state without a second full load.
      const stored = response.snapshot;
      if (stored) {
        setReadBackAt(response.readAt ?? Date.now());
        setReadBackSource('stored');
        setResult(previous => {
          if (!previous?.current) return previous;
          const merged = ppMergeReadBack(previous.current.snapshot, stored);
          return { ...previous, current: { ...previous.current, snapshot: merged, readAt: response.readAt ?? previous.current.readAt } };
        });
      }
      // A saved record has no unsaved helper tab left, so the apply report and its Save section
      // are cleared: pressing Save again would target a closed tab.
      if (response.status === 'saved' && response.keptOpen === false) {
        setApplyState({ phase: 'idle' }); setRemoveIds([]); setRemoved([]); setAppliedRows([]);
      }
    } catch { if (mounted.current) setSaveState({ phase: 'done', error: 'The save request failed. Check the Magento record before pressing Save again.' }); }
  };
  const desired = result?.desired, form = result?.current;
  const draft = form && ['ok', 'partial'].includes(form.status) ? form.snapshot : undefined;
  const rows = desired && draft ? ppPreviewRows(desired, draft) : [];
  const faces = draft ? ppFaceRows(draft) : [];
  const options = draft ? ppOptionRows(draft) : [];
  const notionLists = desired?.definition ? ppNotionLists(desired.definition) : null;
  const plan = desired && draft ? ppUpdatePlan(desired, draft) : null;
  const order = plan && draft ? ppOrderCheck(plan.rows, draft) : null;
  const summary = draft ? ppSnapshotSummary(draft) : null;
  const languages = PP_STORE_LANGUAGES.filter(([store]) => faces.some(face => face.translations[store] !== undefined));
  const applied = applyState.response && ['applied', 'partial'].includes(applyState.response.status) ? applyState.response : undefined;
  // Read-only account of the order lane, so a failure names its cause instead of needing a guess.
  const orderDiagnostics = applyState.response?.diagnostics as PpOrderDiagnostics | undefined;
  const saved = saveState.response?.snapshot && appliedRows.length
    ? ppSavedVerification(appliedRows, saveState.response.snapshot) : null;
  const removedCheck = saveState.response?.snapshot && removed.length
    ? ppRemovedVerification(removed, saveState.response.snapshot) : null;
  // What the record now holds, compared with the Notion order, not just with the added rows.
  const storedOrder = saveState.response?.snapshot && plan
    ? ppOrderCheck(plan.rows, saveState.response.snapshot) : null;
  // The tick key carries the row position, so one tick is one row even when a face holds the same
  // technique twice. Comparing without the position made every tick match every copy.
  const removeKey = (option: { face: string; catalogueId: string; position: number }): string =>
    option.face + '|' + option.catalogueId + '|' + option.position;
  const removeRows = options.filter(option => removeIds.indexOf(removeKey(option)) !== -1);
  // The rows Notion does not ask for, offered as a tick helper. Nothing is removed by computing
  // them: the operator still confirms the removal and then the save.
  const extraCopies = plan ? ppExtraCopies(plan, options) : [];
  const extraKeys = extraCopies.map(removeKey);
  const confirmRows = applyState.kind === 'remove'
    ? removeRows.map(option => ({ magentoFace: option.face, technique: option.label || option.catalogueId, catalogueId: option.catalogueId }))
    : applyState.kind === 'order' || applyState.kind === 'rebuild'
      ? plan ? plan.rows.filter(row => row.catalogueId && /^[1-9]\d{0,15}$/.test(row.catalogueId))
        .map(row => ({ magentoFace: row.magentoFace, technique: row.technique, catalogueId: row.catalogueId })) : []
      : plan ? plan.rows.filter(row => row.action === 'add' && row.catalogueId)
        .map(row => ({ magentoFace: row.magentoFace, technique: row.technique, catalogueId: row.catalogueId })) : [];
  const review = ppReviewLabel(desired?.definition?.reviewStatus ?? null);
  const catalogueTone = loading ? 'warn' : index.coverage === 'complete' ? 'ok' : index.coverage === 'error' ? 'bad' : 'idle';
  const connectionTone = checking ? 'warn' : connection?.status === 'ready' ? 'ok' : connection ? 'warn' : 'idle';
  const helperTone = helper.status === 'idle' ? 'ok' : helper.status === 'cleanup-failed' ? 'bad' : 'warn';
  // Why the primary action is still disabled, in the order the operator has to solve it.
  const previewBlocked = checking ? 'A connection check is running.'
    : !chosen ? 'Tick a Notion PP in step 1.'
    : chosenProblem ? 'The chosen Notion record needs review before previewing.'
    : !/^[1-9]\d{0,15}$/.test(entityId) ? 'Enter the exact Magento custom-option entity ID in step 2.'
    : connection?.status !== 'ready' ? (connection ? 'Check the Magento connection in step 2: ' + connection.reason : 'Check the Magento connection in step 2.')
    : !selection ? 'Choose a detected source tab in step 2.'
    : helper.status !== 'idle' ? 'A helper tab is still open. Close it before previewing.'
    : !paired ? 'Tick the manual pairing box.'
    : '';
  // The batch queue is the checked catalogue selection, in catalogue order.
  const batchRows = index.rows.filter(row => row.pageId && checked.includes(row.pageId));
  // One progress line per tab: where the current single PP stands, and how much of the batch is
  // saved. Both read the same per-code result map, so the two tabs never disagree.
  const singleStatus = saveState.response?.status === 'saved' ? 'Saved'
    : saveState.response ? 'Save ' + saveState.response.status
      : applyState.response && ['applied', 'partial'].includes(applyState.response.status) ? 'Applied, unsaved'
        : plan ? plan.add + ' to add' : result ? 'Read only' : 'No preview';
  const batchSaved = batchRows.filter(row => !!row.pageId && batchResults[row.pageId]?.status === 'saved').length;
  return <div class="db-stack">
    <div class="db-tabs" role="tablist" aria-label="PP Preview progress">
      <button type="button" role="tab" aria-selected={mode === 'single'} class="db-tab" onClick={() => setMode('single')}>Single progress <span class="db-pill">{singleStatus}</span></button>
      <button type="button" role="tab" aria-selected={mode === 'batch'} class="db-tab" onClick={() => setMode('batch')}>Batch progress <span class="db-pill">{batchSaved} of {batchRows.length} saved</span></button>
    </div>
    {mode === 'single' && result ? <div class="db-pills">
      <span class="db-pill">PP {desired?.code ?? 'unknown'}</span>
      <span class={'db-pill' + (singleStatus === 'Saved' ? ' db-pill--ok' : singleStatus === 'Needs attention' ? ' db-pill--bad' : '')}>{singleStatus}</span>
      {plan ? <span class="db-pill">{plan.add} to add · {plan.present} present · {plan.review} review</span> : null}
      {order && order.faces.length ? <span class={'db-pill' + (order.ordered ? ' db-pill--ok' : ' db-pill--bad')}>{order.ordered ? 'Order follows Notion' : order.outOfPlace.length + ' row(s) out of order'}</span> : null}
      {readBackAt ? <span class="db-pill">Read back {time(readBackAt)}</span> : null}
    </div> : null}
    {mode === 'batch' ? <PpBatchWork rows={batchRows} results={batchResults} onBrowse={() => setMode('single')}
      onOpen={row => {
        if (!row.pageId) return;
        invalidate();
        setMode('single');
        setActiveId(row.pageId);
        setEntityId('');
      }}
      onSkip={row => {
        if (!row.pageId) return;
        setBatchResults(previous => ({ ...previous, [row.pageId!]: { status: 'skipped',
          note: 'Skipped by the operator.', at: Date.now() } }));
      }} /> : <>
    <PpReconcile rows={index.rows} coverage={index.coverage} checked={checked} />
    <section class="db-card">
      <h2><span class="db-step">1</span>Choose a Notion PP</h2>
      <p class="db-note">Load the Notion V2 catalogue, then tick one record. Preview one PP at a time. No Magento data is changed.</p>
      <details class="db-disclosure"><summary>How this works and its limits</summary>
        <p class="db-note">Choose Notion V2 records. Preview one selected PP at a time. Keep one Options Grid open with the exact target entity in its loaded results, or explicitly choose an exact-record edit tab as the address source. To read unsaved edits, explicitly choose CURRENT DRAFT and select the exact edit tab. No Magento data is changed.</p>
      </details>
      <div class="db-actions">
        <button type="button" class="db-btn" disabled={loading} onClick={() => void load()}>Load PP catalogue</button>
        <button type="button" class="db-btn" disabled={!loading} onClick={stopLoad}>Stop catalogue load</button>
        <span class={'db-pill db-pill--' + catalogueTone} role="status" aria-live="polite">{loading ? 'Loading catalogue'
          : index.checkedAt ? 'Catalogue ' + index.coverage : 'Catalogue not loaded'}</span>
      </div>
      <label class="db-field"><span>Search loaded codes or titles</span><input value={filter} onInput={event => setFilter(event.currentTarget.value)} /></label>
      <p class="db-meta">{checked.length} selected · {search.matches} match(es) · {search.matches > visible.length ? `showing the first ${visible.length}; narrow the search to see the rest` : `${visible.length} visible`} · {searchHint}</p>
      <div class="db-table-wrap"><table class="db-table db-table--select"><thead><tr><th scope="col">Select</th><th scope="col">Exact code</th><th scope="col">Notion title</th><th scope="col">Review</th><th scope="col">Identity status</th></tr></thead><tbody>
        {visible.map(({ row, position }) => {
          const selected = !!row.pageId && checked.includes(row.pageId);
          return <tr key={row.pageId ?? 'invalid-' + position} class={selected ? 'db-row--selected' : undefined} onClick={event => {
            const target = event.target as HTMLElement;
            if (target.closest('input, button, a')) return;
            if (problems[position]) return;
            setRow(row, !selected);
          }}>
            <td><input type="checkbox" aria-label={'Select PP ' + (row.code ?? 'missing code')} disabled={!!problems[position]} checked={selected} onChange={event => setRow(row, event.currentTarget.checked)} /></td>
            <td class="db-mono">{row.code === null ? 'Unknown' : row.code}</td><td>{row.name ?? 'Unknown'}</td>
            <td>{row.reviewStatus ?? 'Unknown'}</td><td>{problems[position] ?? (index.coverage === 'complete' ? 'Unique exact code in the loaded Notion catalogue' : 'Uniqueness not established until coverage completes; detail lookup rechecks it')}</td>
          </tr>;
        })}
      </tbody></table></div>
      {index.rows.length === 0 ? <p class="db-empty">No catalogue rows loaded yet. Press Load PP catalogue.</p>
        : visible.length === 0 ? <p class="db-empty">No loaded record matches this search.</p> : null}
    </section>
    <section class="db-card">
      <h2><span class="db-step">2</span>Point at Magento</h2>
      <label class="db-field"><span>Magento address source</span><select value={referenceSource} onChange={event => { invalidate(); setReferenceSource(event.currentTarget.value as PpReferenceSource); }}>
        <option value="options-grid">Options Grid: loaded results only</option><option value="exact-record">Exact-record edit tab: address for fresh helper</option><option value="current-draft">Read CURRENT DRAFT: selected open edit tab</option>
      </select></label>
      <p class="db-note">{referenceSource === 'options-grid'
        ? 'Only already-loaded Grid rows are read. Load the exact entity with native filters/paging yourself. The helper does not change the Grid or fetch more pages. Grid freshness and in-flight state are not verified.'
        : referenceSource === 'current-draft' ? 'Select the already-open exact PP edit tab below, then check the connection. This reads current provider state, including unsaved edits. The tab is never navigated, reloaded or closed.' : 'Keep one edit tab open for the exact Magento entity. Only its native address is copied privately into a fresh helper; the user draft is not read, navigated or reloaded. A general admin tab is not sufficient.'}</p>
      <label class="db-field"><span>Exact Magento custom-option entity ID</span><input inputMode="numeric" value={entityId} maxLength={16} onInput={event => { invalidate(); setEntityId(event.currentTarget.value); }} />
        <em>Enter the actual record ID separately. It is not the business code or Attribute Set ID. The selected source must match that exact entity and configured allowed HTTPS admin base. Do not paste a URL or session key.</em></label>
      <div class="db-actions">
        <button type="button" class="db-btn" disabled={busy || checking || !/^[1-9]\d{0,15}$/.test(entityId)} onClick={() => void checkConnection()}>{checking ? 'Checking connection…' : 'Check Magento connection'}</button>
        <span class={'db-pill db-pill--' + connectionTone}>{checking ? 'Checking' : connection ? 'Magento address ' + connection.status : 'Not checked'}</span>
      </div>
      {/* A status pill alone leaves the operator guessing why preview stays blocked. */}
      {connection && connection.status !== 'ready' ? <p class="db-note" role="alert">{connection.reason}</p>
        : connection?.status === 'ready' ? <p class="db-note">A ready address proves the tab and the entity ID only. It is not a business-code match; that verdict lives in Reconcile sources.</p> : null}
      {connection ? <>
        <label class="db-field"><span>Detected source tab</span><select value={selection?.tabId ?? ''} disabled={busy || checking} onChange={event => {
          generation.current++; setResult(null); setPaired(false); stopPreview();
          setSelection(connection.tabs.find(tab => String(tab.tabId) === event.currentTarget.value));
          setConnection({ ...connection, status: 'changed', reason: 'Tab choice changed. Check the connection again, then confirm the pairing.' });
        }}><option value="">Choose a detected tab explicitly</option>{connection.tabs.map(tab => <option key={tab.tabId} value={tab.tabId}>Tab {tab.tabId} · {tab.host} · {tab.kind}{tab.loading ? ' · loading' : ''}</option>)}</select></label>
      </> : null}
    </section>
    <section class="db-card">
      <h2><span class="db-step">3</span>Pair and preview</h2>
      <label class="db-field"><span>Selected Notion record</span><select value={activeId} onChange={event => { invalidate(); setActiveId(event.currentTarget.value); setEntityId(''); }}><option value="">Choose a checked PP explicitly</option>
        {index.rows.filter(row => row.pageId && checked.includes(row.pageId)).map(row => <option key={row.pageId!} value={row.pageId!}>{row.code} · {row.name}</option>)}
      </select></label>
      {chosen ? <p class="db-meta">Pairing {chosen.code} · {chosen.name} with Magento entity {entityId || '(not entered)'}.</p> : null}
      <label class="db-pair"><input type="checkbox" checked={paired} disabled={!chosen || !!chosenProblem || !/^[1-9]\d{0,15}$/.test(entityId)} onChange={event => { generation.current++; setResult(null); stopPreview(); setPaired(event.currentTarget.checked); }} />
        <span>I manually pair this Notion record with this Magento entity for this preview. The association is not verified.</span></label>
      <div class="db-actions"><button type="button" class="db-btn db-btn--primary" disabled={checking || connection?.status !== 'ready' || !selection || busy || helper.status !== 'idle' || !chosen || !!chosenProblem || !paired} aria-busy={busy} onClick={() => void read()}>{busy ? 'Reading selected PP…' : 'Preview selected PP'}</button>
        <button type="button" class="db-btn" disabled={!busy && helper.status === 'idle'} onClick={() => void stopOrClose()}>Stop preview / close helper tab</button>
        <span class={'db-pill db-pill--' + helperTone}>Helper {helper.status}</span></div>
      {previewBlocked ? <p class="db-hint">Next: {previewBlocked}</p> : null}
      {helper.status === 'cleanup-failed' ? <p role="alert">Helper tab {helper.leftoverTabId} could not be closed. Further previews are blocked. Retry closing it or close that helper tab manually.</p> : null}
      <p class="db-note" role="status" aria-live="polite">{notice}</p>
    </section>
    {result ? <section class="db-card db-summary">
      <div class="db-card-head"><h2>Preview summary</h2><span class="db-badge">Read-only</span></div>
      <p><strong>{desired?.definition?.name ?? 'Notion title not supplied'}</strong></p>
      <div class="db-pills">
        <span class="db-pill">PP {desired?.code ?? 'unknown'}</span>
        <span class="db-pill">Entity {entityId}</span>
        <span class="db-pill">{summary ? (summary.faces === 1 ? '1 face' : summary.faces + ' faces') : '0 faces'}</span>
        <span class="db-pill">{summary ? (summary.options === 1 ? '1 option row' : summary.options + ' option rows') : '0 option rows'}</span>
        {summary && summary.warnings ? <span class="db-pill db-pill--warn">{summary.warnings === 1 ? '1 warning' : summary.warnings + ' warnings'}</span> : null}
      </div>
    </section> : null}
    {plan ? <section class="db-card"><div class="db-card-head"><h2>Planned changes <span class="db-badge">Existing record only</span></h2>
      <button type="button" class="db-btn" disabled={!!previewBlocked || busy}
        title={previewBlocked || 'Read the Notion reference and the Magento form again for this pairing'}
        onClick={() => void read()}>Refresh</button>
    </div>
      <div class="db-pills">
        <span class={'db-pill' + (plan.add ? ' db-pill--ok' : '')}>{plan.add} to add</span>
        <span class="db-pill">{plan.present} already present</span>
        <span class={'db-pill' + (plan.review ? ' db-pill--warn' : '')}>{plan.review} need review</span>
      </div>
      <p class="db-note">This candidate adds, reorders or removes rows on one existing Magento record. It never duplicates. The requested duplicate-and-reduce workflow stays blocked; see Reconcile sources.</p>
      {order && order.faces.length ? <div class="db-order">
        <div class="db-pills">
          <span class={'db-pill' + (order.ordered ? ' db-pill--ok' : ' db-pill--bad')}>{order.ordered ? 'Form order follows the Notion list' : order.outOfPlace.length + ' row(s) not in Notion order'}</span>
        </div>
        {!order.ordered && form?.source === 'fresh-magento-form-load' ? <div class="db-actions">
          <button type="button" class="db-btn" disabled={busy || !!applied || helper.status !== 'idle' || referenceSource === 'current-draft'}
            onClick={() => setApplyState({ phase: 'confirming', kind: 'order' })}>Set the row order from Notion</button>
          <span class="db-meta"> Moves the rows in Magento's own record list, the array Save posts. Unsaved; nothing is saved by this.</span>
        </div> : null}
        {!order.ordered && form?.source === 'fresh-magento-form-load' ? <div class="db-actions">
          <button type="button" class="db-btn" disabled={busy || !!applied || helper.status !== 'idle' || referenceSource === 'current-draft'}
            onClick={() => setApplyState({ phase: 'confirming', kind: 'rebuild' })}>Rebuild row order</button>
          <span class="db-meta"> Removes out-of-order rows and re-adds them in Notion order, giving them newer record IDs. Unsaved; nothing is saved by this.</span>
        </div> : null}
        {order.faces.map(face => <p key={face.face} class={face.outOfPlace.length ? 'db-warn' : 'db-note'} role={face.outOfPlace.length ? 'alert' : undefined}>
          {face.face}: Notion {face.wanted.join(' → ')}. Form {face.actual.join(' → ')}.
          {face.outOfPlace.length ? ' Out of order: ' + face.outOfPlace.join(', ') + '.' : ''}
        </p>)}
      </div> : null}
      {ppPlanFaces(plan.rows).map(group => <details class="db-disclosure" key={group.face}>
        <summary>{group.face || '(no face)'} · {group.add} to add · {group.present} already present{group.review ? ' · ' + group.review + ' review' : ''}</summary>
        <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">Face (Notion)</th><th scope="col">Technique (Notion)</th><th scope="col">Catalogue id</th><th scope="col">Action</th><th scope="col">Note</th></tr></thead><tbody>
          {group.rows.map((row, index) => <tr key={row.face + index}><td>{row.face}</td><td>{row.technique}</td><td>{row.catalogueId || '(none)'}</td><td>{row.action === 'add' ? <span class="db-pill db-pill--ok">Add</span> : row.action === 'present' ? <span class="db-pill">Already present</span> : <span class="db-pill db-pill--warn">Review</span>}</td><td>{row.note || '(none)'}</td></tr>)}
        </tbody></table></div>
      </details>)}
      {plan.unlistedItems ? <p class="db-note">{plan.unlistedItems} existing Magento item row(s) are not in this plan and would stay untouched.</p> : null}
      {options.length ? <div class="db-remove">
        <h3>Remove existing rows <span class="db-badge">Manual</span></h3>
        <p class="db-note">Tick the exact rows to remove. One tick is one row, so a technique that appears twice on a face is removed one copy at a time. Nothing is inferred from Notion: a technique missing from Notion never removes a Magento row. Removing changes a helper form and is saved only by the Save section.</p>
        {plan && plan.review > 0 ? <p class="db-note">{plan.review} Notion row(s) are unresolved, so no ticks are offered automatically. Resolve them first: a row without an exact catalogue id cannot justify a deletion.</p> : extraKeys.length ? <div class="db-actions">
          <button type="button" class="db-btn" disabled={busy || !!applied || helper.status !== 'idle' || referenceSource === 'current-draft'}
            onClick={() => setRemoveIds(previous => Array.from(new Set([...previous, ...extraKeys])))}>
            Tick the {extraKeys.length} row{extraKeys.length === 1 ? '' : 's'} Notion does not ask for</button>
          {removeIds.length ? <button type="button" class="db-btn" onClick={() => setRemoveIds([])}>Clear ticks</button> : null}
        </div> : null}
        {extraKeys.length ? <p class="db-note">A tick is a selection only. Nothing is removed until you confirm, and nothing is written until Save.</p> : null}
        <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">Remove</th><th scope="col">Face</th><th scope="col">Catalogue id</th><th scope="col">Name</th><th scope="col">Sort</th><th scope="col">Store</th></tr></thead><tbody>
          {options.map(option => {
            const key = removeKey(option);
            const checked = removeIds.indexOf(key) !== -1;
            return <tr key={key}>
              <td><input type="checkbox" checked={checked}
                onChange={() => setRemoveIds(previous => checked ? previous.filter(entry => entry !== key) : [...previous, key])} /></td>
              <td>{option.face}</td><td>{ppCell(option.catalogueId)}</td><td>{option.label || '(not read)'}</td>
              <td>{ppCell(option.sort)}</td><td>{option.store ? ppLanguage(option.store) : '(blank)'}</td>
            </tr>;
          })}
        </tbody></table></div>
        {removeRows.length ? <div class="db-actions">
          <button type="button" class="db-btn" disabled={busy || !!applied || helper.status !== 'idle' || referenceSource === 'current-draft'}
            onClick={() => setApplyState({ phase: 'confirming', kind: 'remove' })}>
            Remove {removeRows.length} row{removeRows.length === 1 ? '' : 's'} in a Magento form</button>
        </div> : null}
      </div> : null}
      <div class="db-note">
        {applyState.phase === 'idle' && plan.add > 0 && form?.source === 'fresh-magento-form-load' &&
          !(applyState.response && ['applied', 'partial'].includes(applyState.response.status)) ? <div class="db-actions">
          <button type="button" class="db-btn db-btn--primary" disabled={referenceSource === 'current-draft' || helper.status !== 'idle'} onClick={() => setApplyState({ phase: 'confirming' })}>
            Add {plan.add} missing technique{plan.add === 1 ? '' : 's'} to a Magento form</button>
          {referenceSource === 'current-draft' ? <span> An open user draft is never changed. Read a fresh helper form first.</span> : null}
        </div> : null}
        {applyState.phase === 'confirming' ? <div>
          <p><strong>{applyState.kind === 'remove'
            ? `Open Magento entity ${entityId} in a helper tab and remove these rows?`
            : applyState.kind === 'order'
              ? `Open Magento entity ${entityId} in a helper tab and set the option rows to the Notion order?`
              : applyState.kind === 'rebuild'
                ? `Open Magento entity ${entityId} in a helper tab, remove out-of-order rows and re-add them in Notion order?`
                : `Open Magento entity ${entityId} in a helper tab and add these rows?`}</strong> This only changes the unsaved form. Saving is a separate confirmation.</p>
          <ul class="db-pp-list">{confirmRows.map((row, index) =>
            <li key={row.magentoFace + index}>{row.magentoFace} · {row.technique} · catalogue id {row.catalogueId}</li>)}</ul>
          <div class="db-actions"><button type="button" class="db-btn db-btn--primary"
            onClick={() => void applyPlan(applyState.kind === 'remove' ? 'remove' : applyState.kind === 'order' ? 'order' : applyState.kind === 'rebuild' ? 'rebuild' : 'add')}>
            Confirm: {applyState.kind === 'remove' ? 'remove the rows' : applyState.kind === 'order' ? 'set the order' : applyState.kind === 'rebuild' ? 'rebuild row order' : 'fill the form'}</button>
            <button type="button" class="db-btn" onClick={() => setApplyState({ phase: 'idle' })}>Cancel</button></div>
        </div> : null}
        {applyState.phase === 'applying' ? <p role="status">Opening the helper form and adding the planned rows. Nothing is saved.</p> : null}
        {applyState.phase === 'done' ? <div>
          <p role="alert">{applyState.error ?? applyState.response?.reason}</p>
          {applyState.response?.tabId ? <p>Helper tab {applyState.response.tabId} holds the unsaved form in the background. Save from here, or open that tab if you want to check the form yourself.</p> : null}
          {applyState.response?.results.length ? <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">Face</th><th scope="col">Technique</th><th scope="col">Catalogue id</th><th scope="col">Outcome</th><th scope="col">Reason</th></tr></thead><tbody>
            {applyState.response.results.map((row, index) => <tr key={row.face + index}><td>{row.face}</td><td>{row.technique}</td><td>{row.catalogueId}</td><td>{row.outcome}</td><td>{row.reason}</td></tr>)}
          </tbody></table></div> : null}
          <div class="db-actions"><button type="button" class="db-btn" onClick={() => setApplyState(previous => ({ phase: 'idle', response: previous.response }))}>Dismiss</button></div>
        </div> : null}
        {/* The save section stands on its own, so dismissing the report never hides it. */}
        {applied ? <div class="db-save">
          <h3>Save in Magento</h3>
          <p class="db-warn db-guard" role="alert"><strong>Not the duplicate workflow.</strong> This Save writes the changes to the original Magento PP {entityId}. It does not create a copy, and the original is not preserved. The duplicate-and-reduce workflow stays blocked in Reconcile sources; nothing on this page can run it.</p>
          {saveState.phase === 'idle' ? <>
            <p class="db-note">The rows are in helper tab {applied.tabId}, still unsaved. Saving brings that tab to the front, presses Magento's own Save, reads the record again to check them, then hands this dashboard back. Notion is untouched.</p>
            <div class="db-actions"><button type="button" class="db-btn db-btn--primary" disabled={!plan || !applied ||
              !applied.results.some(result => result.outcome === 'added' || result.outcome === 'removed' || result.outcome === 'ordered') || !entityId}
              onClick={() => setSaveState({ phase: 'confirming' })}>Save PP {entityId} in Magento</button></div>
          </> : null}
          {saveState.phase === 'confirming' ? <div>
            <p><strong>Press Magento's Save for PP {entityId}?</strong> This writes the original record, not a duplicate. It will be read again to check these rows.</p>
            <ul class="db-pp-list">{appliedRows.map((row, index) =>
              <li key={row.face + index}>{applyState.response?.mode === 'order' ? 'Order: ' : ''}{row.magentoFace} · {row.technique} · catalogue id {row.catalogueId}</li>)}</ul>
            {removed.length ? <ul class="db-pp-list">{removed.map((row, index) =>
              <li key={'removed-' + index}>Remove: {row.magentoFace} · {row.technique} · catalogue id {row.catalogueId}</li>)}</ul> : null}
            {order && !order.ordered ? <p role="alert">This form is not in Notion order yet ({order.outOfPlace.join(', ')}). Saving keeps the current order; only rows this plan adds are placed after their face.</p> : null}
            <div class="db-actions"><button type="button" class="db-btn db-btn--primary" onClick={() => void savePlan()}>Confirm: press Magento Save</button>
              <button type="button" class="db-btn" onClick={() => setSaveState({ phase: 'idle' })}>Cancel</button></div>
          </div> : null}
          {saveState.phase === 'saving' ? <p role="status">Pressing Magento's Save and reading the record back. Nothing else is touched.</p> : null}
          {saveState.phase === 'done' ? <div>
            <div class="db-pills">
              {saveState.response ? <span class={'db-pill db-pill--' + (saveState.response.status === 'saved' ? 'ok' : saveState.response.status === 'unknown' ? 'warn' : 'bad')}>Save {saveState.response.status}</span> : null}
              {saved && saved.checked > 0 ? <span class={'db-pill' + (saved.missing.length ? ' db-pill--bad' : ' db-pill--ok')}>{saved.found.length} of {saved.checked} rows read back</span> : null}
              {saved && saved.missing.length ? <span class="db-pill db-pill--warn">{saved.missing.length} not found</span> : null}
              {saved && saved.checked > 0 && saved.misplaced.length ? <span class="db-pill db-pill--bad">{saved.misplaced.length} out of order</span> : null}
              {saved && saved.checked > 0 && !saved.missing.length && !saved.misplaced.length ? <span class="db-pill db-pill--ok">Added rows confirmed</span> : null}
              {storedOrder && storedOrder.faces.length ? <span class={'db-pill' + (storedOrder.ordered ? ' db-pill--ok' : ' db-pill--bad')}>{storedOrder.ordered ? 'Stored order follows Notion' : storedOrder.outOfPlace.length + ' stored row(s) out of Notion order'}</span> : null}
              {removedCheck ? <span class={'db-pill' + (removedCheck.present.length ? ' db-pill--bad' : ' db-pill--ok')}>{removedCheck.gone} of {removedCheck.checked} removed row(s) gone</span> : null}
            </div>
            <p role="alert">{saveState.error ?? saveState.response?.reason}</p>
            {saveState.response?.magentoMessage ? <p class="db-note">Magento said: {saveState.response.magentoMessage}</p> : null}
            {saveState.response && ['saved', 'unknown'].includes(saveState.response.status) && !saved
              ? <p class="db-note">No read-back snapshot came back, so the written rows are unverified.</p> : null}
            {saved && saved.found.length ? <p class="db-note">Stored now: {saved.found.join(' · ')}</p> : null}
            {saved && saved.missing.length ? <p role="alert">Not found in the read-back: {saved.missing.join(' · ')}</p> : null}
            {saved && saved.misplaced.length ? <p role="alert">Stored, but not last on its face: {saved.misplaced.join(' · ')}</p> : null}
            {storedOrder && !storedOrder.ordered ? <p role="alert">Stored order, against Notion: {storedOrder.faces.filter(face => face.outOfPlace.length).map(face =>
              `${face.face} holds ${face.actual.join(' → ')}, Notion wants ${face.wanted.join(' → ')}`).join(' · ')}.</p> : null}
            {removedCheck && removedCheck.present.length ? <p role="alert">Still stored after the save: {removedCheck.present.join(' · ')}</p> : null}
            {saveState.response?.status === 'saved' && !saveState.response.snapshot
              ? <p class="db-note">Read the record again with Preview before changing it further.</p> : null}
            <div class="db-actions"><button type="button" class="db-btn" onClick={() => setSaveState({ phase: 'idle' })}>Dismiss</button></div>
          </div> : null}
      </div> : null}
      </div>
    </section> : null}
    {saveState.response?.sortDiagnostic ? <section class="db-card">
      <h2>Save Sort diagnostic</h2>
      <p class="db-note">Only face, option name, catalogue ID and Sort are included. A before read was attempted just before Save. An after read is shown only when a fresh record read succeeded; unavailable reads are marked.</p>
      <textarea class="db-textarea" readOnly rows={10} aria-label="Copyable Save Sort diagnostic"
        value={JSON.stringify(saveState.response.sortDiagnostic, null, 2)} />
      <div class="db-actions"><button type="button" class="db-btn" onClick={() => {
        if (!navigator.clipboard?.writeText) { setSortCopy('Clipboard unavailable. Select and copy the text above.'); return; }
        void navigator.clipboard.writeText(JSON.stringify(saveState.response?.sortDiagnostic, null, 2))
          .then(() => setSortCopy('Copied.'), () => setSortCopy('Clipboard unavailable. Select and copy the text above.'));
      }}>Copy diagnostic</button><span role="status">{sortCopy}</span></div>
    </section> : null}
    {result ? <div class="db-grid">
      <section class="db-card">
        <div class="db-card-head"><h2>Magento read</h2>
          <span class={'db-pill db-pill--' + (!form ? 'bad' : ['ok', 'partial'].includes(form.status) ? 'ok' : 'warn')}>{!form ? 'not read' : form.status}</span></div>
        {draft ? <div class="db-pills">
          <span class="db-pill">Entity {draft.entityId}</span>
          <span class="db-pill">Attribute set {ppCell(draft.providerAttributeSetId)}</span>
          <span class={'db-pill' + (attributeSetConsistency(draft) === 'matching' ? ' db-pill--ok' : ' db-pill--warn')}>{attributeSetConsistency(draft) === 'matching' ? 'Set matches the form' : 'Attribute set ' + attributeSetConsistency(draft)}</span>
          {draft.warnings.length ? <span class="db-pill db-pill--warn">{draft.warnings.length === 1 ? '1 warning' : draft.warnings.length + ' warnings'}</span> : null}
          <span class="db-pill">Read {time(form?.readAt)}</span>
        </div> : null}
        {!draft ? <p>No usable Magento snapshot. Comparison blocked. Check the connection, then preview again.</p> : null}
      </section>
      <section class="db-card">
        <div class="db-card-head"><h2>Notion reference</h2>
          <span class={'db-pill db-pill--' + (desired?.status === 'found' ? 'ok' : 'warn')}>{desired?.status ?? 'not read'}</span></div>
        <p><strong>{desired?.definition?.name ?? 'No unique Notion definition'}</strong></p>
        <div class="db-pills">
          <span class="db-pill">Code {desired?.code ?? 'unknown'}</span>
          {desired?.definition ? <span class={'db-pill' + (review.label === 'Needs review' ? ' db-pill--warn' : '')} title={review.raw || 'not supplied'}>{review.label}</span> : null}
          <span class="db-pill">Read {time(desired?.checkedAt)}</span>
          <span class="db-pill">Edited {time(desired?.definition?.lastEditedAt)}</span>
        </div>
        {!desired?.definition ? <p>No unique desired definition. Comparison blocked.</p> : null}
      </section>
    </div> : null}
    {rows.length ? <section class="db-card"><h2>Side-by-side reference</h2>
      {summary ? <p><strong>Magento</strong> entity {draft?.entityId} · Attribute set {summary.attributeSet || '(not supplied)'} · {summary.faces} face(s) · {summary.options} option row(s) · {summary.languages.length} language(s) · {summary.warnings} warning(s)</p> : null}
      <p class="db-note">Each side shows its own values, in the order that side supplies. Nothing here is a mapping or a pairing between records, and a blank desired value never requests deletion.</p>
      <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">Field</th><th scope="col">{form?.source === 'current-open-page-draft' ? 'Magento current draft' : 'Magento fresh form'}</th><th scope="col">Notion PP Catalog V2</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.field}><th scope="row">{row.field}</th><td>{row.magento}</td><td>{row.notion}</td></tr>)}
      </tbody></table></div>
      {faces.length ? <><h3>Magento faces (locations)</h3>
        <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">Face</th>{languages.map(([, label]) => <th scope="col" key={label}>{label}</th>)}<th scope="col">Key</th><th scope="col">Sort</th><th scope="col">Price</th></tr></thead><tbody>
          {faces.map(face => <tr key={face.position}><th scope="row">{face.name || '(blank)'}</th>
            {languages.map(([store, label]) => <td key={label}>{face.translations[store] || '(blank)'}</td>)}
            <td>{ppCell(face.keyId)}</td><td>{ppCell(face.sort)}</td><td>{ppCell(face.price)}</td></tr>)}
        </tbody></table></div></> : null}
      {options.length ? <><h3>Magento options (technique rows)</h3>
        <div class="db-table-wrap"><table class="db-table"><thead><tr><th scope="col">#</th><th scope="col">Face</th><th scope="col">Catalogue id</th><th scope="col">Name (page label)</th><th scope="col">Sort</th><th scope="col">Store</th></tr></thead><tbody>
          {options.map(option => <tr key={option.position}><td>{option.position}</td><td>{option.face}</td><td>{ppCell(option.catalogueId)}</td><td>{option.label || '(not read)'}</td><td>{ppCell(option.sort)}</td><td>{option.store ? ppLanguage(option.store) : '(blank)'}</td></tr>)}
        </tbody></table></div></> : null}
      {notionLists ? <><h3>Notion PP Catalog V2 (global lists)</h3>
        <ul class="db-pp-list">
          <li><strong>Faces:</strong> {notionLists.faces}</li>
          <li><strong>Options:</strong> {notionLists.options}</li>
          <li><strong>Techniques:</strong> {notionLists.techniques}</li>
        </ul>
        <p class="db-note">These Notion lists are global to the PP. They sit beside the Magento rows for reading only and do not identify a location row or catalogue id.</p></> : null}
      <p class="db-note">Catalogue ids are raw Magento values. The page label is read from Magento's own dropdown and is display only.{options.length && options.every(option => !option.label) ? ' No label was available: Magento renders those rows only after the Options tab is opened. A helper load and a current-draft read both open it for you.' : ''}</p>
    </section> : null}
    {index.checkedAt || index.reason !== 'Catalogue not loaded.' || connection || result ? <section class="db-card">
      <div class="db-card-head"><h2>Diagnostics and details</h2><span class="db-badge">Read-only</span></div>
      <p class="db-note">Support output only. Nothing in this section changes Magento or Notion.</p>
      <details class="db-disclosure"><summary>Catalogue</summary>
        <p class="db-note">Coverage {index.coverage}. {index.rows.length} row(s). Read {time(index.checkedAt)}.</p>
        <p class="db-note">{index.reason}</p>
      </details>
      {connection ? <details class="db-disclosure"><summary>Connection and helper</summary>
        <p class="db-note">Connection {connection.status}. {connection.reason}</p>
        <p class="db-note">{connection.tabs.length} detected tab(s). Selected {selection ? 'tab ' + selection.tabId : 'none'}. Helper {helper.status}.</p>
      </details> : null}
      {form ? <details class="db-disclosure"><summary>Magento read details and warnings</summary>
        <p class="db-note">{form.source === 'current-open-page-draft' ? 'Current open-page draft, unsaved edits included. Saved state is not certified.' : 'Fresh helper form load. Not a certified saved-server snapshot.'}{readBackAt ? (readBackSource === 'stored'
          ? ' The stored record was read again after Save at ' + time(readBackAt) + '.'
          : ' The helper form was read again at ' + time(readBackAt) + ', unsaved.') : ''} Read {time(form.readAt)}.</p>
        <p>Status: {form.status} · helper cleanup: {form.cleanup} · host {form.host}.</p>
        <p class="db-note">{form.reason}</p>
        {form.reference ? <p class="db-note">Address source: {form.reference.kind}.{form.reference.grid ? <> Loaded Grid: {form.reference.grid.status}; rows {form.reference.grid.loadedRows ?? 'unknown'} of {form.reference.grid.totalRows ?? 'unknown'}; page {form.reference.grid.page ?? 'unknown'}, page size {form.reference.grid.pageSize ?? 'unknown'}. Loaded data only; filters or paging may hide other records.{form.reference.grid.detail ? <> Rejected: {form.reference.grid.detail}.</> : null}</> : null}</p> : null}
        {form.readiness ? <div class="db-note">
          <p>Readiness checks: {form.readiness.checks}. Full reads: {form.readiness.extractions}. Elapsed: {(form.readiness.elapsedMs / 1000).toFixed(1)}s.</p>
          <p>Last checkpoint: {form.readiness.last?.stage ?? 'none'}. Document: {form.readiness.last?.document ?? 'unknown'}. Registry: {form.readiness.last?.registry ?? 'unknown'}. Provider: {form.readiness.last?.provider ?? 'unknown'}. Data: {form.readiness.last?.data ?? 'unknown'}. Identity: {form.readiness.last?.identity ?? 'unknown'}.</p>
          <p>Last scan: {form.readiness.lastScanStatus ?? 'not attempted'}. Warning codes: {form.readiness.warningCodes.join(', ') || 'none'}.{form.readiness.last?.blockedAccessor ? ' An accessor was blocked.' : ''}</p>
        </div> : null}
        {draft ? <p class="db-note">Provider entity: {show(draft.providerEntityId)}. General Attribute Set IDs: {show(draft.generalAttributeSetId)}. This does not verify a Notion association.</p> : null}
        {draft ? draft.warnings.map((warning, i) => <p class="db-note" key={i}>{warning}</p>) : null}
      </details> : null}
      {desired ? <details class="db-disclosure"><summary>Notion reference details and warnings ({desired.definition?.warnings.length ?? 0})</summary>
        <p class="db-note">{desired.reason}</p>
        {desired.definition ? <>
          <p class="db-note">Notion page {desired.definition.pageId}. Source database: {PP_CATALOG_DATABASE}. A rever, partial and unknown data require manual review; missing or unclear fields are never instructions to change Magento data.</p>
          {desired.definition.warnings.map((warning, i) => <p class="db-note" key={i}>{warning}</p>)}
          <details><summary>Raw definition and body reference</summary><pre class="db-pp-data">{show(desired.definition)}</pre></details>
        </> : null}
      </details> : null}
      {orderDiagnostics ? <details class="db-disclosure"><summary>Order lane</summary>
        <p class="db-note">Build {orderDiagnostics.build}. Table {orderDiagnostics.tableFound ? 'found' : 'missing'}, {orderDiagnostics.rowCount} row(s), waited {orderDiagnostics.waitedMs} ms.
          {' '}Record list {orderDiagnostics.listFound ? `found as ${orderDiagnostics.listKey} with ${orderDiagnostics.listLength} entries` : 'not found'}.</p>
        <p class="db-note">Model order {orderDiagnostics.modelOrder.join(' then ') || 'unknown'}. Plan {orderDiagnostics.ordered} of {orderDiagnostics.total} in place. Record list in plan order {orderDiagnostics.modelMoved ? 'yes' : 'no'}.</p>
        <p class="db-note">Source {orderDiagnostics.url}</p>
      </details> : null}
      {plan ? <details class="db-disclosure"><summary>Plan source</summary>
        <p class="db-note">{plan.catalogueSize} catalogue entries read. {plan.locations} location row(s) in Notion.</p>
      </details> : null}
      {draft ? <details><summary>Show raw Magento snapshot</summary><pre class="db-pp-data">{show(draft)}</pre></details> : null}
    </section> : null}
    </>}
  </div>;
}
