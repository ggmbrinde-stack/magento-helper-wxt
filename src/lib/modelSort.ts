// Model scoring (stage `model-sort`) — candidates + review flags only.
//
// This stage asks a vision model what a human would have to look at anyway
// (printing instructions, model-worn shots on simple products, backgrounds).
// It never sets severity, never writes to Notion and never touches the payload
// blocks, so payload parity with the PowerShell pipeline is preserved.
//
// The model is reached through the local opencode bridge (see `modelBridge.ts`).
// If the bridge is down or the model answers badly, the SKU still succeeds and
// the failure is recorded as an anomaly.

import { z } from 'zod';
import { readMediaMaps, type MediaSource } from './imageAudit';
import { bridgeScore, createBridgeSession, deleteBridgeSession } from './modelBridge';
import type { ModelBridgeConfig } from './modelBridge';

export const MODEL_VERDICT_SCHEMA = 'bog-model-verdict/v1';

const MAX_IMAGES = 8;
const IMAGES_PER_CHILD = 2;
const MAX_SIDE = 768;
const JPEG_QUALITY = 0.82;
const MAX_IMAGE_BYTES = 6000000;

const VerdictSchema = z.object({
  sku: z.string(),
  images: z.array(
    z.object({
      id: z.string(),
      view: z.string(),
      background: z.string(),
      concerns: z.array(z.string()),
    }),
  ),
  flags: z.array(z.string()),
});

export type RawModelVerdict = z.infer<typeof VerdictSchema>;

export interface ModelImageVerdict {
  url: string;
  /** Magento child id the image belongs to (filled in locally, not by the model). */
  child?: string;
  /** Carousel position on that child (filled in locally). */
  pos?: number;
  view: string;
  background: string;
  concerns: string[];
}

export interface ModelVerdict {
  schema: typeof MODEL_VERDICT_SCHEMA;
  sku: string;
  providerID: string;
  modelID: string;
  generated: string;
  images: ModelImageVerdict[];
  /** Candidate review flags. The auditor decides; this is not a severity. */
  flags: string[];
  ms: number;
  cost?: number;
}

export interface ModelSortInput {
  sku: string;
  frontendUrl?: string;
  category?: string;
  subcategory?: string;
  colors?: string[];
  sizes?: string[];
  media: MediaSource[];
  maxImages?: number;
}

/** JSON Schema handed to the model. Images are referenced by short ids only —
 * the model never sees (or echoes) the underlying URLs, which keeps the output
 * small and stops it inventing links. */
export const VERDICT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    sku: { type: 'string', description: 'The product SKU exactly as given.' },
    images: {
      type: 'array',
      description: 'One entry per attached image, using the given IMG id.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The IMG id from the prompt, e.g. IMG1.' },
          view: {
            type: 'string',
            description:
              'One of: front, back, side, detail, box, bag, ambience, model, printing, other.',
          },
          background: {
            type: 'string',
            description: 'One of: white, transparent, colored, unknown.',
          },
          concerns: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Short, concrete issues only (e.g. "printing instruction sheet", ' +
              '"model wearing a simple product", "colored background"). Empty when none.',
          },
        },
        required: ['id', 'view', 'background', 'concerns'],
        additionalProperties: false,
      },
    },
    flags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Catalogue-level concerns that need a human look. Empty when none.',
    },
  },
  required: ['sku', 'images', 'flags'],
  additionalProperties: false,
};

interface PickedImage {
  url: string;
  child: string;
  pos: number;
}

/**
 * Choose a small, representative image set: main image of each child first,
 * then the next positions, deduped by URL. Keeps the request cheap and makes
 * the verdict reproducible.
 */
export function pickImages(
  media: MediaSource[],
  maxImages = MAX_IMAGES,
  perChild = IMAGES_PER_CHILD,
): PickedImage[] {
  const maps = readMediaMaps(media);
  const picked: PickedImage[] = [];
  const seen = new Set<string>();
  const children = Object.keys(maps);
  const maxPos = Math.max(perChild, 1);

  for (let slot = 0; slot < maxPos; slot += 1) {
    for (const child of children) {
      if (picked.length >= maxImages) return picked;
      const byLang = maps[child] ?? {};
      const entries = byLang['EN'] ?? byLang['FN'] ?? Object.values(byLang)[0] ?? [];
      const entry = entries[slot];
      if (!entry || !/^https?:\/\//i.test(entry.url)) continue;
      if (seen.has(entry.url)) continue;
      seen.add(entry.url);
      picked.push({ url: entry.url, child, pos: entry.pos });
    }
  }
  return picked;
}

export function buildModelPrompt(input: ModelSortInput, images: PickedImage[]): string {
  const lines: string[] = [];
  lines.push(`Product SKU: ${input.sku}`);
  if (input.category || input.subcategory) {
    lines.push(
      `Catalogue category: ${[input.category, input.subcategory].filter(Boolean).join(' / ')}`,
    );
  }
  if (input.colors && input.colors.length > 0) {
    lines.push(`Colours: ${input.colors.join(', ')}`);
  }
  if (input.sizes && input.sizes.length > 0) {
    lines.push(`Sizes: ${input.sizes.join(', ')}`);
  }
  lines.push('');
  lines.push(
    `${images.length} image(s) are attached to this message, in order: ` +
      images.map((_, i) => `IMG${i + 1}`).join(', ') +
      '.',
  );
  lines.push('');
  lines.push(
    'For each attached image report its id (IMG1.), view, background, and any ' +
      'concrete concern. view must be one of: front, side, back, box, bag, ' +
      'detail, ambience, model, printing, other. Use "other"/"unknown" when you ' +
      'are not sure - do not guess.',
  );
  lines.push(
    'Concerns worth flagging: printing/decoration instruction sheets, size ' +
      'charts, model-worn shots, text or logos overlaid on the main image, ' +
      'colored backgrounds, visible watermarks, wrong product. Keep every ' +
      'concern under 12 words. Set flags to [] when nothing needs a human look.',
  );
  return lines.join('\n');
}

/** Fetch + optionally downscale an image and inline it as a data URL. */
export async function fetchImageDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const shrunk = await shrinkImage(blob).catch(() => null);
  if (shrunk) return shrunk;
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`image too large (${blob.size} bytes)`);
  }
  return blobToDataUrl(blob);
}

async function shrinkImage(blob: Blob): Promise<string | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return null;
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const longest = Math.max(bitmap.width, bitmap.height) || 1;
    const scale = Math.min(1, MAX_SIDE / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    return blobToDataUrl(out);
  } finally {
    bitmap.close();
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

function cleanList(values: string[], limit: number, maxLen = 160): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value.slice(0, maxLen));
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Run model scoring for one SKU. Creates a throw-away session unless the caller
 * supplies one (the batch runner reuses one session for the whole job).
 */
export async function scoreSkuImages(
  input: ModelSortInput,
  config: ModelBridgeConfig,
  opts: { sessionId?: string; timeoutMs?: number } = {},
): Promise<ModelVerdict> {
  const images = pickImages(input.media, input.maxImages ?? MAX_IMAGES);
  if (images.length === 0) {
    throw new Error('no image URLs available for model scoring');
  }

  const ownSession = !opts.sessionId;
  const sessionId =
    opts.sessionId ?? (await createBridgeSession(`bog-score-${input.sku}`, config));

  try {
    const started = Date.now();

    // The bridge only accepts inline images, so download + downscale here.
    const inlined = await Promise.all(
      images.map(async (img) => {
        try {
          return { ...img, dataUrl: await fetchImageDataUrl(img.url) };
        } catch {
          return { ...img, dataUrl: '' };
        }
      }),
    );
    const usable = inlined.filter((img) => img.dataUrl);
    const skipped = inlined.length - usable.length;
    if (usable.length === 0) {
      throw new Error('no image could be downloaded for model scoring');
    }

    const result = await bridgeScore(
      {
        sessionId,
        providerID: config.providerID,
        modelID: config.modelID,
        text: buildModelPrompt(input, usable),
        system:
          'You audit product images for a wholesale gift catalogue. ' +
          'Report only what is visibly true. Never invent a SKU, image or URL. ' +
          'Answer only through the structured schema.',
        images: usable.map((img) => img.dataUrl),
        schema: VERDICT_JSON_SCHEMA,
        retryCount: 1,
        timeoutMs: opts.timeoutMs,
      },
      config,
    );

    if (!result.ok) throw new Error(result.error ?? 'model scoring failed');

    const parsed = VerdictSchema.safeParse(result.structured);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `model returned an unexpected shape (${issue?.path.join('.') ?? 'root'}: ${issue?.message ?? 'invalid'})`,
      );
    }

    const byId = new Map<string, PickedImage>();
    usable.forEach((img, i) => byId.set(`IMG${i + 1}`, img));

    const described = new Set<string>();
    const verdictImages: ModelImageVerdict[] = [];
    let unknownIds = 0;
    for (const image of parsed.data.images) {
      const key = image.id.trim().toUpperCase();
      const match = byId.get(key);
      if (!match) {
        unknownIds += 1;
        continue;
      }
      described.add(key);
      verdictImages.push({
        url: match.url,
        child: match.child,
        pos: match.pos,
        view: image.view.trim().slice(0, 40) || 'other',
        background: image.background.trim().slice(0, 40) || 'unknown',
        concerns: cleanList(image.concerns, 6),
      });
    }

    const flags = cleanList(parsed.data.flags, 10);
    if (unknownIds > 0) {
      flags.push(`model referenced ${unknownIds} unknown image id(s)`);
    }
    if (skipped > 0) {
      flags.push(`${skipped} image(s) could not be downloaded for scoring`);
    }
    if (verdictImages.length !== usable.length) {
      flags.push(
        `model described ${verdictImages.length} of ${usable.length} attached image(s)`,
      );
    }

    return {
      schema: MODEL_VERDICT_SCHEMA,
      sku: input.sku,
      providerID: result.providerID ?? config.providerID,
      modelID: result.modelID ?? config.modelID,
      generated: new Date().toISOString(),
      images: verdictImages,
      flags: cleanList(flags, 12),
      ms: Date.now() - started,
      cost: result.cost,
    };
  } finally {
    if (ownSession) await deleteBridgeSession(sessionId, config);
  }
}

/** Count candidate flags for the batch table (0 when scoring was skipped). */
export function verdictFlagCount(verdict: ModelVerdict | undefined): number {
  return verdict ? verdict.flags.length : 0;
}
