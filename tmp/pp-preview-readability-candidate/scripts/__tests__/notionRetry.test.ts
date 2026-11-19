import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import {
  createNotionPage, getDatabase, notionApiError, patchOnlyNotionFetch,
  queryDatabase, queued, NotionApiError, readOnlyNotionFetch,
} from '../../src/shared/notion/client';

let testNow = 1_000_000;

async function settle<T>(t: TestContext, operation: Promise<T>): Promise<T> {
  let done = false;
  const result = operation.then(
    (value) => { done = true; return { value }; },
    (error: unknown) => { done = true; return { error }; },
  );
  for (let i = 0; !done && i < 30; i++) {
    t.mock.timers.tick(30_000);
    await setImmediate();
  }
  assert.ok(done, 'request queue settled');
  const outcome = await result;
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
}

function append() {
  return queued(async () => {
    const response = await patchOnlyNotionFetch(
      'https://api.notion.com/v1/blocks/page/children',
      { method: 'PATCH', body: JSON.stringify({ children: [{ object: 'block' }] }) },
    );
    if (!response.ok) throw await notionApiError(response, 'append');
    return response.json();
  });
}

for (const operation of ['create', 'append'] as const) {
  for (const failure of ['timeout', 'network', 'server'] as const) {
    test(`${operation}: an accepted write with ${failure} failure is never repeated`, async (t) => {
      t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: testNow += 2_000_000 });
      let accepted = 0;
      t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
        accepted++;
        if (failure === 'server') {
          return Response.json({ code: 'internal_server_error', message: 'Response lost after acceptance' }, { status: 503 });
        }
        if (failure === 'network') throw new TypeError('connection lost after acceptance');
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Response lost', 'AbortError')), { once: true });
        });
      });
      await assert.rejects(settle(t, operation === 'create' ? createNotionPage('test-token', {}) : append()), (error: unknown) => {
        if (failure === 'network') return error instanceof TypeError;
        assert.ok(error instanceof NotionApiError);
        assert.equal(error.status, failure === 'timeout' ? 408 : 503);
        assert.equal(error.code, failure === 'timeout' ? 'timeout' : 'internal_server_error');
        return true;
      });
      assert.equal(accepted, 1, 'server received exactly one mutation');
    });
  }
}

for (const method of ['GET', 'POST'] as const) {
  test(`${method} reads still retry transient server failures`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: testNow += 2_000_000 });
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => ++calls === 1
      ? Response.json({ message: 'temporary' }, { status: 503 })
      : Response.json(method === 'GET' ? { id: 'db' } : { results: [], has_more: false }));
    await settle(t, method === 'GET' ? getDatabase('test-token', 'db') : queryDatabase('test-token', 'db', {}));
    assert.equal(calls, 2);
  });
}

test('an explicit write rate limit remains retryable', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: testNow += 2_000_000 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? Response.json({ code: 'rate_limited', message: 'wait' }, { status: 429, headers: { 'retry-after': '2' } })
    : Response.json({ id: 'created' }));
  assert.deepEqual(await settle(t, createNotionPage('test-token', {})), { id: 'created' });
  assert.equal(calls, 2);
});

test('the read-only guard still refuses a page create before any fetch', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({}));
  await assert.rejects(readOnlyNotionFetch('https://api.notion.com/v1/pages', { method: 'POST' }), /not allowed/);
  assert.equal(fetch.mock.callCount(), 0);
});
