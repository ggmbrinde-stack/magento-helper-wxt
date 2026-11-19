/* Read-only diagnostic for the Options Items page label read.
 *
 * Paste the whole file into the DevTools console of an authenticated Magento
 * custom-option edit page, then copy the printed JSON back to the coordinator.
 *
 * It reads only: the current route tail, the native page-nav tabs, table shapes,
 * Options Items select names and their selected text, the extension panels, and
 * the already-loaded provider row count. It never clicks, navigates, reloads,
 * saves, or prints a URL, admin path or session key.
 */
(() => {
  const trim = (value) => String(value == null ? '' : value).trim();
  const visible = (node) => !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
  const redacted = (node) => (node.getAttribute('href') ? 'present' : null);
  const report = {};

  const match = location.pathname.match(/attributesetcustomoptions_id\/(\d+)/);
  report.route = {
    editRoute: !!match,
    entityId: match ? match[1] : null,
    topFrame: window.top === window,
    readyState: document.readyState,
  };

  report.pageNav = Array.from(
    document.querySelectorAll('.admin__page-nav-items a, .admin__page-nav-items button'),
  ).slice(0, 12).map((node) => ({
    text: trim(node.textContent).slice(0, 40),
    id: node.id || '',
    classes: String(node.className || '').slice(0, 80),
    ariaSelected: node.getAttribute('aria-selected'),
    href: redacted(node),
    visible: visible(node),
  }));
  report.pageNavContainers = document.querySelectorAll('.admin__page-nav-items').length;

  const directTab = document.getElementById(
    'toogas_attributesetcustomoptions_attributesetcustomoptions_tabs_options',
  );
  const textTab = Array.from(
    document.querySelectorAll('.admin__page-nav-items a, .admin__page-nav-items button'),
  ).find((node) => trim(node.textContent).toLowerCase() === 'options');
  report.activationTarget = {
    directIdFound: !!directTab,
    directIdActive: directTab
      ? String(directTab.className || '').indexOf('active') !== -1 ||
        directTab.getAttribute('aria-selected') === 'true'
      : null,
    textMatchFound: !!textTab,
    textMatchId: textTab ? textTab.id || '' : null,
    textMatchClasses: textTab ? String(textTab.className || '').slice(0, 80) : null,
    textMatchAriaSelected: textTab ? textTab.getAttribute('aria-selected') : null,
    textMatchVisible: textTab ? visible(textTab) : null,
  };

  report.tables = Array.from(document.querySelectorAll('table')).map((table, index) => ({
    index,
    dataIndex: table.getAttribute('data-index') || '',
    headers: Array.from(table.querySelectorAll('thead th'))
      .map((cell) => trim(cell.textContent).toLowerCase()).slice(0, 10),
    bodyRows: table.querySelectorAll('tbody tr').length,
    selects: table.querySelectorAll('select').length,
    hidden: table.offsetParent === null,
    inPanel: !!(table.closest && table.closest('#mhx-items-panel, .mhx-items-panel')),
  })).filter((table) => table.selects || table.dataIndex || table.headers.indexOf('parent') !== -1);

  const itemSelects = Array.from(document.querySelectorAll('select')).filter(
    (select) => String(select.name || '').indexOf('[sub_options_items]') !== -1,
  );
  const nameSelects = itemSelects.filter(
    (select) => String(select.name || '').indexOf('[name_option]') !== -1,
  );
  report.items = {
    itemSelects: itemSelects.length,
    nameOptionSelects: nameSelects.length,
    narrowSelector: document.querySelectorAll('select[name*="[sub_options_items]"]').length,
    sample: nameSelects.slice(0, 10).map((select) => ({
      name: select.name,
      value: select.value,
      selectedText: trim(select.options[select.selectedIndex] && select.options[select.selectedIndex].text).slice(0, 120),
      optionCount: select.options.length,
      inPanel: !!(select.closest && select.closest('#mhx-items-panel, .mhx-items-panel')),
      disabled: !!select.disabled,
      visible: visible(select),
    })),
  };

  report.extensionPanels = {
    groupedPanel: !!document.querySelector('#mhx-items-panel, .mhx-items-panel'),
    scanPanel: !!document.getElementById('mhx-pp-draft-scan'),
    catalogPanel: !!document.getElementById('mhx-pp-catalog'),
  };

  report.provider = (() => {
    try {
      const requireFn = window.require;
      const defined = requireFn && requireFn.s && requireFn.s.contexts && requireFn.s.contexts._
        && requireFn.s.contexts._.defined;
      const registry = defined && defined['Magento_Ui/js/lib/registry/registry'];
      const get = registry && registry.get;
      if (typeof get !== 'function') return { registry: false };
      const provider = get.call(
        registry,
        'toogas_attributesetcustomoptions_attributesetcustomoptions_form.attributesetcustomoptions_form_data_source',
      );
      const data = provider && provider.data;
      const rows = data && data.options && data.options.sub_options_items
        && data.options.sub_options_items.sub_options_items;
      return {
        registry: true,
        provider: !!provider,
        data: !!data,
        itemRows: Array.isArray(rows) ? rows.length : null,
        firstRowKeys: Array.isArray(rows) && rows[0] ? Object.keys(rows[0]) : [],
      };
    } catch (error) {
      return { error: String((error && error.message) || error) };
    }
  })();

  report.scannerWouldRead = (() => {
    const labels = {};
    for (const select of nameSelects) {
      if (select.closest && select.closest('#mhx-items-panel, .mhx-items-panel')) continue;
      const segments = String(select.name).split('[').map((part) => part.split(']')[0]);
      const key = segments[segments.length - 2];
      const text = trim(select.options[select.selectedIndex] && select.options[select.selectedIndex].text);
      if (key && text) labels[key] = text.slice(0, 200);
    }
    return labels;
  })();

  const json = JSON.stringify(report, null, 2);
  console.log(json);
  try { if (typeof copy === 'function') copy(json); } catch (error) { /* clipboard is optional */ }
  return report;
})();
