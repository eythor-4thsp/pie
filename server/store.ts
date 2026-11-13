import type { Person, State } from '../src/core/types.js'

/** The server's world: the same State shape the client runs, minus a point of view. */
export type World = Omit<State, 'you'>

export interface User {
  id: string
  phone: string
  name: string
  tone: Person['tone']
  createdAt: string
  showFaces: boolean
  follows: string[]
  optOut: boolean
  blocked: boolean
}

export type UserPatch = Partial<Pick<User, 'name' | 'showFaces' | 'follows' | 'optOut' | 'blocked'>>

export interface WorldRecord {
  world: World
  /** Monotonic version for compare-and-swap writes: two requests racing for the last seat cannot both win. */
  version: number
}

/**
 * Everything the app needs from storage. SQLite for one process on one machine,
 * Postgres for serverless, both behind the same promise-based surface.
 */
export interface Store {
  loadWorld(seedIfEmpty: boolean): Promise<WorldRecord>
  /** Returns the new version, or null when someone else wrote first. */
  saveWorld(world: World, expectedVersion: number): Promise<number | null>
  userByPhone(phone: string): Promise<User | undefined>
  userById(id: string): Promise<User | undefined>
  createUser(u: User): Promise<void>
  updateUser(id: string, patch: UserPatch): Promise<void>
  people(): Promise<Record<string, Person>>
  setCode(phone: string, code: string, expiresAt: string): Promise<void>
  checkCode(phone: string, code: string, now: string): Promise<boolean>
  createSession(token: string, userId: string, now: string): Promise<void>
  sessionUser(token: string): Promise<User | undefined>
  deleteSession(token: string): Promise<void>
  audit(at: string, userId: string | null, action: unknown): Promise<void>
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `+1${digits}`
  return `+${digits}`
}

export function userToPerson(u: User): Person {
  return { id: u.id, name: u.name, tone: u.tone, phone: u.phone, optOut: u.optOut, blocked: u.blocked, hideFace: !u.showFaces }
}
