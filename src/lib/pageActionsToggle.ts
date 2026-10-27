import { ensureUi } from '../ui';

const BTN_ID = 'mhx-pageactions-toggle';
const TARGET_SEL = '.page-main-actions, .page-actions';
const KEY = 'mhx:pageActionsHidden';

const ICON_HIDE = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const ICON_SHOW = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

function readPref(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
function writePref(v: boolean) {
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch {}
}

function targetEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>(TARGET_SEL);
}

function setHidden(hidden: boolean) {
  const el = targetEl();
  if (el) el.style.display = hidden ? 'none' : '';
  const btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) return;
  if (btn.dataset['state'] !== String(hidden)) {
    btn.dataset['state'] = String(hidden);
    btn.innerHTML = hidden ? ICON_SHOW : ICON_HIDE;
  }
  const label = hidden ? 'Show page actions' : 'Hide page actions';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
}

export function enhancePageActionsToggle(): boolean {
  const el = targetEl();
  if (!el && !readPref()) return false;
  ensureUi();

  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'mhx-toggle mhx-toggle--h';
    btn.style.setProperty('top', '90px', 'important');
    btn.addEventListener('click', () => {
      const next = !readPref();
      writePref(next);
      setHidden(next);
    });
    document.body.appendChild(btn);
  }

  setHidden(readPref());
  return true;
}

