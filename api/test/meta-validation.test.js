'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '../..');
const validator = path.join(repoRoot, 'scripts/validate-meta.js');

function validate(...files) {
  return execFileSync('node', [validator, ...files.map(file => path.join(repoRoot, file))], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

test('metadata validator rejects empty string for optional string fields', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bashcamp-meta-test-'));
  const metaDir = path.join(tmpDir, 'my-scenario');
  fs.mkdirSync(metaDir);
  const metaFile = path.join(metaDir, 'meta.json');
  fs.writeFileSync(metaFile, JSON.stringify({
    id: 'my-scenario',
    type: 'scenario',
    title: 'Test Scenario',
    distro: 'ubuntu-22.04',
    difficulty: 'beginner',
    duration_minutes: 20,
    objectives: ['1.1'],
    description: 'A test scenario.',
    distro_pair: '',
  }));

  let output = '';
  let threw = false;
  try {
    execFileSync('node', [validator, metaFile], { cwd: repoRoot, encoding: 'utf8' });
  } catch (err) {
    output = err.stderr;
    threw = true;
  }

  assert.ok(threw, 'validator should exit non-zero for empty distro_pair');
  assert.match(output, /distro_pair must be non-empty/);
});

test('metadata validator accepts guided scenarios and open sandboxes', () => {
  const output = validate(
    'scenarios/privilege-escalation-01/meta.json',
    'scenarios/backup-permissions-01/meta.json',
    'scenarios/inventory-service-01/meta.json',
    'scenarios/app-recovery-01/meta.json',
    'scenarios/sandbox-ubuntu/meta.json',
    'scenarios/sandbox-rocky/meta.json'
  );

  assert.match(output, /privilege-escalation-01\/meta\.json: OK/);
  assert.match(output, /backup-permissions-01\/meta\.json: OK/);
  assert.match(output, /inventory-service-01\/meta\.json: OK/);
  assert.match(output, /app-recovery-01\/meta\.json: OK/);
  assert.match(output, /sandbox-ubuntu\/meta\.json: OK/);
  assert.match(output, /sandbox-rocky\/meta\.json: OK/);
});
