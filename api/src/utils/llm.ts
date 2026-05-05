import { ExplainResponse, GrammarPoint, Vocabulary } from '../types'

export function parseJsonFromLLMContent(raw: string): unknown {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = fence ? fence[1].trim() : trimmed
  return JSON.parse(jsonStr)
}

export function strField(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  return typeof v === 'string' ? v : ''
}

export function normalizeExplainPayload(parsed: unknown, input: string): ExplainResponse {
  const o = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const vocabularies = (Array.isArray(o.vocabularies) ? o.vocabularies : []) as Vocabulary[]
  const grammarRaw = Array.isArray(o.grammar) ? o.grammar : []
  const grammar = grammarRaw.filter(
    (g): g is GrammarPoint =>
      g !== null && typeof g === 'object' && !Array.isArray(g),
  )
  
  return {
    input,
    sentence_hiragana: strField(o, 'sentence_hiragana'),
    sentence_meaning_vi: strField(o, 'sentence_meaning_vi'),
    notes: strField(o, 'notes'),
    vocabularies,
    grammar,
  }
}
