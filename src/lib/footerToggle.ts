import { ensureUi } from '../ui';

const BTN_ID = 'mhx-footer-toggle';
const TARGET_SEL =
  'footer, .page-footer, .admin__footer, .admin__page-footer, [class*="footer"]';
const KEY = 'mhx:footerHidden';

const ICON_HIDE =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const ICON_SHOW =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
function writePref(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {}
}

function targetEls(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TARGET_SEL)).filter(
    (el) => el.offsetHeight > 0 || el.getClientRects().length > 0,
  );
}

function setHidden(hidden: boolean) {
  for (const el of targetEls()) {
    el.style.display = hidden ? 'none' : '';
  }
  const btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) return;
  if (btn.dataset['state'] !== String(hidden)) {
    btn.dataset['state'] = String(hidden);
    btn.innerHTML = hidden ? ICON_SHOW : ICON_HIDE;
  }
  const label = hidden ? 'Show footer' : 'Hide footer';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
}

export function enhanceFooterToggle(): boolean {
  const els = targetEls();
  if (els.length === 0 && !readPref()) return false;
  ensureUi();

  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = 'mhx-toggle mhx-toggle--h';
    btn.style.setProperty('bottom', '16px', 'important');
    btn.style.setProperty('right', '16px', 'important');
    btn.style.setProperty('top', 'auto', 'important');
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