import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actorId, audienceLabel, canNudge, goingIds, isHostOf, now, person, rsvpsFor, seatsLeft, textsFor, ticketOf, useStore } from '../lib/store'
import { clock, isPast, money, plural, time, toInputValue, fromInputValue, when } from '../core/format'
import { share } from '../lib/pwa'
import type { Debrief, Person, Recipient } from '../core/types'
import { Avatar } from '../components/Avatar'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'
import { Checkbox, SectionTitle, Sheet, TopBar, useToast } from '../components/ui'

export function Roster() {
  const { id = '' } = useParams()
  const { state, dispatch, mode, invitePhone } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const plan = state.plans[id]
  const me = actorId(state)
  const [changing, setChanging] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [helpers, setHelpers] = useState(false)
  const [debriefing, setDebriefing] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  if (!plan || !isHostOf(plan, me)) {
    return (
      <div className="screen">
        <TopBar back="/host" />
        <div className="pad stack gap-8">
          <h1 className="title">not your plan</h1>
        </div>
      </div>
    )
  }

  const owner = plan.hostId === me
  const rsvps = rsvpsFor(state, plan.id).filter((r) => r.personId !== plan.hostId)
  const going = rsvps.filter((r) => r.status === 'going').sort((a, b) => a.at.localeCompare(b.at))
  const offered = rsvps.filter((r) => r.status === 'offered').sort((a, b) => a.at.localeCompare(b.at))
  const holding = rsvps.filter((r) => r.status === 'holding')
  const waitlist = rsvps.filter((r) => r.status === 'waitlist').sort((a, b) => a.at.localeCompare(b.at))
  const declined = rsvps.filter((r) => r.status === 'declined' || r.status === 'expired')
  const pending = plan.invitedIds.filter((pid) => pid !== plan.hostId && !rsvps.some((r) => r.personId === pid))
  const seats = seatsLeft(state, plan.id)
  const past = isPast(plan.startsAt)
  const paid = plan.payment === 'checkout' && plan.cost > 0
  const shareUrl = mode === 'remote' ? `${location.origin}/p/${plan.id}` : `${location.origin}${location.pathname}#/p/${plan.id}`
  const recipients = goingIds(state, plan.id).filter((pid) => pid !== plan.hostId)
  const texts = textsFor(state, plan.id)
  const revenue = Object.values(state.tickets).filter((t) => t.planId === plan.id && t.status === 'paid').reduce((n, t) => n + t.amount, 0)

  const copy = async () => {
    const r = await share({ title: plan.title, text: `${person(state, plan.hostId).name} is hosting ${plan.title}`, url: shareUrl })
    toast(r === 'copied' ? 'link copied' : r === 'shared' ? 'shared' : "couldn't copy", 'link')
  }

  return (
    <div className="screen">
      <TopBar
        back="/host"
        right={
          <button type="button" className="icon-btn" aria-label="copy link" onClick={copy}>
            <Icon name="link" />
          </button>
        }
      />

      <div className="pad row gap-12">
        <div className="thumb" style={{ width: 72, height: 72 }}>
          <Cover cover={plan.cover} title={plan.title} hideTitle />
        </div>
        <div className="stack gap-4 grow">
          <div className="row gap-8 wrap">
            {plan.status === 'draft' ? <span className="chip muted">draft</span> : plan.status === 'canceled' ? <span className="chip cherry">canceled</span> : <span className="chip lime">live</span>}
            <span className="chip">
              <Icon name={plan.audience === 'invited' ? 'lock' : plan.audience === 'link' ? 'link' : 'globe'} size={12} /> {audienceLabel(plan.audience)}
            </span>
            {!owner && <span className="chip outline-lime">helper</span>}
          </div>
          <h1 className="h2">{plan.title}</h1>
          <span className="eyebrow">
            {when(plan.startsAt)} · {plan.venue}
          </span>
        </div>
      </div>

      {plan.status === 'draft' && (
        <div className="pad mt-16">
          <Link to={`/host/p/${plan.id}/edit`} className="btn btn-primary">
            finish and publish
          </Link>
        </div>
      )}

      <div className="pad mt-16" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        <div className="stat lime">
          <span className="n">{going.length + 1}</span>
          <span className="eyebrow">going</span>
        </div>
        <div className="stat">
          <span className="n">{pending.length}</span>
          <span className="eyebrow">pending</span>
        </div>
        <div className="stat">
          <span className="n">{waitlist.length + offered.length}</span>
          <span className="eyebrow">waiting</span>
        </div>
        <div className="stat">
          <span className="n">{seats}</span>
          <span className="eyebrow">seats left</span>
        </div>
      </div>

      {plan.status === 'published' && !past && (
        <div className="pad mt-16 stack gap-10">
          <button type="button" className="btn btn-primary" onClick={() => setChanging(true)}>
            <Icon name="pin" size={18} /> update meeting point
          </button>
          <div className="two">
            <Link to={`/host/p/${plan.id}/edit`} className="btn btn-ghost btn-sm">
              <Icon name="edit" size={16} /> edit
            </Link>
            <Link to={`/p/${plan.id}?preview=1`} className="btn btn-ghost btn-sm">
              <Icon name="eye" size={16} /> guest view
            </Link>
          </div>
          <div className="two">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setInviting(true)}>
              <Icon name="plus" size={16} /> invite
            </button>
            {owner && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHelpers(true)}>
                <Icon name="users" size={16} /> {plan.cohostIds.length ? plural(plan.cohostIds.length, 'helper') : 'add helper'}
              </button>
            )}
          </div>
        </div>
      )}

      {past && plan.status === 'published' && (
        <div className="pad mt-16 stack gap-10">
          <button type="button" className="btn btn-primary" onClick={() => nav(`/host/again/${plan.id}`)}>
            <Icon name="repeat" size={18} /> plan this again
          </button>
          <div className="two">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReconciling(true)}>
              <Icon name="check" size={16} /> {plan.attendedIds ? `${plan.attendedIds.length} came` : 'mark who came'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDebriefing(true)}>
              <Icon name="edit" size={16} /> debrief
            </button>
          </div>
          <Link to="/host/insights" className="text-btn lime" style={{ alignSelf: 'center' }}>
            numbers
          </Link>
        </div>
      )}

      <section className="section pad">
        <div className="card card-lime stack gap-6">
          <span className="eyebrow lime">
            <Icon name="pin" size={12} /> current meeting point
          </span>
          <p className="body">{plan.hostNote || 'nothing pinned yet'}</p>
        </div>
      </section>

      {plan.status === 'published' && !past && (
        <section className="section pad">
          <div className="card stack gap-8">
            <span className="eyebrow">
              <Icon name="clock" size={12} /> reminders
            </span>
            {(['day', 'soon'] as const).map((which) => {
              const sent = plan.remindersSent.includes(which)
              return (
                <div key={which} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="small">{which === 'day' ? 'the day before' : 'two hours before'}</span>
                  {sent ? (
                    <span className="chip lime">sent</span>
                  ) : (
                    <button
                      type="button"
                      className="chip"
                      onClick={() => {
                        void dispatch({ type: 'remind', planId: plan.id, which, at: now() })
                        toast('sending', 'send')
                      }}
                    >
                      send now
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {paid && (
        <section className="section pad">
          <div className="card stack gap-6">
            <span className="eyebrow">
              <Icon name="dollar" size={12} /> tickets
            </span>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small">{plural(going.filter((r) => ticketOf(state, plan.id, r.personId)?.status === 'paid').length, 'paid seat')}</span>
              <span className="mono">{money(revenue)} collected</span>
            </div>
            {holding.length > 0 && <span className="hint">{holding.length} in checkout</span>}
          </div>
        </section>
      )}

      <section className="section pad">
        <SectionTitle>going · {going.length + 1}</SectionTitle>
        <div className="list">
          <Row p={person(state, plan.hostId)} note="host" />
          {plan.cohostIds.map((cid) => (
            <Row key={cid} p={person(state, cid)} note="helps host" chip={<span className="chip outline-lime">helper</span>} />
          ))}
          {going.map((r) => {
            const t = paid ? ticketOf(state, plan.id, r.personId) : undefined
            return (
              <Row
                key={r.personId}
                p={person(state, r.personId)}
                note={`said yes ${clock(r.at)}${t?.status === 'paid' ? ` · paid $${t.amount}` : ''}`}
                extra={
                  owner && !past ? (
                    <button type="button" className="text-btn danger" onClick={() => setRemoving(r.personId)}>
                      remove
                    </button>
                  ) : undefined
                }
                chip={
                  t?.status === 'paid' && owner ? (
                    <button
                      type="button"
                      className="chip cherry"
                      onClick={() => {
                        void dispatch({ type: 'refund', planId: plan.id, personId: r.personId, at: now() })
                        toast(`refunded $${t.amount}`)
                      }}
                    >
                      refund
                    </button>
                  ) : undefined
                }
              />
            )
          })}
        </div>
      </section>

      {(offered.length > 0 || holding.length > 0 || waitlist.length > 0) && (
        <section className="section pad">
          <SectionTitle>waiting · {offered.length + holding.length + waitlist.length}</SectionTitle>
          <div className="list">
            {offered.map((r) => (
              <Row key={r.personId} p={person(state, r.personId)} note={`offered a seat · ${r.expiresAt ? `until ${time(r.expiresAt)}` : ''}`} chip={<span className="chip lime">offered</span>} />
            ))}
            {holding.map((r) => (
              <Row key={r.personId} p={person(state, r.personId)} note="paying now" chip={<span className="chip outline-lime">holding</span>} />
            ))}
            {waitlist.map((r, i) => (
              <Row key={r.personId} p={person(state, r.personId)} note={i === 0 ? 'next in line' : `#${i + 1} in line`} chip={<span className="chip outline-lime">waiting</span>} />
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section className="section pad">
          <SectionTitle>invited, no answer yet · {pending.length}</SectionTitle>
          <div className="list">
            {pending.map((pid) => {
              const opened = plan.viewerIds.includes(pid)
              const nudgeable = canNudge(plan, pid, now())
              return (
                <Row
                  key={pid}
                  p={person(state, pid)}
                  note={opened ? 'opened' : 'not opened'}
                  extra={
                    !past ? (
                      <span className="row gap-10">
                        <button
                          type="button"
                          className="text-btn lime"
                          disabled={!nudgeable}
                          style={!nudgeable ? { opacity: 0.5, borderBottomColor: 'transparent' } : undefined}
                          onClick={() => {
                            void dispatch({ type: 'nudge', planId: plan.id, personId: pid, at: now() })
                            toast('nudged', 'send')
                          }}
                        >
                          {nudgeable ? 'nudge' : 'nudged today'}
                        </button>
                        {owner && (
                          <button type="button" className="text-btn danger" onClick={() => setRemoving(pid)}>
                            remove
                          </button>
                        )}
                      </span>
                    ) : undefined
                  }
                  chip={<span className="chip muted">pending</span>}
                />
              )
            })}
          </div>
        </section>
      )}

      {declined.length > 0 && (
        <section className="section pad">
          <SectionTitle>can't make it · {declined.length}</SectionTitle>
          <div className="list">
            {declined.map((r) => (
              <Row key={r.personId} p={person(state, r.personId)} note={r.status === 'expired' ? `let an offer lapse ${clock(r.at)}` : `passed ${clock(r.at)}`} chip={<span className="chip muted">out</span>} />
            ))}
          </div>
        </section>
      )}

      <section className="section pad">
        <SectionTitle>changes</SectionTitle>
        <div className="timeline">
          <div className="timeline-line" />
          {[...plan.updates].reverse().map((u) => {
            const failed = u.recipients.filter((r) => r.status === 'failed')
            const sent = u.recipients.filter((r) => r.status === 'sent')
            const pend = u.recipients.filter((r) => r.status === 'pending')
            return (
              <div key={u.id} className="timeline-item">
                <span className={`timeline-dot ${u.kind === 'cancel' ? 'cherry' : u.kind === 'published' ? '' : 'lime'}`} />
                <div className="stack gap-4 grow">
                  <span className="eyebrow">{clock(u.at)}</span>
                  <span className="small">{u.text}</span>
                  {u.recipients.length > 0 && (
                    <div className="stack gap-6 mt-8">
                      <span className="eyebrow">
                        texted {sent.length} of {u.recipients.length}
                        {pend.length > 0 && <span> · {pend.length} sending</span>}
                        {failed.length > 0 && <span className="cherry"> · {failed.length} failed</span>}
                      </span>
                      <RecipientRow recipients={u.recipients} people={state.people} youName={state.you.name} />
                      {failed.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-auto"
                          onClick={() => {
                            void dispatch({ type: 'retry', planId: plan.id, updateId: u.id, at: now() })
                            toast('resending', 'refresh')
                          }}
                        >
                          <Icon name="refresh" size={16} /> retry {failed.length} failed
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {texts.length > 0 && (
        <section className="section pad">
          <SectionTitle>texts · {texts.length}</SectionTitle>
          <div className="list">
            {texts.slice(0, 8).map((t) => (
              <div key={t.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <Avatar person={person(state, t.toId)} size={28} />
                <div className="stack gap-4 grow">
                  <span className="eyebrow">
                    to {person(state, t.toId).name} · {clock(t.at)} · {t.kind}
                  </span>
                  <span className="small muted">{t.body.replace('{link}', '[link]')}</span>
                </div>
                <span className={`chip ${t.status === 'failed' ? 'cherry' : t.status === 'pending' ? 'muted' : ''}`}>{t.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {plan.status === 'published' && !past && owner && (
        <div className="pad mt-32 center">
          <button type="button" className="text-btn danger" onClick={() => setCanceling(true)}>
            <span className="row gap-6">
              <Icon name="trash" size={14} /> cancel
            </span>
          </button>
        </div>
      )}

      <Sheet open={changing} onClose={() => setChanging(false)} title="update">
        <ChangeForm
          note={plan.hostNote}
          startsAt={plan.startsAt}
          recipients={recipients.map((pid) => person(state, pid))}
          pendingCount={pending.length}
          onSave={(note, newStart) => {
            const parts: string[] = []
            if (newStart && newStart !== plan.startsAt) parts.push(`new time: ${time(newStart)}`)
            if (note !== plan.hostNote) parts.push(`meeting point: “${note}”`)
            if (parts.length === 0) {
              setChanging(false)
              return toast('nothing changed')
            }
            void dispatch({
              type: 'update',
              planId: plan.id,
              kind: newStart && newStart !== plan.startsAt ? 'time' : 'note',
              text: `${person(state, me).name} updated the plan. ${parts.join(' · ')}.`,
              patch: { hostNote: note, startsAt: newStart ?? plan.startsAt },
              recipientIds: recipients,
              at: now(),
            })
            setChanging(false)
            toast(`texting ${recipients.length}`, 'send')
          }}
        />
      </Sheet>

      <Sheet open={canceling} onClose={() => setCanceling(false)} title="cancel?">
        <CancelForm
          count={recipients.length}
          paid={paid}
          onCancel={(reason) => {
            void dispatch({ type: 'cancel', planId: plan.id, text: `${person(state, me).name} canceled: ${reason}`, at: now() })
            setCanceling(false)
            toast('canceled')
          }}
        />
      </Sheet>

      <Sheet open={reconciling} onClose={() => setReconciling(false)} title="who came?">
        <ReconcileForm
          people={[person(state, plan.hostId), ...going.map((r) => person(state, r.personId))]}
          initial={plan.attendedIds ?? [plan.hostId, ...going.map((r) => r.personId)]}
          onSave={(ids) => {
            void dispatch({ type: 'reconcile', planId: plan.id, attendedIds: ids })
            setReconciling(false)
            toast('saved', 'check')
          }}
        />
      </Sheet>

      <Sheet open={debriefing} onClose={() => setDebriefing(false)} title="debrief">
        <DebriefForm
          initial={plan.debrief}
          minutesAuto={plan.publishedAt && plan.createdAt ? Math.max(0, Math.round((new Date(plan.publishedAt).getTime() - new Date(plan.createdAt).getTime()) / 60000)) : null}
          onSave={(d) => {
            void dispatch({ type: 'debrief', planId: plan.id, debrief: d })
            setDebriefing(false)
            toast('saved', 'check')
          }}
        />
      </Sheet>

      <Sheet open={inviting} onClose={() => setInviting(false)} title="invite">
        <InviteForm
          people={Object.values(state.people).filter((p) => !p.blocked && !plan.invitedIds.includes(p.id) && p.id !== plan.hostId)}
          byPhone={mode === 'remote'}
          onPick={(ids) => {
            void dispatch({ type: 'invite', planId: plan.id, personIds: ids, at: now() })
            setInviting(false)
            toast(`invited ${ids.length}`, 'send')
          }}
          onPhone={async (phone, name) => {
            try {
              await invitePhone(plan.id, phone, name)
              setInviting(false)
              toast('invited', 'send')
            } catch (e) {
              toast((e as Error).message)
            }
          }}
        />
      </Sheet>

      <Sheet open={!!removing} onClose={() => setRemoving(null)} title={`remove ${removing ? person(state, removing).name : ''}?`}>
        <p className="body muted">their invite is revoked and the seat moves on.</p>
        <div className="stack gap-10 mt-16">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (removing) void dispatch({ type: 'uninvite', planId: plan.id, personId: removing, at: now() })
              setRemoving(null)
              toast('removed')
            }}
          >
            remove
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
            keep
          </button>
        </div>
      </Sheet>

      <Sheet open={helpers} onClose={() => setHelpers(false)} title="who helps host?">
        <p className="small muted">helpers see the roster, pin notes, invite, and mark attendance.</p>
        <div className="list mt-12">
          {[...plan.cohostIds, ...going.map((r) => r.personId).filter((pid) => !plan.cohostIds.includes(pid))].map((pid) => {
            const on = plan.cohostIds.includes(pid)
            return (
              <button key={pid} type="button" className="list-item" onClick={() => dispatch({ type: 'cohost', planId: plan.id, personId: pid, add: !on })}>
                <Avatar person={person(state, pid)} size={32} />
                <span className="grow small strong">{person(state, pid).name}</span>
                <Checkbox on={on} />
              </button>
            )
          })}
          {going.length === 0 && plan.cohostIds.length === 0 && <span className="small muted">no one has said yes yet</span>}
        </div>
      </Sheet>
    </div>
  )
}

function Row({ p, note, chip, extra }: { p: Person; note: string; chip?: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="list-item">
      <Avatar person={p} size={32} />
      <div className="stack gap-4 grow">
        <span className="small strong">{p.name || 'new guest'}</span>
        <span className="eyebrow">{note}</span>
        {extra && <span className="row gap-10 mt-8">{extra}</span>}
      </div>
      {chip}
    </div>
  )
}

function RecipientRow({ recipients, people, youName }: { recipients: Recipient[]; people: Record<string, Person>; youName: string }) {
  return (
    <div className="row gap-6 wrap">
      {recipients.map((r) => (
        <span key={r.personId} className={`chip ${r.status === 'failed' ? 'cherry' : r.status === 'pending' ? 'muted' : ''}`} title={`${r.status} · ${plural(r.attempts, 'attempt')}`}>
          {r.personId === 'you' ? youName || 'guest' : (people[r.personId]?.name ?? r.personId)}
          {r.status === 'failed' ? ' · failed' : r.status === 'pending' ? ' · sending' : r.attempts > 1 ? ' · resent' : ''}
        </span>
      ))}
    </div>
  )
}

function ChangeForm({ note: initial, startsAt, recipients, onSave }: { note: string; startsAt: string; recipients: Person[]; pendingCount: number; onSave: (note: string, newStart: string | null) => void }) {
  const [note, setNote] = useState(initial)
  const t = toInputValue(startsAt)
  const [tm, setTm] = useState(t.time)
  const [saved, setSaved] = useState(false)
  const newStart = fromInputValue(t.date, tm)
  return (
    <form
      className="stack gap-16"
      onSubmit={(e) => {
        e.preventDefault()
        if (saved) return
        setSaved(true)
        onSave(note.trim(), newStart)
      }}
    >
      <div className="field">
        <label htmlFor="ch-note">meeting point</label>
        <textarea id="ch-note" className="input" value={note} autoFocus onChange={(e) => setNote(e.target.value)} placeholder="Back room. Still under Maya." />
      </div>
      <div className="field" style={{ maxWidth: 180 }}>
        <label htmlFor="ch-time">time</label>
        <input id="ch-time" className="input" type="time" value={tm} onChange={(e) => setTm(e.target.value)} />
      </div>
      <div className="card stack gap-8">
        <span className="eyebrow">texts {recipients.length}</span>
        <div className="row gap-6 wrap">
          {recipients.map((p) => (
            <span key={p.id} className="chip">
              <Avatar person={p} size={16} /> {p.name}
            </span>
          ))}
          {recipients.length === 0 && <span className="small muted">no one yet</span>}
        </div>
              </div>
      <button type="submit" className="btn btn-primary" disabled={saved}>
        save and text
      </button>
          </form>
  )
}

function CancelForm({ count, paid, onCancel }: { count: number; paid: boolean; onCancel: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <form
      className="stack gap-16"
      onSubmit={(e) => {
        e.preventDefault()
        onCancel(reason.trim() || 'plans changed.')
      }}
    >
      <p className="body muted">{count > 0 ? `${plural(count, 'guest')} get a text.` : 'no one has said yes yet.'}{paid ? ' refund paid seats afterwards.' : ''}</p>
      <div className="field">
        <label htmlFor="cx-reason">why</label>
        <input id="cx-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="lost the booking. next week." />
      </div>
      <button type="submit" className="btn btn-danger-solid">
        cancel it
      </button>
    </form>
  )
}

function ReconcileForm({ people, initial, onSave }: { people: Person[]; initial: string[]; onSave: (ids: string[]) => void }) {
  const [ids, setIds] = useState<string[]>(initial)
  return (
    <div className="stack gap-12">
            <div className="list">
        {people.map((p) => {
          const on = ids.includes(p.id)
          return (
            <button key={p.id} type="button" className="list-item" onClick={() => setIds(on ? ids.filter((x) => x !== p.id) : [...ids, p.id])}>
              <Avatar person={p} size={32} />
              <span className="grow small strong">{p.name}</span>
              <Checkbox on={on} />
            </button>
          )
        })}
      </div>
      <button type="button" className="btn btn-primary" onClick={() => onSave(ids)}>
        save
      </button>
    </div>
  )
}

function DebriefForm({ initial, minutesAuto, onSave }: { initial?: Debrief; minutesAuto: number | null; onSave: (d: Debrief) => void }) {
  const [interventions, setInterventions] = useState(initial?.interventions ?? 0)
  const [outsideTexts, setOutsideTexts] = useState(initial?.outsideTexts ?? 0)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [minutes, setMinutes] = useState(initial?.minutesToPublish ?? minutesAuto ?? 0)
  return (
    <form
      className="stack gap-12"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ at: now(), minutesToPublish: minutes, interventions, outsideTexts, notes: notes.trim() })
      }}
    >
            <div className="field">
        <label htmlFor="db-min">minutes to publish</label>
        <input id="db-min" className="input" type="number" min={0} value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value || '0', 10))} />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="db-int">fixed by hand</label>
          <input id="db-int" className="input" type="number" min={0} value={interventions} onChange={(e) => setInterventions(parseInt(e.target.value || '0', 10))} />
        </div>
        <div className="field">
          <label htmlFor="db-txt">texts outside pie</label>
          <input id="db-txt" className="input" type="number" min={0} value={outsideTexts} onChange={(e) => setOutsideTexts(parseInt(e.target.value || '0', 10))} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="db-notes">notes</label>
        <textarea id="db-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
      </div>
      <button type="submit" className="btn btn-primary">
        save
      </button>
    </form>
  )
}

function InviteForm({ people, byPhone, onPick, onPhone }: { people: Person[]; byPhone: boolean; onPick: (ids: string[]) => void; onPhone: (phone: string, name: string) => void }) {
  const [ids, setIds] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  return (
    <div className="stack gap-16">
      {people.length > 0 && (
        <div className="stack gap-8">
          <span className="eyebrow">people</span>
          <div className="row gap-8 wrap">
            {people.map((p) => {
              const on = ids.includes(p.id)
              return (
                <button key={p.id} type="button" className={`chip selectable ${on ? 'on' : ''}`} onClick={() => setIds(on ? ids.filter((x) => x !== p.id) : [...ids, p.id])}>
                  {p.name || 'new guest'}
                </button>
              )
            })}
          </div>
          <button type="button" className="btn btn-primary" disabled={ids.length === 0} onClick={() => onPick(ids)}>
            invite {ids.length || ''}
          </button>
        </div>
      )}
      {byPhone && (
        <form
          className="stack gap-8"
          onSubmit={(e) => {
            e.preventDefault()
            onPhone(phone, name)
          }}
        >
          <span className="eyebrow">by phone</span>
          <div className="two">
            <input className="input" type="tel" placeholder="+1 212 555 0199" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="phone" />
            <input className="input" placeholder="their name" value={name} onChange={(e) => setName(e.target.value)} aria-label="name" />
          </div>
          <button type="submit" className="btn btn-ghost btn-sm" disabled={phone.replace(/\D/g, '').length < 8}>
            invite
          </button>
        </form>
      )}
      {people.length === 0 && !byPhone && <span className="small muted">everyone's invited</span>}
    </div>
  )
}
