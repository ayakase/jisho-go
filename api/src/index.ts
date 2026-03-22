import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  OPENROUTER_API_KEY: string
}

const EXPLAIN_SYSTEM = `Bạn là trợ lý dạy tiếng Nhật. Người dùng gửi một đoạn tiếng Nhật đã được chọn (có thể là từ, cụm hoặc cả câu).
Trả về DUY NHẤT một đối tượng JSON hợp lệ, không markdown, không văn bản ngoài JSON, với đúng các khóa sau:
{
  "sentence_hiragana": string,
  "sentence_meaning_vi": string,
  "notes": string,
  "vocabularies": [ { "word": string, "hiragana": string, "meaning_vi": string } ],
  "grammar": [ {
    "point": string,
    "explanation_vi": string,
    "example": { "japanese": string, "hiragana": string, "meaning_vi": string }
  } ]
}
Quy tắc toàn câu được chọn (luôn điền nếu có thể):
- "sentence_hiragana": đọc toàn bộ đoạn người dùng gửi, chỉ bằng hiragana (không katakana, không romaji).
- "sentence_meaning_vi": nghĩa/giải thích tổng thể bằng tiếng Việt.

"notes":
- Ghi chú thêm bằng tiếng Việt: ví dụ đoạn thiếu ngữ cảnh, cách hiểu khác, lưu ý ngữ dụng, giả định khi dịch. Nếu không cần thì để chuỗi rỗng "".

Từ vựng (vocabularies):
- "word": từ/cụm như trong văn bản; "hiragana": đọc đầy đủ chỉ hiragana; "meaning_vi": nghĩa/giải thích ngắn bằng tiếng Việt.

Ngữ pháp (grammar):
- Mỗi phần tử là một điểm ngữ pháp: "point" (có thể kèm tiếng Nhật ngắn), "explanation_vi" giải thích tiếng Việt.
- "example": MỘT ví dụ đơn giản minh họa đúng điểm ngữ pháp đó. "japanese" như viết thường; "hiragana" toàn bộ ví dụ chỉ hiragana; "meaning_vi" nghĩa ví dụ tiếng Việt. Nếu không có ví dụ phù hợp thì để các trường trong "example" là "".

Mảng "vocabularies" hoặc "grammar" không có gì thì trả về [].`

function parseJsonFromLLMContent(raw: string): unknown {
  const trimmed = raw.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = fence ? fence[1].trim() : trimmed
  return JSON.parse(jsonStr)
}

function strField(o: Record<string, unknown>, key: string): string {
  const v = o[key]
  return typeof v === 'string' ? v : ''
}

function normalizeExplainPayload(parsed: unknown, input: string) {
  const o = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  const vocabularies = Array.isArray(o.vocabularies) ? o.vocabularies : []
  const grammarRaw = Array.isArray(o.grammar) ? o.grammar : []
  const grammar = grammarRaw.filter(
    (g): g is Record<string, unknown> =>
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

/** 1 initial call + 2 retries when the model returns unparseable JSON */
const EXPLAIN_JSON_MAX_ATTEMPTS = 3

const app = new Hono<{ Bindings: Bindings }>()

app.use(
  '/explain',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
  }),
)

app.get('/', (c) => {
  return c.text('Hello Hono!')
})
app.get('/debug', (c) => {
  return c.json({
    key: c.env.OPENROUTER_API_KEY,
    hasKey: !!c.env.OPENROUTER_API_KEY
  })
})
app.get('/explain', async (c) => {
  const query = c.req.query('q')

  if (!query) {
    return c.json({ error: 'Missing ?q=...' }, 400)
  }

  try {
    let lastInvalidJsonSnippet = ''

    for (let attempt = 0; attempt < EXPLAIN_JSON_MAX_ATTEMPTS; attempt++) {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${c.env.OPENROUTER_API_KEY}`,
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
        return c.json({ error: 'API error', detail: errText }, 500)
      }

      const data = await res.json()

      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) {
        return c.json({ error: 'Empty model response' }, 502)
      }

      let parsed: unknown
      try {
        parsed = parseJsonFromLLMContent(content)
      } catch {
        lastInvalidJsonSnippet = content.slice(0, 500)
        continue
      }

      const payload = normalizeExplainPayload(parsed, query)
      return c.json(payload)
    }

    return c.json(
      {
        error: 'Invalid JSON from model',
        detail: lastInvalidJsonSnippet,
        attempts: EXPLAIN_JSON_MAX_ATTEMPTS,
      },
      502,
    )
  } catch (err: any) {
    return c.json(
      {
        error: 'Request failed',
        detail: err.message,
      },
      500
    )
  }
})

export default app