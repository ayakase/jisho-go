import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { RequestLogService } from '../services/request-log.service'
import { Bindings } from '../types'
import { getUserBySessionToken } from '../services/auth.service'

const history = new Hono<{ Bindings: Bindings }>()

history.use(
  '*',
  cors({
    origin: (origin, c) => {
      const configuredOrigin = c.env.AUTH_WEB_ORIGIN?.trim()
      if (!configuredOrigin) {
        return origin || '*'
      }
      return origin === configuredOrigin ? origin : configuredOrigin
    },
    credentials: true,
    allowMethods: ['GET', 'OPTIONS'],
  }),
)

history.use('*', async (c, next) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const sessionToken = getCookie(c, 'kg_session')
  if (!sessionToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const user = await getUserBySessionToken(db, sessionToken)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

history.get('/', async (c) => {
  if (!c.env.DB) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const limitParam = c.req.query('limit')
  const limit = limitParam ? Number(limitParam) : 50
  const logger = new RequestLogService(c.env.DB)
  const entries = await logger.list(limit)

  return c.json({
    items: entries,
    count: entries.length,
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
  const entry = await logger.getById(id)
  if (!entry) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(entry)
})

export default history
