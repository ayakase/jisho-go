import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AIService } from '../services/ai.service'
import { Bindings } from '../types'

const explain = new Hono<{ Bindings: Bindings }>()

explain.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'OPTIONS'],
  }),
)

explain.get('/', async (c) => {
  const query = c.req.query('q')

  if (!query) {
    return c.json({ error: 'Missing ?q=...' }, 400)
  }

  const aiService = new AIService(c.env.OPENROUTER_API_KEY)

  try {
    const payload = await aiService.explainJapanese(query)
    return c.json(payload)
  } catch (err: any) {
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
