import { storage } from "#imports";

export type ExtensionAuthUser = {
  id: number;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  email_verified: boolean;
  created_at: string;
};

export type ExtensionAuthSession = {
  accessToken: string;
  expiresAt: string;
  user: ExtensionAuthUser;
};

const SESSION_KEY = "local:authSession";
const API_BASE = (import.meta.env.WXT_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8787") as string;

export function getApiBase(): string {
  return API_BASE;
}

export async function getStoredSession(): Promise<ExtensionAuthSession | null> {
  const session = await storage.getItem<ExtensionAuthSession>(SESSION_KEY);
  if (!session || typeof session !== "object") {
    return null;
  }
  return session;
}

export async function setStoredSession(session: ExtensionAuthSession): Promise<void> {
  await storage.setItem(SESSION_KEY, session);
}

export async function clearStoredSession(): Promise<void> {
  await storage.removeItem(SESSION_KEY);
}

export async function fetchExtensionMe(token: string): Promise<ExtensionAuthUser | null> {
  const res = await fetch(`${API_BASE}/auth/ext/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Auth check failed: ${res.status}`);
  }

  const data = (await res.json()) as { user?: ExtensionAuthUser | null };
  return data.user ?? null;
}

export async function logoutExtensionSession(token: string): Promise<void> {
  await fetch(`${API_BASE}/auth/ext/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
