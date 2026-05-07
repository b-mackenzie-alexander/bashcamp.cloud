'use strict';

const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { jwtMiddleware } = require('../lib/auth');
const { sessionTimeoutMs } = require('../lib/config');
const sessionStore = require('../lib/sessionStore');
const portPool = require('../lib/portPool');
const docker = require('../lib/docker');
const { destroySession } = require('../lib/lifecycle');
const { safeScenarioPath } = require('../lib/scenarioPath');

const router = express.Router();

const RECONNECT_MS = Number(process.env.RECONNECT_WINDOW_MINUTES ?? 15) * 60_000;
const SESSION_TIMEOUT_MS = sessionTimeoutMs;
const TERMINAL_COOKIE = 'bashcamp_terminal';

// Tracks in-flight session starts to prevent concurrent start race for the same user
const pendingStarts = new Set();

function terminalUrl(port) {
  return `/t/${port}/`;
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        try {
          return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
        } catch {
          return [part.slice(0, index), ''];
        }
      })
  );
}

function setTerminalCookie(res, sessionId, terminalSecret) {
  const value = encodeURIComponent(`${sessionId}:${terminalSecret}`);
  const maxAge = Math.ceil((SESSION_TIMEOUT_MS + RECONNECT_MS) / 1000);
  res.setHeader(
    'Set-Cookie',
    `${TERMINAL_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/t/; Max-Age=${maxAge}`
  );
}

function clearTerminalCookie(res) {
  res.setHeader('Set-Cookie',
    `${TERMINAL_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/t/; Max-Age=0`);
}

function sessionPayload(session, extra = {}) {
  const now = Date.now();
  return {
    ...extra,
    status: session.status,
    scenario_id: session.scenarioId,
    terminal_url: terminalUrl(session.port),
    started_at: session.createdAt,
    elapsed_seconds: Math.max(0, Math.floor((now - session.createdAt) / 1000)),
    disconnected_at: session.disconnectedAt,
    expires_at: session.expiresAt,
  };
}

function checkPayload(objectives) {
  return {
    objectives,
    complete: objectives.length > 0 && objectives.every(objective => objective.passed === true),
    checked_at: Date.now(),
  };
}

function onTtydExit(sessionId) {
  const disconnectedAt = Date.now();
  sessionStore.update(sessionId, {
    status: 'disconnected',
    disconnectedAt,
    expiresAt: disconnectedAt + RECONNECT_MS,
    ttydPid: null,
  });
}

async function startSession(userId, scenarioId) {
  const metaPath = safeScenarioPath(scenarioId, 'meta.json');
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    const err = new Error('scenario not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (meta.id !== scenarioId) {
    const err = new Error('scenario not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const port = portPool.acquire();
  const sessionId = crypto.randomBytes(16).toString('hex');
  const terminalSecret = crypto.randomBytes(16).toString('hex');

  let containerName;
  try {
    containerName = await docker.createContainer(sessionId, meta.distro);
  } catch (err) {
    portPool.release(port);
    throw err;
  }

  try {
    const provisionPath = safeScenarioPath(scenarioId, 'provision.sh');
    docker.runProvision(containerName, provisionPath);
  } catch (err) {
    await docker.destroyContainer(containerName).catch(() => {});
    portPool.release(port);
    throw err;
  }

  let ttydPid;
  try {
    ttydPid = docker.spawnTtyd(port, sessionId, terminalSecret, () => onTtydExit(sessionId));
  } catch (err) {
    await docker.destroyContainer(containerName).catch(() => {});
    portPool.release(port);
    throw err;
  }

  sessionStore.create({
    sessionId,
    userId,
    scenarioId,
    distro: meta.distro,
    containerName,
    port,
    terminalSecret,
    ttydPid,
    status: 'active',
    createdAt: Date.now(),
    connectedAt: Date.now(),
    disconnectedAt: null,
    expiresAt: null,
  });

  const session = sessionStore.get(sessionId);
  return { ...sessionPayload(session, { session_id: sessionId }), sessionId, terminalSecret };
}

// GET /api/session
router.get('/', jwtMiddleware, (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (!session) return res.json({ status: 'none' });
  res.json(sessionPayload(session));
});

// POST /api/session/start
router.post('/start', jwtMiddleware, async (req, res) => {
  const existing = sessionStore.getByUser(req.user.userId);
  if (existing) return res.status(409).json({ error: 'session already exists' });

  const { scenario_id } = req.body ?? {};
  if (!scenario_id) return res.status(400).json({ error: 'scenario_id required' });

  if (pendingStarts.has(req.user.userId)) {
    return res.status(409).json({ error: 'session start in progress' });
  }
  pendingStarts.add(req.user.userId);

  try {
    const result = await startSession(req.user.userId, scenario_id);
    setTerminalCookie(res, result.sessionId, result.terminalSecret);
    delete result.terminalSecret;
    delete result.sessionId;
    res.json(result);
  } catch (err) {
    if (err.code === 'INVALID_SCENARIO_ID') return res.status(400).json({ error: err.message });
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err.code === 'UNKNOWN_DISTRO') return res.status(400).json({ error: err.message });
    console.error('session start error:', err);
    res.status(500).json({ error: 'failed to start session' });
  } finally {
    pendingStarts.delete(req.user.userId);
  }
});

// POST /api/session/reconnect
router.post('/reconnect', jwtMiddleware, async (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (!session) return res.status(404).json({ error: 'no session found' });
  if (session.status === 'destroyed') return res.status(410).json({ error: 'session expired' });

  if (session.status === 'active') {
    setTerminalCookie(res, session.sessionId, session.terminalSecret);
    return res.json(sessionPayload(session, { session_id: session.sessionId }));
  }

  if (session.expiresAt && Date.now() > session.expiresAt) {
    await destroySession(session.sessionId, session);
    return res.status(410).json({ error: 'reconnect window expired' });
  }

  const oldPort = session.port;
  const newPort = portPool.acquire();
  const newSecret = crypto.randomBytes(16).toString('hex');

  let ttydPid;
  try {
    ttydPid = docker.spawnTtyd(newPort, session.sessionId, newSecret, () => onTtydExit(session.sessionId));
  } catch (err) {
    portPool.release(newPort);
    return res.status(500).json({ error: 'failed to reconnect terminal' });
  }
  portPool.release(oldPort);

  sessionStore.update(session.sessionId, {
    port: newPort,
    terminalSecret: newSecret,
    ttydPid,
    status: 'active',
    connectedAt: Date.now(),
    disconnectedAt: null,
    expiresAt: null,
  });

  setTerminalCookie(res, session.sessionId, newSecret);
  const updated = sessionStore.get(session.sessionId);
  res.json(sessionPayload(updated, { session_id: session.sessionId }));
});

// POST /api/session/end — destroy without restarting
router.post('/end', jwtMiddleware, async (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (!session) return res.status(404).json({ error: 'no session found' });

  if (session.ttydPid) docker.killTtyd(session.ttydPid);
  await docker.destroyContainer(session.containerName).catch(() => {});
  portPool.release(session.port);
  sessionStore.remove(session.sessionId);
  clearTerminalCookie(res);
  res.sendStatus(204);
});

// POST /api/session/reset
router.post('/reset', jwtMiddleware, async (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (!session) return res.status(404).json({ error: 'no session found' });

  if (session.ttydPid) docker.killTtyd(session.ttydPid);
  await docker.destroyContainer(session.containerName).catch(() => {});
  portPool.release(session.port);
  sessionStore.remove(session.sessionId);

  try {
    const result = await startSession(req.user.userId, session.scenarioId);
    setTerminalCookie(res, result.sessionId, result.terminalSecret);
    delete result.terminalSecret;
    delete result.sessionId;
    res.json(result);
  } catch (err) {
    console.error('session reset error:', err);
    res.status(500).json({ error: 'failed to reset session' });
  }
});

// GET /api/session/check
router.get('/check', jwtMiddleware, (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (!session) return res.status(404).json({ error: 'no session found' });
  if (session.status !== 'active') return res.status(409).json({ error: 'session not active' });

  let checkPath;
  try {
    checkPath = safeScenarioPath(session.scenarioId, 'check.sh');
  } catch {
    return res.json(checkPayload([]));
  }
  if (!fs.existsSync(checkPath)) return res.json(checkPayload([]));

  try {
    const output = docker.runCheck(session.containerName, checkPath);
    const results = JSON.parse(output.trim());
    res.json(checkPayload(Array.isArray(results) ? results : []));
  } catch (err) {
    console.error('check error (session %s):', session.sessionId, err.message);
    res.json(checkPayload([]));
  }
});

// GET /api/session/terminal-auth
router.get('/terminal-auth', (req, res) => {
  const port = Number(req.headers['x-forwarded-port']);
  if (!Number.isInteger(port)) return res.sendStatus(401);

  const cookies = parseCookies(req.headers.cookie);
  const credential = cookies[TERMINAL_COOKIE];
  if (!credential) return res.sendStatus(401);

  const separator = credential.indexOf(':');
  if (separator === -1) return res.sendStatus(401);

  const sessionId = credential.slice(0, separator);
  const terminalSecret = credential.slice(separator + 1);
  const session = sessionStore.get(sessionId);

  const expected = Buffer.from(session?.terminalSecret ?? '');
  const actual = Buffer.from(terminalSecret);
  const secretMatches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (
    !session ||
    session.status !== 'active' ||
    session.port !== port ||
    !secretMatches
  ) {
    return res.sendStatus(401);
  }

  const basic = Buffer.from(`${sessionId}:${terminalSecret}`).toString('base64');
  res.setHeader('X-Ttyd-Authorization', `Basic ${basic}`);
  res.sendStatus(204);
});

module.exports = { router, clearTerminalCookie };
