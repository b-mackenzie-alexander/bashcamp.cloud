'use strict';

const config = require('./config');
const { getDatabase } = require('./db');
const userRepository = require('./userRepository');

const db = getDatabase();
const seedResult = userRepository.importSeedUsersIfEmpty(db, config.usersFile);
userRepository.ensureActiveUsers(db);

module.exports = { db, seedResult };
