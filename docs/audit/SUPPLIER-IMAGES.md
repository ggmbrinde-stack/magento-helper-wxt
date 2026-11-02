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
<evidence root>/MAKITO/<SKU>/01-<SKU>-<image-name>.<ext>
<evidence root>/MAKITO/<SKU>/02-<SKU>-<image-name>.<ext>
```

They sit directly in the SKU folder, next to the rest of its evidence — the same
`<root>/<SUPPLIER>/<SKU>` convention the audit itself uses, with no extra level
to click through.

Note that `scanSkuImages` in `mirrorManifest.ts` also reads raster files from the
flat SKU folder, so these gallery photos are reported as `extra` images by the
mirror drift check for that SKU. A folder named `images` is in `HIDDEN` there;
the loose files are not.

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

The gallery is Magento's **Fotorama** widget, but the *rendered* carousel is not
where it is read from. The download tab is opened in the background, where the
widget does not necessarily build, and the only `<img>` present before it does
is the placeholder — which is why a single image kept arriving even after the
first polling rewrite. The widget's data is stable, server-side truth:

1. Fetch the page's own HTML from inside the tab (`fetch(location.href)`), so
   the request carries the shop's cookies.
2. Unescape it (Magento writes `https:\/\/…` and `\"data\":` inside the
   `text/x-magento-init` script) and bracket-match the gallery's `data` array.
   Only that array is read, so related products further down the page do not
   leak into the gallery.
3. Fall back to a DOM scan (`.product.media`, `.gallery-placeholder`,
   `[data-gallery-role]`, `.fotorama`) for themes that render server-side.
4. Keep only `/media/catalog/product/` URLs — this drops `/media/amasty/...`
   label/badge images, which are not photos of the product.
5. Strip Magento's `/cache/<32-hex>/` segment. Every size is a separate cache
   hash of the same original, so this both collapses duplicates and gives the
   full-resolution file (`22482-W.jpg`, not an 88 px resized copy).
6. Fetch each remaining image **inside the page**, measure it with
   `createImageBitmap`, and drop anything under 200 px wide. Size is the only
   reliable signal: the gallery JSON also lists a 90×90 `<sku>_250.gif`
   thumbnail, which is not a photo.

For `M22482` the live page yields **10 photos** at 1080 px from 11 candidates.

## Finding the link automatically

Pasting a link still works, but it is no longer required. **Find product page**
on the supplier card — and the download button, which runs the lookup first
when no confirmed link exists — asks the shop:

1. Our SKU `M22482` is the shop's reference `22482`; the product page prints
   `REF:` without our prefix.
2. Open `www.makito.eu/es/catalogsearch/result/?q=22482` in a background tab.
   The shop redirects a single hit straight to the product page.
3. Read the product block's printed reference (`Ref: 22498`) from a **parsed
document** and accept the page only if it matches. Slicing the HTML by the
first `product-info-main` marker does not work: the marker appears in the head
and the printed reference sits a megabyte further down. A wrong product would
mean images saved under the wrong SKU, so an ambiguous answer is reported as
no match rather than guessed.
4. Store the match as this SKU's catalogue link (`supplierUrlOverrides`), so the
   dossier, the availability check and the image download all use it from then
   on.

Searching for the whole SKU (`M22482`) finds nothing, and Magento's `/graphql`
answers `403` behind Akamai — which is why the reference, not the SKU, is what
gets searched.

## Report

The card reports what reached the disk, not what was queued:

```
Saved 10 of 10 images to Corrections/MAKITO/M22482.
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

`npm run test:makito` — 21 deterministic tests over the stubbed
tabs/scripting/downloads APIs: host validation, Magento cache-variant
de-duplication, thumbnail filtering by measured size, filename shape, refused
and interrupted downloads, off-domain redirect, an empty gallery, and the
reference-based product lookup. No browser needed.
