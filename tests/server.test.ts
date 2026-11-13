import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import type { State } from '../src/core/types'

const PORT = 18790 + Math.floor(Math.random() * 100)
const BASE = `http://localhost:${PORT}`
let child: ChildProcess

before(async () => {
  child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT), DB_PATH: ':memory:', PUBLIC_URL: BASE }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', (d: Buffer) => process.stderr.write(d))
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/api/me`)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('server did not start')
})

after(() => {
  child.kill('SIGKILL')
})

/** A tiny client: one cookie jar per person. */
class Session {
  cookie = ''
  async call<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await fetch(`${BASE}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) this.cookie = set.split(';')[0]
    return { status: res.status, data: (await res.json()) as T }
  }
  async login(phone: string, name: string) {
    const start = await this.call<{ devCode?: string }>('/auth/start', { phone })
    assert.equal(start.status, 200)
    assert.ok(start.data.devCode, 'console transport hands the code back')
    const v = await this.call<{ user: { id: string } }>('/auth/verify', { phone, code: start.data.devCode, name })
    assert.equal(v.status, 200)
    return v.data.user.id
  }
  state() {
    return this.call<State>('/state')
  }
  act(action: unknown) {
    return this.call<State & { error?: string }>('/act', { action })
  }
}

test('anonymous visitors see public plans and only the preview of a private one', async () => {
  const s = new Session()
  const { data } = await s.state()
  assert.equal(data.you.name, '')
  const noor = data.plans['noor-birthday']
  assert.ok(noor.restricted)
  assert.equal(noor.address, '')
  assert.deepEqual(noor.invitedIds, [])
  assert.equal(data.plans['prospect-run'].address, 'Prospect Park')
  assert.equal(Object.values(data.rsvps).some((r) => r.planId === 'noor-birthday'), false, 'no roster leaks')
})

test('a returning guest sees their own response, and the host sees the same roster', async () => {
  const guest = new Session()
  await guest.login('+1 212 555 0100', 'Thor')
  const yes = await guest.act({ type: 'rsvp', planId: 'friday-dumplings', personId: 'you', status: 'going', at: 'ignored' })
  assert.equal(yes.status, 200)
  assert.equal(yes.data.rsvps['friday-dumplings:you'].status, 'going')
  const again = new Session()
  await again.login('+1 212 555 0100', '')
  const { data } = await again.state()
  assert.equal(data.rsvps['friday-dumplings:you'].status, 'going', 'same phone, same RSVP')
  assert.equal(data.you.name, 'Thor')
  const maya = new Session()
  await maya.login('+1 212 555 0101', '')
  const host = await maya.state()
  const guestOnRoster = Object.values(host.data.rsvps).find((r) => r.planId === 'friday-dumplings' && r.personId === 'guest')
  assert.equal(guestOnRoster?.status, 'going')
})

test('a wrong phone cannot act for someone else or publish a host plan', async () => {
  const ben = new Session()
  await ben.login('+1 212 555 0102', '')
  const forged = await ben.act({ type: 'rsvp', planId: 'friday-dumplings', personId: 'priya', status: 'declined', at: 'x' })
  assert.equal(forged.status, 403)
  const publish = await ben.act({ type: 'cancel', planId: 'friday-dumplings', text: 'nope', at: 'x' })
  assert.equal(publish.status, 403)
})

test('two people racing for the last seat: one confirmation, one waitlist spot', async () => {
  const maya = new Session()
  await maya.login('+1 212 555 0101', '')
  const base = (await maya.state()).data.plans['friday-dumplings']
  const plan = { ...base, id: 'race', title: 'race', capacity: 2, status: 'draft', revision: 0, updates: [], invitedIds: [], audience: 'link', hostId: 'you', publishedAt: undefined }
  assert.equal((await maya.act({ type: 'savePlan', plan, at: 'x' })).status, 200)
  assert.equal((await maya.act({ type: 'publish', planId: 'race', at: 'x' })).status, 200)
  const a = new Session()
  const b = new Session()
  await a.login('+1 212 555 0102', '')
  await b.login('+1 212 555 0103', '')
  const [ra, rb] = await Promise.all([
    a.act({ type: 'rsvp', planId: 'race', personId: 'you', status: 'going', at: 'x' }),
    b.act({ type: 'rsvp', planId: 'race', personId: 'you', status: 'going', at: 'x' }),
  ])
  const statuses = [ra.status, rb.status].sort()
  assert.deepEqual(statuses, [200, 409])
  const final = (await maya.state()).data
  const going = Object.values(final.rsvps).filter((r) => r.planId === 'race' && r.status === 'going').map((r) => r.personId)
  const waiting = Object.values(final.rsvps).filter((r) => r.planId === 'race' && r.status === 'waitlist')
  assert.equal(going.length, 2, 'host plus exactly one guest')
  assert.equal(waiting.length, 1)
})

test('a day-of change is saved, texted once per guest, and a retry resends only the failure', async () => {
  const maya = new Session()
  await maya.login('+1 212 555 0101', '')
  await maya.call('/dev/fail-next', { personId: 'theo' })
  const r = await maya.act({
    type: 'update',
    planId: 'friday-dumplings',
    kind: 'note',
    text: 'Maya updated the plan. meeting point: back room',
    patch: { hostNote: 'Back room. Still under Maya.' },
    recipientIds: ['ben', 'priya', 'sam', 'lena', 'theo'],
    at: 'x',
  })
  assert.equal(r.status, 200)
  assert.equal(r.data.plans['friday-dumplings'].hostNote, 'Back room. Still under Maya.')
  await new Promise((res) => setTimeout(res, 300))
  const after = (await maya.state()).data
  const update = after.plans['friday-dumplings'].updates.at(-1)!
  const byPerson = Object.fromEntries(update.recipients.map((x) => [x.personId, x.status]))
  assert.equal(byPerson['theo'], 'failed')
  assert.equal(byPerson['ben'], 'sent')
  const retry = await maya.act({ type: 'retry', planId: 'friday-dumplings', updateId: update.id, at: 'x' })
  assert.equal(retry.status, 200)
  await new Promise((res) => setTimeout(res, 300))
  const done = (await maya.state()).data.plans['friday-dumplings'].updates.at(-1)!
  assert.deepEqual(
    done.recipients.map((x) => [x.personId, x.status, x.attempts]).sort(),
    [
      ['ben', 'sent', 1],
      ['lena', 'sent', 1],
      ['priya', 'sent', 1],
      ['sam', 'sent', 1],
      ['theo', 'sent', 2],
    ],
  )
  // the guest opening yesterday's link sees the current note
  const ben = new Session()
  await ben.login('+1 212 555 0102', '')
  assert.equal((await ben.state()).data.plans['friday-dumplings'].hostNote, 'Back room. Still under Maya.')
})

test('inviting by phone creates the guest and sends one text', async () => {
  const maya = new Session()
  await maya.login('+1 212 555 0101', '')
  const r = await maya.call<State>('/invite-phone', { planId: 'friday-dumplings', phone: '+1 212 555 0177', name: 'Dana' })
  assert.equal(r.status, 200)
  const dana = Object.values(r.data.people).find((p) => p.name === 'Dana')
  assert.ok(dana)
  assert.ok(r.data.plans['friday-dumplings'].invitedIds.includes(dana.id))
  const dup = await maya.call<State>('/invite-phone', { planId: 'friday-dumplings', phone: '+1 212 555 0177', name: 'Dana' })
  assert.equal(dup.data.plans['friday-dumplings'].invitedIds.filter((id) => id === dana.id).length, 1, 'invited once')
  const d = new Session()
  await d.login('+1 212 555 0177', '')
  const mine = (await d.state()).data
  assert.equal(mine.plans['friday-dumplings'].address, '112 Christopher St', 'the invited phone sees the private details')
  assert.ok(mine.texts.some((t) => t.kind === 'invite'))
})

test('a revoked invitation stops the link from showing private details', async () => {
  const maya = new Session()
  await maya.login('+1 212 555 0101', '')
  const r = await maya.act({ type: 'uninvite', planId: 'friday-dumplings', personId: 'sam', at: 'x' })
  assert.equal(r.status, 200)
  const sam = new Session()
  await sam.login('+1 212 555 0104', '')
  const mine = (await sam.state()).data
  assert.ok(mine.plans['friday-dumplings'].restricted, 'Sam now sees only the preview')
  assert.equal(mine.plans['friday-dumplings'].address, '')
})

test('the shared link serves a public preview and nothing private', async () => {
  const res = await fetch(`${BASE}/p/noor-birthday`)
  assert.equal(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes("Noor&#39;s birthday dinner"))
  assert.ok(html.includes('West Village'))
  assert.ok(!html.includes('Grove St'), 'no address in the preview')
  assert.ok(!html.includes('Reservation under'), 'no host note in the preview')
})

test('following is per person and drives familiar faces both ways', async () => {
  const guest = new Session()
  await guest.login('+1 212 555 0100', '')
  const on = await guest.act({ type: 'follow', personId: 'jules', on: true })
  assert.equal(on.status, 200)
  assert.ok(on.data.you.followIds.includes('jules'))
  const off = await guest.act({ type: 'follow', personId: 'jules', on: false })
  assert.ok(!off.data.you.followIds.includes('jules'))
  const priya = new Session()
  await priya.login('+1 212 555 0103', '')
  await priya.act({ type: 'you', patch: { showFaces: false } })
  const seen = (await guest.state()).data
  assert.equal(seen.people['priya'].hideFace, true, 'Priya asked not to be shown')
})
