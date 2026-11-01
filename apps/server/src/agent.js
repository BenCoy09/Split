import { randomUUID } from 'node:crypto';
import { viewFor } from './roles.js';
import { findLeak } from './leakcheck.js';
import { RoomError, addAgentTurn, addPatch } from './state.js';

export const REFUSAL = "That's on your partner's side. Ask them.";

export function agentConfigured() {
  const provider = process.env.AGENT_PROVIDER;
  return (
    (provider === 'gemini' || provider === 'groq') &&
    Boolean(process.env.AGENT_API_KEY) &&
    Boolean(process.env.AGENT_MODEL)
  );
}

function turn(room, role, question, text, refusal, offline = false) {
  return addAgentTurn(room, {
    id: randomUUID(),
    role,
    question,
    text,
    refusal,
    offline,
    ts: Date.now(),
  });
}

export async function askAgent(room, role, question, deps = {}) {
  const view = viewFor(room, role);
  if (!view) {
    throw new RoomError(400, 'bad_role', `Unknown role "${role}"`);
  }

  if (findLeak(question, room, role)) {
    return turn(room, role, question, REFUSAL, true);
  }

  const callModel = deps.callModel;
  if (!callModel && !agentConfigured()) {
    throw new RoomError(503, 'agent_unconfigured', 'Agent provider is not configured');
  }

  let answer;
  try {
    answer = await (callModel ?? providerCall)(view, role, question);
  } catch (err) {
    if (err instanceof RoomError) throw err;
    console.error(`[agent] provider call failed for room ${room.code} role ${role}:`, err);
    return turn(room, role, question, offlineAnswer(role, view), false, true);
  }

  if (normalize(answer) === normalize(REFUSAL) || findLeak(answer, room, role)) {
    return turn(room, role, question, REFUSAL, true);
  }

  return turn(room, role, question, answer, false);
}

function normalize(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function offlineAnswer(role, view) {
  const failing = view.tests
    .filter((test) => test.status === 'fail')
    .map((test) => `"${test.name}"`);
  const failLine = failing.length
    ? `Failing test(s): ${failing.join(', ')}.`
    : 'No failing tests are visible to you.';
  if (role === 'source') {
    const paths = view.source.map((file) => file.path).join(', ');
    return `[offline] The agent provider is unreachable. ${failLine} Re-read ${paths} and make the code satisfy the expected values in those tests.`;
  }
  const logLines = view.logs
    .map((log) => `${log.label}=${JSON.stringify(log.value)}`)
    .join(', ');
  return `[offline] The agent provider is unreachable. ${failLine} Your logs: ${logLines}. Compare what you see with your partner's side.`;
}

function offlinePatchDiff(room) {
  return room.source
    .map((file) => {
      const fixed = room.fixedSource.find((f) => f.path === file.path);
      if (!fixed || fixed.content === file.content) return '';
      const oldLines = file.content.split('\n');
      const newLines = fixed.content.split('\n');
      return [
        `--- a/${file.path}`,
        `+++ b/${file.path}`,
        `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
        ...oldLines.map((line) => `-${line}`),
        ...newLines.map((line) => `+${line}`),
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n');
}

const PATCH_SYSTEM_PROMPT = [
  'You are the fixing assistant for one role in a co-op debugging game.',
  'You are given a JSON context containing EVERYTHING this role can know.',
  'Produce a unified diff that fixes the bug the failing tests describe.',
  'Change only what the context justifies; never invent files or facts.',
  'Reply with ONLY the unified diff (--- / +++ / @@ hunks), no prose, no code fences.',
].join(' ');

function extractDiff(text) {
  const fenced = /```(?:diff)?\n([\s\S]*?)```/.exec(String(text));
  const body = (fenced ? fenced[1] : String(text)).trim();
  return body.startsWith('--- ') ? body : null;
}

export async function askForPatch(room, role, deps = {}) {
  const view = viewFor(room, role);
  if (!view) {
    throw new RoomError(400, 'bad_role', `Unknown role "${role}"`);
  }

  const callModel = deps.callModel;
  if (!callModel && !agentConfigured()) {
    throw new RoomError(503, 'agent_unconfigured', 'Agent provider is not configured');
  }

  let answer;
  try {
    answer = await (callModel ?? providerCall)(
      view,
      role,
      'Produce a unified diff that fixes the bug the failing tests describe.',
      PATCH_SYSTEM_PROMPT
    );
  } catch (err) {
    if (err instanceof RoomError) throw err;
    console.error(`[agent] patch request failed for room ${room.code} role ${role}:`, err);
    return addPatch(room, role, offlinePatchDiff(room), { offline: true });
  }

  const diff = extractDiff(answer);
  if (!diff) {
    console.error(`[agent] patch request for room ${room.code} role ${role}: no usable diff`);
    return addPatch(room, role, offlinePatchDiff(room), { offline: true });
  }

  return addPatch(room, role, diff);
}

const SYSTEM_PROMPT = [
  'You are the in-game assistant for one role in a co-op debugging game.',
  'You are given a JSON context containing EVERYTHING this role can know.',
  'Answer only with facts directly present in that context.',
  'If the question needs anything not in the context, or is about the other role\'s material, reply with exactly this line and nothing else: "That\'s on your partner\'s side. Ask them."',
  'Never quote, paraphrase, or guess anything that is not in the context.',
].join(' ');

function userPrompt(view, question) {
  return `Context (the only facts you may use): ${JSON.stringify(view)}\n\nQuestion: ${question}`;
}

async function providerCall(view, role, question, system = SYSTEM_PROMPT) {
  const provider = process.env.AGENT_PROVIDER;
  const key = process.env.AGENT_API_KEY;
  const model = process.env.AGENT_MODEL;
  const systemText = `${system} Your role: "${role}".`;
  const user = userPrompt(view, question);

  let res;
  if (provider === 'gemini') {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
        }),
      }
    );
    console.log(`[agent] POST /v1beta/models/${model}:generateContent -> HTTP ${res.status}`);
    if (!res.ok) {
      throw new RoomError(502, 'agent_error', `Provider returned HTTP ${res.status}`);
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return parts.map((part) => part.text ?? '').join('');
  }

  const groqModel = await resolveGroqModel(key);
  res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: groqModel,
      messages: [
        { role: 'system', content: systemText },
        { role: 'user', content: user },
      ],
    }),
  });
  console.log(`[agent] POST /openai/v1/chat/completions model=${groqModel} -> HTTP ${res.status}`);
  if (!res.ok) {
    throw new RoomError(502, 'agent_error', `Provider returned HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

let groqModelCache = null;

export function resetAgentState() {
  groqModelCache = null;
}

async function resolveGroqModel(key) {
  if (groqModelCache) return groqModelCache;
  const requested = process.env.AGENT_MODEL;
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.log(`[agent] GET /openai/v1/models -> HTTP ${res.status}`);
    throw new RoomError(502, 'agent_error', `Provider returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const ids = (data.data ?? []).map((entry) => entry.id);
  const preferred = [requested, 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile'].filter(
    Boolean
  );
  const chosen = preferred.find((id) => ids.includes(id)) ?? ids[0];
  if (!chosen) {
    throw new RoomError(502, 'agent_error', 'Provider returned no models');
  }
  groqModelCache = chosen;
  console.log(`[agent] GET /openai/v1/models model=${chosen} -> HTTP ${res.status}`);
  return chosen;
}

export async function providerSelfTest() {
  if (!agentConfigured()) {
    console.log('[agent] startup check -> not configured');
    return 'not configured';
  }
  const provider = process.env.AGENT_PROVIDER;
  const key = process.env.AGENT_API_KEY;
  const model = process.env.AGENT_MODEL;
  try {
    let res;
    let path;
    if (provider === 'groq') {
      const chosen = await resolveGroqModel(key);
      path = '/openai/v1/chat/completions';
      res = await fetch(`https://api.groq.com${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: chosen,
          messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
          max_tokens: 5,
        }),
      });
    } else {
      path = `/v1beta/models/${model}:generateContent`;
      res = await fetch(
        `https://generativelanguage.googleapis.com${path}?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
          }),
        }
      );
    }
    const outcome = res.ok ? 'OK' : `HTTP ${res.status}`;
    console.log(`[agent] startup check POST ${path} model=${model} -> ${outcome}`);
    return outcome;
  } catch (err) {
    const status = /HTTP (\d+)/.exec(err?.message ?? '');
    const outcome = status ? `HTTP ${status[1]}` : 'failed';
    console.log(`[agent] startup check -> ${outcome}`);
    return outcome;
  }
}
