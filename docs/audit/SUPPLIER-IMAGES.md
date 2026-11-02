# Supplier images — download a Makito gallery to disk

Status: **Makito only** (2026-11-02). `src/audit/makitoImages.ts`, wired through
`DOWNLOAD_MAKITO_IMAGES` and a button on the supplier card in **Resolve SKU**.

The shop is **Magento 2** (not PrestaShop) and is always read from the EU site,
`www.makito.eu` — `makito.es` redirects/serves the same catalogue but the EU
host is the one to link to.

## What it does

Given a SKU and a **confirmed** supplier product URL, it opens that page in a
background tab, reads the product gallery, and saves every photo into the
**image corrections folder** — the folder picked in *Run audit* — under the SKU
it belongs to:

```
<evidence root>/MAKITO/<SKU>/images/01-<SKU>-<image-name>.<ext>
<evidence root>/MAKITO/<SKU>/images/02-<SKU>-<image-name>.<ext>
```

That is the same `<root>/<SUPPLIER>/<SKU>` convention the audit itself uses, and
`images` is already in `HIDDEN` in `mirrorManifest.ts`, so verification and the
tidy step ignore the folder: downloading a gallery never changes what the audit
thinks of a SKU.

The index is zero padded so a folder sorts in gallery order, and the SKU is in
every filename so images cannot be mixed up once they leave the supplier folder.

When no evidence folder is picked (or write permission was refused), the images
go to `Downloads/Makito/<SKU>/` instead and the card says so — a download button
that silently fails because a folder was never chosen would be worse.

## Why a real tab and not a fetch

Makito answers `403 Access Denied` to every automated request — verified from
the terminal with a browser user-agent on `makito.eu`, `www.makito.eu` and
`makito.es`. A fetch from the service worker is refused for the same reason a
`curl` is. A tab is a real navigation, so the page renders and the DOM can be
read; `chrome.scripting.executeScript` then collects the gallery.

Consequences worth knowing:

- The tab is created **inactive** and always closed, including on failure —
  the operator's own tab is never navigated or closed.
- The page is mutated in that throwaway tab to defeat lazy loading (images get
  `loading="eager"` and their `data-src` promoted). That is why the tab is
  disposable.
- With an evidence folder the image bytes are fetched **inside that page**, so
  the request carries the shop's own cookies, then written through the File
  System Access handle. Without one, the download is a normal Chrome download
  of the image URL. Either way, if the shop's WAF refuses the requests, the card
  says so instead of pretending it worked.

## Preconditions

The button is enabled only when the SKU is Makito **and** a confirmed catalogue
URL exists. A search page has no gallery to scrape, so it never counts.

Three sources, highest precedence first:

1. **A link pasted in the dashboard** — the *Supplier product link* field on the
   supplier card. Stored per SKU in `chrome.storage.local`
   (`supplierUrlOverrides`), so it survives a reload and applies to the dossier
   and the download from then on. `Clear` forgets it.
2. **SKU Library `Supplier Product`** (Notion).
3. **`src/audit/rules/supplierCatalog.ts`** — seeded defaults.

Nothing is stored until it passes validation in `checkSupplierUrl`: HTTPS, on
one of *that supplier's* official/alt hosts, not the home page, and not a search
results page. The rejection names the reason, e.g. *"That link is on roly.eu;
MAKITO product pages are on makito.eu or makito.es."*

The backend re-validates: the SKU must resolve to MAKITO, the URL must be HTTPS
on an approved Makito host, and the tab's final URL must still be on one of
those hosts — a redirect elsewhere aborts before anything is downloaded.

## How the gallery is read

The gallery is Magento's **Fotorama** widget inside `.product.media`. It is
built after first paint, so reading it once is what used to return a single
image: the only `<img>` present at that moment is the placeholder.

1. Prime lazy images once.
2. Poll every 450 ms, up to 12 times, and keep the **largest** set seen. Stop
   only after the count has been stable for 3 consecutive polls, so the growing
   gallery is never truncated by an early return. A page with no gallery gives
   up after the full poll budget and reports it.
3. Read roots in order: `.product.media`, `.gallery-placeholder`,
   `[data-gallery-role]`, `.fotorama`. From each `<img>` take
   `data-image-large-src`, `data-zoom-image`, `data-src`, `src`/`currentSrc`,
   every `srcset` entry, and the wrapping `<a href>`.
4. Keep only `/media/catalog/product/` URLs — this drops `/media/amasty/...`
   label/badge images, which are not photos of the product.
5. Strip Magento's `/cache/<32-hex>/` segment. Every size is a separate cache
   hash of the same original, so stripping it both collapses the duplicates and
   gives the full-resolution file (`22482-W.jpg`, not a 88 px resized copy).
6. Drop a *direct* original that renders smaller than 200 px. Magento stores
   `<sku>_250.gif` 90×90 previews next to the photos, and a direct URL renders
   at the file's real size. A cached derivative is full size however small its
   thumbnail renders, so those always count.

For `M22482` the live page yields **10 photos** (1080×1080) and no preview gif.

## When the link is unknown

The supplier card shows *Catalogue source: no URL known* plus a **Find by SKU**
link. Makito cannot be searched by our SKU: `M22482` and `M22473` return no
results on `/es/catalogsearch/result/?q=`, and Magento's `/graphql` is behind
Akamai (`403 Access Denied`). The page also shows the reference without the `M`
prefix (`REF: 22482`).

So the link is not discoverable automatically today. Open the product by hand,
copy its address, and paste it into the field on the card; it then applies to
that SKU permanently.

## Report

The card reports what reached the disk, not what was queued:

```
Saved 10 of 10 images to Corrections/MAKITO/M22482/images.
Saved 6 of 8 images to Downloads/Makito/M22477. 2 failed (FORBIDDEN).
```

Every stage is verified before claiming success — tab load, gallery settled,
image fetched/written. A failure at any point names the stage.

## Extending to another supplier

`isMakitoUrl` / `MAKITO_HOSTS` and the `supplierFor(sku) === 'MAKITO'` guard are
the only Makito-specific parts of the orchestration. For ROLY (which serves a
sitemap and allows plain requests) the tab step can be skipped and the images
fetched directly; for TOPTEX, confirm first that a product page is reachable at
all — the catalogue URLs are still unresolved there.

## Tests

`npm run test:makito` — 13 deterministic tests over the stubbed
tabs/scripting/downloads APIs: host validation, Magento cache-variant
de-duplication, thumbnail filtering, filename shape, refused and interrupted
downloads, off-domain redirect, and an empty gallery. No browser needed.
