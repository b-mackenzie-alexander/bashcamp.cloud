'use strict';

const sessions = new Map();
const { db } = require('./appState');
const sessionRepository = require('./sessionRepository');

function create(fields) {
  for (const [, s] of sessions) {
    if (s.userId === fields.userId && (s.status === 'active' || s.status === 'disconnected')) {
      throw Object.assign(new Error('user already has an active session'), { code: 'SESSION_EXISTS' });
    }
  }
  sessions.set(fields.sessionId, { ...fields });
  sessionRepository.upsertSession(db, fields);
  sessionRepository.recordEvent(db, fields.sessionId, 'created', { scenarioId: fields.scenarioId, port: fields.port });
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
  if (session) {
    Object.assign(session, fields);
    sessionRepository.updateSession(db, sessionId, fields);
    if (fields.status) sessionRepository.recordEvent(db, sessionId, fields.status, { port: session.port });
  }
}

function all() {
  return sessions.entries();
}

function remove(sessionId) {
  sessionRepository.removeSession(db, sessionId);
  sessions.delete(sessionId);
}

module.exports = { create, get, getByUser, update, all, remove };
