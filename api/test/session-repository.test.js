'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');

const { openDatabase } = require('../lib/db');
const users = require('../lib/userRepository');
const sessions = require('../lib/sessionRepository');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bashcamp-sessions-'));
  const db = openDatabase(path.join(dir, 'bashcamp.sqlite'));
  users.createUser(db, {
    username: 'student01',
    passwordHash: bcrypt.hashSync('secret', 10),
  });
  return db;
}

test('persists session lifecycle metadata without terminal secrets', () => {
  const db = tempDb();
  sessions.upsertSession(db, {
    sessionId: 'abc123',
    userId: 'student01',
    scenarioId: 'privilege-escalation-01',
    distro: 'ubuntu-22.04',
    containerName: 'session-abc123',
    port: 9000,
    terminalSecret: 'never-persist-this',
    ttydPid: 4242,
    status: 'active',
    createdAt: 1000,
    connectedAt: 1000,
  });
  sessions.updateSession(db, 'abc123', {
    status: 'disconnected',
    disconnectedAt: 2000,
    expiresAt: 3000,
    terminalSecret: 'still-never-persist-this',
  });

  const row = db.prepare('select * from sessions where session_id = ?').get('abc123');
  const columns = db.prepare('pragma table_info(sessions)').all().map(column => column.name);

  assert.equal(row.session_id, 'abc123');
  assert.equal(row.user_id, 'student01');
  assert.equal(row.status, 'disconnected');
  assert.equal(row.disconnected_at, 2000);
  assert.equal(row.expires_at, 3000);
  assert.equal(columns.includes('terminal_secret'), false);
  assert.equal(columns.includes('ttyd_pid'), false);
});

test('records session events and finds stale non-destroyed sessions', () => {
  const db = tempDb();
  sessions.upsertSession(db, {
    sessionId: 'abc123',
    userId: 'student01',
    scenarioId: 'privilege-escalation-01',
    distro: 'ubuntu-22.04',
    containerName: 'session-abc123',
    port: 9000,
    status: 'active',
    createdAt: 1000,
  });
  sessions.recordEvent(db, 'abc123', 'started', { port: 9000 });

  assert.deepEqual(sessions.findOpenSessions(db).map(row => row.sessionId), ['abc123']);
  assert.deepEqual(db.prepare('select event_type, details_json from session_events').all(), [
    { event_type: 'started', details_json: '{"port":9000}' },
  ]);

  sessions.markDestroyed(db, 'abc123', 2000, 'startup_reconciled');

  assert.deepEqual(sessions.findOpenSessions(db), []);
  assert.equal(db.prepare('select status from sessions where session_id = ?').get('abc123').status, 'destroyed');
});
