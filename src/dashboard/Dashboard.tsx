import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Batch } from './sections/Batch';
import { Cache } from './sections/Cache';
import { ImageAudit } from './sections/ImageAudit';
import { Overview } from './sections/Overview';
import { Push } from './sections/Push';
import { Resolver } from './sections/Resolver';
import { Settings } from './sections/Settings';
import { TextAudit } from './sections/TextAudit';

export type SectionId =
  | 'overview'
  | 'settings'
  | 'cache'
  | 'auditHome'
  | 'batch'
  | 'resolver'
  | 'images'
  | 'text'
  | 'push';

interface SectionDef {
  id: SectionId;
  label: string;
  hint: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Overview', hint: 'Status & quick links' },
  { id: 'batch', label: 'Run audit', hint: 'Paste SKUs, run the full pipeline' },
  { id: 'resolver', label: 'Resolve SKU', hint: 'Product data, variants & Magento links' },
  { id: 'images', label: 'Image audit', hint: 'Duplicates, order, background' },
  { id: 'text', label: 'Text audit', hint: 'Translation, composition, specs' },
  { id: 'push', label: 'Push errors', hint: 'Payloads → Notion (create-only)' },
  { id: 'settings', label: 'Settings', hint: 'Notion & admin config' },
  { id: 'cache', label: 'Resolver Cache', hint: 'Cached SKUs' },
];

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
        <div class="db-side-foot">
          v0.2.0 — Listing Errors create-only · Library updates enabled
        </div>
      </aside>

      <main class="db-main">
        <header class="db-main-head">
          <h1>{current?.label}</h1>
          <p>{current?.hint}</p>
        </header>
        <div class="db-body">
          {section === 'overview' ? <Overview /> : null}
          {section === 'batch' ? <Batch /> : null}
          {section === 'resolver' ? <Resolver /> : null}
          {section === 'images' ? <ImageAudit /> : null}
          {section === 'text' ? <TextAudit /> : null}
          {section === 'push' ? <Push /> : null}
          {section === 'settings' ? <Settings /> : null}
          {section === 'cache' ? <Cache /> : null}
        </div>
      </main>
    </div>
  );
}
