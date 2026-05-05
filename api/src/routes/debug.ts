import { Hono } from 'hono'
import { Bindings } from '../types'

const debug = new Hono<{ Bindings: Bindings }>()

debug.get('/', (c) => {
  return c.text('Hello Hono!')
})

debug.get('/info', (c) => {
  return c.json({
    key: c.env.OPENROUTER_API_KEY ? 'present' : 'missing',
    hasKey: !!c.env.OPENROUTER_API_KEY,
  })
})

export default debug
