// This is the single source of truth for non-secret Worker settings.
// Change a value here and redeploy the Worker. Credentials stay in Worker secrets/.dev.vars.
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
  },
  auth: {
    // Leave blank to use the requesting website origin. Set these to lock down CORS in production.
    websiteOrigin: '',
    extensionOrigin: '',
    // Leave blank to derive <Worker origin>/auth/google/callback.
    googleRedirectUri: '',
    // Keep false outside narrowly scoped local OAuth debugging.
    skipStateCookieCheck: false,
  },
  payos: {
    // Leave blank to return users to <request website origin>/account after payment.
    returnUrl: '',
    cancelUrl: '',
  },
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

export function resolvePayOSUrls(requestOrigin: string | undefined): { returnUrl: string; cancelUrl: string } {
  const fallback = `${resolveWebOrigin(requestOrigin, undefined)}/account`
  return {
    returnUrl: APP_CONFIG.payos.returnUrl || fallback,
    cancelUrl: APP_CONFIG.payos.cancelUrl || APP_CONFIG.payos.returnUrl || fallback,
  }
}

export function calculateAiChargeVnd(providerCostUsd: string): number | null {
  const providerCost = Number(providerCostUsd)
  if (!Number.isFinite(providerCost) || providerCost < 0) return null

  const { usdToVnd, markupMultiplier, minimumChargeVnd } = APP_CONFIG.openRouter
  const calculated = Math.ceil(providerCost * usdToVnd * markupMultiplier)
  const chargeVnd = Math.max(minimumChargeVnd, calculated)
  return Number.isSafeInteger(chargeVnd) && chargeVnd >= 0 ? chargeVnd : null
}
