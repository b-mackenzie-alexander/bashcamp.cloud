'use strict';

const express = require('express');
const sessionStore = require('./lib/sessionStore');
const { destroySession } = require('./lib/lifecycle');
const { db } = require('./lib/appState');
const docker = require('./lib/docker');
const portPool = require('./lib/portPool');
const { reconcileStartupSessions } = require('./lib/startup');

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

const timeoutMinutesRaw = Number(process.env.SESSION_TIMEOUT_MINUTES ?? 30);
const timeoutMinutes = Number.isFinite(timeoutMinutesRaw) && timeoutMinutesRaw > 0
  ? timeoutMinutesRaw
  : 30;
// Idle timeout: session is destroyed if lastActivityAt is older than this.
// Heartbeats from visible browser tabs reset lastActivityAt every 60s.
const SESSION_TIMEOUT_MS = timeoutMinutes * 60_000;
// Absolute cap: session is destroyed regardless of activity after this many hours.
const maxLifetimeHoursRaw = Number(process.env.SESSION_MAX_LIFETIME_HOURS ?? 4);
const SESSION_MAX_LIFETIME_MS = (Number.isFinite(maxLifetimeHoursRaw) && maxLifetimeHoursRaw > 0
  ? maxLifetimeHoursRaw
  : 4) * 60 * 60_000;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/scenarios', require('./routes/scenarios'));
const { router: sessionRouter, clearTerminalCookie } = require('./routes/sessions');
app.use('/api/session', sessionRouter);

const cleanupTimer = setInterval(async () => {
  const now = Date.now();
  for (const [sessionId, session] of sessionStore.all()) {
    try {
      if (session.status === 'active' && session.createdAt && now - session.createdAt > SESSION_MAX_LIFETIME_MS) {
        // Absolute cap: even an active user must eventually release the container
        await destroySession(sessionId, session);
      } else if (session.status === 'active' && (session.lastActivityAt || session.connectedAt) && now - (session.lastActivityAt || session.connectedAt) > SESSION_TIMEOUT_MS) {
        await destroySession(sessionId, session);
      } else if (session.status === 'disconnected' && session.expiresAt && now > session.expiresAt) {
        await destroySession(sessionId, session);
      } else if (session.status === 'destroyed') {
        sessionStore.remove(sessionId);
      }
    } catch (err) {
      console.error('session cleanup failed for %s: %s', sessionId, err?.message ?? err);
    }
  }
}, 60_000);
cleanupTimer.unref();

async function start() {
  await reconcileStartupSessions(db, docker, portPool);
  const PORT = process.env.PORT ?? 3000;
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

if (require.main === module) {
  start().catch(err => {
    console.error('API startup failed:', err);
    process.exit(1);
  });
}

module.exports = app;
