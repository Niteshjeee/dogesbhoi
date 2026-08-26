PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS dogs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
  sex TEXT NOT NULL DEFAULT 'unknown' CHECK(sex IN ('male','female','unknown')),
  color TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  vaccination_status TEXT NOT NULL DEFAULT 'unknown' CHECK(vaccination_status IN ('yes','no','unknown')),
  sterilized_status TEXT NOT NULL DEFAULT 'unknown' CHECK(sterilized_status IN ('yes','no','unknown')),
  photo_data TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sightings (
  id TEXT PRIMARY KEY,
  dog_id TEXT NOT NULL,
  latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  accuracy_m REAL NOT NULL CHECK(accuracy_m >= 0),
  condition TEXT NOT NULL DEFAULT 'seen' CHECK(condition IN ('seen','safe','injured','hungry','with_puppies','afraid','needs_help')),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 250),
  confidence TEXT NOT NULL CHECK(confidence IN ('high','medium','low')),
  moderation_status TEXT NOT NULL CHECK(moderation_status IN ('accepted','review','rejected')),
  risk_reason TEXT NOT NULL DEFAULT '',
  reporter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (dog_id) REFERENCES dogs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sightings_dog_time ON sightings(dog_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sightings_status_time ON sightings(moderation_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sightings_reporter_time ON sightings(reporter_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  reporter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_hash_time ON admin_login_attempts(reporter_hash, created_at DESC);
