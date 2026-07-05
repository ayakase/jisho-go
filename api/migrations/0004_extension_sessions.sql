CREATE TABLE IF NOT EXISTS extension_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  device_label TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_extension_sessions_user_id
ON extension_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_extension_sessions_expires_at
ON extension_sessions(expires_at);
