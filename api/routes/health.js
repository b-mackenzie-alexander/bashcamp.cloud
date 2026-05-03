'use strict';

const express = require('express');
const { db } = require('../lib/appState');
const users = require('../lib/userRepository');

const router = express.Router();

router.get('/', (_req, res) => {
  try {
    db.prepare('select 1').get();
    const activeUsers = users.countActiveUsers(db);
    res.json({
      status: 'ok',
      database: 'ok',
      users: activeUsers > 0 ? 'ok' : 'missing',
    });
  } catch (err) {
    res.status(503).json({
      status: 'degraded',
      database: 'error',
      users: 'unknown',
    });
  }
});

module.exports = router;
