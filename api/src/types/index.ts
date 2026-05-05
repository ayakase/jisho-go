export type Bindings = {
  OPENROUTER_API_KEY: string
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
