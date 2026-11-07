import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createResource, type ResourceState } from '../services/resource';
import { ApiError } from '../services/api';
import { deferred, manualClock } from './fixtures';

function fixture() {
  const states: ResourceState<string[]>[] = [];
  const clock = manualClock();
  const resource = createResource<string[]>(state => states.push(state), rows => rows.length === 0, clock.schedule);
  return { states, clock, resource, latest: () => states[states.length - 1] };
}
test('older successful requests cannot overwrite newer results even if abort is ignored', async () => {
  const f = fixture(); const a = deferred<string[]>(); const b = deferred<string[]>();
  let oldSignal: AbortSignal | undefined;
  f.resource.start('co', signal => { oldSignal = signal; return a.promise; });
  f.resource.start('coca', () => b.promise);
  b.resolve(['new']); await b.promise;
  a.resolve(['old']); await a.promise;
  assert.equal(oldSignal?.aborted, true); assert.equal(f.latest().key, 'coca');
  assert.deepEqual(f.latest().data, ['new']);
});
test('clearing a query cannot restore stale results', async () => {
  const f = fixture(); const a = deferred<string[]>(); const all = deferred<string[]>();
  f.resource.start('coca', () => a.promise);
  f.resource.start('', () => all.promise);
  all.resolve(['catalog']); await all.promise;
  a.resolve(['old filtered']); await a.promise;
  assert.equal(f.latest().key, ''); assert.deepEqual(f.latest().data, ['catalog']);
});
test('cancelling on blur/unmount prevents subsequent successes and failures publishing', async () => {
  for (const failure of [false, true]) {
    const f = fixture(); const a = deferred<string[]>();
    f.resource.start('product:1', () => a.promise);
    f.resource.cancel(); const count = f.states.length;
    if (failure) a.reject(new Error('late failure')); else a.resolve(['late']);
    await a.promise.catch(() => {});
    assert.equal(f.states.length, count);
  }
});
test('an earlier failure cannot replace a later successful result', async () => {
  const f = fixture(); const a = deferred<string[]>(); const b = deferred<string[]>();
  f.resource.start('old', () => a.promise); f.resource.start('new', () => b.promise);
  b.resolve(['new']); await b.promise;
  a.reject(new ApiError('network', 'Old request failed')); await a.promise.catch(() => {});
  assert.equal(f.latest().status, 'loaded'); assert.deepEqual(f.latest().data, ['new']);
});
test('new search invalidates an in-flight request throughout the debounce window', async () => {
  const f = fixture(); const a = deferred<string[]>(); let calls = 0;
  f.resource.start('co', () => a.promise);
  f.resource.start('coca', async () => { calls++; return ['new']; }, { delay: 350 });
  a.resolve(['old']); await a.promise;
  assert.equal(f.latest().status, 'loading'); assert.equal(f.latest().key, 'coca'); assert.equal(calls, 0);
  f.clock.fire(); await Promise.resolve();
  assert.equal(calls, 1); assert.deepEqual(f.latest().data, ['new']);
});
test('rapid typing cancels scheduled work, and unmount cancels the final debounce', () => {
  const f = fixture(); let calls = 0;
  for (const query of ['c', 'co', 'coc', 'coca']) {
    f.resource.start(query, async () => { calls++; return []; }, { delay: 350 });
  }
  assert.equal(f.clock.size, 1); f.resource.cancel(); f.clock.fire();
  assert.equal(calls, 0);
});
test('errors, successful retries, empty results and refreshing remain distinct', async () => {
  const f = fixture();
  f.resource.start('catalog', async () => { throw new ApiError('network', 'Please retry.'); });
  await Promise.resolve(); assert.equal(f.latest().status, 'error'); assert.equal(f.latest().data, null);
  f.resource.start('catalog', async () => ['restored']); await Promise.resolve();
  assert.equal(f.latest().status, 'loaded');
  const next = deferred<string[]>();
  f.resource.start('catalog', () => next.promise, { refresh: true });
  assert.equal(f.latest().status, 'refreshing'); assert.deepEqual(f.latest().data, ['restored']);
  next.resolve([]); await next.promise;
  assert.equal(f.latest().status, 'empty'); assert.deepEqual(f.latest().data, []);
});
test('refreshing another identity never displays the previous record, and unknown errors are sanitized', async () => {
  const f = fixture(); f.resource.start('product:1', async () => ['one']); await Promise.resolve();
  f.resource.start('product:2', async () => { throw new Error('private diagnostic'); }, { refresh: true });
  assert.equal(f.latest().data, null); await Promise.resolve();
  assert.equal(f.latest().status, 'error'); assert.equal(f.latest().error?.includes('private'), false);
});
