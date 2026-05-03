'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const bcrypt = require('bcryptjs');

const { openDatabase } = require('../lib/db');
const users = require('../lib/userRepository');

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bashcamp-users-'));
  const databasePath = path.join(dir, 'bashcamp.sqlite');
  return { dir, databasePath, db: openDatabase(databasePath) };
}

test('database migration creates user, session, and event tables', () => {
  const { db } = tempDb();

  const tables = db.prepare("select name from sqlite_master where type = 'table' order by name").all().map(row => row.name);

  assert.deepEqual(tables.filter(name => !name.startsWith('sqlite_')), [
    'schema_migrations',
    'session_events',
    'sessions',
    'users',
  ]);
});

test('imports seed users only when database is empty', async () => {
  const { dir, db } = tempDb();
  const seedPath = path.join(dir, 'users.json');
  const firstHash = bcrypt.hashSync('correct-horse', 10);
  const secondHash = bcrypt.hashSync('battery-staple', 10);

  fs.writeFileSync(seedPath, JSON.stringify({
    users: [
      { username: 'student01', password_hash: firstHash },
    ],
  }));

  const first = users.importSeedUsersIfEmpty(db, seedPath);
  fs.writeFileSync(seedPath, JSON.stringify({
    users: [
      { username: 'student01', password_hash: secondHash },
      { username: 'student02', password_hash: secondHash },
    ],
  }));
  const second = users.importSeedUsersIfEmpty(db, seedPath);

  assert.equal(first.imported, 1);
  assert.equal(second.imported, 0);
  assert.equal(db.prepare('select count(*) as count from users').get().count, 1);
  assert.deepEqual(await users.validateUser(db, 'student01', 'correct-horse'), {
    userId: 'student01',
    role: 'student',
  });
  assert.equal(await users.validateUser(db, 'student02', 'battery-staple'), null);
});

test('validates active users and rejects disabled or bad credentials', async () => {
  const { db } = tempDb();
  const passwordHash = bcrypt.hashSync('linux-plus', 10);

  users.createUser(db, {
    username: 'student01',
    passwordHash,
    role: 'student',
    status: 'active',
  });
  users.createUser(db, {
    username: 'student02',
    passwordHash,
    role: 'student',
    status: 'disabled',
  });

  assert.deepEqual(await users.validateUser(db, 'student01', 'linux-plus'), {
    userId: 'student01',
    role: 'student',
  });
  assert.equal(await users.validateUser(db, 'student01', 'wrong-password'), null);
  assert.equal(await users.validateUser(db, 'student02', 'linux-plus'), null);
});

test('generated users store bcrypt hashes and return plaintext once', async () => {
  const { db } = tempDb();

  const created = users.createGeneratedUser(db, { username: 'student04', role: 'student' });
  const row = db.prepare('select username, password_hash, role, status from users where username = ?').get('student04');

  assert.equal(created.username, 'student04');
  assert.match(created.password, /^[A-Za-z0-9_-]{16,}$/);
  assert.equal(row.username, 'student04');
  assert.equal(row.role, 'student');
  assert.equal(row.status, 'active');
  assert.notEqual(row.password_hash, created.password);
  assert.equal(await bcrypt.compare(created.password, row.password_hash), true);
});
