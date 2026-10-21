/**
 * Magento links — child IDs -> admin edit URLs (fully offline).
 *
 * Faithful port of the audit pipeline's `scripts/magento-links.ps1`
 * (schema `bog-magento/1`). Reads a `ResolverJson` and builds UNKEYED admin
 * URLs — no Magento login, no browser, no network. `/key/.../` tokens are never
 * added. Every table is validated 1:1 against the resolver's index (child-ID
 * order varies per SKU — never trust arithmetic).
 */

import { COLOR_ATTR_ID, SIZE_ATTR_ID, type ResolverJson } from './resolver';

export const MAGENTO_SCHEMA = 'bog-magento/1';

/** Locked admin base (the secret `/key/` segment is appended by Magento on open). */
export const DEFAULT_ADMIN_BASE = 'https://bestofgifts.pt/admin_L2pZx';

/** Store-view code -> admin `/store/<id>/` suffix (All = no suffix). */
export const SCOPE_STORE_IDS: Record<string, string> = {
  all: '',
  en: '2',
  es: '4',
  fr: '5',
};

export interface MagentoRow {
  child: string;
  color: string;
  size: string;
  url: string;
}

export interface MagentoBuild {
  isSimple: boolean;
  confId: string;
  simpleId: string;
  frontend: string;
  childCount: number;
  urlCount: number;
  rows: MagentoRow[];
  groupOrder: string[];
  groups: Record<string, MagentoRow[]>;
  parentUrls: Record<string, string>;
  configurableUrl: string;
  anomalies: string[];
}

function editUrl(adminBase: string, id: string, storeId: string): string {
  const suffix = storeId ? `store/${storeId}/` : '';
  return `${adminBase}/catalog/product/edit/id/${id}/${suffix}`;
}

/**
 * Build the URL table from a resolver payload and validate it 1:1 against the
 * index. `confId`/`simpleId` may be missing for a malformed resolver — the
 * anomalies list records it instead of throwing.
 */
export function buildMagentoTable(
  r: ResolverJson,
  adminBase: string = DEFAULT_ADMIN_BASE,
): MagentoBuild {
  const anomalies: string[] = [];
  const isSimple = r.product_type === 'simple';
  const frontend = r.frontend_url;

  if (isSimple) {
    let sid = r.simple_product_id === null ? '' : String(r.simple_product_id);
    if (!sid && r.children.length > 0) sid = r.children[0] ?? '';
    if (!sid) anomalies.push('simple product without simple_product_id/children in resolver.json');

    const rows: MagentoRow[] = [];
    const groupOrder: string[] = [];
    const groups: Record<string, MagentoRow[]> = {};
    const parentUrls: Record<string, string> = {};
    let configurableUrl = '';
    if (sid) {
      const row: MagentoRow = {
        child: sid,
        color: '(simple)',
        size: '-',
        url: editUrl(adminBase, sid, ''),
      };
      rows.push(row);
      groupOrder.push('(simple)');
      groups['(simple)'] = [row];
      for (const [scope, storeId] of Object.entries(SCOPE_STORE_IDS)) {
        parentUrls[scope] = editUrl(adminBase, sid, storeId);
      }
      configurableUrl = editUrl(adminBase, sid, '');
    }
    return {
      isSimple: true,
      confId: '',
      simpleId: sid,
      frontend,
      childCount: r.children.length,
      urlCount: rows.length,
      rows,
      groupOrder,
      groups,
      parentUrls,
      configurableUrl,
      anomalies,
    };
  }

  const conf = r.configurable_id === null ? '' : String(r.configurable_id);
  const a93 = r.attributes['93'];
  const a142 = r.attributes['142'];
  const idx = r.index;

  if (!conf) anomalies.push('configurable_id missing in resolver.json');
  if (a93 === null) anomalies.push('attributes.93 (colors) missing in resolver.json');
  if (a142 === null) anomalies.push('attributes.142 (sizes) missing in resolver.json');

  const cMap: Record<string, string> = {};
  for (const o of a93?.options ?? []) cMap[o.id] = o.label;
  const sMap: Record<string, string> = {};
  for (const o of a142?.options ?? []) sMap[o.id] = o.label;

  const rows: MagentoRow[] = [];
  const groupOrder: string[] = [];
  const groups: Record<string, MagentoRow[]> = {};
  for (const kid of Object.keys(idx)) {
    const entry = idx[kid] ?? {};
    const cid = entry[COLOR_ATTR_ID] ?? '';
    const sid = entry[SIZE_ATTR_ID] ?? '';
    let clabel = cid in cMap ? cMap[cid] : null;
    let slabel = sid in sMap ? sMap[sid] : null;
    if (!clabel) {
      anomalies.push(`child ${kid} has unknown color id ${cid}`);
      clabel = '?';
    }
    if (!slabel) {
      anomalies.push(`child ${kid} has unknown size id ${sid}`);
      slabel = '?';
    }
    const row: MagentoRow = {
      child: kid,
      color: clabel,
      size: slabel,
      url: editUrl(adminBase, kid, ''),
    };
    rows.push(row);
    const list = groups[clabel] ?? (groups[clabel] = []);
    if (!groupOrder.includes(clabel)) groupOrder.push(clabel);
    list.push(row);
  }
  if (rows.length !== r.children.length) {
    anomalies.push(`index rows ${rows.length} != children ${r.children.length}`);
  }

  // Missing/extra check: index rows and children[] must match 1:1.
  const idxSet = new Set(Object.keys(idx));
  const kidSet = new Set(r.children);
  for (const k of idxSet) {
    if (!kidSet.has(k)) anomalies.push(`child ${k} in index but missing from children[]`);
  }
  for (const k of kidSet) {
    if (!idxSet.has(k)) anomalies.push(`child ${k} in children[] missing from index`);
  }

  const parentUrls: Record<string, string> = {};
  for (const [scope, storeId] of Object.entries(SCOPE_STORE_IDS)) {
    parentUrls[scope] = editUrl(adminBase, conf, storeId);
  }

  return {
    isSimple: false,
    confId: conf,
    simpleId: '',
    frontend,
    childCount: r.children.length,
    urlCount: rows.length,
    rows,
    groupOrder,
    groups,
    parentUrls,
    configurableUrl: editUrl(adminBase, conf, ''),
    anomalies,
  };
}
