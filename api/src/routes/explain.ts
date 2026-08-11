import { Hono } from 'hono'
import type { Context } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { APP_CONFIG, calculateAiChargeVnd } from '../config/app'
import { AIService, AIServiceError, OPENROUTER_MODEL } from '../services/ai.service'
import { RequestLogService } from '../services/request-log.service'
import { InsufficientBalanceError, WalletService } from '../services/wallet.service'
import { Bindings } from '../types'
import { getAuthenticatedUser } from '../utils/request-auth'

const explain = new Hono<{ Bindings: Bindings }>()
type ExplainContext = Context<{ Bindings: Bindings }>

explain.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
)

async function handleExplain(c: ExplainContext, query: string | undefined) {
  if (!query) {
    return c.json({ error: 'Missing ?q=...' }, 400)
  }

  const startedAt = Date.now()
  const clientIp = c.req.header('CF-Connecting-IP') ?? null
  const clientColo = c.req.header('CF-Ray')?.split('-')?.[1] ?? null
  const traceId = c.req.header('CF-Ray') ?? `local-${crypto.randomUUID()}`
  const queryPreview = query.length > 120 ? `${query.slice(0, 120)}...` : query
  const db = c.env.DB
  const logger = db ? new RequestLogService(db) : null
  const aiService = new AIService(c.env.OPENROUTER_API_KEY)
  const user = db
    ? await getAuthenticatedUser(db, {
        sessionToken: getCookie(c, 'kg_session'),
        authorizationHeader: c.req.header('Authorization'),
      })
    : null

  if (!user) {
    return c.json(
      {
        error: 'Unauthorized',
      },
      401,
    )
  }

  if (!db) {
    return c.json({ error: 'D1 binding "DB" is not configured' }, 500)
  }

  const wallet = new WalletService(db)
  const balance = await wallet.getBalance(user.id)
  if (balance.balanceVnd < APP_CONFIG.openRouter.minimumBalanceVnd) {
    return c.json({
      error: 'Wallet balance is too low',
      code: 'WALLET_LOW_BALANCE',
      balanceVnd: balance.balanceVnd,
      minimumBalanceVnd: APP_CONFIG.openRouter.minimumBalanceVnd,
    }, 402)
  }

  if (!logger) {
    console.error('[explain] OpenRouter request log skipped: D1 binding "DB" is missing', {
      traceId,
      queryLength: query.length,
      queryPreview,
      hasOpenRouterKey: !!c.env.OPENROUTER_API_KEY,
    })
  }

  try {
    const result = await aiService.explainJapanese(query)
    if (result.providerCostUsd == null) {
      throw new Error('Billing error: OpenRouter response is missing usage.cost')
    }

    const chargeVnd = calculateAiChargeVnd(result.providerCostUsd)
    if (chargeVnd == null) {
      throw new Error('Billing error: invalid OpenRouter usage.cost')
    }

    let requestId: number | null = null
    if (logger) {
      try {
        requestId = await logger.save({
          query,
          userId: user.id,
          model: result.model,
          success: true,
          statusCode: result.providerStatusCode,
          durationMs: Date.now() - startedAt,
          errorMessage: null,
          clientIp,
          clientColo,
          openRouterResponseJson: result.openRouterResponseJson,
          providerErrorBody: result.providerErrorBody,
          usagePromptTokens: result.usagePromptTokens,
          usageCompletionTokens: result.usageCompletionTokens,
          usageTotalTokens: result.usageTotalTokens,
          providerCostUsd: result.providerCostUsd,
          walletLedgerEntryId: null,
        })
      } catch (logErr) {
        console.error('[explain] Failed to persist successful OpenRouter request log', {
          traceId,
          queryLength: query.length,
          queryPreview,
          durationMs: Date.now() - startedAt,
          error: logErr instanceof Error ? logErr.message : String(logErr),
          stack: logErr instanceof Error ? logErr.stack : undefined,
        })
      }
    }
    const ledger = await wallet.createEntry({
      userId: user.id,
      entryType: 'ai_charge',
      amountVnd: -chargeVnd,
      openrouterRequestId: requestId,
      providerCostUsd: result.providerCostUsd,
      usdToVnd: APP_CONFIG.openRouter.usdToVnd,
      markupMultiplier: APP_CONFIG.openRouter.markupMultiplier,
      note: `OpenRouter ${result.model}`,
    })
    if (logger && requestId != null) {
      await logger.attachWalletLedgerEntry(requestId, ledger.id)
    }
    return c.json(result.payload)
  } catch (err: any) {
    if (err instanceof InsufficientBalanceError) {
      return c.json(
        {
          error: 'Wallet balance is insufficient for this AI request',
          code: 'WALLET_INSUFFICIENT',
          balanceVnd: err.balanceVnd,
          requiredVnd: err.chargeVnd,
        },
        402,
      )
    }
    const aiErr = err instanceof AIServiceError ? err : null
    if (logger) {
      try {
        await logger.save({
          query,
          userId: user.id,
          model: aiErr?.model ?? OPENROUTER_MODEL,
          success: false,
          statusCode: aiErr?.providerStatusCode ?? null,
          durationMs: Date.now() - startedAt,
          errorMessage: err?.message ? String(err.message) : 'Unknown error',
          clientIp,
          clientColo,
          openRouterResponseJson: aiErr?.openRouterResponseJson ?? null,
          providerErrorBody: aiErr?.providerErrorBody ?? null,
          usagePromptTokens: aiErr?.usagePromptTokens ?? null,
          usageCompletionTokens: aiErr?.usageCompletionTokens ?? null,
          usageTotalTokens: aiErr?.usageTotalTokens ?? null,
          providerCostUsd: aiErr?.providerCostUsd ?? null,
          walletLedgerEntryId: null,
        })
      } catch (logErr) {
        console.error('[explain] Failed to persist failed OpenRouter request log', {
          traceId,
          queryLength: query.length,
          queryPreview,
          durationMs: Date.now() - startedAt,
          originalError: err?.message ? String(err.message) : 'Unknown error',
          logError: logErr instanceof Error ? logErr.message : String(logErr),
          stack: logErr instanceof Error ? logErr.stack : undefined,
        })
      }
    }
    return c.json(
      {
        error: 'Request failed',
        detail: err.message,
      },
      500,
    )
  }
}

explain.get('/', async (c) => {
  return handleExplain(c, c.req.query('q'))
})

explain.post('/', async (c) => {
  let body: { q?: string; query?: string } = {}
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  return handleExplain(c, body.q ?? body.query)
})

export default explain
