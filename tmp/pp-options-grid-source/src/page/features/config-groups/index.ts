// Feature: "Color (N)" buttons that open every child product of a colour.
import type { ConfigGroup, GetConfigResponse } from '../../../core/messages';
import { isCollapsed, findConfigSection } from '../../shared/config-section';
import { isProductEditPage, readPageSku } from '../../shared/magentoForm';

export function configSectionTitle(): HTMLElement | null {
  const section = findConfigSection();
  if (!section) return null;
  return section.querySelector<HTMLElement>(
    '.admin__collapsible-title, .admin__fieldset legend, legend',
  );
}

/** On-page "Color (N)" buttons that open all child products in a tab group. */
export function renderConfigButtons(): void {
  const result = extractColorGroups();
  if (!result.available || result.pending || result.groups.length === 0) return;

  const title = configSectionTitle();
  const parent = title?.parentElement;
  if (!title || !parent) return;

  result.groups.forEach((group) => {
    if (group.urls.length === 0) return;
    const existing = parent.querySelector<HTMLButtonElement>(
      `.mhx-open-sizes-btn[data-color="${CSS.escape(group.label)}"]`,
    );
    if (existing) {
      existing.textContent = `${group.label} (${group.urls.length})`;
      return;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mhx-open-sizes-btn';
    btn.dataset.color = group.label;
    btn.textContent = `${group.label} (${group.urls.length})`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      void chrome.runtime.sendMessage({
        type: 'OPEN_TAB_GROUP',
        urls: group.urls,
        groupName: `${group.label} sizes`,
      });
    });
    parent.insertBefore(btn, title.nextSibling);
  });
}

/**
 * Read-only extraction of the configurable colour groups from the open product
 * page: each row's Attribute cell ("Color: X") plus the child product-edit link.
 * If the section is collapsed we click to expand it and report `pending` so the
 * panel retries shortly (nothing is written to the record).
 */
export function extractColorGroups(): GetConfigResponse {
  if (!isProductEditPage(location.href)) {
    return {
      available: false,
      groups: [],
      reason: 'Open a Magento product edit page to read configurations.',
    };
  }
  const section = findConfigSection();
  if (!section) {
    return {
      available: true,
      groups: [],
      reason: 'No Configurations section on this page.',
    };
  }

  if (isCollapsed(section)) {
    const collapsible = section.classList.contains(
      'admin__collapsible-block-wrapper',
    )
      ? section
      : section.closest('.admin__collapsible-block-wrapper');
    collapsible
      ?.querySelector<HTMLElement>('.admin__collapsible-title')
      ?.click();
    return { available: true, pending: true, groups: [] };
  }

  const table = section.querySelector(
    'table.admin__dynamic-rows, table.data-grid, table',
  );
  const groups = new Map<string, ConfigGroup>();
  const sku = readPageSku();
  if (!table) {
    return {
      available: true,
      groups: [],
      sku,
      reason: 'No configuration rows yet.',
    };
  }

  let attrColIndex = -1;
  const headerRow = table.querySelector('thead tr');
  if (headerRow) {
    const ths = Array.from(headerRow.querySelectorAll('th'));
    attrColIndex = ths.findIndex((th) =>
      (th.textContent ?? '').toLowerCase().includes('attribute'),
    );
  }
  if (attrColIndex === -1) attrColIndex = 7;

  table.querySelectorAll('tbody tr').forEach((row) => {
    const cells = row.querySelectorAll('td');
    const attrCell = cells[attrColIndex];
    const attrText = (attrCell?.textContent ?? '').trim();
    if (!attrText) return;
    const colorMatch = attrText.match(/color:\s*([^,]+)/i);
    if (!colorMatch) return;
    const colorText = (colorMatch[1] ?? '').trim();
    if (!colorText) return;
    const link = cells[1]?.querySelector<HTMLAnchorElement>(
      'a[href*="/catalog/product/edit/id/"]',
    );
    if (!link) return;
    const group = groups.get(colorText) ?? { label: colorText, urls: [] };
    group.urls.push(link.href);
    groups.set(colorText, group);
  });

  return { available: true, groups: [...groups.values()], sku };
}
