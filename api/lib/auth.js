'use strict';

const jwt = require('jsonwebtoken');
const config = require('./config');
const { db } = require('./appState');
const users = require('./userRepository');

function jwtMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { userId: payload.userId };
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

async function validateUser(username, password) {
  return users.validateUser(db, username, password);
}

module.exports = { jwtMiddleware, validateUser };
