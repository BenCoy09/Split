import { randomBytes, randomInt, randomUUID } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const rooms = new Map();
const listeners = new Map();

export const ROLES = ['logs', 'source'];

export class RoomError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

function newToken() {
  return randomBytes(16).toString('hex');
}

function freshRoom(fixture) {
  let code;
  do {
    code = generateCode();
  } while (rooms.has(code));

  return {
    code,
    fixtureId: fixture.id,
    title: fixture.title,
    createdAt: Date.now(),
    roles: {
      logs: { token: newToken(), claimed: false },
      source: { token: newToken(), claimed: false },
    },
    source: fixture.source,
    fixedSource: fixture.fixedSource,
    look: { logs: null, source: null },
    solvedAt: null,
    logs: fixture.logs,
    agentTurns: [],
    patches: [],
    tests: fixture.tests,
    testOutput: fixture.testOutput,
  };
}

export function createRoom(fixture) {
  const room = freshRoom(fixture);
  rooms.set(room.code, room);
  listeners.set(room.code, new Set());
  return room;
}

export function getRoom(code) {
  return rooms.get(code) ?? null;
}

export function requireRoom(code) {
  const room = getRoom(code);
  if (!room) {
    throw new RoomError(404, 'room_not_found', `No room with code ${code}`);
  }
  return room;
}

export function claimRole(code, role, token) {
  const room = requireRoom(code);
  if (!ROLES.includes(role)) {
    throw new RoomError(400, 'bad_role', `Unknown role "${role}"`);
  }
  const slot = room.roles[role];
  if (slot.claimed) {
    if (token && token === slot.token) {
      return room;
    }
    throw new RoomError(409, 'role_taken', `Role "${role}" is already claimed in room ${code}`);
  }
  if (!token || token !== slot.token) {
    throw new RoomError(403, 'bad_token', 'Join token does not match this role');
  }
  slot.claimed = true;
  emit(room);
  return room;
}

export function addAgentTurn(room, turn) {
  room.agentTurns.push(turn);
  emit(room);
  return turn;
}

export function addPatch(room, role, diff, opts = {}) {
  if (!ROLES.includes(role)) {
    throw new RoomError(400, 'bad_role', `Unknown role "${role}"`);
  }
  const patch = {
    id: randomUUID(),
    requestedBy: role,
    status: 'pending',
    diff,
    approvals: { logs: false, source: false },
    testResult: null,
    offline: Boolean(opts.offline),
    createdAt: Date.now(),
  };
  room.patches.push(patch);
  emit(room);
  return patch;
}

export function approvePatch(room, patchId, role, token) {
  if (!ROLES.includes(role)) {
    throw new RoomError(400, 'bad_role', `Unknown role "${role}"`);
  }
  if (!token || token !== room.roles[role].token) {
    throw new RoomError(403, 'bad_token', `Token does not match role "${role}"`);
  }
  const patch = room.patches.find((p) => p.id === patchId);
  if (!patch) {
    throw new RoomError(404, 'patch_not_found', `No patch ${patchId} in room ${room.code}`);
  }
  if (patch.status !== 'pending') {
    throw new RoomError(409, 'patch_not_pending', 'This patch has already been applied');
  }
  if (patch.approvals[role]) {
    emit(room);
    return { patch, applied: false, testResult: null };
  }

  patch.approvals[role] = true;
  if (!patch.approvals.logs || !patch.approvals.source) {
    emit(room);
    return { patch, applied: false, testResult: null };
  }

  const patched = applyDiff(room.source, patch.diff);
  const pass = patched.every((file) => {
    const fixed = room.fixedSource.find((f) => f.path === file.path);
    return fixed && fixed.content === file.content;
  });

  patch.status = 'applied';
  patch.testResult = pass ? 'pass' : 'fail';
  patch.appliedSource = patched.map((file) => ({ path: file.path, content: file.content }));
  room.source = patched;
  if (pass) {
    room.tests = room.tests.map((test) => ({ ...test, status: 'pass' }));
    room.testOutput = `Tests: ${room.tests.length} passed, ${room.tests.length} total`;
    if (!room.solvedAt) {
      room.solvedAt = Date.now();
    }
  }
  emit(room);
  return { patch, applied: true, testResult: patch.testResult };
}

function stripPathPrefix(path) {
  return path.replace(/^[ab]\//, '');
}

export function applyDiff(sourceFiles, diffText) {
  const lines = String(diffText).replace(/\r\n/g, '\n').split('\n');
  const files = sourceFiles.map((file) => ({ ...file }));
  const byPath = new Map(files.map((file) => [file.path, file]));

  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('--- ') || !String(lines[i + 1] ?? '').startsWith('+++ ')) {
      i += 1;
      continue;
    }
    const newPath = lines[i + 1].slice(4).trim();
    const file = byPath.get(stripPathPrefix(newPath));
    if (!file) {
      throw new RoomError(422, 'bad_diff', `Diff touches unknown file "${newPath}"`);
    }
    i += 2;

    const oldLines = file.content.split('\n');
    const out = [];
    let pos = 0;
    while (i < lines.length && lines[i].startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(lines[i]);
      if (!match) {
        throw new RoomError(422, 'bad_diff', `Malformed hunk header: ${lines[i]}`);
      }
      const start = parseInt(match[1], 10);
      const count = match[2] !== undefined ? parseInt(match[2], 10) : 1;
      i += 1;

      const keep = start - 1 - pos;
      if (keep < 0 || pos + keep + count > oldLines.length) {
        throw new RoomError(422, 'bad_diff', 'Hunk is out of range for the current source');
      }
      for (let k = 0; k < keep; k += 1) {
        out.push(oldLines[pos + k]);
      }
      pos += keep;

      let seen = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith('@@') || line.startsWith('--- ')) break;
        if (line.startsWith('+')) {
          out.push(line.slice(1));
          i += 1;
        } else if (line.startsWith('-') || line.startsWith(' ') || line === '') {
          const expected = line.startsWith(' ') || line.startsWith('-') ? line.slice(1) : '';
          if (oldLines[pos] !== expected) {
            throw new RoomError(422, 'bad_diff', 'Diff does not match the current source');
          }
          if (!line.startsWith('-')) {
            out.push(expected);
          }
          pos += 1;
          seen += 1;
          i += 1;
        } else {
          break;
        }
      }
      if (seen !== count) {
        throw new RoomError(422, 'bad_diff', 'Hunk is shorter than its header claims');
      }
    }
    out.push(...oldLines.slice(pos));
    file.content = out.join('\n');
  }
  return files;
}

export function setLook(room, role, token, at) {
  if (!ROLES.includes(role)) {
    throw new RoomError(400, 'bad_role', `Unknown role "${role}"`);
  }
  if (!token || token !== room.roles[role].token) {
    throw new RoomError(403, 'bad_token', `Token does not match role "${role}"`);
  }
  if (!Number.isInteger(at) || at < 1 || at > 100000) {
    throw new RoomError(400, 'bad_at', 'at must be a positive line or log number');
  }
  room.look[role] = { at, ts: Date.now() };
  emit(room);
  return room.look[role];
}

export function subscribe(code, fn) {
  const set = listeners.get(code);
  if (!set) return () => {};
  set.add(fn);
  return () => set.delete(fn);
}

export function emit(room) {
  const set = listeners.get(room.code);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(room);
    } catch {
      set.delete(fn);
    }
  }
}
