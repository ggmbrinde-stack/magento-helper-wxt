/**
 * SKU -> supplier catalogue URL map (D1).
 *
 * This is the *confirmed* side of supplier linking: an entry here is a URL a
 * human has checked, so the availability check can use it without guessing.
 * Keys are upper-cased SKUs (or a supplier prefix, e.g. `TTFL*`).
 *
 * Populate it from the SKU Library `Supplier Product` column as rows are
 * confirmed - the resolver reads that column first, this map second, and only
 * falls back to a pattern guess (marked `guessed`) when both are empty.
 *
 * A glob key (`TTFL*: 'https://toptex.eu/...'`) is NOT supported on purpose:
 * a prefix URL points at a catalogue, not at a product, and treating a
 * catalogue page as proof of availability is exactly the false positive this
 * map exists to remove.
 */
export const SUPPLIER_CATALOG: Record<string, string> = {};
