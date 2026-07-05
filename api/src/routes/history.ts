import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { type SessionUser } from '../services/auth.service'
import { RequestLogService } from '../services/request-log.service'
import { Bindings } from '../types'
import { getAuthenticatedUser } from '../utils/request-auth'

type HistoryEnv = {
  Bindings: Bindings
  Variables: {
    authUser: SessionUser
  }
}

const history = new Hono<HistoryEnv>()

function isExtensionOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  return origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')
}

history.use(
  '*',
  cors({
    origin: (origin, c) => {
      const configuredOrigin = c.env.AUTH_WEB_ORIGIN?.trim()
      const configuredExtensionOrigin = c.env.AUTH_EXTENSION_ORIGIN?.trim()
      if (!configuredOrigin && !configuredExtensionOrigin) {
        return origin || '*'
      }
      if (isExtensionOrigin(origin)) {
        return origin
      }
      if (origin && (origin === configuredOrigin || origin === configuredExtensionOrigin)) {
        return origin
      }
      return configuredOrigin || configuredExtensionOrigin || origin || '*'
    },
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

  const limitParam = c.req.query('limit')
  const limit = limitParam ? Number(limitParam) : 50
  const logger = new RequestLogService(c.env.DB)
  const user = c.get('authUser')
  const entries = await logger.list(limit, user.id)

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
  const user = c.get('authUser')
  const entry = await logger.getById(id, user.id)
  if (!entry) {
    return c.json({ error: 'Not found' }, 404)
  }

  return c.json(entry)
})

export default history
