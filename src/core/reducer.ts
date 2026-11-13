import { canNudge, goingIds, isHostOf, person, rsvpOf, rsvpsFor, seatsLeft, waitlistIds } from './select.js'
import { when } from './format.js'
import type { Club, Debrief, Message, Person, Photo, Plan, PlanUpdate, Poll, Post, ReminderKind, Report, Role, Rsvp, State, Text, TextKind, UpdateKind } from './types.js'

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

export const OFFER_MINUTES = 120
export const HOLD_MINUTES = 10

export type Action =
  | { type: 'you'; patch: Partial<State['you']> }
  | { type: 'role'; role: Role }
  | { type: 'addPerson'; person: Person }
  | { type: 'rsvp'; planId: string; personId: string; status: 'going' | 'declined' | 'waitlist'; at: string }
  | { type: 'withdraw'; planId: string; personId: string; at: string }
  | { type: 'acceptOffer'; planId: string; personId: string; at: string }
  | { type: 'expire'; at: string }
  | { type: 'savePlan'; plan: Plan; at: string }
  | { type: 'publish'; planId: string; at: string }
  | { type: 'cancel'; planId: string; text: string; at: string }
  | { type: 'update'; planId: string; kind: UpdateKind; text: string; patch: Partial<Plan>; recipientIds: string[]; at: string }
  | { type: 'delivered'; results: Array<{ textId: string; status: 'sent' | 'failed' }> }
  | { type: 'retry'; planId: string; updateId: string; at: string }
  | { type: 'message'; message: Message }
  | { type: 'pin'; planId: string; text: string; at: string }
  | { type: 'invite'; planId: string; personIds: string[]; at: string }
  | { type: 'cohost'; planId: string; personId: string; add: boolean }
  | { type: 'view'; planId: string; personId: string }
  | { type: 'debrief'; planId: string; debrief: Debrief }
  | { type: 'hold'; planId: string; personId: string; at: string }
  | { type: 'pay'; planId: string; personId: string; ok: boolean; chargeId: string; at: string }
  | { type: 'refund'; planId: string; personId: string; at: string }
  | { type: 'joinClub'; clubId: string; personId: string }
  | { type: 'requestClub'; clubId: string; personId: string }
  | { type: 'leaveClub'; clubId: string; personId: string }
  | { type: 'muteClub'; clubId: string; personId: string; muted: boolean }
  | { type: 'listMe'; clubId: string; personId: string; listed: boolean }
  | { type: 'post'; clubId: string; post: Post }
  | { type: 'report'; clubId: string; report: Report }
  | { type: 'block'; personId: string; blocked: boolean }
  | { type: 'reconcile'; planId: string; attendedIds: string[] }
  | { type: 'uninvite'; planId: string; personId: string; at: string }
  | { type: 'nudge'; planId: string; personId: string; at: string }
  | { type: 'remind'; planId: string; which: ReminderKind; at: string }
  | { type: 'poll'; planId: string; poll: Poll }
  | { type: 'vote'; planId: string; pollId: string; personId: string; optionId: string }
  | { type: 'closePoll'; planId: string; pollId: string }
  | { type: 'photo'; planId: string; photo: Photo }
  | { type: 'removePhoto'; planId: string; photoId: string; personId: string }
  | { type: 'follow'; personId: string; on: boolean }
  | { type: 'createClub'; club: Club }
  | { type: 'updateClub'; clubId: string; patch: Partial<Pick<Club, 'name' | 'cadence' | 'description' | 'neighborhood'>> }
  | { type: 'deletePlan'; planId: string }

function plus(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString()
}

function setPlan(state: State, plan: Plan): State {
  return { ...state, plans: { ...state.plans, [plan.id]: plan } }
}

function setRsvp(state: State, r: Rsvp): State {
  return { ...state, rsvps: { ...state.rsvps, [`${r.planId}:${r.personId}`]: r } }
}

function dropRsvp(state: State, planId: string, personId: string): State {
  const rsvps = { ...state.rsvps }
  delete rsvps[`${planId}:${personId}`]
  return { ...state, rsvps }
}

function addTexts(state: State, texts: Text[]): State {
  return texts.length ? { ...state, texts: [...state.texts, ...texts] } : state
}

/** Text bodies. `{link}` is filled in by the transport, which knows the app's address. */
function body(kind: TextKind, state: State, plan: Plan, extra = ''): string {
  const host = person(state, plan.hostId).name
  switch (kind) {
    case 'invite':
      return `${host} invited you: ${plan.title}, ${when(plan.startsAt)}. Say yes or no here: {link}`
    case 'update':
      return `${plan.title}: ${extra} Current details: {link}`
    case 'cancel':
      return `${plan.title} is off. ${extra} {link}`
    case 'offer':
      return `A seat opened up for ${plan.title}, ${when(plan.startsAt)}. It's yours for ${OFFER_MINUTES / 60} hours: {link}`
    case 'receipt':
      return `You're in for ${plan.title}. ${extra} {link}`
    case 'reminder':
      return `${extra} ${plan.title}, ${when(plan.startsAt)} at ${plan.venue}. ${plan.hostNote ? `${plan.hostNote} ` : ''}{link}`
    case 'nudge':
      return `${host} is still hoping you'll come to ${plan.title}, ${when(plan.startsAt)}. Yes or no, either helps: {link}`
    default:
      return `${plan.title}: ${extra} {link}`
  }
}

function makeText(kind: TextKind, toId: string, planId: string, text: string, at: string, updateId?: string): Text {
  return { id: uid('t'), toId, body: text, at, status: 'pending', attempts: 1, kind, planId, updateId }
}

/** Open seats go to the waitlist in order, as time-limited offers. */
function promoteWaitlist(state: State, planId: string, at: string): State {
  let s = state
  const plan = s.plans[planId]
  if (!plan || plan.status !== 'published') return s
  let open = seatsLeft(s, planId)
  for (const pid of waitlistIds(s, planId)) {
    if (open <= 0) break
    s = setRsvp(s, { planId, personId: pid, status: 'offered', at, expiresAt: plus(at, OFFER_MINUTES) })
    s = addTexts(s, [makeText('offer', pid, planId, body('offer', s, plan), at)])
    open -= 1
  }
  return s
}

function withUpdate(state: State, plan: Plan, kind: UpdateKind, text: string, recipientIds: string[], at: string, patch: Partial<Plan> = {}, textKind: TextKind = 'update'): State {
  const ids = Array.from(new Set(recipientIds.filter((id) => id !== plan.hostId)))
  const update: PlanUpdate = { id: uid('u'), at, kind, text, recipients: ids.map((personId) => ({ personId, status: 'pending', attempts: 1 })) }
  const next: Plan = { ...plan, ...patch, revision: plan.revision + 1, updates: [...plan.updates, update] }
  let s = setPlan(state, next)
  s = addTexts(
    s,
    ids.map((id) => makeText(textKind, id, plan.id, body(textKind, s, next, text), at, update.id)),
  )
  return s
}

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'you':
      return { ...state, you: { ...state.you, ...action.patch } }
    case 'role':
      return { ...state, you: { ...state.you, role: action.role } }
    case 'addPerson':
      return { ...state, people: { ...state.people, [action.person.id]: action.person } }

    case 'rsvp': {
      const plan = state.plans[action.planId]
      if (!plan || plan.status !== 'published') return state
      const key = `${plan.id}:${action.personId}`
      const existing = state.rsvps[key]
      let status: Rsvp['status'] = action.status
      // One seat per guest: a yes on a full dinner becomes a waitlist spot, never an over-booking.
      if (status === 'going' && existing?.status !== 'going' && seatsLeft(state, plan.id) === 0) status = 'waitlist'
      if (existing && existing.status === status) return state
      let s = setRsvp(state, { planId: plan.id, personId: action.personId, status, at: action.at })
      if (existing?.status === 'going' && status !== 'going') s = promoteWaitlist(s, plan.id, action.at)
      return s
    }
    case 'withdraw': {
      const key = `${action.planId}:${action.personId}`
      const existing = state.rsvps[key]
      if (!existing || existing.status === 'declined') return state
      let s = setRsvp(state, { ...existing, status: 'declined', at: action.at, expiresAt: undefined })
      if (existing.status === 'going' || existing.status === 'offered') s = promoteWaitlist(s, action.planId, action.at)
      return s
    }
    case 'acceptOffer': {
      const r = state.rsvps[`${action.planId}:${action.personId}`]
      if (!r || r.status !== 'offered') return state
      if (r.expiresAt && r.expiresAt < action.at) return state
      return setRsvp(state, { ...r, status: 'going', at: action.at, expiresAt: undefined })
    }
    case 'expire': {
      let s = state
      const touched = new Set<string>()
      for (const r of Object.values(state.rsvps)) {
        if (!r.expiresAt || r.expiresAt > action.at) continue
        if (r.status === 'offered') {
          s = setRsvp(s, { ...r, status: 'expired', expiresAt: undefined })
          touched.add(r.planId)
        } else if (r.status === 'holding') {
          s = dropRsvp(s, r.planId, r.personId)
          touched.add(r.planId)
        }
      }
      for (const planId of touched) s = promoteWaitlist(s, planId, action.at)
      return s
    }

    case 'savePlan': {
      const prev = state.plans[action.plan.id]
      const plan: Plan = { ...action.plan, createdAt: prev?.createdAt ?? action.plan.createdAt ?? action.at }
      return setPlan(state, plan)
    }
    case 'publish': {
      const plan = state.plans[action.planId]
      if (!plan || plan.status !== 'draft') return state
      const hostName = person(state, plan.hostId).name
      const update: PlanUpdate = {
        id: uid('u'),
        at: action.at,
        kind: 'published',
        text: `${hostName} published the plan${plan.invitedIds.length ? ` and invited ${plan.invitedIds.length} people` : ''}.`,
        recipients: plan.invitedIds.map((personId) => ({ personId, status: 'pending', attempts: 1 })),
      }
      const next: Plan = { ...plan, status: 'published', revision: 1, publishedAt: action.at, updates: [...plan.updates, update] }
      let s = setPlan(state, next)
      const hostKey = `${plan.id}:${plan.hostId}`
      if (!s.rsvps[hostKey]) s = setRsvp(s, { planId: plan.id, personId: plan.hostId, status: 'going', at: action.at })
      s = addTexts(
        s,
        plan.invitedIds.map((id) => makeText('invite', id, plan.id, body('invite', s, next), action.at, update.id)),
      )
      return s
    }
    case 'cancel': {
      const plan = state.plans[action.planId]
      if (!plan || plan.status === 'canceled') return state
      const affected = rsvpsFor(state, plan.id)
        .filter((r) => r.status === 'going' || r.status === 'offered' || r.status === 'waitlist')
        .map((r) => r.personId)
      return withUpdate(state, plan, 'cancel', action.text, affected, action.at, { status: 'canceled' }, 'cancel')
    }
    case 'update': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      let s = withUpdate(state, plan, action.kind, action.text, action.recipientIds, action.at, action.patch)
      if (action.patch.capacity && action.patch.capacity > plan.capacity) s = promoteWaitlist(s, plan.id, action.at)
      return s
    }
    case 'delivered': {
      const byId = new Map(action.results.map((r) => [r.textId, r.status]))
      const texts = state.texts.map((t) => (byId.has(t.id) ? { ...t, status: byId.get(t.id)! } : t))
      const plans = { ...state.plans }
      for (const t of state.texts) {
        if (!byId.has(t.id) || !t.planId || !t.updateId) continue
        const plan = plans[t.planId]
        if (!plan) continue
        plans[t.planId] = {
          ...plan,
          updates: plan.updates.map((u) =>
            u.id !== t.updateId ? u : { ...u, recipients: u.recipients.map((r) => (r.personId === t.toId ? { ...r, status: byId.get(t.id)! } : r)) },
          ),
        }
      }
      return { ...state, texts, plans }
    }
    case 'retry': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      const failedIds = new Set(state.texts.filter((t) => t.updateId === action.updateId && t.status === 'failed').map((t) => t.toId))
      if (failedIds.size === 0) return state
      const texts = state.texts.map((t) =>
        t.updateId === action.updateId && t.status === 'failed' ? { ...t, status: 'pending' as const, attempts: t.attempts + 1, at: action.at } : t,
      )
      const updates = plan.updates.map((u) =>
        u.id !== action.updateId
          ? u
          : { ...u, recipients: u.recipients.map((r) => (failedIds.has(r.personId) ? { ...r, status: 'pending' as const, attempts: r.attempts + 1 } : r)) },
      )
      return { ...state, texts, plans: { ...state.plans, [plan.id]: { ...plan, updates } } }
    }

    case 'message':
      return { ...state, messages: [...state.messages, action.message] }
    case 'pin': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      const going = goingIds(state, plan.id)
      return withUpdate(state, plan, 'note', `Meeting point updated: “${action.text}”`, going, action.at, { hostNote: action.text })
    }
    case 'invite': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      const fresh = action.personIds.filter((id) => !plan.invitedIds.includes(id) && id !== plan.hostId && !state.people[id]?.blocked)
      if (fresh.length === 0) return state
      const next: Plan = { ...plan, invitedIds: [...plan.invitedIds, ...fresh] }
      let s = setPlan(state, next)
      if (plan.status === 'published') s = addTexts(s, fresh.map((id) => makeText('invite', id, plan.id, body('invite', s, next), action.at)))
      return s
    }
    case 'cohost': {
      const plan = state.plans[action.planId]
      if (!plan || action.personId === plan.hostId) return state
      const cohostIds = action.add ? Array.from(new Set([...plan.cohostIds, action.personId])) : plan.cohostIds.filter((id) => id !== action.personId)
      return setPlan(state, { ...plan, cohostIds })
    }
    case 'view': {
      const plan = state.plans[action.planId]
      if (!plan || isHostOf(plan, action.personId) || plan.viewerIds.includes(action.personId)) return state
      return setPlan(state, { ...plan, viewerIds: [...plan.viewerIds, action.personId] })
    }
    case 'debrief': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      return setPlan(state, { ...plan, debrief: action.debrief })
    }

    case 'hold': {
      const plan = state.plans[action.planId]
      if (!plan || plan.status !== 'published') return state
      const existing = state.rsvps[`${plan.id}:${action.personId}`]
      if (existing?.status === 'going' || existing?.status === 'holding') return state
      if (existing?.status !== 'offered' && seatsLeft(state, plan.id) === 0) return state
      return setRsvp(state, { planId: plan.id, personId: action.personId, status: 'holding', at: action.at, expiresAt: plus(action.at, HOLD_MINUTES) })
    }
    case 'pay': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      const existing = state.rsvps[`${plan.id}:${action.personId}`]
      if (!existing || existing.status !== 'holding') return state
      const ticketId = uid('tk')
      if (!action.ok) {
        const s = dropRsvp(state, plan.id, action.personId)
        return {
          ...s,
          tickets: { ...s.tickets, [ticketId]: { id: ticketId, planId: plan.id, personId: action.personId, amount: plan.cost, status: 'failed', chargeId: action.chargeId, at: action.at } },
        }
      }
      let s = setRsvp(state, { ...existing, status: 'going', at: action.at, expiresAt: undefined })
      s = { ...s, tickets: { ...s.tickets, [ticketId]: { id: ticketId, planId: plan.id, personId: action.personId, amount: plan.cost, status: 'paid', chargeId: action.chargeId, at: action.at } } }
      s = addTexts(s, [makeText('receipt', action.personId, plan.id, body('receipt', s, plan, `$${plan.cost} paid, ${when(plan.startsAt)}.`), action.at)])
      return s
    }
    case 'refund': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      const ticket = Object.values(state.tickets)
        .filter((t) => t.planId === plan.id && t.personId === action.personId && t.status === 'paid')
        .sort((a, b) => b.at.localeCompare(a.at))[0]
      if (!ticket) return state
      let s: State = { ...state, tickets: { ...state.tickets, [ticket.id]: { ...ticket, status: 'refunded' } } }
      const r = s.rsvps[`${plan.id}:${action.personId}`]
      if (r && r.status === 'going') {
        s = setRsvp(s, { ...r, status: 'declined', at: action.at })
        s = promoteWaitlist(s, plan.id, action.at)
      }
      return s
    }

    case 'joinClub': {
      const club = state.clubs[action.clubId]
      if (!club || club.memberIds.includes(action.personId) || state.people[action.personId]?.blocked) return state
      return setClub(state, { ...club, memberIds: [...club.memberIds, action.personId], requestIds: club.requestIds.filter((id) => id !== action.personId) })
    }
    case 'requestClub': {
      const club = state.clubs[action.clubId]
      if (!club || club.requestIds.includes(action.personId) || club.memberIds.includes(action.personId)) return state
      return setClub(state, { ...club, requestIds: [...club.requestIds, action.personId] })
    }
    case 'leaveClub': {
      const club = state.clubs[action.clubId]
      if (!club) return state
      const out = (ids: string[]) => ids.filter((id) => id !== action.personId)
      return setClub(state, { ...club, memberIds: out(club.memberIds), mutedIds: out(club.mutedIds), requestIds: out(club.requestIds), listedIds: out(club.listedIds) })
    }
    case 'muteClub': {
      const club = state.clubs[action.clubId]
      if (!club) return state
      const mutedIds = action.muted ? Array.from(new Set([...club.mutedIds, action.personId])) : club.mutedIds.filter((id) => id !== action.personId)
      return setClub(state, { ...club, mutedIds })
    }
    case 'listMe': {
      const club = state.clubs[action.clubId]
      if (!club) return state
      const listedIds = action.listed ? Array.from(new Set([...club.listedIds, action.personId])) : club.listedIds.filter((id) => id !== action.personId)
      return setClub(state, { ...club, listedIds })
    }
    case 'post': {
      const club = state.clubs[action.clubId]
      if (!club) return state
      return setClub(state, { ...club, posts: [...club.posts, action.post] })
    }
    case 'report': {
      const club = state.clubs[action.clubId]
      if (!club) return state
      return setClub(state, { ...club, reports: [...club.reports, action.report] })
    }
    case 'block': {
      const p = state.people[action.personId]
      if (!p) return state
      let s: State = { ...state, people: { ...state.people, [p.id]: { ...p, blocked: action.blocked } } }
      if (action.blocked) {
        for (const club of Object.values(s.clubs)) {
          if (club.memberIds.includes(p.id) || club.requestIds.includes(p.id)) s = reduce(s, { type: 'leaveClub', clubId: club.id, personId: p.id })
        }
      }
      return s
    }
    case 'reconcile': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      return setPlan(state, { ...plan, attendedIds: action.attendedIds })
    }
    case 'uninvite': {
      const plan = state.plans[action.planId]
      if (!plan || action.personId === plan.hostId) return state
      let s = setPlan(state, { ...plan, invitedIds: plan.invitedIds.filter((id) => id !== action.personId), cohostIds: plan.cohostIds.filter((id) => id !== action.personId) })
      const r = rsvpOf(s, plan.id, action.personId)
      if (r && r.status !== 'declined') {
        s = setRsvp(s, { ...r, status: 'declined', at: action.at, expiresAt: undefined })
        if (r.status === 'going' || r.status === 'offered' || r.status === 'holding') s = promoteWaitlist(s, plan.id, action.at)
      }
      return s
    }
    case 'nudge': {
      const plan = state.plans[action.planId]
      if (!plan || plan.status !== 'published' || !canNudge(plan, action.personId, action.at)) return state
      if (!plan.invitedIds.includes(action.personId) || rsvpOf(state, plan.id, action.personId)) return state
      let s = setPlan(state, { ...plan, nudgedAt: { ...plan.nudgedAt, [action.personId]: action.at } })
      s = addTexts(s, [makeText('nudge', action.personId, plan.id, body('nudge', s, plan), action.at)])
      return s
    }
    case 'remind': {
      const plan = state.plans[action.planId]
      if (!plan || plan.status !== 'published' || plan.remindersSent.includes(action.which)) return state
      const going = goingIds(state, plan.id).filter((id) => id !== plan.hostId)
      const lead = action.which === 'day' ? 'Tomorrow:' : 'In about two hours:'
      let s = setPlan(state, { ...plan, remindersSent: [...plan.remindersSent, action.which] })
      s = addTexts(s, going.map((id) => makeText('reminder', id, plan.id, body('reminder', s, plan, lead), action.at)))
      return s
    }
    case 'poll': {
      const plan = state.plans[action.planId]
      if (!plan || plan.polls.some((p) => p.id === action.poll.id)) return state
      return setPlan(state, { ...plan, polls: [...plan.polls, action.poll] })
    }
    case 'vote': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      const polls = plan.polls.map((p) => (p.id !== action.pollId || p.closed || !p.options.some((o) => o.id === action.optionId) ? p : { ...p, votes: { ...p.votes, [action.personId]: action.optionId } }))
      return setPlan(state, { ...plan, polls })
    }
    case 'closePoll': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      return setPlan(state, { ...plan, polls: plan.polls.map((p) => (p.id === action.pollId ? { ...p, closed: true } : p)) })
    }
    case 'photo': {
      const plan = state.plans[action.planId]
      if (!plan || plan.photos.some((p) => p.id === action.photo.id)) return state
      return setPlan(state, { ...plan, photos: [...plan.photos, action.photo] })
    }
    case 'removePhoto': {
      const plan = state.plans[action.planId]
      if (!plan) return state
      return setPlan(state, { ...plan, photos: plan.photos.filter((p) => p.id !== action.photoId) })
    }
    case 'follow': {
      const ids = action.on ? Array.from(new Set([...state.you.followIds, action.personId])) : state.you.followIds.filter((id) => id !== action.personId)
      return { ...state, you: { ...state.you, followIds: ids } }
    }
    case 'createClub': {
      if (state.clubs[action.club.id]) return state
      return setClub(state, action.club)
    }
    case 'updateClub': {
      const club = state.clubs[action.clubId]
      if (!club) return state
      return setClub(state, { ...club, ...action.patch })
    }
    case 'deletePlan': {
      const plan = state.plans[action.planId]
      if (!plan || plan.status !== 'draft') return state
      const plans = { ...state.plans }
      delete plans[plan.id]
      return { ...state, plans }
    }
    default:
      return state
  }
}

function setClub(state: State, club: Club): State {
  return { ...state, clubs: { ...state.clubs, [club.id]: club } }
}

/** Whether an actor may perform an action. Shared by the client (to hide controls) and the server (to refuse). */
export function allowed(state: State, actorId: string, action: Action): boolean {
  const plan = 'planId' in action ? state.plans[action.planId] : undefined
  const host = plan ? isHostOf(plan, actorId) : false
  const self = 'personId' in action ? action.personId === actorId : true
  switch (action.type) {
    case 'you':
    case 'role':
    case 'expire':
    case 'delivered':
      return true
    case 'follow':
      return actorId !== action.personId
    case 'createClub':
      return action.club.organizerId === actorId
    case 'updateClub':
      return state.clubs[action.clubId]?.organizerId === actorId
    case 'deletePlan':
      return !!plan && plan.hostId === actorId
    case 'uninvite':
    case 'nudge':
    case 'remind':
    case 'poll':
    case 'closePoll':
      return host
    case 'vote': {
      if (!plan || !self) return false
      return host || rsvpOf(state, plan.id, actorId)?.status === 'going'
    }
    case 'photo': {
      if (!plan || action.photo.byId !== actorId) return false
      return host || rsvpOf(state, plan.id, actorId)?.status === 'going' || !!plan.attendedIds?.includes(actorId)
    }
    case 'removePhoto': {
      if (!plan) return false
      const ph = plan.photos.find((x) => x.id === action.photoId)
      return host || (!!ph && ph.byId === actorId && self)
    }
    case 'addPerson':
      return true
    case 'rsvp':
    case 'withdraw':
    case 'acceptOffer':
    case 'hold':
    case 'pay':
    case 'view':
      return self
    case 'savePlan': {
      const prev = state.plans[action.plan.id]
      return action.plan.hostId === actorId || (!!prev && isHostOf(prev, actorId))
    }
    case 'publish':
    case 'update':
    case 'retry':
    case 'pin':
    case 'invite':
    case 'reconcile':
    case 'debrief':
    case 'refund':
      return host
    case 'cancel':
    case 'cohost':
      return !!plan && plan.hostId === actorId
    case 'message':
      return action.message.fromId === actorId
    case 'joinClub': {
      const club = state.clubs[action.clubId]
      return !!club && (self || club.organizerId === actorId)
    }
    case 'requestClub':
    case 'leaveClub':
    case 'muteClub':
    case 'listMe':
      return self
    case 'post':
      return state.clubs[action.clubId]?.organizerId === actorId
    case 'report':
      return action.report.byId === actorId
    case 'block':
      return Object.values(state.clubs).some((c) => c.organizerId === actorId)
    default:
      return false
  }
}
