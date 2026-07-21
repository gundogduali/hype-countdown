import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CREATE_TIMERS_TABLE = `
  CREATE TABLE IF NOT EXISTS timers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    slug       TEXT    NOT NULL UNIQUE,
    title      TEXT    NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
    emoji      TEXT    NOT NULL DEFAULT '⏳',
    category   TEXT             CHECK (category IN ('games', 'sports', 'movies-tv', 'tech', 'holidays')),
    target_at  TEXT    NOT NULL,
    is_curated INTEGER NOT NULL DEFAULT 0 CHECK (is_curated IN (0, 1)),
    created_at TEXT    NOT NULL
  );
`;

// Hype Reactions (PRD §9.2): fixed emoji set, anonymous, per-IP-once.
// Two tables, deliberately separate (per the issue spec):
//  - reaction_totals: one row per (timer, emoji) — the live count shown to everyone.
//  - reaction_marks: one row per (timer, emoji, ip) — the uniqueness record that
//    stops the same IP from double-counting. Its PRIMARY KEY is the actual
//    constraint (not just an app-level SELECT-before-INSERT), so a duplicate
//    INSERT fails atomically at the SQLite layer even under concurrent writers.
const CREATE_REACTIONS_TABLES = `
  CREATE TABLE IF NOT EXISTS reaction_totals (
    timer_slug TEXT    NOT NULL REFERENCES timers (slug) ON DELETE CASCADE,
    emoji      TEXT    NOT NULL CHECK (emoji IN ('🔥', '⏳', '🎉', '😱', '👀')),
    count      INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
    PRIMARY KEY (timer_slug, emoji)
  );
  CREATE TABLE IF NOT EXISTS reaction_marks (
    timer_slug TEXT NOT NULL REFERENCES timers (slug) ON DELETE CASCADE,
    emoji      TEXT NOT NULL CHECK (emoji IN ('🔥', '⏳', '🎉', '😱', '👀')),
    ip         TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (timer_slug, emoji, ip)
  );
`;

// Hype Messages (PRD §9.3, issue HM-4): short, moderated free text attached to
// a timer. Already-sanitized by backend/src/middleware/moderation.js before
// insertion here — this layer only stores/reads, it never re-derives its own
// length/blocklist checks (that's HM-3's job). No cap is enforced by the
// schema itself; MessageService prunes rows beyond MESSAGE_CAP_PER_TIMER on
// every insert, so storage per timer stays bounded (see services/messages.js
// for the chosen cap and rationale).
const CREATE_MESSAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timer_slug TEXT    NOT NULL REFERENCES timers (slug) ON DELETE CASCADE,
    message    TEXT    NOT NULL,
    created_at TEXT    NOT NULL
  );
`;

const MIGRATION = `
  ${CREATE_TIMERS_TABLE}
  CREATE INDEX IF NOT EXISTS idx_timers_curated_target ON timers (is_curated, target_at);
  CREATE INDEX IF NOT EXISTS idx_timers_category ON timers (category);
  ${CREATE_REACTIONS_TABLES}
  ${CREATE_MESSAGES_TABLE}
  CREATE INDEX IF NOT EXISTS idx_messages_slug_id ON messages (timer_slug, id);
`;

/**
 * v2.1 (English switch): the category CHECK constraint changed from Turkish
 * values (oyun, spor, film-dizi, teknoloji, ozel-gunler) to English ones.
 * SQLite cannot alter a CHECK constraint in place, so databases created with
 * the old schema are rebuilt (rename → copy with category mapping → drop).
 * Custom rows are preserved; their legacy category values are mapped so they
 * satisfy the new constraint. Destructive rebuild approved pre-launch.
 * @param {DatabaseSync} db
 */
function migrateLegacyCategorySchema(db) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'timers'")
    .get();
  if (!row || !row.sql.includes("'ozel-gunler'")) return; // no table yet, or already migrated

  db.exec(`
    BEGIN;
    ALTER TABLE timers RENAME TO timers_legacy;
    ${CREATE_TIMERS_TABLE}
    INSERT INTO timers (id, slug, title, emoji, category, target_at, is_curated, created_at)
      SELECT id, slug, title, emoji,
        CASE category
          WHEN 'oyun'        THEN 'games'
          WHEN 'spor'        THEN 'sports'
          WHEN 'film-dizi'   THEN 'movies-tv'
          WHEN 'teknoloji'   THEN 'tech'
          WHEN 'ozel-gunler' THEN 'holidays'
          ELSE category
        END,
        target_at, is_curated, created_at
      FROM timers_legacy;
    DROP TABLE timers_legacy;
    COMMIT;
  `);
}

/**
 * Opens (and migrates) a SQLite database.
 * @param {string} path file path, or ':memory:' for tests
 * @returns {DatabaseSync}
 */
export function openDb(path) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrateLegacyCategorySchema(db);
  db.exec(MIGRATION);
  return db;
}
