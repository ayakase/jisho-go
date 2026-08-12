ALTER TABLE `openrouter_requests` ADD `is_favorite` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `wallet_signup_grants` (
  `user_id` integer PRIMARY KEY NOT NULL,
  `wallet_ledger_entry_id` integer NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`wallet_ledger_entry_id`) REFERENCES `wallet_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_signup_grants_wallet_ledger_entry_id_unique` ON `wallet_signup_grants` (`wallet_ledger_entry_id`);
