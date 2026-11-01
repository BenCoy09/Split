import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, claimRole, subscribe, RoomError, addPatch, approvePatch, setLook } from '../src/state.js';
import { viewFor } from '../src/roles.js';
import { bugs } from '../src/fixtures/bugs.js';

test('room codes are six chars from the unambiguous alphabet', () => {
  for (let i = 0; i < 50; i += 1) {
    const { code } = createRoom(bugs[0]);
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  }
});

test('join with the right token claims a role exactly once', () => {
  const room = createRoom(bugs[0]);
  const token = room.roles.logs.token;
  claimRole(room.code, 'logs', token);
  assert.equal(room.roles.logs.claimed, true);
  claimRole(room.code, 'logs', token);
  assert.equal(room.roles.logs.claimed, true);
});

test('rejoining with the same token is idempotent and emits nothing', () => {
  const room = createRoom(bugs[0]);
  let calls = 0;
  const unsub = subscribe(room.code, () => {
    calls += 1;
  });
  claimRole(room.code, 'logs', room.roles.logs.token);
  assert.equal(calls, 1);
  claimRole(room.code, 'logs', room.roles.logs.token);
  assert.equal(room.roles.logs.claimed, true);
  assert.equal(calls, 1);
  unsub();
});

test('rejoining a claimed role with a different token is 409', () => {
  const room = createRoom(bugs[0]);
  claimRole(room.code, 'logs', room.roles.logs.token);
  assert.throws(
    () => claimRole(room.code, 'logs', 'a-different-token'),
    (err) => err instanceof RoomError && err.status === 409
  );
});

test('join with a wrong token is forbidden and does not claim', () => {
  const room = createRoom(bugs[0]);
  assert.throws(
    () => claimRole(room.code, 'logs', 'nope'),
    (err) => err instanceof RoomError && err.status === 403
  );
  assert.equal(room.roles.logs.claimed, false);
});

test('unknown role or room is rejected', () => {
  const room = createRoom(bugs[0]);
  assert.throws(
    () => claimRole(room.code, 'admin', 'x'),
    (err) => err instanceof RoomError && err.status === 400
  );
  assert.throws(
    () => claimRole('ZZZZZZ', 'logs', 'x'),
    (err) => err instanceof RoomError && err.status === 404
  );
});

test('subscribe listeners fire on change and unsubscribing stops them', () => {
  const room = createRoom(bugs[0]);
  let calls = 0;
  const unsub = subscribe(room.code, () => {
    calls += 1;
  });
  claimRole(room.code, 'logs', room.roles.logs.token);
  unsub();
  claimRole(room.code, 'source', room.roles.source.token);
  assert.equal(calls, 1);
});

const FIX_DIFF = [
  '--- a/src/cart.js',
  '+++ b/src/cart.js',
  '@@ -5,7 +5,6 @@',
  ' export function orderTotalCents(items) {',
  '-  const lines = items.reduce(',
  '-    (sum, item) => sum + lineCents(item),',
  '-    0',
  '-  );',
  '-  const discounted = lines * 0.9;',
  '+  const raw = items.reduce((sum, item) => sum + item.price * item.qty * 100, 0);',
  '+  const discounted = raw * 0.9;',
  '   return Math.round(discounted);',
  '}',
].join('\n');

const WRONG_DIFF = [
  '--- a/src/cart.js',
  '+++ b/src/cart.js',
  '@@ -11,1 +11,1 @@',
  '-  return Math.round(discounted);',
  '+  return 417;',
].join('\n');

test('a patch request records a pending patch with per-role approvals', () => {
  const room = createRoom(bugs[0]);
  let calls = 0;
  const unsub = subscribe(room.code, () => {
    calls += 1;
  });
  const patch = addPatch(room, 'logs', FIX_DIFF);
  assert.equal(patch.status, 'pending');
  assert.equal(patch.requestedBy, 'logs');
  assert.deepEqual(patch.approvals, { logs: false, source: false });
  assert.equal(calls, 1);
  unsub();
});

test('both approvals apply the patch and the tests pass', () => {
  const room = createRoom(bugs[0]);
  const patch = addPatch(room, 'logs', FIX_DIFF);
  const first = approvePatch(room, patch.id, 'logs', room.roles.logs.token);
  assert.equal(first.applied, false);
  assert.equal(patch.status, 'pending');
  const second = approvePatch(room, patch.id, 'source', room.roles.source.token);
  assert.equal(second.applied, true);
  assert.equal(second.testResult, 'pass');
  assert.equal(patch.status, 'applied');
  assert.equal(patch.testResult, 'pass');
  assert.equal(room.source[0].content, room.fixedSource[0].content);
  assert.ok(room.tests.every((t) => t.status === 'pass'));
});

test('a wrong patch applies but fails the tests', () => {
  const room = createRoom(bugs[0]);
  const patch = addPatch(room, 'logs', WRONG_DIFF);
  approvePatch(room, patch.id, 'logs', room.roles.logs.token);
  approvePatch(room, patch.id, 'source', room.roles.source.token);
  assert.equal(patch.status, 'applied');
  assert.equal(patch.testResult, 'fail');
  assert.match(room.source[0].content, /return 417;/);
  assert.ok(room.tests.some((t) => t.status === 'fail'));
});

test('approving with the wrong token is forbidden', () => {
  const room = createRoom(bugs[0]);
  const patch = addPatch(room, 'logs', FIX_DIFF);
  assert.throws(
    () => approvePatch(room, patch.id, 'logs', 'nope'),
    (err) => err instanceof RoomError && err.status === 403
  );
  assert.deepEqual(patch.approvals, { logs: false, source: false });
});

test('the same role approving twice does not apply the patch', () => {
  const room = createRoom(bugs[0]);
  const patch = addPatch(room, 'logs', FIX_DIFF);
  approvePatch(room, patch.id, 'logs', room.roles.logs.token);
  const again = approvePatch(room, patch.id, 'logs', room.roles.logs.token);
  assert.equal(again.applied, false);
  assert.equal(patch.status, 'pending');
});

test('an applied patch cannot be approved again', () => {
  const room = createRoom(bugs[0]);
  const patch = addPatch(room, 'logs', FIX_DIFF);
  approvePatch(room, patch.id, 'logs', room.roles.logs.token);
  approvePatch(room, patch.id, 'source', room.roles.source.token);
  assert.throws(
    () => approvePatch(room, patch.id, 'logs', room.roles.logs.token),
    (err) => err instanceof RoomError && err.status === 409
  );
});

test('a diff that does not match the source is rejected', () => {
  const room = createRoom(bugs[0]);
  const patch = addPatch(room, 'logs', [
    '--- a/src/cart.js',
    '+++ b/src/cart.js',
    '@@ -2,1 +2,1 @@',
    '-  return 999;',
    '+  return 1000;',
  ].join('\n'));
  approvePatch(room, patch.id, 'logs', room.roles.logs.token);
  assert.throws(
    () => approvePatch(room, patch.id, 'source', room.roles.source.token),
    (err) => err instanceof RoomError && err.status === 422 && err.code === 'bad_diff'
  );
  assert.equal(patch.status, 'pending');
});

test('approving an unknown patch is 404 and an unknown role is 400', () => {
  const room = createRoom(bugs[0]);
  assert.throws(
    () => approvePatch(room, 'no-such-id', 'logs', room.roles.logs.token),
    (err) => err instanceof RoomError && err.status === 404
  );
  assert.throws(
    () => approvePatch(room, 'no-such-id', 'admin', 'x'),
    (err) => err instanceof RoomError && err.status === 400
  );
});

test('a look update records the position per role and emits', () => {
  const room = createRoom(bugs[0]);
  let calls = 0;
  const unsub = subscribe(room.code, () => {
    calls += 1;
  });
  setLook(room, 'logs', room.roles.logs.token, 3);
  assert.deepEqual(room.look.logs, { at: 3, ts: room.look.logs.ts });
  assert.equal(calls, 1);
  setLook(room, 'source', room.roles.source.token, 12);
  assert.deepEqual(room.look.source, { at: 12, ts: room.look.source.ts });
  unsub();
});

test('look with a wrong token or a bad position is rejected', () => {
  const room = createRoom(bugs[0]);
  assert.throws(
    () => setLook(room, 'logs', 'nope', 3),
    (err) => err instanceof RoomError && err.status === 403
  );
  assert.throws(
    () => setLook(room, 'logs', room.roles.logs.token, 0),
    (err) => err instanceof RoomError && err.status === 400
  );
  assert.throws(
    () => setLook(room, 'logs', room.roles.logs.token, 1.5),
    (err) => err instanceof RoomError && err.status === 400
  );
  assert.equal(room.look.logs, null);
});

test('verdict records time, patches tried and approvals after a pass', () => {
  const room = createRoom(bugs[0]);
  const patch = addPatch(room, 'logs', FIX_DIFF);
  approvePatch(room, patch.id, 'logs', room.roles.logs.token);
  const before = Date.now();
  approvePatch(room, patch.id, 'source', room.roles.source.token);
  const view = viewFor(room, 'source');
  assert.equal(view.verdict.solved, true);
  assert.ok(view.verdict.timeTakenMs >= 0);
  assert.ok(view.verdict.timeTakenMs <= before - room.createdAt + 5);
  assert.equal(view.verdict.patchesTried, 1);
  assert.deepEqual(view.verdict.patches[0].approvals, { logs: true, source: true });
  const logsVerdict = viewFor(room, 'logs').verdict;
  assert.equal(logsVerdict.solved, true);
  assert.equal(logsVerdict.patchesTried, 1);
});
