'use strict';

function toDbSession(fields) {
  const timestamp = Date.now();
  return {
    sessionId: fields.sessionId,
    userId: fields.userId,
    scenarioId: fields.scenarioId,
    distro: fields.distro,
    containerName: fields.containerName,
    port: fields.port,
    status: fields.status,
    createdAt: fields.createdAt ?? timestamp,
    connectedAt: fields.connectedAt ?? null,
    disconnectedAt: fields.disconnectedAt ?? null,
    expiresAt: fields.expiresAt ?? null,
    destroyedAt: fields.destroyedAt ?? null,
    lastError: fields.lastError ?? null,
    updatedAt: timestamp,
  };
}

function upsertSession(db, fields) {
  db.prepare(`
    insert into sessions (
      session_id, user_id, scenario_id, distro, container_name, port, status,
      created_at, connected_at, disconnected_at, expires_at, destroyed_at, last_error, updated_at
    ) values (
      @sessionId, @userId, @scenarioId, @distro, @containerName, @port, @status,
      @createdAt, @connectedAt, @disconnectedAt, @expiresAt, @destroyedAt, @lastError, @updatedAt
    )
    on conflict(session_id) do update set
      user_id = excluded.user_id,
      scenario_id = excluded.scenario_id,
      distro = excluded.distro,
      container_name = excluded.container_name,
      port = excluded.port,
      status = excluded.status,
      connected_at = excluded.connected_at,
      disconnected_at = excluded.disconnected_at,
      expires_at = excluded.expires_at,
      destroyed_at = excluded.destroyed_at,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run(toDbSession(fields));
}

function updateSession(db, sessionId, fields) {
  const allowed = {
    port: 'port',
    status: 'status',
    connectedAt: 'connected_at',
    disconnectedAt: 'disconnected_at',
    expiresAt: 'expires_at',
    destroyedAt: 'destroyed_at',
    lastError: 'last_error',
  };
  const entries = Object.entries(fields).filter(([key]) => Object.hasOwn(allowed, key));
  if (entries.length === 0) return;

  const updates = entries.map(([key]) => `${allowed[key]} = @${key}`);
  updates.push('updated_at = @updatedAt');
  const params = { sessionId, updatedAt: Date.now() };
  for (const [key, value] of entries) params[key] = value;

  db.prepare(`update sessions set ${updates.join(', ')} where session_id = @sessionId`).run(params);
}

function markDestroyed(db, sessionId, destroyedAt = Date.now(), reason = 'destroyed') {
  updateSession(db, sessionId, {
    status: 'destroyed',
    destroyedAt,
    lastError: reason === 'destroyed' ? null : reason,
  });
  recordEvent(db, sessionId, reason, {});
}

function removeSession(db, sessionId) {
  markDestroyed(db, sessionId);
}

function recordEvent(db, sessionId, eventType, details = {}) {
  db.prepare(`
    insert into session_events (session_id, event_type, details_json, created_at)
    values (?, ?, ?, ?)
  `).run(sessionId, eventType, JSON.stringify(details), Date.now());
}

function findOpenSessions(db) {
  return db.prepare(`
    select
      session_id as sessionId,
      user_id as userId,
      scenario_id as scenarioId,
      distro,
      container_name as containerName,
      port,
      status,
      created_at as createdAt,
      connected_at as connectedAt,
      disconnected_at as disconnectedAt,
      expires_at as expiresAt,
      destroyed_at as destroyedAt,
      last_error as lastError
    from sessions
    where status in ('active', 'disconnected')
    order by created_at
  `).all();
}

module.exports = {
  upsertSession,
  updateSession,
  markDestroyed,
  removeSession,
  recordEvent,
  findOpenSessions,
};
