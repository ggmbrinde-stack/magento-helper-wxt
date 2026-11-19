import { button, ensureUi } from '../../../ui';
import { ppCatalogEntity, PpCatalogResponseSchema, type PpCatalogResponse } from '../../../shared/ppCatalog';
import type { FetchPpCatalogRequest } from '../../../core/messages';

let mounted: { panel: HTMLElement; entity: string; native: HTMLElement; destroy: () => void } | undefined;

export function unmountPpCatalog(): void {
  mounted?.destroy();
  mounted = undefined;
}

/** Read-only reference panel, a sibling of the native component, never a form editor. */
export function mountPpCatalog(): void {
  const entity = ppCatalogEntity(location.href);
  const native = document.querySelector<HTMLElement>('[data-bind*="toogas_attributesetcustomoptions_attributesetcustomoptions_form.areas"]');
  if (mounted && (!mounted.panel.isConnected || mounted.entity !== entity || mounted.native !== native || mounted.panel.nextElementSibling !== native)) unmountPpCatalog();
  if (!entity || !native?.parentElement || mounted) return;
  void ensureUi();
  const panel = document.createElement('section');
  panel.id = 'mhx-pp-catalog';
  panel.setAttribute('aria-label', 'Notion PP reference');
  const heading = document.createElement('h2');
  heading.textContent = 'Notion PP reference (read-only)';
  const context = document.createElement('p');
  context.textContent = `Magento entity ${entity}. A manually selected reference does not establish this page’s PP code or Attribute Set association. No comparison with saved data is made.`;
  const label = document.createElement('label');
  label.textContent = 'Exact business PP text ';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 128;
  input.autocomplete = 'off';
  input.spellcheck = false;
  label.appendChild(input);
  const output = document.createElement('div');
  output.setAttribute('role', 'status');
  output.setAttribute('aria-live', 'polite');
  let request = 0;
  const message = (value: string) => { const p = document.createElement('p'); p.textContent = value; output.appendChild(p); };
  const list = (title: string, values: string[] | null) => {
    message(`${title}: ${values === null || values.length === 0 ? 'not provided / unknown' : values.join('; ')}`);
  };
  const render = (response: PpCatalogResponse) => {
    output.replaceChildren();
    message(`${response.status}: ${response.reason}`);
    message(`Exact requested code: ${response.code}. Checked: ${response.checkedAt}.`);
    const def = response.definition;
    if (!def) return;
    message(`Name: ${def.name || 'not provided'}`);
    message(`Review status: ${def.reviewStatus ?? 'unknown'}`);
    list('Faces', def.faces);
    message(`Number of faces: ${def.faceCount ?? 'unknown'}. Number of possible locations: ${def.locationCount ?? 'unknown'}.`);
    list('Personalization options (global list)', def.options);
    list('Techniques (global list)', def.techniques);
    message(`Notion last edited: ${def.lastEditedAt ?? 'unknown'}. This timestamp does not prove approval or a Magento match.`);
    const link = document.createElement('a');
    link.href = `https://www.notion.so/${def.pageId.replaceAll('-', '')}`;
    link.textContent = 'Open Notion definition';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    output.appendChild(link);
    for (const warning of def.warnings) message(warning);
    if (def.body.length) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Source body text (groupings are not per-location assignments)';
      details.appendChild(summary);
      for (const line of def.body) {
        const p = document.createElement('p'); p.textContent = line; details.appendChild(p);
      }
      output.appendChild(details);
    }
  };
  const load = async () => {
    const code = input.value;
    const current = ++request;
    output.replaceChildren();
    if (!code.trim() || code.length > 128) { message('Enter the exact business PP text (1 to 128 characters).'); return; }
    message('Reading the Notion reference. Magento data will not be changed.');
    try {
      const payload: FetchPpCatalogRequest = { type: 'FETCH_PP_CATALOG', code };
      const raw: unknown = await chrome.runtime.sendMessage(payload);
      if (current !== request || !panel.isConnected || !native.isConnected || ppCatalogEntity(location.href) !== entity || input.value !== code) return;
      const response = PpCatalogResponseSchema.safeParse(raw);
      if (!response.success || response.data.code !== code || (response.data.definition && response.data.definition.code !== code)) {
        output.replaceChildren(); message('unavailable: The background returned an invalid or mismatched reference.'); return;
      }
      render(response.data);
    } catch {
      if (current !== request || !panel.isConnected || !native.isConnected || ppCatalogEntity(location.href) !== entity || input.value !== code) return;
      output.replaceChildren(); message('unavailable: The extension could not complete the lookup. Retry explicitly.');
    }
  };
  const onInput = () => { request++; output.replaceChildren(); message('Code changed. Load the exact reference again.'); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); void load(); } };
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKey);
  const loadButton = button({ label: 'Load Notion reference', onClick: () => { void load(); } });
  panel.append(heading, context, label, loadButton, output);
  native.parentElement.insertBefore(panel, native);
  mounted = { panel, entity, native, destroy: () => {
    request++;
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKey);
    panel.remove();
  } };
}
