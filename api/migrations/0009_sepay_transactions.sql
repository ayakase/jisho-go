CREATE TABLE IF NOT EXISTS sepay_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reference_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  transfer_content TEXT NOT NULL,
  webhook_payload_json TEXT NOT NULL,
  wallet_ledger_entry_id INTEGER UNIQUE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_ledger_entry_id) REFERENCES wallet_ledger_entries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sepay_transactions_user_id_id
ON sepay_transactions(user_id, id DESC);

ALTER TABLE wallet_ledger_entries ADD COLUMN sepay_transaction_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_entries_sepay_transaction_id
ON wallet_ledger_entries(sepay_transaction_id)
WHERE sepay_transaction_id IS NOT NULL;
