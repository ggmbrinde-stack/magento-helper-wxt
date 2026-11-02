import { h, Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
// Sections are grouped by the lane that owns them: an audit screen and an
// automation screen never sit in the same folder, so two agents can work on
// them without touching one file. `ui/` is the extension's own surfaces.
import { Cache } from '../sections/audit/Cache';
import { ImageAudit } from '../sections/audit/ImageAudit';
import { NotionHealth } from '../sections/audit/NotionHealth';
import { Push } from '../sections/audit/Push';
import { Resolver } from '../sections/audit/Resolver';
import { TextAudit } from '../sections/audit/TextAudit';
import { Batch } from '../sections/automation/Batch';
import { ModelBridge } from '../sections/automation/ModelBridge';
import { EnableFlow } from '../sections/ui/EnableFlow';
import { Overview } from '../sections/ui/Overview';
import { Settings } from '../sections/ui/Settings';

export type SectionId =
  | 'overview'
  | 'settings'
  | 'cache'
  | 'auditHome'
  | 'batch'
  | 'resolver'
  | 'enable'
  | 'images'
  | 'text'
  | 'push'
  | 'notion'
  | 'bridge';

interface SectionDef {
  id: SectionId;
  label: string;
  hint: string;
}

/**
 * Nav groups follow the work, not the file tree: the subject (a SKU), the
 * audit steps that read it, the catalogue behind it, then the extension's own
 * plumbing. Ten flat items hid that order.
 */
const NAV: { group: string; items: SectionDef[] }[] = [
  {
    group: 'Workspace',
    items: [
      { id: 'overview', label: 'Overview', hint: 'Status & quick links' },
      { id: 'batch', label: 'Run audit', hint: 'Run the full pipeline as steps' },
      { id: 'resolver', label: 'Resolve SKU', hint: 'Product data, variants & Magento links' },
      { id: 'enable', label: 'Enable flow', hint: 'Disabled SKU → sale ready' },
    ],
  },
  {
    group: 'Stages',
    items: [
      { id: 'images', label: 'Image audit', hint: 'Duplicates, order, background' },
      { id: 'text', label: 'Text audit', hint: 'Translation, composition, specs' },
      { id: 'push', label: 'Push errors', hint: 'Payloads → Notion (create-only)' },
    ],
  },
  {
    group: 'Catalogue',
    items: [
      { id: 'notion', label: 'Notion health', hint: 'Token, databases, read-back' },
      { id: 'cache', label: 'Resolver cache', hint: 'Cached SKUs' },
    ],
  },
  {
    group: 'Extension',
    items: [
      { id: 'bridge', label: 'Model bridge', hint: 'Local/remote vision endpoint' },
      { id: 'settings', label: 'Settings', hint: 'Theme, token & admin config' },
    ],
  },
];

const SECTIONS = NAV.flatMap((group) => group.items);

const DEFAULT_SECTION: SectionId = 'overview';

function sectionFromHash(): SectionId {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  return (SECTIONS.find((s) => s.id === raw)?.id ?? DEFAULT_SECTION) as SectionId;
}

/**
 * Hash routing, because a screen has to be addressable: reloading keeps it and
 * "open the text audit for M22477" can be a link instead of four instructions.
 * `history.replaceState` keeps the back button meaningful rather than filling it
 * with one entry per tab click.
 */
function useHashSection(): [SectionId, (id: SectionId) => void] {
  const [section, setSection] = useState<SectionId>(sectionFromHash);

  useEffect(() => {
    const onHash = (): void => setSection(sectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: SectionId): void => {
    if (window.location.hash !== `#/${id}`) {
      window.history.replaceState(null, '', `#/${id}`);
    }
    setSection(id);
  };
  return [section, go];
}

export function Dashboard() {
  const [section, setSection] = useHashSection();
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
          {NAV.map((group) => (
            <div class="db-nav-group" key={group.group}>
              <span class="db-nav-group-label">{group.group}</span>
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  class={section === item.id ? 'db-nav-item active' : 'db-nav-item'}
                  aria-current={section === item.id ? 'page' : undefined}
                  onClick={() => setSection(item.id)}
                >
                  <span class="db-nav-label">{item.label}</span>
                  <span class="db-nav-hint">{item.hint}</span>
                </button>
              ))}
            </div>
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
          {section === 'resolver' ? <Resolver onOpen={(id) => setSection(id as SectionId)} /> : null}
          {section === 'enable' ? <EnableFlow onOpen={(id) => setSection(id as SectionId)} /> : null}
          {section === 'images' ? <ImageAudit /> : null}
          {section === 'text' ? <TextAudit /> : null}
          {section === 'push' ? <Push /> : null}
          {section === 'notion' ? <NotionHealth /> : null}
          {section === 'bridge' ? <ModelBridge /> : null}
          {section === 'settings' ? <Settings onOpen={(id) => setSection(id as SectionId)} /> : null}
          {section === 'cache' ? <Cache /> : null}
        </div>
      </main>
    </div>
  );
}
