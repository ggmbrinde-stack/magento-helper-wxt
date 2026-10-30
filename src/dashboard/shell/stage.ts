import type { ComponentChildren } from 'preact';

/**
 * One audit step, defined once and rendered by whichever host is showing it.
 *
 * A standalone tab passes `[stage]`; the full-error audit passes the whole
 * chain. The stage itself never knows the difference, which is what stops the
 * same logic existing twice (the reason `Batch.tsx` and the single tabs drifted
 * apart in the first place).
 */

export type StageId = 'resolve' | 'images' | 'text' | 'errors' | 'push';

export type StageStatus = 'idle' | 'running' | 'done' | 'failed' | 'skipped';

export interface StageState<O = unknown> {
  status: StageStatus;
  result?: O;
  error?: string;
}

export interface Stage<O = unknown> {
  id: StageId;
  title: string;
  /** One line under the title explaining what the step reads. */
  hint?: string;
  /** Static label shown next to the title, e.g. "mechanical checks only". */
  badge?: string;
  /** Stages whose output this step consumes - drives skip/rerun logic. */
  needs?: StageId[];
  /** Why the step cannot run right now (no SKU, no languages, …). */
  blocked?: string;
  /** Writes to an external system: never auto-run as part of "run remaining". */
  writes?: boolean;
  run(): Promise<O>;
  /** A result that failed but is still worth rendering (partial data). */
  errorOf?(result: O): string | undefined;
  /** Stage-specific inputs. The host supplies the card and the Run button. */
  Controls?(): ComponentChildren;
  View(props: { result: O; rerun: () => void }): ComponentChildren;
}

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  idle: 'not run',
  running: 'running…',
  done: 'done',
  failed: 'failed',
  skipped: 'skipped',
};

export const STAGE_STATUS_CLASS: Record<StageStatus, string> = {
  idle: 'db-badge',
  running: 'db-badge db-warn',
  done: 'db-badge db-ok',
  failed: 'db-badge db-bad',
  skipped: 'db-badge',
};
