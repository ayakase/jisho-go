import { inArray } from 'drizzle-orm'
import { APP_CONFIG } from '../config/app'
import { getDb } from '../db'
import { appConfig } from '../db/schema'

export type AiBillingConfig = { model: string; usdToVnd: number; markupMultiplier: number; minimumBalanceVnd: number; minimumChargeVnd: number }
export type SePayConfig = { qrCodeUrl: string }
export type RuntimeConfig = { aiBilling: AiBillingConfig; sepay: SePayConfig }
const CACHE_TTL_MS = 60_000
let cache: { value: RuntimeConfig; expiresAt: number } | null = null
const defaults = (): RuntimeConfig => ({ aiBilling: { ...APP_CONFIG.openRouter }, sepay: { ...APP_CONFIG.sepay } })
const positiveInt = (value: unknown, fallback: number, min: number, max: number) => { const numeric = Number(value); return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max ? numeric : fallback }
const stringValue = (value: unknown, fallback: string, maxLength: number, pattern?: RegExp) => { if (typeof value !== 'string') return fallback; const trimmed = value.trim(); return trimmed.length > 0 && trimmed.length <= maxLength && (!pattern || pattern.test(trimmed)) ? trimmed : fallback }
export function validateAiBillingConfig(value: unknown): AiBillingConfig | null { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; const raw = value as Record<string, unknown>; const model = stringValue(raw.model, '', 160, /^[a-z0-9][a-z0-9._/-]*$/i); const usdToVnd = positiveInt(raw.usdToVnd, 0, 1_000, 100_000); const markupMultiplier = positiveInt(raw.markupMultiplier, 0, 1, 100); const minimumBalanceVnd = positiveInt(raw.minimumBalanceVnd, -1, 0, 10_000_000); const minimumChargeVnd = positiveInt(raw.minimumChargeVnd, -1, 0, 1_000_000); return !model || !usdToVnd || !markupMultiplier || minimumBalanceVnd < 0 || minimumChargeVnd < 0 ? null : { model, usdToVnd, markupMultiplier, minimumBalanceVnd, minimumChargeVnd } }
export function validateSePayConfig(value: unknown): SePayConfig | null { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; const qrCodeUrl = stringValue((value as Record<string, unknown>).qrCodeUrl, '', 2_000); try { const url = new URL(qrCodeUrl); return url.protocol === 'https:' && url.hostname ? { qrCodeUrl } : null } catch { return null } }
export function validateConfigValue(key: string, value: unknown): RuntimeConfig[keyof RuntimeConfig] | null { return key === 'ai_billing' ? validateAiBillingConfig(value) : key === 'sepay' ? validateSePayConfig(value) : null }
export const invalidateRuntimeConfigCache = () => { cache = null }
export async function getRuntimeConfig(binding: D1Database): Promise<RuntimeConfig> { if (cache && cache.expiresAt > Date.now()) return cache.value; const config = defaults(); try { const rows = await getDb(binding).select({ key: appConfig.key, valueJson: appConfig.valueJson }).from(appConfig).where(inArray(appConfig.key, ['ai_billing', 'sepay'])); for (const row of rows) { let parsed: unknown; try { parsed = JSON.parse(row.valueJson) } catch { continue }; if (row.key === 'ai_billing') { const value = validateAiBillingConfig(parsed); if (value) config.aiBilling = value }; if (row.key === 'sepay') { const value = validateSePayConfig(parsed); if (value) config.sepay = value } } } catch {} cache = { value: config, expiresAt: Date.now() + CACHE_TTL_MS }; return config }
