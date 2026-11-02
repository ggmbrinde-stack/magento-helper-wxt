# Supplier images — download a Makito gallery to disk

Status: **Makito only** (2026-11-02). `src/audit/makitoImages.ts`, wired through
`DOWNLOAD_MAKITO_IMAGES` and a button on the supplier card in **Resolve SKU**.

## What it does

Given a SKU and a **confirmed** supplier product URL, it opens that page in a
background tab, reads the product gallery, and saves every photo to:

```
Downloads/Makito/<SKU>/01-<SKU>-<image-name>.<ext>
Downloads/Makito/<SKU>/02-<SKU>-<image-name>.<ext>
```

The index is zero padded so a folder sorts in gallery order, and the SKU is in
every filename so images cannot be mixed up once they leave the supplier folder.

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
- The download itself is a normal Chrome download of the image URL. If the
  shop's WAF refuses those requests too, Chrome reports the download as
  interrupted and the card says so instead of pretending it worked.

## Preconditions

The button is enabled only when the SKU is Makito **and** a confirmed catalogue
URL exists — from the SKU Library `Supplier Product` column (Notion) or
`src/audit/rules/supplierCatalog.ts`. A guessed URL (or none, e.g. `M22532`
today) leaves it disabled with an explanation, because a site-search page has no
gallery to scrape.

The backend re-validates: the SKU must resolve to MAKITO, the URL must be HTTPS
on an approved Makito host, and the tab's final URL must still be on one of
those hosts — a redirect elsewhere aborts before anything is downloaded.

## How the gallery is read

1. Prime lazy images, then poll the DOM up to 8 times (750 ms apart).
2. Prefer PrestaShop's large-image attributes (`data-image-large-src`,
   `data-zoom-image`, `.js-qv-product-cover`, `.product-images`), then generic
   gallery containers, then `main`/`body`.
3. Skip images smaller than 80 px, which removes logos, payment badges and
   icons.
4. Collapse `-large_default` / `-home_default` / `-thickbox_default` variants of
   the same photo, keeping the first (largest). One photo, one file.

## Report

The card reports what reached the disk, not what was queued:

```
Saved 6 of 8 images to Downloads/Makito/M22477. 2 failed (FORBIDDEN).
```

Every stage is verified before claiming success — tab load, gallery found,
download started, download completed. A failure at any point names the stage.

## Extending to another supplier

`isMakitoUrl` / `MAKITO_HOSTS` and the `supplierFor(sku) === 'MAKITO'` guard are
the only Makito-specific parts of the orchestration. For ROLY (which serves a
sitemap and allows plain requests) the tab step can be skipped and the images
fetched directly; for TOPTEX, confirm first that a product page is reachable at
all — the catalogue URLs are still unresolved there.

## Tests

`npm run test:makito` — 11 deterministic tests over the stubbed
tabs/scripting/downloads APIs: host validation, size-variant de-duplication,
filename shape, refused and interrupted downloads, off-domain redirect, and an
empty gallery. No browser needed.
