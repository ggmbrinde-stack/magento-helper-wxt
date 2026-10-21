import { h } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { LookupPanel } from '../entrypoints/sidepanel/LookupPanel';
import { Cache } from './sections/Cache';
import { Overview } from './sections/Overview';
import { Settings } from './sections/Settings';

export type SectionId = 'overview' | 'settings' | 'lookup' | 'cache';

interface SectionDef {
  id: SectionId;
  label: string;
  hint: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview', hint: 'Status & quick links' },
  { id: 'settings', label: 'Settings', hint: 'Notion & admin config' },
  { id: 'lookup', label: 'SKU Lookup', hint: 'Find product links' },
  { id: 'cache', label: 'Resolver Cache', hint: 'Cached SKUs' },
];

function LookupSection() {
  const [sku, setSku] = useState('');
  return <LookupPanel sku={sku} onSkuChange={setSku} />;
}

export function Dashboard() {
  const [section, setSection] = useState<SectionId>('overview');
  const current = SECTIONS.find((s) => s.id === section);

  return (
    <div class="db-app">
      <aside class="db-side">
        <div class="db-brand">
          <span class="db-logo">B</span>
          <div>
            <strong>BOG Helper</strong>
            <small>Control dashboard</small>
          </div>
        </div>
        <nav class="db-nav">
          {SECTIONS.map((item) => (
            <button
              type="button"
              key={item.id}
              class={section === item.id ? 'db-nav-item active' : 'db-nav-item'}
              onClick={() => setSection(item.id)}
            >
              <span class="db-nav-label">{item.label}</span>
              <span class="db-nav-hint">{item.hint}</span>
            </button>
          ))}
        </nav>
        <a
          class="db-workspace-link"
          href={browser.runtime.getURL('/audit.html')}
          target="_blank"
          rel="noreferrer noopener"
        >
          Audit workspace →
        </a>
        <div class="db-side-foot">v0.2.0 · create-only Notion</div>
      </aside>

      <main class="db-main">
        <header class="db-main-head">
          <h1>{current?.label}</h1>
          <p>{current?.hint}</p>
        </header>
        <div class="db-body">
          {section === 'overview' ? <Overview /> : null}
          {section === 'settings' ? <Settings /> : null}
          {section === 'lookup' ? <LookupSection /> : null}
          {section === 'cache' ? <Cache /> : null}
        </div>
      </main>
    </div>
  );
}
