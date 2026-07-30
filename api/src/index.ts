import { Hono } from 'hono'
import debug from './routes/debug'
import explain from './routes/explain'
import history from './routes/history'
import auth from './routes/auth'
import billing from './routes/billing'
import { Bindings } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// Routes
app.route('/', debug)
app.route('/explain', explain)
app.route('/history', history)
app.route('/auth', auth)
app.route('/billing', billing)

// Alias /debug to /info for backward compatibility or just keep it separate
app.get('/debug', (c) => {
  return c.json({
    key: c.env.OPENROUTER_API_KEY ? 'present' : 'missing',
    hasKey: !!c.env.OPENROUTER_API_KEY,
  })
})

export default app
