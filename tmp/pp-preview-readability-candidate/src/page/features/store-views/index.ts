// Feature: on-page store-view quick-open buttons (EN / ES / FR) + "Open All".
import { OPEN_STORE_VIEWS, STORE_VIEW_IDS, scopeAdminUrl } from '../../../shared/store';
import { showToast } from '../../shared/toast';

/** On-page store-view quick-open buttons (EN/ES/FR) + "Open All". */
export function addStoreViewButtons(): void {
  const switcher = document.querySelector('.store-switcher');
  if (!switcher) return;
  if (document.querySelector('.mhx-store-buttons')) return;

  const container = document.createElement('div');
  container.className = 'mhx-store-buttons';

  OPEN_STORE_VIEWS.forEach((view) => {
    const id = STORE_VIEW_IDS[view];
    if (!id) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mhx-store-btn';
    btn.textContent = view;
    btn.title = `Open ${view} store view`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const url = scopeAdminUrl(location.href, id);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
    container.appendChild(btn);
  });

  const openAll = document.createElement('button');
  openAll.type = 'button';
  openAll.className = 'mhx-store-btn mhx-store-btn--all';
  openAll.textContent = `Open All (${OPEN_STORE_VIEWS.length} tabs)`;
  openAll.addEventListener('click', (e) => {
    e.preventDefault();
    const urls = OPEN_STORE_VIEWS.map((view) =>
      scopeAdminUrl(location.href, STORE_VIEW_IDS[view] ?? null),
    ).filter(Boolean);
    if (urls.length === 0) return;
    void chrome.runtime
      .sendMessage({
        type: 'OPEN_TAB_GROUP',
        urls,
        groupName: 'All Store Views',
      })
      .then(() => showToast(`Opened ${urls.length} store views.`, 'success'));
  });
  container.appendChild(openAll);

  switcher.parentNode?.insertBefore(container, switcher.nextSibling);
}
