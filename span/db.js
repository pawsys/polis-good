const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

function openDb(file) {
  const dbFile = file || process.env.SPAN_DB || path.join(__dirname, 'data', 'span.db');
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      is_ai INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS polls (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      creator_id INTEGER REFERENCES users(id),
      created_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      leader_statement_id INTEGER,
      leader_since INTEGER,
      ending_notified INTEGER NOT NULL DEFAULT 0,
      ended_notified INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY,
      poll_id TEXT NOT NULL REFERENCES polls(id),
      author_id INTEGER NOT NULL REFERENCES users(id),
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS statements_poll ON statements(poll_id);

    CREATE TABLE IF NOT EXISTS votes (
      poll_id TEXT NOT NULL,
      statement_id INTEGER NOT NULL REFERENCES statements(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      vote INTEGER NOT NULL, -- 1 agree, -1 disagree, 0 pass
      created_at INTEGER NOT NULL,
      PRIMARY KEY (statement_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS votes_poll ON votes(poll_id);

    -- Bridging score of every statement over time; drives "time at #1" and sparklines.
    CREATE TABLE IF NOT EXISTS snapshots (
      poll_id TEXT NOT NULL,
      statement_id INTEGER NOT NULL,
      t INTEGER NOT NULL,
      score REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS snapshots_poll ON snapshots(poll_id, t);

    -- Emails that bring people back. Delivery is pluggable; rows are the source of truth.
    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      poll_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );
  `);
  return db;
}

module.exports = { openDb };
