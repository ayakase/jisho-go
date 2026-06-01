CREATE TABLE IF NOT EXISTS openrouter_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  query TEXT NOT NULL,
  model TEXT NOT NULL,
  success INTEGER NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,
  client_ip TEXT,
  client_colo TEXT
);

CREATE INDEX IF NOT EXISTS idx_openrouter_requests_created_at
ON openrouter_requests(created_at DESC);
