/**
 * Automation lane — public API.
 *
 * The automation lane owns the *moves*: the batch job model and pump, the
 * mirror tidy pass, the manifest, and the model bridge (vision sort).
 *
 * Callers import from THIS file only; a deep import into the lane is rejected
 * by `npm run check:lanes`. The lane reads `src/shared/**` freely and reaches
 * the audit lane through `src/audit` (its barrel), because a push needs the
 * writers.
 */

export * from './batch';
export * from './batchRunner';
export * from './mirrorManifest';
export * from './mirrorTidy';
export * from './modelBridge';
export * from './modelFindings';
export * from './modelSort';
