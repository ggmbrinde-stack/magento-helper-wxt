// Canonical Notion option contract shared by both writers and the health check.
//
// The extension must never invent a select value. These arrays mirror the live
// Listing Errors and SKU Library databases. Keep them in sync deliberately:
//  - Listing Errors and SKU Library use the same Category/Subcategory taxonomy.
//  - ALLBEST is stored as "ALLBEST" in both the Listing Errors DB and the SKU
//    Library. canonicalSupplier() targets Listing Errors;
//    canonicalSkuLibrarySupplier() targets the SKU Library.

export const CATEGORY_OPTIONS = [
  'Promotional Textile',
  'Sports Textiles',
  'Workwear Textile',
  'Technology',
  'Bags and Backpacks',
  'Writing and Office',
  'Outdoors and Events',
  "Children's and Pets",
  'House and Wine',
  'Personal',
  'DIY and Auto',
  '100% MADE4YOU',
  'Other',
  'Sweatshirts',
  'Hoodies',
  'Zip Hoodies',
] as const;

export const SUBCATEGORY_OPTIONS = [
  'T-shirts', 'Polo Shirts', 'Sweatshirts', 'Jackets', 'Vests',
  'Caps and Hats', 'Underwear', 'Textile 100% MADE4YOU', 'Polos Shirts',
  'Pants and Shorts', 'Sports Accessories', 'Tracksuits', 'Caps and Beanies',
  'High Visibility', 'Industry', 'Health and Beauty', 'HORECA', 'USB',
  'Powerbanks and Chargers', 'Computer Accessories',
  'Mobile Phone and Tablet Accessories', 'Music Accessories',
  'Photography and Video Accessories', 'Lighting Accessories',
  'Clocks and Digital Stations', 'Bags', 'Backpacks', 'Messenger Bags',
  'Other Bags', 'Insulated Bags', 'Trolleys', 'Desk Accessories', 'Pens',
  'Pencils and Mechanical Pencils', 'Notepads and Notebooks', 'Document Holders',
  'Winter', 'Summer and Beach', 'Outdoor Accessories', 'Travel Accessories',
  'Events and Party', 'Christmas Special', 'Games', 'School Accessories',
  "Children's Textiles 100% MADE4YOU", "Children's Textiles",
  "Children's Sports Textiles", 'Toys', "Children's Utilities", 'Pet Accessories',
  'Kitchen Accessories', 'Mugs And Cups', 'Bottles', 'Tea and Coffee Accessories',
  'Wine Accessories', 'Bar Accessories', 'Decoration Accessories', 'Lanyards',
  'Keychains', 'Coin Purses and Cardholders', 'Hygiene Accessories',
  'Beauty Accessories', 'Health Accessories', 'Fashion and Footwear Accessories',
  'Tools', 'Car Accessories', 'Flashlights', 'Lighters And Ashtrays',
  'Exclusive Items', 'Stationery', 'Flags And Displays',
] as const;

export const ERROR_GROUP_OPTIONS = [
  'Images',
  'Text / Translation',
  'Product Information',
  'Category',
  'Other',
] as const;

export const ERROR_TYPE_OPTIONS = [
  'Wrong image order',
  'Remove Model image',
  'Duplicate image',
  'Grey background',
  'Missing image',
  'Translation error',
  'Wrong product information',
  'Wrong category',
  'Other',
  'Model image on simple',
  'Printing instruction sheet',
  'Text on image',
] as const;

export const ERROR_FLAG_OPTIONS = ['Normal', 'Complex'] as const;
export const LISTING_STATUS_OPTIONS = ['To Fix'] as const;
export const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'] as const;
export const FIX_LOCATION_OPTIONS = ['Configurable', 'Simple'] as const;

export const LANGUAGE_OPTIONS = [
  'EN',
  'ES',
  'FR',
  'Systemic',
  'All Store Views',
] as const;

export const SOURCE_OPTIONS = ['Storefront', 'Magento export'] as const;

export const FIELD_OPTIONS = [
  'name',
  'short_description',
  'description',
  'body',
  'row-missing',
  'file-wide',
  'name-vs-body',
  'name-vs-description',
  'name-vs-short_description',
  'name+body',
  'name+short_description',
  'short_description+description',
  'short_description-vs-description',
  'gender',
  'composition',
  'dimensions',
  'brand',
  'country',
] as const;

export const LISTING_ERROR_SUPPLIER_OPTIONS = [
  'MAKITO',
  'ROLY',
  'STAMINA',
  'MIDOCEAN',
  "SOL'S",
  'ALLBEST',
  'PAUL STRICKER',
  'TEJOBRINDE',
  'PF CONCEPT',
  'TOPTEX',
  'BISCANA (THC)',
  'CIFRA',
  'AODACI',
  'WORKTEAM',
  'XD CONNECTS',
  'GIVING',
  'JHK',
] as const;

/**
 * Supplier options in the SKU Library database.
 * Note: "Other - Unknown" uses a dash because Notion rejects slashes
 * in select option names during schema import.
 */
export const SKU_LIBRARY_SUPPLIER_OPTIONS = [
  'MAKITO',
  'ROLY',
  'MIDOCEAN',
  "SOL'S",
  'ALLBEST',
  'PF CONCEPT',
  'TOPTEX',
  'TEJOBRINDE',
  'GIVING Europe',
  'XD Connects',
  'Other - Unknown',
] as const;

export const LIBRARY_STATUS_OPTIONS = [
  'Clean',
  'To Fix',
  'Audited',
  'Corrected',
] as const;

/**
 * Normalise a supplier name to the canonical option used by the Listing Errors
 * database. Unknown values are returned trimmed so the writer's validation can
 * report them instead of silently inventing an option.
 */
export function canonicalSupplier(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const direct = LISTING_ERROR_SUPPLIER_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  );
  return direct ?? trimmed;
}

/**
 * Normalise a supplier name to the canonical option used by the SKU Library
 * database. ALLBEST is plain here (no "(interno)" suffix).
 */
export function canonicalSkuLibrarySupplier(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  const direct = SKU_LIBRARY_SUPPLIER_OPTIONS.find(
    (option) => option.toLowerCase() === trimmed.toLowerCase(),
  );
  return direct ?? trimmed;
}

function canonicalFrom(
  value: string | null | undefined,
  options: readonly string[],
): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  return (
    options.find((option) => option.toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

export function canonicalCategory(value: string | null | undefined): string | null {
  return canonicalFrom(value, CATEGORY_OPTIONS);
}

export function canonicalSubcategory(
  value: string | null | undefined,
): string | null {
  return canonicalFrom(value, SUBCATEGORY_OPTIONS);
}

export function isOption(
  value: string | null | undefined,
  options: readonly string[],
): boolean {
  return Boolean(canonicalFrom(value, options));
}
