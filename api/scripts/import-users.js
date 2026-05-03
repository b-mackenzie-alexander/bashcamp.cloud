#!/usr/bin/env node
'use strict';

const config = require('../lib/config');
const { getDatabase } = require('../lib/db');
const users = require('../lib/userRepository');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const file = arg('file') ?? config.usersFile;

try {
  const db = getDatabase();
  const result = users.importUsersFromFile(db, file);
  console.log(`Imported ${result.imported} users from ${file}`);
} catch (err) {
  console.error(`Failed to import users: ${err.message}`);
  process.exit(1);
}
