ALTER TABLE openrouter_requests ADD COLUMN user_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_openrouter_requests_user_id
ON openrouter_requests(user_id);
