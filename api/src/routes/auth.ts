import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { APP_CONFIG, isExtensionOrigin, resolveCorsOrigin, resolveGoogleRedirectUri, resolveWebOrigin } from '../config/app'
import { Bindings } from '../types'
import {
  createSession,
  createExtensionSession,
  createExtensionWebLoginToken,
  createStateToken,
  consumeExtensionWebLoginToken,
  deleteExtensionSessionByToken,
  deleteSessionByToken,
  exchangeCodeForGoogleAccessToken,
  fetchGoogleUserInfo,
  getUserByExtensionToken,
  getUserBySessionToken,
  parseAndVerifyOAuthState,
  signOAuthState,
  upsertGoogleUser,
} from '../services/auth.service'
import { getAuthorizationBearerToken } from '../utils/request-auth'

const auth = new Hono<{ Bindings: Bindings }>()

const SESSION_COOKIE = 'kg_session'
const STATE_COOKIE = 'kg_oauth_state'

auth.use(
  '*',
  cors({
    origin: (origin) => resolveCorsOrigin(origin),
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

type AppContext = Context<{ Bindings: Bindings }>
type CookieSameSite = 'Lax' | 'Strict' | 'None'

function getWebOrigin(c: AppContext): string {
  return resolveWebOrigin(c.req.header('Origin'), c.req.header('Referer'))
}

function getRequestOrigin(c: AppContext): string | null {
  try {
    const url = new URL(c.req.url)
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

function shouldUseSecureCookies(origin: string | null): boolean {
  if (!origin) return true
  try {
    return new URL(origin).protocol === 'https:'
  } catch {
    return true
  }
}

function getSessionCookieSameSite(webOrigin: string, requestOrigin: string | null): CookieSameSite {
  if (!requestOrigin) {
    return 'Lax'
  }

  try {
    if (new URL(webOrigin).origin === new URL(requestOrigin).origin) {
      return 'Lax'
    }
  } catch {
    return 'Lax'
  }

  return 'None'
}

function setAuthCookie(c: AppContext, token: string, expiresAt: Date, secure: boolean, sameSite: CookieSameSite) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    expires: expiresAt,
  })
}

function clearAuthCookie(c: AppContext, secure: boolean, sameSite: CookieSameSite) {
  deleteCookie(c, SESSION_COOKIE, {
    path: '/',
    secure,
    sameSite,
    httpOnly: true,
  })
}

auth.get('/google/start', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  const redirectUri = resolveGoogleRedirectUri(getRequestOrigin(c))
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
  const secureCookies = shouldUseSecureCookies(getRequestOrigin(c))
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
  const redirectUri = resolveGoogleRedirectUri(getRequestOrigin(c))
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
  const skipStateCookieCheck = APP_CONFIG.auth.skipStateCookieCheck

  if (!parsedState) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }

  if (!skipStateCookieCheck && (!cookieState || cookieState !== parsedState.token)) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }

  const requestOrigin = getRequestOrigin(c)
  const secureCookies = shouldUseSecureCookies(requestOrigin)

  deleteCookie(c, STATE_COOKIE, {
    path: '/',
    secure: secureCookies,
    sameSite: 'Lax',
    httpOnly: true,
  })

  const webOrigin = parsedState.webOrigin || getWebOrigin(c)
  const sessionCookieSameSite = getSessionCookieSameSite(webOrigin, requestOrigin)
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

    setAuthCookie(c, session.token, session.expiresAt, secureCookies, sessionCookieSameSite)

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
    const webOrigin = getWebOrigin(c)
    clearAuthCookie(
      c,
      shouldUseSecureCookies(getRequestOrigin(c)),
      getSessionCookieSameSite(webOrigin, getRequestOrigin(c)),
    )
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

  const webOrigin = getWebOrigin(c)
  clearAuthCookie(
    c,
    shouldUseSecureCookies(getRequestOrigin(c)),
    getSessionCookieSameSite(webOrigin, getRequestOrigin(c)),
  )
  return c.json({ ok: true })
})

auth.get('/ext/start', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  const stateSecret = c.env.AUTH_COOKIE_SECRET

  if (!clientId || !stateSecret) {
    return c.json({ error: 'Missing OAuth configuration' }, 500)
  }

  const redirectUri = c.req.query('redirect_uri')?.trim()
  const deviceLabel = c.req.query('device_label')?.trim() || 'Browser Extension'
  if (!redirectUri) {
    return c.json({ error: 'Missing redirect_uri' }, 400)
  }

  const stateToken = createStateToken()
  const callbackState = await signOAuthState({
    token: stateToken,
    nextPath: '/auth/ext/exchange',
    webOrigin: redirectUri,
    secret: stateSecret,
  })

  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleUrl.searchParams.set('client_id', clientId)
  googleUrl.searchParams.set('redirect_uri', redirectUri)
  googleUrl.searchParams.set('response_type', 'code')
  googleUrl.searchParams.set('scope', 'openid email profile')
  googleUrl.searchParams.set('state', `${callbackState}:${encodeURIComponent(deviceLabel)}`)
  googleUrl.searchParams.set('access_type', 'online')
  googleUrl.searchParams.set('prompt', 'select_account')

  return c.json({
    authUrl: googleUrl.toString(),
  })
})

auth.post('/ext/exchange', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET
  const stateSecret = c.env.AUTH_COOKIE_SECRET
  const db = c.env.DB

  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  if (!clientId || !clientSecret || !stateSecret) {
    return c.json({ error: 'Missing OAuth configuration' }, 500)
  }

  const body = await c.req.json<{
    code?: string
    state?: string
    redirectUri?: string
    deviceLabel?: string
  }>()
  const code = body.code?.trim()
  const state = body.state?.trim()
  const redirectUri = body.redirectUri?.trim()
  const deviceLabel = body.deviceLabel?.trim() || 'Browser Extension'

  if (!code || !state || !redirectUri) {
    return c.json({ error: 'Missing code/state/redirectUri' }, 400)
  }

  const stateParts = state.split(':')
  if (stateParts.length < 5) {
    return c.json({ error: 'Invalid extension OAuth state' }, 400)
  }

  const signedState = stateParts.slice(0, 4).join(':')
  const stateDeviceLabel = decodeURIComponent(stateParts.slice(4).join(':'))
  const parsedState = await parseAndVerifyOAuthState(signedState, stateSecret)

  if (!parsedState || parsedState.nextPath !== '/auth/ext/exchange' || parsedState.webOrigin !== redirectUri) {
    return c.json({ error: 'Invalid extension OAuth state' }, 400)
  }

  try {
    const token = await exchangeCodeForGoogleAccessToken({
      code,
      clientId,
      clientSecret,
      redirectUri,
    })

    const profile = await fetchGoogleUserInfo(token.access_token)
    const user = await upsertGoogleUser(db, profile)
    const extensionSession = await createExtensionSession(
      db,
      user.id,
      stateDeviceLabel || deviceLabel,
    )

    return c.json({
      accessToken: extensionSession.token,
      expiresAt: extensionSession.expiresAt,
      user,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extension OAuth callback failed'
    return c.json({ error: message }, 400)
  }
})

auth.get('/ext/me', async (c) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const token = getAuthorizationBearerToken(c.req.header('Authorization'))
  if (!token) {
    return c.json({ user: null }, 401)
  }

  const user = await getUserByExtensionToken(db, token)
  if (!user) {
    return c.json({ user: null }, 401)
  }

  return c.json({ user })
})

auth.post('/ext/web-session', async (c) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const token = getAuthorizationBearerToken(c.req.header('Authorization'))
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const user = await getUserByExtensionToken(db, token)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const webLogin = await createExtensionWebLoginToken(db, user.id)
  const webOrigin = getWebOrigin(c)
  const loginUrl = `${webOrigin}/auth/extension-login?token=${encodeURIComponent(webLogin.token)}`

  return c.json({
    loginUrl,
    expiresAt: webLogin.expiresAt,
  })
})

auth.post('/ext/web-session/consume', async (c) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const body = await c.req.json<{ token?: string }>()
  const token = body.token?.trim()
  if (!token) {
    return c.json({ error: 'Missing token' }, 400)
  }

  const user = await consumeExtensionWebLoginToken(db, token)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const requestOrigin = getRequestOrigin(c)
  const webOrigin = getWebOrigin(c)
  const secureCookies = shouldUseSecureCookies(requestOrigin)
  const sessionCookieSameSite = getSessionCookieSameSite(webOrigin, requestOrigin)
  const session = await createSession(db, user.id)

  setAuthCookie(c, session.token, session.expiresAt, secureCookies, sessionCookieSameSite)

  return c.json({ ok: true })
})

auth.post('/ext/logout', async (c) => {
  const db = c.env.DB
  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const token = getAuthorizationBearerToken(c.req.header('Authorization'))
  if (token) {
    await deleteExtensionSessionByToken(db, token)
  }

  return c.json({ ok: true })
})

export default auth
