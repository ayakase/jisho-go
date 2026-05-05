import { EXPLAIN_JSON_MAX_ATTEMPTS, EXPLAIN_SYSTEM } from '../constants/prompts'
import { ExplainResponse } from '../types'
import { normalizeExplainPayload, parseJsonFromLLMContent } from '../utils/llm'

export class AIService {
  constructor(private apiKey: string) {}

  async explainJapanese(query: string): Promise<ExplainResponse> {
    let lastInvalidJsonSnippet = ''

    for (let attempt = 0; attempt < EXPLAIN_JSON_MAX_ATTEMPTS; attempt++) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { role: 'system', content: EXPLAIN_SYSTEM },
            {
              role: 'user',
              content: query,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API error: ${errText}`)
      }

      const data = (await res.json()) as any
      const content = data?.choices?.[0]?.message?.content

      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('Empty model response')
      }

      let parsed: unknown
      try {
        parsed = parseJsonFromLLMContent(content)
      } catch {
        lastInvalidJsonSnippet = content.slice(0, 500)
        continue
      }

      return normalizeExplainPayload(parsed, query)
    }

    throw new Error(`Invalid JSON from model after ${EXPLAIN_JSON_MAX_ATTEMPTS} attempts. Snippet: ${lastInvalidJsonSnippet}`)
  }
}
