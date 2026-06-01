ALTER TABLE openrouter_requests ADD COLUMN openrouter_request_json TEXT;
ALTER TABLE openrouter_requests ADD COLUMN openrouter_response_json TEXT;
ALTER TABLE openrouter_requests ADD COLUMN provider_error_body TEXT;
ALTER TABLE openrouter_requests ADD COLUMN usage_prompt_tokens INTEGER;
ALTER TABLE openrouter_requests ADD COLUMN usage_completion_tokens INTEGER;
ALTER TABLE openrouter_requests ADD COLUMN usage_total_tokens INTEGER;
