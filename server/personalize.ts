import { canSee, isHostOf, redactPlan } from '../src/core/select.js'
import type { Plan, State } from '../src/core/types.js'
import type { User, World } from './store.js'

/**
 * The client always calls the current user "you". The server keeps real ids and
 * translates at the boundary, so the same screens run in both modes.
 */
export function toClientId(id: string, userId: string | null): string {
  return userId !== null && id === userId ? 'you' : id
}

export function fromClientId(id: string, userId: string | null): string {
  return id === 'you' ? (userId ?? 'you') : id
}

function remapPlan(plan: Plan, userId: string | null): Plan {
  const m = (id: string) => toClientId(id, userId)
  return {
    ...plan,
    hostId: m(plan.hostId),
    cohostIds: plan.cohostIds.map(m),
    invitedIds: plan.invitedIds.map(m),
    viewerIds: plan.viewerIds.map(m),
    attendedIds: plan.attendedIds?.map(m),
    updates: plan.updates.map((u) => ({ ...u, recipients: u.recipients.map((r) => ({ ...r, personId: m(r.personId) })) })),
  }
}

/** What one person is allowed to see, with their own id spelled "you". */
export function personalize(world: World, user: User | null): State {
  const userId = user?.id ?? null
  const m = (id: string) => toClientId(id, userId)
  const base: State = { ...world, you: { id: 'you', name: '', phone: '', role: 'guest', showFaces: true, followIds: [] } }
  const plans: State['plans'] = {}
  const visible = new Set<string>()
  const hosting = new Set<string>()
  for (const plan of Object.values(world.plans)) {
    const viewer = userId ?? '__anon__'
    if (isHostOf(plan, viewer)) hosting.add(plan.id)
    if (canSee(base, plan, viewer)) {
      plans[plan.id] = remapPlan(plan, userId)
      visible.add(plan.id)
    } else if (plan.status !== 'draft') {
      plans[plan.id] = remapPlan(redactPlan(plan), userId)
    }
  }
  const people: State['people'] = {}
  for (const p of Object.values(world.people)) if (p.id !== userId) people[p.id] = { ...p, phone: undefined }
  const rsvps: State['rsvps'] = {}
  for (const r of Object.values(world.rsvps)) {
    if (!visible.has(r.planId)) continue
    const pid = m(r.personId)
    rsvps[`${r.planId}:${pid}`] = { ...r, personId: pid }
  }
  const tickets: State['tickets'] = {}
  for (const t of Object.values(world.tickets)) if (t.personId === userId || hosting.has(t.planId)) tickets[t.id] = { ...t, personId: m(t.personId) }
  const messages = world.messages.filter((x) => visible.has(x.planId)).map((x) => ({ ...x, fromId: m(x.fromId) }))
  const texts = world.texts.filter((t) => t.toId === userId || (t.planId && hosting.has(t.planId))).map((t) => ({ ...t, toId: m(t.toId) }))
  const clubs: State['clubs'] = {}
  for (const c of Object.values(world.clubs)) {
    const organizer = c.organizerId === userId
    clubs[c.id] = {
      ...c,
      organizerId: m(c.organizerId),
      memberIds: c.memberIds.map(m),
      mutedIds: organizer || userId ? c.mutedIds.filter((id) => organizer || id === userId).map(m) : [],
      requestIds: organizer ? c.requestIds.map(m) : c.requestIds.filter((id) => id === userId).map(m),
      listedIds: c.listedIds.map(m),
      posts: c.posts.map((p) => ({ ...p, byId: m(p.byId) })),
      reports: organizer ? c.reports.map((r) => ({ ...r, byId: m(r.byId), aboutId: m(r.aboutId) })) : [],
    }
  }
  return {
    version: 2,
    you: { id: 'you', name: user?.name ?? '', phone: user?.phone ?? '', role: 'guest', showFaces: user?.showFaces ?? true, followIds: user?.follows ?? [] },
    people,
    clubs,
    plans,
    rsvps,
    messages,
    tickets,
    texts,
  }
}

/** Rewrites "you" to the real user id anywhere an action names a person. */
export function deref<T>(value: T, userId: string): T {
  if (typeof value === 'string') return (value === 'you' ? userId : value) as T
  if (Array.isArray(value)) return value.map((v) => deref(v, userId)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Free text stays as written; only id-shaped fields are translated.
      out[k] = typeof v === 'string' && !/Id$|Ids$|^id$/.test(k) && k !== 'personId' ? v : deref(v, userId)
    }
    return out as T
  }
  return value
}
