import { createApp, type Req } from '../server/app.js'
import { PgStore } from '../server/store-pg.js'
import { makeSms } from '../server/sms.js'

/**
 * Vercel entry: every /api/* request lands here. Needs DATABASE_URL (Neon Postgres).
 * Without it the API answers 404 and the app runs in local demo mode on its own.
 */
interface VercelReq {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface VercelRes {
  status(code: number): VercelRes
  setHeader(name: string, value: string): VercelRes
  send(body: string): void
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
const publicUrl = process.env.PUBLIC_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
const app = url ? createApp({ store: new PgStore(url), sms: makeSms(process.env), publicUrl, seed: process.env.SEED !== '0' }) : null

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  if (!app) {
    res.status(404).setHeader('Content-Type', 'application/json').send(JSON.stringify({ error: 'no database configured; the app runs in local mode' }))
    return
  }
  const parsed = new URL(req.url ?? '/', publicUrl)
  let body: Record<string, unknown> | null = null
  if (req.body && typeof req.body === 'object') body = req.body as Record<string, unknown>
  else if (typeof req.body === 'string' && req.body) {
    try {
      body = JSON.parse(req.body) as Record<string, unknown>
    } catch {
      res.status(400).setHeader('Content-Type', 'application/json').send(JSON.stringify({ error: 'bad json' }))
      return
    }
  }
  const r = await app.handle({ method: req.method ?? 'GET', path: parsed.pathname, query: parsed.searchParams, headers: req.headers as Req['headers'], body })
  for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v)
  res.status(r.status).send(r.body)
}
