import { Fragment, h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type {
  ApplyFieldResponse,
  GetFormStateResponse,
} from '../../core/messages';
import {
  FIELD_LABELS,
  MAGE_FIELDS,
  type MageFieldKind,
} from '../../page/shared/magentoForm';
import { WRITES_ENABLED } from '../../shared/flags';

interface FillPanelProps {
  sku: string;
  storeView: string;
  detectedStoreView: string;
}

interface FieldRow {
  value: string;
  applied: boolean;
  previousValue: string;
}

type FieldRows = Record<MageFieldKind, FieldRow>;

function emptyRow(): FieldRow {
  return { value: '', applied: false, previousValue: '' };
}

function emptyRows(): FieldRows {
  return { name: emptyRow(), short_description: emptyRow() };
}

function rowFor(rows: FieldRows, kind: MageFieldKind): FieldRow {
  return rows[kind] ?? emptyRow();
}

async function activeTabId(): Promise<number | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

export function FillPanel({
  sku,
  storeView,
  detectedStoreView,
}: FillPanelProps) {
  const [form, setForm] = useState<GetFormStateResponse | null>(null);
  const [rows, setRows] = useState<FieldRows>(emptyRows);
  const [reading, setReading] = useState(false);
  const [busyField, setBusyField] = useState<MageFieldKind | null>(null);
  const [message, setMessage] = useState<{
    tone: 'ok' | 'err';
    text: string;
  } | null>(null);

  const readForm = useCallback(async () => {
    setReading(true);
    setMessage(null);
    try {
      const tabId = await activeTabId();
      if (tabId === null) {
        setForm({ available: false, reason: 'No active tab.' });
        return;
      }
      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'GET_FORM_STATE',
      })) as GetFormStateResponse | undefined;
      setForm(
        response ?? {
          available: false,
          reason: 'No response from the page - open the Magento admin first.',
        },
      );
    } catch {
      setForm({
        available: false,
        reason:
          'Cannot reach the page - open a Magento product edit page in the active tab.',
      });
    } finally {
      setReading(false);
    }
  }, []);

  useEffect(() => {
    void readForm();
  }, [readForm]);

  async function apply(kind: MageFieldKind, action: 'apply' | 'undo'): Promise<void> {
    if (!WRITES_ENABLED) {
      setMessage({
        tone: 'err',
        text: 'Writing to the page is paused.',
      });
      return;
    }
    const row = rowFor(rows, kind);
    const value = action === 'apply' ? row.value : '';
    setBusyField(kind);
    setMessage(null);
    try {
      const tabId = await activeTabId();
      if (tabId === null) {
        setMessage({ tone: 'err', text: 'No active tab.' });
        return;
      }
      const response = (await browser.tabs.sendMessage(tabId, {
        type: 'APPLY_FIELD',
        sku,
        storeView: storeView === 'all' ? 'all' : storeView,
        field: kind,
        action,
        value,
      })) as ApplyFieldResponse | undefined;
      if (!response) {
        setMessage({ tone: 'err', text: 'No response from the page.' });
        return;
      }
      if (!response.ok) {
        setMessage({ tone: 'err', text: response.reason ?? 'Apply refused.' });
        return;
      }
      setRows((prev) => {
        const next: FieldRows = { ...prev };
        next[kind] = {
          value: response.appliedValue ?? row.value,
          applied: action === 'apply',
          previousValue: response.previousValue ?? '',
        };
        return next;
      });
      setMessage({
        tone: 'ok',
        text:
          action === 'apply'
            ? `${FIELD_LABELS[kind]} written to the form. Nothing is saved - press Save yourself when it looks right.`
            : `${FIELD_LABELS[kind]} restored to its pre-apply value.`,
      });
    } catch {
      setMessage({ tone: 'err', text: 'Apply failed - page unreachable.' });
    } finally {
      setBusyField(null);
    }
  }

  const state = form?.available ? form.state : null;
  const skuMatch =
    !state?.pageSku || !sku.trim()
      ? null
      : state.pageSku.trim().toUpperCase() === sku.trim().toUpperCase();
  const scopeMismatch = Boolean(
    detectedStoreView &&
      detectedStoreView !== 'all' &&
      storeView !== 'all' &&
      state?.storeView &&
      state.storeView !== 'all' &&
      state.storeView !== storeView,
  );

  return (
    <section class="mhx-fill">
      <div class="mhx-fill-actions">
        <button
          type="button"
          class="mhx-primary"
          disabled={reading}
          onClick={() => void readForm()}
        >
          {reading ? 'Reading…' : 'Read form'}
        </button>
        <span class="mhx-hint">
          SKU <code>{sku || '—'}</code> · scope <code>{storeView}</code>
        </span>
      </div>

      {message ? (
        <div class={message.tone === 'err' ? 'mhx-error' : 'mhx-saved'}>
          {message.text}
        </div>
      ) : null}

      {!form?.available ? (
        <p class="mhx-empty">{form?.reason ?? 'Reading the open page…'}</p>
      ) : (
        <Fragment>
          <div class="mhx-guards">
            <span class={skuMatch === false ? 'mhx-guard bad' : 'mhx-guard ok'}>
              SKU guard: {skuMatch ? 'matches the open page' : 'checked on apply'}
              {state?.pageSku ? ` (${state.pageSku})` : ''}
            </span>
            <span class={scopeMismatch ? 'mhx-guard bad' : 'mhx-guard ok'}>
              Store-view guard: {scopeMismatch ? 'scope differs' : 'ok'}
              {state?.storeView ? ` (${state.storeView})` : ''}
            </span>
          </div>

          {WRITES_ENABLED ? (
            <p class="mhx-note">
              Writes into the open admin form only. Nothing is saved and no Save
              button is clicked — press Save yourself when the record looks
              right.
            </p>
          ) : (
            <p class="mhx-note">
              Writing to the page is paused. Fields are shown read-only; Apply
              and Undo are disabled.
            </p>
          )}

          {MAGE_FIELDS.map((kind) => {
            const row = rowFor(rows, kind);
            const pageValue =
              state?.fields.find((f) => f.kind === kind)?.value ?? '';
            return (
              <div class="mhx-fill-row" key={kind}>
                <label class="mhx-fill-label">
                  {FIELD_LABELS[kind]}
                  {pageValue ? '' : ' (empty on page)'}
                </label>
                <textarea
                  rows={kind === 'short_description' ? 4 : 1}
                  value={row.value}
                  placeholder="Value to write into the admin field"
                  onInput={(e) =>
                    setRows((prev) => {
                      const next: FieldRows = { ...prev };
                      next[kind] = {
                        ...rowFor(prev, kind),
                        value: e.currentTarget.value,
                      };
                      return next;
                    })
                  }
                />
                <div class="mhx-fill-buttons">
                  <button
                    type="button"
                    class="mhx-primary"
                    disabled={!WRITES_ENABLED || busyField !== null}
                    onClick={() => void apply(kind, 'apply')}
                  >
                    {busyField === kind ? 'Applying…' : 'Apply'}
                  </button>
                  <button
                    type="button"
                    disabled={
                      !WRITES_ENABLED || busyField !== null || !row.applied
                    }
                    onClick={() => void apply(kind, 'undo')}
                  >
                    Undo
                  </button>
                </div>
              </div>
            );
          })}
        </Fragment>
      )}
    </section>
  );
}
