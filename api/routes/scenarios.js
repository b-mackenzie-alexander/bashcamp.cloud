'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { jwtMiddleware } = require('../lib/auth');

const router = express.Router();
const SCENARIOS_PATH = process.env.SCENARIOS_PATH ?? path.join(__dirname, '../../scenarios');
const SCENARIO_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function safeScenarioPath(scenarioId, fileName) {
  if (!SCENARIO_ID_RE.test(scenarioId)) {
    const err = new Error('invalid scenario_id');
    err.code = 'INVALID_SCENARIO_ID';
    throw err;
  }

  const scenariosRoot = path.resolve(SCENARIOS_PATH);
  const resolved = path.resolve(scenariosRoot, scenarioId, fileName);
  if (!resolved.startsWith(`${scenariosRoot}${path.sep}`)) {
    const err = new Error('invalid scenario_id');
    err.code = 'INVALID_SCENARIO_ID';
    throw err;
  }

  return resolved;
}

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
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const { id, title, distro, difficulty, duration_minutes, description,
              type, objectives, timed, dynamic } = meta;
      if (typeof id !== 'string' || !id) continue;
      if (typeof title !== 'string' || !title) continue;
      scenarios.push({ id, title, distro, difficulty, duration_minutes, description,
                       type, objectives, timed, dynamic });
    } catch {
      // Skip scenarios with unreadable or invalid meta.json
    }
  }

  scenarios.sort((a, b) => {
    const aIsSandbox = a.type === 'sandbox' ? 0 : 1;
    const bIsSandbox = b.type === 'sandbox' ? 0 : 1;
    if (aIsSandbox !== bIsSandbox) return aIsSandbox - bIsSandbox;
    return a.id.localeCompare(b.id);
  });
  res.json(scenarios);
});

router.get('/:scenarioId/readme', jwtMiddleware, (req, res) => {
  let readmePath;
  try {
    readmePath = safeScenarioPath(req.params.scenarioId, 'README.md');
  } catch (err) {
    if (err.code === 'INVALID_SCENARIO_ID') return res.status(400).json({ error: err.message });
    throw err;
  }

  try {
    const markdown = fs.readFileSync(readmePath, 'utf8');
    res.json({ scenario_id: req.params.scenarioId, markdown });
  } catch {
    res.status(404).json({ error: 'scenario README not found' });
  }
});

module.exports = router;
