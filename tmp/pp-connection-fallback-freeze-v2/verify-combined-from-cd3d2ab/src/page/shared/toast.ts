// The one toast the page features share. Composition lives in the toolkit
// (.mhx-toast); this only mounts it.

/** Small bottom-right notification, replacing the vanilla toast helper. */
export function showToast(text: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  document.querySelector('.mhx-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `mhx-toast mhx-toast--${kind}`;
  const span = document.createElement('span');
  span.textContent = text;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.addEventListener('click', () => toast.remove());
  toast.append(span, close);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
