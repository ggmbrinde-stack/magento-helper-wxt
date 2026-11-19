import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readPpReadiness } from '../src/page/features/pp-scan/readiness';

const route = '/admin_fixture/toogas_attributesetcustomoptions/attributesetcustomoptions/edit/attributesetcustomoptions_id/966/key/SYNTHETIC/';
const providerName = 'toogas_attributesetcustomoptions_attributesetcustomoptions_form.attributesetcustomoptions_form_data_source';
function fixture() {
  let loaderCalls = 0, getCalls = 0, accessorCalls = 0;
  const data: any = { attributesetcustomoptions_id: '966', private: 'SYNTHETIC_PRIVATE' };
  const provider: any = { data };
  const get = (name: string) => { getCalls++; assert.equal(name, providerName); return provider; };
  const registry: any = Object.create({ get });
  const defined: any = { 'Magento_Ui/js/lib/registry/registry': registry };
  const requireFn = Object.assign(() => { loaderCalls++; throw new Error('No module loads'); }, { s: { contexts: { _: { defined } } } });
  const context: any = { document: { readyState: 'complete' }, window: { location: { pathname: route }, require: requireFn } };
  return { data, provider, registry, defined, context, accessor: () => { accessorCalls++; return data; },
    calls: () => ({ loaderCalls, getCalls, accessorCalls }),
    run: () => runInNewContext('(' + readPpReadiness.toString() + ')(' + JSON.stringify('966') + ')', context) };
}

test('serialized readiness probe resolves inherited registry get and returns only fixed checkpoint fields', () => {
  const f = fixture(), before = JSON.stringify(f.data), result = f.run();
  assert.equal(result.stage, 'ready'); assert.equal(result.identity, 'matching'); assert.equal(result.document, 'complete');
  assert.equal(result.registry, 'available'); assert.equal(result.provider, 'available'); assert.equal(result.data, 'available');
  assert.deepEqual(Object.keys(result).sort(), ['blockedAccessor', 'data', 'document', 'identity', 'provider', 'registry', 'stage']);
  assert.equal(f.calls().loaderCalls, 0); assert.equal(JSON.stringify(f.data), before);
  assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC|private|key\//);
});

for (const stage of ['document-loading', 'route-mismatch', 'registry-unavailable', 'provider-unavailable', 'data-unavailable', 'identity-missing', 'identity-invalid', 'identity-mismatch', 'read-error']) {
  test('readiness checkpoint: ' + stage, () => {
    const f = fixture();
    if (stage === 'document-loading') f.context.document.readyState = 'loading';
    if (stage === 'route-mismatch') f.context.window.location.pathname = route.replace('/966/', '/49/');
    if (stage === 'registry-unavailable') delete f.defined['Magento_Ui/js/lib/registry/registry'];
    if (stage === 'provider-unavailable') f.registry.get = () => undefined;
    if (stage === 'data-unavailable') delete f.provider.data;
    if (stage === 'identity-missing') delete f.data.attributesetcustomoptions_id;
    if (stage === 'identity-invalid') f.data.attributesetcustomoptions_id = { toString: () => assert.fail('never coerce arbitrary provider identity') };
    if (stage === 'identity-mismatch') f.data.attributesetcustomoptions_id = '49';
    if (stage === 'read-error') f.registry.get = () => { throw new Error('SYNTHETIC_PRIVATE/key/secret'); };
    const result = f.run(); assert.equal(result.stage, stage); assert.equal(f.calls().loaderCalls, 0);
    assert.doesNotMatch(JSON.stringify(result), /SYNTHETIC|secret|key\//);
  });
}

test('readiness accessors are never invoked and provider fields remain own-property reads', () => {
  const f = fixture();
  delete f.provider.data; Object.setPrototypeOf(f.provider, { data: f.data });
  assert.equal(f.run().stage, 'data-unavailable');
  Object.defineProperty(f.provider, 'data', { get: f.accessor, configurable: true });
  const blocked = f.run(); assert.equal(blocked.stage, 'data-unavailable'); assert.equal(blocked.blockedAccessor, true);
  assert.equal(f.calls().accessorCalls, 0);
  delete f.provider.data; f.provider.data = f.data;
  Object.defineProperty(f.registry, 'get', { get: f.accessor });
  assert.equal(f.run().stage, 'registry-unavailable'); assert.equal(f.calls().accessorCalls, 0);
});
