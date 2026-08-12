CREATE TABLE `admin_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`actor_user_id` integer NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`detail_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_actor_created` ON `admin_audit_logs` (`actor_user_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_admin_audit_logs_target_created` ON `admin_audit_logs` (`target_type`,`target_id`,`id`);--> statement-breakpoint
CREATE TABLE `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by_user_id` integer,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `extension_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`device_label` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_extension_sessions_user_id` ON `extension_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_extension_sessions_expires_at` ON `extension_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `extension_web_login_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_extension_web_login_tokens_user_id` ON `extension_web_login_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_extension_web_login_tokens_expires_at` ON `extension_web_login_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `openrouter_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`query` text NOT NULL,
	`user_id` integer,
	`model` text NOT NULL,
	`success` integer NOT NULL,
	`status_code` integer,
	`duration_ms` integer NOT NULL,
	`error_message` text,
	`client_ip` text,
	`client_colo` text,
	`openrouter_response_json` text,
	`provider_error_body` text,
	`usage_prompt_tokens` integer,
	`usage_completion_tokens` integer,
	`usage_total_tokens` integer,
	`provider_cost_usd` text,
	`wallet_ledger_entry_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_openrouter_requests_created_at` ON `openrouter_requests` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_openrouter_requests_user_id` ON `openrouter_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_openrouter_requests_wallet_ledger_entry_id` ON `openrouter_requests` (`wallet_ledger_entry_id`);--> statement-breakpoint
CREATE TABLE `payment_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`user_id` integer NOT NULL,
	`product_code` text NOT NULL,
	`order_code` integer NOT NULL,
	`amount_vnd` integer NOT NULL,
	`status` text NOT NULL,
	`payment_link` text,
	`paid_at` text,
	`webhook_payload_json` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_code`) REFERENCES `payment_products`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_orders_order_code_unique` ON `payment_orders` (`order_code`);--> statement-breakpoint
CREATE INDEX `idx_payment_orders_user_id_id` ON `payment_orders` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `payment_products` (
	`code` text PRIMARY KEY NOT NULL,
	`amount_vnd` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_code_unique` ON `roles` (`code`);--> statement-breakpoint
CREATE TABLE `sepay_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`reference_code` text NOT NULL,
	`user_id` integer NOT NULL,
	`amount_vnd` integer NOT NULL,
	`transfer_content` text NOT NULL,
	`webhook_payload_json` text NOT NULL,
	`wallet_ledger_entry_id` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`wallet_ledger_entry_id`) REFERENCES `wallet_ledger_entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sepay_transactions_reference_code_unique` ON `sepay_transactions` (`reference_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `sepay_transactions_wallet_ledger_entry_id_unique` ON `sepay_transactions` (`wallet_ledger_entry_id`);--> statement-breakpoint
CREATE INDEX `idx_sepay_transactions_user_id_id` ON `sepay_transactions` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	`granted_by_user_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`session_token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_user_sessions_user_id` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_user_sessions_expires_at` ON `user_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`email` text NOT NULL,
	`google_sub` text,
	`display_name` text,
	`avatar_url` text,
	`email_verified` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE INDEX `idx_users_google_sub` ON `users` (`google_sub`);--> statement-breakpoint
CREATE TABLE `wallet_ledger_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`user_id` integer NOT NULL,
	`entry_type` text NOT NULL,
	`amount_vnd` integer NOT NULL,
	`balance_after_vnd` integer NOT NULL,
	`payment_order_id` integer,
	`openrouter_request_id` integer,
	`sepay_transaction_id` integer,
	`provider_cost_usd` text,
	`usd_to_vnd` integer,
	`markup_multiplier` integer,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_ledger_entries_payment_order_id_unique` ON `wallet_ledger_entries` (`payment_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_ledger_entries_openrouter_request_id_unique` ON `wallet_ledger_entries` (`openrouter_request_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_ledger_entries_user_id_id` ON `wallet_ledger_entries` (`user_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wallet_ledger_entries_sepay_transaction_id` ON `wallet_ledger_entries` (`sepay_transaction_id`) WHERE sepay_transaction_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO `payment_products` (`code`, `amount_vnd`) VALUES ('topup_20k', 20000), ('topup_50k', 50000), ('topup_100k', 100000);
--> statement-breakpoint
INSERT INTO `roles` (`code`) VALUES ('owner'), ('admin'), ('support'), ('viewer');
--> statement-breakpoint
INSERT INTO `app_config` (`key`, `value_json`) VALUES ('sepay', '{"qrCodeUrl":"https://vietqr.app/img?bank=BIDV&acc=96247OW8RC&template=compact&showinfo=true&holder=DANG%20THAI%20AN"}');
