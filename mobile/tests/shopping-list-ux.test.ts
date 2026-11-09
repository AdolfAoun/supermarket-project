import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '../services/api';
import { createConfirmation } from '../services/confirmation';
import { createProductActions, type ProductActions } from '../services/product-actions';
import { createResource, type ResourceState } from '../services/resource';
import { confirmItem, confirmRemoval, syncQuantityDraft } from '../services/list-state';
import type { ListDetails, ListItem } from '../services/private-contracts';
import { listItem, summary } from './private-fixtures';
import { deferred } from './fixtures';

const initial = (): ListDetails => ({ ...summary, items: [structuredClone(listItem),
  { ...structuredClone(listItem), id: 10, productId: 2, product: { ...listItem.product, id: 2, size: 330, unit: 'ml' } }] });
async function fixture() {
  const states: ResourceState<ListDetails>[] = [];
  const resource = createResource<ListDetails>(state => states.push(state), () => false);
  resource.start('list:1', async () => initial()); await Promise.resolve();
  return { resource, states, latest: () => states[states.length - 1] };
}
test('addition confirmation has correct names and automatically dismisses at 2.5 seconds', () => {
  const messages: (string | null)[] = []; let dismiss!: () => void, duration = 0;
  const notice = createConfirmation(message => messages.push(message), (callback, milliseconds) => {
    dismiss = callback; duration = milliseconds; return () => {};
  });
  notice.show('Coca-Cola', 'Weekly Groceries');
  assert.deepEqual(messages, ['✓ Coca-Cola added to Weekly Groceries']); assert.equal(duration, 2500);
  dismiss(); assert.deepEqual(messages, ['✓ Coca-Cola added to Weekly Groceries', null]);
});
test('an old dismissal or blur cannot erase a newer confirmation or publish stale text', () => {
  const messages: (string | null)[] = [], timers: (() => void)[] = [];
  const notice = createConfirmation(message => messages.push(message), callback => { timers.push(callback); return () => {}; });
  notice.show('One', 'First'); notice.show('Two', 'Second'); timers[0]();
  assert.equal(messages[messages.length - 1], '✓ Two added to Second');
  notice.cancel(); timers[1](); assert.equal(messages.length, 2);
});
test('failed additions preserve confirmed list state and never show success', async () => {
  const f = await fixture(), messages: (string | null)[] = [];
  const notice = createConfirmation(message => messages.push(message));
  const errors: ProductActions[] = [], actions = createProductActions(state => errors.push(state));
  const before = f.latest().data;
  await actions.run('add:1', async () => {
    notice.clear(); f.resource.update('list:1', current => current);
    throw new ApiError('http', 'Cannot add this product.', 400);
  }, item => { f.resource.update('list:1', current => confirmItem(current, item)); notice.show('Coca-Cola', 'Weekly'); });
  assert.equal(f.latest().data, before); assert.equal(f.latest().status, 'loaded');
  assert.equal(messages.some(message => message?.startsWith('✓')), false);
  assert.equal(errors[errors.length - 1]['add:1'].error, 'Cannot add this product.');
});
test('quantity changes stay visible while pending and update only the confirmed row without loading', async () => {
  const f = await fixture(), response = deferred<ListItem>(), actions = createProductActions(() => {});
  const before = f.latest().data!, statuses = f.states.length;
  const pending = actions.run('9', () => response.promise, saved => f.resource.update('list:1', current => confirmItem(current, saved)));
  assert.equal(f.latest().data, before); assert.equal(f.latest().data!.items[0].quantity, 2);
  response.resolve({ ...listItem, quantity: 3 }); await pending;
  assert.equal(f.latest().data!.items[0].quantity, 3);
  assert.equal(f.latest().data!.items[1], before.items[1]);
  assert.ok(f.states.slice(statuses).every(state => state.status === 'loaded' && state.data !== null));
});
test('confirmed removal deletes one row without clearing the list or disturbing unrelated row identity', async () => {
  const f = await fixture(), before = f.latest().data!, response = deferred<void>();
  const actions = createProductActions(() => {}), pending = actions.run('9', () => response.promise,
    () => f.resource.update('list:1', current => confirmRemoval(current, 9)));
  assert.equal(f.latest().data!.items.length, 2); response.resolve(); await pending;
  assert.equal(f.latest().status, 'loaded'); assert.equal(f.latest().data!.items[0], before.items[1]);
});
test('parallel different-row responses merge into current data and same-row double taps are ignored', async () => {
  const f = await fixture(), first = deferred<ListItem>(), second = deferred<ListItem>();
  let calls = 0, idle = 0; let state: ProductActions = {};
  const actions = createProductActions(value => { state = value; }, () => idle++);
  const save = (item: ListItem) => f.resource.update('list:1', current => confirmItem(current, item));
  const a = actions.run('9', () => { calls++; return first.promise; }, save);
  await actions.run('9', async () => { calls++; return listItem; }, save);
  const b = actions.run('10', () => { calls++; return second.promise; }, save);
  await actions.run('list', async () => { throw new Error('List action must be excluded'); });
  assert.equal(calls, 2); assert.equal(state['9'].pending, true); assert.equal(state['10'].pending, true);
  second.resolve({ ...f.latest().data!.items[1], quantity: 7 }); await b;
  assert.equal(state['9'].pending, true); assert.equal(idle, 0);
  first.resolve({ ...listItem, quantity: 3 }); await a;
  assert.deepEqual(f.latest().data!.items.map(item => item.quantity), [3, 7]); assert.equal(idle, 1);
});
test('list-level action blocks item writes until complete', async () => {
  const response = deferred<void>(), actions = createProductActions(() => {}); let calls = 0;
  const pending = actions.run('list', () => response.promise);
  await actions.run('9', async () => { calls++; }); assert.equal(calls, 0);
  response.resolve(); await pending; await actions.run('9', async () => { calls++; }); assert.equal(calls, 1);
});
test('successful additions insert/replace by stable item ID only after confirmation', async () => {
  const f = await fixture(), response = deferred<ListItem>(), messages: (string | null)[] = [];
  const notice = createConfirmation(message => messages.push(message), () => () => {});
  const actions = createProductActions(() => {}), saved = { ...listItem, id: 11, productId: 13, product: { ...listItem.product, id: 13 } };
  const pending = actions.run('add:13', () => response.promise, item => {
    f.resource.update('list:1', current => confirmItem(current, item)); notice.show(item.product.name, f.latest().data!.name);
  });
  assert.equal(f.latest().data!.items.length, 2); assert.deepEqual(messages, []);
  response.resolve(saved); await pending; assert.equal(f.latest().data!.items.length, 3);
  f.resource.update('list:1', current => confirmItem(current, { ...saved, quantity: 5 }));
  assert.equal(f.latest().data!.items.length, 3); assert.equal(f.latest().data!.items[2].quantity, 5);
  assert.deepEqual(messages, ['✓ Coca-Cola added to Weekly']);
});
test('confirmed changes invalidate older background reads even when abort is ignored', async () => {
  const f = await fixture(), response = deferred<ListDetails>();
  f.resource.start('list:1', () => response.promise, { refresh: true, retainOnError: true });
  f.resource.update('list:1', current => confirmItem(current, { ...listItem, quantity: 3 }));
  response.resolve(initial()); await response.promise;
  assert.equal(f.latest().data!.items[0].quantity, 3); assert.equal(f.latest().status, 'loaded');
});
test('starting an operation with unchanged data does not publish a redundant page render', async () => {
  const f = await fixture(), before = f.states.length;
  assert.equal(f.resource.update('list:1', current => current), true);
  assert.equal(f.states.length, before);
  f.resource.update('list:1', current => confirmItem(current, { ...listItem, quantity: 3 }));
  assert.equal(f.states.length, before + 1);
});
test('decreases synchronize the confirmed input immediately, including the boundary at one', () => {
  const draft = { confirmed: 3, value: '3' };
  const two = syncQuantityDraft(draft, 2), one = syncQuantityDraft(two, 1);
  assert.deepEqual(two, { confirmed: 2, value: '2' });
  assert.deepEqual(one, { confirmed: 1, value: '1' });
  assert.equal(syncQuantityDraft(one, 1), one, 'No follow-up effect/state change is necessary');
  const editing = { confirmed: 2, value: '17' };
  assert.equal(syncQuantityDraft(editing, 2), editing, 'Unconfirmed input survives unrelated renders and failures');
});
test('decreasing and removing an item retain every unrelated item reference and list metadata', () => {
  const before = initial(), other = before.items[1];
  const decreased = confirmItem(before, { ...before.items[0], quantity: 1 });
  const removed = confirmRemoval(decreased, before.items[0].id);
  assert.equal(decreased.items[1], other); assert.equal(removed.items[0], other);
  assert.equal(removed.name, before.name); assert.equal(removed.id, before.id);
  assert.equal(before.items[0].quantity, 2); assert.equal(before.items.length, 2);
});
test('failed decrease and removal keep the previously confirmed rows and report the item error', async () => {
  for (const operation of ['decrease', 'remove']) {
    const f = await fixture(), before = f.latest().data!; let states: ProductActions = {};
    const actions = createProductActions(value => { states = value; });
    await actions.run('9', async () => { throw new ApiError('http', 'Please retry this item.', 500); }, () => {
      f.resource.update('list:1', current => operation === 'remove' ? confirmRemoval(current, 9)
        : confirmItem(current, { ...listItem, quantity: 1 }));
    });
    assert.equal(f.latest().data, before); assert.equal(f.latest().data!.items[0].quantity, 2);
    assert.equal(f.latest().data!.items[1], before.items[1]); assert.equal(states['9'].error, 'Please retry this item.');
  }
});
test('focus/background reads and failures retain data for the same list but never another identity', async () => {
  const f = await fixture(), before = f.latest().data!;
  const response = deferred<ListDetails>();
  f.resource.cancel(); f.resource.start('list:1', () => response.promise, { refresh: true, retainOnError: true });
  assert.equal(f.latest().status, 'refreshing'); assert.equal(f.latest().data, before);
  response.reject(new ApiError('network', 'Retry the connection.')); await response.promise.catch(() => {});
  assert.equal(f.latest().status, 'error'); assert.equal(f.latest().data, before);
  assert.equal(f.resource.update('list:old-account', current => current), false);
  f.resource.start('list:other-account', async () => initial(), { refresh: true, retainOnError: true });
  assert.equal(f.latest().data, null); await Promise.resolve();
});
test('blur/session transition suppresses late row updates and success confirmation', async () => {
  const f = await fixture(), response = deferred<ListItem>(), messages: string[] = [];
  const actions = createProductActions(() => {}), before = f.latest().data;
  const pending = actions.run('9', () => response.promise, saved => {
    f.resource.update('list:1', current => confirmItem(current, saved)); messages.push('success');
  });
  actions.cancel(); response.resolve({ ...listItem, quantity: 3 }); await pending;
  assert.equal(f.latest().data, before); assert.deepEqual(messages, []);
});
