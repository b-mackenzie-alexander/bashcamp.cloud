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
  const result = requireConfig({});

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET is required/);
});

test('config exports validated required settings', () => {
  const databasePath = path.join(repoRoot, 'data/test.sqlite');
  const result = spawnSync(
    process.execPath,
    ['-e', `const config = require(${JSON.stringify(configModule)}); process.stdout.write(config.jwtSecret + '\\n' + config.databasePath);`],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        JWT_SECRET: 'test-secret',
        DATABASE_PATH: databasePath,
        USERS_FILE: require.resolve('./fixtures/users.json'),
      },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `test-secret\n${databasePath}`);
});

test('sessionTimeoutMs defaults to 30 minutes when SESSION_TIMEOUT_MINUTES is not set', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', `const c = require(${JSON.stringify(configModule)}); process.stdout.write(String(c.sessionTimeoutMs));`],
    {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, JWT_SECRET: 'test-secret', USERS_FILE: require.resolve('./fixtures/users.json') },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, String(30 * 60_000));
});

test('sessionTimeoutMs uses env value when valid', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', `const c = require(${JSON.stringify(configModule)}); process.stdout.write(String(c.sessionTimeoutMs));`],
    {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, JWT_SECRET: 'test-secret', USERS_FILE: require.resolve('./fixtures/users.json'), SESSION_TIMEOUT_MINUTES: '45' },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, String(45 * 60_000));
});

test('sessionTimeoutMs falls back to 30 minutes when SESSION_TIMEOUT_MINUTES is not a valid number', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', `const c = require(${JSON.stringify(configModule)}); process.stdout.write(String(c.sessionTimeoutMs));`],
    {
      cwd: repoRoot,
      env: { PATH: process.env.PATH, JWT_SECRET: 'test-secret', USERS_FILE: require.resolve('./fixtures/users.json'), SESSION_TIMEOUT_MINUTES: 'notanumber' },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, String(30 * 60_000));
});

test('config defaults DATABASE_PATH to the local data directory', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', `const config = require(${JSON.stringify(configModule)}); process.stdout.write(config.databasePath);`],
    {
      cwd: repoRoot,
      env: {
        PATH: process.env.PATH,
        JWT_SECRET: 'test-secret',
        USERS_FILE: require.resolve('./fixtures/users.json'),
      },
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, path.join(repoRoot, 'data/bashcamp.sqlite'));
});
