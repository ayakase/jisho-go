import { getUserByExtensionToken, getUserBySessionToken, type SessionUser } from '../services/auth.service'

const EXTENSION_BEARER_PREFIX = 'Bearer '

export function getAuthorizationBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith(EXTENSION_BEARER_PREFIX)) {
    return null
  }

  const token = authHeader.slice(EXTENSION_BEARER_PREFIX.length).trim()
  return token || null
}

export async function getAuthenticatedUser(
  db: D1Database,
  params: {
    sessionToken?: string | null
    authorizationHeader?: string
  },
): Promise<SessionUser | null> {
  if (params.sessionToken) {
    const cookieUser = await getUserBySessionToken(db, params.sessionToken)
    if (cookieUser) {
      return cookieUser
    }
  }

  const bearerToken = getAuthorizationBearerToken(params.authorizationHeader)
  if (!bearerToken) {
    return null
  }

  return getUserByExtensionToken(db, bearerToken)
}
