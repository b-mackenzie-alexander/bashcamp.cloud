'use strict';

const path = require('path');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const jwtSecret = requiredEnv('JWT_SECRET');

const _timeoutMinutesRaw = Number(process.env.SESSION_TIMEOUT_MINUTES ?? 30);
const _timeoutMinutes = Number.isFinite(_timeoutMinutesRaw) && _timeoutMinutesRaw > 0
  ? _timeoutMinutesRaw
  : 30;

module.exports = {
  jwtSecret,
  databasePath: process.env.DATABASE_PATH ?? path.join(__dirname, '../../data/bashcamp.sqlite'),
  usersFile: process.env.USERS_FILE ?? path.join(__dirname, '../../config/users.json'),
  sessionTimeoutMs: _timeoutMinutes * 60_000,
};
