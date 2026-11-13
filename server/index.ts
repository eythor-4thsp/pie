import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, randomInt } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { allowed, reduce, uid, type Action } from '../src/core/reducer'
import { Db, normalizePhone, type User, type World } from './db'
import { ConsoleSms, makeSms } from './sms'
import { deref, fromClientId, personalize } from './personalize'

const PORT = Number(process.env.PORT ?? 8787)
const DATA = process.env.DATA_DIR ?? resolve('data')
const STATIC = resolve(process.env.STATIC_DIR ?? 'dist')
const PUBLIC_URL = (process.env.PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/$/, '')
const SEED = process.env.SEED !== '0'
const COOKIE = 'pie_session'

const db = new Db(process.env.DB_PATH ?? join(DATA, 'pie.db'))
const sms = makeSms(process.env)
let world: World = db.loadWorld(SEED)
const inflight = new Set<string>()

console.log(`pie server · ${sms.name} texts · db ${process.env.DB_PATH ?? join(DATA, 'pie.db')} · ${PUBLIC_URL}`)

/* ---------- helpers ---------- */

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((res, rej) => {
    let data = ''
    req.on('data', (c: Buffer) => {
      data += c
      if (data.length > 2_000_000) rej(new Error('body too large'))
    })
    req.on('end', () => {
      try {
        res(data ? (JSON.parse(data) as Record<string, unknown>) : {})
      } catch {
        rej(new Error('bad json'))
      }
    })
  })
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k) out[k] = decodeURIComponent(v.join('='))
  }
  return out
}

function currentUser(req: IncomingMessage): User | null {
  const token = cookies(req)[COOKIE]
  return token ? (db.sessionUser(token) ?? null) : null
}

function sessionCookie(token: string, clear = false): string {
  const secure = PUBLIC_URL.startsWith('https') ? '; Secure' : ''
  return clear ? `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}` : `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}`
}

/** Apply one action to the world: expire first, enforce permissions, persist, then deliver texts. */
function apply(action: Action, user: User | null): { ok: true } | { ok: false; status: number; error: string } {
  const now = new Date().toISOString()
  const base = { ...world, you: { id: 'you' as const, name: '', phone: '', role: 'guest' as const, showFaces: true } }
  const actor = user?.id ?? null
  const act = { ...action, ...('at' in action ? { at: now } : {}) } as Action
  if (!actor) return { ok: false, status: 401, error: 'sign in first' }
  if (!allowed(base, actor, act)) return { ok: false, status: 403, error: "that's not yours to change" }
  let next = reduce(base, { type: 'expire', at: now })
  next = reduce(next, act)
  if (act.type === 'rsvp' && act.status === 'going') {
    const r = next.rsvps[`${act.planId}:${act.personId}`]
    if (r && r.status === 'waitlist') {
      // Only commit the waitlist spot; tell the client the seat was gone.
      commit(next, actor, act)
      return { ok: false, status: 409, error: 'that seat just went. you are on the waitlist' }
    }
  }
  commit(next, actor, act)
  return { ok: true }
}

function commit(next: { you: unknown } & World, actor: string | null, action: unknown): void {
  const { you: _you, ...rest } = next
  world = rest
  db.saveWorld(world)
  db.audit(new Date().toISOString(), actor, action)
  void deliverPending()
}

/** Send every pending text once, then record the result. A retry re-enters here with a fresh attempt. */
async function deliverPending(): Promise<void> {
  const pending = world.texts.filter((t) => t.status === 'pending' && !inflight.has(`${t.id}:${t.attempts}`))
  if (pending.length === 0) return
  for (const t of pending) inflight.add(`${t.id}:${t.attempts}`)
  const results: Array<{ textId: string; status: 'sent' | 'failed' }> = []
  for (const t of pending) {
    const to = db.userById(t.toId)
    const link = `${PUBLIC_URL}/#/p/${t.planId ?? ''}`
    const body = t.body.replace('{link}', link)
    if (!to?.phone) {
      results.push({ textId: t.id, status: 'failed' })
      continue
    }
    const r = await sms.send(to.phone, body)
    results.push({ textId: t.id, status: r.status })
  }
  const base = { ...world, you: { id: 'you' as const, name: '', phone: '', role: 'guest' as const, showFaces: true } }
  const next = reduce(base, { type: 'delivered', results })
  const { you: _you, ...rest } = next
  world = rest
  db.saveWorld(world)
}

/* ---------- static files ---------- */

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

function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): void {
  const safe = normalize(path).replace(/^(\.\.[/\\])+/, '')
  let file = join(STATIC, safe)
  if (!file.startsWith(STATIC)) return void json(res, 400, { error: 'bad path' })
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC, 'index.html')
  if (!existsSync(file)) return void json(res, 404, { error: 'no build yet: run npm run build' })
  const ext = extname(file)
  const immutable = safe.startsWith('/assets/')
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' })
  if (req.method === 'HEAD') return void res.end()
  res.end(readFileSync(file))
}

/* ---------- routes ---------- */

const codeAttempts = new Map<string, number[]>()

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', PUBLIC_URL)
  const path = url.pathname
  if (!path.startsWith('/api/')) return serveStatic(req, res, path)
  const user = currentUser(req)
  const now = new Date().toISOString()

  if (req.method === 'GET' && path === '/api/me') {
    return json(res, 200, { mode: 'remote', user: user ? { id: user.id, name: user.name, phone: user.phone } : null, sms: sms.name })
  }
  if (req.method === 'GET' && path === '/api/state') {
    const base = { ...world, you: { id: 'you' as const, name: '', phone: '', role: 'guest' as const, showFaces: true } }
    const expired = reduce(base, { type: 'expire', at: now })
    if (expired !== base) commit(expired, null, { type: 'expire', at: now })
    return json(res, 200, personalize(world, user))
  }
  if (req.method === 'GET' && path === '/api/dev/outbox') {
    if (!(sms instanceof ConsoleSms)) return json(res, 404, { error: 'outbox exists only with the console transport' })
    return json(res, 200, { log: sms.log.slice(-50).reverse() })
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method' })
  if (!(req.headers['content-type'] ?? '').includes('application/json')) return json(res, 415, { error: 'json only' })
  let body: Record<string, unknown>
  try {
    body = await readBody(req)
  } catch (e) {
    return json(res, 400, { error: (e as Error).message })
  }

  if (path === '/api/auth/start') {
    const phone = normalizePhone(String(body.phone ?? ''))
    if (phone.length < 8) return json(res, 400, { error: 'that phone number looks short' })
    const recent = (codeAttempts.get(phone) ?? []).filter((t) => Date.now() - t < 10 * 60000)
    if (recent.length >= 5) return json(res, 429, { error: 'too many codes. try again in a few minutes' })
    codeAttempts.set(phone, [...recent, Date.now()])
    const code = String(randomInt(100000, 999999))
    db.setCode(phone, code, new Date(Date.now() + 10 * 60000).toISOString())
    const r = await sms.send(phone, `Your pie code is ${code}. It works for 10 minutes.`)
    if (r.status === 'failed' && sms.name === 'twilio') return json(res, 502, { error: "couldn't text that number" })
    return json(res, 200, { ok: true, ...(sms.name === 'console' ? { devCode: code } : {}) })
  }
  if (path === '/api/auth/verify') {
    const phone = normalizePhone(String(body.phone ?? ''))
    const code = String(body.code ?? '').trim()
    if (!db.checkCode(phone, code, now)) return json(res, 400, { error: "that code didn't match" })
    let u = db.userByPhone(phone)
    if (!u) {
      u = { id: uid('u'), phone, name: String(body.name ?? '').trim().slice(0, 40), tone: (['lime', 'latte', 'gray', 'charcoal'] as const)[randomInt(0, 4)], createdAt: now, showFaces: true }
      db.createUser(u)
      world = { ...world, people: db.people() }
    } else if (body.name && !u.name) {
      db.updateUser(u.id, { name: String(body.name).trim().slice(0, 40) })
      u = db.userById(u.id)!
      world = { ...world, people: db.people() }
    }
    const token = randomBytes(32).toString('hex')
    db.createSession(token, u.id, now)
    return json(res, 200, { mode: 'remote', user: { id: u.id, name: u.name, phone: u.phone }, sms: sms.name }, { 'Set-Cookie': sessionCookie(token) })
  }
  if (path === '/api/auth/logout') {
    const token = cookies(req)[COOKIE]
    if (token) db.deleteSession(token)
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', true) })
  }
  if (!user) return json(res, 401, { error: 'sign in first' })

  if (path === '/api/act') {
    const raw = body.action as Action | undefined
    if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return json(res, 400, { error: 'no action' })
    const action = deref(raw, user.id)
    if (action.type === 'you') {
      const patch = (action as { patch: { name?: string; showFaces?: boolean } }).patch
      db.updateUser(user.id, { name: patch.name?.trim().slice(0, 40), showFaces: patch.showFaces })
      world = { ...world, people: db.people() }
      return json(res, 200, personalize(world, db.userById(user.id)!))
    }
    const r = apply(action, user)
    if (!r.ok) return json(res, r.status, { error: r.error, state: personalize(world, user) })
    return json(res, 200, personalize(world, user))
  }
  if (path === '/api/invite-phone') {
    const planId = fromClientId(String(body.planId ?? ''), user.id)
    const phone = normalizePhone(String(body.phone ?? ''))
    const name = String(body.name ?? '').trim().slice(0, 40)
    if (phone.length < 8) return json(res, 400, { error: 'that phone number looks short' })
    let invitee = db.userByPhone(phone)
    if (!invitee) {
      invitee = { id: uid('u'), phone, name, tone: (['lime', 'latte', 'gray', 'charcoal'] as const)[randomInt(0, 4)], createdAt: now, showFaces: true }
      db.createUser(invitee)
      world = { ...world, people: db.people() }
    }
    const r = apply({ type: 'invite', planId, personIds: [invitee.id], at: now }, user)
    if (!r.ok) return json(res, r.status, { error: r.error })
    return json(res, 200, personalize(world, user))
  }
  if (path === '/api/dev/fail-next') {
    if (!(sms instanceof ConsoleSms)) return json(res, 404, { error: 'console transport only' })
    const target = db.userById(fromClientId(String(body.personId ?? ''), user.id))
    if (target) sms.failing.add(target.phone)
    return json(res, 200, { ok: true })
  }
  return json(res, 404, { error: 'no such route' })
}

createServer((req, res) => {
  route(req, res).catch((e: Error) => {
    console.error(e)
    if (!res.headersSent) json(res, 500, { error: 'something broke on our side' })
  })
}).listen(PORT, () => console.log(`listening on ${PORT}`))

export {}
