import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSeed } from '../src/core/seed'
import { allowed, reduce, type Action } from '../src/core/reducer'
import { dueReminders, goingIds, reviewAudience, rsvpOf, seatsLeft } from '../src/core/select'
import type { Plan, State } from '../src/core/types'

const T0 = '2026-11-13T18:00:00.000Z'
const later = (min: number) => new Date(new Date(T0).getTime() + min * 60000).toISOString()

function smallDinner(state: State, capacity = 2): { state: State; plan: Plan } {
  const plan: Plan = {
    ...state.plans['friday-dumplings'],
    id: 'tiny',
    title: 'tiny table',
    capacity,
    invitedIds: ['you', 'ben', 'priya', 'sam'],
    status: 'draft',
    revision: 0,
    updates: [],
    publishedAt: undefined,
  }
  let s = reduce(state, { type: 'savePlan', plan, at: T0 })
  s = reduce(s, { type: 'publish', planId: 'tiny', at: T0 })
  return { state: s, plan: s.plans['tiny'] }
}

test('publishing is idempotent and counts the host as going', () => {
  const { state } = smallDinner(buildSeed())
  const again = reduce(state, { type: 'publish', planId: 'tiny', at: later(1) })
  assert.equal(again, state, 'a second publish changes nothing')
  assert.equal(state.plans['tiny'].revision, 1)
  assert.deepEqual(goingIds(state, 'tiny'), ['maya'])
  assert.equal(state.texts.filter((t) => t.planId === 'tiny' && t.kind === 'invite').length, 4)
})

test('one seat per guest: a yes on a full dinner becomes a waitlist spot', () => {
  let { state } = smallDinner(buildSeed(), 2)
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'ben', status: 'going', at: later(1) })
  assert.equal(seatsLeft(state, 'tiny'), 0)
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'priya', status: 'going', at: later(2) })
  assert.equal(rsvpOf(state, 'tiny', 'priya')?.status, 'waitlist')
  assert.deepEqual(goingIds(state, 'tiny'), ['maya', 'ben'])
  // repeated taps do not duplicate anything
  const twice = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'ben', status: 'going', at: later(3) })
  assert.equal(twice, state)
})

test('a withdrawal offers the seat to the next in line, with a clock', () => {
  let { state } = smallDinner(buildSeed(), 2)
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'ben', status: 'going', at: later(1) })
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'priya', status: 'waitlist', at: later(2) })
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'sam', status: 'waitlist', at: later(3) })
  state = reduce(state, { type: 'withdraw', planId: 'tiny', personId: 'ben', at: later(10) })
  const offer = rsvpOf(state, 'tiny', 'priya')
  assert.equal(offer?.status, 'offered')
  assert.equal(offer?.expiresAt, later(10 + 120))
  assert.equal(seatsLeft(state, 'tiny'), 0, 'an open offer holds the seat')
  assert.equal(state.texts.filter((t) => t.kind === 'offer' && t.toId === 'priya').length, 1)
  // the offer lapses: sam is next
  state = reduce(state, { type: 'expire', at: later(10 + 121) })
  assert.equal(rsvpOf(state, 'tiny', 'priya')?.status, 'expired')
  assert.equal(rsvpOf(state, 'tiny', 'sam')?.status, 'offered')
  state = reduce(state, { type: 'acceptOffer', planId: 'tiny', personId: 'sam', at: later(140) })
  assert.deepEqual(goingIds(state, 'tiny'), ['maya', 'sam'])
})

test('a retry only goes to the texts that failed', () => {
  let { state } = smallDinner(buildSeed(), 4)
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'ben', status: 'going', at: later(1) })
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'priya', status: 'going', at: later(2) })
  state = reduce(state, { type: 'update', planId: 'tiny', kind: 'note', text: 'back room', patch: { hostNote: 'back room' }, recipientIds: ['ben', 'priya'], at: later(5) })
  const update = state.plans['tiny'].updates.at(-1)!
  const texts = state.texts.filter((t) => t.updateId === update.id)
  assert.equal(texts.length, 2)
  state = reduce(state, { type: 'delivered', results: [{ textId: texts[0].id, status: 'sent' }, { textId: texts[1].id, status: 'failed' }] })
  assert.deepEqual(
    state.plans['tiny'].updates.at(-1)!.recipients.map((r) => r.status),
    ['sent', 'failed'],
  )
  state = reduce(state, { type: 'retry', planId: 'tiny', updateId: update.id, at: later(6) })
  const after = state.texts.filter((t) => t.updateId === update.id)
  assert.equal(after[0].status, 'sent')
  assert.equal(after[0].attempts, 1)
  assert.equal(after[1].status, 'pending')
  assert.equal(after[1].attempts, 2)
})

test('cancel reaches everyone who said yes or is waiting, and the record stays', () => {
  let { state } = smallDinner(buildSeed(), 2)
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'ben', status: 'going', at: later(1) })
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'priya', status: 'waitlist', at: later(2) })
  state = reduce(state, { type: 'cancel', planId: 'tiny', text: 'Maya canceled: rain.', at: later(3) })
  assert.equal(state.plans['tiny'].status, 'canceled')
  assert.equal(state.plans['tiny'].revision, 2)
  assert.deepEqual(state.plans['tiny'].updates.at(-1)!.recipients.map((r) => r.personId).sort(), ['ben', 'priya'])
})

test('checkout holds a seat, a charge makes a ticket, a decline releases the hold', () => {
  let { state } = smallDinner(buildSeed(), 2)
  state = reduce(state, { type: 'savePlan', plan: { ...state.plans['tiny'], cost: 25, payment: 'checkout' }, at: later(1) })
  state = reduce(state, { type: 'hold', planId: 'tiny', personId: 'ben', at: later(2) })
  assert.equal(rsvpOf(state, 'tiny', 'ben')?.status, 'holding')
  assert.equal(seatsLeft(state, 'tiny'), 0)
  const blocked = reduce(state, { type: 'hold', planId: 'tiny', personId: 'priya', at: later(3) })
  assert.equal(rsvpOf(blocked, 'tiny', 'priya'), undefined, 'no second hold on the last seat')
  const declined = reduce(state, { type: 'pay', planId: 'tiny', personId: 'ben', ok: false, chargeId: 'ch_x', at: later(4) })
  assert.equal(rsvpOf(declined, 'tiny', 'ben'), undefined)
  assert.equal(seatsLeft(declined, 'tiny'), 1)
  state = reduce(state, { type: 'pay', planId: 'tiny', personId: 'ben', ok: true, chargeId: 'ch_ok', at: later(4) })
  assert.equal(rsvpOf(state, 'tiny', 'ben')?.status, 'going')
  const ticket = Object.values(state.tickets).find((t) => t.planId === 'tiny' && t.personId === 'ben')
  assert.equal(ticket?.status, 'paid')
  assert.equal(ticket?.amount, 25)
  state = reduce(state, { type: 'refund', planId: 'tiny', personId: 'ben', at: later(5) })
  assert.equal(Object.values(state.tickets).find((t) => t.planId === 'tiny' && t.personId === 'ben')?.status, 'refunded')
  assert.equal(rsvpOf(state, 'tiny', 'ben')?.status, 'declined')
})

test('the next invitation merges members and previous guests once, minus opt-outs and blocks', () => {
  const state = buildSeed()
  const review = reviewAudience(state, state.clubs['wvsc'], state.plans['october-supper'])
  const ids = review.final.map((p) => p.id)
  assert.equal(new Set(ids).size, ids.length, 'no duplicates')
  assert.ok(!ids.includes('noor'), 'opted out')
  assert.ok(!ids.includes('ivy'), 'blocked')
  assert.ok(!ids.includes('maya'), 'the organizer is not invited to her own dinner')
  assert.ok(ids.includes('jules'), 'a previous guest who is not a member is invited')
  assert.ok(review.duplicates.some((p) => p.id === 'ben'))
  assert.equal(review.excluded.filter((e) => e.person.id === 'noor').length, 1, 'excluded once even if in both groups')
})

test('permissions: guests cannot touch a host action, hosts cannot answer for a guest', () => {
  const state = buildSeed()
  const publish: Action = { type: 'publish', planId: 'friday-dumplings', at: T0 }
  assert.equal(allowed(state, 'ben', publish), false)
  assert.equal(allowed(state, 'maya', publish), true)
  const rsvp: Action = { type: 'rsvp', planId: 'friday-dumplings', personId: 'ben', status: 'going', at: T0 }
  assert.equal(allowed(state, 'maya', rsvp), false)
  assert.equal(allowed(state, 'ben', rsvp), true)
  const cohost: Action = { type: 'cohost', planId: 'pasta-club', personId: 'theo', add: true }
  assert.equal(allowed(state, 'omar', cohost), false, 'a helper cannot add helpers')
  assert.equal(allowed(state, 'omar', { type: 'pin', planId: 'pasta-club', text: 'x', at: T0 }), true, 'a helper can pin')
})

test('a nudge goes out once a day, and only to someone who has not answered', () => {
  let state = buildSeed()
  const plan = state.plans['friday-dumplings']
  // "you" is invited and has not answered
  state = reduce(state, { type: 'nudge', planId: plan.id, personId: 'you', at: T0 })
  assert.equal(state.texts.filter((t) => t.kind === 'nudge' && t.toId === 'you').length, 1)
  const again = reduce(state, { type: 'nudge', planId: plan.id, personId: 'you', at: later(60) })
  assert.equal(again, state, 'no second nudge within a day')
  const tomorrow = reduce(state, { type: 'nudge', planId: plan.id, personId: 'you', at: later(25 * 60) })
  assert.equal(tomorrow.texts.filter((t) => t.kind === 'nudge' && t.toId === 'you').length, 2)
  const answered = reduce(state, { type: 'nudge', planId: plan.id, personId: 'ben', at: later(25 * 60) })
  assert.equal(answered, state, 'Ben already said yes')
})

test('removing a guest revokes the invitation and frees the seat', () => {
  let { state } = smallDinner(buildSeed(), 2)
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'ben', status: 'going', at: later(1) })
  state = reduce(state, { type: 'rsvp', planId: 'tiny', personId: 'priya', status: 'waitlist', at: later(2) })
  state = reduce(state, { type: 'uninvite', planId: 'tiny', personId: 'ben', at: later(3) })
  assert.ok(!state.plans['tiny'].invitedIds.includes('ben'))
  assert.equal(rsvpOf(state, 'tiny', 'ben')?.status, 'declined')
  assert.equal(rsvpOf(state, 'tiny', 'priya')?.status, 'offered', 'the seat moved on')
})

test('reminders go out the day before and two hours before, once each', () => {
  let state = buildSeed()
  const plan = state.plans['friday-dumplings']
  const start = new Date(plan.startsAt).getTime()
  const dayBefore = new Date(start - 23 * 3600000).toISOString()
  const due = dueReminders(state, dayBefore).filter((d) => d.planId === plan.id)
  assert.deepEqual(due, [{ planId: plan.id, which: 'day' }])
  state = reduce(state, { type: 'remind', planId: plan.id, which: 'day', at: dayBefore })
  assert.equal(state.texts.filter((t) => t.kind === 'reminder' && t.planId === plan.id).length, goingIds(state, plan.id).length - 1)
  assert.deepEqual(dueReminders(state, dayBefore).filter((d) => d.planId === plan.id), [])
  const soon = new Date(start - 1.5 * 3600000).toISOString()
  assert.deepEqual(dueReminders(state, soon).filter((d) => d.planId === plan.id), [{ planId: plan.id, which: 'soon' }])
})

test('polls: people who are in can vote once, the host settles it', () => {
  let state = buildSeed()
  const poll = state.plans['friday-dumplings'].polls[0]
  assert.equal(allowed(state, 'ben', { type: 'vote', planId: 'friday-dumplings', pollId: poll.id, personId: 'ben', optionId: 'o2' }), true)
  assert.equal(allowed(state, 'noor', { type: 'vote', planId: 'friday-dumplings', pollId: poll.id, personId: 'noor', optionId: 'o2' }), false, 'Noor passed')
  state = reduce(state, { type: 'vote', planId: 'friday-dumplings', pollId: poll.id, personId: 'ben', optionId: 'o2' })
  assert.equal(state.plans['friday-dumplings'].polls[0].votes['ben'], 'o2', 'a re-vote replaces the first')
  state = reduce(state, { type: 'closePoll', planId: 'friday-dumplings', pollId: poll.id })
  const after = reduce(state, { type: 'vote', planId: 'friday-dumplings', pollId: poll.id, personId: 'ben', optionId: 'o1' })
  assert.equal(after.plans['friday-dumplings'].polls[0].votes['ben'], 'o2', 'no votes after it is settled')
})
