import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createApp, type Req } from './app'
import { SqliteStore } from './store-sqlite'
import { PgStore } from './store-pg'
import { makeSms } from './sms'

/** Self-hosted entry: one Node process serving the built app and the API. SQLite by default, Postgres with DATABASE_URL. */
const PORT = Number(process.env.PORT ?? 8787)
const DATA = process.env.DATA_DIR ?? resolve('data')
const STATIC = resolve(process.env.STATIC_DIR ?? 'dist')
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const SEED = process.env.SEED !== '0'

const dbPath = process.env.DB_PATH ?? join(DATA, 'pie.db')
const store = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new SqliteStore(dbPath)
const sms = makeSms(process.env)
const app = createApp({ store, sms, publicUrl: PUBLIC_URL, seed: SEED })

console.log(`pie server · ${sms.name} texts · ${process.env.DATABASE_URL ? 'postgres' : `sqlite ${dbPath}`} · ${PUBLIC_URL}`)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((res, rej) => {
    let data = ''
    req.on('data', (c: Buffer) => {
      data += c
      if (data.length > 2_000_000) rej(new Error('body too large'))
    })
    req.on('end', () => {
      try {
        res(data ? (JSON.parse(data) as Record<string, unknown>) : null)
      } catch {
        rej(new Error('bad json'))
      }
    })
  })
}

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): void {
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '')
  let file = join(STATIC, safe)
  if (!file.startsWith(STATIC)) {
    res.writeHead(400)
    return void res.end()
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    return void res.end(JSON.stringify({ error: 'no build yet: run npm run build' }))
  }
  const ext = extname(file)
  const immutable = safe.startsWith('/assets/')
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
  if (req.method === 'HEAD') return void res.end()
  res.end(readFileSync(file))
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', PUBLIC_URL)
  const path = url.pathname
  const preview = /^\/p\/([\w-]+)\/?$/.exec(path)
  if (preview && req.method === 'GET') {
    const r = await app.preview(preview[1])
    res.writeHead(r.status, r.headers)
    return void res.end(r.body)
  }
  if (!path.startsWith('/api/')) return serveStatic(req, res, path)
  let body: Record<string, unknown> | null = null
  if (req.method === 'POST') {
    try {
      body = await readBody(req)
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return void res.end(JSON.stringify({ error: (e as Error).message }))
    }
  }
  const r = await app.handle({ method: req.method ?? 'GET', path, query: url.searchParams, headers: req.headers as Req['headers'], body })
  res.writeHead(r.status, r.headers)
  res.end(r.body)
}

createServer((req, res) => {
  route(req, res).catch((e: Error) => {
    console.error(e)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'something broke on our side' }))
    }
  })
}).listen(PORT, () => console.log(`listening on ${PORT}`))

// The clock also runs on every read; this keeps reminders moving on a quiet server.
setInterval(() => {
  app.handle({ method: 'GET', path: '/api/state', query: new URLSearchParams(), headers: {}, body: null }).catch(() => {})
}, 60000).unref()

export {}
