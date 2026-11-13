import type { Audience, Club, Person, Plan, ReminderKind, Rsvp, State, Text } from './types.js'

export function personName(state: State, id: string): string {
  if (id === 'you') return state.you.name || 'you'
  return state.people[id]?.name ?? 'someone'
}

export function person(state: State, id: string): Person {
  if (id === 'you') return { id: 'you', name: state.you.name || 'you', tone: 'charcoal', phone: state.you.phone }
  return state.people[id] ?? { id, name: 'someone', tone: 'gray' }
}

export function rsvpOf(state: State, planId: string, personId: string): Rsvp | undefined {
  return state.rsvps[`${planId}:${personId}`]
}

export function rsvpsFor(state: State, planId: string): Rsvp[] {
  return Object.values(state.rsvps).filter((r) => r.planId === planId)
}

/** Confirmed people, host first, then in the order they said yes. */
export function goingIds(state: State, planId: string): string[] {
  const plan = state.plans[planId]
  const ids = rsvpsFor(state, planId)
    .filter((r) => r.status === 'going')
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((r) => r.personId)
  if (plan && !ids.includes(plan.hostId)) ids.unshift(plan.hostId)
  return ids
}

/** Seats that are taken or held: going, plus open offers and checkout holds. */
export function occupiedCount(state: State, planId: string): number {
  const held = rsvpsFor(state, planId).filter((r) => r.status === 'offered' || r.status === 'holding').length
  return goingIds(state, planId).length + held
}

export function seatsLeft(state: State, planId: string): number {
  const plan = state.plans[planId]
  if (!plan) return 0
  return Math.max(0, plan.capacity - occupiedCount(state, planId))
}

export function isFull(state: State, planId: string): boolean {
  return seatsLeft(state, planId) === 0
}

export function waitlistIds(state: State, planId: string): string[] {
  return rsvpsFor(state, planId)
    .filter((r) => r.status === 'waitlist')
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((r) => r.personId)
}

/** Who is acting right now: the guest, or Maya when the local demo's host view is on. */
export function actorId(state: State): string {
  return state.you.role === 'host' ? 'maya' : 'you'
}

export function isHostOf(plan: Plan, personId: string): boolean {
  return plan.hostId === personId || plan.cohostIds.includes(personId)
}

export function canSee(_state: State, plan: Plan, viewerId: string): boolean {
  if (plan.restricted) return false
  if (isHostOf(plan, viewerId)) return true
  if (plan.status === 'draft') return false
  if (plan.audience !== 'invited') return true
  return plan.invitedIds.includes(viewerId)
}

export function hostedBy(state: State, hostId: string): Plan[] {
  return Object.values(state.plans)
    .filter((p) => isHostOf(p, hostId))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

export function messagesFor(state: State, planId: string) {
  return state.messages.filter((m) => m.planId === planId).sort((a, b) => a.at.localeCompare(b.at))
}

export function textsFor(state: State, planId: string): Text[] {
  return state.texts.filter((t) => t.planId === planId).sort((a, b) => b.at.localeCompare(a.at))
}

export function ticketOf(state: State, planId: string, personId: string) {
  return Object.values(state.tickets)
    .filter((t) => t.planId === planId && t.personId === personId)
    .sort((a, b) => b.at.localeCompare(a.at))[0]
}

export function audienceLabel(a: Audience): string {
  return a === 'invited' ? 'invited people' : a === 'link' ? 'anyone with the link' : 'public'
}

export function audienceConsequence(a: Audience): string {
  return a === 'invited'
    ? 'Only people you invite can open it. A forwarded link shows the title and nothing else.'
    : a === 'link'
      ? 'Anyone who gets the link can join. It stays out of search.'
      : 'It can show up in discovery for people nearby. Anyone can join until it fills.'
}

export interface AudienceReview {
  members: Person[]
  previous: Person[]
  excluded: Array<{ person: Person; reason: string }>
  duplicates: Person[]
  final: Person[]
}

/** Who gets the next invitation: club members who want invites plus eligible previous guests, deduplicated. */
export function reviewAudience(state: State, club: Club | undefined, previous: Plan | undefined): AudienceReview {
  const members: Person[] = []
  const prev: Person[] = []
  const excluded: AudienceReview['excluded'] = []
  const duplicates: Person[] = []
  const seen = new Set<string>()
  const final: Person[] = []
  const consider = (p: Person, bucket: Person[]) => {
    if (p.id === club?.organizerId || p.id === previous?.hostId) return
    const exclude = (reason: string) => {
      if (!excluded.some((e) => e.person.id === p.id)) excluded.push({ person: p, reason })
    }
    if (p.blocked) return exclude('blocked')
    if (p.optOut || (club && club.mutedIds.includes(p.id))) return exclude('opted out of invitations')
    bucket.push(p)
    if (seen.has(p.id)) duplicates.push(p)
    else {
      seen.add(p.id)
      final.push(p)
    }
  }
  club?.memberIds.forEach((id) => consider(person(state, id), members))
  const prevIds = previous?.attendedIds ?? (previous ? goingIds(state, previous.id) : [])
  prevIds.forEach((id) => consider(person(state, id), prev))
  return { members, previous: prev, excluded, duplicates, final }
}

/** The public preview of a restricted plan: no address, note, roster, or audience. */
export function redactPlan(plan: Plan): Plan {
  return {
    ...plan,
    address: '',
    hostNote: '',
    description: undefined,
    invitedIds: [],
    cohostIds: [],
    viewerIds: [],
    attendedIds: undefined,
    updates: [],
    debrief: undefined,
    polls: [],
    photos: [],
    nudgedAt: {},
    cover: plan.cover.kind === 'photo' ? plan.cover : { kind: 'poster', tone: 'charcoal' },
    restricted: true,
  }
}

/** Reminder texts that are due: the day before and two hours before, each once. */
export function dueReminders(state: State, now: string): Array<{ planId: string; which: ReminderKind }> {
  const t = new Date(now).getTime()
  const out: Array<{ planId: string; which: ReminderKind }> = []
  for (const p of Object.values(state.plans)) {
    if (p.status !== 'published') continue
    const start = new Date(p.startsAt).getTime()
    const hours = (start - t) / 3600000
    if (hours <= 0) continue
    if (hours <= 24 && !p.remindersSent.includes('day')) out.push({ planId: p.id, which: 'day' })
    if (hours <= 2 && !p.remindersSent.includes('soon')) out.push({ planId: p.id, which: 'soon' })
  }
  return out
}

/** People going whom the viewer follows and who allow being shown. Both sides must permit it. */
export function familiarFaces(state: State, planId: string, viewerId: string): string[] {
  if (!state.you.showFaces) return []
  const follows = new Set(state.you.followIds)
  return goingIds(state, planId).filter((id) => id !== viewerId && follows.has(id) && !state.people[id]?.hideFace)
}

export function canNudge(plan: Plan, personId: string, now: string): boolean {
  const last = plan.nudgedAt[personId]
  return !last || new Date(now).getTime() - new Date(last).getTime() > 24 * 3600000
}
