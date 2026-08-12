export type Bindings = {
  OPENROUTER_API_KEY: string
  DB?: D1Database
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  AUTH_COOKIE_SECRET?: string
  SEPAY_WEBHOOK_API_KEY?: string
}

export interface Vocabulary {
  word: string
  hiragana: string
  meaning_vi: string
}

export interface GrammarExample {
  japanese: string
  hiragana: string
  meaning_vi: string
}

export interface GrammarPoint {
  point: string
  explanation_vi: string
  example: GrammarExample
}

export interface ExplainResponse {
  input: string
  sentence_hiragana: string
  sentence_meaning_vi: string
  notes: string
  vocabularies: Vocabulary[]
  grammar: GrammarPoint[]
}

export interface OpenRouterRequestLog {
  id: number
  created_at: string
  query: string
  user_id: number | null
  model: string
  success: boolean
  status_code: number | null
  duration_ms: number
  error_message: string | null
  source_url: string | null
  is_favorite: boolean
  client_ip: string | null
  client_colo: string | null
  openrouter_response_json: string | null
  provider_error_body: string | null
  usage_prompt_tokens: number | null
  usage_completion_tokens: number | null
  usage_total_tokens: number | null
  provider_cost_usd: string | null
  wallet_ledger_entry_id: number | null
}
