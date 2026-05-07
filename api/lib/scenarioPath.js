'use strict';

const path = require('path');

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

module.exports = { safeScenarioPath, SCENARIOS_PATH };
