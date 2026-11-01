export function viewFor(room, role) {
  switch (role) {
    case 'logs':
      return logsView(room);
    case 'source':
      return sourceView(room);
    default:
      return null;
  }
}

function testSummary(room) {
  return room.tests.map((test) => ({ name: test.name, status: test.status }));
}

function patchSummary(room) {
  return room.patches.map((patch) => ({
    id: patch.id,
    requestedBy: patch.requestedBy,
    status: patch.status,
    approvals: { ...patch.approvals },
    testResult: patch.testResult,
    offline: Boolean(patch.offline),
    createdAt: patch.createdAt,
  }));
}

function verdictSummary(room) {
  return {
    solved: Boolean(room.solvedAt),
    timeTakenMs: room.solvedAt ? room.solvedAt - room.createdAt : null,
    patchesTried: room.patches.filter((patch) => patch.status === 'applied').length,
    patches: patchSummary(room),
  };
}

function partnerLook(room, role) {
  const other = role === 'logs' ? 'source' : 'logs';
  const look = room.look[other];
  return look ? { role: other, at: look.at, ts: look.ts } : null;
}

function logsView(room) {
  return {
    code: room.code,
    role: 'logs',
    title: room.title,
    fixtureId: room.fixtureId,
    partner: partnerLook(room, 'logs'),
    verdict: verdictSummary(room),
    logs: room.logs.map((log) => ({ id: log.id, ts: log.ts, label: log.label, value: log.value })),
    tests: testSummary(room),
    agentTurns: room.agentTurns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      question: turn.question,
      text: turn.text,
      refusal: turn.refusal,
      offline: Boolean(turn.offline),
      ts: turn.ts,
    })),
    patches: patchSummary(room),
  };
}

function sourceView(room) {
  return {
    code: room.code,
    role: 'source',
    title: room.title,
    fixtureId: room.fixtureId,
    partner: partnerLook(room, 'source'),
    verdict: verdictSummary(room),
    source: room.source.map((file) => ({ path: file.path, content: file.content })),
    tests: testSummary(room),
    agentTurns: room.agentTurns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      question: turn.question,
      text: turn.text,
      refusal: turn.refusal,
      offline: Boolean(turn.offline),
      ts: turn.ts,
    })),
    patches: room.patches.map((patch) => ({
      ...patch,
      approvals: { ...patch.approvals },
    })),
  };
}
