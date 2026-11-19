import { h, render } from 'preact';
import { App } from './App';
import { primeTheme } from '../../ui/theme';
import { watchToolkitColors } from '../../ui/tokens';
import cssText from './panel.css?raw';
import themeCss from '../../ui/theme.css?raw';
import toolkitCss from '../../ui/toolkit.css?raw';

// The panel renders in a Shadow DOM so Magento's page CSS cannot leak in
// (Build Plan rule: isolated UI). WXT serves sidepanel.html; we mount into it.
const host = document.getElementById('app');
if (host) {
  // The theme is applied to both <html> and the shadow host, so the panel page
  // behind the shadow is themed too and the palette reaches inside it.
  primeTheme(host);
  // Toolkit colours live on <html> and inherit into the shadow tree (same
  // path as the palette), so the Settings preview shows the real values.
  watchToolkitColors();

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${toolkitCss}\n${cssText}\n${themeCss}`;
  shadow.appendChild(style);
  const mount = document.createElement('div');
  shadow.appendChild(mount);
  render(<App />, mount);
}
