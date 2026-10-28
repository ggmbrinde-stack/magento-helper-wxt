// Feature: hard visibility probe — stamps a red dot when the content script
// runs. Deliberately independent of all toolkit styling so it can never be
// hidden by a CSS regression.

/** Hard visibility test: stamp a red dot if the content script runs. */
export function mhxVisTest(): void {
  try {
    const existing = document.getElementById('mhx-vis-test-dot');
    if (existing) return;

    const dot = document.createElement('div');
    dot.id = 'mhx-vis-test-dot';
    dot.style.cssText =
      'position:fixed !important;top:6px !important;right:6px !important;' +
      'z-index:2147483647 !important;' +
      'background:red !important;width:10px !important;height:10px !important;' +
      'border-radius:50% !important;' +
      'pointer-events:none !important;';
    dot.setAttribute('aria-hidden', 'true');

    const target = document.documentElement || document.body;
    if (!target) return;

    target.appendChild(dot);
    console.log('[mhx options] vis-test dot injected');
  } catch (e) {
    console.warn('[mhx options] vis-test dot failed', e);
  }
}
