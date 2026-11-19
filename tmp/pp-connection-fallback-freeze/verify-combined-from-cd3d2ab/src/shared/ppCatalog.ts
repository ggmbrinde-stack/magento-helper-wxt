import { z } from 'zod';

export const PP_CATALOG_DATABASE = '417b6705-ae1f-81ba-bdfd-c46a86fe4b54';
export const PP_CATALOG_DATA_SOURCE = '431b6705-ae1f-83db-b71c-0739778f9e1a';

export const PpCatalogDefinitionSchema = z.object({
  pageId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  code: z.string(),
  name: z.string(),
  reviewStatus: z.string().nullable(),
  faces: z.array(z.string()).nullable(),
  options: z.array(z.string()).nullable(),
  techniques: z.array(z.string()).nullable(),
  faceCount: z.number().nullable(),
  locationCount: z.number().nullable(),
  body: z.array(z.string()),
  warnings: z.array(z.string()),
  lastEditedAt: z.string().nullable(),
});
export type PpCatalogDefinition = z.infer<typeof PpCatalogDefinitionSchema>;

export const PpCatalogResponseSchema = z.object({
  status: z.enum(['found', 'not-found', 'multiple', 'auth', 'access', 'network', 'partial', 'unavailable', 'invalid']),
  code: z.string(),
  checkedAt: z.string(),
  reason: z.string(),
  definition: PpCatalogDefinitionSchema.optional(),
}).refine(response => response.status !== 'found' || response.definition !== undefined);
export type PpCatalogResponse = z.infer<typeof PpCatalogResponseSchema>;

export const PpCatalogIndexRowSchema = z.object({
  pageId: PpCatalogDefinitionSchema.shape.pageId.nullable(),
  code: z.string().nullable(),
  name: z.string().nullable(),
  reviewStatus: z.string().nullable(),
});
export type PpCatalogIndexRow = z.infer<typeof PpCatalogIndexRowSchema>;
export const PpCatalogIndexPageSchema = z.object({
  status: z.enum(['page', 'auth', 'access', 'network', 'unavailable', 'invalid']),
  rows: z.array(PpCatalogIndexRowSchema).max(100),
  hasMore: z.boolean(), nextCursor: z.string().nullable(),
  checkedAt: z.string(), reason: z.string(),
});
export type PpCatalogIndexPage = z.infer<typeof PpCatalogIndexPageSchema>;

/** A supported edit record, never a storefront or create/duplicate route. */
export function ppCatalogEntity(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/^https:\/\/(bestofgifts\.(pt|eu|es|fr)|bestofgifts-pt-qa\.toogas\.net)$/.test(parsed.origin)) return null;
    return parsed.pathname.match(/\/toogas_attributesetcustomoptions\/attributesetcustomoptions\/edit\/attributesetcustomoptions_id\/(\d+)(?:\/|$)/)?.[1] ?? null;
  } catch { return null; }
}
