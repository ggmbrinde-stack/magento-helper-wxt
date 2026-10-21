import { defineConfig } from 'wxt';

// QA host default; the live/admin host belongs in extension settings later.
// Never commit secret admin paths or tokens.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'BOG Helper',
    description:
      'BestOfGifts admin helper: reads Notion fix data and assists Magento listing fixes.',
    version: '0.2.0',
    permissions: [
      'alarms',
      'clipboardWrite',
      'storage',
      'sidePanel',
      'tabs',
      'tabGroups',
      'unlimitedStorage',
    ],
    host_permissions: [
      'https://api.notion.com/*',
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://bestofgifts.eu/*',
      'https://bestofgifts.es/*',
      'https://bestofgifts.fr/*',
      'https://bestofgifts-pt-qa.toogas.net/*',
      'https://bestofgifts.pt/*',
      'https://www.roly.es/*',
    ],
    // The single UI-toolkit stylesheet, loaded as a <link> by ensureUi()
    // (src/ui/index.ts). Matches mirror the content script's admin hosts —
    // the sheet only ever loads on those pages.
    web_accessible_resources: [
      {
        resources: ['ui/toolkit.css'],
        matches: [
          'https://bestofgifts-pt-qa.toogas.net/*',
          'https://bestofgifts.pt/*',
          'https://bestofgifts.eu/*',
          'https://bestofgifts.es/*',
          'https://bestofgifts.fr/*',
        ],
      },
    ],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'BOG Helper',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    browser_specific_settings: {
      gecko: { id: 'bog-helper@bestofgifts' },
    },
  },
});
