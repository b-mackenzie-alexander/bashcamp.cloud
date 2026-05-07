'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const config = require('../lib/config');
const { jwtMiddleware, validateUser } = require('../lib/auth');
const sessionStore = require('../lib/sessionStore');
const docker = require('../lib/docker');
const portPool = require('../lib/portPool');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = await validateUser(username, password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ userId: user.userId }, config.jwtSecret, { expiresIn: '4h' });
  res.json({ token });
});

router.post('/logout', jwtMiddleware, async (req, res) => {
  const session = sessionStore.getByUser(req.user.userId);
  if (session) {
    if (session.ttydPid) docker.killTtyd(session.ttydPid);
    await docker.destroyContainer(session.containerName).catch(() => {});
    portPool.release(session.port);
    sessionStore.remove(session.sessionId);
  }
  res.setHeader('Set-Cookie',
    'bashcamp_terminal=; HttpOnly; Secure; SameSite=Strict; Path=/t/; Max-Age=0');
  res.sendStatus(200);
});

module.exports = router;
