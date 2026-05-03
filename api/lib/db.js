'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let cached;

function migrate(db) {
  db.exec(`
    pragma foreign_keys = on;

    create table if not exists schema_migrations (
      version integer primary key,
      applied_at integer not null
    );

    create table if not exists users (
      username text primary key,
      password_hash text not null,
      role text not null default 'student',
      status text not null default 'active',
      created_at integer not null,
      updated_at integer not null,
      check (role in ('student', 'instructor', 'admin')),
      check (status in ('active', 'disabled'))
    );

    create table if not exists sessions (
      session_id text primary key,
      user_id text not null,
      scenario_id text not null,
      distro text not null,
      container_name text not null,
      port integer not null,
      status text not null,
      created_at integer not null,
      connected_at integer,
      disconnected_at integer,
      expires_at integer,
      destroyed_at integer,
      last_error text,
      updated_at integer not null,
      foreign key (user_id) references users(username)
    );

    create index if not exists idx_sessions_user_status on sessions(user_id, status);
    create index if not exists idx_sessions_status on sessions(status);

    create table if not exists session_events (
      id integer primary key autoincrement,
      session_id text not null,
      event_type text not null,
      details_json text not null default '{}',
      created_at integer not null
    );
  `);

  db.prepare('insert or ignore into schema_migrations (version, applied_at) values (?, ?)').run(1, Date.now());
}

function configuredDatabasePath() {
  return require('./config').databasePath;
}

function openDatabase(databasePath = configuredDatabasePath()) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function getDatabase() {
  if (!cached) cached = openDatabase(configuredDatabasePath());
  return cached;
}

function resetDatabaseForTests() {
  if (cached) cached.close();
  cached = null;
}

module.exports = { openDatabase, getDatabase, resetDatabaseForTests };
