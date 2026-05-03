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
const scenariosHostPath = requiredEnv('SCENARIOS_HOST_PATH');

module.exports = {
  jwtSecret,
  scenariosHostPath,
  databasePath: process.env.DATABASE_PATH ?? path.join(__dirname, '../../data/bashcamp.sqlite'),
  usersFile: process.env.USERS_FILE ?? path.join(__dirname, '../../config/users.json'),
};
