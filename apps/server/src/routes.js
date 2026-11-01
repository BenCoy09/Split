import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createRoom, claimRole, requireRoom, subscribe, RoomError, approvePatch, setLook } from './state.js';
import { viewFor } from './roles.js';
import { bugs, getBug } from './fixtures/bugs.js';
import { askAgent, askForPatch } from './agent.js';

export const router = Router();

function sendView(res, room, role) {
  const view = viewFor(room, role);
  if (!view) {
    res.status(400).json({ error: 'bad_role', message: `Unknown role "${role}"` });
    return false;
  }
  res.json(view);
  return true;
}

router.post('/rooms', (req, res) => {
  const fixtureId = req.body?.fixtureId;
  const fixture = fixtureId ? getBug(fixtureId) : bugs[Math.floor(Math.random() * bugs.length)];
  if (!fixture) {
    res.status(400).json({ error: 'bad_fixture', message: `No fixture "${fixtureId}"` });
    return;
  }
  const room = createRoom(fixture);
  res.status(201).json({
    code: room.code,
    fixtureId: room.fixtureId,
    join: {
      logs: `/api/rooms/${room.code}/join?role=logs&token=${room.roles.logs.token}`,
      source: `/api/rooms/${room.code}/join?role=source&token=${room.roles.source.token}`,
    },
  });
});

router.post('/rooms/:code/join', (req, res, next) => {
  try {
    const role = req.body?.role ?? req.query.role;
    const token = req.body?.token ?? req.query.token;
    const room = claimRole(req.params.code, role, token);
    res.json({ code: room.code, role });
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/:code/view', (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    sendView(res, room, req.query.role);
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:code/agent', async (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    const role = req.body?.role ?? req.query.role;
    const question = req.body?.question;
    if (typeof question !== 'string' || !question.trim()) {
      throw new RoomError(400, 'bad_question', 'question is required');
    }
    const turn = await askAgent(room, role, question.trim(), { allowFallback: true });
    res.status(201).json(turn);
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:code/patch', async (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    const role = req.body?.role ?? req.query.role;
    const patch = await askForPatch(room, role, { allowFallback: true });
    res.status(201).json(patch);
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:code/patches/:patchId/approve', async (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    const role = req.body?.role ?? req.query.role;
    const token = req.body?.token ?? req.query.token;
    const result = approvePatch(room, req.params.patchId, role, token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/rooms/:code/look', (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    const role = req.body?.role ?? req.query.role;
    const token = req.body?.token ?? req.query.token;
    const at = req.body?.at;
    const look = setLook(room, role, token, at);
    res.json({ role, at: look.at });
  } catch (err) {
    next(err);
  }
});

router.get('/rooms/:code/stream', (req, res, next) => {
  try {
    const room = requireRoom(req.params.code);
    const role = req.query.role;
    const view = viewFor(room, role);
    if (!view) {
      res.status(400).json({ error: 'bad_role', message: `Unknown role "${role}"` });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    res.write(`event: state\ndata: ${JSON.stringify(view)}\n\n`);

    const unsubscribe = subscribe(room.code, (updated) => {
      res.write(`event: state\ndata: ${JSON.stringify(viewFor(updated, role))}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(':ping\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (err) {
    next(err);
  }
});

function redact(text) {
  let out = String(text);
  if (process.env.AGENT_API_KEY) {
    out = out.split(process.env.AGENT_API_KEY).join('[redacted]');
  }
  return out.replace(/key=[A-Za-z0-9._-]+/g, 'key=[redacted]');
}

export function errorHandler(err, req, res, next) {
  const isRoomError = err instanceof RoomError;
  const status = isRoomError ? err.status : 500;
  const code = isRoomError ? err.code : 'internal_error';
  const message = isRoomError
    ? err.message
    : `Something went wrong on the server: ${err.message ?? err}`;
  const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${status} ${code} ${redact(err.stack ?? String(err))}\n`;
  try {
    fs.appendFileSync(process.env.ERROR_LOG ?? path.join(process.cwd(), 'error.log'), line);
  } catch {}
  res.status(status).json({ error: code, message });
}

router.use(errorHandler);
