export type Tone = 'lime' | 'latte' | 'gray' | 'charcoal'

export interface Person {
  id: string
  name: string
  tone: Tone
  phone?: string
  /** Asked not to be shown as a familiar face on discovery cards. */
  hideFace?: boolean
  /** Opted out of future club invitations. */
  optOut?: boolean
  /** Blocked by an organizer; never invited, never listed. */
  blocked?: boolean
}

export type Audience = 'invited' | 'link' | 'public'
export type PlanStatus = 'draft' | 'published' | 'canceled'
/**
 * going: confirmed seat. declined: said no or withdrew. waitlist: queued for a seat.
 * offered: a seat opened and is held for them until expiresAt. expired: offer lapsed.
 * holding: seat reserved during checkout until expiresAt.
 */
export type RsvpStatus = 'going' | 'declined' | 'waitlist' | 'offered' | 'expired' | 'holding'
export type Delivery = 'sent' | 'failed' | 'pending'
export type UpdateKind = 'published' | 'time' | 'place' | 'note' | 'details' | 'cancel'
export type PaymentMode = 'table' | 'checkout'

export interface Cover {
  kind: 'photo' | 'poster'
  src?: string
  tone?: Tone
}

export interface Recipient {
  personId: string
  status: Delivery
  attempts: number
}

export interface PlanUpdate {
  id: string
  at: string
  kind: UpdateKind
  text: string
  recipients: Recipient[]
}

export interface Debrief {
  at: string
  minutesToPublish: number | null
  interventions: number
  outsideTexts: number
  notes: string
}

export interface PollOption {
  id: string
  text: string
}

export interface Poll {
  id: string
  byId: string
  question: string
  options: PollOption[]
  votes: Record<string, string>
  at: string
  closed?: boolean
}

export interface Photo {
  id: string
  byId: string
  src: string
  at: string
}

export type ReminderKind = 'day' | 'soon'

export interface Plan {
  id: string
  clubId?: string
  hostId: string
  cohostIds: string[]
  title: string
  startsAt: string
  timeZone: string
  venue: string
  address: string
  neighborhood: string
  hostNote: string
  capacity: number
  cost: number
  payment: PaymentMode
  audience: Audience
  status: PlanStatus
  revision: number
  invitedIds: string[]
  cover: Cover
  updates: PlanUpdate[]
  createdAt: string
  publishedAt?: string
  /** Identified non-host people who opened the invitation. */
  viewerIds: string[]
  attendedIds?: string[]
  repeatOf?: string
  description?: string
  debrief?: Debrief
  polls: Poll[]
  photos: Photo[]
  /** Reminder texts already sent: the day before, and two hours before. */
  remindersSent: ReminderKind[]
  /** When each pending guest was last nudged. */
  nudgedAt: Record<string, string>
  /** Set on a restricted plan the viewer may only preview. */
  restricted?: boolean
}

export interface Rsvp {
  planId: string
  personId: string
  status: RsvpStatus
  at: string
  expiresAt?: string
}

export interface Message {
  id: string
  planId: string
  fromId: string
  text: string
  at: string
}

export interface Ticket {
  id: string
  planId: string
  personId: string
  amount: number
  status: 'paid' | 'refunded' | 'failed'
  chargeId: string
  at: string
}

export type TextKind = 'invite' | 'update' | 'cancel' | 'offer' | 'receipt' | 'reminder' | 'nudge' | 'other'

/** One outbound text message. The transport (real or simulated) settles its status. */
export interface Text {
  id: string
  toId: string
  body: string
  at: string
  status: Delivery
  attempts: number
  kind: TextKind
  planId?: string
  updateId?: string
}

export interface Post {
  id: string
  byId: string
  text: string
  at: string
}

export interface Report {
  id: string
  byId: string
  aboutId: string
  reason: string
  at: string
}

export interface Club {
  id: string
  name: string
  organizerId: string
  cadence: string
  description: string
  neighborhood: string
  memberIds: string[]
  mutedIds: string[]
  requestIds: string[]
  /** Members who chose to appear in the directory. */
  listedIds: string[]
  posts: Post[]
  reports: Report[]
}

export type Role = 'guest' | 'host'

export interface You {
  id: 'you'
  name: string
  phone: string
  role: Role
  showFaces: boolean
  /** Hosts and people you follow: the relationship behind familiar faces. */
  followIds: string[]
}

export interface State {
  version: 2
  you: You
  people: Record<string, Person>
  clubs: Record<string, Club>
  plans: Record<string, Plan>
  rsvps: Record<string, Rsvp>
  messages: Message[]
  tickets: Record<string, Ticket>
  texts: Text[]
}
