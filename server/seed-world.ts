import { buildSeed, SEED_PEOPLE } from '../src/core/seed.js'
import { normalizePhone, type User, type World } from './store.js'

/** Demo data for a fresh pilot database: the fictional club and its people, each with a phone that can log in. */
export function seedWorld(now = new Date().toISOString()): { users: User[]; world: World } {
  const s = buildSeed()
  const users: User[] = SEED_PEOPLE.map((p) => ({
    id: p.id,
    phone: normalizePhone(p.phone ?? ''),
    name: p.name,
    tone: p.tone,
    createdAt: now,
    showFaces: true,
    follows: [],
    optOut: !!p.optOut,
    blocked: !!p.blocked,
  }))
  // The seed's guest, "you", becomes a real pilot guest with a login of their own.
  users.push({ id: 'guest', phone: '+12125550100', name: '', tone: 'charcoal', createdAt: now, showFaces: true, follows: ['maya', 'ben', 'priya', 'lena'], optOut: false, blocked: false })
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
          polls: p.polls.map((poll) => ({ ...poll, byId: swap(poll.byId), votes: Object.fromEntries(Object.entries(poll.votes).map(([k, v]) => [swap(k), v])) })),
          photos: p.photos.map((ph) => ({ ...ph, byId: swap(ph.byId) })),
        },
      ]),
    ),
    clubs: s.clubs,
    rsvps: Object.fromEntries(Object.values(s.rsvps).map((r) => [`${r.planId}:${swap(r.personId)}`, { ...r, personId: swap(r.personId) }])),
    tickets: s.tickets,
    messages: s.messages.map((m) => ({ ...m, fromId: swap(m.fromId) })),
    texts: s.texts.map((t) => ({ ...t, toId: swap(t.toId) })),
  }
  return { users, world }
}
