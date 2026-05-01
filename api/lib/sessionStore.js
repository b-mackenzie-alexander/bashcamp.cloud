'use strict';

const sessions = new Map();

function create(fields) {
  for (const [, s] of sessions) {
    if (s.userId === fields.userId && (s.status === 'active' || s.status === 'disconnected')) {
      throw Object.assign(new Error('user already has an active session'), { code: 'SESSION_EXISTS' });
    }
  }
  sessions.set(fields.sessionId, { ...fields });
}

function get(sessionId) {
  return sessions.get(sessionId);
}

function getByUser(userId) {
  for (const [, s] of sessions) {
    if (s.userId === userId && s.status !== 'destroyed') return s;
  }
  return undefined;
}

function update(sessionId, fields) {
  const session = sessions.get(sessionId);
  if (session) Object.assign(session, fields);
}

function all() {
  return sessions.entries();
}

function remove(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { create, get, getByUser, update, all, remove };
