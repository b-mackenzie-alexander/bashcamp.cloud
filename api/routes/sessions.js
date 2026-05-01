'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { jwtMiddleware } = require('../lib/auth');
const sessionStore = require('../lib/sessionStore');
const portPool = require('../lib/portPool');
const docker = require('../lib/docker');
const { destroySession } = require('../lib/lifecycle');

const router = express.Router();

const SCENARIOS_PATH = process.env.SCENARIOS_PATH ?? path.join(__dirname, '../../scenarios');
const RECONNECT_MS = Number(process.env.RECONNECT_WINDOW_MINUTES ?? 15) * 60_000;

function terminalUrl(port, sessionId, terminalSecret) {
  return `/t/${port}/?username=${sessionId}&password=${terminalSecret}`;
}

function onTtydExit(sessionId) {
  sessionStore.update(sessionId, {
    status: 'disconnected',
    disconnectedAt: Date.now(),
    ttydPid: null,
  });
}

async function startSession(userId, scenarioId) {
  const metaPath = path.join(SCENARIOS_PATH, scenarioId, 'meta.json');
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
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

  // Wait for systemd to boot
  await new Promise(r => setTimeout(r, 5000));

  try {
    const provisionPath = path.join(SCENARIOS_PATH, scenarioId, 'provision.sh');
    docker.runProvision(containerName, provisionPath);
  } catch (err) {
    await docker.destroyContainer(containerName).catch(() => {});
    portPool.release(port);
    throw err;
  }

  const ttydPid = docker.spawnTtyd(port, sessionId, terminalSecret, () => onTtydExit(sessionId));

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
    disconnectedAt: null,
  });

  return { sessionId, terminal_url: terminalUrl(port, sessionId, terminalSecret) };
}

// GET /api/session
router.get('/', jwtMiddleware, (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (!session) return res.status(404).json({ status: 'none' });
  res.json({
    status: session.status,
    scenario_id: session.scenarioId,
    terminal_url: terminalUrl(session.port, session.sessionId, session.terminalSecret),
    disconnected_at: session.disconnectedAt,
  });
});

// POST /api/session/start
router.post('/start', jwtMiddleware, async (req, res) => {
  const existing = sessionStore.getByUser(req.user.userId);
  if (existing) return res.status(409).json({ error: 'session already exists' });

  const { scenario_id } = req.body ?? {};
  if (!scenario_id) return res.status(400).json({ error: 'scenario_id required' });

  try {
    const result = await startSession(req.user.userId, scenario_id);
    res.json(result);
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    console.error('session start error:', err);
    res.status(500).json({ error: 'failed to start session' });
  }
});

// POST /api/session/reconnect
router.post('/reconnect', jwtMiddleware, async (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (!session) return res.status(404).json({ error: 'no session found' });
  if (session.status === 'destroyed') return res.status(410).json({ error: 'session expired' });

  if (session.disconnectedAt && (Date.now() - session.disconnectedAt) > RECONNECT_MS) {
    await destroySession(session.sessionId, session);
    return res.status(410).json({ error: 'reconnect window expired' });
  }

  portPool.release(session.port);
  const newPort = portPool.acquire();
  const newSecret = crypto.randomBytes(16).toString('hex');
  const ttydPid = docker.spawnTtyd(newPort, session.sessionId, newSecret, () => onTtydExit(session.sessionId));

  sessionStore.update(session.sessionId, {
    port: newPort,
    terminalSecret: newSecret,
    ttydPid,
    status: 'active',
    disconnectedAt: null,
  });

  res.json({ terminal_url: terminalUrl(newPort, session.sessionId, newSecret) });
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
    res.json(result);
  } catch (err) {
    console.error('session reset error:', err);
    res.status(500).json({ error: 'failed to reset session' });
  }
});

module.exports = router;
