// Feature: copy buttons for the SKU / Name fields on the product edit page.
import { copyText } from '../../shared/clipboard';
import { BTN_ATTR } from '../../shared/selectors';
import { ICON_CHECK, ICON_COPY } from '../../shared/svg';

// Fields on the product edit page that get a copy button. The broad text-input
// selector was removed because it injected a button next to every text field.
export const EDIT_COPY_FIELDS = [
  'input[name="product[sku]"]',
  'input[name="product[name]"]',
];

export function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mhx-sku-copy-btn';
  btn.setAttribute(BTN_ATTR, '1');
  btn.innerHTML = ICON_COPY;
  btn.title = 'Copy';
  return btn;
}

export function flashCopied(btn: HTMLButtonElement, ok = true): void {
  btn.innerHTML = ok ? ICON_CHECK : ICON_COPY;
  btn.classList.add('mhx-sku-copy-btn--feedback');
  btn.title = ok ? 'Copied' : 'Copy failed';
  setTimeout(() => {
    btn.innerHTML = ICON_COPY;
    btn.classList.remove('mhx-sku-copy-btn--feedback');
    btn.title = 'Copy';
  }, 1200);
}

export function scanEditPage(): void {
  EDIT_COPY_FIELDS.forEach((selector) => {
    const inputs =
      document.querySelectorAll<HTMLInputElement>(selector);
    inputs.forEach((input) => {
      if (!input.value || input.getAttribute('data-mhx-btn') === '1') return;
      const field = input.closest('.admin__field');
      const label = field?.querySelector('label') ?? null;
      const container =
        label ?? input.closest('.admin__field-control') ?? input.parentElement;
      if (!container?.parentNode) return;
      const btn = createButton();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void copyText(input.value).then(() => flashCopied(btn));
      });
      container.parentNode.insertBefore(btn, container);
      input.setAttribute('data-mhx-btn', '1');
    });
  });
}
