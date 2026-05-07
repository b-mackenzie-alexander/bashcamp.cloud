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
const { reconcileStartupSessions } = require('../lib/startup');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bashcamp-reconcile-'));
  const db = openDatabase(path.join(dir, 'bashcamp.sqlite'));
  users.createUser(db, {
    username: 'student01',
    passwordHash: bcrypt.hashSync('secret', 10),
  });
  return db;
}

test('startup reconciliation destroys stale containers and marks sessions destroyed', async () => {
  const db = tempDb();
  const destroyed = [];
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

  const released = [];
  await reconcileStartupSessions(db, {
    destroyContainer: async containerName => { destroyed.push(containerName); },
  }, {
    release: port => { released.push(port); },
  }, 2000);

  assert.deepEqual(destroyed, ['session-abc123']);
  assert.deepEqual(released, [9000]);
  assert.deepEqual(sessions.findOpenSessions(db), []);
  assert.equal(db.prepare('select status from sessions where session_id = ?').get('abc123').status, 'destroyed');
  assert.equal(db.prepare('select event_type from session_events order by id desc limit 1').get().event_type, 'startup_reconciled');
});
