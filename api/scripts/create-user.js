#!/usr/bin/env node
'use strict';

const { getDatabase } = require('../lib/db');
const users = require('../lib/userRepository');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const username = arg('username');
const role = arg('role') ?? 'student';

if (!username) {
  console.error('Usage: npm run user:create -- --username <username> [--role student|instructor|admin]');
  process.exit(1);
}

try {
  const db = getDatabase();
  const created = users.createGeneratedUser(db, { username, role });
  console.log(`username: ${created.username}`);
  console.log(`password: ${created.password}`);
  console.log('Store this password now; it is not persisted in plaintext.');
} catch (err) {
  console.error(`Failed to create user: ${err.message}`);
  process.exit(1);
}
