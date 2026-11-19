import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import {
  STAGE_STATUS_CLASS,
  STAGE_STATUS_LABEL,
  type Stage,
  type StageId,
  type StageState,
} from './stage';

type StageStates = Partial<Record<StageId, StageState>>;

/**
 * Renders a stage list.
 *
 * `stages={[stage]}` is the standalone tab: no stepper, no chaining, just the
 * card and its result. `stages={[...chain]}` adds the strip, "Run remaining" and
 * per-step retry - the same components, one contract.
 *
 * `writes` stages (push to Notion) are never swept up by "Run remaining": they
 * only run from their own button.
 */
export function StageHost({
  stages,
  chain = false,
}: {
  stages: Stage[];
  chain?: boolean;
}) {
  const [states, setStates] = useState<StageStates>({});
  const [busy, setBusy] = useState(false);

  const stateOf = (id: StageId): StageState => states[id] ?? { status: 'idle' };

  const runOne = async (stage: Stage): Promise<boolean> => {
    if (stage.blocked) return false;
    setStates((current) => ({
      ...current,
      [stage.id]: { ...current[stage.id], status: 'running', error: undefined },
    }));
    try {
      const result = await stage.run();
      const failed = stage.errorOf?.(result);
      setStates((current) => ({
        ...current,
        [stage.id]: {
          status: failed ? 'failed' : 'done',
          result,
          error: failed,
        },
      }));
      return !failed;
    } catch (err) {
      setStates((current) => ({
        ...current,
        [stage.id]: {
          ...current[stage.id],
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        },
      }));
      return false;
    }
  };

  const runRemaining = async (): Promise<void> => {
    setBusy(true);
    try {
      for (const stage of stages) {
        if (stage.writes || stage.blocked) continue;
        const status = stateOf(stage.id).status;
        if (status === 'done' || status === 'running') continue;
        const ok = await runOne(stage);
        if (!ok) break;
      }
    } finally {
      setBusy(false);
    }
  };

  const pending = stages.filter(
    (stage) =>
      !stage.writes &&
      !stage.blocked &&
      (stateOf(stage.id).status === 'idle' ||
        stateOf(stage.id).status === 'failed'),
  ).length;

  return (
    <>
      {chain ? (
        <section class="db-card db-wide db-stage-strip">
          <ol class="db-stages">
            {stages.map((stage) => {
              const status = stateOf(stage.id).status;
              return (
                <li key={stage.id} class={`db-stage db-stage--${status}`}>
                  <span class="db-stage-dot" aria-hidden="true" />
                  <b>{stage.title}</b>
                  <small>{STAGE_STATUS_LABEL[status]}</small>
                </li>
              );
            })}
          </ol>
          <div class="db-actions">
            <button
              type="button"
              class="db-btn db-btn--primary"
              disabled={busy || pending === 0}
              onClick={() => void runRemaining()}
            >
              {busy ? 'Running…' : pending === 0 ? 'Nothing left to run' : 'Run remaining'}
            </button>
          </div>
        </section>
      ) : null}

      {stages.map((stage) => {
        const state = stateOf(stage.id);
        const running = state.status === 'running';
        const rerun = (): void => {
          void runOne(stage);
        };
        return (
          <div key={stage.id}>
            <section class="db-card db-wide">
              <div class="db-card-head">
                <h2>{stage.title}</h2>
                {stage.badge ? <span class="db-badge">{stage.badge}</span> : null}
                {chain ? (
                  <span class={STAGE_STATUS_CLASS[state.status]}>
                    {STAGE_STATUS_LABEL[state.status]}
                  </span>
                ) : null}
              </div>
              {stage.hint ? <p class="db-note">{stage.hint}</p> : null}
              {stage.Controls?.()}
              <div class="db-actions">
                <button
                  type="button"
                  class="db-btn db-btn--primary"
                  disabled={running || busy || Boolean(stage.blocked)}
                  aria-busy={running}
                  title={stage.blocked ?? undefined}
                  onClick={() => void runOne(stage)}
                >
                  {running ? 'Running…' : state.status === 'done' ? 'Run again' : 'Run'}
                </button>
                {stage.blocked ? <span class="db-empty">{stage.blocked}</span> : null}
              </div>
            </section>

            {state.error ? (
              <div class="mhx-error" role="alert">
                {state.error}
              </div>
            ) : null}
            {state.result !== undefined ? stage.View({ result: state.result, rerun }) : null}
          </div>
        );
      })}
    </>
  );
}
