export function errorMessage(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'mhx-error';
  el.textContent = text;
  return el;
}
export function savedMessage(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'mhx-saved';
  el.textContent = text;
  return el;
}
export function noteMessage(text: string): HTMLParagraphElement {
  const el = document.createElement('p');
  el.className = 'mhx-note';
  el.textContent = text;
  return el;
}
export function emptyMessage(text: string): HTMLParagraphElement {
  const el = document.createElement('p');
  el.className = 'mhx-empty';
  el.textContent = text;
  return el;
}
