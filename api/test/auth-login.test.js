'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');

function request(server, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      res => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: responseBody ? JSON.parse(responseBody) : null });
        });
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
}

function loadFreshApp() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}api${path.sep}`) && !key.includes(`${path.sep}node_modules${path.sep}`)) {
      delete require.cache[key];
    }
  }
  return require('../index');
}

test('login authenticates imported SQLite users and rejects disabled users', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bashcamp-login-'));
  const seedPath = path.join(dir, 'users.json');
  const dbPath = path.join(dir, 'bashcamp.sqlite');

  fs.writeFileSync(seedPath, JSON.stringify({
    users: [
      {
        username: 'student01',
        password_hash: bcrypt.hashSync('linux-plus', 10),
      },
      {
        username: 'disabled01',
        password_hash: bcrypt.hashSync('disabled-pass', 10),
        status: 'disabled',
      },
    ],
  }));

  process.env.JWT_SECRET = 'test-secret';
  process.env.USERS_FILE = seedPath;
  process.env.DATABASE_PATH = dbPath;

  const app = loadFreshApp();
  const server = app.listen(0);
  try {
    const ok = await request(server, { username: 'student01', password: 'linux-plus' });
    const disabled = await request(server, { username: 'disabled01', password: 'disabled-pass' });
    const bad = await request(server, { username: 'student01', password: 'wrong' });

    assert.equal(ok.statusCode, 200);
    assert.match(ok.body.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.equal(disabled.statusCode, 401);
    assert.equal(bad.statusCode, 401);
  } finally {
    server.close();
  }
});
