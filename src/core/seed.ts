import type { Club, Message, Person, Plan, Rsvp, State, Text, Ticket } from './types'

const TZ = 'America/New_York'

/** Next occurrence of a weekday at a local time. 0 = Sunday. */
function next(weekday: number, hour: number, minute: number, weeksAhead = 0, from = new Date()): Date {
  const d = new Date(from)
  d.setHours(hour, minute, 0, 0)
  let delta = (weekday - d.getDay() + 7) % 7
  if (delta === 0 && d.getTime() <= from.getTime()) delta = 7
  d.setDate(d.getDate() + delta + weeksAhead * 7)
  return d
}

function ago(base: Date, days: number, hour: number, minute: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d
}

const iso = (d: Date) => d.toISOString()

export const SEED_PEOPLE: Person[] = [
  { id: 'maya', name: 'Maya', tone: 'lime', phone: '+1 212 555 0101' },
  { id: 'ben', name: 'Ben', tone: 'latte', phone: '+1 212 555 0102' },
  { id: 'priya', name: 'Priya', tone: 'gray', phone: '+1 212 555 0103' },
  { id: 'sam', name: 'Sam', tone: 'charcoal', phone: '+1 212 555 0104' },
  { id: 'lena', name: 'Lena', tone: 'latte', phone: '+1 212 555 0105' },
  { id: 'theo', name: 'Theo', tone: 'gray', phone: '+1 212 555 0106' },
  { id: 'noor', name: 'Noor', tone: 'lime', phone: '+1 212 555 0107', optOut: true },
  { id: 'jules', name: 'Jules', tone: 'charcoal', phone: '+1 212 555 0108' },
  { id: 'omar', name: 'Omar', tone: 'latte', phone: '+1 212 555 0109' },
  { id: 'ivy', name: 'Ivy', tone: 'gray', phone: '+1 212 555 0110', blocked: true },
]

const base = (over: Partial<Plan> & Pick<Plan, 'id' | 'hostId' | 'title' | 'startsAt' | 'venue' | 'address' | 'neighborhood' | 'hostNote' | 'capacity' | 'audience' | 'cover'>): Plan => ({
  timeZone: TZ,
  cost: 0,
  payment: 'table',
  status: 'published',
  revision: 1,
  invitedIds: [],
  cohostIds: [],
  viewerIds: [],
  updates: [],
  createdAt: over.startsAt,
  ...over,
})

export function buildSeed(now = new Date()): State {
  const friday = next(5, 19, 30, 0, now)
  const saturday = next(6, 20, 0, 0, now)
  const sunday = next(0, 9, 0, 0, now)
  const sundayLate = next(0, 13, 0, 0, now)
  const tuesday = next(2, 19, 0, 0, now)
  const satDinner = next(6, 19, 0, 0, now)
  const lastSupper = ago(friday, 14, 19, 30)
  const septSupper = ago(friday, 28, 19, 30)
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600000)
  const yesterday = ago(now, 1, 18, 12)
  const threeDaysAgo = ago(now, 3, 12, 40)

  const clubs: Club[] = [
    {
      id: 'wvsc',
      name: 'West Village Supper Club',
      organizerId: 'maya',
      cadence: 'every other Friday, 7:30-ish',
      description:
        "Eight-ish people, one long table, somewhere in the West Village. You come, you eat, you end up talking to whoever's next to you.",
      neighborhood: 'West Village',
      memberIds: ['maya', 'ben', 'priya', 'sam', 'lena', 'theo', 'noor'],
      mutedIds: ['noor'],
      requestIds: ['omar'],
      listedIds: ['maya', 'ben', 'priya', 'lena'],
      posts: [
        { id: 'p1', byId: 'maya', text: "Dumplings this Friday, then we're skipping a week for Thanksgiving. December is the hot pot one. Bring a friend who can handle it.", at: iso(ago(now, 4, 9, 15)) },
      ],
      reports: [],
    },
  ]

  const plans: Plan[] = [
    base({
      id: 'friday-dumplings',
      clubId: 'wvsc',
      hostId: 'maya',
      title: 'Friday dumplings',
      startsAt: iso(friday),
      createdAt: iso(ago(now, 3, 12, 22)),
      publishedAt: iso(threeDaysAgo),
      venue: "Jin's Dumpling House",
      address: '112 Christopher St',
      neighborhood: 'West Village',
      hostNote: "Meet at the back table. It's under Maya.",
      capacity: 8,
      audience: 'invited',
      invitedIds: ['you', 'ben', 'priya', 'sam', 'lena', 'theo', 'noor'],
      viewerIds: ['ben', 'priya', 'sam', 'lena', 'theo', 'noor'],
      cover: { kind: 'photo', src: 'hero-dumplings.jpg' },
      description: "Pork and chive, the crispy bottoms, the cucumber salad. We'll order for the table and split it.",
      updates: [{ id: 'u1', at: iso(threeDaysAgo), kind: 'published', text: 'Maya published the plan and invited 7 people.', recipients: [] }],
    }),
    base({
      id: 'rooftop-movie',
      hostId: 'lena',
      title: 'Rooftop movie night',
      startsAt: iso(saturday),
      venue: "Lena's roof",
      address: '48 Bedford St, 6F',
      neighborhood: 'West Village',
      hostNote: 'Buzz 6F. Blankets are up there already, bring a layer.',
      capacity: 10,
      audience: 'link',
      invitedIds: ['you', 'maya', 'ben', 'priya', 'sam', 'theo', 'noor', 'jules', 'omar'],
      cover: { kind: 'poster', tone: 'latte' },
      description: 'Projector, one old movie, the skyline doing its thing behind it.',
      updates: [{ id: 'u1', at: iso(ago(now, 5, 10, 0)), kind: 'published', text: 'Lena published the plan.', recipients: [] }],
    }),
    base({
      id: 'tuesday-trivia',
      hostId: 'sam',
      title: 'Tuesday trivia',
      startsAt: iso(tuesday),
      venue: 'The Half Pint',
      address: '76 W 3rd St',
      neighborhood: 'Greenwich Village',
      hostNote: 'Table by the window, team name is "quiz in my pants".',
      capacity: 6,
      audience: 'invited',
      status: 'canceled',
      revision: 2,
      invitedIds: ['you', 'maya', 'ben', 'priya'],
      cover: { kind: 'poster', tone: 'gray' },
      updates: [
        { id: 'u1', at: iso(ago(now, 6, 9, 30)), kind: 'published', text: 'Sam published the plan.', recipients: [] },
        {
          id: 'u2',
          at: iso(yesterday),
          kind: 'cancel',
          text: 'Sam canceled: the bar is closed for a private event. Next week, same place.',
          recipients: [
            { personId: 'you', status: 'sent', attempts: 1 },
            { personId: 'maya', status: 'sent', attempts: 1 },
            { personId: 'ben', status: 'sent', attempts: 1 },
          ],
        },
      ],
    }),
    base({
      id: 'prospect-run',
      hostId: 'ben',
      title: 'Sunday long run',
      startsAt: iso(sunday),
      venue: 'Grand Army Plaza arch',
      address: 'Prospect Park',
      neighborhood: 'Prospect Heights',
      hostNote: 'Under the arch, Plaza St side. Easy pace, 10k-ish, bagels after.',
      capacity: 12,
      audience: 'public',
      invitedIds: ['you', 'priya', 'theo', 'omar'],
      cover: { kind: 'poster', tone: 'lime' },
      description: 'Two loops, nobody gets dropped. Bagels after at the corner place.',
      updates: [{ id: 'u1', at: iso(ago(now, 4, 8, 0)), kind: 'published', text: 'Ben published the plan.', recipients: [] }],
    }),
    base({
      id: 'pasta-club',
      hostId: 'jules',
      cohostIds: ['omar'],
      title: 'Pasta club, round 3',
      startsAt: iso(satDinner),
      venue: "Jules' place",
      address: '201 W 10th St',
      neighborhood: 'West Village',
      hostNote: 'Ring the top bell. Shoes off, wine on.',
      capacity: 8,
      cost: 25,
      payment: 'checkout',
      audience: 'public',
      invitedIds: ['priya', 'omar'],
      cover: { kind: 'poster', tone: 'latte' },
      description: 'Three courses, handmade, one long table. Twenty-five covers the groceries. Full refund up to the day before.',
      updates: [{ id: 'u1', at: iso(ago(now, 2, 11, 0)), kind: 'published', text: 'Jules published the plan.', recipients: [] }],
    }),
    base({
      id: 'park-picnic',
      hostId: 'theo',
      title: 'Picnic on the Pier 45 lawn',
      startsAt: iso(sundayLate),
      venue: 'Pier 45',
      address: 'Hudson River Park at Christopher St',
      neighborhood: 'West Village',
      hostNote: 'The lawn on the river end. Look for the orange blanket.',
      capacity: 20,
      audience: 'public',
      invitedIds: ['omar'],
      cover: { kind: 'poster', tone: 'lime' },
      description: "Bring one thing to share. I've got the blanket and too many clementines.",
      updates: [{ id: 'u1', at: iso(ago(now, 1, 15, 0)), kind: 'published', text: 'Theo published the plan.', recipients: [] }],
    }),
    base({
      id: 'noor-birthday',
      hostId: 'noor',
      title: "Noor's birthday dinner",
      startsAt: iso(next(4, 20, 0, 1, now)),
      venue: 'Via Carota',
      address: '51 Grove St',
      neighborhood: 'West Village',
      hostNote: 'Reservation under Noor. Come hungry.',
      capacity: 10,
      audience: 'invited',
      invitedIds: ['maya', 'lena', 'jules'],
      cover: { kind: 'poster', tone: 'charcoal' },
      updates: [{ id: 'u1', at: iso(ago(now, 2, 20, 0)), kind: 'published', text: 'Noor published the plan.', recipients: [] }],
    }),
    base({
      id: 'october-supper',
      clubId: 'wvsc',
      hostId: 'maya',
      title: 'Sichuan night',
      startsAt: iso(lastSupper),
      createdAt: iso(ago(lastSupper, 9, 11, 48)),
      publishedAt: iso(ago(lastSupper, 9, 12, 0)),
      venue: 'Málà Project',
      address: '122 1st Ave',
      neighborhood: 'East Village',
      hostNote: 'Big round table in the back. Ask for Maya.',
      capacity: 8,
      audience: 'invited',
      invitedIds: ['you', 'ben', 'priya', 'sam', 'lena', 'theo', 'noor', 'jules'],
      viewerIds: ['you', 'ben', 'priya', 'sam', 'lena', 'theo', 'noor', 'jules'],
      attendedIds: ['maya', 'you', 'ben', 'priya', 'lena', 'jules', 'noor'],
      cover: { kind: 'poster', tone: 'gray' },
      debrief: { at: iso(ago(lastSupper, -1, 10, 0)), minutesToPublish: 12, interventions: 2, outsideTexts: 5, notes: 'Two people asked for the address over text even though it was on the page. Table was ready, nobody got lost.' },
      updates: [{ id: 'u1', at: iso(ago(lastSupper, 9, 12, 0)), kind: 'published', text: 'Maya published the plan and invited 8 people.', recipients: [] }],
    }),
    base({
      id: 'september-supper',
      clubId: 'wvsc',
      hostId: 'maya',
      title: 'Oysters at the bar',
      startsAt: iso(septSupper),
      createdAt: iso(ago(septSupper, 10, 17, 5)),
      publishedAt: iso(ago(septSupper, 10, 17, 31)),
      venue: 'Mary’s Fish Camp',
      address: '64 Charles St',
      neighborhood: 'West Village',
      hostNote: 'Bar seats, the far end. First round is on the club.',
      capacity: 6,
      audience: 'invited',
      invitedIds: ['ben', 'priya', 'sam', 'lena', 'theo'],
      viewerIds: ['ben', 'priya', 'sam', 'lena', 'theo'],
      attendedIds: ['maya', 'ben', 'priya', 'lena', 'sam'],
      cover: { kind: 'poster', tone: 'charcoal' },
      debrief: { at: iso(ago(septSupper, -1, 9, 0)), minutesToPublish: 26, interventions: 4, outsideTexts: 11, notes: 'Chased three people for an answer. Would have liked a nudge button.' },
      updates: [{ id: 'u1', at: iso(ago(septSupper, 10, 17, 31)), kind: 'published', text: 'Maya published the plan and invited 5 people.', recipients: [] }],
    }),
  ]

  const rsvpList: Array<[string, string, Rsvp['status'], Date]> = [
    ['friday-dumplings', 'maya', 'going', threeDaysAgo],
    ['friday-dumplings', 'ben', 'going', threeDaysAgo],
    ['friday-dumplings', 'priya', 'going', threeDaysAgo],
    ['friday-dumplings', 'sam', 'going', ago(now, 2, 9, 0)],
    ['friday-dumplings', 'lena', 'going', ago(now, 2, 13, 0)],
    ['friday-dumplings', 'theo', 'going', yesterday],
    ['friday-dumplings', 'noor', 'declined', ago(now, 2, 21, 0)],
    ['rooftop-movie', 'lena', 'going', ago(now, 5, 10, 0)],
    ['rooftop-movie', 'maya', 'going', ago(now, 5, 11, 0)],
    ['rooftop-movie', 'ben', 'going', ago(now, 5, 11, 0)],
    ['rooftop-movie', 'priya', 'going', ago(now, 4, 11, 0)],
    ['rooftop-movie', 'sam', 'going', ago(now, 4, 11, 0)],
    ['rooftop-movie', 'theo', 'going', ago(now, 4, 11, 0)],
    ['rooftop-movie', 'noor', 'going', ago(now, 3, 11, 0)],
    ['rooftop-movie', 'jules', 'going', ago(now, 3, 11, 0)],
    ['rooftop-movie', 'omar', 'going', ago(now, 3, 11, 0)],
    ['rooftop-movie', 'ivy', 'going', ago(now, 3, 12, 0)],
    ['tuesday-trivia', 'you', 'going', ago(now, 5, 9, 0)],
    ['tuesday-trivia', 'maya', 'going', ago(now, 5, 9, 0)],
    ['tuesday-trivia', 'ben', 'going', ago(now, 5, 9, 0)],
    ['prospect-run', 'ben', 'going', ago(now, 4, 8, 0)],
    ['prospect-run', 'you', 'going', ago(now, 3, 8, 0)],
    ['prospect-run', 'priya', 'going', ago(now, 3, 8, 0)],
    ['prospect-run', 'theo', 'going', ago(now, 2, 8, 0)],
    ['pasta-club', 'jules', 'going', ago(now, 2, 11, 0)],
    ['pasta-club', 'priya', 'going', ago(now, 1, 11, 0)],
    ['pasta-club', 'omar', 'going', ago(now, 1, 11, 0)],
    ['pasta-club', 'theo', 'going', ago(now, 1, 12, 0)],
    ['park-picnic', 'theo', 'going', ago(now, 1, 15, 0)],
    ['park-picnic', 'omar', 'going', ago(now, 1, 16, 0)],
    ['noor-birthday', 'noor', 'going', ago(now, 2, 20, 0)],
    ['noor-birthday', 'maya', 'going', ago(now, 2, 20, 0)],
    ['noor-birthday', 'lena', 'going', ago(now, 1, 20, 0)],
    ['october-supper', 'maya', 'going', ago(lastSupper, 9, 12, 0)],
    ['october-supper', 'you', 'going', ago(lastSupper, 8, 12, 0)],
    ['october-supper', 'ben', 'going', ago(lastSupper, 8, 12, 0)],
    ['october-supper', 'priya', 'going', ago(lastSupper, 8, 12, 0)],
    ['october-supper', 'lena', 'going', ago(lastSupper, 7, 12, 0)],
    ['october-supper', 'jules', 'going', ago(lastSupper, 7, 12, 0)],
    ['october-supper', 'noor', 'going', ago(lastSupper, 6, 12, 0)],
    ['october-supper', 'sam', 'declined', ago(lastSupper, 6, 12, 0)],
    ['september-supper', 'maya', 'going', ago(septSupper, 10, 17, 31)],
    ['september-supper', 'ben', 'going', ago(septSupper, 9, 8, 0)],
    ['september-supper', 'priya', 'going', ago(septSupper, 9, 9, 0)],
    ['september-supper', 'lena', 'going', ago(septSupper, 8, 9, 0)],
    ['september-supper', 'sam', 'going', ago(septSupper, 8, 10, 0)],
    ['september-supper', 'theo', 'going', ago(septSupper, 7, 10, 0)],
  ]

  const rsvps: Record<string, Rsvp> = {}
  for (const [planId, personId, status, at] of rsvpList) rsvps[`${planId}:${personId}`] = { planId, personId, status, at: iso(at) }

  const tickets: Ticket[] = [
    { id: 'tk1', planId: 'pasta-club', personId: 'priya', amount: 25, status: 'paid', chargeId: 'ch_test_4f1a', at: iso(ago(now, 1, 11, 0)) },
    { id: 'tk2', planId: 'pasta-club', personId: 'omar', amount: 25, status: 'paid', chargeId: 'ch_test_9c2d', at: iso(ago(now, 1, 11, 0)) },
    { id: 'tk3', planId: 'pasta-club', personId: 'theo', amount: 25, status: 'paid', chargeId: 'ch_test_b77e', at: iso(ago(now, 1, 12, 0)) },
  ]

  const messages: Message[] = [
    { id: 'm1', planId: 'friday-dumplings', fromId: 'maya', text: "ok who's actually coming", at: iso(ago(now, 2, 18, 2)) },
    { id: 'm2', planId: 'friday-dumplings', fromId: 'ben', text: "me. bringing Sam, he's never had the crispy ones", at: iso(ago(now, 2, 18, 9)) },
    { id: 'm3', planId: 'friday-dumplings', fromId: 'priya', text: 'do they still do the pork + chive', at: iso(ago(now, 2, 18, 30)) },
    { id: 'm4', planId: 'friday-dumplings', fromId: 'maya', text: 'obviously. ordering for the table, we split it', at: iso(ago(now, 2, 18, 31)) },
    { id: 'm5', planId: 'friday-dumplings', fromId: 'maya', text: "Meet at the back table. It's under Maya.", at: iso(twoHoursAgo) },
    { id: 'm6', planId: 'friday-dumplings', fromId: 'lena', text: 'running 10 late, order without me', at: iso(new Date(now.getTime() - 40 * 60000)) },
    { id: 'm7', planId: 'prospect-run', fromId: 'ben', text: 'forecast says 48 and clear. perfect', at: iso(yesterday) },
    { id: 'm8', planId: 'prospect-run', fromId: 'priya', text: 'bagel order: everything, scallion', at: iso(new Date(yesterday.getTime() + 20 * 60000)) },
    { id: 'm9', planId: 'rooftop-movie', fromId: 'lena', text: "it's full! sorry to anyone late to the link", at: iso(ago(now, 2, 9, 0)) },
  ]

  const texts: Text[] = [
    { id: 't1', toId: 'you', body: 'Sam: Tuesday trivia is off. The bar is closed for a private event. Next week, same place. {link}', at: iso(yesterday), status: 'sent', attempts: 1, kind: 'cancel', planId: 'tuesday-trivia', updateId: 'u2' },
    { id: 't2', toId: 'you', body: 'Maya invited you: Friday dumplings. Say yes or no here: {link}', at: iso(threeDaysAgo), status: 'sent', attempts: 1, kind: 'invite', planId: 'friday-dumplings', updateId: 'u1' },
  ]

  return {
    version: 2,
    you: { id: 'you', name: '', phone: '', role: 'guest', showFaces: true },
    people: Object.fromEntries(SEED_PEOPLE.map((p) => [p.id, p])),
    clubs: Object.fromEntries(clubs.map((c) => [c.id, c])),
    plans: Object.fromEntries(plans.map((p) => [p.id, p])),
    rsvps,
    messages,
    tickets: Object.fromEntries(tickets.map((t) => [t.id, t])),
    texts,
  }
}
