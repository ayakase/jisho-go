import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { resolveCorsOrigin } from '../config/app'
import { type SessionUser } from '../services/auth.service'
import { RequestLogService } from '../services/request-log.service'
import { normalizeExplainPayload, parseJsonFromLLMContent } from '../utils/llm'
import { Bindings, ExplainResponse, OpenRouterRequestLog } from '../types'
import { getAuthenticatedUser } from '../utils/request-auth'

type HistoryEnv = {
  Bindings: Bindings
  Variables: {
    authUser: SessionUser
  }
}

const history = new Hono<HistoryEnv>()

type PublicHistoryEntry = {
  id: number
  created_at: string
  query: string
  success: boolean
  source_url: string | null
  is_favorite: boolean
  lesson: ExplainResponse | null
}

function extractLesson(entry: OpenRouterRequestLog): ExplainResponse | null {
  if (!entry.openrouter_response_json) return null

  try {
    const response = JSON.parse(entry.openrouter_response_json) as { choices?: Array<{ message?: { content?: unknown } }> }
    const content = response.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null
    return normalizeExplainPayload(parseJsonFromLLMContent(content), entry.query)
  } catch {
    return null
  }
}

function toPublicHistoryEntry(entry: OpenRouterRequestLog): PublicHistoryEntry {
  return {
    id: entry.id,
    created_at: entry.created_at,
    query: entry.query,
    success: entry.success,
    source_url: entry.source_url,
    is_favorite: entry.is_favorite,
    lesson: extractLesson(entry),
  }
}

history.use(
  '*',
  cors({
    origin: (origin) => resolveCorsOrigin(origin),
    credentials: true,
    allowMethods: ['GET', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
)

history.use('*', async (c, next) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const user = await getAuthenticatedUser(db, {
    sessionToken: getCookie(c, 'kg_session'),
    authorizationHeader: c.req.header('Authorization'),
  })
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('authUser', user)
  await next()
})

history.get('/', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const pageParam = Number(c.req.query('page') ?? '1')
  const page = Number.isFinite(pageParam) ? Math.max(Math.floor(pageParam), 1) : 1
  const pageSizeParam = c.req.query('pageSize') ?? c.req.query('limit')
  const requestedPageSize = pageSizeParam ? Number(pageSizeParam) : 20
  const pageSize = Number.isFinite(requestedPageSize) ? Math.min(Math.max(Math.floor(requestedPageSize), 1), 100) : 20
  const logger = new RequestLogService(c.env.DB)
  const user = c.get('authUser')
  const filters = { query: c.req.query('q')?.trim() || undefined, from: c.req.query('from') || undefined, to: c.req.query('to') || undefined, favoritesOnly: c.req.query('favorite') === '1' }
  const [entries, total] = await Promise.all([
    logger.list(pageSize, (page - 1) * pageSize, user.id, filters),
    logger.count(user.id, filters),
  ])

  return c.json({
    items: entries.map(toPublicHistoryEntry),
    count: entries.length,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  })
})

history.patch('/:id/favorite', async (c) => {
  const id = Number(c.req.param('id'))
  let body: { favorite?: unknown } = {}
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const favorite = body.favorite === true
  const ok = await new RequestLogService(c.env.DB!).setFavorite(id, c.get('authUser').id, favorite)
  return ok ? c.json({ id, favorite }) : c.json({ error: 'Not found' }, 404)
})

history.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const ok = await new RequestLogService(c.env.DB!).delete(id, c.get('authUser').id)
  return ok ? c.json({ ok: true }) : c.json({ error: 'Not found' }, 404)
})

history.get('/export.csv', async (c) => {
  const filters = { query: c.req.query('q')?.trim() || undefined, from: c.req.query('from') || undefined, to: c.req.query('to') || undefined, favoritesOnly: c.req.query('favorite') === '1' }
  const rows = await new RequestLogService(c.env.DB!).list(200, 0, c.get('authUser').id, filters)
  const lesson = (row: OpenRouterRequestLog) => extractLesson(row)
  const definitions = {
    id: (row: OpenRouterRequestLog) => row.id,
    created_at: (row: OpenRouterRequestLog) => row.created_at,
    query: (row: OpenRouterRequestLog) => row.query,
    sentence_hiragana: (row: OpenRouterRequestLog) => lesson(row)?.sentence_hiragana ?? '',
    meaning_vi: (row: OpenRouterRequestLog) => lesson(row)?.sentence_meaning_vi ?? '',
    notes: (row: OpenRouterRequestLog) => lesson(row)?.notes ?? '',
    vocabularies: (row: OpenRouterRequestLog) => (lesson(row)?.vocabularies ?? []).map((item) => `${item.word ?? ''} (${item.hiragana ?? item.reading ?? ''}): ${item.meaning_vi ?? ''}`).join('\n'),
    grammar: (row: OpenRouterRequestLog) => (lesson(row)?.grammar ?? []).map((item) => `${item.point ?? ''}: ${item.explanation_vi ?? ''}`).join('\n'),
    source_url: (row: OpenRouterRequestLog) => row.source_url ?? '',
    favorite: (row: OpenRouterRequestLog) => row.is_favorite,
    success: (row: OpenRouterRequestLog) => row.success,
    model: (row: OpenRouterRequestLog) => row.model,
    duration_ms: (row: OpenRouterRequestLog) => row.duration_ms,
    usage_total_tokens: (row: OpenRouterRequestLog) => row.usage_total_tokens ?? '',
    error_message: (row: OpenRouterRequestLog) => row.error_message ?? '',
  }
  const requested = (c.req.query('fields') ?? '').split(',').filter((field): field is keyof typeof definitions => field in definitions)
  const fields = requested.length ? [...new Set(requested)] : Object.keys(definitions) as Array<keyof typeof definitions>
  const csv = [fields, ...rows.map((row) => fields.map((field) => definitions[field](row)))].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  return new Response(`\uFEFF${csv}\n`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="jisho-history.csv"' } })
})

history.get('/:id', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const logger = new RequestLogService(c.env.DB)
  const user = c.get('authUser')
  const entry = await logger.getById(id, user.id)
  if (!entry) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(toPublicHistoryEntry(entry))
})

export default history
