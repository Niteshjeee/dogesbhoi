PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('owner','admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(active, role);

CREATE TABLE IF NOT EXISTS admin_auth_attempts (
  reporter_hash TEXT NOT NULL,
  username_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_auth_reporter_time
  ON admin_auth_attempts(reporter_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_auth_user_time
  ON admin_auth_attempts(username_key, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit (
  id TEXT PRIMARY KEY,
  actor_admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (actor_admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_time ON admin_audit(created_at DESC);
