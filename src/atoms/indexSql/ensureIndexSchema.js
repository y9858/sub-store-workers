import { error as logError } from '../../utils/logger.js';

const INDEX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  path TEXT UNIQUE NOT NULL,
  notes TEXT DEFAULT '',
  token_version INTEGER DEFAULT 0,
  avatar_url TEXT DEFAULT '',
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_path ON users(path);

CREATE TABLE IF NOT EXISTS captchas (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_captchas_expires ON captchas(expires_at);

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings TEXT DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO system_settings (id, settings, updated_at) VALUES (1, '{}', (strftime('%s', 'now') * 1000));

CREATE TABLE IF NOT EXISTS mmdb_files (
  name TEXT PRIMARY KEY,
  etag TEXT,
  updated_at INTEGER NOT NULL,
  data BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mmdb_files_updated ON mmdb_files(updated_at);

CREATE TABLE IF NOT EXISTS mmdb_meta (
  name TEXT PRIMARY KEY,
  etag TEXT,
  updated_at INTEGER NOT NULL,
  source_url TEXT,
  build_epoch INTEGER,
  total_size INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  chunks INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mmdb_chunks (
  name TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (name, idx)
);
CREATE INDEX IF NOT EXISTS idx_mmdb_chunks_name ON mmdb_chunks(name);
`;

export function ensureIndexSchema(stateStorageSql, storage) {
    stateStorageSql.exec(INDEX_SCHEMA_SQL);

    try {
        const cols = storage.sql`PRAGMA table_info(mmdb_meta);`;
        const hasSourceUrl = Array.isArray(cols) && cols.some((c) => c?.name === 'source_url');
        const hasBuildEpoch = Array.isArray(cols) && cols.some((c) => c?.name === 'build_epoch');
        if (!hasSourceUrl) {
            storage.sql`ALTER TABLE mmdb_meta ADD COLUMN source_url TEXT;`;
        }
        if (!hasBuildEpoch) {
            storage.sql`ALTER TABLE mmdb_meta ADD COLUMN build_epoch INTEGER;`;
        }
    } catch (err) {
        logError('[IndexSchema] failed to ensure mmdb_meta columns:', err?.stack || err?.message || err);
    }
}
