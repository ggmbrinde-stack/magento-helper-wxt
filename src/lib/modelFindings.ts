/**
 * Vision findings -> Listing Errors payloads.
 *
 * The model only describes what it sees (`view`, `background`, `concerns`). The
 * board rules that decide what becomes an error row live here, so the prompt can
 * stay descriptive and the taxonomy stays in one place:
 *
 *   - model shot shared across colours .... Model image on simple (Configurable)
 *   - model shot on one colour only ....... Remove Model image (Simple)
 *   - shared detail/ambience shot ......... Model image on simple (Configurable)
 *   - printing/instruction sheet .......... Printing instruction sheet (Simple)
 *   - overlaid text on pos0 ............... Text on image (Simple)
 *
 * A simple product (single colour) is still flagged, but the fix is waived:
 * there is no configurable parent to move the shot to.
 *
 * Pure: no fetching, no Notion. Callers merge the result into the audit
 * payloads and persist both together.
 */

import { readMediaMaps, type MediaSource } from './imageAudit';
import { EM_DASH, priorityFor, type ListingErrorPayload } from './payload';
import type { ModelVerdict } from './modelSort';

const GROUP = 'Images';
const MAX_EXAMPLES = 4;
const MAX_NOTES = 900;
const LANGUAGE = 'All Store Views';

export interface ModelFindingContext {
  sku: string;
  link: string;
  supplier: string;
  category?: string | null;
  subcategory?: string | null;
  isSimple: boolean;
  media: MediaSource[];
  childColor?: Record<string, string>;
  existingTitles?: string[];
}

interface Bucket {
  type: string;
  fixLocation: string;
  fix: string;
  examples: string[];
}

/**
 * URLs that appear on more than one child. A shared model/detail shot belongs to
 * the configurable parent, not to the individual simple products.
 */
export function sharedImageUrls(media: MediaSource[]): Set<string> {
  const maps = readMediaMaps(media);
  const childrenByUrl = new Map<string, Set<string>>();
  for (const [child, byLang] of Object.entries(maps)) {
    for (const entries of Object.values(byLang)) {
      for (const entry of entries) {
        const children = childrenByUrl.get(entry.url) ?? new Set<string>();
        children.add(child);
        childrenByUrl.set(entry.url, children);
      }
    }
  }
  const shared = new Set<string>();
  for (const [url, children] of childrenByUrl) {
    if (children.size > 1) shared.add(url);
  }
  return shared;
}

/** Lowest gallery position per child (Magento positions are 1-based). */
function firstPositions(media: MediaSource[]): Map<string, number> {
  const maps = readMediaMaps(media);
  const first = new Map<string, number>();
  for (const [child, byLang] of Object.entries(maps)) {
    let min = Number.POSITIVE_INFINITY;
    for (const entries of Object.values(byLang)) {
      for (const entry of entries) {
        if (entry.pos < min) min = entry.pos;
      }
    }
    if (Number.isFinite(min)) first.set(child, min);
  }
  return first;
}

export function modelVerdictPayloads(
  verdict: ModelVerdict,
  ctx: ModelFindingContext,
): ListingErrorPayload[] {
  const shared = sharedImageUrls(ctx.media);
  const firstPos = firstPositions(ctx.media);
  const buckets = new Map<string, Bucket>();

  const add = (
    type: string,
    fixLocation: string,
    fix: string,
    example: string,
  ): void => {
    const bucket = buckets.get(type) ?? { type, fixLocation, fix, examples: [] };
    if (bucket.examples.length < MAX_EXAMPLES) bucket.examples.push(example);
    buckets.set(type, bucket);
  };

  for (const image of verdict.images) {
    const view = image.view.trim().toLowerCase();
    const color = image.child ? (ctx.childColor?.[image.child] ?? '').trim() : '';
    const pos = image.pos === undefined ? '' : `pos${image.pos}`;
    const who = [color, pos].filter(Boolean).join(' ') || 'image';
    const isShared = shared.has(image.url);
    const waived = ctx.isSimple ? ' (fix waived: single-colour product)' : '';

    if (view === 'model' || view === 'model-worn' || view === 'model worn') {
      if (isShared && !ctx.isSimple) {
        add(
          'Model image on simple',
          'Configurable',
          'Move the shared model shot to the configurable parent',
          `${who} is a model shot shared across colours`,
        );
      } else {
        add(
          'Remove Model image',
          'Simple',
          'Remove the model image from this colour',
          `${who} is a model shot${waived}`,
        );
      }
    } else if (view === 'detail' || view === 'ambience' || view === 'lifestyle') {
      if (isShared) {
        add(
          'Model image on simple',
          'Configurable',
          'Move the shared detail/ambience shot to the configurable parent',
          `${who} is a shared ${view} shot`,
        );
      }
    }

    if (view === 'printing' || view === 'instruction') {
      add(
        'Printing instruction sheet',
        'Simple',
        'Remove the printing/instruction sheet from the carousel',
        `${who} is a printing/instruction sheet`,
      );
    }

    for (const concern of image.concerns) {
      const text = concern.trim().toLowerCase();
      if (!text) continue;
      if (/printing|instruction|decorat|spec ?sheet|size chart|how to/.test(text)) {
        add(
          'Printing instruction sheet',
          'Simple',
          'Remove the printing/instruction sheet from the carousel',
          `${who}: ${concern.trim()}`,
        );
      } else if (/\btext\b|lettering|caption|overlay|watermark/.test(text)) {
        const isPos0 = image.child
          ? firstPos.get(image.child) === image.pos
          : image.pos === 1;
        if (isPos0) {
          add(
            'Text on image',
            'Simple',
            'Replace the main image with a clean product shot',
            `${who}: ${concern.trim()}`,
          );
        }
      }
    }
  }

  const existing = new Set(ctx.existingTitles ?? []);
  const payloads: ListingErrorPayload[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => a.type.localeCompare(b.type))) {
    const title = `${ctx.sku} ${EM_DASH} ${GROUP} ${EM_DASH} ${bucket.type}`;
    if (existing.has(title)) continue;
    const notes = truncate(`${bucket.examples.join('; ')} // Fix: ${bucket.fix}`, MAX_NOTES);
    payloads.push({
      dedup_key: `${ctx.sku}|${title}`,
      sku: ctx.sku,
      title,
      group: GROUP,
      type: bucket.type,
      fix_location: bucket.fixLocation,
      priority: priorityFor(GROUP, bucket.type),
      status: 'To Fix',
      flag: 'Normal',
      link: ctx.link || null,
      notes,
      fix: bucket.fix,
      notes_full: notes,
      source: 'Storefront',
      supplier: ctx.supplier,
      category: ctx.category ?? null,
      subcategory: ctx.subcategory ?? null,
      language: LANGUAGE,
      field: null,
      page_content: '',
      review_flags: [],
    });
  }
  return payloads;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
