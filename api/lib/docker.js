'use strict';

const Docker = require('dockerode');
const { spawn, execFileSync } = require('child_process');
const config = require('./config');

const docker = new Docker();

const IMAGE = {
  'ubuntu-22.04': 'bashcamp/ubuntu-22.04-base',
  'rocky-9': 'bashcamp/rocky-9-base',
};

async function createContainer(sessionId, distro) {
  const containerName = `session-${sessionId}`;
  const hostConfig = {
    Memory: 512 * 1024 * 1024,
    NanoCpus: 1_000_000_000,
    NetworkMode: 'bashcamp-net',
    CapDrop: ['ALL'],
    CapAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL', 'SETUID', 'SETGID', 'SYS_ADMIN'],
    SecurityOpt: ['no-new-privileges:false'],
    Tmpfs: { '/run': '', '/run/lock': '' },
    CgroupnsMode: 'host',
    Binds: [
      '/sys/fs/cgroup:/sys/fs/cgroup:rw',
      `${config.scenariosHostPath}:/scenarios:ro`,
    ],
  };

  const container = await docker.createContainer({
    name: containerName,
    Hostname: 'bashcamp-lab',
    Image: IMAGE[distro],
    HostConfig: hostConfig,
  });
  await container.start();
  return containerName;
}

async function destroyContainer(containerName) {
  await docker.getContainer(containerName).remove({ force: true });
}

// Uses execFileSync with array args — no shell interpolation.
// containerName is always 'session-<hex>' (internal). provisionPath is
// assembled from a validated scenario ID + fixed suffix before this is called.
function runProvision(containerName, provisionPath) {
  execFileSync('docker', ['cp', provisionPath, `${containerName}:/tmp/provision.sh`]);
  execFileSync('docker', ['exec', containerName, 'bash', '/tmp/provision.sh'], {
    timeout: 35_000,
  });
}

function spawnTtyd(port, sessionId, terminalSecret, onExit) {
  const proc = spawn('ttyd', [
    '--port', String(port),
    '--once',
    '--credential', `${sessionId}:${terminalSecret}`,
    'docker', 'exec', '-it', `session-${sessionId}`, '/bin/bash',
  ], { detached: false });
  proc.on('error', err => console.error('ttyd spawn error (session %s): %s', sessionId, err.message));
  proc.on('exit', onExit);
  return proc.pid;
}

function killTtyd(pid) {
  try { process.kill(pid, 'SIGTERM'); } catch (_) {}
}

module.exports = { createContainer, destroyContainer, runProvision, spawnTtyd, killTtyd };
