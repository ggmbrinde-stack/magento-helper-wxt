import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { build } from 'esbuild';

const store = {};
const harness = { handlers: {}, beforeSet: async () => {} };
globalThis.__batchTest = harness;
globalThis.fetch = () => { throw new Error('Network access is forbidden in batch tests'); };
globalThis.chrome = {
  storage: { local: {
    get: async (keys) => structuredClone(Object.fromEntries(
      keys.filter((key) => key in store).map((key) => [key, store[key]]),
    )),
    set: async (values) => {
      await harness.beforeSet(values);
      Object.assign(store, structuredClone(values));
    },
    remove: async (keys) => { for (const key of keys) delete store[key]; },
  } },
  alarms: { create: async () => {}, clear: async () => {} },
};

// Replace only pipeline dependencies; runner, storage and state queue are real modules.
const mockNames = [
  'resolveWithCache', 'buildVariantSummary', 'renderVariantsBlock',
  'imageAuditForSku', 'textAuditForSku', 'buildChildColorMap',
  'breadcrumbsFromCategories', 'extractBreadcrumbs', 'buildPayloadsFromMarkdown',
  'libraryCellsFor', 'missingLibraryFields', 'supplierLinkFor', 'loadAvailability',
  'buildDossierMarkdown', 'buildMagentoTable', 'createBridgeSession',
  'deleteBridgeSession', 'loadBridgeConfig', 'modelQuotaMessage',
  'resetModelQuotaLatch', 'scoreSkuImages', 'modelVerdictPayloads',
];
const bundled = await build({
  stdin: {
    contents: `export * from './src/automation/batchRunner.ts';
      export * from './src/automation/batch.ts';
      export { batchRuntime } from './src/automation/batchState.ts';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{ name: 'batch-dependencies', setup(builder) {
    builder.onResolve({ filter: /^(\.\.\/audit|\.\/modelBridge|\.\/modelSort|\.\/modelFindings|\.\.\/shared\/magento)$/ },
      () => ({ path: 'pipeline', namespace: 'batch-mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'batch-mock' }, () => ({
      contents: `export const BATCH_AVAILABILITY_KEY = 'batchAvailability';\n` + mockNames.map(
        (name) => `export const ${name} = (...args) => globalThis.__batchTest.handlers.${name}(...args);`,
      ).join('\n'),
    }));
  } }],
});
const runner = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function settled() {
  for (let i = 0; i < 1000 && runner.batchRuntime.pumping; i++) await setImmediate();
  assert.equal(runner.batchRuntime.pumping, false, 'pump must finish');
}

function reset() {
  assert.equal(runner.batchRuntime.pumping, false);
  for (const key of Object.keys(store)) delete store[key];
  harness.beforeSet = async () => {};
  harness.handlers = {
    resolveWithCache: async (sku) => ({ resolver: {
      sku, frontend_url: 'https://example.test/' + sku, children: [], product_type: 'simple',
    }, enHtml: null }),
    buildVariantSummary: () => ({ isSimple: true, colors: [], sizes: [], anomalies: [] }),
    renderVariantsBlock: () => '',
    imageAuditForSku: async () => ({
      audit: { anomalies: [] }, collection: { media: [], files: {} }, mdBlock: '',
    }),
    textAuditForSku: async () => ({ audit: { review_flags: [], mdBlock: '' }, anomalies: [] }),
    buildChildColorMap: () => ({}),
    breadcrumbsFromCategories: () => ({ l1: '', l2: '' }),
    extractBreadcrumbs: () => ({ l1: '', l2: '' }),
    buildPayloadsFromMarkdown: ({ sku }) => ({ ok: true, payloads: [{ sku }], anomalies: [] }),
    libraryCellsFor: (resolver) => ({ sku: resolver.sku, status: 'Ready' }),
    missingLibraryFields: () => [],
    supplierLinkFor: () => ({}),
    loadAvailability: async () => ({}),
    buildDossierMarkdown: ({ sku }) => sku,
    buildMagentoTable: () => ({ anomalies: [] }),
    createBridgeSession: async () => 'test-session',
    deleteBridgeSession: async () => {},
    loadBridgeConfig: async () => ({}),
    modelQuotaMessage: () => null,
    resetModelQuotaLatch: () => {},
    scoreSkuImages: async () => ({ flags: [] }),
    modelVerdictPayloads: () => [],
  };
}

test('old model work cannot cross a pause/cancel followed by replacement or clear', async (t) => {
  for (const control of ['pauseBatch', 'cancelBatch']) {
    await t.test(control, async () => {
      reset();
      const model = deferred();
      const entered = deferred();
      harness.handlers.scoreSkuImages = () => { entered.resolve(); return model.promise; };
      await runner.startBatch({ skus: ['OLD'], options: { modelScoring: true } });
      await entered.promise;
      try {
        await runner[control]();
        await assert.rejects(runner.startBatch({ skus: ['NEW'] }), /still stopping/);
        await assert.rejects(runner.clearBatch(), /still stopping/);
        if (control === 'pauseBatch') await assert.rejects(runner.resumeBatch(), /still stopping/);
        assert.deepEqual(Object.keys(store.batchPayloads), ['OLD']);
      } finally {
        model.resolve({ flags: ['late flag'] });
        await settled();
      }
      assert.equal(store.batchJob.cursor, 0);
      assert.equal(store.batchJob.totals.failed, 0);
      assert.equal(store.batchJob.items[0].status, control === 'pauseBatch' ? 'pending' : 'cancelled');
      assert.equal(store.batchModelVerdicts, undefined);
      await runner.clearBatch();
      assert.deepEqual(store, {});
      await runner.startBatch({ skus: ['NEW'] });
      await settled();
      assert.equal(store.batchJob.status, 'done');
      for (const key of ['batchPayloads', 'batchLibrary', 'batchEvidence', 'batchDossier']) {
        assert.deepEqual(Object.keys(store[key]), ['NEW'], key);
      }
      assert.equal(store.batchModelVerdicts, undefined);
    });
  }
});

test('pause cannot be overwritten by an in-flight stage save; resume retries the same SKU', async () => {
  reset();
  const writing = deferred();
  const release = deferred();
  let held = false;
  harness.beforeSet = async (values) => {
    if (!held && values.batchJob?.items[0].stage === 'variants') {
      held = true;
      writing.resolve();
      await release.promise;
    }
  };
  await runner.startBatch({ skus: ['RETRY', 'NEXT'] });
  await writing.promise;
  const paused = runner.pauseBatch();
  release.resolve();
  await paused;
  await settled();
  assert.equal(store.batchJob.status, 'paused');
  assert.equal(store.batchJob.cursor, 0);
  assert.equal(store.batchJob.items[0].status, 'pending');
  assert.equal(store.batchJob.totals.failed, 0);
  await runner.resumeBatch();
  await settled();
  assert.equal(store.batchJob.status, 'done');
  assert.equal(store.batchJob.totals.ok, 2);
});

test('replacement and cleanup also wait for an already-started result write', async () => {
  reset();
  const writing = deferred();
  const release = deferred();
  harness.beforeSet = async (values) => {
    if (values.batchModelVerdicts) {
      writing.resolve();
      await release.promise;
    }
  };
  await runner.startBatch({ skus: ['OLD'], options: { modelScoring: true } });
  await writing.promise;
  try {
    await runner.cancelBatch();
    await assert.rejects(runner.startBatch({ skus: ['NEW'] }), /still stopping/);
    await assert.rejects(runner.clearBatch(), /still stopping/);
  } finally {
    release.resolve();
    await settled();
  }
  await runner.clearBatch();
  await runner.startBatch({ skus: ['NEW'] });
  await settled();
  assert.equal(store.batchModelVerdicts, undefined);
  assert.deepEqual(Object.keys(store.batchPayloads), ['NEW']);
});

test('simultaneous dashboard starts admit only one job', async () => {
  reset();
  const results = await Promise.allSettled([
    runner.startBatch({ skus: ['FIRST'] }), runner.startBatch({ skus: ['SECOND'] }),
  ]);
  await settled();
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'rejected']);
  assert.deepEqual(Object.keys(store.batchPayloads), ['FIRST']);
});

test('worker wake reprocesses the persisted cursor without an in-memory pump', async () => {
  reset();
  const job = runner.makeBatchJob(['RECOVER'], runner.DEFAULT_BATCH_OPTIONS);
  job.items[0].status = 'running';
  job.items[0].stage = 'images';
  await runner.saveBatchJob(job);
  await runner.maybeResume();
  await settled();
  assert.equal(store.batchJob.id, job.id);
  assert.equal(store.batchJob.status, 'done');
  assert.equal(store.batchJob.cursor, 1);
  assert.equal(store.batchJob.totals.ok, 1);
});
