import { D1DatabaseCompat, OpenRouterRequestLog } from '../types'

export type OpenRouterRequestLogInput = {
  query: string
  userId: number | null
  model: string
  success: boolean
  statusCode: number | null
  durationMs: number
  errorMessage: string | null
  clientIp: string | null
  clientColo: string | null
  openRouterResponseJson: string | null
  providerErrorBody: string | null
  usagePromptTokens: number | null
  usageCompletionTokens: number | null
  usageTotalTokens: number | null
  providerCostUsd: string | null
  walletLedgerEntryId: number | null
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS openrouter_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  query TEXT NOT NULL,
  user_id INTEGER,
  model TEXT NOT NULL,
  success INTEGER NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,
  client_ip TEXT,
  client_colo TEXT,
  openrouter_response_json TEXT,
  provider_error_body TEXT,
  usage_prompt_tokens INTEGER,
  usage_completion_tokens INTEGER,
  usage_total_tokens INTEGER,
  provider_cost_usd TEXT,
  wallet_ledger_entry_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
`

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_openrouter_requests_created_at
ON openrouter_requests(created_at DESC);
`

const CREATE_USER_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_openrouter_requests_user_id
ON openrouter_requests(user_id);
`

const ALTER_TABLE_ADD_COLUMNS_SQL = [
  `ALTER TABLE openrouter_requests ADD COLUMN user_id INTEGER;`,
  `ALTER TABLE openrouter_requests ADD COLUMN openrouter_response_json TEXT;`,
  `ALTER TABLE openrouter_requests ADD COLUMN provider_error_body TEXT;`,
  `ALTER TABLE openrouter_requests ADD COLUMN usage_prompt_tokens INTEGER;`,
  `ALTER TABLE openrouter_requests ADD COLUMN usage_completion_tokens INTEGER;`,
  `ALTER TABLE openrouter_requests ADD COLUMN usage_total_tokens INTEGER;`,
  `ALTER TABLE openrouter_requests ADD COLUMN provider_cost_usd TEXT;`,
  `ALTER TABLE openrouter_requests ADD COLUMN wallet_ledger_entry_id INTEGER;`,
]

export class RequestLogService {
  private schemaReady = false

  constructor(private db: D1DatabaseCompat) {}

  async save(entry: OpenRouterRequestLogInput): Promise<number | null> {
    try {
      await this.ensureSchema()
    } catch (err) {
      throw new Error(
        `D1 schema setup failed for openrouter_requests: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    try {
      const result = (await this.db
        .prepare(
          `
          INSERT INTO openrouter_requests (
            query,
            user_id,
            model,
            success,
            status_code,
            duration_ms,
            error_message,
            client_ip,
            client_colo,
            openrouter_response_json,
            provider_error_body,
            usage_prompt_tokens,
            usage_completion_tokens,
            usage_total_tokens,
            provider_cost_usd,
            wallet_ledger_entry_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .bind(
          entry.query,
          entry.userId,
          entry.model,
          entry.success ? 1 : 0,
          entry.statusCode,
          entry.durationMs,
          entry.errorMessage,
          entry.clientIp,
          entry.clientColo,
          entry.openRouterResponseJson,
          entry.providerErrorBody,
          entry.usagePromptTokens,
          entry.usageCompletionTokens,
          entry.usageTotalTokens,
          entry.providerCostUsd,
          entry.walletLedgerEntryId,
        )
        .run()) as { success?: unknown; meta?: unknown }

      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error(`D1 insert returned success=false with meta=${JSON.stringify(result.meta ?? null)}`)
      }
      const meta = result && typeof result === 'object' && 'meta' in result ? result.meta as { last_row_id?: unknown } : null
      return typeof meta?.last_row_id === 'number' ? meta.last_row_id : null
    } catch (err) {
      throw new Error(`D1 insert failed for openrouter_requests: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async attachWalletLedgerEntry(requestId: number, ledgerEntryId: number): Promise<void> {
    await this.ensureSchema()
    await this.db
      .prepare('UPDATE openrouter_requests SET wallet_ledger_entry_id = ? WHERE id = ?')
      .bind(ledgerEntryId, requestId)
      .run()
  }

  async list(limit: number, offset = 0, userId?: number | null): Promise<OpenRouterRequestLog[]> {
    await this.ensureSchema()

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50
    const safeOffset = Number.isFinite(offset) ? Math.max(Math.floor(offset), 0) : 0
    const query = userId == null
      ? `
        SELECT
          id,
          created_at,
          query,
          user_id,
          model,
          success,
          status_code,
          duration_ms,
          error_message,
          client_ip,
          client_colo,
          openrouter_response_json,
          provider_error_body,
          usage_prompt_tokens,
          usage_completion_tokens,
          usage_total_tokens,
          provider_cost_usd,
          wallet_ledger_entry_id
        FROM openrouter_requests
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `
      : `
        SELECT
          id,
          created_at,
          query,
          user_id,
          model,
          success,
          status_code,
          duration_ms,
          error_message,
          client_ip,
          client_colo,
          openrouter_response_json,
          provider_error_body,
          usage_prompt_tokens,
          usage_completion_tokens,
          usage_total_tokens,
          provider_cost_usd,
          wallet_ledger_entry_id
        FROM openrouter_requests
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `
    const statement = this.db.prepare(query)
    const rs = userId == null
      ? await statement.bind(safeLimit, safeOffset).all()
      : await statement.bind(userId, safeLimit, safeOffset).all()

    const rows = (rs.results ?? []) as Record<string, unknown>[]
    return rows.map((row) => this.mapRowToLog(row))
  }

  async count(userId?: number | null): Promise<number> {
    await this.ensureSchema()

    const query = userId == null
      ? 'SELECT COUNT(*) AS total FROM openrouter_requests'
      : 'SELECT COUNT(*) AS total FROM openrouter_requests WHERE user_id = ?'
    const statement = this.db.prepare(query)
    const rs = userId == null ? await statement.all<{ total: number }>() : await statement.bind(userId).all<{ total: number }>()
    return Number(rs.results?.[0]?.total ?? 0)
  }

  async getById(id: number, userId?: number | null): Promise<OpenRouterRequestLog | null> {
    await this.ensureSchema()
    const safeId = Math.floor(id)
    if (!Number.isFinite(safeId) || safeId <= 0) return null

    const query = userId == null
      ? `
        SELECT
          id,
          created_at,
          query,
          user_id,
          model,
          success,
          status_code,
          duration_ms,
          error_message,
          client_ip,
          client_colo,
          openrouter_response_json,
          provider_error_body,
          usage_prompt_tokens,
          usage_completion_tokens,
          usage_total_tokens,
          provider_cost_usd,
          wallet_ledger_entry_id
        FROM openrouter_requests
        WHERE id = ?
        LIMIT 1
      `
      : `
        SELECT
          id,
          created_at,
          query,
          user_id,
          model,
          success,
          status_code,
          duration_ms,
          error_message,
          client_ip,
          client_colo,
          openrouter_response_json,
          provider_error_body,
          usage_prompt_tokens,
          usage_completion_tokens,
          usage_total_tokens,
          provider_cost_usd,
          wallet_ledger_entry_id
        FROM openrouter_requests
        WHERE id = ? AND user_id = ?
        LIMIT 1
      `
    const statement = this.db.prepare(query)
    const rs = userId == null ? await statement.bind(safeId).all() : await statement.bind(safeId, userId).all()

    const rows = (rs.results ?? []) as Record<string, unknown>[]
    if (rows.length === 0) return null
    return this.mapRowToLog(rows[0])
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return
    try {
      await this.db.prepare(CREATE_TABLE_SQL).run()
      await this.backfillColumns()
      await this.db.prepare(CREATE_INDEX_SQL).run()
      await this.db.prepare(CREATE_USER_INDEX_SQL).run()
      this.schemaReady = true
    } catch (err) {
      throw new Error(`Failed creating table/index: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async backfillColumns(): Promise<void> {
    for (const sql of ALTER_TABLE_ADD_COLUMNS_SQL) {
      try {
        await this.db.prepare(sql).run()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('duplicate column name')) {
          continue
        }
        throw err
      }
    }
  }

  private mapRowToLog(row: Record<string, unknown>): OpenRouterRequestLog {
    return {
      id: Number(row.id),
      created_at: String(row.created_at ?? ''),
      query: String(row.query ?? ''),
      user_id: row.user_id == null ? null : Number(row.user_id),
      model: String(row.model ?? ''),
      success: Number(row.success) === 1,
      status_code: row.status_code == null ? null : Number(row.status_code),
      duration_ms: Number(row.duration_ms ?? 0),
      error_message: row.error_message == null ? null : String(row.error_message),
      client_ip: row.client_ip == null ? null : String(row.client_ip),
      client_colo: row.client_colo == null ? null : String(row.client_colo),
      openrouter_response_json: row.openrouter_response_json == null ? null : String(row.openrouter_response_json),
      provider_error_body: row.provider_error_body == null ? null : String(row.provider_error_body),
      usage_prompt_tokens: row.usage_prompt_tokens == null ? null : Number(row.usage_prompt_tokens),
      usage_completion_tokens: row.usage_completion_tokens == null ? null : Number(row.usage_completion_tokens),
      usage_total_tokens: row.usage_total_tokens == null ? null : Number(row.usage_total_tokens),
      provider_cost_usd: row.provider_cost_usd == null ? null : String(row.provider_cost_usd),
      wallet_ledger_entry_id: row.wallet_ledger_entry_id == null ? null : Number(row.wallet_ledger_entry_id),
    }
  }
}
