CREATE TABLE IF NOT EXISTS extension_web_login_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_extension_web_login_tokens_user_id
ON extension_web_login_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_extension_web_login_tokens_expires_at
ON extension_web_login_tokens(expires_at);
