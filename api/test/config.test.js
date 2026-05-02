'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '../..');
const configModule = path.join(repoRoot, 'api/lib/config.js');

function requireConfig(env) {
  return spawnSync(process.execPath, ['-e', `require(${JSON.stringify(configModule)})`], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      USERS_FILE: require.resolve('./fixtures/users.json'),
      ...env,
    },
    encoding: 'utf8',
  });
}

test('config fails fast when JWT_SECRET is missing', () => {
  const result = requireConfig({ SCENARIOS_HOST_PATH: path.join(repoRoot, 'scenarios') });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET is required/);
});

test('config fails fast when SCENARIOS_HOST_PATH is missing', () => {
  const result = requireConfig({ JWT_SECRET: 'test-secret' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SCENARIOS_HOST_PATH is required/);
});

test('config exports validated required settings', () => {
  const scenariosHostPath = path.join(repoRoot, 'scenarios');
  const result = spawnSync(
    process.execPath,
    ['-e', `const config = require(${JSON.stringify(configModule)}); process.stdout.write(config.jwtSecret + '\\n' + config.scenariosHostPath);`],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        JWT_SECRET: 'test-secret',
        SCENARIOS_HOST_PATH: scenariosHostPath,
        USERS_FILE: require.resolve('./fixtures/users.json'),
      },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `test-secret\n${scenariosHostPath}`);
});
