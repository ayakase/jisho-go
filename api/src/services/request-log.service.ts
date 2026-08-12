import { and, count, desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { openrouterRequests } from '../db/schema'
import { OpenRouterRequestLog } from '../types'

export type OpenRouterRequestLogInput = {
  query: string; userId: number | null; model: string; success: boolean; statusCode: number | null; durationMs: number; errorMessage: string | null; sourceUrl: string | null; clientIp: string | null; clientColo: string | null; openRouterResponseJson: string | null; providerErrorBody: string | null; usagePromptTokens: number | null; usageCompletionTokens: number | null; usageTotalTokens: number | null; providerCostUsd: string | null; walletLedgerEntryId: number | null
}

export class RequestLogService {
  private db
  constructor(binding: D1Database) { this.db = getDb(binding) }

  async save(entry: OpenRouterRequestLogInput): Promise<number | null> {
    const result = await this.db.insert(openrouterRequests).values({ query: entry.query, userId: entry.userId, model: entry.model, success: entry.success, statusCode: entry.statusCode, durationMs: entry.durationMs, errorMessage: entry.errorMessage, sourceUrl: entry.sourceUrl, clientIp: entry.clientIp, clientColo: entry.clientColo, openrouterResponseJson: entry.openRouterResponseJson, providerErrorBody: entry.providerErrorBody, usagePromptTokens: entry.usagePromptTokens, usageCompletionTokens: entry.usageCompletionTokens, usageTotalTokens: entry.usageTotalTokens, providerCostUsd: entry.providerCostUsd, walletLedgerEntryId: entry.walletLedgerEntryId }).returning({ id: openrouterRequests.id })
    return result[0]?.id ?? null
  }

  async attachWalletLedgerEntry(requestId: number, ledgerEntryId: number): Promise<void> {
    await this.db.update(openrouterRequests).set({ walletLedgerEntryId: ledgerEntryId }).where(eq(openrouterRequests.id, requestId))
  }

  async list(limit: number, offset = 0, userId?: number | null): Promise<OpenRouterRequestLog[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50
    const safeOffset = Number.isFinite(offset) ? Math.max(Math.floor(offset), 0) : 0
    const where = userId == null ? undefined : eq(openrouterRequests.userId, userId)
    const rows = await this.db.select().from(openrouterRequests).where(where).orderBy(desc(openrouterRequests.id)).limit(safeLimit).offset(safeOffset)
    return rows.map((row) => ({ id: row.id, created_at: row.createdAt, query: row.query, user_id: row.userId, model: row.model, success: row.success, status_code: row.statusCode, duration_ms: row.durationMs, error_message: row.errorMessage, source_url: row.sourceUrl, client_ip: row.clientIp, client_colo: row.clientColo, openrouter_response_json: row.openrouterResponseJson, provider_error_body: row.providerErrorBody, usage_prompt_tokens: row.usagePromptTokens, usage_completion_tokens: row.usageCompletionTokens, usage_total_tokens: row.usageTotalTokens, provider_cost_usd: row.providerCostUsd, wallet_ledger_entry_id: row.walletLedgerEntryId }))
  }

  async count(userId?: number | null): Promise<number> {
    const rows = await this.db.select({ total: count() }).from(openrouterRequests).where(userId == null ? undefined : eq(openrouterRequests.userId, userId))
    return rows[0]?.total ?? 0
  }

  async getById(id: number, userId?: number | null): Promise<OpenRouterRequestLog | null> {
    if (!Number.isSafeInteger(id) || id <= 0) return null
    const where = userId == null ? eq(openrouterRequests.id, id) : and(eq(openrouterRequests.id, id), eq(openrouterRequests.userId, userId))
    const rows = await this.db.select().from(openrouterRequests).where(where).limit(1)
    const row = rows[0]
    return row ? { id: row.id, created_at: row.createdAt, query: row.query, user_id: row.userId, model: row.model, success: row.success, status_code: row.statusCode, duration_ms: row.durationMs, error_message: row.errorMessage, source_url: row.sourceUrl, client_ip: row.clientIp, client_colo: row.clientColo, openrouter_response_json: row.openrouterResponseJson, provider_error_body: row.providerErrorBody, usage_prompt_tokens: row.usagePromptTokens, usage_completion_tokens: row.usageCompletionTokens, usage_total_tokens: row.usageTotalTokens, provider_cost_usd: row.providerCostUsd, wallet_ledger_entry_id: row.walletLedgerEntryId } : null
  }
}
