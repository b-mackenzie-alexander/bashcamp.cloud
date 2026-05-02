'use strict';

const express = require('express');
const sessionStore = require('./lib/sessionStore');
const { destroySession } = require('./lib/lifecycle');

const app = express();
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/scenarios', require('./routes/scenarios'));
app.use('/api/session', require('./routes/sessions'));

const cleanupTimer = setInterval(async () => {
  const now = Date.now();
  for (const [sessionId, session] of sessionStore.all()) {
    if (session.status === 'disconnected' && session.expiresAt && now > session.expiresAt) {
      await destroySession(sessionId, session);
    } else if (session.status === 'destroyed') {
      sessionStore.remove(sessionId);
    }
  }
}, 60_000);
cleanupTimer.unref();

if (require.main === module) {
  const PORT = process.env.PORT ?? 3000;
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

module.exports = app;
