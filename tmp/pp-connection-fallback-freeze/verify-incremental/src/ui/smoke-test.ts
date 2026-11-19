#!/usr/bin/env node
// Smoke test for the UI toolkit components running as a standalone fixture.
// Verifies the primitives render into a headless DOM without the extension.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="app"></div></body></html>');
const win = dom.window as unknown as {
  document: Document;
  HTMLElement: typeof HTMLElement;
  HTMLElements: typeof HTMLElements;
  Event: typeof Event;
  MouseEvent: typeof MouseEvent;
  Node: typeof Node;
};

(globalThis as unknown as Record<string, unknown>).document = win.document;
(globalThis as unknown as Record<string, unknown>).HTMLElement = win.HTMLElement;
(globalThis as unknown as Record<string, unknown>).HTMLElements = win.HTMLElements;
(globalThis as unknown as Record<string, unknown>).Event = win.Event;
(globalThis as unknown as Record<string, unknown>).MouseEvent = win.MouseEvent;
(globalThis as unknown as Record<string, unknown>).Node = win.Node;

// Import the factories after setting up globals
const { button, group, bar, chip, badge, segmented, popover } = await import('./components.ts');

const app = dom.window.document.getElementById('app')!;

// Test button
const btn = button({ label: 'Test Button', variant: 'danger', onClick: () => {} });
app.appendChild(btn);
console.log('✓ button created:', btn.tagName, btn.className, btn.dataset.variant);

// Test group
const grp = group([button({ label: 'A' }), button({ label: 'B' })], { label: 'test group' });
app.appendChild(grp);
console.log('✓ group created:', grp.className, grp.getAttribute('aria-label'));

// Test bar
const br = bar([button({ label: 'Bulk 1' }), button({ label: 'Bulk 2' })], 'Bulk actions');
app.appendChild(br);
console.log('✓ bar created:', br.className);

// Test chip with remove
const ch = chip({ label: 'Filter', onRemove: () => {} });
app.appendChild(ch);
console.log('✓ chip created:', ch.className);

// Test badge with tone
const bd = badge('3', { tone: 'ok', title: 'Count' });
app.appendChild(bd);
console.log('✓ badge created:', bd.className, bd.dataset.tone);

// Test segmented
const seg = segmented({
  label: 'View',
  options: [{ label: 'Grid', value: 'grid' }, { label: 'List', value: 'list' }],
  active: 'grid',
  onPick: () => {},
});
app.appendChild(seg);
console.log('✓ segmented created:', seg.className);

// Test popover
const pop = popover([button({ label: 'Item 1' })], { label: 'Menu' });
app.appendChild(pop);
console.log('✓ popover created:', pop.className);

// Summary
console.log('\n✓ All 7 toolkit primitives render successfully');
console.log('✓ No runtime errors in headless DOM');
