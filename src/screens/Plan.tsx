import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { actorId, canSee, goingIds, isHostOf, messagesFor, now, person, rsvpOf, seatsLeft, ticketOf, uid, useStore, waitlistIds } from '../lib/store'
import { icsStamp, isPast, money, namesLine, plural, relative, time, when, clock } from '../core/format'
import type { Plan as PlanT } from '../core/types'
import { download, share } from '../lib/pwa'
import { Cover } from '../components/Cover'
import { Avatar, Faces } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Sheet, Sparks, TopBar, useToast } from '../components/ui'

function ics(plan: PlanT, hostName: string): string {
  const end = new Date(new Date(plan.startsAt).getTime() + 2 * 3600000).toISOString()
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//pie//plans//EN',
    'BEGIN:VEVENT',
    `UID:${plan.id}@pie`,
    `DTSTAMP:${icsStamp(new Date().toISOString())}`,
    `DTSTART:${icsStamp(plan.startsAt)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${esc(plan.title)}`,
    `LOCATION:${esc(`${plan.venue}, ${plan.address}`)}`,
    `DESCRIPTION:${esc(`${hostName} is hosting. ${plan.hostNote}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

function minutesLeft(iso?: string): number {
  if (!iso) return 0
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000))
}

export function Plan() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { state, dispatch, mode, auth } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const plan = state.plans[id]
  const actor = actorId(state)
  const previewing = params.get('preview') === '1' && !!plan && isHostOf(plan, actor)
  const viewer = previewing ? 'you' : actor
  const [identity, setIdentity] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [burst, setBurst] = useState(false)
  const [pending, setPending] = useState<'going' | 'waitlist' | null>(null)
  const burstTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(burstTimer.current), [])

  const identified = mode === 'remote' ? auth === 'user' : !!state.you.name
  const access = !!plan && (previewing || canSee(state, plan, viewer))
  const isHost = !!plan && isHostOf(plan, viewer) && !previewing

  // Count one identified viewer per invitation: the denominator for guest conversion.
  useEffect(() => {
    if (!plan || !access || isHost || previewing || !identified) return
    if (plan.viewerIds.includes(viewer)) return
    void dispatch({ type: 'view', planId: plan.id, personId: viewer })
  }, [plan, access, isHost, previewing, identified, viewer, dispatch])

  if (!plan) {
    return (
      <div className="screen">
        <TopBar back="/" />
        <div className="pad stack gap-12">
          <h1 className="title">this plan is gone</h1>
        </div>
      </div>
    )
  }

  const host = person(state, plan.hostId)
  const club = plan.clubId ? state.clubs[plan.clubId] : undefined
  const rsvp = rsvpOf(state, plan.id, viewer)
  const ticket = ticketOf(state, plan.id, viewer)
  const going = goingIds(state, plan.id)
  const seats = seatsLeft(state, plan.id)
  const full = seats === 0
  const youGoing = rsvp?.status === 'going' || isHost
  const sortedForLine = youGoing ? [viewer, ...going.filter((g) => g !== viewer)] : going
  const lineNames = sortedForLine.slice(0, 2).map((pid) => (pid === viewer && viewer === 'you' ? 'you' : person(state, pid).name))
  const facePeople = sortedForLine.map((pid) => person(state, pid))
  const msgs = messagesFor(state, plan.id)
  const changes = plan.updates.filter((u) => u.kind !== 'published')
  const paid = plan.payment === 'checkout' && plan.cost > 0
  const queue = waitlistIds(state, plan.id)
  const shareUrl = mode === 'remote' ? `${location.origin}/p/${plan.id}` : `${location.origin}${location.pathname}#/p/${plan.id}`
  const following = state.you.followIds.includes(plan.hostId)
  const past = isPast(plan.startsAt)
  const canPhoto = past && (youGoing || isHost || !!plan.attendedIds?.includes(viewer))

  const doShare = async () => {
    const r = await share({ title: plan.title, text: `${host.name} is hosting ${plan.title}, ${when(plan.startsAt)}`, url: shareUrl })
    if (r === 'copied') toast('link copied', 'link')
    else if (r === 'failed') toast("couldn't share")
  }

  const needIdentity = (then: 'going' | 'waitlist') => {
    if (previewing) {
      toast('preview only', 'eye')
      return true
    }
    if (identified) return false
    if (mode === 'remote') {
      nav(`/login?next=${encodeURIComponent(`/p/${plan.id}`)}`)
      return true
    }
    setPending(then)
    setIdentity(true)
    return true
  }

  const commit = (status: 'going' | 'waitlist') => {
    if (needIdentity(status)) return
    if (paid && status === 'going') return startCheckout()
    finish(status)
  }

  const finish = async (status: 'going' | 'waitlist') => {
    try {
      await dispatch({ type: 'rsvp', planId: plan.id, personId: viewer, status, at: now() })
    } catch (e) {
      toast((e as Error).message)
      return
    }
    if (status === 'going') {
      setBurst(true)
      window.clearTimeout(burstTimer.current)
      burstTimer.current = window.setTimeout(() => setBurst(false), 900)
    } else {
      toast('on the waitlist', 'check')
    }
  }

  const startCheckout = async () => {
    try {
      await dispatch({ type: 'hold', planId: plan.id, personId: viewer, at: now() })
      nav(`/p/${plan.id}/checkout`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const addToCalendar = () => {
    download(`${plan.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`, ics(plan, host.name))
    toast('added', 'calendar')
  }

  /* ---------- forwarded link: public preview only ---------- */
  if (!access) {
    return (
      <div className="screen">
        <TopBar back="/" />
        <div className="pad stack gap-16">
          <Cover cover={plan.cover} title={plan.title} hideTitle />
          <div className="stack gap-8">
            <span className="chip outline-lime" style={{ alignSelf: 'flex-start' }}>
              <Icon name="lock" size={12} /> invite only
            </span>
            <h1 className="title">{plan.title}</h1>
            <div className="mono">
              {when(plan.startsAt)} <span className="muted">· {plan.neighborhood}</span>
            </div>
          </div>
          <div className="row gap-10">
            <Avatar person={host} size={24} />
            <span className="small muted">
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{host.name}</span> is hosting
            </span>
          </div>
          <div className="card stack gap-10">
            <p className="body">you're not on the list{identified ? '' : ' yet'}.</p>
            {identified ? (
              <button type="button" className="btn btn-primary mt-8" onClick={() => toast(`asked ${host.name}`, 'send')}>
                ask {host.name}
              </button>
            ) : (
              <button type="button" className="btn btn-primary mt-8" onClick={() => (mode === 'remote' ? nav(`/login?next=${encodeURIComponent(`/p/${plan.id}`)}`) : setIdentity(true))}>
                sign in
              </button>
            )}
          </div>
        </div>
        <Sheet open={identity} onClose={() => setIdentity(false)} title="who are you?">
          <IdentityForm
            hostName={host.name}
            onDone={(name, phone) => {
              void dispatch({ type: 'you', patch: { name, phone } })
              setIdentity(false)
            }}
          />
        </Sheet>
      </div>
    )
  }

  /* ---------- the invitation ---------- */
  return (
    <div className="screen">
      <TopBar
        back={previewing ? `/host/p/${plan.id}` : viewer === 'you' ? '/' : '/host'}
        right={
          <button type="button" className="icon-btn" aria-label="share plan" onClick={doShare}>
            <Icon name="share" />
          </button>
        }
      />
      {previewing && (
        <div className="role-banner" role="status">
          <span>guest preview</span>
        </div>
      )}
      {plan.status === 'draft' && !previewing && (
        <div className="role-banner" role="status">
          <span>draft</span>
        </div>
      )}

      <div className="pad">
        <Cover cover={plan.cover} title={plan.title} alt={plan.cover.kind === 'photo' ? `${plan.title} at ${plan.venue}` : undefined} hideTitle />
      </div>

      <div className="pad stack gap-8 mt-16">
        {plan.status === 'canceled' && (
          <span className="chip cherry" style={{ alignSelf: 'flex-start' }}>
            canceled
          </span>
        )}
        <h1 className="title" style={plan.status === 'canceled' ? { color: 'var(--muted)' } : undefined}>
          {plan.title}
        </h1>
        <div className="stack gap-4">
          <div className="row gap-8 mono">
            <Icon name="clock" size={16} stroke="#A1A1AA" />
            <span>{when(plan.startsAt)}</span>
            <span className="muted">{relative(plan.startsAt)}</span>
          </div>
          <div className="row gap-8" style={{ alignItems: 'flex-start' }}>
            <Icon name="map" size={16} stroke="#A1A1AA" style={{ marginTop: 2, flex: 'none' }} />
            <div className="stack">
              <span className="strong" style={{ fontSize: 15, lineHeight: '20px' }}>
                {plan.venue}
              </span>
              <span className="small muted">
                {plan.address} · {plan.neighborhood}
              </span>
            </div>
          </div>
          <div className="row gap-8 mono">
            <Icon name="seat" size={16} stroke="#A1A1AA" />
            <span>{money(plan.cost)}</span>
            <span className="muted">·</span>
            <span className={full ? 'muted' : ''}>{full ? 'full' : `${plural(seats, 'seat')} left`}</span>
            {plan.cost > 0 && <span className="muted">· {paid ? 'paid here' : 'at the table'}</span>}
          </div>
        </div>
        {plan.description && <p className="body muted mt-8">{plan.description}</p>}
      </div>

      <div className="pad mt-16">
        <div className="hair" />
      </div>

      <div className="pad stack gap-10 mt-12">
        <div className="row gap-10" style={{ justifyContent: 'space-between' }}>
          <div className="row gap-10">
            <Avatar person={host} size={24} />
            <span className="small muted">
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{host.name}</span> is hosting
              {plan.cohostIds.length > 0 && ` with ${plan.cohostIds.map((c) => person(state, c).name).join(', ')}`}
            </span>
          </div>
          <span className="row gap-6">
            {!isHost && identified && !previewing && (
              <button type="button" className={`chip ${following ? 'lime' : 'outline-lime'}`} onClick={() => dispatch({ type: 'follow', personId: plan.hostId, on: !following })}>
                {following ? 'following' : `follow ${host.name}`}
              </button>
            )}
            {club && (
              <Link to={`/club/${club.id}`} className="chip">
                <Icon name="users" size={12} /> club
              </Link>
            )}
          </span>
        </div>
        <div className="row gap-12">
          <Faces people={facePeople} popFirst={youGoing && burst} />
          <span className="small">
            <span className="strong">{namesLine(lineNames, Math.max(0, going.length - lineNames.length), '')}</span>
            <span className="muted"> going</span>
          </span>
        </div>
      </div>

      {/* ---------- action area ---------- */}
      <div className="pad mt-16 stack gap-12">
        {plan.status === 'canceled' ? (
          <div className="card card-cherry stack gap-8">
            <span className="eyebrow cherry">
              {host.name} canceled · {clock(plan.updates[plan.updates.length - 1]?.at ?? plan.startsAt)}
            </span>
            <p className="body">{plan.updates.find((u) => u.kind === 'cancel')?.text ?? 'This one is off.'}</p>
            {ticket?.status === 'refunded' && <span className="small lime">your ${ticket.amount} was refunded</span>}
            {(youGoing || rsvp) && (
              <Link to={`/p/${plan.id}/chat`} className="btn btn-ghost btn-sm mt-8">
                <Icon name="chat" size={16} /> open chat
              </Link>
            )}
          </div>
        ) : isHost ? (
          <>
            <Link to={`/host/p/${plan.id}`} className="btn btn-going">
              <Icon name="users" size={18} /> see who's in
            </Link>
            <Link to={`/p/${plan.id}?preview=1`} className="btn btn-ghost btn-sm">
              <Icon name="eye" size={16} /> guest view
            </Link>
          </>
        ) : youGoing ? (
          <>
            <div style={{ position: 'relative' }}>
              {burst && <Sparks />}
              <button type="button" className="btn btn-going" aria-live="polite">
                <Icon name="check" size={18} strokeWidth={2.6} /> you're going{ticket?.status === 'paid' ? ` · $${ticket.amount} paid` : ''}
              </button>
            </div>
            <div className="two rise">
              <Link to={`/p/${plan.id}/chat`} className="btn btn-ghost btn-sm">
                <Icon name="chat" size={16} /> open chat
              </Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={doShare}>
                <Icon name="plus" size={16} strokeWidth={2.2} /> invite a friend
              </button>
            </div>
            <PinnedNote plan={plan} hostName={host.name} onCalendar={addToCalendar} className="rise rise-2" />
            <button type="button" className="text-btn danger rise rise-3" style={{ alignSelf: 'center' }} onClick={() => setLeaving(true)}>
              can't make it anymore?
            </button>
          </>
        ) : rsvp?.status === 'offered' ? (
          <div className="card card-lime stack gap-10">
            <span className="eyebrow lime">a seat opened up</span>
            <p className="body">yours for {minutesLeft(rsvp.expiresAt)} min.</p>
            <button type="button" className="btn btn-primary" onClick={() => (paid ? startCheckout() : dispatch({ type: 'acceptOffer', planId: plan.id, personId: viewer, at: now() }))}>
              take it{paid ? ` · ${money(plan.cost)}` : ''}
            </button>
            <button type="button" className="text-btn" style={{ alignSelf: 'center' }} onClick={() => dispatch({ type: 'withdraw', planId: plan.id, personId: viewer, at: now() })}>
              pass
            </button>
          </div>
        ) : rsvp?.status === 'holding' ? (
          <div className="card card-lime stack gap-10">
            <span className="eyebrow lime">seat held · {minutesLeft(rsvp.expiresAt)} min</span>
            <Link to={`/p/${plan.id}/checkout`} className="btn btn-primary">
              pay {money(plan.cost)}
            </Link>
          </div>
        ) : rsvp?.status === 'waitlist' ? (
          <>
            <button type="button" className="btn btn-going">
              <Icon name="clock" size={18} /> you're #{queue.indexOf(viewer) + 1} on the waitlist
            </button>
            <p className="small muted center">you'll get a text if a seat opens.</p>
            <button type="button" className="text-btn danger" style={{ alignSelf: 'center' }} onClick={() => dispatch({ type: 'withdraw', planId: plan.id, personId: viewer, at: now() })}>
              leave the waitlist
            </button>
          </>
        ) : rsvp?.status === 'expired' ? (
          <div className="card stack gap-10">
            <span className="eyebrow">your offer lapsed</span>
            <p className="body">the seat went to the next person.</p>
            <button type="button" className="btn btn-primary" onClick={() => commit(full ? 'waitlist' : 'going')}>
              {full ? 'back on the waitlist' : "i'm in"}
            </button>
          </div>
        ) : full ? (
          <div className="card stack gap-10">
            <span className="eyebrow">full</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => commit('waitlist')}>
              join the waitlist{queue.length > 0 ? ` · ${queue.length} ahead` : ''}
            </button>
          </div>
        ) : (
          <>
            <div style={{ position: 'relative' }}>
              <button type="button" className="btn btn-primary" onClick={() => commit('going')}>
                i'm in{paid ? ` · ${money(plan.cost)}` : ''}
              </button>
            </div>
            {rsvp?.status === 'declined' ? (
              <p className="small muted center">you passed</p>
            ) : (
              <button
                type="button"
                className="text-btn"
                style={{ alignSelf: 'center' }}
                onClick={() => {
                  if (needIdentity('going')) return
                  void dispatch({ type: 'rsvp', planId: plan.id, personId: viewer, status: 'declined', at: now() })
                  toast(`told ${host.name}`)
                }}
              >
                can't make it
              </button>
            )}
          </>
        )}
      </div>

      {/* ---------- photos, after the fact ---------- */}
      {past && plan.status === 'published' && (youGoing || isHost || plan.photos.length > 0) && (
        <section className="section pad">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="eyebrow">{plural(plan.photos.length, 'photo')}</span>
            {canPhoto && (
              <label className="text-btn lime" style={{ cursor: 'pointer' }}>
                add
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    try {
                      const src = await shrinkPhoto(f)
                      await dispatch({ type: 'photo', planId: plan.id, photo: { id: uid('ph'), byId: viewer, src, at: now() } })
                      toast('added', 'check')
                    } catch (err) {
                      toast((err as Error).message || "couldn't read that photo")
                    }
                  }}
                />
              </label>
            )}
          </div>
          {plan.photos.length === 0 ? (
            <p className="small muted">no photos yet</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
              {plan.photos.map((ph) => (
                <div key={ph.id} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
                  <img src={ph.src} alt={`by ${person(state, ph.byId).name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  {(ph.byId === viewer || isHost) && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="remove photo"
                      style={{ position: 'absolute', top: 4, right: 4, width: 28, height: 28, background: 'rgba(9,9,11,0.7)' }}
                      onClick={() => dispatch({ type: 'removePhoto', planId: plan.id, photoId: ph.id, personId: viewer })}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- what changed ---------- */}
      {changes.length > 0 && (
        <section className="section pad">
          <span className="eyebrow">what changed</span>
          <div className="timeline mt-8">
            <div className="timeline-line" />
            {[...plan.updates].reverse().map((u) => (
              <div key={u.id} className="timeline-item">
                <span className={`timeline-dot ${u.kind === 'cancel' ? 'cherry' : u.kind === 'published' ? '' : 'lime'}`} />
                <div className="stack gap-4">
                  <span className="eyebrow">{clock(u.at)}</span>
                  <span className="small">{u.text}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- the thread ---------- */}
      {plan.status !== 'draft' && (
        <section className="section pad">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="eyebrow">the thread</span>
            {(youGoing || isHost) && (
              <Link to={`/p/${plan.id}/chat`} className="text-btn lime">
                open chat
              </Link>
            )}
          </div>
          {!youGoing && !isHost && plan.status === 'published' && (
            <div className="bubble stack gap-6" style={{ borderTopLeftRadius: 16 }}>
              <div className="row gap-6 eyebrow">
                <Icon name="pin" size={13} stroke="#D0F08B" /> pinned by {host.name}
              </div>
              <p className="body">details and chat unlock once you're in.</p>
            </div>
          )}
          {(youGoing || isHost) &&
            (msgs.length === 0 ? (
              <p className="small muted">no messages yet</p>
            ) : (
              <div className="stack gap-8 mt-8">
                {msgs.slice(-2).map((m) => {
                  const from = person(state, m.fromId)
                  return (
                    <div key={m.id} className="row gap-8" style={{ alignItems: 'flex-start' }}>
                      <Avatar person={from} size={24} />
                      <div className="stack gap-4 grow">
                        <span className="eyebrow">
                          {from.name} · {time(m.at)}
                        </span>
                        <span className="small">{m.text}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
        </section>
      )}

      <Sheet open={identity} onClose={() => setIdentity(false)} title="your name">
        <IdentityForm
          onDone={(name, phone) => {
            void dispatch({ type: 'you', patch: { name, phone } })
            setIdentity(false)
            if (pending) void (paid && pending === 'going' ? startCheckout() : finish(pending))
            setPending(null)
          }}
          hostName={host.name}
        />
      </Sheet>

      <Sheet open={leaving} onClose={() => setLeaving(false)} title="can't make it?">
        <p className="body muted">your seat goes to the next person.{ticket?.status === 'paid' ? ` ${host.name} can refund your $${ticket.amount}.` : ''}</p>
        <div className="stack gap-10 mt-16">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              void dispatch({ type: 'withdraw', planId: plan.id, personId: viewer, at: now() })
              setLeaving(false)
              toast(`told ${host.name}`)
            }}
          >
            i'm out
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setLeaving(false)}>
            still going
          </button>
        </div>
      </Sheet>

      {!isHost && <span className="sr-only">{youGoing ? 'You are going.' : 'You have not responded.'}</span>}
    </div>
  )
}

async function shrinkPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const w = Math.min(800, img.width)
    const h = Math.round((img.height / img.width) * w)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    c.getContext('2d')?.drawImage(img, 0, 0, w, h)
    return c.toDataURL('image/jpeg', 0.75)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function PinnedNote({ plan, hostName, onCalendar, className = '' }: { plan: PlanT; hostName: string; onCalendar?: () => void; className?: string }) {
  const { state } = useStore()
  const host = person(state, plan.hostId)
  const maps = `https://maps.google.com/?q=${encodeURIComponent(`${plan.address}, New York, NY`)}`
  return (
    <div className={`row gap-10 ${className}`} style={{ alignItems: 'flex-start' }}>
      <Avatar person={host} size={24} className="mt-8" />
      <div className="bubble grow stack gap-6">
        <div className="row gap-6 eyebrow">
          <Icon name="pin" size={13} stroke="#D0F08B" /> pinned by {hostName}
        </div>
        <p className="body" style={{ fontSize: 17 }}>
          {plan.hostNote || 'no note yet'}
        </p>
        <div className="row gap-16 mt-8">
          <a className="text-btn lime" href={maps} target="_blank" rel="noopener noreferrer">
            directions
          </a>
          {onCalendar && (
            <button type="button" className="text-btn lime" onClick={onCalendar}>
              calendar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function IdentityForm({ onDone }: { onDone: (name: string, phone: string) => void; hostName: string }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const ok = name.trim().length > 0
  return (
    <form
      className="stack gap-16"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) onDone(name.trim(), phone.trim())
      }}
    >
            <div className="field">
        <label htmlFor="id-name">name</label>
        <input id="id-name" className="input" autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="what people call you" />
      </div>
      <div className="field">
        <label htmlFor="id-phone">phone</label>
        <input id="id-phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" />
        <span className="hint">for changes on the day</span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={!ok}>
        i'm in
      </button>
    </form>
  )
}
