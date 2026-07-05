export type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement
  run: () => Promise<unknown>
  all: <T = unknown>() => Promise<{ results?: T[] }>
}

export type D1DatabaseCompat = {
  prepare: (query: string) => D1PreparedStatement
  exec: (query: string) => Promise<unknown>
}

export type Bindings = {
  OPENROUTER_API_KEY: string
  DB?: D1DatabaseCompat
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GOOGLE_REDIRECT_URI?: string
  AUTH_COOKIE_SECRET?: string
  AUTH_WEB_ORIGIN?: string
  AUTH_SKIP_STATE_COOKIE_CHECK?: string
  AUTH_EXTENSION_ORIGIN?: string
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
  client_ip: string | null
  client_colo: string | null
  openrouter_request_json: string | null
  openrouter_response_json: string | null
  provider_error_body: string | null
  usage_prompt_tokens: number | null
  usage_completion_tokens: number | null
  usage_total_tokens: number | null
}
