import { D1DatabaseCompat, OpenRouterRequestLog } from '../types'

export type OpenRouterRequestLogInput = {
  query: string
  model: string
  success: boolean
  statusCode: number | null
  durationMs: number
  errorMessage: string | null
  clientIp: string | null
  clientColo: string | null
  openRouterRequestJson: string | null
  openRouterResponseJson: string | null
  providerErrorBody: string | null
  usagePromptTokens: number | null
  usageCompletionTokens: number | null
  usageTotalTokens: number | null
}

const CREATE_TABLE_SQL = `
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
  client_colo TEXT,
  openrouter_request_json TEXT,
  openrouter_response_json TEXT,
  provider_error_body TEXT,
  usage_prompt_tokens INTEGER,
  usage_completion_tokens INTEGER,
  usage_total_tokens INTEGER
);
`

const CREATE_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_openrouter_requests_created_at
ON openrouter_requests(created_at DESC);
`

const ALTER_TABLE_ADD_COLUMNS_SQL = [
  `ALTER TABLE openrouter_requests ADD COLUMN openrouter_request_json TEXT;`,
  `ALTER TABLE openrouter_requests ADD COLUMN openrouter_response_json TEXT;`,
  `ALTER TABLE openrouter_requests ADD COLUMN provider_error_body TEXT;`,
  `ALTER TABLE openrouter_requests ADD COLUMN usage_prompt_tokens INTEGER;`,
  `ALTER TABLE openrouter_requests ADD COLUMN usage_completion_tokens INTEGER;`,
  `ALTER TABLE openrouter_requests ADD COLUMN usage_total_tokens INTEGER;`,
]

export class RequestLogService {
  private schemaReady = false

  constructor(private db: D1DatabaseCompat) {}

  async save(entry: OpenRouterRequestLogInput): Promise<void> {
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
            model,
            success,
            status_code,
          duration_ms,
          error_message,
          client_ip,
          client_colo,
          openrouter_request_json,
          openrouter_response_json,
          provider_error_body,
          usage_prompt_tokens,
          usage_completion_tokens,
          usage_total_tokens
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .bind(
          entry.query,
          entry.model,
          entry.success ? 1 : 0,
          entry.statusCode,
          entry.durationMs,
          entry.errorMessage,
          entry.clientIp,
          entry.clientColo,
          entry.openRouterRequestJson,
          entry.openRouterResponseJson,
          entry.providerErrorBody,
          entry.usagePromptTokens,
          entry.usageCompletionTokens,
          entry.usageTotalTokens,
        )
        .run()) as { success?: unknown; meta?: unknown }

      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        throw new Error(`D1 insert returned success=false with meta=${JSON.stringify(result.meta ?? null)}`)
      }
    } catch (err) {
      throw new Error(`D1 insert failed for openrouter_requests: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async list(limit: number): Promise<OpenRouterRequestLog[]> {
    await this.ensureSchema()

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 200) : 50
    const rs = await this.db
      .prepare(
        `
        SELECT
          id,
          created_at,
          query,
          model,
          success,
          status_code,
          duration_ms,
          error_message,
          client_ip,
          client_colo,
          openrouter_request_json,
          openrouter_response_json,
          provider_error_body,
          usage_prompt_tokens,
          usage_completion_tokens,
          usage_total_tokens
        FROM openrouter_requests
        ORDER BY id DESC
        LIMIT ?
      `,
      )
      .bind(safeLimit)
      .all()

    const rows = (rs.results ?? []) as Record<string, unknown>[]
    return rows.map((row) => this.mapRowToLog(row))
  }

  async getById(id: number): Promise<OpenRouterRequestLog | null> {
    await this.ensureSchema()
    const safeId = Math.floor(id)
    if (!Number.isFinite(safeId) || safeId <= 0) return null

    const rs = await this.db
      .prepare(
        `
        SELECT
          id,
          created_at,
          query,
          model,
          success,
          status_code,
          duration_ms,
          error_message,
          client_ip,
          client_colo,
          openrouter_request_json,
          openrouter_response_json,
          provider_error_body,
          usage_prompt_tokens,
          usage_completion_tokens,
          usage_total_tokens
        FROM openrouter_requests
        WHERE id = ?
        LIMIT 1
      `,
      )
      .bind(safeId)
      .all()

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
      model: String(row.model ?? ''),
      success: Number(row.success) === 1,
      status_code: row.status_code == null ? null : Number(row.status_code),
      duration_ms: Number(row.duration_ms ?? 0),
      error_message: row.error_message == null ? null : String(row.error_message),
      client_ip: row.client_ip == null ? null : String(row.client_ip),
      client_colo: row.client_colo == null ? null : String(row.client_colo),
      openrouter_request_json: row.openrouter_request_json == null ? null : String(row.openrouter_request_json),
      openrouter_response_json: row.openrouter_response_json == null ? null : String(row.openrouter_response_json),
      provider_error_body: row.provider_error_body == null ? null : String(row.provider_error_body),
      usage_prompt_tokens: row.usage_prompt_tokens == null ? null : Number(row.usage_prompt_tokens),
      usage_completion_tokens: row.usage_completion_tokens == null ? null : Number(row.usage_completion_tokens),
      usage_total_tokens: row.usage_total_tokens == null ? null : Number(row.usage_total_tokens),
    }
  }
}
