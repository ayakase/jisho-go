import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { Bindings } from '../types'
import {
  createSession,
  createStateToken,
  deleteSessionByToken,
  exchangeCodeForGoogleAccessToken,
  fetchGoogleUserInfo,
  getUserBySessionToken,
  parseAndVerifyOAuthState,
  signOAuthState,
  upsertGoogleUser,
} from '../services/auth.service'

const auth = new Hono<{ Bindings: Bindings }>()

const SESSION_COOKIE = 'kg_session'
const STATE_COOKIE = 'kg_oauth_state'

auth.use(
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
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
  }),
)

type AppContext = Context<{ Bindings: Bindings }>

function getWebOrigin(c: AppContext): string {
  if (c.env.AUTH_WEB_ORIGIN?.trim()) {
    return c.env.AUTH_WEB_ORIGIN.trim().replace(/\/$/, '')
  }

  const fromOrigin = c.req.header('Origin')
  if (fromOrigin) {
    return fromOrigin.replace(/\/$/, '')
  }

  const fromReferer = c.req.header('Referer')
  if (fromReferer) {
    try {
      const url = new URL(fromReferer)
      return `${url.protocol}//${url.host}`
    } catch {
      // fall through
    }
  }

  return 'http://localhost:4321'
}

function shouldUseSecureCookies(origin: string): boolean {
  try {
    return new URL(origin).protocol === 'https:'
  } catch {
    return true
  }
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function setAuthCookie(c: AppContext, token: string, expiresAt: Date, secure: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  })
}

function clearAuthCookie(c: AppContext, secure: boolean) {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure,
    sameSite: 'Lax',
    httpOnly: true,
  })
}

auth.get('/google/start', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  const redirectUri = c.env.GOOGLE_REDIRECT_URI
  const stateSecret = c.env.AUTH_COOKIE_SECRET

  if (!clientId || !redirectUri || !stateSecret) {
    return c.json(
      {
        error: 'Missing OAuth configuration',
      },
      500,
    )
  }

  const webOrigin = getWebOrigin(c)
  const secureCookies = shouldUseSecureCookies(webOrigin)
  const next = c.req.query('next') || '/account'
  const safeNext = next.startsWith('/') ? next : '/account'
  const stateToken = createStateToken()

  setCookie(c, STATE_COOKIE, stateToken, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 10,
  })

  const callbackState = await signOAuthState({
    token: stateToken,
    nextPath: safeNext,
    webOrigin,
    secret: stateSecret,
  })

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleUrl.searchParams.set('client_id', clientId)
  googleUrl.searchParams.set('redirect_uri', redirectUri)
  googleUrl.searchParams.set('response_type', 'code')
  googleUrl.searchParams.set('scope', 'openid email profile')
  googleUrl.searchParams.set('state', callbackState)
  googleUrl.searchParams.set('access_type', 'online')
  googleUrl.searchParams.set('prompt', 'select_account')

  return c.redirect(googleUrl.toString(), 302)
})

auth.get('/google/callback', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET
  const redirectUri = c.env.GOOGLE_REDIRECT_URI
  const stateSecret = c.env.AUTH_COOKIE_SECRET
  const db = c.env.DB

  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  if (!clientId || !clientSecret || !redirectUri || !stateSecret) {
    return c.json({ error: 'Missing OAuth configuration' }, 500)
  }

  const code = c.req.query('code')
  const state = c.req.query('state')

  if (!code || !state) {
    return c.json({ error: 'Missing code/state in callback' }, 400)
  }

  const parsedState = await parseAndVerifyOAuthState(state, stateSecret)
  const cookieState = getCookie(c, STATE_COOKIE)
  const skipStateCookieCheck = parseBooleanEnv(c.env.AUTH_SKIP_STATE_COOKIE_CHECK)

  if (!parsedState) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }

  if (!skipStateCookieCheck && (!cookieState || cookieState !== parsedState.token)) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }

  const secureCookies = shouldUseSecureCookies(parsedState.webOrigin || getWebOrigin(c))

  deleteCookie(c, STATE_COOKIE, {
    path: '/',
    secure: secureCookies,
    sameSite: 'Lax',
    httpOnly: true,
  })

  const webOrigin = parsedState.webOrigin || getWebOrigin(c)
  const next = parsedState.nextPath || '/account'

  try {
    const token = await exchangeCodeForGoogleAccessToken({
      code,
      clientId,
      clientSecret,
      redirectUri,
    })

    const profile = await fetchGoogleUserInfo(token.access_token)
    const user = await upsertGoogleUser(db, profile)
    const session = await createSession(db, user.id)

    setAuthCookie(c, session.token, session.expiresAt, secureCookies)

    const redirectTarget = `${webOrigin}${next.startsWith('/') ? next : '/account'}`
    return c.redirect(redirectTarget, 302)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'OAuth callback failed'
    const redirectTarget = `${webOrigin}/login?error=${encodeURIComponent(msg)}`
    return c.redirect(redirectTarget, 302)
  }
})

auth.get('/me', async (c) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const sessionToken = getCookie(c, SESSION_COOKIE)
  if (!sessionToken) {
    if (c.req.query('debug') === '1') {
      return c.json({
        user: null,
        debug: {
          hasSessionCookie: false,
          cookieHeaderPresent: !!c.req.header('Cookie'),
          origin: c.req.header('Origin') ?? null,
          referer: c.req.header('Referer') ?? null,
        },
      })
    }
    return c.json({ user: null })
  }

  const user = await getUserBySessionToken(db, sessionToken)
  if (!user) {
    clearAuthCookie(c, shouldUseSecureCookies(getWebOrigin(c)))
    if (c.req.query('debug') === '1') {
      return c.json({
        user: null,
        debug: {
          hasSessionCookie: true,
          cookieHeaderPresent: !!c.req.header('Cookie'),
          sessionLookup: 'not_found_or_expired',
        },
      })
    }
    return c.json({ user: null })
  }

  if (c.req.query('debug') === '1') {
    return c.json({
      user,
      debug: {
        hasSessionCookie: true,
        cookieHeaderPresent: !!c.req.header('Cookie'),
        sessionLookup: 'ok',
      },
    })
  }

  return c.json({ user })
})

auth.post('/logout', async (c) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const sessionToken = getCookie(c, SESSION_COOKIE)
  if (sessionToken) {
    await deleteSessionByToken(db, sessionToken)
  }

  clearAuthCookie(c, shouldUseSecureCookies(getWebOrigin(c)))
  return c.json({ ok: true })
})

export default auth
