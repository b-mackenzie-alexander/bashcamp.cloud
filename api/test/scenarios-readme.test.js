'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.SCENARIOS_HOST_PATH = process.env.SCENARIOS_HOST_PATH || require('node:path').join(__dirname, '../../scenarios');
process.env.USERS_FILE = require.resolve('./fixtures/users.json');

const app = require('../index');

function token() {
  return jwt.sign({ userId: 'student01' }, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function request(server, path, authToken = token()) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method: 'GET',
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ statusCode: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('GET /api/scenarios/:id/readme returns scenario markdown', async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, '/api/scenarios/privilege-escalation-01/readme');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scenario_id, 'privilege-escalation-01');
    assert.match(res.body.markdown, /kgarcia cannot run sudo commands/);
  } finally {
    server.close();
  }
});

test('GET /api/scenarios/:id/readme rejects missing or invalid auth', async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, '/api/scenarios/privilege-escalation-01/readme', null);
    assert.equal(res.statusCode, 401);
  } finally {
    server.close();
  }
});

test('GET /api/scenarios/:id/readme rejects invalid scenario ids', async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, '/api/scenarios/..%2Fconfig/readme');
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'invalid scenario_id');
  } finally {
    server.close();
  }
});

test('GET /api/scenarios/:id/readme returns 404 for missing scenarios', async () => {
  const server = app.listen(0);
  try {
    const res = await request(server, '/api/scenarios/missing-scenario/readme');
    assert.equal(res.statusCode, 404);
  } finally {
    server.close();
  }
});
