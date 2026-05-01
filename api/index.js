'use strict';

const express = require('express');
const sessionStore = require('./lib/sessionStore');
const { killTtyd } = require('./lib/docker');
const { destroySession } = require('./lib/lifecycle');

const app = express();
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/scenarios', require('./routes/scenarios'));
app.use('/api/session', require('./routes/sessions'));

const RECONNECT_MS = Number(process.env.RECONNECT_WINDOW_MINUTES ?? 15) * 60_000;
const MAX_SESSION_MS = 45 * 60_000;

setInterval(async () => {
  const now = Date.now();
  for (const [sessionId, session] of sessionStore.all()) {
    if (session.status === 'active' && now - session.createdAt > MAX_SESSION_MS) {
      // Force disconnect — ttyd exit event will update status to disconnected
      killTtyd(session.ttydPid);
    } else if (session.status === 'disconnected' && now - session.disconnectedAt > RECONNECT_MS) {
      await destroySession(sessionId, session);
    } else if (session.status === 'destroyed') {
      sessionStore.remove(sessionId);
    }
  }
}, 60_000);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`API listening on :${PORT}`));
