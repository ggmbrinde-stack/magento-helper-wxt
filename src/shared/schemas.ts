import { z } from 'zod';

// Zod schemas for the two Notion databases (see Build Plan sections 4.1/4.2).
// Every Notion row is validated before use; invalid rows are skipped with a
// reason and never reach the UI.

// Empty string is allowed for URL fields: most rows only fill some of them.
const urlOrEmpty = z.union([z.string().url(), z.literal('')]);

export const SkuLibrarySchema = z.object({
  id: z.string().default(''),
  sku: z.string().min(1),
  backend: urlOrEmpty.default(''),
  frontend: urlOrEmpty.default(''),
  category: z.string().default(''),
  subcategory: z.string().default(''),
  supplier: z.string().default(''),
  colors: z.string().default(''),
  sizes: z.string().default(''),
  missingCombos: z.string().default(''),
  status: z.string().default(''),
  lastAudit: z.string().default(''),
});
export type SkuLibrary = z.infer<typeof SkuLibrarySchema>;

export const ListingErrorSchema = z.object({
  id: z.string().default(''),
  title: z.string().min(1),
  sku: z.string().min(1),
  errorGroup: z.array(z.string()).default([]),
  errorType: z.array(z.string()).default([]),
  field: z.string().default(''),
  language: z.string().default(''),
  fixLocation: z.string().default(''),
  priority: z
    .string()
    .transform((p) => {
      const normalised = p.trim().toLowerCase();
      if (normalised === 'high' || normalised === 'p1' || normalised === '1') return 'High';
      if (normalised === 'medium' || normalised === 'med' || normalised === 'p2' || normalised === '2') return 'Medium';
      if (normalised === 'low' || normalised === 'p3' || normalised === '3') return 'Low';
      return 'Low'; // unknown values fall back to Low
    })
    .default('Low'),
  status: z.string().default(''),
  link: urlOrEmpty.default(''),
  notes: z.string().default(''),
  source: z.string().default(''),
  supplier: z.string().default(''),
  brand: z.string().default(''),
  csvRow: z.string().default(''),
});
export type ListingError = z.infer<typeof ListingErrorSchema>;

export interface ValidatedRows<T> {
  rows: T[];
  skipped: number;
}

/** Validate mapped rows; returns the valid rows plus a skip count. */
export function validateRows<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  raw: Record<string, unknown>[],
): ValidatedRows<T> {
  const rows: T[] = [];
  let skipped = 0;
  for (const row of raw) {
    const parsed = schema.safeParse(row);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      skipped += 1;
    }
  }
  return { rows, skipped };
}
