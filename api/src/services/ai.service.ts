import { EXPLAIN_JSON_MAX_ATTEMPTS, EXPLAIN_SYSTEM } from '../constants/prompts'
import { ExplainResponse } from '../types'
import { normalizeExplainPayload, parseJsonFromLLMContent } from '../utils/llm'

export const OPENROUTER_MODEL = 'google/gemini-2.5-flash-lite'

export type OpenRouterTraceDetails = {
  openRouterRequestJson: string | null
  openRouterResponseJson: string | null
  providerErrorBody: string | null
  usagePromptTokens: number | null
  usageCompletionTokens: number | null
  usageTotalTokens: number | null
}

export type ExplainJapaneseResult = {
  payload: ExplainResponse
  model: string
  providerStatusCode: number
} & OpenRouterTraceDetails

type AIServiceErrorDetails = {
  model: string
  providerStatusCode: number | null
} & OpenRouterTraceDetails

export class AIServiceError extends Error {
  readonly model: string
  readonly providerStatusCode: number | null
  readonly openRouterRequestJson: string | null
  readonly openRouterResponseJson: string | null
  readonly providerErrorBody: string | null
  readonly usagePromptTokens: number | null
  readonly usageCompletionTokens: number | null
  readonly usageTotalTokens: number | null

  constructor(message: string, details: AIServiceErrorDetails) {
    super(message)
    this.name = 'AIServiceError'
    this.model = details.model
    this.providerStatusCode = details.providerStatusCode
    this.openRouterRequestJson = details.openRouterRequestJson
    this.openRouterResponseJson = details.openRouterResponseJson
    this.providerErrorBody = details.providerErrorBody
    this.usagePromptTokens = details.usagePromptTokens
    this.usageCompletionTokens = details.usageCompletionTokens
    this.usageTotalTokens = details.usageTotalTokens
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export class AIService {
  constructor(private apiKey: string) {}

  async explainJapanese(query: string): Promise<ExplainJapaneseResult> {
    const requestPayload = {
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: EXPLAIN_SYSTEM },
        {
          role: 'user',
          content: query,
        },
      ],
      response_format: { type: 'json_object' as const },
    }
    const requestJson = JSON.stringify(requestPayload)
    let lastInvalidJsonSnippet = ''
    let lastResponseJson: string | null = null
    let lastProviderStatusCode: number | null = null
    let lastUsagePromptTokens: number | null = null
    let lastUsageCompletionTokens: number | null = null
    let lastUsageTotalTokens: number | null = null

    for (let attempt = 0; attempt < EXPLAIN_JSON_MAX_ATTEMPTS; attempt++) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: requestJson,
      })

      lastProviderStatusCode = res.status
      const responseText = await res.text()
      lastResponseJson = responseText || null

      let data: any = null
      try {
        data = responseText ? JSON.parse(responseText) : null
      } catch {
        data = null
      }

      const usagePromptTokens = numberOrNull(data?.usage?.prompt_tokens)
      const usageCompletionTokens = numberOrNull(data?.usage?.completion_tokens)
      const usageTotalTokens = numberOrNull(data?.usage?.total_tokens)
      lastUsagePromptTokens = usagePromptTokens
      lastUsageCompletionTokens = usageCompletionTokens
      lastUsageTotalTokens = usageTotalTokens

      if (!res.ok) {
        const errBody = responseText || `HTTP ${res.status}`
        throw new AIServiceError(`API error: ${errBody}`, {
          model: OPENROUTER_MODEL,
          providerStatusCode: res.status,
          openRouterRequestJson: requestJson,
          openRouterResponseJson: responseText || null,
          providerErrorBody: errBody,
          usagePromptTokens,
          usageCompletionTokens,
          usageTotalTokens,
        })
      }

      const content = data?.choices?.[0]?.message?.content

      if (typeof content !== 'string' || !content.trim()) {
        throw new AIServiceError('Empty model response', {
          model: OPENROUTER_MODEL,
          providerStatusCode: res.status,
          openRouterRequestJson: requestJson,
          openRouterResponseJson: responseText || null,
          providerErrorBody: null,
          usagePromptTokens,
          usageCompletionTokens,
          usageTotalTokens,
        })
      }

      let parsed: unknown
      try {
        parsed = parseJsonFromLLMContent(content)
      } catch {
        lastInvalidJsonSnippet = content.slice(0, 500)
        continue
      }

      return {
        payload: normalizeExplainPayload(parsed, query),
        model: OPENROUTER_MODEL,
        providerStatusCode: res.status,
        openRouterRequestJson: requestJson,
        openRouterResponseJson: responseText || null,
        providerErrorBody: null,
        usagePromptTokens,
        usageCompletionTokens,
        usageTotalTokens,
      }
    }

    throw new AIServiceError(`Invalid JSON from model after ${EXPLAIN_JSON_MAX_ATTEMPTS} attempts. Snippet: ${lastInvalidJsonSnippet}`, {
      model: OPENROUTER_MODEL,
      providerStatusCode: lastProviderStatusCode,
      openRouterRequestJson: requestJson,
      openRouterResponseJson: lastResponseJson,
      providerErrorBody: null,
      usagePromptTokens: lastUsagePromptTokens,
      usageCompletionTokens: lastUsageCompletionTokens,
      usageTotalTokens: lastUsageTotalTokens,
    })
  }
}
