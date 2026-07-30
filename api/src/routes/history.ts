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
    lesson: extractLesson(entry),
  }
}

history.use(
  '*',
  cors({
    origin: (origin) => resolveCorsOrigin(origin),
    credentials: true,
    allowMethods: ['GET', 'OPTIONS'],
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
  const [entries, total] = await Promise.all([
    logger.list(pageSize, (page - 1) * pageSize, user.id),
    logger.count(user.id),
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
