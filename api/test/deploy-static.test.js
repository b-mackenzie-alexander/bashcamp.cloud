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
  assert.match(dockerfile, /docker\.io/);
  assert.match(dockerfile, /ttyd/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /EXPOSE 3000/);
  assert.match(dockerfile, /CMD \["npm", "start"\]/);
});

test('production compose runs only the API behind localhost Caddy', () => {
  const compose = read('deploy/docker-compose.yml');

  assert.match(compose, /services:\n\s+api:/);
  assert.doesNotMatch(compose, /\n\s+caddy:/);
  assert.match(compose, /"127\.0\.0\.1:3000:3000"/);
  assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
  assert.match(compose, /\.\.\/scenarios:\/scenarios:ro/);
  assert.match(compose, /\.\.\/config\/users\.json:\/config\/users\.json:ro/);
  assert.match(compose, /USERS_FILE=\/config\/users\.json/);
  assert.match(compose, /SCENARIOS_PATH=\/scenarios/);
  assert.match(compose, /SCENARIOS_HOST_PATH=\/opt\/bashcamp\/scenarios/);
  assert.match(compose, /JWT_SECRET=\$\{JWT_SECRET\?\S+/);
  assert.match(compose, /restart: unless-stopped/);
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
    'bcrypt',
    'deploy/.env',
    'bashcamp-net',
    'Rollback',
    'No live deployment',
  ]) {
    assert.ok(readme.includes(phrase), `${phrase} should be documented`);
  }
});
