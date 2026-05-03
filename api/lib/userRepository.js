'use strict';

const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');

function now() {
  return Date.now();
}

function normalizeRole(role) {
  return ['student', 'instructor', 'admin'].includes(role) ? role : 'student';
}

function normalizeStatus(status) {
  return status === 'disabled' ? 'disabled' : 'active';
}

function countUsers(db) {
  return db.prepare('select count(*) as count from users').get().count;
}

function countActiveUsers(db) {
  return db.prepare("select count(*) as count from users where status = 'active'").get().count;
}

function createUser(db, fields) {
  const timestamp = now();
  db.prepare(`
    insert into users (username, password_hash, role, status, created_at, updated_at)
    values (@username, @passwordHash, @role, @status, @createdAt, @updatedAt)
  `).run({
    username: fields.username,
    passwordHash: fields.passwordHash,
    role: normalizeRole(fields.role),
    status: normalizeStatus(fields.status),
    createdAt: fields.createdAt ?? timestamp,
    updatedAt: fields.updatedAt ?? timestamp,
  });
}

function importUsers(db, users) {
  const insert = db.prepare(`
    insert into users (username, password_hash, role, status, created_at, updated_at)
    values (@username, @passwordHash, @role, @status, @createdAt, @updatedAt)
    on conflict(username) do update set
      password_hash = excluded.password_hash,
      role = excluded.role,
      status = excluded.status,
      updated_at = excluded.updated_at
  `);
  const timestamp = now();
  const transaction = db.transaction(records => {
    for (const user of records) {
      insert.run({
        username: user.username,
        passwordHash: user.password_hash,
        role: normalizeRole(user.role),
        status: normalizeStatus(user.status),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  });
  transaction(users);
}

function importUsersFromFile(db, filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const records = Array.isArray(parsed.users) ? parsed.users : [];
  importUsers(db, records);
  return { imported: records.length };
}

function importSeedUsersIfEmpty(db, filePath) {
  if (countUsers(db) > 0) return { imported: 0 };
  return importUsersFromFile(db, filePath);
}

async function validateUser(db, username, password) {
  const user = db.prepare(`
    select username, password_hash, role
    from users
    where username = ? and status = 'active'
  `).get(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? { userId: user.username, role: user.role } : null;
}

function createGeneratedUser(db, fields) {
  const password = crypto.randomBytes(12).toString('base64url');
  const passwordHash = bcrypt.hashSync(password, 10);
  createUser(db, {
    username: fields.username,
    passwordHash,
    role: fields.role,
    status: fields.status,
  });
  return { username: fields.username, password };
}

function ensureActiveUsers(db) {
  if (countActiveUsers(db) === 0) {
    throw new Error('at least one active user is required');
  }
}

module.exports = {
  countUsers,
  countActiveUsers,
  createUser,
  createGeneratedUser,
  importUsersFromFile,
  importSeedUsersIfEmpty,
  validateUser,
  ensureActiveUsers,
};
