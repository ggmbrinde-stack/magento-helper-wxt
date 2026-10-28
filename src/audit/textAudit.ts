/**
 * Text audit - pure port of the audit pipeline's `scripts/text-matrix.ps1`
 * (schema `bog-text-matrix/1`).
 *
 * Extracts the EN/ES/FR PDP fields (name, h1, short/long description, spec
 * table, JSON-LD brand/description, html lang) and runs the mechanical checks:
 * untranslated name/short/long description, gender canonical sets + cross-
 * language agreement + name gender tokens, composition structure and wrong-
 * language words (records/material-rules), JSON-LD brand vs displayed Brand,
 * ES "Gorro", recycled omission, dimensions brackets and bare-gram grammage.
 *
 * Rules are bundled copies of the audit workspace's generated JSON:
 *   records/gender-rules/gender-rules.json
 *   records/material-rules/composition-rules.json
 *
 * Never decides severity or rewrites a value: every finding carries the exact
 * Fix text the script produced, and anomalies stay in `review_flags`.
 *
 * Parity note: `Get-MetaContent` in the script writes
 * `@('<a>' + $p + '<b>', '<c>' + $p + '<d>')`. In PowerShell the comma binds
 * tighter than `+`, so that array collapses into one string and `short_desc`
 * is always empty. This port follows the documented intent and actually reads
 * `og:description` (which also surfaces ES "Gorro" in short descriptions).
 * Every other matrix field, finding and flag is byte-identical to the script
 * on the evidence corpus.
 */

import genderRulesJson from './rules/gender-rules.json';
import compositionRulesJson from './rules/composition-rules.json';

export const TEXT_MATRIX_SCHEMA = 'bog-text-matrix/1';

export type TextLang = 'EN' | 'ES' | 'FR';
export const TEXT_LANGS: TextLang[] = ['EN', 'ES', 'FR'];

type LowerLang = 'en' | 'es' | 'fr';
type RuleLang = 'pt' | 'es' | 'fr' | 'en';

export interface PdpFields {
  name: string;
  h1: string;
  short_desc: string;
  long_desc: string;
  /** Declared by the script but never assigned; kept for parity. */
  long_desc_raw: string;
  jsonld_brand: string;
  jsonld_desc: string;
  html_lang: string;
  /** Insertion-ordered spec table (first header wins). */
  specs: Record<string, string>;
}

export type LangMap = Partial<Record<TextLang, PdpFields>>;

export interface TextFinding {
  sku: string;
  field: string;
  finding: string;
  notes: string;
  priority_hint: string;
}

export interface TextCheckResult {
  findings: TextFinding[];
  flags: string[];
}

export interface TextMatrixValue {
  en: string;
  es: string;
  fr: string;
}

export interface TextMatrixSpecRow {
  field: string;
  en: string;
  es: string;
  fr: string;
}

export interface TextMatrix {
  name: TextMatrixValue;
  h1: TextMatrixValue;
  short_desc: TextMatrixValue;
  long_desc: TextMatrixValue;
  specs: TextMatrixSpecRow[];
}

export interface TextAuditResult {
  schema: typeof TEXT_MATRIX_SCHEMA;
  generated: string;
  sku: string;
  ok: boolean;
  verdict: 'ok' | 'blocked';
  langs: TextLang[];
  matrix: TextMatrix | null;
  findings: TextFinding[];
  review_flags: string[];
  /** `<!-- text-audit:begin -->` block, ready to paste into Push errors. */
  mdBlock: string;
}

export interface GenderRuleConcept {
  concept: string;
  pt?: string;
  es?: string;
  fr?: string;
  en?: string;
  [lang: string]: string | undefined;
}

export interface GenderRuleAlias {
  admin: string;
  concept: string;
  pt?: string;
  es?: string;
  fr?: string;
  en?: string;
  [lang: string]: string | undefined;
}

export interface GenderRules {
  schema?: string;
  concepts: GenderRuleConcept[];
  aliases: GenderRuleAlias[];
  canonical: Partial<Record<string, string[]>>;
}

export interface CompositionRuleRow {
  pt?: string;
  es?: string;
  fr?: string;
  en?: string;
  fold: Partial<Record<RuleLang, string>>;
}

export interface CompositionRules {
  schema?: string;
  rows: CompositionRuleRow[];
}

export const GENDER_RULES = genderRulesJson as unknown as GenderRules;
export const COMPOSITION_RULES = compositionRulesJson as unknown as CompositionRules;

/* ------------------------------------------------------------------------- */
/* HTML extraction                                                            */
/* ------------------------------------------------------------------------- */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  laquo: '\u00ab',
  raquo: '\u00bb',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  deg: '\u00b0',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  middot: '\u00b7',
  bull: '\u2022',
  times: '\u00d7',
  divide: '\u00f7',
  plusmn: '\u00b1',
  frac12: '\u00bd',
  frac14: '\u00bc',
  frac34: '\u00be',
  sup2: '\u00b2',
  sup3: '\u00b3',
  micro: '\u00b5',
  aacute: '\u00e1',
  agrave: '\u00e0',
  acirc: '\u00e2',
  atilde: '\u00e3',
  auml: '\u00e4',
  aring: '\u00e5',
  aelig: '\u00e6',
  ccedil: '\u00e7',
  eacute: '\u00e9',
  egrave: '\u00e8',
  ecirc: '\u00ea',
  euml: '\u00eb',
  iacute: '\u00ed',
  igrave: '\u00ec',
  icirc: '\u00ee',
  iuml: '\u00ef',
  ntilde: '\u00f1',
  oacute: '\u00f3',
  ograve: '\u00f2',
  ocirc: '\u00f4',
  otilde: '\u00f5',
  ouml: '\u00f6',
  oslash: '\u00f8',
  uacute: '\u00fa',
  ugrave: '\u00f9',
  ucirc: '\u00fb',
  uuml: '\u00fc',
  yacute: '\u00fd',
  yuml: '\u00ff',
  szlig: '\u00df',
};

function htmlDecode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (m, name: string) =>
      NAMED_ENTITIES[name.toLowerCase()] ?? m,
    );
}

export function htmlToText(s: string | null | undefined): string {
  if (s == null) return '';
  const t = s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return htmlDecode(t).replace(/\s+/g, ' ').trim();
}

export function getMetaContent(html: string, property: string): string {
  const p = escapeRegExp(property);
  const patterns = [
    `<meta[^>]+property="${p}"[^>]+content="([^"]*)"`,
    `<meta[^>]+content="([^"]*)"[^>]+property="${p}"`,
  ];
  for (const rx of patterns) {
    const m = new RegExp(rx, 'i').exec(html);
    if (m) return htmlDecode(m[1] ?? '').trim();
  }
  return '';
}

export function getPdpFields(html: string): PdpFields {
  const f: PdpFields = {
    name: '',
    h1: '',
    short_desc: '',
    long_desc: '',
    long_desc_raw: '',
    jsonld_brand: '',
    jsonld_desc: '',
    html_lang: '',
    specs: {},
  };
  f.name = getMetaContent(html, 'og:title');
  if (!f.name) {
    const mt = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (mt) f.name = htmlToText(mt[1] ?? '');
  }
  f.short_desc = getMetaContent(html, 'og:description');

  let m = /data-ui-id="page-title-wrapper"[^>]*>([\s\S]*?)<\/span>/i.exec(html);
  if (m) f.h1 = htmlToText(m[1] ?? '');

  m = /id="description"[^>]*>([\s\S]*?)<div class="data item title"/i.exec(html);
  if (!m) {
    m = /class="product attribute description"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(html);
  }
  if (m) {
    let d = htmlToText(m[1] ?? '');
    if (d.length > 600) d = d.slice(0, 600);
    f.long_desc = d;
  }

  m = /"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i.exec(html);
  f.jsonld_brand = m ? (m[1] ?? '').trim() : '';

  m = /"description"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(html);
  if (m) {
    const raw = m[1] ?? '';
    f.jsonld_desc = jsonUnescape(htmlDecode(raw));
  }

  m = /<html[^>]*\blang="([^"]+)"/i.exec(html);
  f.html_lang = m ? (m[1] ?? '').trim().toLowerCase() : '';

  m = /product-attribute-specs-table">([\s\S]*?)<\/table>/i.exec(html);
  if (m) {
    const body = m[1] ?? '';
    for (const row of body.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
      const k = htmlToText(row[1] ?? '');
      const v = htmlToText(row[2] ?? '');
      if (k && !Object.prototype.hasOwnProperty.call(f.specs, k)) f.specs[k] = v;
    }
  }
  return f;
}

/* ------------------------------------------------------------------------- */
/* text helpers                                                               */
/* ------------------------------------------------------------------------- */

export function removeDiacritics(s: string | null | undefined): string {
  if (s == null || s === '') return '';
  return s.normalize('NFD').replace(/\p{Mn}/gu, '');
}

function jsonUnescape(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_m, esc: string) => {
    if (esc.length === 5 && esc[0] === 'u') {
      return String.fromCharCode(parseInt(esc.slice(1), 16));
    }
    switch (esc) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'f':
        return '\f';
      case 'b':
        return '\b';
      case 'v':
        return '\v';
      case '0':
        return '\0';
      default:
        return esc;
    }
  });
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Folded-term hit test: phrases via substring, single words via \b. <3 chars ignored. */
export function testTermHit(foldedCell: string, foldedTerm: string): boolean {
  if (!foldedTerm || foldedTerm.length < 3) return false;
  if (/[^a-z0-9]/.test(foldedTerm)) return foldedCell.includes(foldedTerm);
  return new RegExp(`\\b${escapeRegExp(foldedTerm)}\\b`).test(foldedCell);
}

/** Diacritic-tolerant regex from a folded phrase. */
export function foldedPattern(folded: string): string {
  const map: Record<string, string> = {
    a: '[a\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5]',
    e: '[e\u00e8\u00e9\u00ea\u00eb]',
    i: '[i\u00ec\u00ed\u00ee\u00ef]',
    o: '[o\u00f2\u00f3\u00f4\u00f5\u00f6]',
    u: '[u\u00f9\u00fa\u00fb\u00fc]',
    c: '[c\u00e7]',
    n: '[n\u00f1]',
  };
  let out = '';
  for (const ch of folded) {
    const mapped = map[ch];
    if (mapped) out += mapped;
    else if (ch === ' ') out += '\\s+';
    else out += escapeRegExp(ch);
  }
  return out;
}

/** First spec value whose (folded) header matches one of `names` (key order wins). */
export function getSpecValue(specs: Record<string, string>, names: string[]): string {
  const folded = names.map((n) => removeDiacritics(n.toLowerCase()));
  for (const k of Object.keys(specs)) {
    const kf = removeDiacritics(k.toLowerCase());
    for (let i = 0; i < names.length; i++) {
      if (kf === folded[i] || kf === (names[i] ?? '').toLowerCase()) {
        return specs[k] ?? '';
      }
    }
  }
  return '';
}

function countChar(s: string, c: string): number {
  return s.split(c).length - 1;
}

/* ------------------------------------------------------------------------- */
/* composition repair + structure                                             */
/* ------------------------------------------------------------------------- */

export interface CompositionRepair {
  text: string;
  human: string[];
  replacements: number;
  residual: string[];
  invariantOk: boolean;
}

/**
 * Swap every wrong-language canonical term with the cell language's equivalent
 * (word boundaries for single words, substring for phrases, case preserved).
 * Approved own-language phrases are shielded with \x01N\x01 placeholders.
 */
export function repairCompositionCell(
  cell: string,
  ruleRows: CompositionRuleRow[],
  lc: LowerLang,
): CompositionRepair {
  const human: string[] = [];
  let replacements = 0;
  let tmp = cell;
  const slots: string[] = [];
  const low = removeDiacritics(cell.toLowerCase());

  for (const r0 of ruleRows) {
    const op0 = String(r0.fold[lc] ?? '');
    if (!op0 || !/[^a-z0-9]/.test(op0)) continue;
    if (!low.includes(op0)) continue;
    const m = new RegExp(foldedPattern(op0), 'i').exec(tmp);
    if (m) {
      slots.push(m[0]);
      const ph = `\x01${slots.length}\x01`;
      tmp = tmp.slice(0, m.index) + ph + tmp.slice(m.index + m[0].length);
    }
  }

  const pairs: {
    own: string;
    oc: RuleLang;
    cand: string;
    len: number;
  }[] = [];
  for (const r of ruleRows) {
    const ownRaw = String(r[lc] ?? '');
    for (const oc of ['pt', 'es', 'fr', 'en'] as RuleLang[]) {
      if (oc === lc) continue;
      const candRaw = String(r[oc] ?? '');
      if (!candRaw) continue;
      pairs.push({ own: ownRaw, oc, cand: candRaw, len: candRaw.length });
    }
  }
  pairs.sort((a, b) => b.len - a.len);

  for (const p of pairs) {
    const ownRaw = p.own;
    const candRaw = p.cand;
    const pat = /[^a-zA-Z0-9]/.test(candRaw)
      ? escapeRegExp(candRaw)
      : `\\b${escapeRegExp(candRaw)}\\b`;
    if (!new RegExp(pat, 'i').test(tmp)) continue;
    if (!ownRaw) {
      if (!human.includes(candRaw)) human.push(candRaw);
      continue;
    }
    const base = ownRaw.toLowerCase();
    const newTmp = tmp.replace(new RegExp(pat, 'gi'), (o) => {
      if (o === o.toUpperCase() && /[A-Z\u00c0-\u00dd]/.test(o)) {
        return ownRaw.toUpperCase();
      }
      if (/^\p{Lu}/u.test(o)) return base.charAt(0).toUpperCase() + base.slice(1);
      return base;
    });
    if (newTmp !== tmp) replacements++;
    tmp = newTmp;
  }

  const residual: string[] = [];
  const tmpFold = removeDiacritics(tmp.toLowerCase());
  for (const r of ruleRows) {
    const ownFold = String(r.fold[lc] ?? '');
    if (!ownFold) continue;
    for (const oc of ['pt', 'es', 'fr', 'en'] as RuleLang[]) {
      if (oc === lc) continue;
      const candFold = String(r.fold[oc] ?? '');
      if (!candFold || candFold === ownFold) continue;
      if (testTermHit(tmpFold, candFold)) {
        const tag = `${oc.toUpperCase()}:${String(r[oc] ?? '')}`;
        if (!residual.includes(tag)) residual.push(tag);
      }
    }
  }

  for (let i = 0; i < slots.length; i++) {
    const ph = `\x01${i + 1}\x01`;
    tmp = tmp.split(ph).join(slots[i] ?? '');
  }
  const invariantOk =
    countChar(cell, '/') === countChar(tmp, '/') &&
    countChar(cell, '|') === countChar(tmp, '|');
  return { text: tmp, human, replacements, residual, invariantOk };
}

/** Structural checks from records/material-rules/regras.md (machine-checkable subset). */
export function getCompositionStructure(
  sku: string,
  lang: string,
  cell: string,
): TextFinding[] {
  const out: TextFinding[] = [];
  const segs = cell.split('|');
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i] ?? '';
    if (/^\s*[A-Za-z\u00c0-\u00ff][A-Za-z\u00c0-\u00ff /-]*:/.test(s)) continue;
    if (!s.includes('%') && /^\s*\d[\d\s.,]*g\/m/.test(s)) continue;
    if (/\d\s*%/.test(s)) {
      out.push({
        sku,
        field: 'Composition',
        finding: `${lang} Composition part after "|" without a part label`,
        notes: `${lang} Composition segment "${s.trim()}" carries fiber spec but no Exterior:/Interior:/\u2026 label (Regras rule 2/3) | Fix: human - add the part label per Regras rule 2/3`,
        priority_hint: '',
      });
    }
  }
  for (const s of segs) {
    const clauses = s.split(/(?<!\d)\.(?!\d)\s*/);
    for (const cl of clauses) {
      const vals: number[] = [];
      for (const vm of cl.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
        vals.push(Number((vm[1] ?? '').replace(',', '.')));
      }
      for (let j = 1; j < vals.length; j++) {
        const prev = vals[j - 1] ?? 0;
        const cur = vals[j] ?? 0;
        if (cur > prev) {
          out.push({
            sku,
            field: 'Composition',
            finding: `${lang} Composition percentages not in descending order`,
            notes: `${lang} Composition segment "${s.trim()}" has ${prev}% before ${cur}% in one fiber list (Regras: descending per EU Reg 1007/2011) | Fix: human - reorder percentages descending per Regras rule 1`,
            priority_hint: '',
          });
          break;
        }
      }
    }
    if (/\d\s*%[^/|,]*?\b\d+\s*%/.test(s)) {
      out.push({
        sku,
        field: 'Composition',
        finding: `${lang} Composition missing separator between fibers`,
        notes: `${lang} Composition segment "${s.trim()}" joins two percentages without /, | or , (Regras rule 1) | Fix: human - join fibers with / or split parts with | per Regras`,
        priority_hint: '',
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/* checks                                                                     */
/* ------------------------------------------------------------------------- */

const GENDER_KEY = /^(Gender|G[e\u00e9]nero|Genre)$/i;

function genderSpec(specs: Record<string, string>): string {
  let value = '';
  for (const k of Object.keys(specs)) {
    if (GENDER_KEY.test(k)) value = specs[k] ?? '';
  }
  return value;
}

function conceptFor(
  concepts: GenderRuleConcept[],
  aliases: GenderRuleAlias[],
  lc: LowerLang,
  value: string,
): string | null {
  for (const c of concepts) {
    if (String(c[lc] ?? '').toLowerCase() === value.toLowerCase()) return c.concept;
  }
  if (/^\s*unisex\s*$/i.test(value)) return 'Unisex';
  const alias = aliases.find((a) => String(a.admin).toLowerCase() === value.toLowerCase());
  return alias ? alias.concept : null;
}

export function getTextChecks(
  sku: string,
  byLang: LangMap,
  genderRules: GenderRules = GENDER_RULES,
  compositionRules: CompositionRules | null = COMPOSITION_RULES,
  /** Languages the caller asked for; an unrequested page is not "missing". */
  requested: TextLang[] = TEXT_LANGS,
): TextCheckResult {
  const findings: TextFinding[] = [];
  const flags: string[] = [];
  const en = byLang.EN;
  if (!en) return { findings, flags: ['no EN baseline extracted'] };

  const gCanon = genderRules.canonical ?? null;
  const gAliases = genderRules.aliases ?? [];
  const gConcepts = genderRules.concepts ?? [];

  const gByLang: Partial<Record<TextLang, string>> = {};
  for (const L of TEXT_LANGS) {
    const o = byLang[L];
    if (!o) continue;
    const value = genderSpec(o.specs);
    if (value) gByLang[L] = value;
  }

  const canonMiss: Partial<Record<TextLang, string>> = {};
  if (gCanon) {
    for (const L of TEXT_LANGS) {
      const v = gByLang[L];
      if (!v) continue;
      const lc = L.toLowerCase() as LowerLang;
      const list = gCanon[lc] ?? [];
      if (list.length === 0) continue;
      if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) canonMiss[L] = v;
    }
  }

  const wanted = new Set<TextLang>(requested);
  for (const lang of ['ES', 'FR'] as const) {
    if (!wanted.has(lang)) continue;
    const o = byLang[lang];
    if (!o) {
      flags.push(`${lang} page not extracted (missing html)`);
      continue;
    }
    if (en.name && o.name && o.name === en.name) {
      findings.push({
        sku,
        field: `${lang} name`,
        finding: 'possibly untranslated name',
        notes: `${lang} name identical to EN: "${o.name}" | Fix ${lang}: translate the product name (keep model/collection proper nouns)`,
        priority_hint: '',
      });
    }
    if (en.short_desc && o.short_desc && o.short_desc === en.short_desc) {
      findings.push({
        sku,
        field: `${lang} short description`,
        finding: 'possibly untranslated short description',
        notes: `${lang} og:description identical to EN (${en.short_desc.length} chars) | Fix ${lang}: translate the short description`,
        priority_hint: '',
      });
    }
    if (en.long_desc && o.long_desc && o.long_desc === en.long_desc) {
      findings.push({
        sku,
        field: `${lang} description`,
        finding: 'possibly untranslated description',
        notes: `${lang} description text identical to EN (${en.long_desc.length} chars compared) | Fix ${lang}: translate the description`,
        priority_hint: '',
      });
    }
    for (const pair of [
      ['name', o.name],
      ['short description', o.short_desc],
    ] as const) {
      const txt = pair[1];
      if (txt && /\b(with|and|the|for|made of)\b/i.test(txt)) {
        flags.push(
          `${lang} ${pair[0]} contains EN stopwords - eyeball before flagging`,
        );
      }
    }

    const gEn = genderSpec(en.specs);
    const gO = genderSpec(o.specs);
    if (
      gO &&
      /^(Men|Women|Unisex|Kids|Children|Adult)s?$/i.test(gO) &&
      gO === gEn &&
      !canonMiss[lang] &&
      !(lang === 'FR' && /^\s*unisex\s*$/i.test(gO))
    ) {
      findings.push({
        sku,
        field: `${lang} Gender`,
        finding: 'possibly untranslated gender',
        notes: `${lang} Gender = "${gO}" (same English value as EN page) | Fix ${lang}: set the localised gender (PT Homem/Mulher/Unissexo, ES Hombre/Mujer/Unisex, FR Homme/Femme/Unisexe)`,
        priority_hint: '',
      });
    }
    if (lang === 'FR' && gO && /^\s*unisex\s*$/i.test(gO)) {
      findings.push({
        sku,
        field: 'FR Gender',
        finding: 'FR Gender "Unisex" should be "Unisexe"',
        notes: `FR Gender = "${gO}" (Atributos - Gender sheet) | Fix FR: Unisexe`,
        priority_hint: '',
      });
      flags.push('gender-fr-unisexe');
    }
  }

  for (const L of TEXT_LANGS) {
    const v = canonMiss[L];
    if (!v) continue;
    if (L === 'FR' && /^\s*unisex\s*$/i.test(v)) continue;
    const lc = L.toLowerCase() as LowerLang;
    const fix = gAliases
      .filter((a) => String(a.admin).toLowerCase() === v.toLowerCase())
      .map((a) => String(a[lc] ?? ''))
      .filter(Boolean);
    let notes: string;
    if (fix.length > 0) {
      notes = `${L} Gender = "${v}" (Atributos - Gender sheet) | Fix ${L}: ${fix[0]}`;
    } else {
      const exp = (gCanon?.[lc] ?? []).join('/');
      notes = `${L} Gender = "${v}" (expected one of: ${exp}; Atributos - Gender sheet) | Fix: human - check spelling against the Atributos - Gender sheet`;
    }
    findings.push({
      sku,
      field: `${L} Gender`,
      finding: `${L} Gender "${v}" is not a canonical gender term`,
      notes,
      priority_hint: '',
    });
    flags.push(`gender-canonical-miss-${lc}`);
  }

  if (gCanon && gConcepts.length > 0 && Object.keys(gByLang).length >= 2) {
    const conceptOf: Partial<Record<TextLang, string>> = {};
    for (const L of TEXT_LANGS) {
      const v = gByLang[L];
      if (!v) continue;
      const hit = conceptFor(gConcepts, gAliases, L.toLowerCase() as LowerLang, v);
      if (hit) conceptOf[L] = hit;
    }
    if (new Set(Object.values(conceptOf)).size > 1) {
      const detail = Object.keys(conceptOf)
        .sort()
        .map((L) => `${L} "${gByLang[L as TextLang]}"=${conceptOf[L as TextLang]}`)
        .join(', ');
      findings.push({
        sku,
        field: 'Gender',
        finding: 'Gender disagrees across languages',
        notes: `Gender concepts differ: ${detail} (Atributos - Gender sheet) | Fix: human - supplier spec decides the correct gender`,
        priority_hint: '',
      });
      flags.push('gender-crosslang-disagree');
    }
  }

  if (gConcepts.length > 0) {
    const nameTok: Record<TextLang, string[]> = {
      EN: ['WOMENS', 'WOMAN', 'WOMEN', 'MENS', 'MAN', 'MEN', 'KIDS', 'KID', 'CHILDREN', 'CHILD', 'UNISEX'],
      ES: ['MUJER', 'HOMBRE', 'NINO', 'NINA', 'INFANTIL', 'UNISEX'],
      FR: ['FEMME', 'HOMME', 'ENFANT', 'UNISEXE', 'UNISEX'],
    };
    const tokConcept: Record<string, string> = {
      WOMAN: 'Female',
      WOMEN: 'Female',
      WOMENS: 'Female',
      MAN: 'Male',
      MEN: 'Male',
      MENS: 'Male',
      KID: 'Kid',
      KIDS: 'Kid',
      CHILD: 'Kid',
      CHILDREN: 'Kid',
      UNISEX: 'Unisex',
      MUJER: 'Female',
      HOMBRE: 'Male',
      NINO: 'Kid',
      NINA: 'Kid',
      INFANTIL: 'Kid',
      FEMME: 'Female',
      HOMME: 'Male',
      ENFANT: 'Kid',
      UNISEXE: 'Unisex',
    };
    const nameWord: Record<string, Record<TextLang, string>> = {
      Female: { EN: 'WOMAN', ES: 'MUJER', FR: 'FEMME' },
      Male: { EN: 'MAN', ES: 'HOMBRE', FR: 'HOMME' },
      Kid: { EN: 'KID', ES: 'NINO', FR: 'ENFANT' },
      Unisex: { EN: 'UNISEX', ES: 'UNISEX', FR: 'UNISEXE' },
    };
    const nameConcept: Record<TextLang, string[]> = { EN: [], ES: [], FR: [] };
    for (const L of TEXT_LANGS) {
      const nm = byLang[L]?.name ?? '';
      const fn = removeDiacritics(nm.toUpperCase());
      const cs: string[] = [];
      for (const t of nameTok[L]) {
        if (new RegExp(`\\b${t}\\b`).test(fn)) {
          const c = tokConcept[t];
          if (c && !cs.includes(c)) cs.push(c);
        }
      }
      if (L === 'FR' && /\bUNISEX\b/.test(fn) && !cs.includes('Unisex')) {
        cs.push('Unisex');
      }
      nameConcept[L] = cs;
    }

    for (const C of nameConcept.EN) {
      for (const L of ['ES', 'FR'] as const) {
        if (!byLang[L]) continue;
        if (nameConcept[L].includes(C)) continue;
        const w = nameWord[C]?.[L] ?? '';
        findings.push({
          sku,
          field: `${L} name`,
          finding: `${L} name missing "${w}" for EN gender word`,
          notes: `${L} name "${byLang[L]?.name ?? ''}" lacks the ${C} word (EN has it; Atributos - Gender sheet) | Fix ${L}: add "${w}"`,
          priority_hint: '',
        });
        flags.push(`name-gender-missing-${L.toLowerCase()}`);
      }
    }
    for (const L of ['ES', 'FR'] as const) {
      for (const C of nameConcept[L]) {
        if (nameConcept.EN.includes(C)) continue;
        findings.push({
          sku,
          field: `${L} name`,
          finding: `${L} name has "${nameWord[C]?.[L] ?? ''}" with no EN counterpart`,
          notes: `${L} name "${byLang[L]?.name ?? ''}" carries a ${C} word missing in EN "${byLang.EN?.name ?? ''}" | Fix: human - confirm against the supplier spec (EN incomplete or ${L} word wrong)`,
          priority_hint: '',
        });
        flags.push(`name-gender-extra-${L.toLowerCase()}`);
      }
    }

    const fldConcept: Partial<Record<TextLang, string>> = {};
    for (const L of TEXT_LANGS) {
      const v = gByLang[L];
      if (!v) continue;
      const hit = conceptFor(gConcepts, gAliases, L.toLowerCase() as LowerLang, v);
      if (hit) fldConcept[L] = hit;
    }
    for (const L of TEXT_LANGS) {
      const nc = nameConcept[L];
      const fc = fldConcept[L];
      if (nc.length === 0 || !fc) continue;
      if (nc.includes(fc)) continue;
      findings.push({
        sku,
        field: `${L} name`,
        finding: `${L} name gender disagrees with ${L} Gender field`,
        notes: `${L} name "${byLang[L]?.name ?? ''}" reads ${nc.join('/')} but ${L} Gender field is "${gByLang[L] ?? ''}" (Atributos - Gender sheet) | Fix: human - supplier spec decides the correct gender`,
        priority_hint: '',
      });
      flags.push(`name-gender-field-mismatch-${L.toLowerCase()}`);
    }
  }

  for (const lang of TEXT_LANGS) {
    const o = byLang[lang];
    if (!o || !o.name) continue;
    for (const mm of o.name.matchAll(/\b([A-Z]{1,4}[0-9]{3,}[A-Z0-9]*)\b/g)) {
      const tok = mm[1] ?? '';
      const skuUpper = sku.toUpperCase();
      if (
        tok.toUpperCase() !== skuUpper &&
        !new RegExp(escapeRegExp(tok), 'i').test(sku) &&
        !/^(EN|ES|FR|PT)$/i.test(tok)
      ) {
        findings.push({
          sku,
          field: `${lang} name`,
          finding: "different product's SKU in name",
          notes: `${lang} name "${o.name}" mentions ${tok} (this page is ${sku})`,
          priority_hint: 'High',
        });
        break;
      }
    }
  }

  const ruleRows = compositionRules?.rows ?? null;
  const expectedByLang: Record<LowerLang, string> = {
    en: 'cotton',
    es: 'algod\u00f3n',
    fr: 'coton',
  };
  for (const lang of TEXT_LANGS) {
    const o = byLang[lang];
    if (!o) continue;
    const comp = getSpecValue(o.specs, ['Composition', 'Composicion', 'Composition ']);
    if (!comp) continue;
    const low = removeDiacritics(comp.toLowerCase());
    for (const sf of getCompositionStructure(sku, lang, comp)) {
      findings.push(sf);
      flags.push('composition-structure');
    }
    if (ruleRows) {
      const lc = lang.toLowerCase() as LowerLang;
      let scrubbed = low;
      for (const r0 of ruleRows) {
        const op0 = String(r0.fold[lc] ?? '');
        if (op0 && /[^a-z0-9]/.test(op0) && scrubbed.includes(op0)) {
          scrubbed = scrubbed.split(op0).join(' ');
        }
      }
      let foundLeak = false;
      for (const r of ruleRows) {
        const ownFold = String(r.fold[lc] ?? '');
        if (!ownFold) continue;
        if (testTermHit(scrubbed, ownFold)) continue;
        let leak: { lang: string; fold: string; raw: string } | null = null;
        for (const other of ['PT', 'ES', 'FR', 'EN'] as const) {
          if (other === lang) continue;
          const oc = other.toLowerCase() as RuleLang;
          const candFold = String(r.fold[oc] ?? '');
          if (!candFold) continue;
          if (testTermHit(scrubbed, candFold)) {
            leak = { lang: other, fold: candFold, raw: String(r[oc] ?? '') };
            break;
          }
        }
        if (!leak) continue;
        const repair = repairCompositionCell(comp, ruleRows, lc);
        let fixTxt: string;
        if (!repair.invariantOk) {
          fixTxt = 'Fix withheld - repair altered separators (flagged for script fix)';
          flags.push('composition-fix-shape-changed');
        } else if (repair.replacements > 3 || repair.residual.length > 0) {
          const why: string[] = [];
          if (repair.replacements > 3) {
            why.push(`${repair.replacements} words auto-swapped - cell needs full rewrite`);
          }
          if (repair.residual.length > 0) {
            why.push(`still contains ${repair.residual.join(', ')}`);
          }
          fixTxt = `Fix: human - ${why.join('; ')}`;
          flags.push('composition-fix-human');
        } else {
          fixTxt = `Fix ${lang}: "${repair.text}"`;
          if (repair.human.length > 0) {
            fixTxt += ` (+ human: ${repair.human.join(', ')})`;
          }
        }
        findings.push({
          sku,
          field: 'Composition',
          finding: `${lang} Composition keeps ${leak.lang} word "${leak.fold}"`,
          notes: `${lang} Composition: "${comp}" keeps ${leak.lang} "${leak.raw}" (New Materials Page) | ${fixTxt}`,
          priority_hint: '',
        });
        flags.push(`composition-${lc}-canonical`);
        foundLeak = true;
        break;
      }
      if (lang === 'FR' && !foundLeak) {
        const rawLow = comp.toLowerCase();
        if (rawLow.includes('elasthanne') && !rawLow.includes('\u00e9lasthanne')) {
          const fixedFr = comp.replace(/\belasthanne\b/gi, (mm) =>
            /^\p{Lu}/u.test(mm) ? '\u00c9lasthanne' : '\u00e9lasthanne',
          );
          findings.push({
            sku,
            field: 'Composition',
            finding: 'FR Composition keeps PT word "elasthanne"',
            notes: `FR Composition: "${comp}" keeps PT "elasthanne" unaccented (New Materials Page) | Fix FR: "${fixedFr}"`,
            priority_hint: '',
          });
          flags.push(`composition-${lc}-canonical`);
        }
      }
      continue;
    }

    const ptWordsByLang: Record<TextLang, string[]> = {
      EN: ['algodao', 'elasthanne'],
      ES: ['algodao', 'elasthanne'],
      FR: ['algodao'],
    };
    const hits = ptWordsByLang[lang].filter((w) => low.includes(w));
    if (lang === 'FR') {
      const rawLow = comp.toLowerCase();
      if (rawLow.includes('elasthanne') && !rawLow.includes('\u00e9lasthanne')) {
        hits.push('elasthanne');
      }
    }
    if (hits.length > 0) {
      const exp = expectedByLang[lang.toLowerCase() as LowerLang];
      findings.push({
        sku,
        field: 'Composition',
        finding: `${lang} Composition keeps PT word "${hits[0] ?? ''}"`,
        notes: `${lang} Composition: "${comp}" keeps PT "${hits[0] ?? ''}" (expected ${exp}-family word; cf. ${lang} Details)`,
        priority_hint: '',
      });
      flags.push(`composition-${lang.toLowerCase()}-pt-word`);
    }
  }

  const displayBrand = getSpecValue(en.specs, ['Brand', 'Marca', 'Marque']);
  const jdBrand = en.jsonld_brand;
  if (displayBrand && jdBrand && displayBrand.toLowerCase() !== jdBrand.toLowerCase()) {
    findings.push({
      sku,
      field: 'Brand',
      finding: `Structured-data brand "${jdBrand}" conflicts with displayed Brand "${displayBrand}"`,
      notes: `JSON-LD brand.name "${jdBrand}" != spec Brand "${displayBrand}" EN/ES/FR // Fix: human - confirm against the supplier spec, then set JSON-LD brand.name to the displayed brand`,
      priority_hint: '',
    });
    flags.push('brand-jsonld-conflict');
  }

  const esObj = byLang.ES;
  if (esObj) {
    const esFull = [esObj.long_desc_raw, esObj.long_desc, esObj.jsonld_desc, esObj.short_desc]
      .filter(Boolean)
      .map(String)
      .join(' ');
    if (/\bgorro\b/i.test(esFull)) {
      findings.push({
        sku,
        field: 'Details',
        finding: 'ES Details wrong word "Gorro" (should be "Gorra")',
        notes: `ES Details: "Gorro" -> "Gorra" (wrong product word; cf. ES title "${esObj.name}")`,
        priority_hint: '',
      });
      flags.push('details-es-gorro');
    }
  }

  const compEn = getSpecValue(en.specs, ['Composition', 'Composicion', 'Composition ']);
  if (compEn) {
    const storyEn = removeDiacritics(
      `${en.name} ${en.long_desc_raw} ${en.long_desc}`.toLowerCase(),
    );
    if (
      storyEn.includes('recycl') &&
      !removeDiacritics(compEn.toLowerCase()).includes('recycl')
    ) {
      findings.push({
        sku,
        field: 'Composition',
        finding: 'Composition omits "recycled" present in name/details',
        notes: `EN Composition: "${compEn}" omits recycled although name/details say recycled // Fix: human - confirm against the supplier spec, then add "recycled" to the composition cell`,
        priority_hint: '',
      });
      flags.push('composition-omits-recycled');
    }
  }

  for (const k of Object.keys(en.specs)) {
    if (/^(Dimensions|Dimensiones|Dimens[o\u00f5]es)$/i.test(k)) {
      const v = en.specs[k] ?? '';
      if (/[\[\]]/.test(v)) {
        findings.push({
          sku,
          field: 'Dimensions',
          finding: 'brackets in dimensions value',
          notes: `Value "${v}" has [ ] brackets // Fix: remove the brackets, keep the values`,
          priority_hint: '',
        });
      }
    }
    if (/^(Grammage|Gramaje|Gramagem)$/i.test(k)) {
      const v = en.specs[k] ?? '';
      if (/^\d+([.,]\d+)?\s*g$/.test(v)) {
        findings.push({
          sku,
          field: 'Grammage',
          finding: 'grammage without /m2 unit',
          notes: `Value "${v}" looks like bare grams // Fix: human - confirm against the supplier spec, then write the value as g/m2`,
          priority_hint: '',
        });
      }
    }
  }

  return { findings, flags };
}

/* ------------------------------------------------------------------------- */
/* matrix + marker block + per-SKU audit                                      */
/* ------------------------------------------------------------------------- */

export function buildTextMatrix(byLang: LangMap): TextMatrix {
  const specKeys: string[] = [];
  for (const lang of TEXT_LANGS) {
    const o = byLang[lang];
    if (!o) continue;
    for (const k of Object.keys(o.specs)) {
      if (!specKeys.includes(k)) specKeys.push(k);
    }
  }
  const specRows: TextMatrixSpecRow[] = specKeys.map((k) => ({
    field: k,
    en: byLang.EN?.specs[k] ?? '',
    es: byLang.ES?.specs[k] ?? '',
    fr: byLang.FR?.specs[k] ?? '',
  }));
  return {
    name: {
      en: byLang.EN?.name ?? '',
      es: byLang.ES?.name ?? '',
      fr: byLang.FR?.name ?? '',
    },
    h1: {
      en: byLang.EN?.h1 ?? '',
      es: byLang.ES?.h1 ?? '',
      fr: byLang.FR?.h1 ?? '',
    },
    short_desc: {
      en: byLang.EN?.short_desc ?? '',
      es: byLang.ES?.short_desc ?? '',
      fr: byLang.FR?.short_desc ?? '',
    },
    long_desc: {
      en: byLang.EN?.long_desc ?? '',
      es: byLang.ES?.long_desc ?? '',
      fr: byLang.FR?.long_desc ?? '',
    },
    specs: specRows,
  };
}

/** `<!-- text-audit:begin -->` block (SKU | Field | Finding | Notes). */
export function buildTextAuditBlock(
  sku: string,
  findings: TextFinding[],
  langs: TextLang[],
): string {
  const rows: string[] = findings.map(
    (f) => `${f.sku} | ${f.field} | ${f.finding} | ${f.notes}`,
  );
  if (rows.length === 0) {
    rows.push(
      `<!-- clean: text-matrix - no mechanical findings on ${langs.join('/')} -->`,
    );
  }
  return `<!-- text-audit:begin -->\r\n${rows.join('\r\n')}\r\n<!-- text-audit:end -->`;
}

export interface TextAuditInput {
  sku: string;
  byLang: LangMap;
  genderRules?: GenderRules;
  compositionRules?: CompositionRules | null;
  /** Languages the caller asked for (default: every language present). */
  langs?: TextLang[];
}

/** Run the checks for one SKU (the extracted PDP fields are the evidence). */
export function auditText(input: TextAuditInput): TextAuditResult {
  const sku = input.sku.trim().toUpperCase();
  const byLang = input.byLang;
  const base: TextAuditResult = {
    schema: TEXT_MATRIX_SCHEMA,
    generated: nowStamp(),
    sku,
    ok: false,
    verdict: 'blocked',
    langs: [],
    matrix: null,
    findings: [],
    review_flags: [],
    mdBlock: '',
  };

  if (!TEXT_LANGS.some((l) => byLang[l])) {
    base.review_flags.push(
      `no html evidence for ${sku} - fetch PDP snapshots first`,
    );
    return base;
  }
  const langs = TEXT_LANGS.filter((l) => byLang[l]);
  base.langs = langs;
  if (!byLang.EN) {
    base.review_flags.push(
      `no EN baseline (no _en file and no bare bog_${sku}.html)`,
    );
    base.langs = langs;
    return base;
  }

  const requested = input.langs?.length
    ? TEXT_LANGS.filter((l) => input.langs?.includes(l))
    : TEXT_LANGS;
  const reviewFlags: string[] = [];
  for (const lang of ['ES', 'FR'] as const) {
    if (!requested.includes(lang)) continue;
    if (!byLang[lang]) reviewFlags.push(`${lang} html missing - partial matrix`);
  }

  const matrix = buildTextMatrix(byLang);
  const chk = getTextChecks(
    sku,
    byLang,
    input.genderRules,
    input.compositionRules,
    requested,
  );
  reviewFlags.push(...chk.flags);

  return {
    ...base,
    ok: reviewFlags.length === 0,
    verdict: 'ok',
    langs,
    matrix,
    findings: chk.findings,
    review_flags: reviewFlags,
    mdBlock: buildTextAuditBlock(sku, chk.findings, langs),
  };
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
