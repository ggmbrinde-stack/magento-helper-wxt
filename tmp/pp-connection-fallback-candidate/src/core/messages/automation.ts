/**
 * Lane C — automation contracts.
 *
 * The batch pipeline (paste SKUs -> audited, pushed) and the local model bridge
 * that feeds the model-sort stage.
 *
 * This lane consumes audit results and audit writers; it never re-implements an
 * audit rule. It may import types from `audit.ts`, never from `ui.ts`.
 */

import type { BatchJob, BatchOptions } from '../../automation';
import type { ListingPreflight, PushReport } from '../../audit';
import type { LibraryPreview, LibraryReport } from '../../audit';
import type { BridgeCatalog, BridgeHealth, ModelBridgeConfig } from '../../automation';

/* ------------------------------------------------------------------------- */
/* Batch runner: paste SKUs -> full browser pipeline                          */
/* ------------------------------------------------------------------------- */

/** Start a new batch. Accepts either a raw pasted list or pre-parsed SKUs. */
export interface BatchStartRequest {
  type: 'BATCH_START';
  /** Raw paste; parsed + deduped in the background. */
  input?: string;
  /** Already-parsed SKUs (used when the UI validated them locally). */
  skus?: string[];
  /** Unsupported tokens to surface back to the caller. */
  invalid?: string[];
  options?: Partial<BatchOptions>;
}

export interface BatchStartResponse {
  ok: boolean;
  job?: BatchJob;
  invalid?: string[];
  error?: string;
}

/** Pause / resume / cancel the current batch. */
export interface BatchControlRequest {
  type: 'BATCH_PAUSE' | 'BATCH_RESUME' | 'BATCH_CANCEL' | 'BATCH_CLEAR';
}

export interface BatchControlResponse {
  ok: boolean;
  job?: BatchJob | null;
  error?: string;
}

/** Read the persisted job (used on mount and as a fallback to storage events). */
export interface BatchStateRequest {
  type: 'BATCH_STATE';
}

export interface BatchStateResponse {
  ok: boolean;
  job?: BatchJob | null;
  payloadCount: number;
  error?: string;
}

/**
 * Review-then-push: one confirm for the whole batch. With `confirm: false` it
 * returns the combined payload list + contract warnings and writes nothing.
 */
export interface BatchPushRequest {
  type: 'BATCH_PUSH';
  confirm: boolean;
  /** Create Listing Errors rows (create-only). Default true. */
  listingErrors?: boolean;
  /** Create/update SKU Library rows (whitelisted cells). Default false. */
  library?: boolean;
}

export interface BatchPushPreview {
  listingErrors: ListingPreflight;
  library: {
    total: number;
    rows: LibraryPreview[];
    errors: number;
  };
  health?: { ok: boolean; error?: string };
}

export interface BatchPushResponse {
  ok: boolean;
  dryRun?: boolean;
  payloadCount?: number;
  warnings?: string[];
  report?: PushReport;
  libraryReport?: LibraryReport;
  preview?: BatchPushPreview;
  error?: string;
}

/* ------------------------------------------------------------------------- */
/* Model bridge (local `opencode serve`) for the model-sort stage             */
/* ------------------------------------------------------------------------- */

/** Read the saved bridge config, probe the server and list its models. */
export interface ModelBridgeStatusRequest {
  type: 'MODEL_BRIDGE_STATUS';
}

export interface ModelBridgeStatusResponse {
  ok: boolean;
  config?: ModelBridgeConfig;
  health?: BridgeHealth;
  catalog?: BridgeCatalog;
  error?: string;
}

/** Persist the bridge config, then re-probe so the UI reflects reality. */
export interface ModelBridgeSaveRequest {
  type: 'MODEL_BRIDGE_SAVE';
  config: ModelBridgeConfig;
}

export interface ModelBridgeSaveResponse extends ModelBridgeStatusResponse {}
