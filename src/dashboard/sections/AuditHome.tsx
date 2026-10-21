import { h } from 'preact';
import { useSettings } from '../useSettings';
import type { AuditSectionId } from '../AuditDashboard';

type StageState = 'done' | 'next' | 'later';

interface Stage {
  name: string;
  state: StageState;
  detail: string;
  section?: AuditSectionId;
}

const STAGES: Stage[] = [
  { name: 'Resolver', state: 'done', detail: 'SKU → variants + Magento child links', section: 'resolver' },
  { name: 'Media maps', state: 'done', detail: 'Live EN/ES/FR carousel positions', section: 'images' },
  { name: 'Image audit', state: 'done', detail: 'Duplicates, carousel order, pos0 background', section: 'images' },
  { name: 'Payload builder', state: 'done', detail: 'Findings → Listing Errors contract', section: 'push' },
  { name: 'Notion writer', state: 'done', detail: 'Create-only rows, dedup before create', section: 'push' },
  { name: 'Notion connection', state: 'done', detail: 'Token, database reachability, write contract', section: 'notion' },
  { name: 'Text audit', state: 'done', detail: 'EN/ES/FR title, details, composition', section: 'text' },
  { name: 'Batch runner', state: 'done', detail: 'Paste SKUs, run the whole pipeline', section: 'batch' },
  { name: 'Model scoring', state: 'done', detail: 'Vision verdicts via local opencode bridge (review-first)', section: 'model' },
  { name: 'Order fix + batch', state: 'later', detail: 'Apply plan, queue, parity gate' },
];

const STATE_LABEL: Record<StageState, string> = {
  done: 'ready',
  next: 'next',
  later: 'later',
};

export function AuditHome({ onOpen }: { onOpen: (id: AuditSectionId) => void }) {
  const { settings, loaded } = useSettings();

  return (
    <div class="db-grid">
      <section class="db-card db-wide">
        <div class="db-card-head">
          <h2>Audit pipeline</h2>
          <span class="db-badge">candidates only</span>
        </div>
        <p class="db-note">
          This workspace is audit-only. It never decides severity, flag or model views — it
          emits findings plus review flags for the auditor.
        </p>
        <table class="db-table db-stages">
          <thead>
            <tr>
              <th>Stage</th>
              <th>State</th>
              <th>What it does</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => (
              <tr key={stage.name}>
                <td>{stage.name}</td>
                <td>
                  <span
                    class={
                      stage.state === 'done'
                        ? 'db-badge db-ok'
                        : stage.state === 'next'
                          ? 'db-badge db-warn'
                          : 'db-badge'
                    }
                  >
                    {STATE_LABEL[stage.state]}
                  </span>
                </td>
                <td class="db-notes">{stage.detail}</td>
                <td>
                  {stage.section ? (
                    <button
                      type="button"
                      class="db-btn"
                      onClick={() => onOpen(stage.section as AuditSectionId)}
                    >
                      Open
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="db-card">
        <h2>Start here</h2>
        <ol class="db-steps">
          <li>
            <b>Run a batch</b> — paste the SKUs and let the pipeline audit them all.
          </li>
          <li>
            <b>Check the Notion connection</b> — token, databases, write contract.
          </li>
          <li>
            <b>Set up the model bridge</b> — local opencode server, vision model.
          </li>
          <li>
            <b>Resolve</b> the SKU — confirms children, variants and admin links.
          </li>
          <li>
            <b>Audit images</b> — live media maps, duplicates/order/background.
          </li>
          <li>
            <b>Audit text</b> — EN/ES/FR translation, composition and specs.
          </li>
          <li>
            <b>Push errors</b> — review payloads, then create rows (dedup first).
          </li>
        </ol>
        <div class="db-actions">
          <button type="button" class="db-btn db-btn--primary" onClick={() => onOpen('batch')}>
            Run a batch
          </button>
          <button type="button" class="db-btn" onClick={() => onOpen('resolver')}>
            Resolve a SKU
          </button>
          <button type="button" class="db-btn" onClick={() => onOpen('images')}>
            Image audit
          </button>
          <button type="button" class="db-btn" onClick={() => onOpen('text')}>
            Text audit
          </button>
          <button type="button" class="db-btn" onClick={() => onOpen('model')}>
            Model bridge
          </button>
          <button type="button" class="db-btn" onClick={() => onOpen('notion')}>
            Notion connection
          </button>
          <button type="button" class="db-btn" onClick={() => onOpen('push')}>
            Push errors
          </button>
        </div>
      </section>

      <section class="db-card">
        <h2>Workspace rules</h2>
        <ul class="db-kv">
          <li>
            <span>Notion access</span>
            <b class="ok">Create-only</b>
          </li>
          <li>
            <span>Notion token</span>
            <b class={settings.notionToken ? 'ok' : 'bad'}>
              {!loaded ? '…' : settings.notionToken ? 'Configured' : 'Missing'}
            </b>
          </li>
          <li>
            <span>Image source</span>
            <b>Live storefront</b>
          </li>
          <li>
            <span>Local image folders</span>
            <b>Not used yet</b>
          </li>
        </ul>
        <p class="db-note">
          Never update, delete or append in Notion. Magento page-data writes stay paused.
        </p>
      </section>
    </div>
  );
}
