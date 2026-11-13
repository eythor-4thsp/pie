import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Club, Message, Person, Plan, Rsvp, Text, Ticket } from '../src/core/types.js'
import { seedWorld } from './seed-world.js'
import { userToPerson, type Store, type User, type UserPatch, type World, type WorldRecord } from './store.js'

const KINDS = ['plans', 'clubs', 'rsvps', 'tickets'] as const

/** One process, one file. Documents are written only when their reference changed. */
export class SqliteStore implements Store {
  private db: DatabaseSync
  private last: Partial<Record<(typeof KINDS)[number], Record<string, unknown>>> = {}
  private lastLists: { messages?: Message[]; texts?: Text[] } = {}

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists docs (kind text not null, id text not null, json text not null, primary key (kind, id));
      create table if not exists users (id text primary key, phone text unique not null, name text not null, tone text not null, created_at text not null, show_faces integer not null default 1, opt_out integer not null default 0, blocked integer not null default 0, follows text not null default '[]');
      create table if not exists sessions (token text primary key, user_id text not null, created_at text not null);
      create table if not exists codes (phone text primary key, code text not null, expires_at text not null, attempts integer not null default 0);
      create table if not exists audit (id integer primary key autoincrement, at text not null, user_id text, action text not null);
      create table if not exists meta (key text primary key, value text not null);
    `)
  }

  private version(): number {
    const row = this.db.prepare("select value from meta where key = 'version'").get() as { value: string } | undefined
    return row ? Number(row.value) : 0
  }

  async userByPhone(phone: string): Promise<User | undefined> {
    const row = this.db.prepare('select * from users where phone = ?').get(phone) as Record<string, unknown> | undefined
    return row ? toUser(row) : undefined
  }

  async userById(id: string): Promise<User | undefined> {
    const row = this.db.prepare('select * from users where id = ?').get(id) as Record<string, unknown> | undefined
    return row ? toUser(row) : undefined
  }

  async createUser(u: User): Promise<void> {
    this.db
      .prepare('insert into users (id, phone, name, tone, created_at, show_faces, opt_out, blocked, follows) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.id, u.phone, u.name, u.tone, u.createdAt, u.showFaces ? 1 : 0, u.optOut ? 1 : 0, u.blocked ? 1 : 0, JSON.stringify(u.follows))
  }

  async updateUser(id: string, patch: UserPatch): Promise<void> {
    if (patch.name !== undefined) this.db.prepare('update users set name = ? where id = ?').run(patch.name, id)
    if (patch.showFaces !== undefined) this.db.prepare('update users set show_faces = ? where id = ?').run(patch.showFaces ? 1 : 0, id)
    if (patch.follows !== undefined) this.db.prepare('update users set follows = ? where id = ?').run(JSON.stringify(patch.follows), id)
    if (patch.optOut !== undefined) this.db.prepare('update users set opt_out = ? where id = ?').run(patch.optOut ? 1 : 0, id)
    if (patch.blocked !== undefined) this.db.prepare('update users set blocked = ? where id = ?').run(patch.blocked ? 1 : 0, id)
  }

  async people(): Promise<Record<string, Person>> {
    const out: Record<string, Person> = {}
    for (const row of this.db.prepare('select * from users').all() as Record<string, unknown>[]) {
      const u = toUser(row)
      out[u.id] = userToPerson(u)
    }
    return out
  }

  async setCode(phone: string, code: string, expiresAt: string): Promise<void> {
    this.db.prepare('insert into codes (phone, code, expires_at, attempts) values (?, ?, ?, 0) on conflict(phone) do update set code = excluded.code, expires_at = excluded.expires_at, attempts = 0').run(phone, code, expiresAt)
  }

  async checkCode(phone: string, code: string, now: string): Promise<boolean> {
    const row = this.db.prepare('select * from codes where phone = ?').get(phone) as { code: string; expires_at: string; attempts: number } | undefined
    if (!row || row.expires_at < now || row.attempts >= 5) return false
    if (row.code !== code) {
      this.db.prepare('update codes set attempts = attempts + 1 where phone = ?').run(phone)
      return false
    }
    this.db.prepare('delete from codes where phone = ?').run(phone)
    return true
  }

  async createSession(token: string, userId: string, now: string): Promise<void> {
    this.db.prepare('insert into sessions (token, user_id, created_at) values (?, ?, ?)').run(token, userId, now)
  }

  async sessionUser(token: string): Promise<User | undefined> {
    const row = this.db.prepare('select user_id from sessions where token = ?').get(token) as { user_id: string } | undefined
    return row ? this.userById(row.user_id) : undefined
  }

  async deleteSession(token: string): Promise<void> {
    this.db.prepare('delete from sessions where token = ?').run(token)
  }

  async audit(at: string, userId: string | null, action: unknown): Promise<void> {
    this.db.prepare('insert into audit (at, user_id, action) values (?, ?, ?)').run(at, userId, JSON.stringify(action))
  }

  async loadWorld(seedIfEmpty: boolean): Promise<WorldRecord> {
    const count = (this.db.prepare('select count(*) as n from docs').get() as { n: number }).n
    if (count === 0 && seedIfEmpty) await this.seed()
    const read = <T>(kind: string): Record<string, T> => {
      const out: Record<string, T> = {}
      for (const row of this.db.prepare('select id, json from docs where kind = ?').all(kind) as { id: string; json: string }[]) out[row.id] = JSON.parse(row.json) as T
      return out
    }
    const world: World = {
      version: 2,
      people: await this.people(),
      plans: read<Plan>('plans'),
      clubs: read<Club>('clubs'),
      rsvps: read<Rsvp>('rsvps'),
      tickets: read<Ticket>('tickets'),
      messages: Object.values(read<Message>('messages')).sort((a, b) => a.at.localeCompare(b.at)),
      texts: Object.values(read<Text>('texts')).sort((a, b) => a.at.localeCompare(b.at)),
    }
    this.remember(world)
    return { world, version: this.version() }
  }

  private remember(world: World): void {
    for (const kind of KINDS) this.last[kind] = world[kind] as Record<string, unknown>
    this.lastLists = { messages: world.messages, texts: world.texts }
  }

  async saveWorld(world: World, expectedVersion: number): Promise<number | null> {
    if (this.version() !== expectedVersion) return null
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
      for (const p of Object.values(world.people)) {
        const row = this.db.prepare('select name, blocked, opt_out from users where id = ?').get(p.id) as { name: string; blocked: number; opt_out: number } | undefined
        if (row && (row.name !== p.name || !!row.blocked !== !!p.blocked || !!row.opt_out !== !!p.optOut)) {
          await this.updateUser(p.id, { name: p.name, blocked: !!p.blocked, optOut: !!p.optOut })
        }
      }
      const next = expectedVersion + 1
      this.db.prepare("insert into meta (key, value) values ('version', ?) on conflict(key) do update set value = excluded.value").run(String(next))
      this.db.exec('commit')
      this.remember(world)
      return next
    } catch (e) {
      this.db.exec('rollback')
      throw e
    }
  }

  private async seed(): Promise<void> {
    const { users, world } = seedWorld()
    for (const u of users) if (!(await this.userById(u.id))) await this.createUser(u)
    this.last = {}
    this.lastLists = {}
    await this.saveWorld({ ...world, people: {} }, this.version())
  }
}

function toUser(row: Record<string, unknown>): User {
  let follows: string[] = []
  try {
    const parsed = JSON.parse(typeof row.follows === 'string' ? row.follows : '[]') as unknown
    follows = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    follows = []
  }
  return {
    id: row.id as string,
    phone: row.phone as string,
    name: row.name as string,
    tone: row.tone as Person['tone'],
    createdAt: row.created_at as string,
    showFaces: !!row.show_faces,
    follows,
    optOut: !!row.opt_out,
    blocked: !!row.blocked,
  }
}
