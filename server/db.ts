import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { buildSeed, SEED_PEOPLE } from '../src/core/seed'
import type { Club, Message, Person, Plan, Rsvp, State, Text, Ticket } from '../src/core/types'

export interface User {
  id: string
  phone: string
  name: string
  tone: Person['tone']
  createdAt: string
  showFaces: boolean
}

/** The server's world: the same State shape the client runs, minus a point of view. */
export type World = Omit<State, 'you'>

const KINDS = ['plans', 'clubs', 'rsvps', 'tickets'] as const

export class Db {
  private db: DatabaseSync
  private last: Partial<Record<(typeof KINDS)[number], Record<string, unknown>>> = {}
  private lastLists: { messages?: Message[]; texts?: Text[] } = {}

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists docs (kind text not null, id text not null, json text not null, primary key (kind, id));
      create table if not exists users (id text primary key, phone text unique not null, name text not null, tone text not null, created_at text not null, show_faces integer not null default 1, opt_out integer not null default 0, blocked integer not null default 0);
      create table if not exists sessions (token text primary key, user_id text not null, created_at text not null);
      create table if not exists codes (phone text primary key, code text not null, expires_at text not null, attempts integer not null default 0);
      create table if not exists audit (id integer primary key autoincrement, at text not null, user_id text, action text not null);
      create table if not exists meta (key text primary key, value text not null);
    `)
  }

  /* ---------- users & auth ---------- */

  userByPhone(phone: string): User | undefined {
    const row = this.db.prepare('select * from users where phone = ?').get(phone) as Record<string, unknown> | undefined
    return row ? toUser(row) : undefined
  }

  userById(id: string): User | undefined {
    const row = this.db.prepare('select * from users where id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toUser(row) : undefined
  }

  users(): User[] {
    return (this.db.prepare('select * from users').all() as Record<string, unknown>[]).map(toUser)
  }

  createUser(u: User): void {
    this.db
      .prepare('insert into users (id, phone, name, tone, created_at, show_faces) values (?, ?, ?, ?, ?, ?)')
      .run(u.id, u.phone, u.name, u.tone, u.createdAt, u.showFaces ? 1 : 0)
  }

  updateUser(id: string, patch: Partial<Pick<User, 'name' | 'showFaces'>> & { optOut?: boolean; blocked?: boolean }): void {
    if (patch.name !== undefined) this.db.prepare('update users set name = ? where id = ?').run(patch.name, id)
    if (patch.showFaces !== undefined) this.db.prepare('update users set show_faces = ? where id = ?').run(patch.showFaces ? 1 : 0, id)
    if (patch.optOut !== undefined) this.db.prepare('update users set opt_out = ? where id = ?').run(patch.optOut ? 1 : 0, id)
    if (patch.blocked !== undefined) this.db.prepare('update users set blocked = ? where id = ?').run(patch.blocked ? 1 : 0, id)
  }

  people(): Record<string, Person> {
    const out: Record<string, Person> = {}
    for (const row of this.db.prepare('select * from users').all() as Record<string, unknown>[]) {
      const u = toUser(row)
      out[u.id] = { id: u.id, name: u.name, tone: u.tone, phone: u.phone, optOut: !!row.opt_out, blocked: !!row.blocked }
    }
    return out
  }

  setCode(phone: string, code: string, expiresAt: string): void {
    this.db.prepare('insert into codes (phone, code, expires_at, attempts) values (?, ?, ?, 0) on conflict(phone) do update set code = excluded.code, expires_at = excluded.expires_at, attempts = 0').run(phone, code, expiresAt)
  }

  /** Returns true once per code; wrong guesses count against a small limit. */
  checkCode(phone: string, code: string, now: string): boolean {
    const row = this.db.prepare('select * from codes where phone = ?').get(phone) as { code: string; expires_at: string; attempts: number } | undefined
    if (!row || row.expires_at < now || row.attempts >= 5) return false
    if (row.code !== code) {
      this.db.prepare('update codes set attempts = attempts + 1 where phone = ?').run(phone)
      return false
    }
    this.db.prepare('delete from codes where phone = ?').run(phone)
    return true
  }

  createSession(token: string, userId: string, now: string): void {
    this.db.prepare('insert into sessions (token, user_id, created_at) values (?, ?, ?)').run(token, userId, now)
  }

  sessionUser(token: string): User | undefined {
    const row = this.db.prepare('select user_id from sessions where token = ?').get(token) as { user_id: string } | undefined
    return row ? this.userById(row.user_id) : undefined
  }

  deleteSession(token: string): void {
    this.db.prepare('delete from sessions where token = ?').run(token)
  }

  audit(at: string, userId: string | null, action: unknown): void {
    this.db.prepare('insert into audit (at, user_id, action) values (?, ?, ?)').run(at, userId, JSON.stringify(action))
  }

  /* ---------- world ---------- */

  loadWorld(seedIfEmpty: boolean): World {
    const count = (this.db.prepare('select count(*) as n from docs').get() as { n: number }).n
    if (count === 0 && seedIfEmpty) this.seed()
    const read = <T>(kind: string): Record<string, T> => {
      const out: Record<string, T> = {}
      for (const row of this.db.prepare('select id, json from docs where kind = ?').all(kind) as { id: string; json: string }[]) out[row.id] = JSON.parse(row.json) as T
      return out
    }
    const world: World = {
      version: 2,
      people: this.people(),
      plans: read<Plan>('plans'),
      clubs: read<Club>('clubs'),
      rsvps: read<Rsvp>('rsvps'),
      tickets: read<Ticket>('tickets'),
      messages: Object.values(read<Message>('messages')).sort((a, b) => a.at.localeCompare(b.at)),
      texts: Object.values(read<Text>('texts')).sort((a, b) => a.at.localeCompare(b.at)),
    }
    this.remember(world)
    return world
  }

  private remember(world: World): void {
    for (const kind of KINDS) this.last[kind] = world[kind] as Record<string, unknown>
    this.lastLists = { messages: world.messages, texts: world.texts }
  }

  /** Writes only the documents whose references changed since the last save. */
  saveWorld(world: World): void {
    const upsert = this.db.prepare('insert into docs (kind, id, json) values (?, ?, ?) on conflict(kind, id) do update set json = excluded.json')
    const del = this.db.prepare('delete from docs where kind = ? and id = ?')
    this.db.exec('begin')
    try {
      for (const kind of KINDS) {
        const cur = world[kind] as Record<string, unknown>
        const prev = this.last[kind] ?? {}
        if (cur === prev) continue
        for (const [id, doc] of Object.entries(cur)) if (prev[id] !== doc) upsert.run(kind, id, JSON.stringify(doc))
        for (const id of Object.keys(prev)) if (!(id in cur)) del.run(kind, id)
      }
      for (const kind of ['messages', 'texts'] as const) {
        const cur = world[kind] as Array<{ id: string }>
        const prev = (this.lastLists[kind] ?? []) as Array<{ id: string }>
        if (cur === prev) continue
        const prevById = new Map(prev.map((m) => [m.id, m]))
        for (const doc of cur) if (prevById.get(doc.id) !== doc) upsert.run(kind, doc.id, JSON.stringify(doc))
      }
      for (const u of Object.values(world.people)) {
        const existing = this.userById(u.id)
        if (existing && (existing.name !== u.name || !!u.blocked !== !!(this.db.prepare('select blocked from users where id = ?').get(u.id) as { blocked: number }).blocked)) {
          this.updateUser(u.id, { name: u.name, blocked: !!u.blocked, optOut: !!u.optOut })
        }
      }
      this.db.exec('commit')
    } catch (e) {
      this.db.exec('rollback')
      throw e
    }
    this.remember(world)
  }

  /** Demo data for a fresh pilot database: the fictional club and its people, each with a phone that can log in. */
  seed(): void {
    const s = buildSeed()
    const now = new Date().toISOString()
    for (const p of SEED_PEOPLE) {
      if (!this.userById(p.id)) {
        this.createUser({ id: p.id, phone: normalizePhone(p.phone ?? ''), name: p.name, tone: p.tone, createdAt: now, showFaces: true })
        this.updateUser(p.id, { optOut: !!p.optOut, blocked: !!p.blocked })
      }
    }
    // The seed's guest, "you", becomes a real pilot guest with a login of their own.
    if (!this.userById('guest')) this.createUser({ id: 'guest', phone: '+12125550100', name: '', tone: 'charcoal', createdAt: now, showFaces: true })
    const swap = (id: string) => (id === 'you' ? 'guest' : id)
    const world: World = {
      version: 2,
      people: {},
      plans: Object.fromEntries(
        Object.values(s.plans).map((p) => [
          p.id,
          {
            ...p,
            hostId: swap(p.hostId),
            cohostIds: p.cohostIds.map(swap),
            invitedIds: p.invitedIds.map(swap),
            viewerIds: p.viewerIds.map(swap),
            attendedIds: p.attendedIds?.map(swap),
            updates: p.updates.map((u) => ({ ...u, recipients: u.recipients.map((r) => ({ ...r, personId: swap(r.personId) })) })),
          },
        ]),
      ),
      clubs: s.clubs,
      rsvps: Object.fromEntries(Object.values(s.rsvps).map((r) => [`${r.planId}:${swap(r.personId)}`, { ...r, personId: swap(r.personId) }])),
      tickets: s.tickets,
      messages: s.messages.map((m) => ({ ...m, fromId: swap(m.fromId) })),
      texts: s.texts.map((t) => ({ ...t, toId: swap(t.toId) })),
    }
    this.last = {}
    this.lastLists = {}
    this.saveWorld(world)
  }
}

function toUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    phone: row.phone as string,
    name: row.name as string,
    tone: row.tone as Person['tone'],
    createdAt: row.created_at as string,
    showFaces: !!row.show_faces,
  }
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `+1${digits}`
  return `+${digits}`
}
