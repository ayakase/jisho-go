import { D1DatabaseCompat } from '../types'

export type AdminRole = 'owner' | 'admin' | 'support' | 'viewer'

const ADMIN_ROLES = new Set<AdminRole>(['owner', 'admin', 'support', 'viewer'])

export async function getUserRoles(db: D1DatabaseCompat, userId: number): Promise<AdminRole[]> {
  try {
    const result = await db
      .prepare('SELECT r.code FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.id')
      .bind(userId)
      .all<{ code: string }>()
    return (result.results ?? []).map((row) => row.code).filter((role): role is AdminRole => ADMIN_ROLES.has(role as AdminRole))
  } catch {
    return []
  }
}

export function hasAnyAdminRole(roles: AdminRole[]): boolean {
  return roles.length > 0
}

export function canManageWallet(roles: AdminRole[]): boolean {
  return roles.includes('owner') || roles.includes('admin')
}

export function canManageConfig(roles: AdminRole[]): boolean {
  return roles.includes('owner')
}

export async function writeAdminAuditLog(
  db: D1DatabaseCompat,
  actorUserId: number,
  action: string,
  targetType: string,
  targetId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await db
    .prepare('INSERT INTO admin_audit_logs (actor_user_id, action, target_type, target_id, detail_json) VALUES (?, ?, ?, ?, ?)')
    .bind(actorUserId, action, targetType, targetId, JSON.stringify(detail))
    .run()
}
