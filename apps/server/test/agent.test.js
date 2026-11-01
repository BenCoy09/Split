import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../src/state.js';
import { askAgent, askForPatch, REFUSAL, agentConfigured, resetAgentState, providerSelfTest } from '../src/agent.js';
import { bugs } from '../src/fixtures/bugs.js';

test('agentConfigured requires provider, key, and model', () => {
  const old = { ...process.env };
  process.env.AGENT_PROVIDER = 'gemini';
  process.env.AGENT_API_KEY = 'k';
  process.env.AGENT_MODEL = 'm';
  assert.equal(agentConfigured(), true);
  process.env.AGENT_PROVIDER = 'openai';
  assert.equal(agentConfigured(), false);
  process.env.AGENT_PROVIDER = 'groq';
  assert.equal(agentConfigured(), true);
  Object.assign(process.env, old);
});

test('a question containing the other role content is refused without calling the model', async () => {
  const room = createRoom(bugs[0]);
  let called = 0;
  const turn = await askAgent(room, 'logs', 'why does const discounted = lines * 0.9 fail?', {
    callModel: async () => {
      called += 1;
      return 'never';
    },
  });
  assert.equal(called, 0);
  assert.equal(turn.refusal, true);
  assert.equal(turn.text, REFUSAL);
  assert.equal(room.agentTurns.length, 1);
});

test('an answer leaking the other role data is replaced by the refusal', async () => {
  const room = createRoom(bugs[0]);
  const turn = await askAgent(room, 'logs', 'what should we look at?', {
    callModel: async () => 'Change the Math.round(discounted) line in src/cart.js.',
  });
  assert.equal(turn.refusal, true);
  assert.equal(turn.text, REFUSAL);
  assert.equal(room.agentTurns[0].refusal, true);
});

test('a clean answer from the scoped model passes through', async () => {
  const room = createRoom(bugs[0]);
  const turn = await askAgent(room, 'logs', 'what do the logs show?', {
    callModel: async () => 'Your third line shows 113 cents and the expected total is 416.',
  });
  assert.equal(turn.refusal, false);
  assert.equal(turn.text, 'Your third line shows 113 cents and the expected total is 416.');
  assert.equal(room.agentTurns[0].role, 'logs');
});

test('a model-side refusal becomes a refusal turn', async () => {
  const room = createRoom(bugs[0]);
  const turn = await askAgent(room, 'source', 'what is in the logs?', {
    callModel: async () => REFUSAL,
  });
  assert.equal(turn.refusal, true);
  assert.equal(turn.text, REFUSAL);
});

test('a provider crash falls back to a labelled offline answer', async () => {
  const room = createRoom(bugs[0]);
  const turn = await askAgent(room, 'logs', 'what do the logs show?', {
    callModel: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(turn.refusal, false);
  assert.equal(turn.offline, true);
  assert.match(turn.text, /^\[offline\]/);
});

test('unknown roles are rejected before anything else', async () => {
  const room = createRoom(bugs[0]);
  await assert.rejects(
    () => askAgent(room, 'admin', 'hi', { callModel: async () => 'x' }),
    (err) => err.status === 400
  );
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

test('a patch request stores a pending patch with the model diff', async () => {
  const room = createRoom(bugs[0]);
  const patch = await askForPatch(room, 'source', {
    callModel: async () => '```diff\n' + FIX_DIFF + '\n```',
  });
  assert.equal(patch.status, 'pending');
  assert.equal(patch.requestedBy, 'source');
  assert.equal(patch.diff, FIX_DIFF);
  assert.deepEqual(patch.approvals, { logs: false, source: false });
  assert.equal(room.patches.length, 1);
});

test('a non-diff model answer falls back to an offline patch', async () => {
  const room = createRoom(bugs[0]);
  const patch = await askForPatch(room, 'logs', {
    callModel: async () => 'I cannot help with that.',
  });
  assert.equal(patch.offline, true);
  assert.equal(patch.status, 'pending');
  assert.match(patch.diff, /^--- a\//);
});

test('either role can request a patch and unknown roles cannot', async () => {
  const room = createRoom(bugs[0]);
  const fromLogs = await askForPatch(room, 'logs', {
    callModel: async () => FIX_DIFF,
  });
  assert.equal(fromLogs.requestedBy, 'logs');
  await assert.rejects(
    () => askForPatch(room, 'admin', { callModel: async () => FIX_DIFF }),
    (err) => err.status === 400
  );
});

const failingModel = async () => {
  throw new TypeError('fetch failed');
};

test('a provider failure on cart-cent falls back to a labelled built-in answer', async () => {
  const room = createRoom(bugs[0]);
  const turn = await askAgent(room, 'logs', 'what do the logs show?', {
    callModel: failingModel,
    allowFallback: true,
  });
  assert.equal(turn.refusal, false);
  assert.equal(turn.offline, true);
  assert.match(turn.text, /^\[offline\]/);
  const sourceTurn = await askAgent(room, 'source', 'what is the bug?', {
    callModel: failingModel,
    allowFallback: true,
  });
  assert.equal(sourceTurn.offline, true);
  assert.match(sourceTurn.text, /^\[offline\]/);
});

test('the offline fallback works for every fixture and stays cause-free', async () => {
  for (const bug of bugs) {
    const room = createRoom(bug);
    const turn = await askAgent(room, 'logs', 'what do the logs show?', {
      callModel: failingModel,
    });
    assert.equal(turn.offline, true);
    assert.match(turn.text, /^\[offline\]/);

    const patch = await askForPatch(room, 'logs', { callModel: failingModel });
    assert.equal(patch.offline, true);
    const { approvePatch } = await import('../src/state.js');
    approvePatch(room, patch.id, 'logs', room.roles.logs.token);
    const result = approvePatch(room, patch.id, 'source', room.roles.source.token);
    assert.equal(result.testResult, 'pass', `${bug.id} offline patch should fix the bug`);
  }
});

test('groq requests use a model from the provider model list', async () => {
  const realFetch = globalThis.fetch;
  const prev = {
    provider: process.env.AGENT_PROVIDER,
    key: process.env.AGENT_API_KEY,
    model: process.env.AGENT_MODEL,
  };
  const urls = [];
  globalThis.fetch = async (url, opts = {}) => {
    urls.push(String(url));
    if (String(url).endsWith('/openai/v1/models')) {
      return new Response(
        JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'openai/gpt-oss-120b' }] }),
        { status: 200 }
      );
    }
    const body = JSON.parse(opts.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: `answer from ${body.model}` } }] }),
      { status: 200 }
    );
  };
  process.env.AGENT_PROVIDER = 'groq';
  process.env.AGENT_API_KEY = 'test-key';
  process.env.AGENT_MODEL = 'openai/gpt-oss-120b';
  resetAgentState();
  try {
    const room = createRoom(bugs[0]);
    const turn = await askAgent(room, 'logs', 'what do the logs show?');
    assert.match(turn.text, /answer from openai\/gpt-oss-120b/);
    assert.ok(urls.some((url) => url.endsWith('/openai/v1/models')));
    assert.ok(urls.every((url) => !url.includes('test-key')), 'key must never appear in a URL');
  } finally {
    for (const [name, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    globalThis.fetch = realFetch;
    resetAgentState();
  }
});

test('the startup probe reports OK or the HTTP status', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 401 });
  try {
    assert.equal(await providerSelfTest(), 'HTTP 401');
  } finally {
    globalThis.fetch = realFetch;
  }
});
