'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { jwtMiddleware } = require('../lib/auth');

const router = express.Router();
const SCENARIOS_PATH = process.env.SCENARIOS_PATH ?? path.join(__dirname, '../../scenarios');

router.get('/', jwtMiddleware, (_req, res) => {
  let entries;
  try {
    entries = fs.readdirSync(SCENARIOS_PATH, { withFileTypes: true });
  } catch {
    return res.status(500).json({ error: 'cannot read scenarios directory' });
  }

  const scenarios = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '_template') continue;
    const metaPath = path.join(SCENARIOS_PATH, entry.name, 'meta.json');
    try {
      scenarios.push(JSON.parse(fs.readFileSync(metaPath, 'utf8')));
    } catch {
      // Skip scenarios with unreadable or invalid meta.json
    }
  }

  res.json(scenarios);
});

module.exports = router;
