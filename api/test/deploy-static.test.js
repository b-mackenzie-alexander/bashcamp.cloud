'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '../..');

function read(filePath) {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf8');
}

test('API Dockerfile includes host Docker and ttyd runtime dependencies', () => {
  const dockerfile = read('api/Dockerfile');

  assert.match(dockerfile, /^FROM node:\d+-bookworm-slim/m);
  assert.match(dockerfile, /docker-ce-cli/);
  assert.match(dockerfile, /ttyd/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /EXPOSE 3000/);
  assert.match(dockerfile, /CMD \["npm", "start"\]/);
});

test('student containers do not expose the host scenario repository', () => {
  const dockerLib = read('api/lib/docker.js');

  assert.doesNotMatch(dockerLib, /scenariosHostPath/);
  assert.doesNotMatch(dockerLib, /:\/scenarios:ro/);
  assert.doesNotMatch(dockerLib, /\/scenarios\/\$\{scenarioId\}\/check\.sh/);
});

test('student containers allow sudo to write audit events without broad privileges', () => {
  const dockerLib = read('api/lib/docker.js');

  assert.match(dockerLib, /'AUDIT_WRITE'/);
  assert.doesNotMatch(dockerLib, /'AUDIT_CONTROL'/);
});

test('ttyd launches writable terminals as the student admin user', () => {
  const dockerLib = read('api/lib/docker.js');

  assert.match(dockerLib, /'--writable'/);
  assert.match(dockerLib, /'--user', 'sr_sysadmin'/);
});

test('base images restore manual pages for Linux+ practice realism', () => {
  const ubuntu = read('docker/base-ubuntu/Dockerfile');
  const rocky = read('docker/base-rocky/Dockerfile');

  assert.match(ubuntu, /man-db/);
  assert.match(ubuntu, /manpages/);
  assert.match(ubuntu, /man\.REAL/);
  assert.match(rocky, /man-db/);
  assert.match(rocky, /man-pages/);
  assert.match(rocky, /coreutils-common/);
});

test('production compose runs only the API behind localhost Caddy', () => {
  const compose = read('deploy/docker-compose.yml');

  assert.match(compose, /services:\n\s+api:/);
  assert.doesNotMatch(compose, /\n\s+caddy:/);
  assert.match(compose, /"127\.0\.0\.1:3000:3000"/);
  assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
  assert.match(compose, /\.\.\/scenarios:\/scenarios:ro/);
  assert.match(compose, /\.\.\/config\/users\.json:\/config\/users\.json:ro/);
  assert.match(compose, /\.\.\/data:\/data/);
  assert.match(compose, /USERS_FILE=\/config\/users\.json/);
  assert.match(compose, /DATABASE_PATH=\/data\/bashcamp\.sqlite/);
  assert.match(compose, /SCENARIOS_PATH=\/scenarios/);
  assert.doesNotMatch(compose, /SCENARIOS_HOST_PATH/);
  assert.match(compose, /JWT_SECRET=\$\{JWT_SECRET\?\S+/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /\/api\/health/);
});

test('deployment env example documents non-secret defaults only', () => {
  const env = read('deploy/.env.example');

  assert.match(env, /JWT_SECRET=replace-with-strong-random-secret/);
  assert.match(env, /SESSION_TIMEOUT_MINUTES=30/);
  assert.match(env, /RECONNECT_WINDOW_MINUTES=15/);
  assert.doesNotMatch(env, /\$2[aby]\$/);
  assert.doesNotMatch(env, /config\/users\.json/);
});

test('setup script is idempotent and refuses missing secrets', () => {
  const setup = read('deploy/setup.sh');

  assert.match(setup, /set -euo pipefail/);
  assert.match(setup, /APP_DIR="\$\{APP_DIR:-\/opt\/bashcamp\}"/);
  assert.match(setup, /WEB_ROOT="\$\{WEB_ROOT:-\/var\/www\/bashcamp\}"/);
  assert.match(setup, /DOMAIN="\$\{DOMAIN:-bashcamp\.cloud\}"/);
  assert.match(setup, /BRANCH="\$\{BRANCH:-develop\}"/);
  assert.match(setup, /SSH_PORT="\$\{SSH_PORT:-22\}"/);
  assert.match(setup, /JWT_SECRET.*replace-with-strong-random-secret/);
  assert.match(setup, /config\/users\.json/);
  assert.match(setup, /mkdir -p "\$APP_DIR\/data"/);
  assert.match(setup, /docker network inspect bashcamp-net/);
  assert.match(setup, /docker compose -f deploy\/docker-compose\.yml/);
  assert.match(setup, /caddy validate --config \/etc\/caddy\/Caddyfile/);
  assert.match(setup, /ufw allow "\$\{SSH_PORT\}"\/tcp/);
  assert.match(setup, /ufw allow 80\/tcp/);
  assert.match(setup, /ufw allow 443\/tcp/);
});

test('deployment runbook covers operator-owned live steps and rollback', () => {
  const readme = read('deploy/README.md');

  for (const phrase of [
    'Hetzner CX32',
    'Ubuntu 22.04',
    'Porkbun',
    'config/users.json',
    'data/bashcamp.sqlite',
    'npm run user:create',
    'npm run users:import',
    'bcrypt',
    'deploy/.env',
    'bashcamp-net',
    'Rollback',
    'No live deployment',
  ]) {
    assert.ok(readme.includes(phrase), `${phrase} should be documented`);
  }
});
