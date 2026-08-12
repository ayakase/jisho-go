import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const timestamp = () => text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`)

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: timestamp(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  email: text('email').notNull().unique(),
  googleSub: text('google_sub').unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
}, (table) => [index('idx_users_google_sub').on(table.googleSub)])

export const userSessions = sqliteTable('user_sessions', {
  sessionTokenHash: text('session_token_hash').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp(), expiresAt: text('expires_at').notNull(),
}, (table) => [index('idx_user_sessions_user_id').on(table.userId), index('idx_user_sessions_expires_at').on(table.expiresAt)])

export const extensionSessions = sqliteTable('extension_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp(), expiresAt: text('expires_at').notNull(), deviceLabel: text('device_label'),
}, (table) => [index('idx_extension_sessions_user_id').on(table.userId), index('idx_extension_sessions_expires_at').on(table.expiresAt)])

export const extensionWebLoginTokens = sqliteTable('extension_web_login_tokens', {
  tokenHash: text('token_hash').primaryKey(), userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp(), expiresAt: text('expires_at').notNull(), usedAt: text('used_at'),
}, (table) => [index('idx_extension_web_login_tokens_user_id').on(table.userId), index('idx_extension_web_login_tokens_expires_at').on(table.expiresAt)])

export const openrouterRequests = sqliteTable('openrouter_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }), createdAt: timestamp(), query: text('query').notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }), model: text('model').notNull(), success: integer('success', { mode: 'boolean' }).notNull(),
  statusCode: integer('status_code'), durationMs: integer('duration_ms').notNull(), errorMessage: text('error_message'), clientIp: text('client_ip'), clientColo: text('client_colo'),
  openrouterResponseJson: text('openrouter_response_json'), providerErrorBody: text('provider_error_body'), usagePromptTokens: integer('usage_prompt_tokens'), usageCompletionTokens: integer('usage_completion_tokens'), usageTotalTokens: integer('usage_total_tokens'), providerCostUsd: text('provider_cost_usd'), walletLedgerEntryId: integer('wallet_ledger_entry_id'),
}, (table) => [index('idx_openrouter_requests_created_at').on(table.createdAt), index('idx_openrouter_requests_user_id').on(table.userId), index('idx_openrouter_requests_wallet_ledger_entry_id').on(table.walletLedgerEntryId)])

export const paymentProducts = sqliteTable('payment_products', { code: text('code').primaryKey(), amountVnd: integer('amount_vnd').notNull(), active: integer('active', { mode: 'boolean' }).notNull().default(true), createdAt: timestamp() })
export const paymentOrders = sqliteTable('payment_orders', { id: integer('id').primaryKey({ autoIncrement: true }), createdAt: timestamp(), updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`), userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), productCode: text('product_code').notNull().references(() => paymentProducts.code), orderCode: integer('order_code').notNull().unique(), amountVnd: integer('amount_vnd').notNull(), status: text('status').notNull(), paymentLink: text('payment_link'), paidAt: text('paid_at'), webhookPayloadJson: text('webhook_payload_json') }, (table) => [index('idx_payment_orders_user_id_id').on(table.userId, table.id)])

export const walletLedgerEntries = sqliteTable('wallet_ledger_entries', { id: integer('id').primaryKey({ autoIncrement: true }), createdAt: timestamp(), userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), entryType: text('entry_type', { enum: ['topup', 'ai_charge', 'adjustment'] }).notNull(), amountVnd: integer('amount_vnd').notNull(), balanceAfterVnd: integer('balance_after_vnd').notNull(), paymentOrderId: integer('payment_order_id').unique(), openrouterRequestId: integer('openrouter_request_id').unique(), sepayTransactionId: integer('sepay_transaction_id'), providerCostUsd: text('provider_cost_usd'), usdToVnd: integer('usd_to_vnd'), markupMultiplier: integer('markup_multiplier'), note: text('note') }, (table) => [index('idx_wallet_ledger_entries_user_id_id').on(table.userId, table.id), uniqueIndex('idx_wallet_ledger_entries_sepay_transaction_id').on(table.sepayTransactionId).where(sql`sepay_transaction_id IS NOT NULL`)])

export const sepayTransactions = sqliteTable('sepay_transactions', { id: integer('id').primaryKey({ autoIncrement: true }), createdAt: timestamp(), referenceCode: text('reference_code').notNull().unique(), userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), amountVnd: integer('amount_vnd').notNull(), transferContent: text('transfer_content').notNull(), webhookPayloadJson: text('webhook_payload_json').notNull(), walletLedgerEntryId: integer('wallet_ledger_entry_id').unique().references(() => walletLedgerEntries.id, { onDelete: 'set null' }) }, (table) => [index('idx_sepay_transactions_user_id_id').on(table.userId, table.id)])

export const roles = sqliteTable('roles', { id: integer('id').primaryKey({ autoIncrement: true }), code: text('code', { enum: ['owner', 'admin', 'support', 'viewer'] }).notNull().unique(), createdAt: timestamp() })
export const userRoles = sqliteTable('user_roles', { userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }), grantedByUserId: integer('granted_by_user_id').references(() => users.id, { onDelete: 'set null' }), createdAt: timestamp() }, (table) => [primaryKey({ columns: [table.userId, table.roleId] })])
export const appConfig = sqliteTable('app_config', { key: text('key').primaryKey(), valueJson: text('value_json').notNull(), version: integer('version').notNull().default(1), updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`), updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }) })
export const adminAuditLogs = sqliteTable('admin_audit_logs', { id: integer('id').primaryKey({ autoIncrement: true }), createdAt: timestamp(), actorUserId: integer('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }), action: text('action').notNull(), targetType: text('target_type').notNull(), targetId: text('target_id'), detailJson: text('detail_json').notNull().default('{}') }, (table) => [index('idx_admin_audit_logs_actor_created').on(table.actorUserId, table.id), index('idx_admin_audit_logs_target_created').on(table.targetType, table.targetId, table.id)])
