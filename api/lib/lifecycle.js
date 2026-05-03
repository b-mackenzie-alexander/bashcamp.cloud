'use strict';

const sessionStore = require('./sessionStore');
const { destroyContainer, killTtyd } = require('./docker');
const portPool = require('./portPool');

async function destroySession(sessionId, session) {
  if (session.ttydPid) killTtyd(session.ttydPid);
  await destroyContainer(session.containerName).catch(() => {});
  portPool.release(session.port);
  sessionStore.update(sessionId, { status: 'destroyed' });
}

module.exports = { destroySession };
