'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
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

test('metadata validator accepts guided scenarios and open sandboxes', () => {
  const output = validate(
    'scenarios/privilege-escalation-01/meta.json',
    'scenarios/sandbox-ubuntu/meta.json',
    'scenarios/sandbox-rocky/meta.json'
  );

  assert.match(output, /privilege-escalation-01\/meta\.json: OK/);
  assert.match(output, /sandbox-ubuntu\/meta\.json: OK/);
  assert.match(output, /sandbox-rocky\/meta\.json: OK/);
});
