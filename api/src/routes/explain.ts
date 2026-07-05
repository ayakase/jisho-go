import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie } from 'hono/cookie'
import { AIService, AIServiceError, OPENROUTER_MODEL } from '../services/ai.service'
import { RequestLogService } from '../services/request-log.service'
import { Bindings } from '../types'
import { getAuthenticatedUser } from '../utils/request-auth'

const explain = new Hono<{ Bindings: Bindings }>()

explain.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type'],
  }),
)

explain.get('/', async (c) => {
  const query = c.req.query('q')

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
    if (logger) {
      try {
        await logger.save({
          query,
          userId: user?.id ?? null,
          model: result.model,
          success: true,
          statusCode: result.providerStatusCode,
          durationMs: Date.now() - startedAt,
          errorMessage: null,
          clientIp,
          clientColo,
          openRouterRequestJson: result.openRouterRequestJson,
          openRouterResponseJson: result.openRouterResponseJson,
          providerErrorBody: result.providerErrorBody,
          usagePromptTokens: result.usagePromptTokens,
          usageCompletionTokens: result.usageCompletionTokens,
          usageTotalTokens: result.usageTotalTokens,
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
    return c.json(result.payload)
  } catch (err: any) {
    const aiErr = err instanceof AIServiceError ? err : null
    if (logger) {
      try {
        await logger.save({
          query,
          userId: user?.id ?? null,
          model: aiErr?.model ?? OPENROUTER_MODEL,
          success: false,
          statusCode: aiErr?.providerStatusCode ?? null,
          durationMs: Date.now() - startedAt,
          errorMessage: err?.message ? String(err.message) : 'Unknown error',
          clientIp,
          clientColo,
          openRouterRequestJson: aiErr?.openRouterRequestJson ?? null,
          openRouterResponseJson: aiErr?.openRouterResponseJson ?? null,
          providerErrorBody: aiErr?.providerErrorBody ?? null,
          usagePromptTokens: aiErr?.usagePromptTokens ?? null,
          usageCompletionTokens: aiErr?.usageCompletionTokens ?? null,
          usageTotalTokens: aiErr?.usageTotalTokens ?? null,
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
})

export default explain
