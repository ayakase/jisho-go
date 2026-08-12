import { asc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { adminAuditLogs, roles, userRoles } from '../db/schema'

export type AdminRole = 'owner' | 'admin' | 'support' | 'viewer'
const adminRoles = new Set<AdminRole>(['owner', 'admin', 'support', 'viewer'])

export async function getUserRoles(binding: D1Database, userId: number): Promise<AdminRole[]> {
  try {
    const db = getDb(binding)
    const result = await db.select({ code: roles.code }).from(userRoles).innerJoin(roles, eq(userRoles.roleId, roles.id)).where(eq(userRoles.userId, userId)).orderBy(asc(roles.id))
    return result.map((row) => row.code).filter((role): role is AdminRole => adminRoles.has(role as AdminRole))
  } catch { return [] }
}
export const hasAnyAdminRole = (roles: AdminRole[]) => roles.length > 0
export const canManageWallet = (roles: AdminRole[]) => roles.includes('owner') || roles.includes('admin')
export const canManageConfig = (roles: AdminRole[]) => roles.includes('owner')

export async function writeAdminAuditLog(binding: D1Database, actorUserId: number, action: string, targetType: string, targetId: string | null, detail: Record<string, unknown>): Promise<void> {
  await getDb(binding).insert(adminAuditLogs).values({ actorUserId, action, targetType, targetId, detailJson: JSON.stringify(detail) })
}
