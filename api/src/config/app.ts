// Defaults for non-secret Worker settings. Admin overrides are stored in D1 app_config.
// Credentials stay in Worker secrets/.dev.vars.
export type OpenRouterBillingConfig = {
  model: string
  usdToVnd: number
  markupMultiplier: number
  minimumBalanceVnd: number
  minimumChargeVnd: number
}

export type SignupQuotaConfig = { amountVnd: number }

export const APP_CONFIG = {
  openRouter: {
    // Current model. Other candidates: 'openai/gpt-5-mini' and 'openai/gpt-5-nano'.
    model: 'google/gemini-2.5-flash-lite',
    // 1 USD of OpenRouter cost is converted to this many VND.
    usdToVnd: 26_000,
    // User charge = provider cost x this multiplier.
    markupMultiplier: 3,
    // Reject AI calls when the wallet is below this balance.
    minimumBalanceVnd: 100,
    // Floor applied to every successful AI request, even when the calculated amount is lower.
    minimumChargeVnd: 1,
  } satisfies OpenRouterBillingConfig,
  auth: {
    // Leave blank to use the requesting website origin. Set these to lock down CORS in production.
    websiteOrigin: '' as string,
    extensionOrigin: '' as string,
    // Leave blank to derive <Worker origin>/auth/google/callback.
    googleRedirectUri: '' as string,
    // Keep false outside narrowly scoped local OAuth debugging.
    skipStateCookieCheck: false,
  },
  sepay: {
    // Public VietQR base URL. The Worker adds the amount and user-specific transfer content.
    qrCodeUrl: 'https://vietqr.app/img?bank=BIDV&acc=96247OW8RC&template=compact&showinfo=true&holder=DANG%20THAI%20AN',
  },
  signupQuota: {
    // Credit granted once to each newly created account. Set to 0 to disable.
    amountVnd: 10_000,
  } satisfies SignupQuotaConfig,
} as const

export function isExtensionOrigin(origin: string | undefined): boolean {
  return !!origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))
}

export function resolveCorsOrigin(origin: string | undefined): string {
  const { websiteOrigin, extensionOrigin } = APP_CONFIG.auth
  if (!websiteOrigin && !extensionOrigin) return origin || '*'
  if (isExtensionOrigin(origin)) return origin || '*'
  if (origin && (origin === websiteOrigin || origin === extensionOrigin)) return origin
  return websiteOrigin || extensionOrigin || origin || '*'
}

export function resolveGoogleRedirectUri(requestOrigin: string | null): string | null {
  if (APP_CONFIG.auth.googleRedirectUri) return APP_CONFIG.auth.googleRedirectUri
  return requestOrigin ? `${requestOrigin}/auth/google/callback` : null
}

export function resolveWebOrigin(origin: string | undefined, referer: string | undefined): string {
  if (APP_CONFIG.auth.websiteOrigin) return APP_CONFIG.auth.websiteOrigin.replace(/\/$/, '')
  if (origin && !isExtensionOrigin(origin)) return origin.replace(/\/$/, '')
  if (referer) {
    try {
      const url = new URL(referer)
      if (!isExtensionOrigin(url.origin)) return url.origin
    } catch {
      // Fall through to the local development URL.
    }
  }
  return 'http://localhost:4321'
}

export function calculateAiChargeVnd(
  providerCostUsd: string,
  config: Pick<OpenRouterBillingConfig, 'usdToVnd' | 'markupMultiplier' | 'minimumChargeVnd'> = APP_CONFIG.openRouter,
): number | null {
  const providerCost = Number(providerCostUsd)
  if (!Number.isFinite(providerCost) || providerCost < 0) return null

  const { usdToVnd, markupMultiplier, minimumChargeVnd } = config
  const calculated = Math.ceil(providerCost * usdToVnd * markupMultiplier)
  const chargeVnd = Math.max(minimumChargeVnd, calculated)
  return Number.isSafeInteger(chargeVnd) && chargeVnd >= 0 ? chargeVnd : null
}
