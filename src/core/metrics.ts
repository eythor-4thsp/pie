import { goingIds, hostedBy, rsvpsFor } from './select.js'
import { isPast } from './format.js'
import type { Plan, State } from './types.js'

export interface GatheringMetrics {
  plan: Plan
  seats: number
  confirmed: number
  attended: number | null
  viewers: number
  conversion: number | null
  showUp: number | null
  returning: number
  firstTimers: number
  revenue: number
  refunded: number
  minutesToPublish: number | null
  interventions: number | null
  outsideTexts: number | null
}

function minutesBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000))
}

/** Per-gathering numbers a host can act on. Counts stay beside every rate. */
export function gatheringMetrics(state: State, plan: Plan): GatheringMetrics {
  const going = goingIds(state, plan.id).filter((id) => id !== plan.hostId)
  const attended = plan.attendedIds ? plan.attendedIds.filter((id) => id !== plan.hostId) : null
  const earlier = hostedBy(state, plan.hostId).filter((p) => p.id !== plan.id && p.startsAt < plan.startsAt && p.status === 'published')
  const seenBefore = new Set(earlier.flatMap((p) => p.attendedIds ?? goingIds(state, p.id)))
  const cohort = attended ?? going
  const returning = cohort.filter((id) => seenBefore.has(id)).length
  const tickets = Object.values(state.tickets).filter((t) => t.planId === plan.id)
  const viewers = plan.viewerIds.length
  return {
    plan,
    seats: plan.capacity,
    confirmed: going.length,
    attended: attended ? attended.length : null,
    viewers,
    conversion: viewers > 0 ? going.length / viewers : null,
    showUp: attended && going.length > 0 ? attended.length / going.length : null,
    returning,
    firstTimers: cohort.length - returning,
    revenue: tickets.filter((t) => t.status === 'paid').reduce((n, t) => n + t.amount, 0),
    refunded: tickets.filter((t) => t.status === 'refunded').reduce((n, t) => n + t.amount, 0),
    minutesToPublish: plan.debrief?.minutesToPublish ?? minutesBetween(plan.createdAt, plan.publishedAt),
    interventions: plan.debrief?.interventions ?? null,
    outsideTexts: plan.debrief?.outsideTexts ?? null,
  }
}

export interface HostMetrics {
  gatherings: GatheringMetrics[]
  repeatRate: number | null
  repeatCount: { returned: number; eligible: number }
  publishedAgain: boolean
}

export function hostMetrics(state: State, hostId: string): HostMetrics {
  const plans = hostedBy(state, hostId).filter((p) => p.status !== 'draft')
  const gatherings = plans.map((p) => gatheringMetrics(state, p))
  const past = plans.filter((p) => isPast(p.startsAt) && p.status === 'published')
  let returned = 0
  let eligible = 0
  if (past.length >= 2) {
    const first = past[past.length - 2]
    const second = past[past.length - 1]
    const firstAttended = (first.attendedIds ?? goingIds(state, first.id)).filter((id) => id !== hostId)
    const invitedBack = new Set(second.invitedIds)
    const secondAttended = new Set(second.attendedIds ?? goingIds(state, second.id))
    const pool = firstAttended.filter((id) => invitedBack.has(id))
    eligible = pool.length
    returned = pool.filter((id) => secondAttended.has(id)).length
  }
  return {
    gatherings,
    repeatRate: eligible > 0 ? returned / eligible : null,
    repeatCount: { returned, eligible },
    publishedAgain: plans.some((p) => p.repeatOf),
  }
}

/** Discovery supply: bookable public plans per upcoming weekend in a neighborhood. */
export function supply(state: State, neighborhood: string, now = new Date()): Array<{ weekend: string; plans: number; hosts: number }> {
  const out: Array<{ weekend: string; plans: number; hosts: number }> = []
  for (let w = 0; w < 3; w++) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const dow = start.getDay()
    start.setDate(start.getDate() + ((5 - dow + 7) % 7) + w * 7)
    const end = new Date(start)
    end.setDate(end.getDate() + 3)
    const plans = Object.values(state.plans).filter((p) => {
      const t = new Date(p.startsAt)
      return p.audience === 'public' && p.status === 'published' && p.neighborhood === neighborhood && t >= start && t < end && rsvpsFor(state, p.id).length < p.capacity
    })
    out.push({ weekend: start.toISOString(), plans: plans.length, hosts: new Set(plans.map((p) => p.hostId)).size })
  }
  return out
}
