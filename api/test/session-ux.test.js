'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function loadFreshApp() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}api${path.sep}`) && !key.includes(`${path.sep}node_modules${path.sep}`)) {
      delete require.cache[key];
    }
  }
  return require('../index');
}

function configureTestEnv(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const seedPath = path.join(dir, 'users.json');
  fs.writeFileSync(seedPath, JSON.stringify({
    users: [
      { username: 'student01', password_hash: bcrypt.hashSync('linux-plus', 10) },
    ],
  }));

  process.env.JWT_SECRET = 'test-secret';
  process.env.USERS_FILE = seedPath;
  process.env.DATABASE_PATH = path.join(dir, 'bashcamp.sqlite');
}

function token() {
  return jwt.sign({ userId: 'student01' }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function request(server, pathName, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: pathName,
        method,
        headers: { Authorization: `Bearer ${token()}` },
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: body ? JSON.parse(body) : null }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function createSession(fields = {}) {
  const sessionStore = require('../lib/sessionStore');
  sessionStore.create({
    sessionId: fields.sessionId ?? 'abc123',
    userId: 'student01',
    scenarioId: fields.scenarioId ?? 'privilege-escalation-01',
    distro: 'ubuntu-22.04',
    containerName: 'session-abc123',
    port: fields.port ?? 9000,
    terminalSecret: 'terminal-secret',
    ttydPid: null,
    status: fields.status ?? 'active',
    createdAt: fields.createdAt ?? Date.now() - 125_000,
    connectedAt: fields.connectedAt ?? Date.now() - 125_000,
    disconnectedAt: fields.disconnectedAt ?? null,
    expiresAt: fields.expiresAt ?? null,
  });
}

test('session responses expose canonical elapsed timing for active labs', async () => {
  configureTestEnv('bashcamp-session-ux-');
  const app = loadFreshApp();
  createSession({ createdAt: Date.now() - 125_000 });

  const server = app.listen(0);
  try {
    const current = await request(server, '/api/session');
    const reconnect = await request(server, '/api/session/reconnect', 'POST');

    assert.equal(current.statusCode, 200);
    assert.equal(reconnect.statusCode, 200);
    assert.equal(typeof current.body.started_at, 'number');
    assert.equal(reconnect.body.started_at, current.body.started_at);
    assert.ok(current.body.elapsed_seconds >= 120);
    assert.ok(reconnect.body.elapsed_seconds >= 120);
    assert.equal(current.body.scenario_id, 'privilege-escalation-01');
    assert.equal(reconnect.body.scenario_id, 'privilege-escalation-01');
  } finally {
    server.close();
  }
});

test('objective checks return normalized completion status and check timestamp', async () => {
  configureTestEnv('bashcamp-check-ux-');
  const app = loadFreshApp();
  const docker = require('../lib/docker');
  docker.runCheck = () => JSON.stringify([
    { id: 'one', label: 'First objective', passed: true },
    { id: 'two', label: 'Second objective', passed: true },
  ]);
  createSession();

  const server = app.listen(0);
  try {
    const res = await request(server, '/api/session/check');

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.objectives, [
      { id: 'one', label: 'First objective', passed: true },
      { id: 'two', label: 'Second objective', passed: true },
    ]);
    assert.equal(res.body.complete, true);
    assert.equal(typeof res.body.checked_at, 'number');
  } finally {
    server.close();
  }
});

test('objective checks return incomplete empty payload when no check script exists', async () => {
  configureTestEnv('bashcamp-check-missing-');
  const app = loadFreshApp();
  createSession({ scenarioId: 'sandbox-ubuntu' });

  const server = app.listen(0);
  try {
    const res = await request(server, '/api/session/check');

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.objectives, []);
    assert.equal(res.body.complete, false);
    assert.equal(typeof res.body.checked_at, 'number');
  } finally {
    server.close();
  }
});
