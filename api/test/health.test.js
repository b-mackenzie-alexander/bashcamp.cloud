'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');

function loadFreshApp() {
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}api${path.sep}`) && !key.includes(`${path.sep}node_modules${path.sep}`)) {
      delete require.cache[key];
    }
  }
  return require('../index');
}

function request(server) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/health',
        method: 'GET',
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(body) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('health endpoint reports database readiness without exposing secrets', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bashcamp-health-'));
  const seedPath = path.join(dir, 'users.json');

  fs.writeFileSync(seedPath, JSON.stringify({
    users: [
      { username: 'student01', password_hash: bcrypt.hashSync('linux-plus', 10) },
    ],
  }));

  process.env.JWT_SECRET = 'test-secret';
  process.env.USERS_FILE = seedPath;
  process.env.DATABASE_PATH = path.join(dir, 'bashcamp.sqlite');

  const app = loadFreshApp();
  const server = app.listen(0);
  try {
    const res = await request(server);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      status: 'ok',
      database: 'ok',
      users: 'ok',
    });
  } finally {
    server.close();
  }
});
