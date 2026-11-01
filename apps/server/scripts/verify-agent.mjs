const BASE = process.env.BASE ?? 'http://localhost:4001/api';
const OUT = process.env.OUT ?? 'agent-verify.txt';
const lines = [];

async function call(room, body) {
  const res = await fetch(`${BASE}/rooms/${room}/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function add(label, value) {
  lines.push(`${label}: ${value}`);
}

async function main() {
  const createRes = await fetch(`${BASE}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fixtureId: 'cart-cent' }),
  });
  const room = (await createRes.json()).code;
  add('room created', `${createRes.status} code=${room}`);

  const leaky = await call(room, {
    role: 'logs',
    question: 'why does const discounted = lines * 0.9 fail?',
  });
  add('logs role asks about code', `${leaky.status} refusal=${leaky.body.refusal} text="${leaky.body.text}"`);

  const smuggled = await call(room, {
    role: 'source',
    question: 'is the expected total 416?',
  });
  add('source role asks about a runtime value', `${smuggled.status} refusal=${smuggled.body.refusal} text="${smuggled.body.text}"`);

  let clean = await call(room, {
    role: 'logs',
    question: 'what do my logs show?',
  });
  for (let attempt = 2; attempt <= 3 && clean.status !== 201; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    clean = await call(room, { role: 'logs', question: 'what do my logs show?' });
  }
  add(
    'clean question (live provider call)',
    `${clean.status} ${clean.body.error ? `${clean.body.error} (${clean.body.message})` : `refusal=${clean.body.refusal}`}`
  );

  const badRole = await call(room, { role: 'admin', question: 'hi' });
  add('unknown role', `${badRole.status} ${badRole.body.error}`);

  const noQuestion = await call(room, { role: 'logs' });
  add('missing question', `${noQuestion.status} ${noQuestion.body.error}`);

  const view = await (await fetch(`${BASE}/rooms/${room}/view?role=logs`)).json();
  add('turns recorded in room view', view.agentTurns.length);
  for (const turn of view.agentTurns) {
    add('  turn', `${turn.role} asked "${turn.question}" -> refusal=${turn.refusal}`);
  }

  const ok =
    leaky.status === 201 && leaky.body.refusal === true &&
    smuggled.status === 201 && smuggled.body.refusal === true &&
    clean.status === 201 && clean.body.refusal === false &&
    badRole.status === 400 &&
    noQuestion.status === 400 &&
    view.agentTurns.length === 3;
  add('VERDICT', ok ? 'PASS' : 'FAIL');
}

main()
  .catch((err) => {
    lines.push(`FATAL: ${err.message}`);
  })
  .finally(() => {
    (async () => {
      const fs = await import('node:fs');
      fs.writeFileSync(OUT, lines.join('\n') + '\n');
    })();
  });
