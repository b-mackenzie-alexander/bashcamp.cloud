'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '../../frontend/index.html'), 'utf8');

test('frontend is a no-build static app with local markdown dependencies', () => {
  assert.match(html, /<form[^>]+id="login-form"/);
  assert.match(html, /id="scenario-view"/);
  assert.match(html, /id="lab-view"/);
  assert.match(html, /src="vendor\/marked\.umd\.js"/);
  assert.match(html, /src="vendor\/purify\.min\.js"/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
});

test('frontend does not inject scenario metadata HTML', () => {
  assert.doesNotMatch(html, /card\.innerHTML/);
  assert.match(html, /makeEl\('h2', \{ textContent: scenario\.title \}\)/);
  assert.match(html, /makeEl\('p', \{ textContent: scenario\.description \}\)/);
});

test('frontend sanitizes rendered scenario markdown', () => {
  assert.match(html, /DOMPurify\.sanitize\(marked\.parse\(result\.markdown\)\)/);
});

test('frontend calls the milestone API endpoints', () => {
  for (const endpoint of [
    '/api/auth/login',
    '/api/scenarios',
    '/api/session',
    '/api/session/start',
    '/api/session/reconnect',
    '/api/session/reset',
    '/api/session/end',
  ]) {
    assert.ok(html.includes(endpoint), `${endpoint} should be referenced`);
  }
  assert.match(html, /\/api\/scenarios\/\$\{encodeURIComponent\(scenarioId\)\}\/readme/);
});

test('frontend ends stale sessions before starting a different scenario', () => {
  const startScenarioMatch = html.match(/async function startScenario\(scenarioId\) \{[\s\S]+?\n    \}/);
  assert.ok(startScenarioMatch, 'startScenario should exist');
  const startScenario = startScenarioMatch[0];

  assert.match(startScenario, /api\('\/api\/session\/end', \{ method: 'POST' \}\)/);
  assert.doesNotMatch(startScenario, /api\('\/api\/session\/reset', \{ method: 'POST' \}\)/);
});

test('frontend avoids terminal credentials in URLs', () => {
  assert.doesNotMatch(html, /username=/);
  assert.doesNotMatch(html, /password=/);
});
