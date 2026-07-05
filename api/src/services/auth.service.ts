import { D1DatabaseCompat } from '../types'

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const EXTENSION_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30

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

export async function upsertGoogleUser(db: D1DatabaseCompat, profile: GoogleUserInfo): Promise<SessionUser> {
  await db
    .prepare(
      `INSERT INTO users (email, google_sub, display_name, avatar_url, email_verified)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         google_sub = excluded.google_sub,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         email_verified = excluded.email_verified,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      profile.email,
      profile.sub,
      profile.name ?? null,
      profile.picture ?? null,
      profile.email_verified ? 1 : 0,
    )
    .run()

  const result = await db
    .prepare(
      `SELECT id, email, display_name, avatar_url, email_verified, created_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
    )
    .bind(profile.email)
    .all<{
      id: number
      email: string
      display_name: string | null
      avatar_url: string | null
      email_verified: number
      created_at: string
    }>()

  const row = result.results?.[0]
  if (!row) {
    throw new Error('Failed to load user after upsert')
  }

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    email_verified: row.email_verified === 1,
    created_at: row.created_at,
  }
}

export async function createSession(db: D1DatabaseCompat, userId: number): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await sha256Hex(rawToken)
  const expiresIso = nowPlusMsAsIso(SESSION_TTL_MS)

  await db
    .prepare(
      `INSERT INTO user_sessions (session_token_hash, user_id, expires_at)
       VALUES (?, ?, ?)`,
    )
    .bind(tokenHash, userId, expiresIso)
    .run()

  return {
    token: rawToken,
    expiresAt: fromIsoToCookieDate(expiresIso),
  }
}

export async function deleteSessionByToken(db: D1DatabaseCompat, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token)
  await db.prepare('DELETE FROM user_sessions WHERE session_token_hash = ?').bind(tokenHash).run()
}

export async function getUserBySessionToken(db: D1DatabaseCompat, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token)

  const result = await db
    .prepare(
      `SELECT u.id, u.email, u.display_name, u.avatar_url, u.email_verified, u.created_at, s.expires_at
       FROM user_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.session_token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .all<{
      id: number
      email: string
      display_name: string | null
      avatar_url: string | null
      email_verified: number
      created_at: string
      expires_at: string
    }>()

  const row = result.results?.[0]
  if (!row) {
    return null
  }

  if (normalizeExpiresAt(row.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM user_sessions WHERE session_token_hash = ?').bind(tokenHash).run()
    return null
  }

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    email_verified: row.email_verified === 1,
    created_at: row.created_at,
  }
}

export async function createExtensionSession(
  db: D1DatabaseCompat,
  userId: number,
  deviceLabel: string | null,
): Promise<{ token: string; expiresAt: string }> {
  const rawToken = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await sha256Hex(rawToken)
  const expiresIso = nowPlusMsAsIso(EXTENSION_SESSION_TTL_MS)

  await db
    .prepare(
      `INSERT INTO extension_sessions (token_hash, user_id, expires_at, device_label)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(tokenHash, userId, expiresIso, deviceLabel)
    .run()

  return {
    token: rawToken,
    expiresAt: expiresIso,
  }
}

export async function deleteExtensionSessionByToken(db: D1DatabaseCompat, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token)
  await db.prepare('DELETE FROM extension_sessions WHERE token_hash = ?').bind(tokenHash).run()
}

export async function getUserByExtensionToken(db: D1DatabaseCompat, token: string): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token)
  const result = await db
    .prepare(
      `SELECT u.id, u.email, u.display_name, u.avatar_url, u.email_verified, u.created_at, s.expires_at
       FROM extension_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .all<{
      id: number
      email: string
      display_name: string | null
      avatar_url: string | null
      email_verified: number
      created_at: string
      expires_at: string
    }>()

  const row = result.results?.[0]
  if (!row) {
    return null
  }

  if (normalizeExpiresAt(row.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM extension_sessions WHERE token_hash = ?').bind(tokenHash).run()
    return null
  }

  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    email_verified: row.email_verified === 1,
    created_at: row.created_at,
  }
}
