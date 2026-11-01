import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, ROLES, setLook } from '../src/state.js';
import { viewFor } from '../src/roles.js';
import { bugs } from '../src/fixtures/bugs.js';

function makeRoom() {
  const room = createRoom(bugs[0]);
  room.agentTurns.push({ id: 't1', role: 'logs', text: 'totals look wrong', ts: 1 });
  room.patches.push({
    id: 'p1',
    requestedBy: 'logs',
    status: 'pending',
    createdAt: 2,
    approvals: { logs: false, source: false },
    testResult: null,
    offline: false,
    diff: '- return amount * 100;\n+ return Math.round(amount * 100);',
  });
  return room;
}

test('logs view never explains the cause', () => {
  for (const bug of bugs) {
    const room = createRoom(bug);
    const { fixtureId, ...content } = viewFor(room, 'logs');
    const flat = JSON.stringify(content, (key, value) =>
      key === 'id' ? undefined : value
    );
    const title = content.title;
    if (bug.id === 'cart-cent') {
      assert.equal(title, 'Order total is off by one cent');
      assert.ok(!/discount|round/i.test(flat), 'cart-cent logs view leaks the cause');
    }
    if (bug.id === 'page-slice') {
      assert.ok(!/slice|off.by.one/i.test(flat), 'page-slice logs view leaks the cause');
    }
    if (bug.id === 'utc-day') {
      assert.ok(!/utc|timezone/i.test(flat), 'utc-day logs view leaks the cause');
    }
  }
});

test('logs view keeps runtime values but no source paths or content', () => {
  const view = viewFor(makeRoom(), 'logs');
  assert.equal(view.role, 'logs');
  assert.equal(view.logs.length, 5);
  const flat = JSON.stringify(view);
  assert.ok(!flat.includes('src/cart.js'));
  assert.ok(!flat.includes('item.price * item.qty'));
  assert.ok(!flat.includes('Math.round'));
  assert.ok(!flat.includes('diff'));
});

test('logs view hides test output and patch contents', () => {
  const view = viewFor(makeRoom(), 'logs');
  const flat = JSON.stringify(view);
  assert.ok(!flat.includes('Received:'));
  assert.ok(!flat.includes('return Math.round'));
  assert.deepEqual(view.patches, [
    {
      id: 'p1',
      requestedBy: 'logs',
      status: 'pending',
      approvals: { logs: false, source: false },
      testResult: null,
      offline: false,
      createdAt: 2,
    },
  ]);
});

test('source view keeps code and diffs but no runtime values or test output', () => {
  const view = viewFor(makeRoom(), 'source');
  assert.equal(view.role, 'source');
  assert.equal(view.source[0].path, 'src/cart.js');
  const flat = JSON.stringify(view);
  assert.ok(flat.includes('Math.round(discounted)'));
  assert.ok(!flat.includes('416.25'));
  assert.ok(!flat.includes('112.5'));
  assert.ok(!flat.includes('testOutput'));
  assert.ok(!flat.includes('Received:'));
});

test('neither view leaks join tokens or claimed flags', () => {
  const room = makeRoom();
  for (const role of ROLES) {
    const flat = JSON.stringify(viewFor(room, role));
    for (const slot of Object.values(room.roles)) {
      assert.ok(!flat.includes(slot.token));
    }
    assert.ok(!flat.includes('token'));
    assert.ok(!flat.includes('claimed'));
  }
});

test('unknown roles get null, never a whole-room object', () => {
  const room = makeRoom();
  assert.equal(viewFor(room, 'admin'), null);
  assert.equal(viewFor(room, 'source '), null);
  assert.equal(viewFor(room, undefined), null);
});

test('logs view shows patch status and approvals but never the diff', () => {
  const view = viewFor(makeRoom(), 'logs');
  assert.equal(view.patches.length, 1);
  assert.equal(view.patches[0].status, 'pending');
  assert.deepEqual(view.patches[0].approvals, { logs: false, source: false });
  const flat = JSON.stringify(view);
  assert.ok(!flat.includes('return amount * 100'));
  assert.ok(!flat.includes('diff'));
});

test('source view includes the full patch diff', () => {
  const view = viewFor(makeRoom(), 'source');
  assert.equal(view.patches.length, 1);
  assert.match(view.patches[0].diff, /return Math\.round\(amount \* 100\)/);
});

test('partner indicator exposes only a position, never content', () => {
  const room = makeRoom();
  room.look.logs = { at: 2, ts: 111 };
  room.look.source = { at: 5, ts: 222 };
  const logsView = viewFor(room, 'logs');
  assert.deepEqual(logsView.partner, { role: 'source', at: 5, ts: 222 });
  const sourceView = viewFor(room, 'source');
  assert.deepEqual(sourceView.partner, { role: 'logs', at: 2, ts: 111 });
  const flat = JSON.stringify(logsView);
  assert.ok(!flat.includes('Math.round(amount * 100)'));
});

test('verdict summary carries counts and approvals but never the diff', () => {
  const view = viewFor(makeRoom(), 'logs');
  assert.equal(view.verdict.solved, false);
  assert.equal(view.verdict.timeTakenMs, null);
  assert.equal(view.verdict.patchesTried, 0);
  assert.equal(view.verdict.patches[0].requestedBy, 'logs');
  const flat = JSON.stringify(view.verdict);
  assert.ok(!flat.includes('return amount * 100'));
});
