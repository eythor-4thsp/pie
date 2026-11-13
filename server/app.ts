import { randomBytes, randomInt } from 'node:crypto'
import { allowed, reduce, uid, type Action } from '../src/core/reducer.js'
import { dueReminders, redactPlan } from '../src/core/select.js'
import { when } from '../src/core/format.js'
import type { State } from '../src/core/types.js'
import { normalizePhone, type Store, type User, type World } from './store.js'
import { ConsoleSms, type SmsTransport } from './sms.js'
import { deref, fromClientId, personalize } from './personalize.js'

export interface AppOptions {
  store: Store
  sms: SmsTransport
  publicUrl: string
  seed: boolean
}

export interface Req {
  method: string
  path: string
  query: URLSearchParams
  headers: Record<string, string | string[] | undefined>
  /** Parsed JSON body, or null. */
  body: Record<string, unknown> | null
}

export interface Res {
  status: number
  headers: Record<string, string>
  body: string
}

const COOKIE = 'pie_session'
const TONES = ['lime', 'latte', 'gray', 'charcoal'] as const

function json(status: number, body: unknown, headers: Record<string, string> = {}): Res {
  return { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, body: JSON.stringify(body) }
}

function html(status: number, body: string, headers: Record<string, string> = {}): Res {
  return { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, body }
}

function cookies(req: Req): Record<string, string> {
  const raw = req.headers.cookie
  const str = Array.isArray(raw) ? raw.join(';') : (raw ?? '')
  const out: Record<string, string> = {}
  for (const part of str.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k) out[k] = decodeURIComponent(v.join('='))
  }
  return out
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function withYou(world: World): State {
  return { ...world, you: { id: 'you', name: '', phone: '', role: 'guest', showFaces: true, followIds: [] } }
}

function stripYou(state: State): World {
  const { you: _you, ...rest } = state
  return rest
}

/**
 * The whole API as one function of (request) → (response), independent of how it is hosted.
 * Every write loads the world, applies the shared reducer, and saves with compare-and-swap.
 */
export function createApp(opts: AppOptions) {
  const { store, sms, seed } = opts
  const publicUrl = opts.publicUrl.replace(/\/$/, '')
  const codeAttempts = new Map<string, number[]>()
  const secure = publicUrl.startsWith('https') ? '; Secure' : ''

  const sessionCookie = (token: string, clear = false) =>
    clear ? `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}` : `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}`

  async function currentUser(req: Req): Promise<User | null> {
    const token = cookies(req)[COOKIE]
    return token ? ((await store.sessionUser(token)) ?? null) : null
  }

  /** Load, transform, save; retry when another request wrote in between. */
  async function transact(actor: string | null, label: unknown, fn: (state: State) => State): Promise<World> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { world, version } = await store.loadWorld(seed)
      const before = withYou(world)
      const after = fn(before)
      if (after === before) return world
      const next = stripYou(after)
      const saved = await store.saveWorld(next, version)
      if (saved !== null) {
        await store.audit(new Date().toISOString(), actor, label)
        return next
      }
      await new Promise((r) => setTimeout(r, 20 + attempt * 30))
    }
    throw new Error('busy, try again')
  }

  /** Expire offers and holds, send due reminders. Runs on every read so it needs no scheduler. */
  function clock(state: State, now: string): State {
    let s = reduce(state, { type: 'expire', at: now })
    for (const r of dueReminders(s, now)) s = reduce(s, { type: 'remind', planId: r.planId, which: r.which, at: now })
    return s
  }

  /** Send every pending text once, then record the result. A retry re-enters here with a fresh attempt. */
  async function deliverPending(world: World): Promise<World> {
    const pending = world.texts.filter((t) => t.status === 'pending')
    if (pending.length === 0) return world
    const results: Array<{ textId: string; status: 'sent' | 'failed' }> = []
    for (const t of pending) {
      const to = await store.userById(t.toId)
      const link = t.planId ? `${publicUrl}/p/${t.planId}` : publicUrl
      if (!to?.phone) {
        results.push({ textId: t.id, status: 'failed' })
        continue
      }
      const r = await sms.send(to.phone, t.body.replace('{link}', link))
      results.push({ textId: t.id, status: r.status })
    }
    return transact(null, { type: 'delivered', count: results.length }, (s) => reduce(s, { type: 'delivered', results }))
  }

  async function apply(action: Action, user: User): Promise<{ world: World; refused?: { status: number; error: string } }> {
    const now = new Date().toISOString()
    const act = { ...action, ...('at' in action ? { at: now } : {}) } as Action
    let refused: { status: number; error: string } | undefined
    let world = await transact(user.id, act, (base) => {
      refused = undefined
      if (!allowed(base, user.id, act)) {
        refused = { status: 403, error: "that's not yours to change" }
        return base
      }
      const next = reduce(clock(base, now), act)
      if (act.type === 'rsvp' && act.status === 'going') {
        const r = next.rsvps[`${act.planId}:${act.personId}`]
        if (r && r.status === 'waitlist') refused = { status: 409, error: 'that seat just went. you are on the waitlist' }
      }
      return next
    })
    world = await deliverPending(world)
    return { world, refused }
  }

  async function freshPeople(world: World): Promise<World> {
    return { ...world, people: await store.people() }
  }

  async function preview(planId: string): Promise<Res> {
    const { world } = await store.loadWorld(seed)
    const plan = world.plans[planId]
    const target = `/#/p/${encodeURIComponent(planId)}`
    if (!plan || plan.status === 'draft') return { status: 302, headers: { Location: target }, body: '' }
    const pub = redactPlan(plan)
    const host = world.people[plan.hostId]?.name ?? 'someone'
    const title = plan.status === 'canceled' ? `${plan.title} (canceled)` : plan.title
    const desc = `${host} is hosting · ${when(plan.startsAt)} · ${plan.neighborhood}`
    const image = pub.cover.kind === 'photo' && pub.cover.src && !pub.cover.src.startsWith('data:') ? `${publicUrl}/${pub.cover.src}` : `${publicUrl}/icon-512.png`
    return html(
      200,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · pie</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:type" content="website"><meta property="og:site_name" content="pie">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${target}">
<style>body{margin:0;background:#09090B;color:#FFF8E7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}a{color:#D0F08B}</style>
</head><body><p>${esc(title)} · <a href="${target}">open in pie</a></p><script>location.replace(${JSON.stringify(target)})</script></body></html>`,
    )
  }

  async function handle(req: Req): Promise<Res> {
    const path = req.path.replace(/\/$/, '') || '/'
    const now = new Date().toISOString()

    if (req.method === 'GET' && path === '/api/preview') return preview(req.query.get('id') ?? '')
    const user = await currentUser(req)

    if (req.method === 'GET' && path === '/api/me') {
      return json(200, { mode: 'remote', user: user ? { id: user.id, name: user.name, phone: user.phone } : null, sms: sms.name })
    }
    if (req.method === 'GET' && path === '/api/state') {
      let world = await transact(null, { type: 'tick', at: now }, (s) => clock(s, now))
      world = await deliverPending(world)
      return json(200, personalize(world, user))
    }
    if (req.method === 'GET' && path === '/api/dev/outbox') {
      if (!(sms instanceof ConsoleSms)) return json(404, { error: 'outbox exists only with the console transport' })
      return json(200, { log: sms.log.slice(-50).reverse() })
    }
    if (req.method !== 'POST') return json(405, { error: 'method' })
    const ct = req.headers['content-type']
    if (!(Array.isArray(ct) ? ct.join() : (ct ?? '')).includes('application/json')) return json(415, { error: 'json only' })
    const body = req.body ?? {}

    if (path === '/api/auth/start') {
      const phone = normalizePhone(String(body.phone ?? ''))
      if (phone.length < 8) return json(400, { error: 'that phone number looks short' })
      const recent = (codeAttempts.get(phone) ?? []).filter((t) => Date.now() - t < 10 * 60000)
      if (recent.length >= 5) return json(429, { error: 'too many codes. try again in a few minutes' })
      codeAttempts.set(phone, [...recent, Date.now()])
      const code = String(randomInt(100000, 999999))
      await store.setCode(phone, code, new Date(Date.now() + 10 * 60000).toISOString())
      const r = await sms.send(phone, `Your pie code is ${code}. It works for 10 minutes.`)
      if (r.status === 'failed' && sms.name === 'twilio') return json(502, { error: "couldn't text that number" })
      return json(200, { ok: true, ...(sms.name === 'console' ? { devCode: code } : {}) })
    }
    if (path === '/api/auth/verify') {
      const phone = normalizePhone(String(body.phone ?? ''))
      const code = String(body.code ?? '').trim()
      if (!(await store.checkCode(phone, code, now))) return json(400, { error: "that code didn't match" })
      let u = await store.userByPhone(phone)
      if (!u) {
        u = { id: uid('u'), phone, name: String(body.name ?? '').trim().slice(0, 40), tone: TONES[randomInt(0, 4)], createdAt: now, showFaces: true, follows: [], optOut: false, blocked: false }
        await store.createUser(u)
      } else if (body.name && !u.name) {
        await store.updateUser(u.id, { name: String(body.name).trim().slice(0, 40) })
        u = (await store.userById(u.id))!
      }
      const token = randomBytes(32).toString('hex')
      await store.createSession(token, u.id, now)
      return json(200, { mode: 'remote', user: { id: u.id, name: u.name, phone: u.phone }, sms: sms.name }, { 'Set-Cookie': sessionCookie(token) })
    }
    if (path === '/api/auth/logout') {
      const token = cookies(req)[COOKIE]
      if (token) await store.deleteSession(token)
      return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', true) })
    }
    if (!user) return json(401, { error: 'sign in first' })

    if (path === '/api/act') {
      const raw = body.action as Action | undefined
      if (!raw || typeof raw !== 'object' || typeof raw.type !== 'string') return json(400, { error: 'no action' })
      const action = deref(raw, user.id)
      if (action.type === 'you') {
        const patch = (action as { patch: { name?: string; showFaces?: boolean } }).patch
        await store.updateUser(user.id, { name: patch.name?.trim().slice(0, 40), showFaces: patch.showFaces })
        const { world } = await store.loadWorld(seed)
        return json(200, personalize(world, (await store.userById(user.id))!))
      }
      if (action.type === 'follow') {
        const { world } = await store.loadWorld(seed)
        if (action.personId === user.id || !world.people[action.personId]) return json(400, { error: 'nobody to follow' })
        const follows = action.on ? Array.from(new Set([...user.follows, action.personId])) : user.follows.filter((id) => id !== action.personId)
        await store.updateUser(user.id, { follows })
        return json(200, personalize(await freshPeople(world), (await store.userById(user.id))!))
      }
      const r = await apply(action, user)
      const state = personalize(await freshPeople(r.world), user)
      if (r.refused) return json(r.refused.status, { error: r.refused.error, state })
      return json(200, state)
    }
    if (path === '/api/invite-phone') {
      const planId = fromClientId(String(body.planId ?? ''), user.id)
      const phone = normalizePhone(String(body.phone ?? ''))
      const name = String(body.name ?? '').trim().slice(0, 40)
      if (phone.length < 8) return json(400, { error: 'that phone number looks short' })
      let invitee = await store.userByPhone(phone)
      if (!invitee) {
        invitee = { id: uid('u'), phone, name, tone: TONES[randomInt(0, 4)], createdAt: now, showFaces: true, follows: [], optOut: false, blocked: false }
        await store.createUser(invitee)
      }
      const r = await apply({ type: 'invite', planId, personIds: [invitee.id], at: now }, user)
      if (r.refused) return json(r.refused.status, { error: r.refused.error })
      return json(200, personalize(await freshPeople(r.world), user))
    }
    if (path === '/api/dev/fail-next') {
      if (!(sms instanceof ConsoleSms)) return json(404, { error: 'console transport only' })
      const target = await store.userById(fromClientId(String(body.personId ?? ''), user.id))
      if (target) sms.failing.add(target.phone)
      return json(200, { ok: true })
    }
    return json(404, { error: 'no such route' })
  }

  return { handle, preview }
}
