import { APP_CONFIG } from '../config/app'
import { D1DatabaseCompat } from '../types'

export type AiBillingConfig = {
  model: string
  usdToVnd: number
  markupMultiplier: number
  minimumBalanceVnd: number
  minimumChargeVnd: number
}

export type SePayConfig = {
  qrCodeUrl: string
}

export type RuntimeConfig = {
  aiBilling: AiBillingConfig
  sepay: SePayConfig
}

const CACHE_TTL_MS = 60_000
let cache: { value: RuntimeConfig; expiresAt: number } | null = null

function defaults(): RuntimeConfig {
  return {
    aiBilling: { ...APP_CONFIG.openRouter },
    sepay: { ...APP_CONFIG.sepay },
  }
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max ? numeric : fallback
}

function stringValue(value: unknown, fallback: string, maxLength: number, pattern?: RegExp): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength && (!pattern || pattern.test(trimmed)) ? trimmed : fallback
}

export function validateAiBillingConfig(value: unknown): AiBillingConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const model = stringValue(raw.model, '', 160, /^[a-z0-9][a-z0-9._/-]*$/i)
  const usdToVnd = positiveInt(raw.usdToVnd, 0, 1_000, 100_000)
  const markupMultiplier = positiveInt(raw.markupMultiplier, 0, 1, 100)
  const minimumBalanceVnd = positiveInt(raw.minimumBalanceVnd, -1, 0, 10_000_000)
  const minimumChargeVnd = positiveInt(raw.minimumChargeVnd, -1, 0, 1_000_000)
  if (!model || !usdToVnd || !markupMultiplier || minimumBalanceVnd < 0 || minimumChargeVnd < 0) return null
  return { model, usdToVnd, markupMultiplier, minimumBalanceVnd, minimumChargeVnd }
}

export function validateSePayConfig(value: unknown): SePayConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const qrCodeUrl = stringValue(raw.qrCodeUrl, '', 2_000)
  try {
    const url = new URL(qrCodeUrl)
    if (url.protocol !== 'https:' || !url.hostname) return null
  } catch {
    return null
  }
  return { qrCodeUrl }
}

export function validateConfigValue(key: string, value: unknown): RuntimeConfig[keyof RuntimeConfig] | null {
  if (key === 'ai_billing') return validateAiBillingConfig(value)
  if (key === 'sepay') return validateSePayConfig(value)
  return null
}

export function invalidateRuntimeConfigCache(): void {
  cache = null
}

export async function getRuntimeConfig(db: D1DatabaseCompat): Promise<RuntimeConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value

  const config = defaults()
  try {
    const result = await db.prepare("SELECT key, value_json FROM app_config WHERE key IN ('ai_billing', 'sepay')").all<{ key: string; value_json: string }>()
    for (const row of result.results ?? []) {
      let parsed: unknown
      try { parsed = JSON.parse(row.value_json) } catch { continue }
      if (row.key === 'ai_billing') {
        const value = validateAiBillingConfig(parsed)
        if (value) config.aiBilling = value
      }
      if (row.key === 'sepay') {
        const value = validateSePayConfig(parsed)
        if (value) config.sepay = value
      }
    }
  } catch {
    // Config migration may not have been applied yet. Defaults keep the Worker available.
  }

  cache = { value: config, expiresAt: Date.now() + CACHE_TTL_MS }
  return config
}
