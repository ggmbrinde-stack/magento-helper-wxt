/**
 * Notion connection health — read-only pre-flight for the create-only writer.
 *
 * Runs entirely on read endpoints (GET database, POST /v1/databases/{id}/query)
 * plus a LOCAL write simulation: the exact `payloadToProperties` output is
 * checked against the live database schema. Nothing is created, updated or
 * deleted, so this is safe to run against production at any time. It answers the
 * four questions the auditor asks before a push: is the token there, are both
 * databases reachable, does the schema match the write contract, and would a
 * real payload be accepted.
 *
 * The static guard (scripts/check-notion-readonly.mjs) still governs the source:
 * no Notion write endpoint is referenced here.
 */

import {
  getDatabase,
  loadSettings,
  queryDatabase,
} from './notion';
import {
  listingErrorExists,
  NOTION_ERROR_TYPE_OPTIONS,
  payloadToProperties,
} from './listingWriter';
import { EM_DASH, type ListingErrorPayload } from './payload';
import { NOTION_WRITES_ENABLED } from './flags';

export type HealthStatus = 'ok' | 'warn' | 'fail';

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface DbPropertyInfo {
  name: string;
  type: string;
  options: string[];
}

export interface DbHealth {
  key: 'skuLibrary' | 'listingErrors';
  id: string;
  title: string;
  reachable: boolean;
  queryOk: boolean;
  sampleCount: number;
  propertyCount: number;
  properties: DbPropertyInfo[];
  /** Required properties the write contract needs but the DB lacks. */
  missing: string[];
  /** Type or select-option mismatches against the write contract. */
  mismatched: string[];
  error?: string;
}

export interface WriteSimulationRow {
  property: string;
  status: HealthStatus;
  detail: string;
}

export interface WriteSimulation {
  ran: boolean;
  ok: boolean;
  reason: string;
  rows: WriteSimulationRow[];
}

export interface NotionHealthReport {
  ok: boolean;
  generated: string;
  writesEnabled: boolean;
  token: { source: string; configured: boolean; shape: string };
  checks: HealthCheck[];
  skuLibrary: DbHealth;
  listingErrors: DbHealth;
  simulation: WriteSimulation;
}

/* ------------------------------------------------------------------------- */
/* Write contract (mirrors payloadToProperties + the dedup filter)            */
/* ------------------------------------------------------------------------- */

interface PropSpec {
  name: string;
  type: string;
  required: boolean;
  values?: string[];
}

const LISTING_ERRORS_SPEC: PropSpec[] = [
  { name: 'Error', type: 'title', required: true },
  {
    name: 'Error Group',
    type: 'multi_select',
    required: true,
    values: ['Images', 'Text / Translation', 'Product Information', 'Category', 'Other'],
  },
  {
    name: 'Error Type',
    type: 'multi_select',
    required: true,
    values: NOTION_ERROR_TYPE_OPTIONS,
  },
  { name: 'Error Flag', type: 'select', required: true, values: ['Normal', 'Complex'] },
  { name: 'Status', type: 'select', required: true, values: ['To Fix'] },
  { name: 'Notes', type: 'rich_text', required: true },
  { name: 'SKU', type: 'rich_text', required: true },
  { name: 'Source', type: 'select', required: true },
  { name: 'Language', type: 'select', required: true },
  { name: 'Priority', type: 'select', required: false, values: ['High', 'Medium', 'Low'] },
  {
    name: 'Fix Location',
    type: 'select',
    required: false,
    values: ['Configurable', 'Simple'],
  },
  { name: 'Link', type: 'url', required: false },
  { name: 'Fix', type: 'rich_text', required: false },
  { name: 'Category', type: 'select', required: false },
  { name: 'Subcategory', type: 'select', required: false },
  { name: 'Supplier', type: 'select', required: false },
  { name: 'Field', type: 'select', required: false },
];

const SKU_LIBRARY_SPEC: PropSpec[] = [
  { name: 'SKU', type: 'title', required: true },
  { name: 'Frontend', type: 'url', required: false },
  { name: 'Backend', type: 'url', required: false },
  { name: 'Category', type: 'select', required: false },
  { name: 'Subcategory', type: 'select', required: false },
  { name: 'Supplier', type: 'select', required: false },
  { name: 'Status', type: 'select', required: false },
];

/* ------------------------------------------------------------------------- */
/* Samples used for the local write simulation                                */
/* ------------------------------------------------------------------------- */

const SAMPLE_MINIMAL: ListingErrorPayload = {
  dedup_key: `DRYRUN|DRYRUN ${EM_DASH} Images ${EM_DASH} Duplicate image`,
  sku: 'DRYRUN',
  title: `DRYRUN ${EM_DASH} Images ${EM_DASH} Duplicate image`,
  group: 'Images',
  type: 'Duplicate image',
  fix_location: null,
  priority: null,
  status: 'To Fix',
  flag: 'Normal',
  link: null,
  notes: 'dry-run validation only — no page is created',
  fix: '',
  notes_full: '',
  source: 'Manual',
  supplier: '',
  category: null,
  subcategory: null,
  language: 'EN',
  field: null,
  page_content: '',
  review_flags: [],
};

const SAMPLE_FULL: ListingErrorPayload = {
  ...SAMPLE_MINIMAL,
  fix_location: 'Configurable',
  priority: 'High',
  link: 'https://example.invalid/dry-run',
  fix: 'dry-run fix',
  supplier: 'ROLY',
  category: 'Other',
  subcategory: 'T-shirts',
  field: 'name',
};

/* ------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* ------------------------------------------------------------------------- */

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const status = /(\d{3})/.exec(message)?.[1];
  if (status === '401') return 'Unauthorized (401) — token invalid or revoked';
  if (status === '403') return 'Forbidden (403) — integration lacks access';
  if (status === '404')
    return 'Not found (404) — wrong id, or the database is not shared with the integration';
  return message.slice(0, 200);
}

function tokenInfo(token: string): { configured: boolean; shape: string; recognized: boolean } {
  if (!token) return { configured: false, shape: 'not configured', recognized: false };
  if (token.startsWith('ntn_')) {
    return { configured: true, shape: `ntn_ integration token · ${token.length} chars`, recognized: true };
  }
  if (token.startsWith('secret_')) {
    return { configured: true, shape: `secret_ internal token · ${token.length} chars`, recognized: true };
  }
  return { configured: true, shape: `unrecognized prefix · ${token.length} chars`, recognized: false };
}

function dbTitle(raw: unknown): string {
  const title = (raw as { title?: unknown }).title;
  if (!Array.isArray(title)) return '';
  return title
    .map((t) => (t as { plain_text?: string }).plain_text ?? '')
    .join('');
}

function optionNames(v: Record<string, unknown>, type: string): string[] {
  const bag = v[type] as { options?: unknown } | undefined;
  if (!Array.isArray(bag?.options)) return [];
  return bag.options
    .map((o) => (o as { name?: string }).name)
    .filter((n): n is string => typeof n === 'string');
}

function parseProperties(raw: unknown): DbPropertyInfo[] {
  const props = (raw as { properties?: Record<string, unknown> }).properties;
  if (!props) return [];
  return Object.entries(props).map(([name, value]) => {
    const v = (value ?? {}) as Record<string, unknown>;
    const type = typeof v.type === 'string' ? v.type : 'unknown';
    return { name, type, options: optionNames(v, type) };
  });
}

function compareSchema(
  spec: PropSpec[],
  props: DbPropertyInfo[],
): { missing: string[]; mismatched: string[] } {
  const missing: string[] = [];
  const mismatched: string[] = [];
  const byName = new Map(props.map((p) => [p.name, p]));
  for (const s of spec) {
    const prop = byName.get(s.name);
    if (!prop) {
      if (s.required) missing.push(s.name);
      continue;
    }
    if (prop.type !== s.type) {
      mismatched.push(`${s.name}: expected ${s.type}, DB has ${prop.type}`);
      continue;
    }
    if (s.values && prop.options.length > 0) {
      const absent = s.values.filter((v) => !prop.options.includes(v));
      if (absent.length > 0) {
        mismatched.push(`${s.name}: missing option(s) ${absent.join(', ')}`);
      }
    }
  }
  return { missing, mismatched };
}

function classifyValue(value: unknown): { type: string; values: string[] } {
  const v = (value ?? {}) as Record<string, unknown>;
  if ('title' in v) return { type: 'title', values: [] };
  if ('rich_text' in v) return { type: 'rich_text', values: [] };
  if ('select' in v) {
    const sel = v.select as { name?: string } | null | undefined;
    return { type: 'select', values: sel?.name ? [sel.name] : [] };
  }
  if ('multi_select' in v) {
    const arr = Array.isArray(v.multi_select) ? v.multi_select : [];
    return {
      type: 'multi_select',
      values: arr
        .map((s) => (s as { name?: string }).name)
        .filter((n): n is string => typeof n === 'string'),
    };
  }
  if ('url' in v) return { type: 'url', values: [] };
  return { type: 'unknown', values: [] };
}

function validateProperty(
  name: string,
  value: unknown,
  byName: Map<string, DbPropertyInfo>,
  required: boolean,
): WriteSimulationRow {
  const prop = byName.get(name);
  if (!prop) {
    return {
      property: name,
      status: required ? 'fail' : 'warn',
      detail: required
        ? 'required property missing in DB'
        : 'optional property not present in DB (payload would fail if set)',
    };
  }
  const cls = classifyValue(value);
  if (prop.type !== cls.type) {
    return {
      property: name,
      status: 'fail',
      detail: `DB type ${prop.type}, payload ${cls.type}`,
    };
  }
  if (cls.values.length > 0 && prop.options.length > 0) {
    const absent = cls.values.filter((v) => !prop.options.includes(v));
    if (absent.length > 0) {
      return {
        property: name,
        status: 'fail',
        detail: `value(s) not in options: ${absent.join(', ')}`,
      };
    }
    return { property: name, status: 'ok', detail: cls.values.join(', ') };
  }
  return { property: name, status: 'ok', detail: prop.type };
}

/* ------------------------------------------------------------------------- */
/* Inspect one database                                                       */
/* ------------------------------------------------------------------------- */

async function inspectDb(
  token: string,
  id: string,
  spec: PropSpec[],
  key: DbHealth['key'],
): Promise<DbHealth> {
  const health: DbHealth = {
    key,
    id,
    title: '',
    reachable: false,
    queryOk: false,
    sampleCount: 0,
    propertyCount: 0,
    properties: [],
    missing: [],
    mismatched: [],
  };
  if (!token) {
    health.error = 'No Notion token configured';
    return health;
  }
  try {
    const raw = await getDatabase(token, id);
    const props = parseProperties(raw);
    health.reachable = true;
    health.title = dbTitle(raw);
    health.properties = props;
    health.propertyCount = props.length;
    const cmp = compareSchema(spec, props);
    health.missing = cmp.missing;
    health.mismatched = cmp.mismatched;
  } catch (err) {
    health.error = friendlyError(err);
    return health;
  }
  try {
    const rows = await queryDatabase(token, id, undefined, 3);
    health.queryOk = true;
    health.sampleCount = rows.length;
  } catch (err) {
    health.error = friendlyError(err);
  }
  return health;
}

/* ------------------------------------------------------------------------- */
/* Checks                                                                     */
/* ------------------------------------------------------------------------- */

function tokenCheck(token: string): HealthCheck {
  const info = tokenInfo(token);
  if (!info.configured) {
    return {
      id: 'token',
      label: 'Notion token',
      status: 'fail',
      detail: 'missing — set it in Settings',
    };
  }
  if (!info.recognized) {
    return {
      id: 'token',
      label: 'Notion token',
      status: 'warn',
      detail: `${info.shape} (expected ntn_ or secret_)`,
    };
  }
  return { id: 'token', label: 'Notion token', status: 'ok', detail: info.shape };
}

function reachCheck(id: string, label: string, db: DbHealth): HealthCheck {
  if (!db.reachable) {
    return { id, label, status: 'fail', detail: db.error ?? 'unreachable' };
  }
  if (!db.queryOk) {
    return {
      id,
      label,
      status: 'warn',
      detail: `schema read OK, but query failed — ${db.error ?? 'unknown error'}`,
    };
  }
  return {
    id,
    label,
    status: 'ok',
    detail: `${db.propertyCount} properties · query returned ${db.sampleCount} row(s)`,
  };
}

function schemaCheck(id: string, label: string, db: DbHealth): HealthCheck {
  if (!db.reachable) {
    return { id, label, status: 'warn', detail: 'skipped — database unreachable' };
  }
  if (db.missing.length > 0) {
    return {
      id,
      label,
      status: 'fail',
      detail: `missing required property: ${db.missing.join(', ')}`,
    };
  }
  if (db.mismatched.length > 0) {
    return { id, label, status: 'fail', detail: db.mismatched.join(' · ') };
  }
  return { id, label, status: 'ok', detail: 'all contract properties present and typed' };
}

async function dedupCheck(
  token: string,
  dbId: string,
  db: DbHealth,
): Promise<HealthCheck> {
  const check: HealthCheck = {
    id: 'dedup',
    label: 'Dedup query (SKU + Error title)',
    status: 'warn',
    detail: 'skipped — database unreachable',
  };
  if (!token) {
    check.detail = 'skipped — no token';
    return check;
  }
  if (!db.reachable) return check;
  try {
    const exists = await listingErrorExists(
      token,
      dbId,
      'DRYRUN-NONEXISTENT',
      SAMPLE_MINIMAL.title,
    );
    if (exists) {
      return {
        ...check,
        status: 'warn',
        detail: 'an unexpected DRYRUN row already exists (dedup would skip)',
      };
    }
    return { ...check, status: 'ok', detail: 'filter accepted; no DRYRUN row (expected)' };
  } catch (err) {
    return { ...check, status: 'fail', detail: friendlyError(err) };
  }
}

function simulate(listingErrors: DbHealth): WriteSimulation {
  if (!listingErrors.reachable) {
    return {
      ran: false,
      ok: false,
      reason: 'Listing Errors DB unreachable — simulation skipped',
      rows: [],
    };
  }
  const byName = new Map(listingErrors.properties.map((p) => [p.name, p]));
  const rows: WriteSimulationRow[] = [];
  const minimal = payloadToProperties(SAMPLE_MINIMAL);
  for (const [name, value] of Object.entries(minimal)) {
    rows.push(validateProperty(name, value, byName, true));
  }
  const full = payloadToProperties(SAMPLE_FULL);
  for (const [name, value] of Object.entries(full)) {
    if (name in minimal) continue;
    rows.push(validateProperty(name, value, byName, false));
  }
  const ok = rows.every((row) => row.status !== 'fail');
  return {
    ran: true,
    ok,
    reason: ok
      ? 'a minimal and a full payload both map cleanly onto the live schema'
      : 'at least one property would be rejected by Notion',
    rows,
  };
}

function simulationCheck(simulation: WriteSimulation): HealthCheck {
  if (!simulation.ran) {
    return {
      id: 'simulation',
      label: 'Write simulation (local, no page created)',
      status: 'warn',
      detail: simulation.reason,
    };
  }
  return {
    id: 'simulation',
    label: 'Write simulation (local, no page created)',
    status: simulation.ok ? 'ok' : 'fail',
    detail: simulation.reason,
  };
}

/* ------------------------------------------------------------------------- */
/* Entry point                                                                */
/* ------------------------------------------------------------------------- */

export async function notionHealth(): Promise<NotionHealthReport> {
  const settings = await loadSettings();
  const token = settings.notionToken;

  const skuLibrary = await inspectDb(
    token,
    settings.skuLibraryDb,
    SKU_LIBRARY_SPEC,
    'skuLibrary',
  );
  const listingErrors = await inspectDb(
    token,
    settings.listingErrorsDb,
    LISTING_ERRORS_SPEC,
    'listingErrors',
  );
  const simulation = simulate(listingErrors);
  const dedup = await dedupCheck(token, settings.listingErrorsDb, listingErrors);

  const checks: HealthCheck[] = [
    tokenCheck(token),
    {
      id: 'writes',
      label: 'Notion writes flag',
      status: NOTION_WRITES_ENABLED ? 'ok' : 'warn',
      detail: NOTION_WRITES_ENABLED
        ? 'NOTION_WRITES_ENABLED = true (create-only)'
        : 'NOTION_WRITES_ENABLED = false (reader mode)',
    },
    reachCheck('sku-reach', 'SKU Library reachable', skuLibrary),
    schemaCheck('sku-schema', 'SKU Library schema', skuLibrary),
    reachCheck('err-reach', 'Listing Errors reachable', listingErrors),
    schemaCheck('err-schema', 'Listing Errors schema', listingErrors),
    dedup,
    simulationCheck(simulation),
  ];

  const info = tokenInfo(token);
  return {
    ok: checks.every((c) => c.status !== 'fail'),
    generated: new Date().toISOString(),
    writesEnabled: NOTION_WRITES_ENABLED,
    token: {
      source: 'chrome.storage.local → notionToken',
      configured: info.configured,
      shape: info.shape,
    },
    checks,
    skuLibrary,
    listingErrors,
    simulation,
  };
}
