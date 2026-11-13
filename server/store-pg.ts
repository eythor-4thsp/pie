import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import type { Person } from '../src/core/types.js'
import { seedWorld } from './seed-world.js'
import { userToPerson, type Store, type User, type UserPatch, type World, type WorldRecord } from './store.js'

type Row = Record<string, unknown>

/**
 * Postgres for serverless. The world is one JSON document with a version column;
 * every write is a compare-and-swap, so concurrent functions cannot both take the last seat.
 */
export class PgStore implements Store {
  private sql: NeonQueryFunction<false, false>
  private ready: Promise<void> | null = null

  constructor(url: string) {
    this.sql = neon(url)
  }

  private async init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        await this.sql`create table if not exists users (id text primary key, phone text unique not null, name text not null, tone text not null, created_at text not null, show_faces boolean not null default true, opt_out boolean not null default false, blocked boolean not null default false, follows jsonb not null default '[]')`
        await this.sql`create table if not exists sessions (token text primary key, user_id text not null, created_at text not null)`
        await this.sql`create table if not exists codes (phone text primary key, code text not null, expires_at text not null, attempts integer not null default 0)`
        await this.sql`create table if not exists audit (id bigserial primary key, at text not null, user_id text, action jsonb not null)`
        await this.sql`create table if not exists world (id integer primary key, doc jsonb not null, version integer not null)`
      })()
    }
    await this.ready
  }

  async userByPhone(phone: string): Promise<User | undefined> {
    await this.init()
    const rows = (await this.sql`select * from users where phone = ${phone}`) as Row[]
    return rows[0] ? toUser(rows[0]) : undefined
  }

  async userById(id: string): Promise<User | undefined> {
    await this.init()
    const rows = (await this.sql`select * from users where id = ${id}`) as Row[]
    return rows[0] ? toUser(rows[0]) : undefined
  }

  async createUser(u: User): Promise<void> {
    await this.init()
    await this.sql`insert into users (id, phone, name, tone, created_at, show_faces, opt_out, blocked, follows) values (${u.id}, ${u.phone}, ${u.name}, ${u.tone}, ${u.createdAt}, ${u.showFaces}, ${u.optOut}, ${u.blocked}, ${JSON.stringify(u.follows)}::jsonb) on conflict (id) do nothing`
  }

  async updateUser(id: string, patch: UserPatch): Promise<void> {
    await this.init()
    if (patch.name !== undefined) await this.sql`update users set name = ${patch.name} where id = ${id}`
    if (patch.showFaces !== undefined) await this.sql`update users set show_faces = ${patch.showFaces} where id = ${id}`
    if (patch.follows !== undefined) await this.sql`update users set follows = ${JSON.stringify(patch.follows)}::jsonb where id = ${id}`
    if (patch.optOut !== undefined) await this.sql`update users set opt_out = ${patch.optOut} where id = ${id}`
    if (patch.blocked !== undefined) await this.sql`update users set blocked = ${patch.blocked} where id = ${id}`
  }

  async people(): Promise<Record<string, Person>> {
    await this.init()
    const out: Record<string, Person> = {}
    for (const row of (await this.sql`select * from users`) as Row[]) {
      const u = toUser(row)
      out[u.id] = userToPerson(u)
    }
    return out
  }

  async setCode(phone: string, code: string, expiresAt: string): Promise<void> {
    await this.init()
    await this.sql`insert into codes (phone, code, expires_at, attempts) values (${phone}, ${code}, ${expiresAt}, 0) on conflict (phone) do update set code = excluded.code, expires_at = excluded.expires_at, attempts = 0`
  }

  async checkCode(phone: string, code: string, now: string): Promise<boolean> {
    await this.init()
    const rows = (await this.sql`select * from codes where phone = ${phone}`) as Array<{ code: string; expires_at: string; attempts: number }>
    const row = rows[0]
    if (!row || row.expires_at < now || row.attempts >= 5) return false
    if (row.code !== code) {
      await this.sql`update codes set attempts = attempts + 1 where phone = ${phone}`
      return false
    }
    await this.sql`delete from codes where phone = ${phone}`
    return true
  }

  async createSession(token: string, userId: string, now: string): Promise<void> {
    await this.init()
    await this.sql`insert into sessions (token, user_id, created_at) values (${token}, ${userId}, ${now})`
  }

  async sessionUser(token: string): Promise<User | undefined> {
    await this.init()
    const rows = (await this.sql`select u.* from sessions s join users u on u.id = s.user_id where s.token = ${token}`) as Row[]
    return rows[0] ? toUser(rows[0]) : undefined
  }

  async deleteSession(token: string): Promise<void> {
    await this.init()
    await this.sql`delete from sessions where token = ${token}`
  }

  async audit(at: string, userId: string | null, action: unknown): Promise<void> {
    await this.init()
    await this.sql`insert into audit (at, user_id, action) values (${at}, ${userId}, ${JSON.stringify(action)}::jsonb)`
  }

  async loadWorld(seedIfEmpty: boolean): Promise<WorldRecord> {
    await this.init()
    let rows = (await this.sql`select doc, version from world where id = 1`) as Array<{ doc: World; version: number }>
    if (rows.length === 0) {
      const { users, world } = seedIfEmpty ? seedWorld() : { users: [], world: emptyWorld() }
      for (const u of users) await this.createUser(u)
      await this.sql`insert into world (id, doc, version) values (1, ${JSON.stringify({ ...world, people: {} })}::jsonb, 1) on conflict (id) do nothing`
      rows = (await this.sql`select doc, version from world where id = 1`) as Array<{ doc: World; version: number }>
    }
    const world: World = { ...rows[0].doc, people: await this.people() }
    return { world, version: rows[0].version }
  }

  async saveWorld(world: World, expectedVersion: number): Promise<number | null> {
    await this.init()
    const { people, ...doc } = world
    const rows = (await this.sql`update world set doc = ${JSON.stringify({ ...doc, people: {} })}::jsonb, version = version + 1 where id = 1 and version = ${expectedVersion} returning version`) as Array<{ version: number }>
    if (rows.length === 0) return null
    // Names, blocks and opt-outs live on the user row; mirror what the reducer changed.
    for (const p of Object.values(people)) {
      const rowsU = (await this.sql`select name, blocked, opt_out from users where id = ${p.id}`) as Array<{ name: string; blocked: boolean; opt_out: boolean }>
      const u = rowsU[0]
      if (u && (u.name !== p.name || u.blocked !== !!p.blocked || u.opt_out !== !!p.optOut)) await this.updateUser(p.id, { name: p.name, blocked: !!p.blocked, optOut: !!p.optOut })
    }
    return rows[0].version
  }
}

function emptyWorld(): World {
  return { version: 2, people: {}, plans: {}, clubs: {}, rsvps: {}, tickets: {}, messages: [], texts: [] }
}

function toUser(row: Row): User {
  const f = row.follows
  const follows = Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : []
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
