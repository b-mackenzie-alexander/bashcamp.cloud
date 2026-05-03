'use strict';

const sessionRepository = require('./sessionRepository');

async function reconcileStartupSessions(db, docker, timestamp = Date.now()) {
  const openSessions = sessionRepository.findOpenSessions(db);
  for (const session of openSessions) {
    await docker.destroyContainer(session.containerName).catch(() => {});
    sessionRepository.markDestroyed(db, session.sessionId, timestamp, 'startup_reconciled');
  }
  return { reconciled: openSessions.length };
}

module.exports = { reconcileStartupSessions };
