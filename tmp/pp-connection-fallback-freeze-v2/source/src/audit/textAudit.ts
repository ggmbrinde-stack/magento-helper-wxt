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
  /**
   * Raw inner HTML of each spec cell, keyed like `specs`. Only the technical
   * information checks use it: `htmlToText` strips tags and trims, so the
   * rendered value cannot reveal a literal `<br>`, a trailing space or a
   * double-encoded entity.
   */
  specs_raw: Record<string, string>;
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
    specs_raw: {},
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
      const raw = row[2] ?? '';
      const v = htmlToText(raw);
      if (k && !Object.prototype.hasOwnProperty.call(f.specs, k)) {
        f.specs[k] = v;
        f.specs_raw[k] = raw;
      }
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

function genderSpec(specs: Record<string, string>): string {
  return specValue(specs, 'gender');
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

/* ------------------------------------------------------------------------- */
/* technical information (spec table) audit - B1..B8                          */
/* ------------------------------------------------------------------------- */

/**
 * Language-independent spec concepts. The storefront renders the *attribute
 * label* (translated per store view), not the Magento attribute code, so the
 * only way to compare EN/ES/FR rows is an alias map (B7). Labels observed on
 * live PDPs are all listed here; an unknown label simply takes no part in the
 * cross-language checks, which is safer than guessing a translation.
 */
export type SpecConcept =
  | 'sku'
  | 'internal_ref'
  | 'brand'
  | 'composition'
  | 'grammage'
  | 'dimensions'
  | 'box_dimensions'
  | 'gender'
  | 'weight'
  | 'material'
  | 'country'
  | 'capacity'
  | 'capacity_mah'
  | 'capacity_gb'
  | 'height'
  | 'width'
  | 'length'
  | 'diameter'
  | 'volume'
  | 'battery_count'
  | 'certifications'
  | 'packaging'
  | 'oeko_tex'
  | 'other_information';

const SPEC_LABELS: { concept: SpecConcept; labels: string[] }[] = [
  { concept: 'sku', labels: ['SKU'] },
  {
    concept: 'internal_ref',
    labels: [
      'Internal Ref.',
      'Internal Ref',
      'Internal Reference',
      'Ref. Interna',
      'Referencia Interna',
      'Referência Interna',
      'Réf. Interne',
      'Ref. Interne',
    ],
  },
  { concept: 'brand', labels: ['Brand', 'Marca', 'Marque'] },
  {
    concept: 'composition',
    labels: ['Composition', 'Composición', 'Composicion', 'Composição', 'Composicao'],
  },
  { concept: 'grammage', labels: ['Grammage', 'Gramaje', 'Gramagem', 'GSM'] },
  {
    concept: 'dimensions',
    labels: ['Dimensions', 'Dimensiones', 'Dimensões', 'Dimensoes', 'Dimensión'],
  },
  {
    concept: 'box_dimensions',
    labels: [
      'Box Dimensions',
      'Box Dimension',
      'Dimensiones de la caja',
      'Dimensions de la boîte',
      'Dimensions de la boite',
      'Dimensões da caixa',
      'Dimensoes da caixa',
    ],
  },
  { concept: 'gender', labels: ['Gender', 'Género', 'Genero', 'Genre', 'Sexo', 'Sexe'] },
  { concept: 'weight', labels: ['Weight', 'Peso', 'Poids'] },
  { concept: 'material', labels: ['Material', 'Matériau', 'Main Material', 'Material Principal'] },
  {
    concept: 'country',
    labels: [
      'Country',
      'País',
      'Pais',
      'Pays',
      'Country of Origin',
      'País de origen',
      'Pays d\u2019origine',
    ],
  },
  { concept: 'capacity', labels: ['Capacity', 'Capacidad', 'Capacité', 'Capacidade'] },
  { concept: 'capacity_mah', labels: ['Capacity Mah', 'Capacidad Mah', 'Capacité Mah'] },
  { concept: 'capacity_gb', labels: ['Capacity GB', 'Capacidad GB', 'Capacité GB'] },
  { concept: 'height', labels: ['Height', 'Altura', 'Hauteur'] },
  { concept: 'width', labels: ['Width', 'Ancho', 'Largeur', 'Largura'] },
  { concept: 'length', labels: ['Length', 'Longitud', 'Longueur', 'Comprimento'] },
  { concept: 'diameter', labels: ['Diameter', 'Diámetro', 'Diametro', 'Diamètre'] },
  { concept: 'volume', labels: ['Volume', 'Volumen'] },
  {
    concept: 'battery_count',
    labels: [
      'Number of Batteries',
      'Número de pilas',
      'Numero de pilas',
      'Nombre de piles',
      'Número de baterias',
    ],
  },
  {
    concept: 'certifications',
    labels: ['Certifications', 'Certificaciones', 'Certificações', 'Certificacoes'],
  },
  {
    concept: 'packaging',
    labels: [
      'Packaging Type',
      'Tipo de embalaje',
      'Type d\u2019emballage',
      "Type d'emballage",
      'Tipo de embalagem',
    ],
  },
  { concept: 'oeko_tex', labels: ['Oeko-Tex', 'Oeko Tex'] },
  {
    concept: 'other_information',
    labels: [
      'Other Information',
      'Información adicional',
      'Informacion adicional',
      'Informations complémentaires',
      'Informations complementaires',
      'Outras informações',
      'Outras informacoes',
    ],
  },
];

/** Fold a spec label: case, accents, periods and spacing are not significant. */
function foldSpecLabel(value: string): string {
  return removeDiacritics(value.toLowerCase())
    .replace(/\u00a0/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SPEC_CONCEPT_BY_LABEL = new Map<string, SpecConcept>();
for (const { concept, labels } of SPEC_LABELS) {
  for (const label of labels) SPEC_CONCEPT_BY_LABEL.set(foldSpecLabel(label), concept);
}

/** Canonical concept for a rendered label, or null when the label is unknown. */
export function specConcept(label: string): SpecConcept | null {
  return SPEC_CONCEPT_BY_LABEL.get(foldSpecLabel(label)) ?? null;
}

/** First key (insertion order) whose label maps to `concept`. */
export function specKeyFor(
  specs: Record<string, string>,
  concept: SpecConcept,
): string | null {
  for (const key of Object.keys(specs)) {
    if (specConcept(key) === concept) return key;
  }
  return null;
}

/** First value whose label maps to `concept` (B7 replacement for name lists). */
export function specValue(
  specs: Record<string, string>,
  concept: SpecConcept,
): string {
  const key = specKeyFor(specs, concept);
  return key === null ? '' : (specs[key] ?? '');
}

type SpecFamily = 'apparel' | 'headwear' | 'bags' | 'drinkware' | 'hard';

const APPAREL_L2 =
  /t-?shirt|polo|sweatshirt|hoodie|jacket|vest|pant|short|trouser|underwear|track ?suit|dress|skirt|apron|lab coat|shirt|legging|pyjama|pajama|bathrobe|tunic|overall|coverall|jersey|kits?\b|sets?\b/;
const TEXTILE_L1 = /textile|sweatshirt|hoodie|zip hoodie|made4you/;
const HARD_L1 =
  /technology|writing and office|diy and auto|house and wine|personal|outdoors and events|children|other/;

/** Category family used to decide which spec concepts are required (B2). */
export function specFamily(category: string, subcategory: string): SpecFamily | null {
  const l1 = foldSpecLabel(category);
  const l2 = foldSpecLabel(subcategory);
  if (/cap|hat|beanie|visor|snood|headband|beret/.test(l2)) return 'headwear';
  if (/bag|backpack|trolley|pouch|suitcase/.test(l2) || /^bags and backpacks$/.test(l1)) {
    return 'bags';
  }
  if (/mug|cup|bottle|tumbler|glass|teapot|kettle|thermos|flask/.test(l2)) {
    return 'drinkware';
  }
  if (TEXTILE_L1.test(l1)) {
    return APPAREL_L2.test(l2) || l2 === '' ? 'apparel' : null;
  }
  if (HARD_L1.test(l1)) return 'hard';
  return null;
}

const FAMILY_REQUIREMENTS: Record<
  SpecFamily,
  {
    label: string;
    concepts: SpecConcept[];
    /** At least one material description: Composition or Material. */
    materialOrComposition?: boolean;
    /** Grammage row, or a g/m2 / gsm / g/pc token in the material description. */
    grammage?: boolean;
  }
> = {
  apparel: {
    label: 'apparel',
    concepts: ['brand', 'gender'],
    materialOrComposition: true,
    grammage: true,
  },
  headwear: { label: 'headwear', concepts: ['dimensions'], materialOrComposition: true },
  bags: { label: 'bags', concepts: ['brand', 'dimensions'], materialOrComposition: true },
  drinkware: { label: 'drinkware', concepts: ['weight'], materialOrComposition: true },
  hard: { label: 'hard goods', concepts: ['dimensions'], materialOrComposition: true },
};

const GRAMMAGE_TOKEN = /\d+(?:[.,]\d+)?\s*(?:g\s*\/\s*(?:m\s*(?:²|2)|pc|ud|piece)|gsm)/i;

function isEmptySpecValue(value: string): boolean {
  const v = value.trim();
  return v === '' || /^(?:-|—|n\/?a|n\.a\.|none|null)$/i.test(v);
}

function numbersIn(value: string): number[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)?/g)]
    .map((m) => Number((m[0] ?? '').replace(',', '.')))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

function grammageNumbers(value: string): number[] {
  return [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*g\s*\/\s*(?:m\s*(?:²|2)|pc|ud|piece)/gi)]
    .map((m) => Number((m[1] ?? '').replace(',', '.')))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

function sameNumbers(a: number[], b: number[]): boolean {
  return (
    a.length === b.length &&
    a.every((value, i) => Math.abs(value - (b[i] ?? 0)) < 0.001)
  );
}

function isKnownFibre(term: string, rows: CompositionRuleRow[]): boolean {
  const folded = removeDiacritics(term.toLowerCase());
  if (!folded) return true;
  const langs: RuleLang[] = ['pt', 'es', 'fr', 'en'];
  for (const row of rows) {
    for (const lc of langs) {
      const fold = String(row.fold[lc] ?? '');
      if (fold && testTermHit(folded, fold)) return true;
    }
  }
  return false;
}

/**
 * Technical information checks, run on the parsed spec tables:
 *
 *  B1 table missing / zero rows
 *  B2 required concepts per category family (see FAMILY_REQUIREMENTS)
 *  B3 rows with empty values
 *  B4 EN concepts absent from ES / FR
 *  B5 numeric disagreement across languages (dimensions, grammage, weight, …)
 *  B6 composition sanity (sum to 100, known fibres, recycled claim direction)
 *  B7 label canonicalisation (concept map) + duplicate concepts
 *  B8 leftover markup (entities, literal tags, brackets, trailing spaces)
 *
 * Composition structure (descending order, missing separators, part labels) is
 * deliberately left to `getCompositionStructure`, and the Dimensions-bracket /
 * bare-gram checks stay in `getTextChecks`; this helper does not repeat them.
 */
export function getSpecTableChecks(
  sku: string,
  byLang: LangMap,
  requested: TextLang[] = TEXT_LANGS,
  category = '',
  subcategory = '',
  compositionRules: CompositionRules | null = COMPOSITION_RULES,
): TextCheckResult {
  const findings: TextFinding[] = [];
  const flags: string[] = [];
  const en = byLang.EN;
  if (!en) return { findings, flags };

  const enKeys = Object.keys(en.specs);
  const where = [category, subcategory].filter(Boolean).join(' > ');

  // ---- B1: table missing / zero rows --------------------------------------
  if (enKeys.length === 0) {
    findings.push({
      sku,
      field: 'Technical information',
      finding: 'EN Technical Information table is missing or empty',
      notes: `EN PDP has no product-attribute-specs-table rows${where ? ` (${where})` : ''} | Fix: human - fill the Technical Information attributes in Magento`,
      priority_hint: '',
    });
    flags.push('spec-table-missing');
    return { findings, flags };
  }

  // ---- B2: required concepts per category family --------------------------
  const family = specFamily(category, subcategory);
  if (family) {
    const req = FAMILY_REQUIREMENTS[family];
    const nonEmpty = (concept: SpecConcept): boolean =>
      !isEmptySpecValue(specValue(en.specs, concept));
    for (const concept of req.concepts) {
      if (nonEmpty(concept)) continue;
      findings.push({
        sku,
        field: 'Technical information',
        finding: `EN Technical Information is missing ${concept}`,
        notes: `EN spec table${where ? ` (${where})` : ''} has no ${concept} row | Fix: human - add ${concept} from the supplier spec (required for ${req.label})`,
        priority_hint: '',
      });
      flags.push(`spec-required-missing-${concept}`);
    }
    if (req.materialOrComposition) {
      const material = specValue(en.specs, 'material');
      const composition = specValue(en.specs, 'composition');
      if (isEmptySpecValue(material) && isEmptySpecValue(composition)) {
        findings.push({
          sku,
          field: 'Technical information',
          finding: 'EN Technical Information is missing Composition or Material',
          notes: `EN spec table${where ? ` (${where})` : ''} has neither Composition nor Material | Fix: human - add the material description from the supplier spec (required for ${req.label})`,
          priority_hint: '',
        });
        flags.push('spec-required-missing-composition');
      }
    }
    if (req.grammage) {
      const grammage = specValue(en.specs, 'grammage');
      const materialText = [specValue(en.specs, 'composition'), specValue(en.specs, 'material')]
        .filter(Boolean)
        .join(' ');
      if (isEmptySpecValue(grammage) && !GRAMMAGE_TOKEN.test(materialText)) {
        findings.push({
          sku,
          field: 'Technical information',
          finding: 'EN Technical Information is missing Grammage',
          notes: `EN spec table${where ? ` (${where})` : ''} has no Grammage row and no g/m2 token in Composition/Material | Fix: human - add the grammage from the supplier spec (required for ${req.label})`,
          priority_hint: '',
        });
        flags.push('spec-required-missing-grammage');
      }
    }
  } else if (where) {
    flags.push(`spec-required-policy-missing: ${where}`);
  }

  // ---- B3: empty values ---------------------------------------------------
  for (const lang of TEXT_LANGS) {
    const o = byLang[lang];
    if (!o) continue;
    for (const [key, value] of Object.entries(o.specs)) {
      if (!isEmptySpecValue(value)) continue;
      findings.push({
        sku,
        field: 'Technical information',
        finding: `${lang} Technical Information row "${key}" is empty`,
        notes: `${lang} spec "${key}" has no value on the PDP | Fix: human - fill the attribute or remove the row in Magento`,
        priority_hint: '',
      });
      flags.push(`spec-empty-${lang.toLowerCase()}`);
    }
  }

  // ---- B4: concept coverage across languages ------------------------------
  const enConcepts = new Map<SpecConcept, { key: string; value: string }>();
  for (const key of enKeys) {
    const concept = specConcept(key);
    if (!concept || enConcepts.has(concept)) continue;
    enConcepts.set(concept, { key, value: en.specs[key] ?? '' });
  }
  for (const lang of ['ES', 'FR'] as const) {
    if (!requested.includes(lang)) continue;
    const o = byLang[lang];
    if (!o) continue;
    if (Object.keys(o.specs).length === 0) {
      findings.push({
        sku,
        field: 'Technical information',
        finding: `${lang} Technical Information table is missing or empty`,
        notes: `EN has ${enKeys.length} spec rows but ${lang} has none | Fix: human - translate the Technical Information attributes in Magento`,
        priority_hint: '',
      });
      flags.push(`spec-table-missing-${lang.toLowerCase()}`);
      continue;
    }
    for (const [concept, meta] of enConcepts) {
      if (isEmptySpecValue(meta.value)) continue;
      if (specKeyFor(o.specs, concept) !== null) continue;
      findings.push({
        sku,
        field: 'Technical information',
        finding: `${lang} Technical Information is missing "${meta.key}"`,
        notes: `EN has "${meta.key}" = "${meta.value}" but ${lang} has no ${concept} row (labels matched by concept) | Fix: human - add the ${lang} attribute row in Magento`,
        priority_hint: '',
      });
      flags.push(`spec-missing-${lang.toLowerCase()}-${concept}`);
    }
  }

  // ---- B5: numbers agree across languages ---------------------------------
  const numericConcepts: SpecConcept[] = [
    'dimensions',
    'box_dimensions',
    'grammage',
    'weight',
    'capacity',
    'height',
    'width',
    'length',
    'diameter',
    'volume',
  ];
  for (const concept of numericConcepts) {
    const enValue = specValue(en.specs, concept);
    const enNumbers = numbersIn(enValue);
    if (enNumbers.length === 0) continue;
    for (const lang of ['ES', 'FR'] as const) {
      if (!requested.includes(lang)) continue;
      const o = byLang[lang];
      if (!o) continue;
      const value = specValue(o.specs, concept);
      if (!value) continue;
      const numbers = numbersIn(value);
      if (numbers.length === 0 || sameNumbers(enNumbers, numbers)) continue;
      findings.push({
        sku,
        field: 'Technical information',
        finding: `${lang} ${concept} numbers disagree with EN`,
        notes: `EN ${concept} "${enValue}" (${enNumbers.join(', ')}) vs ${lang} "${value}" (${numbers.join(', ')}) | Fix: human - make the ${lang} value match the supplier spec`,
        priority_hint: '',
      });
      flags.push(`spec-numbers-disagree-${lang.toLowerCase()}-${concept}`);
    }
  }
  // Grammage inside the composition cell (e.g. "100% recycled polyester, 100 g/m2").
  {
    const enGrammage = grammageNumbers(specValue(en.specs, 'composition'));
    if (enGrammage.length > 0) {
      for (const lang of ['ES', 'FR'] as const) {
        if (!requested.includes(lang)) continue;
        const o = byLang[lang];
        if (!o) continue;
        const value = specValue(o.specs, 'composition');
        if (!value) continue;
        const numbers = grammageNumbers(value);
        if (numbers.length === 0 || sameNumbers(enGrammage, numbers)) continue;
        findings.push({
          sku,
          field: 'Composition',
          finding: `${lang} Composition grammage disagrees with EN`,
          notes: `EN composition grammage (${enGrammage.join(', ')} g) vs ${lang} (${numbers.join(', ')}) in "${value}" | Fix: human - make the ${lang} grammage match the supplier spec`,
          priority_hint: '',
        });
        flags.push(`spec-numbers-disagree-${lang.toLowerCase()}-grammage`);
      }
    }
  }

  // ---- B6: composition sanity --------------------------------------------
  for (const lang of TEXT_LANGS) {
    const o = byLang[lang];
    if (!o) continue;
    const comp = specValue(o.specs, 'composition');
    if (!comp) continue;

    // Sum per "|" part. Parentheticals are excluded: "100% cotton (50% recycled)"
    // is one fibre with a claim, not two fibres that must add up.
    for (const part of comp.split('|')) {
      const cleaned = part
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\d+(?:[.,]\d+)?\s*g\s*\/\s*(?:m\s*(?:²|2)|pc|ud|piece)/gi, ' ');
      const percentages = [...cleaned.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) =>
        Number((m[1] ?? '').replace(',', '.')),
      );
      if (percentages.length === 0) continue;
      const sum = percentages.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) <= 0.5) continue;
      findings.push({
        sku,
        field: 'Composition',
        finding: `${lang} Composition percentages sum to ${sum}, not 100`,
        notes: `${lang} Composition segment "${part.trim()}" lists ${percentages.join(' + ')}% = ${sum}% | Fix: human - correct the percentages against the supplier spec (EU Reg 1007/2011)`,
        priority_hint: '',
      });
      flags.push(`composition-sum-${lang.toLowerCase()}`);
    }

    // Fibre words must come from the materials rules file.
    if (compositionRules?.rows?.length) {
      for (const m of comp.matchAll(/(\d+(?:[.,]\d+)?)\s*%\s*([^,;/|\d]+)/g)) {
        const term = (m[2] ?? '').trim();
        if (!term || isKnownFibre(term, compositionRules.rows)) continue;
        findings.push({
          sku,
          field: 'Composition',
          finding: `${lang} Composition fibre "${term}" is not in the materials rules`,
          notes: `${lang} Composition: "${comp}" names "${term}" after ${m[1] ?? '?'}% | Fix: human - use a term from the New Materials Page, or add the fibre to the rules`,
          priority_hint: '',
        });
        flags.push(`composition-unknown-fibre-${lang.toLowerCase()}`);
      }
    }
  }

  // Recycled claim must agree in both directions (the omission direction keeps
  // its original wording and flag so existing Notion rows stay deduplicated).
  {
    const compEn = specValue(en.specs, 'composition');
    if (compEn) {
      const storyEn = removeDiacritics(
        `${en.name} ${en.long_desc_raw} ${en.long_desc}`.toLowerCase(),
      );
      const compLow = removeDiacritics(compEn.toLowerCase());
      const storyRecycled = storyEn.includes('recycl');
      const compRecycled = compLow.includes('recycl');
      if (storyRecycled && !compRecycled) {
        findings.push({
          sku,
          field: 'Composition',
          finding: 'Composition omits "recycled" present in name/details',
          notes: `EN Composition: "${compEn}" omits recycled although name/details say recycled // Fix: human - confirm against the supplier spec, then add "recycled" to the composition cell`,
          priority_hint: '',
        });
        flags.push('composition-omits-recycled');
      } else if (compRecycled && !storyRecycled) {
        findings.push({
          sku,
          field: 'Composition',
          finding: 'Composition claims "recycled" absent from name/details',
          notes: `EN Composition: "${compEn}" says recycled but the name and descriptions do not | Fix: human - confirm the recycled claim and mention it in the description (or remove it from the composition)`,
          priority_hint: '',
        });
        flags.push('composition-extra-recycled');
      }
    }
  }

  // ---- B7: duplicate concepts ---------------------------------------------
  for (const lang of TEXT_LANGS) {
    const o = byLang[lang];
    if (!o) continue;
    const seen = new Map<SpecConcept, string[]>();
    for (const key of Object.keys(o.specs)) {
      const concept = specConcept(key);
      if (!concept) continue;
      const keys = seen.get(concept) ?? [];
      keys.push(key);
      seen.set(concept, keys);
    }
    for (const [concept, keys] of seen) {
      if (keys.length < 2) continue;
      findings.push({
        sku,
        field: 'Technical information',
        finding: `${lang} Technical Information repeats the ${concept} concept`,
        notes: `${lang} has ${keys.map((k) => `"${k}"`).join(' and ')} mapping to ${concept} | Fix: human - keep one row per concept in Magento (labels differ per language)`,
        priority_hint: '',
      });
      flags.push(`spec-duplicate-${lang.toLowerCase()}-${concept}`);
    }
  }

  // ---- B8: leftover markup ------------------------------------------------
  for (const lang of TEXT_LANGS) {
    const o = byLang[lang];
    if (!o) continue;
    for (const key of Object.keys(o.specs)) {
      const value = o.specs[key] ?? '';
      const raw = o.specs_raw?.[key] ?? '';
      const lastLine = (raw.split(/\r?\n/).pop() ?? '');
      const issues: string[] = [];
      if (/\S[ \t]+$/.test(lastLine)) issues.push('trailing space');
      if (/&nbsp;/i.test(raw) || /\u00a0/.test(value)) issues.push('non-breaking space');
      if (/&amp;(?:[a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);/i.test(raw)) {
        issues.push('double-encoded entity');
      }
      if (/<[a-z/][^>]*>/i.test(value)) issues.push('literal HTML tag');
      if (
        /&(?!amp;|quot;|apos;|lt;|gt;|#39;)(?:[a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);/i.test(value)
      ) {
        issues.push('entity in value');
      }
      if (specConcept(key) !== 'dimensions' && /[[\]]/.test(value)) issues.push('brackets');
      if (issues.length === 0) continue;
      findings.push({
        sku,
        field: 'Technical information',
        finding: `${lang} Technical Information "${key}" has leftover markup`,
        notes: `${lang} value "${value}" contains: ${issues.join(', ')} | Fix: human - clean the attribute text in Magento`,
        priority_hint: '',
      });
      flags.push(`spec-markup-${lang.toLowerCase()}`);
    }
    for (const key of Object.keys(o.specs)) {
      if (!/<[a-z/][^>]*>/i.test(key) && !/&(?:[a-z][a-z0-9]+|#\d+);/i.test(key)) continue;
      findings.push({
        sku,
        field: 'Technical information',
        finding: `${lang} Technical Information label "${key}" has leftover markup`,
        notes: `${lang} attribute label "${key}" contains markup/entities | Fix: human - clean the attribute label in Magento`,
        priority_hint: '',
      });
      flags.push(`spec-markup-${lang.toLowerCase()}-label`);
    }
  }

  return { findings, flags };
}

export function getTextChecks(
  sku: string,
  byLang: LangMap,
  genderRules: GenderRules = GENDER_RULES,
  compositionRules: CompositionRules | null = COMPOSITION_RULES,
  /** Languages the caller asked for; an unrequested page is not "missing". */
  requested: TextLang[] = TEXT_LANGS,
  /** L1 breadcrumb (storefront category); selects the B2 required set. */
  category = '',
  /** L2 breadcrumb (storefront subcategory). */
  subcategory = '',
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
    const comp = specValue(o.specs, 'composition');
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

  const displayBrand = specValue(en.specs, 'brand');
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

  // ---- technical information (spec table) - B1..B8 ------------------------
  const specChecks = getSpecTableChecks(
    sku,
    byLang,
    requested,
    category,
    subcategory,
    compositionRules,
  );
  findings.push(...specChecks.findings);
  flags.push(...specChecks.flags);

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
  /** EN breadcrumb L1 (storefront category) - selects the B2 required set. */
  category?: string;
  /** EN breadcrumb L2 (storefront subcategory). */
  subcategory?: string;
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
    input.category ?? '',
    input.subcategory ?? '',
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
