'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const { jwtMiddleware, validateUser } = require('../lib/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = await validateUser(username, password);
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  const token = jwt.sign({ userId: user.userId }, process.env.JWT_SECRET, { expiresIn: '4h' });
  res.json({ token });
});

router.post('/logout', jwtMiddleware, (_req, res) => {
  res.sendStatus(200);
});

module.exports = router;
