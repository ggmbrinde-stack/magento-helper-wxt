import { h } from 'preact';
import { useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { AuditHome } from './sections/AuditHome';
import { Batch } from './sections/Batch';
import { ImageAudit } from './sections/ImageAudit';
import { ModelBridge } from './sections/ModelBridge';
import { NotionHealth } from './sections/NotionHealth';
import { Push } from './sections/Push';
import { Resolver } from './sections/Resolver';
import { TextAudit } from './sections/TextAudit';

export type AuditSectionId =
  | 'home'
  | 'batch'
  | 'resolver'
  | 'images'
  | 'text'
  | 'model'
  | 'notion'
  | 'push';

interface SectionDef {
  id: AuditSectionId;
  label: string;
  hint: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'home', label: 'Audit home', hint: 'Pipeline status & start' },
  { id: 'batch', label: 'Run audit', hint: 'Paste SKUs, run the full pipeline' },
  { id: 'resolver', label: 'Resolver', hint: 'Variants & Magento links' },
  { id: 'images', label: 'Image audit', hint: 'Duplicates, order, background' },
  { id: 'text', label: 'Text audit', hint: 'Translation, composition, specs' },
  { id: 'model', label: 'Model bridge', hint: 'Local opencode models for scoring' },
  { id: 'notion', label: 'Notion connection', hint: 'Token, databases, write contract' },
  { id: 'push', label: 'Push errors', hint: 'Payloads → Notion (create-only)' },
];

export function AuditDashboard() {
  const [section, setSection] = useState<AuditSectionId>('home');
  const current = SECTIONS.find((s) => s.id === section);

  return (
    <div class="db-app">
      <aside class="db-side">
        <div class="db-brand">
          <span class="db-logo">B</span>
          <div>
            <strong>BOG Helper</strong>
            <small>Audit workspace</small>
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
        <a class="db-workspace-link db-workspace-link--ghost" href={browser.runtime.getURL('/dashboard.html')}>
          ← Main dashboard
        </a>
        <div class="db-side-foot">v0.2.0 · create-only Notion</div>
      </aside>

      <main class="db-main">
        <header class="db-main-head db-main-head--row">
          <div>
            <h1>{current?.label}</h1>
            <p>{current?.hint}</p>
          </div>
          <span class="db-badge db-warn">audit-only</span>
        </header>
        <div class="db-body">
          {section === 'home' ? <AuditHome onOpen={setSection} /> : null}
          {section === 'batch' ? <Batch /> : null}
          {section === 'resolver' ? <Resolver /> : null}
          {section === 'images' ? <ImageAudit /> : null}
          {section === 'text' ? <TextAudit /> : null}
          {section === 'model' ? <ModelBridge /> : null}
          {section === 'notion' ? <NotionHealth /> : null}
          {section === 'push' ? <Push /> : null}
        </div>
      </main>
    </div>
  );
}
