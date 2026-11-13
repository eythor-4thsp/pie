import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { actorId, goingIds, now, person, uid, useStore } from '../lib/store'
import { clock, isPast, plural } from '../core/format'
import { Avatar, Faces } from '../components/Avatar'
import { Icon, PieMark } from '../components/Icon'
import { PlanCard, PlanRow } from '../components/PlanCard'
import { Empty, SectionTitle, Sheet, Switch, TopBar, useToast } from '../components/ui'
import { ClubForm } from './ClubNew'

export function Club() {
  const { id = '' } = useParams()
  const { state, dispatch, mode, auth } = useStore()
  const nav = useNavigate()
  const toast = useToast()
  const club = state.clubs[id]
  const me = actorId(state)
  const [leaving, setLeaving] = useState(false)
  const [post, setPost] = useState('')
  const [reporting, setReporting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(false)

  if (!club) {
    return (
      <div className="screen">
        <TopBar back="/" />
        <div className="pad">
          <h1 className="title">no club here</h1>
        </div>
      </div>
    )
  }

  const identified = mode === 'remote' ? auth === 'user' : true
  const organizer = person(state, club.organizerId)
  const isOrganizer = club.organizerId === me
  const member = club.memberIds.includes(me)
  const requested = club.requestIds.includes(me)
  const muted = club.mutedIds.includes(me)
  const listed = club.listedIds.includes(me)
  const plans = Object.values(state.plans)
    .filter((p) => p.clubId === club.id && p.status !== 'draft')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const next = plans.find((p) => !isPast(p.startsAt) && p.status === 'published')
  const past = plans.filter((p) => isPast(p.startsAt)).reverse()
  const eligible = past.some((p) => (p.attendedIds ?? goingIds(state, p.id)).includes(me))
  const members = club.memberIds.map((pid) => person(state, pid))
  const directory = members.filter((p) => club.listedIds.includes(p.id) || p.id === club.organizerId)
  const posts = [...club.posts].sort((a, b) => b.at.localeCompare(a.at))

  const gate = () => {
    if (identified) return false
    nav(`/login?next=${encodeURIComponent(`/club/${club.id}`)}`)
    return true
  }

  return (
    <div className="screen">
      <TopBar
        back={me === 'you' ? '/' : '/host'}
        right={
          isOrganizer ? (
            <button type="button" className="icon-btn" aria-label="edit club" onClick={() => setEditing(true)}>
              <Icon name="edit" />
            </button>
          ) : undefined
        }
      />
      <div className="pad">
        <div className="card" style={{ background: 'var(--lime)', color: 'var(--bg)', padding: '28px 20px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -40, top: -50, opacity: 0.18 }}>
            <PieMark size={220} />
          </div>
          <span className="eyebrow" style={{ color: 'rgba(9,9,11,0.65)', position: 'relative' }}>
            {club.neighborhood} · {club.cadence}
          </span>
          <h1 className="title mt-8" style={{ position: 'relative', fontSize: 44 }}>
            {club.name}
          </h1>
          <div className="row gap-8 mt-16" style={{ position: 'relative' }}>
            <Avatar person={organizer} size={28} />
            <span className="small strong">{organizer.name} runs this</span>
          </div>
        </div>
      </div>

      <div className="pad mt-16 stack gap-12">
        <p className="body">{club.description}</p>
        <div className="row gap-10">
          <Faces people={members} max={4} size={28} />
          <span className="small muted">{plural(members.length, 'member')}</span>
        </div>
      </div>

      {/* membership */}
      <div className="pad mt-16">
        {isOrganizer ? (
          <div className="card stack gap-12">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="h3">your club</span>
              <span className="chip lime">organizer</span>
            </div>
            {club.requestIds.length > 0 && (
              <div className="stack gap-8">
                <span className="eyebrow">requests</span>
                {club.requestIds.map((pid) => {
                  const p = person(state, pid)
                  return (
                    <div key={pid} className="row gap-10">
                      <Avatar person={p} size={28} />
                      <span className="grow small strong">{p.name}</span>
                      <button type="button" className="btn btn-primary btn-sm btn-auto" onClick={() => dispatch({ type: 'joinClub', clubId: club.id, personId: pid })}>
                        approve
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {club.reports.length > 0 && (
              <div className="stack gap-6">
                <span className="eyebrow cherry">reports</span>
                {club.reports.map((r) => (
                  <div key={r.id} className="row gap-8" style={{ justifyContent: 'space-between' }}>
                    <span className="small">
                      {person(state, r.byId).name} about {person(state, r.aboutId).name}: “{r.reason}”
                    </span>
                    {!state.people[r.aboutId]?.blocked && (
                      <button type="button" className="chip cherry" onClick={() => dispatch({ type: 'block', personId: r.aboutId, blocked: true })}>
                        block
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <span className="small muted">
              {club.memberIds.length - club.mutedIds.length} of {club.memberIds.length} take invitations
            </span>
            {past[0] && (
              <button type="button" className="btn btn-primary" onClick={() => nav(`/host/again/${past[0].id}`)}>
                <Icon name="repeat" size={18} /> plan this again
              </button>
            )}
          </div>
        ) : member ? (
          <div className="card stack gap-12">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="h3">you're a member</span>
              <span className="chip lime">member</span>
            </div>
            <div className="row gap-12" style={{ justifyContent: 'space-between' }}>
              <div className="stack gap-4">
                <span className="small strong">invitations</span>
              </div>
              <Switch on={!muted} label="receive invitations" onChange={(v) => dispatch({ type: 'muteClub', clubId: club.id, personId: me, muted: !v })} />
            </div>
            <div className="row gap-12" style={{ justifyContent: 'space-between' }}>
              <div className="stack gap-4">
                <span className="small strong">listed in members</span>
              </div>
              <Switch on={listed} label="listed in the directory" onChange={(v) => dispatch({ type: 'listMe', clubId: club.id, personId: me, listed: v })} />
            </div>
            <button type="button" className="text-btn danger" style={{ alignSelf: 'flex-start' }} onClick={() => setLeaving(true)}>
              leave
            </button>
          </div>
        ) : requested ? (
          <div className="card stack gap-8">
            <span className="h3">request sent</span>
            <span className="small muted">{organizer.name} will approve you.</span>
          </div>
        ) : (
          <div className="card stack gap-10">
            <span className="h3">{eligible ? 'join the club' : 'closed club'}</span>
            {!eligible && <span className="small muted">{organizer.name} approves new members.</span>}
            <button
              type="button"
              className="btn btn-primary mt-8"
              onClick={() => {
                if (gate()) return
                if (eligible) {
                  void dispatch({ type: 'joinClub', clubId: club.id, personId: me })
                  toast('joined', 'check')
                } else {
                  void dispatch({ type: 'requestClub', clubId: club.id, personId: me })
                  toast('requested', 'send')
                }
              }}
            >
              {eligible ? 'join' : 'ask to join'}
            </button>
          </div>
        )}
      </div>

      <section className="section pad">
        <SectionTitle>next</SectionTitle>
        {next ? (
          <PlanCard plan={next} viewerId={me} />
        ) : (
          <Empty>
            nothing scheduled
            {isOrganizer && (
              <>
                {' '}
                <Link to="/host/new" className="lime">
                  make a plan
                </Link>
              </>
            )}
          </Empty>
        )}
      </section>

      <section className="section pad">
        <SectionTitle>notes</SectionTitle>
        {isOrganizer && (
          <form
            className="row gap-8"
            style={{ marginBottom: 12 }}
            onSubmit={(e) => {
              e.preventDefault()
              const t = post.trim()
              if (!t) return
              void dispatch({ type: 'post', clubId: club.id, post: { id: uid('post'), byId: me, text: t, at: now() } })
              setPost('')
            }}
          >
            <input className="input grow" placeholder="post to the club" value={post} onChange={(e) => setPost(e.target.value)} aria-label="announcement" />
            <button type="submit" className="icon-btn lime" aria-label="post" disabled={!post.trim()}>
              <Icon name="send" size={18} />
            </button>
          </form>
        )}
        {posts.length === 0 ? (
          <p className="small muted">no posts yet</p>
        ) : (
          <div className="stack gap-10">
            {posts.map((p) => (
              <div key={p.id} className="row gap-10" style={{ alignItems: 'flex-start' }}>
                <Avatar person={person(state, p.byId)} size={24} className="mt-8" />
                <div className="bubble grow stack gap-4">
                  <span className="eyebrow">{clock(p.at)}</span>
                  <span className="body">{p.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(member || isOrganizer) && (
        <section className="section pad">
          <SectionTitle right={<span className="chip muted">{directory.length} listed</span>}>members</SectionTitle>
          <div className="list">
            {directory.map((p) => (
              <div key={p.id} className="list-item">
                <Avatar person={p} size={32} />
                <span className="grow small strong">
                  {p.name}
                  {p.id === club.organizerId && <span className="muted"> · organizer</span>}
                </span>
                {isOrganizer && p.id !== me && (
                  <button type="button" className="text-btn danger" onClick={() => dispatch({ type: 'block', personId: p.id, blocked: true })}>
                    remove
                  </button>
                )}
                {!isOrganizer && p.id !== me && (
                  <button type="button" className="text-btn" onClick={() => setReporting(p.id)}>
                    report
                  </button>
                )}
              </div>
            ))}
                      </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="section pad">
          <SectionTitle>earlier</SectionTitle>
          <div className="list">
            {past.map((p) => (
              <PlanRow
                key={p.id}
                plan={p}
                viewerId={me}
                to={isOrganizer ? `/host/p/${p.id}` : `/p/${p.id}`}
                right={<span className="chip muted">{(p.attendedIds ?? goingIds(state, p.id)).length} came</span>}
              />
            ))}
          </div>
        </section>
      )}

      <Sheet open={leaving} onClose={() => setLeaving(false)} title="leave?">
        <p className="body muted">you'll stop getting invitations.</p>
        <div className="stack gap-10 mt-16">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              void dispatch({ type: 'leaveClub', clubId: club.id, personId: me })
              setLeaving(false)
            }}
          >
            leave
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setLeaving(false)}>
            stay
          </button>
        </div>
      </Sheet>

      <Sheet open={editing} onClose={() => setEditing(false)} title="edit">
        <ClubForm
          initial={{ name: club.name, cadence: club.cadence, neighborhood: club.neighborhood, description: club.description }}
          submitLabel="save"
          onSave={(patch) => {
            void dispatch({ type: 'updateClub', clubId: club.id, patch })
            setEditing(false)
            toast('saved', 'check')
          }}
        />
      </Sheet>

      <Sheet open={!!reporting} onClose={() => setReporting(null)} title={`report ${reporting ? person(state, reporting).name : ''}`}>
        <form
          className="stack gap-12"
          onSubmit={(e) => {
            e.preventDefault()
            if (!reporting) return
            void dispatch({ type: 'report', clubId: club.id, report: { id: uid('rep'), byId: me, aboutId: reporting, reason: reason.trim() || 'no reason given', at: now() } })
            setReporting(null)
            setReason('')
            toast('reported')
          }}
        >
                    <div className="field">
            <label htmlFor="rp-reason">what happened</label>
            <textarea id="rp-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-danger">
            report
          </button>
        </form>
      </Sheet>
    </div>
  )
}
