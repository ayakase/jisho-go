import { and, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { extensionSessions, extensionWebLoginTokens, userSessions, users } from '../db/schema'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const EXTENSION_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const EXTENSION_WEB_LOGIN_TOKEN_TTL_MS = 1000 * 60

type GoogleTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  id_token?: string
  scope?: string
  refresh_token?: string
}

type GoogleUserInfo = {
  sub: string
  email: string
  email_verified?: boolean
  name?: string
  picture?: string
}

type AuthUser = {
  id: number
  email: string
  display_name: string | null
  avatar_url: string | null
  email_verified: boolean
  created_at: string
}

export type SessionUser = AuthUser

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const value of bytes) {
    hex += value.toString(16).padStart(2, '0')
  }
  return hex
}

function normalizeExpiresAt(value: string): number {
  return new Date(value).getTime()
}

function nowPlusMsAsIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

function fromIsoToCookieDate(iso: string): Date {
  return new Date(iso)
}

export function createStateToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)))
}

export async function signOAuthState(params: {
  token: string
  nextPath: string
  webOrigin: string
  secret: string
}): Promise<string> {
  const payload = `${params.token}:${encodeURIComponent(params.nextPath)}:${encodeURIComponent(params.webOrigin)}`
  const signature = await sha256Hex(`${params.secret}:${payload}`)
  return `${payload}:${signature}`
}

export async function parseAndVerifyOAuthState(
  state: string | undefined,
  secret: string,
): Promise<{ token: string; nextPath: string; webOrigin: string } | null> {
  if (!state) {
    return null
  }
  const parts = state.split(':')
  if (parts.length < 4) {
    return null
  }

  const token = parts[0]
  const encodedNext = parts[1]
  const encodedOrigin = parts[2]
  const signature = parts.slice(3).join(':')
  const payload = `${token}:${encodedNext}:${encodedOrigin}`
  const expected = await sha256Hex(`${secret}:${payload}`)

  if (!token || signature !== expected) {
    return null
  }

  try {
    return {
      token,
      nextPath: decodeURIComponent(encodedNext),
      webOrigin: decodeURIComponent(encodedOrigin),
    }
  } catch {
    return null
  }
}

export async function exchangeCodeForGoogleAccessToken(params: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const raw = await res.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }

  if (!res.ok || !data?.access_token) {
    const detail = typeof data?.error_description === 'string' ? data.error_description : raw || 'Unknown error'
    throw new Error(`Google token exchange failed: ${detail}`)
  }

  return data as GoogleTokenResponse
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  const raw = await res.text()
  let data: any = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }

  if (!res.ok || !data?.sub || !data?.email) {
    const detail = raw || 'Unknown error'
    throw new Error(`Google userinfo failed: ${detail}`)
  }

  return data as GoogleUserInfo
}

function toSessionUser(row: typeof users.$inferSelect): SessionUser { return { id: row.id, email: row.email, display_name: row.displayName, avatar_url: row.avatarUrl, email_verified: row.emailVerified, created_at: row.createdAt } }

export async function upsertGoogleUser(binding: D1Database, profile: GoogleUserInfo): Promise<SessionUser> {
  const db = getDb(binding)
  await db.insert(users).values({ email: profile.email, googleSub: profile.sub, displayName: profile.name ?? null, avatarUrl: profile.picture ?? null, emailVerified: !!profile.email_verified }).onConflictDoUpdate({ target: users.email, set: { googleSub: profile.sub, displayName: profile.name ?? null, avatarUrl: profile.picture ?? null, emailVerified: !!profile.email_verified, updatedAt: new Date().toISOString() } })
  const row = (await db.select().from(users).where(eq(users.email, profile.email)).limit(1))[0]
  if (!row) {
    throw new Error('Failed to load user after upsert')
  }

  return toSessionUser(row)
}

export async function createSession(binding: D1Database, userId: number): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await sha256Hex(rawToken)
  const expiresIso = nowPlusMsAsIso(SESSION_TTL_MS)

  await getDb(binding).insert(userSessions).values({ sessionTokenHash: tokenHash, userId, expiresAt: expiresIso })

  return {
    token: rawToken,
    expiresAt: fromIsoToCookieDate(expiresIso),
  }
}

export async function deleteSessionByToken(binding: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token)
  await getDb(binding).delete(userSessions).where(eq(userSessions.sessionTokenHash, tokenHash))
}

export async function getUserBySessionToken(binding: D1Database, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token)

  const db = getDb(binding)
  const row = (await db.select({ user: users, expiresAt: userSessions.expiresAt }).from(userSessions).innerJoin(users, eq(users.id, userSessions.userId)).where(eq(userSessions.sessionTokenHash, tokenHash)).limit(1))[0]
  if (!row) {
    return null
  }

  if (normalizeExpiresAt(row.expiresAt) <= Date.now()) {
    await db.delete(userSessions).where(eq(userSessions.sessionTokenHash, tokenHash))
    return null
  }

  return toSessionUser(row.user)
}

export async function createExtensionSession(
  binding: D1Database,
  userId: number,
  deviceLabel: string | null,
): Promise<{ token: string; expiresAt: string }> {
  const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await sha256Hex(rawToken)
  const expiresIso = nowPlusMsAsIso(EXTENSION_SESSION_TTL_MS)

  await getDb(binding).insert(extensionSessions).values({ tokenHash, userId, expiresAt: expiresIso, deviceLabel })

  return {
    token: rawToken,
    expiresAt: expiresIso,
  }
}

export async function deleteExtensionSessionByToken(binding: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token)
  await getDb(binding).delete(extensionSessions).where(eq(extensionSessions.tokenHash, tokenHash))
}

export async function getUserByExtensionToken(binding: D1Database, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token)
  const db = getDb(binding)
  const row = (await db.select({ user: users, expiresAt: extensionSessions.expiresAt }).from(extensionSessions).innerJoin(users, eq(users.id, extensionSessions.userId)).where(eq(extensionSessions.tokenHash, tokenHash)).limit(1))[0]
  if (!row) {
    return null
  }

  if (normalizeExpiresAt(row.expiresAt) <= Date.now()) {
    await db.delete(extensionSessions).where(eq(extensionSessions.tokenHash, tokenHash))
    return null
  }

  return toSessionUser(row.user)
}

export async function createExtensionWebLoginToken(
  binding: D1Database,
  userId: number,
): Promise<{ token: string; expiresAt: string }> {
  const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await sha256Hex(rawToken)
  const expiresIso = nowPlusMsAsIso(EXTENSION_WEB_LOGIN_TOKEN_TTL_MS)

  await getDb(binding).insert(extensionWebLoginTokens).values({ tokenHash, userId, expiresAt: expiresIso })

  return {
    token: rawToken,
    expiresAt: expiresIso,
  }
}

export async function consumeExtensionWebLoginToken(binding: D1Database, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token)
  const db = getDb(binding)
  const row = (await db.select({ user: users, expiresAt: extensionWebLoginTokens.expiresAt, usedAt: extensionWebLoginTokens.usedAt }).from(extensionWebLoginTokens).innerJoin(users, eq(users.id, extensionWebLoginTokens.userId)).where(eq(extensionWebLoginTokens.tokenHash, tokenHash)).limit(1))[0]
  if (!row) {
    return null
  }

  if (row.usedAt || normalizeExpiresAt(row.expiresAt) <= Date.now()) {
    await db.delete(extensionWebLoginTokens).where(eq(extensionWebLoginTokens.tokenHash, tokenHash))
    return null
  }

  await db.delete(extensionWebLoginTokens).where(eq(extensionWebLoginTokens.tokenHash, tokenHash))

  return toSessionUser(row.user)
}
