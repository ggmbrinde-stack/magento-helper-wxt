// What page are we on?
//
// Feature mounting used to be decided by sniffing the DOM for anything that
// looked familiar — `document.querySelector('.options')`,
// `document.querySelectorAll('table')` — which is how a tier-price button could
// land on a page that has a table with a "Price" column but no product form.
// The admin URL already says which controller is running, so this resolves that
// once instead of guessing.
//
// Magento admin URLs are `/<frontname>/<module>/<controller>/<action>/…`. The
// frontname is per-install (`admin` on QA, `admin_L2pZx` on live), so it is
// dropped rather than matched.
//
// Note: grid AJAX (filter, sort, pager) does not change the URL, so a context
// alone cannot tell a re-rendered grid from the first render. Region scoping in
// the scan scheduler covers that; this resolver only answers "which page".

export type PageArea =
  | 'product-edit'
  | 'product-grid'
  | 'category'
  | 'customer'
  | 'other';

export interface PageContext {
  module: string;
  controller: string;
  action: string;
  /** `module/controller/action`, e.g. `catalog/product/edit`. */
  route: string;
  area: PageArea;
  /** Product id from `/id/<n>/` on an edit URL, when present. */
  productId?: string;
}

const AREA_BY_ROUTE: Record<string, PageArea> = {
  'catalog/product/edit': 'product-edit',
  'catalog/product/index': 'product-grid',
  'catalog/product/grid': 'product-grid',
  'catalog/category/index': 'category',
  'catalog/category/edit': 'category',
  'customer/index/index': 'customer',
};

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    // A relative href, or a string the URL parser rejects: take what is before
    // the query and let the segment parse deal with it.
    return url.split('#')[0]?.split('?')[0] ?? '';
  }
}

export function resolvePageContext(url: string): PageContext {
  const path = pathnameOf(url);
  const segments = path.split('/').filter(Boolean);

  const module = segments[1] ?? '';
  const controller = segments[2] ?? '';
  const action = segments[3] ?? '';
  const route = [module, controller, action].filter(Boolean).join('/');

  const productId = /\/id\/(\d+)(?:\/|$)/.exec(path)?.[1];
  const context: PageContext = {
    module,
    controller,
    action,
    route,
    area: AREA_BY_ROUTE[route] ?? 'other',
  };
  if (productId) context.productId = productId;
  return context;
}
