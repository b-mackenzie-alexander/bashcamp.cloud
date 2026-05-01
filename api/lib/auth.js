'use strict';

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const usersFile = process.env.USERS_FILE ?? path.join(__dirname, '../../config/users.json');
const { users } = JSON.parse(fs.readFileSync(usersFile, 'utf8'));

function jwtMiddleware(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId };
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

async function validateUser(username, password) {
  const user = users.find(u => u.username === username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.password_hash);
  return ok ? { userId: username } : null;
}

module.exports = { jwtMiddleware, validateUser };
