/**
 * Audit lane — public API.
 *
 * The audit lane owns everything that *reads* a Magento product and *writes a
 * verdict*: resolver reads, the image/text audits, the Notion read side, the
 * two writers, evidence export, and the reporting checks.
 *
 * Every other lane (automation, UI, the background routers) imports from THIS
 * file only. A deep import — `../audit/payload` — is rejected by
 * `npm run check:lanes`, so a module can be moved or split inside the lane
 * without touching a single caller.
 *
 * The lane may read `src/shared/**` freely and never imports automation.
 */

export * from './coverageCheck';
export * from './dossierContent';
export * from './evidence/diagnose';
export * from './evidence/export';
export * from './evidence/folder';
export * from './imageAudit';
export * from './imageFetch';
export * from './listingWriter';
export * from './makitoImages';
export * from './notionHealth';
export * from './payload';
export * from './skuLibraryWriter';
export * from './skuResolution';
export * from './statusReport';
export * from './supplierAvailability';
export * from './supplierLinks';
export * from './textAudit';
export * from './textFetch';
export * from './variantLabels';
export * from './variants';
