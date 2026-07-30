CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('topup', 'ai_charge', 'adjustment')),
  amount_vnd INTEGER NOT NULL,
  balance_after_vnd INTEGER NOT NULL,
  payment_order_id INTEGER UNIQUE,
  openrouter_request_id INTEGER UNIQUE,
  provider_cost_usd TEXT,
  usd_to_vnd INTEGER,
  markup_multiplier INTEGER,
  note TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_entries_user_id_id
ON wallet_ledger_entries(user_id, id DESC);

CREATE TABLE IF NOT EXISTS payment_products (
  code TEXT PRIMARY KEY,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO payment_products (code, amount_vnd) VALUES
  ('topup_20k', 20000),
  ('topup_50k', 50000),
  ('topup_100k', 100000);

CREATE TABLE IF NOT EXISTS payment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER NOT NULL,
  product_code TEXT NOT NULL,
  order_code INTEGER NOT NULL UNIQUE,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'expired', 'failed')),
  payment_link TEXT,
  paid_at TEXT,
  webhook_payload_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_code) REFERENCES payment_products(code)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_user_id_id
ON payment_orders(user_id, id DESC);

ALTER TABLE openrouter_requests ADD COLUMN provider_cost_usd TEXT;
ALTER TABLE openrouter_requests ADD COLUMN wallet_ledger_entry_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_openrouter_requests_wallet_ledger_entry_id
ON openrouter_requests(wallet_ledger_entry_id);
