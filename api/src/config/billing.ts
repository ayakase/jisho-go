import { Bindings } from '../types'

// Giá mặc định dùng khi local dev hoặc khi chưa cấu hình biến môi trường.
// Production nên đặt các giá trị này bằng Worker vars để có thể đổi giá mà không sửa code.
export const BILLING_CONFIG = {
  // 1 USD chi phí OpenRouter được quy đổi thành bao nhiêu VND.
  usdToVnd: 26_000,
  // Hệ số lợi nhuận: 3 nghĩa là phí người dùng trả = chi phí provider x 3.
  markupMultiplier: 3,
  // Số dư tối thiểu trước khi gửi một request AI. Đây là hàng rào tránh gọi AI khi ví gần cạn.
  minimumAiBalanceVnd: 100,
} as const

export type BillingRuntimeConfig = {
  usdToVnd: number
  markupMultiplier: number
  minimumAiBalanceVnd: number
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getBillingConfig(env: Bindings): BillingRuntimeConfig {
  return {
    usdToVnd: positiveInteger(env.OPENROUTER_USD_TO_VND, BILLING_CONFIG.usdToVnd),
    markupMultiplier: positiveInteger(env.OPENROUTER_MARKUP_MULTIPLIER, BILLING_CONFIG.markupMultiplier),
    minimumAiBalanceVnd: positiveInteger(env.AI_MINIMUM_BALANCE_VND, BILLING_CONFIG.minimumAiBalanceVnd),
  }
}

export function calculateAiChargeVnd(providerCostUsd: string, config: BillingRuntimeConfig): number | null {
  const providerCost = Number(providerCostUsd)
  if (!Number.isFinite(providerCost) || providerCost < 0) return null

  const chargeVnd = Math.ceil(providerCost * config.usdToVnd * config.markupMultiplier)
  return Number.isSafeInteger(chargeVnd) && chargeVnd >= 0 ? chargeVnd : null
}
